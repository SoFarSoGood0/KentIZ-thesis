import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useOutletContext } from "react-router";
import type { AdminOutletContext } from "../components/AdminLayout";
import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { fetchJson } from "../lib/api";
import { reportStatusLabel, reportTypeLabel } from "../lib/labels";

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
  const label =
    [neighborhood, district].filter(Boolean).join(", ") ||
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

const STATUS_OPTIONS = [
  { value: "", label: "Tüm Durumlar" },
  { value: "pending_review", label: "Yeni" },
  { value: "in_review", label: "İncelemede" },
  { value: "approved", label: "Onaylandı" },
  { value: "rejected", label: "Reddedildi" },
];

const TYPE_OPTIONS = [
  { value: "", label: "Tüm Kategoriler" },
  { value: "pothole", label: "Yol Çukuru" },
  { value: "crack", label: "Çatlak" },
  { value: "garbage", label: "Çöp" },
];

const TYPE_OPTIONS_FULL = [
  { value: "", label: "Tüm Kategoriler" },
  { value: "pothole", label: "Yol Çukuru" },
  { value: "crack", label: "Çatlak" },
  { value: "garbage", label: "Çöp" },
  { value: "sidewalk", label: "Kaldırım Hasarı" },
];

const PAGE_SIZE = 25;

export function AdminReports() {
  const location = useLocation();
  const { reportSearch } = useOutletContext<AdminOutletContext>();
  const searchActive = reportSearch.trim().length > 0;
  const [reports, setReports] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const initialStatus = new URLSearchParams(location.search).get("status") || "";
  const [filterStatus, setFilterStatus] = useState(initialStatus);
  const [filterType, setFilterType] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const s = params.get("status") || "";
    setFilterStatus(s);
    setFilterType("");
    setPage(1);
  }, [location.search]);

  async function load(pageNum: number, status: string, type: string, searching: boolean) {
    setLoading(true);
    setError("");
    try {
      // Arama aktifken tum eslesmeleri tek sayfada gosterebilmek icin genis limit cek.
      const limit = searching ? 500 : PAGE_SIZE;
      const params = new URLSearchParams({ limit: String(limit), page: String(searching ? 1 : pageNum) });
      if (status) params.set("status", status);
      if (type) params.set("report_type", type);
      const data = await fetchJson<any>(`/admin/reports?${params.toString()}`);
      setReports(data.reports || []);
      setTotal(Number(data.total ?? 0));
      setTotalPages(Number(data.total_pages ?? 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Raporlar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(page, filterStatus, filterType, searchActive);
  }, [page, filterStatus, filterType, searchActive]);

  // Yuklenen raporlari arama metnine gore istemci tarafinda suz (ID, kategori,
  // konum, durum, oncelik, guven uzerinden).
  const visibleReports = useMemo(() => {
    const q = reportSearch.trim().toLocaleLowerCase("tr-TR");
    if (!q) return reports;
    return reports.filter((report) => {
      const haystack = [
        `rp-${report.id}`,
        String(report.id),
        reportTypeLabel(report.report_type),
        getLocationLabel(report),
        getStatusInfo(report).label,
        getPriorityInfo(report).label,
        `%${Math.round(Number(report.top_confidence ?? 0) * 100)}`,
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR");
      return haystack.includes(q);
    });
  }, [reports, reportSearch]);

  const isLockedStatus = initialStatus === "approved" || initialStatus === "rejected";
  const typeOptions = isLockedStatus ? TYPE_OPTIONS : TYPE_OPTIONS_FULL;

  return (
    <div>
      {/* Filter bar */}
      <div className="admin-panel mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={15} className="text-slate-400" />
          <span className="text-sm font-medium text-slate-300">Filtrele:</span>

          {!isLockedStatus && (
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className="ktz-filter-select"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}

          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
            className="ktz-filter-select"
          >
            {typeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {filterType !== "" ? (
            <button type="button" onClick={() => { setFilterType(""); setPage(1); }} className="admin-ghost-btn inline-flex items-center gap-1.5 text-xs">
              <RotateCcw size={12} />
              Sıfırla
            </button>
          ) : null}

          <div className="ml-auto flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-4 py-2">
            <span className="text-xl font-bold tabular-nums leading-none text-white">{total}</span>
            <div className="flex flex-col leading-none">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Toplam</span>
              <span className="text-[10px] text-slate-500">rapor</span>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="admin-panel">
        {error ? (
          <div className="admin-status-error">{error}</div>
        ) : loading ? (
          <div className="admin-empty-state">Raporlar yükleniyor...</div>
        ) : (
          <>
            <div className="ktz-table-wrap">
              <table className="ktz-report-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Kategori</th>
                    <th>Konum</th>
                    <th>Güven</th>
                    <th>Öncelik</th>
                    <th>Durum</th>
                    <th>Tarih</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleReports.length ? (
                    visibleReports.map((report) => {
                      const TypeIcon = getTypeIcon(report.report_type);
                      const { label: statusLabel, cls: statusCls } = getStatusInfo(report);
                      const { label: prioLabel, cls: prioCls } = getPriorityInfo(report);
                      const conf = Math.round(Number(report.top_confidence ?? 0) * 100);
                      return (
                        <tr key={report.id}>
                          <td className="ktz-id-cell">RP-{report.id}</td>
                          <td>
                            <span className="ktz-category-cell">
                              <TypeIcon size={15} />
                              {reportTypeLabel(report.report_type)}
                            </span>
                          </td>
                          <td>{getLocationLabel(report)}</td>
                          <td className="ktz-confidence">%{conf}</td>
                          <td><span className={`ktz-priority-badge ${prioCls}`}>{prioLabel}</span></td>
                          <td><span className={`ktz-status-badge ${statusCls}`}>{statusLabel}</span></td>
                          <td className="ktz-time-cell">{timeAgo(report.created_at)}</td>
                          <td>
                            <Link to={`/admin/reports/${report.id}`} className="ktz-row-action">
                              <Eye size={14} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="ktz-empty-cell">
                        {searchActive
                          ? `"${reportSearch.trim()}" ile eşleşen rapor bulunamadı.`
                          : filterType !== ""
                            ? "Bu filtreyle eşleşen rapor bulunamadı."
                            : "Henüz rapor yok."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination — arama aktifken gizle (tum sonuclar tek sayfada). */}
            {totalPages > 1 && !searchActive ? (
              <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
                <span>Sayfa {page} / {totalPages}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="admin-ghost-btn inline-flex items-center gap-1 disabled:opacity-40"
                  >
                    <ChevronLeft size={14} /> Önceki
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="admin-ghost-btn inline-flex items-center gap-1 disabled:opacity-40"
                  >
                    Sonraki <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
