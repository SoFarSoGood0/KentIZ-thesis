import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Eye,
  FileCheck2,
  Gauge,
  Layers3,
  LocateFixed,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  API_BASE,
  fetchJson,
  getAdminAuditLogs,
  getAdminSummary,
  updateAdminReportStatus,
} from "../lib/api";
import { interventionStatusLabel, reportTypeLabel } from "../lib/labels";

// ── helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Az önce";
  if (mins < 60) return `${mins} dk önce`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} sa önce`;
  return `${Math.floor(hrs / 24)} gün önce`;
}

function getLocationLabel(report: any): string {
  const province = String(report?.province_name || report?.location_scope?.province || "").trim();
  const district = String(report?.district_name || report?.location_scope?.district || "").trim();
  const neighborhood = String(report?.neighborhood_name || report?.location_scope?.neighborhood || "").trim();
  const label = [neighborhood, district].filter(Boolean).join(", ") ||
    [province, district].filter(Boolean).join(" / ");
  if (label) return label;
  if (report?.gps) return `${Number(report.gps.latitude).toFixed(4)}, ${Number(report.gps.longitude).toFixed(4)}`;
  return "Konum yok";
}

function getTypeIcon(reportType: string) {
  const t = String(reportType || "").toLowerCase();
  if (t === "garbage") return Trash2;
  if (t === "sidewalk" || t.includes("crack") || t === "repair") return Building2;
  return AlertTriangle;
}

function getStatusInfo(report: any): { label: string; cls: string } {
  const status = String(report?.status || "pending_review");
  const intv = String(report?.assignment?.intervention_status || "");
  if (status === "approved") {
    if (intv === "resolved") return { label: "Çözüldü", cls: "badge-green" };
    if (intv === "in_progress") return { label: "Sahada", cls: "badge-purple" };
    if (intv === "assigned") return { label: "Ekip Bekliyor", cls: "badge-purple" };
    return { label: "Onaylandı", cls: "badge-green" };
  }
  if (status === "rejected") return { label: "Reddedildi", cls: "badge-muted" };
  if (status === "in_review") return { label: "İncelemede", cls: "badge-blue" };
  return { label: "Yeni", cls: "badge-cyan" };
}

function getPriorityInfo(report: any): { label: string; cls: string } {
  const lbl = String(report?.priority?.label || "low");
  const map: Record<string, { label: string; cls: string }> = {
    critical: { label: "Kritik", cls: "ktz-priority-critical" },
    high: { label: "Yüksek", cls: "ktz-priority-high" },
    medium: { label: "Orta", cls: "ktz-priority-mid" },
    low: { label: "Düşük", cls: "ktz-priority-low" },
  };
  return map[lbl] || { label: lbl, cls: "ktz-priority-low" };
}

function shortHash(value: string | undefined): string {
  if (!value) return "—";
  return value.length <= 16 ? value : `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function auditActionLabel(action: string, reportId?: number | null): string {
  const id = reportId ? ` #${reportId}` : "";
  const map: Record<string, string> = {
    admin_login: "Yönetici girişi yapıldı",
    admin_logout: "Yönetici çıkışı yapıldı",
    report_status_update: `Rapor${id} durumu güncellendi`,
    report_assignment_update: `Rapor${id} ekibe atandı`,
    report_notes_update: `Rapor${id} notu eklendi`,
    report_pin_ipfs: `Rapor${id} IPFS'e sabitlendi`,
    report_seal_proof: `Rapor${id} kanıt mühürlendi`,
    report_after_photo_upload: `Rapor${id} için fotoğraf yüklendi`,
    proof_chain_rebuild: "Kanıt zinciri yeniden oluşturuldu",
    report_auto_pin_ipfs: `Rapor${id} otomatik IPFS`,
    report_auto_seal_proof: `Rapor${id} otomatik mühür`,
  };
  return map[action] || action.replaceAll("_", " ");
}

function getTeamIcon(teamName: string) {
  const n = teamName.toLowerCase();
  if (n.includes("temizlik") || n.includes("çöp")) return Trash2;
  if (n.includes("kaldırım")) return Building2;
  return AlertTriangle;
}

// ── donut chart ─────────────────────────────────────────────────────────────

