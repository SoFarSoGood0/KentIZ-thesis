import { useEffect, useState } from "react";
import { Link } from "react-router";
import { MapPin, Users } from "lucide-react";
import { fetchJson } from "../lib/api";
import { reportTypeLabel } from "../lib/labels";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Az önce";
  if (mins < 60) return `${mins} dk önce`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} sa önce`;
  return `${Math.floor(hrs / 24)} gün önce`;
}

function getLocationLabel(report: any) {
  const province = String(report?.province_name || report?.location_scope?.province || "").trim();
  const district = String(report?.district_name || report?.location_scope?.district || "").trim();
  const neighborhood = String(report?.neighborhood_name || report?.location_scope?.neighborhood || "").trim();
  const label = [neighborhood, district, province].filter(Boolean).join(" / ");
  if (label) return label;
  if (report?.gps) return `${Number(report.gps.latitude).toFixed(4)}, ${Number(report.gps.longitude).toFixed(4)}`;
  return "Konum yok";
}

function getTeamLabel(report: any) {
  const assigned = String(report?.assignment?.assigned_team || "").trim();
  if (assigned) return assigned;
  const province = String(report?.province_name || report?.location_scope?.province || "").trim();
  const district = String(report?.district_name || report?.location_scope?.district || "").trim();
  const base = district || province || "Belediye";
  const prefix = `${base} Belediyesi`;
  const type = String(report?.report_type || "");
  if (type === "garbage") return `${prefix} Temizlik İşleri`;
  if (type === "sidewalk") return `${prefix} Kaldırım Bakım`;
  return `${prefix} Yol Bakım`;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  assigned:        { label: "Atandı",   cls: "badge-purple" },
  in_progress:     { label: "Sahada",   cls: "badge-blue"   },
  resolved:        { label: "Çözüldü",  cls: "badge-green"  },
  pending_dispatch:{ label: "Bekliyor", cls: "badge-cyan"   },
};

export function AdminFieldTeams() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await fetchJson("/admin/reports?status=approved&limit=200&page=1");
        if (active) {
          const assigned = (data.reports || []).filter(
            (r: any) => r.assignment?.intervention_status && r.assignment.intervention_status !== "pending_dispatch"
          );
          setReports(assigned);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Saha ekipleri yüklenemedi.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  if (loading) return <div className="admin-empty-state">Saha ekipleri yükleniyor...</div>;
  if (error)   return <div className="admin-status-error">{error}</div>;

  const counts = {
    assigned:    reports.filter(r => r.assignment?.intervention_status === "assigned").length,
    in_progress: reports.filter(r => r.assignment?.intervention_status === "in_progress").length,
    resolved:    reports.filter(r => r.assignment?.intervention_status === "resolved").length,
  };

  return (
    <div>
      <div className="admin-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="admin-stat">
          <small>Toplam atama</small>
          <strong>{reports.length}</strong>
          <span>Ekibe yönlendirilen</span>
        </div>
        <div className="admin-stat">
          <small>Aktif</small>
          <strong>{counts.assigned + counts.in_progress}</strong>
          <span>{counts.assigned} atandı · {counts.in_progress} sahada</span>
        </div>
        <div className="admin-stat">
          <small>Çözüldü</small>
          <strong>{counts.resolved}</strong>
          <span>Tamamlanan iş</span>
        </div>
      </div>

      <div className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h3>Ekip Atamaları</h3>
          </div>
          <span className="admin-pill live">{reports.length}</span>
        </div>

        {reports.length === 0 ? (
          <div className="admin-empty-state">Henüz ekibe atanmış rapor yok.</div>
        ) : (
          <div className="ktz-table-wrap">
            <table className="ktz-report-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Kategori</th>
                  <th>Konum</th>
                  <th>Ekip</th>
                  <th>Durum</th>
                  <th>Tarih</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => {
                  const intv = String(report.assignment?.intervention_status || "");
                  const badge = STATUS_BADGE[intv] ?? { label: intv, cls: "badge-cyan" };
                  return (
                    <tr key={report.id}>
                      <td className="ktz-id-cell">RP-{report.id}</td>
                      <td>
                        <span className="ktz-type-label">
                          <Users size={13} className="inline mr-1 opacity-60" />
                          {reportTypeLabel(report.report_type)}
                        </span>
                      </td>
                      <td className="ktz-loc-cell">
                        <MapPin size={11} className="inline mr-1 opacity-50" />
                        {getLocationLabel(report)}
                      </td>
                      <td className="ktz-loc-cell">{getTeamLabel(report)}</td>
                      <td><span className={`ktz-badge ${badge.cls}`}>{badge.label}</span></td>
                      <td className="ktz-date-cell">{timeAgo(report.created_at)}</td>
                      <td>
                        <Link to={`/admin/reports/${report.id}`} className="ktz-action-btn">
                          Detay
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
