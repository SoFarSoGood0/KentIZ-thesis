import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router";
import { ArrowLeft, Camera } from "lucide-react";
import { API_BASE, getCitizenReports } from "../lib/api";
import { CitizenOutletContext } from "../components/CitizenLayout";
import { reportTypeLabel } from "../lib/labels";
import { getDisplayStatus, getLocationLabel, getPillClass } from "./CitizenHome";

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "review", label: "İncelemede" },
  { key: "approved", label: "Onaylandı" },
  { key: "progress", label: "İşlemde" },
  { key: "resolved", label: "Çözüldü" },
];

function matchesFilter(report: any, filter: string) {
  const status = String(report?.status || "");
  const intervention = String(
    report?.assignment?.intervention_status || report?.intervention_status || "",
  );
  switch (filter) {
    case "review":
      return status === "pending_review" || status === "in_review";
    case "approved":
      return status === "approved";
    case "progress":
      return intervention === "assigned" || intervention === "in_progress";
    case "resolved":
      return intervention === "resolved";
    default:
      return true;
  }
}

export function CitizenReports() {
  const { session, openAuth } = useOutletContext<CitizenOutletContext>();
  const navigate = useNavigate();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getCitizenReports(500);
        if (active) setReports(data.reports || []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Raporlar yüklenemedi.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [session]);

  const filtered = useMemo(
    () => reports.filter((r) => matchesFilter(r, filter)),
    [reports, filter],
  );

  if (!session) {
    return (
      <main className="uc-section">
        <div className="uc-container">
          <div className="uc-empty-state">
            Raporlarını görmek için giriş yapmalısın.
            <div style={{ marginTop: 16 }}>
              <button type="button" className="uc-button uc-button-primary" onClick={() => openAuth("login")}>
                Giriş Yap
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="uc-section">
      <div className="uc-container">
        <button
          type="button"
          className="uc-link-button"
          onClick={() => navigate("/")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14, paddingLeft: 0 }}
        >
          <ArrowLeft className="h-4 w-4" />
          Ana sayfa
        </button>

        <div className="uc-section-head">
          <div>
            <div className="uc-kicker">Hesabın</div>
            <h1 className="uc-section-title">Tüm Raporlarım</h1>
          </div>
          <span className="uc-pill ok" style={{ alignSelf: "center" }}>
            {reports.length} kayıt
          </span>
        </div>

        <div className="uc-modal-tabs" style={{ flexWrap: "wrap", marginBottom: 24 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`uc-modal-tab ${filter === f.key ? "is-active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="uc-empty-state">Raporların yükleniyor...</div>
        ) : error ? (
          <div className="uc-status-error">{error}</div>
        ) : filtered.length ? (
          <div className="uc-reports-grid">
            {filtered.map((report) => (
              <Link to={`/report/${report.id}`} className="uc-report-card" key={report.id}>
                <span className="uc-dashboard-report-thumb">
                  <Camera className="h-5 w-5 uc-thumb-fallback" />
                  {report.saved_as ? (
                    <img
                      className="uc-thumb-img"
                      src={`${API_BASE}/uploads/${report.saved_as}`}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : null}
                </span>
                <div className="uc-report-card-body">
                  <div className="uc-report-card-top">
                    <strong>{reportTypeLabel(report.report_type)}</strong>
                    <b className={`uc-pill ${getPillClass(report)}`}>{getDisplayStatus(report)}</b>
                  </div>
                  <small className="uc-report-card-loc">{getLocationLabel(report)}</small>
                  <small className="uc-report-card-date">
                    #{report.id} · {new Date(report.created_at || Date.now()).toLocaleDateString()}
                  </small>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="uc-empty-state">Bu filtrede rapor bulunamadı.</div>
        )}
      </div>
    </main>
  );
}