const DONUT_CATEGORIES = [
  { key: "pothole", label: "Yol Çukuru", color: "#22d3ee" },
  { key: "garbage", label: "Çöp Yığını", color: "#d6a24a" },
  { key: "crack", label: "Çatlak", color: "#8b5cf6" },
  { key: "other", label: "Diğer", color: "#475569" },
];
const CRACK_KEYS = [
  "alligator_crack", "block_crack", "longitudinal_crack",
  "oblique_crack", "transverse_crack",
];

function buildDonutGradient(counts: Record<string, number>, total: number): string {
  if (total === 0) return "conic-gradient(rgba(255,255,255,0.08) 0% 100%)";
  const known = new Set(["garbage", "pothole", ...CRACK_KEYS]);
  const resolved = DONUT_CATEGORIES.map((cat) => {
    if (cat.key === "crack") {
      return { ...cat, n: CRACK_KEYS.reduce((s, k) => s + (counts[k] || 0), 0) };
    }
    if (cat.key === "other") {
      return { ...cat, n: Object.entries(counts).filter(([k]) => !known.has(k)).reduce((s, [, v]) => s + v, 0) };
    }
    return { ...cat, n: counts[cat.key] || 0 };
  });
  let pct = 0;
  const segs = resolved.map((c) => {
    const share = (c.n / total) * 100;
    const from = pct; pct += share;
    return `${c.color} ${from.toFixed(1)}% ${pct.toFixed(1)}%`;
  });
  return `conic-gradient(${segs.join(", ")})`;
}

// ── component ────────────────────────────────────────────────────────────────

export function AdminDashboard() {
  const [summary, setSummary] = useState<any>(null);
  const [tableReports, setTableReports] = useState<any[]>([]);
  const [allReports, setAllReports] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [summaryData, reportsData, statsData] = await Promise.all([
        getAdminSummary(),
        fetchJson<any>("/admin/reports?limit=10&page=1"),
        fetchJson<any>("/admin/reports?limit=100&page=1"),
      ]);
      setSummary(summaryData);
      const rows = reportsData.reports || [];
      setTableReports(rows);
      setAllReports(statsData.reports || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gösterge paneli yüklenemedi.");
    } finally {
      setLoading(false);
    }
    getAdminAuditLogs(8)
      .then((data) => setAuditLogs(data.logs || []))
      .catch(() => setAuditLogs([]));
  }

  useEffect(() => {
    let active = true;
    const run = async () => { if (active) await load(); };
    run();
    const iv = window.setInterval(run, 30000);
    return () => { active = false; window.clearInterval(iv); };
  }, []);

  const selectedReport = tableReports[0] || null;

  const confidence = Number(selectedReport?.top_confidence ?? selectedReport?.top_detection?.confidence ?? 0);
  const imageSrc = selectedReport?.saved_as ? `${API_BASE}/uploads/${selectedReport.saved_as}` : "";
  const reviewStatus = String(selectedReport?.status || "pending_review");
  const interventionSt = String(selectedReport?.assignment?.intervention_status || "pending_dispatch");
  const isResolved = interventionSt === "resolved";

  // top locations from allReports
  const topLocations = useMemo(() => {
    const counts = new Map<string, number>();
    allReports.forEach((r: any) => {
      const loc = getLocationLabel(r);
      counts.set(loc, (counts.get(loc) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [allReports]);

  // category counts from summary (scoped to admin's province)
  const categoryCounts = useMemo(
    () => (summary?.reports_by_type || {}) as Record<string, number>,
    [summary],
  );
  const categoryTotal = Object.values(categoryCounts).reduce((s, v) => s + v, 0);

  // team workload from allReports
  const teamWorkloads = useMemo(() => {
    const COLORS = ["#f59e0b", "#22c55e", "#f59e0b", "#22d3ee", "#8b5cf6"];
    const teams = new Map<string, { active: number; done: number; color: string }>();
    let ci = 0;
    allReports.forEach((r: any) => {
      const team = String(r.assignment?.assigned_team || "").trim();
      if (!team) return;
      if (!teams.has(team)) teams.set(team, { active: 0, done: 0, color: COLORS[ci++ % COLORS.length] });
      const intv = String(r.assignment?.intervention_status || "");
      const entry = teams.get(team)!;
      if (intv === "resolved") entry.done++;
      else if (intv === "assigned" || intv === "in_progress") entry.active++;
    });
    return [...teams.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => (b.active + b.done) - (a.active + a.done))
      .slice(0, 3);
  }, [allReports]);

  const handleAction = async (targetStatus: string) => {
    if (!selectedReport || saving) return;
    setSaving(true);
    setFlash("");
    try {
      await updateAdminReportStatus(selectedReport.id, targetStatus);
      setFlash("Durum güncellendi.");
      await load();
    } catch (err) {
      setFlash(err instanceof Error ? err.message : "İşlem tamamlanamadı.");
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(""), 3000);
    }
  };

  // KPI values
  const pendingCount = Number(summary?.reports_by_status?.pending_review ?? 0) + Number(summary?.reports_by_status?.in_review ?? 0);
  const highPriorityCount = Number(summary?.high_priority_count ?? 0);
  const criticalCount = Number(summary?.critical_priority_count ?? 0);
  const avgConf = Math.round(Number(summary?.avg_confidence ?? 0) * 100);
  const resolvedCount = Number(summary?.intervention_by_status?.resolved ?? 0);
  const todayCount = summary?.recent_daily_reports?.at?.(-1)?.count ?? 0;

  const canApprove = reviewStatus === "pending_review" || reviewStatus === "in_review";
  const approveLabel = reviewStatus === "pending_review" ? "İncelemeye Al" : reviewStatus === "in_review" ? "Onayla" : "Onaylandı";

  if (loading) return <div className="admin-empty-state">Gösterge paneli yükleniyor...</div>;
  if (error) return <div className="admin-status-error">{error}</div>;

  return (
    <div>
      {flash ? <div className="admin-flash-message">{flash}</div> : null}

      {/* ── KPI Grid ─────────────────────────────────────────────────────── */}
      <section className="ktz-kpi-grid">
        <article className="ktz-kpi-card">
          <div className="ktz-kpi-icon cyan"><ClipboardList size={24} /></div>
          <div>
            <p>Bekleyen Raporlar</p>
            <strong>{pendingCount}</strong>
            <span>+{todayCount} bugün ↗</span>
          </div>
        </article>
        <article className="ktz-kpi-card">
          <div className="ktz-kpi-icon amber"><AlertTriangle size={24} /></div>
          <div>
            <p>Yüksek Öncelikli</p>
            <strong>{highPriorityCount}</strong>
            <span>{criticalCount} kritik · {highPriorityCount - criticalCount} yüksek</span>
          </div>
        </article>
        <article className="ktz-kpi-card">
          <div className="ktz-kpi-icon cyan"><ShieldCheck size={24} /></div>
          <div>
            <p>Ortalama AI Güven Skoru</p>
            <strong>%{avgConf}</strong>
            <span>Son {Number(summary?.total_reports ?? 0)} rapor</span>
          </div>
        </article>
        <article className="ktz-kpi-card">
          <div className="ktz-kpi-icon green"><CheckCircle2 size={24} /></div>
          <div>
            <p>Çözülen</p>
            <strong>{resolvedCount}</strong>
            <span>Toplam çözüme ulaşan</span>
          </div>
        </article>
      </section>

      {/* ── Son Rapor Detayı ─────────────────────────────────────────────── */}
      <section style={{ marginBottom: 24 }}>
        <aside className="admin-panel ktz-detail-panel">
          <div className="admin-panel-head">
            <div>
              <h3>Son Rapor Detayı</h3>
              <p>En son gelen bildirim</p>
            </div>
            {selectedReport ? (
              <span className="ktz-report-id-pill">RP-{selectedReport.id}</span>
            ) : null}
          </div>

          {selectedReport ? (
            <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, alignItems: "start" }}>
              {/* Left: image + thumbnails */}
              <div>
                <div className="ktz-detail-image">
                  <div
                    className="ktz-pothole-scene"
                    style={imageSrc ? { backgroundImage: `url(${imageSrc})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}
                  >
                    <span className="ktz-detect-box">
                      {reportTypeLabel(selectedReport.report_type)} · %{Math.round(confidence * 100)}
                    </span>
                  </div>
                </div>
                <div className="ktz-thumb-row">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`ktz-thumb${i === 0 ? " active" : ""}`}
                      style={i === 0 && imageSrc ? { backgroundImage: `url(${imageSrc})`, backgroundSize: "cover" } : {}}
                    />
                  ))}
                </div>
              </div>

              {/* Right: info + bottom + actions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="ktz-detail-info-grid">
                  <div className="ktz-detail-line">
                    <Layers3 size={14} />
                    <span>Kategori</span>
                    <strong>{reportTypeLabel(selectedReport.report_type)}</strong>
                  </div>
                  <div className="ktz-detail-line">
                    <ShieldCheck size={14} />
                    <span>AI Güven Skoru</span>
                    <strong>%{Math.round(confidence * 100)}</strong>
                  </div>
                  <div className="ktz-detail-line">
                    <LocateFixed size={14} />
                    <span>Konum</span>
                    <strong className="ktz-success">{selectedReport.gps ? "GPS Doğrulandı" : "Manuel"}</strong>
                  </div>
                  <div className="ktz-detail-line">
                    <Gauge size={14} />
                    <span>Öncelik Skoru</span>
                    <strong>{selectedReport.priority?.score ?? 0}</strong>
                  </div>
                  <div className="ktz-detail-line ktz-detail-wide">
                    <CalendarDays size={14} />
                    <span>Oluşturulma</span>
                    <strong>{new Date(selectedReport.created_at).toLocaleString("tr-TR")}</strong>
                  </div>
                </div>

                <div className="ktz-detail-bottom">
                  <div>
                    <span>Yönetici Notu</span>
                    <p>"{selectedReport.admin_notes || "Not eklenmemiş."}"</p>
                  </div>
                  <div>
                    <span>Konum</span>
                    <p>{getLocationLabel(selectedReport)}</p>
                    <Link to={`/admin/reports/${selectedReport.id}`} className="ktz-map-link">Haritada göster</Link>
                  </div>
                </div>

                <div className="ktz-decision-row">
                  {reviewStatus !== "approved" && reviewStatus !== "rejected" ? (
                    <>
                      <button
                        type="button"
                        className="ktz-decision-approve"
                        disabled={saving || !canApprove}
                        onClick={() => canApprove && handleAction(reviewStatus === "pending_review" ? "in_review" : "approved")}
                      >
                        <Check size={15} /> {approveLabel}
                      </button>
                      {reviewStatus === "in_review" ? (
                        <button
                          type="button"
                          className="ktz-decision-reject"
                          disabled={saving}
                          onClick={() => handleAction("rejected")}
                        >
                          <X size={15} /> Reddet
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {reviewStatus === "approved" && !isResolved ? (
                        <Link to={`/admin/reports/${selectedReport.id}`} className="ktz-decision-assign ktz-decision-link">
                          <Users size={15} /> Ekip Ata
                        </Link>
                      ) : null}
                      <Link to={`/admin/reports/${selectedReport.id}`} className="ktz-decision-view ktz-decision-link">
                        <Eye size={15} /> Detay Gör
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="admin-empty-state">İncelenecek rapor yok.</div>
          )}
        </aside>
      </section>

      {/* ── Lower Grid ───────────────────────────────────────────────────── */}
      <section className="ktz-lower-grid">
        {/* Heatmap */}
        <div className="admin-panel">
          <div className="admin-panel-head ktz-compact-head">
            <div>
              <h3>Sorun Yoğunluk Haritası</h3>
              <p>Son 7 gün içindeki rapor yoğunluğu</p>
            </div>
          </div>
          <div className="ktz-heatmap">
            {topLocations.length ? (
              <div className="ktz-map-list">
                {topLocations.map(([loc, count]) => (
                  <div key={loc}>
                    <span>{loc}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
            ) : null}
            <span className="ktz-hotspot ktz-h1" />
            <span className="ktz-hotspot ktz-h2" />
            <span className="ktz-hotspot ktz-h3" />
            <span className="ktz-hotspot ktz-h4" />
            <span className="ktz-hotspot ktz-h5" />
          </div>
        </div>

        {/* Donut chart */}
        <div className="admin-panel">
          <div className="admin-panel-head ktz-compact-head">
            <div>
              <h3>Kategori Dağılımı</h3>
              <p>Toplam {categoryTotal} rapor</p>
            </div>
          </div>
          <div className="ktz-donut-wrap">
            <div className="ktz-donut" style={{ background: buildDonutGradient(categoryCounts, categoryTotal) }}>
              <div>
                <strong>{categoryTotal}</strong>
                <span>Toplam</span>
              </div>
            </div>
            <div className="ktz-legend">
              {DONUT_CATEGORIES.map((cat) => {
                const known = new Set(["garbage", "pothole", ...CRACK_KEYS]);
                let count = 0;
                if (cat.key === "crack") {
                  count = CRACK_KEYS.reduce((s, k) => s + (categoryCounts[k] || 0), 0);
                } else if (cat.key === "other") {
                  count = Object.entries(categoryCounts).filter(([k]) => !known.has(k)).reduce((s, [, v]) => s + v, 0);
                } else {
                  count = categoryCounts[cat.key] || 0;
                }
                const pct = categoryTotal ? Math.round((count / categoryTotal) * 1000) / 10 : 0;
                return (
                  <div key={cat.key}>
                    <i style={{ background: cat.color }} />
                    {cat.label}
                    <strong>{count} · %{pct}</strong>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Team workload */}
        <div className="admin-panel">
          <div className="admin-panel-head ktz-compact-head">
            <div>
              <h3>Ekip İş Yükü</h3>
              <p>Aktif ve tamamlanan görevler</p>
            </div>
          </div>
          <div className="ktz-team-list">
            {teamWorkloads.length ? (
              teamWorkloads.map((team) => {
                const TeamIcon = getTeamIcon(team.name);
                const maxDone = Math.max(...teamWorkloads.map((t) => t.done), 1);
                return (
                  <div key={team.name} className="ktz-team-row">
                    <TeamIcon color={team.color} size={22} />
                    <div>
                      <strong>{team.name}</strong>
                      <span>Aktif görev</span>
                    </div>
                    <b>{team.active}</b>
                    <div className="ktz-team-progress">
                      <span style={{ width: `${Math.round((team.done / maxDone) * 100)}%` }} />
                    </div>
                    <b>{team.done}</b>
                  </div>
                );
              })
            ) : (
              <div className="admin-empty-state" style={{ fontSize: 12 }}>Ekip ataması bulunmuyor.</div>
            )}
          </div>
        </div>

        {/* Activity log */}
        <div className="admin-panel">
          <div className="admin-panel-head ktz-compact-head">
            <div>
              <h3>Aktivite Geçmişi</h3>
              <p>Son yönetici işlemleri</p>
            </div>
          </div>
          <div className="ktz-activity-list">
            {auditLogs.length ? (
              auditLogs.slice(0, 6).map((log) => (
                <div key={log.id}>
                  <span>{new Date(log.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                  <p>{auditActionLabel(log.action, log.report_id)}</p>
                </div>
              ))
            ) : (
              <div className="admin-empty-state" style={{ fontSize: 12 }}>Aktivite kaydı yok.</div>
            )}
          </div>
        </div>
      </section>

      {/* ── Proof Panel ──────────────────────────────────────────────────── */}
      <section className="ktz-proof-panel admin-panel">
        <div className="ktz-proof-icon">
          <FileCheck2 size={22} />
        </div>
        <div>
          <h3>Proof / Kayıt Zinciri</h3>
          <p>Kayıt Hash</p>
          <strong>{shortHash(selectedReport?.proof?.chain_hash) || "0x—"}</strong>
        </div>
        <div>
          <p>Kayıt ID</p>
          <strong>KTZ-2026-{selectedReport?.id || "—"}</strong>
        </div>
        <div>
          <p>Durum</p>
          <strong className={selectedReport?.proof?.chain_hash ? "ktz-success" : ""}>
            {selectedReport?.proof?.chain_hash ? "Doğrulandı ✓" : "Beklemede"}
          </strong>
        </div>
        <div>
          <p>Müdahale</p>
          <strong>{interventionStatusLabel(interventionSt)}</strong>
        </div>
        <Link to="/admin/verification" className="ktz-proof-link">
          Tüm kanıt kayıtlarını görüntüle →
        </Link>
      </section>
    </div>
  );
}
