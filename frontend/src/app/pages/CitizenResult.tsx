import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { CheckCircle2, ExternalLink, MapPin } from "lucide-react";
import { API_BASE, getCitizenReport } from "../lib/api";
import { reportTypeLabel } from "../lib/labels";


function getTimeline(report: any) {
  const reviewStatus = String(report.status || "pending_review");
  const interventionStatus = String(report.assignment?.intervention_status || "");
  const isRejected = reviewStatus === "rejected";
  const assignedAt = report.assignment?.assigned_at;
  const startedAt = report.assignment?.intervention_started_at;
  const resolvedAt = report.assignment?.resolved_at;
  const statusUpdatedAt = report.status_updated_at;
  return [
    { label: "Gönderildi", status: "completed", date: report.created_at },
    { label: "Analiz edildi", status: "completed", date: report.created_at },
    { label: "İnceleme sürecinde", status: reviewStatus === "pending_review" || reviewStatus === "in_review" ? "current" : "completed", date: report.created_at },
    { label: isRejected ? "Reddedildi" : "Onaylandı", status: reviewStatus === "approved" || ["assigned","in_progress","resolved"].includes(interventionStatus) ? "completed" : isRejected ? "rejected" : "pending", date: isRejected ? (statusUpdatedAt || undefined) : reviewStatus === "approved" ? assignedAt : undefined },
    { label: "Ekip atandı", status: interventionStatus === "assigned" ? "current" : ["in_progress", "resolved"].includes(interventionStatus) ? "completed" : "pending", date: assignedAt },
    { label: "İşlemde", status: interventionStatus === "in_progress" ? "current" : interventionStatus === "resolved" ? "completed" : "pending", date: startedAt },
    { label: "Çözüldü", status: interventionStatus === "resolved" ? "completed" : "pending", date: resolvedAt },
  ];
}

export function CitizenResult() {
  const { id } = useParams();
  const location = useLocation();
  const [report, setReport] = useState<any>(location.state?.report || null);
  const [loading, setLoading] = useState(!location.state?.report);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    let active = true;

    // Always fetch the authoritative report by id. Any report passed via
    // navigation state (e.g. the predict response) is only a partial snapshot
    // and is missing fields like citizen_note, notes and after_image, so we
    // refetch to get the complete record.
    async function load() {
      if (!report) setLoading(true);
      try {
        const data = await getCitizenReport(id);
        if (active) setReport(data);
      } catch (err) {
        if (active && !report) setError(err instanceof Error ? err.message : "Bildirim yüklenemedi.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <main className="uc-section">
        <div className="uc-container">
          <div className="uc-empty-state">Bildirim yükleniyor...</div>
        </div>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="uc-section">
        <div className="uc-container">
          <div className="uc-status-error">{error || "Bildirim bulunamadı."}</div>
        </div>
      </main>
    );
  }

  const reportId = report.id || report.report_id || id;
  const reviewStatus = String(report.status || "pending_review");
  const interventionStatus = String(report.assignment?.intervention_status || "");
  const gps = report.gps || report.location?.reported || report.location?.browser || {};
  const mapLink = gps.latitude != null && gps.longitude != null ? `https://www.google.com/maps?q=${gps.latitude},${gps.longitude}` : "";
  const imageSrc = report.image_url || (report.saved_as ? `${API_BASE}/uploads/${report.saved_as}` : "");
  const confidence = report.top_detection?.confidence ?? report.top_confidence ?? 0;
  const citizenNote = String(report.citizen_note || "").trim();
  const isResolved = interventionStatus === "resolved";
  const adminNote = String(report.notes || "").trim();
  const afterImageRaw = report.after_image?.url || (report.after_image?.saved_as ? `/uploads/${report.after_image.saved_as}` : "");
  const afterImageSrc = afterImageRaw
    ? (afterImageRaw.startsWith("http") ? afterImageRaw : `${API_BASE}${afterImageRaw}`)
    : "";
  const resolvedTeam = String(report.assignment?.assigned_team || "").trim();

  return (
    <main className="uc-section">
      <div className="uc-container">
        <div className="uc-section-head">
          <div>
            <div className="uc-kicker">Bildirim takibi</div>
            <h1 className="uc-section-title">Bildirim #{reportId}</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.6fr_0.9fr]">
          <section className="uc-panel">
            <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/40">
              {imageSrc ? (
                <img src={imageSrc} alt="Sorun fotoğrafı" className="h-[21rem] w-full object-cover" />
              ) : (
                <div className="flex h-[21rem] items-center justify-center text-slate-500">Görsel bulunamadı</div>
              )}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <InfoBlock label="Sorun türü" value={reportTypeLabel(report.report_type)} />
              <InfoBlock label="Model güveni" value={`${Math.round(Number(confidence || 0) * 100)}%`} />
              <InfoBlock label="Ödül puanı" value="-" />
            </div>

            <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              <span className="mb-1 block font-semibold text-white">Vatandaş notu</span>
              {citizenNote || "Not eklenmedi."}
            </div>

            {isResolved ? (
              <div className="mt-6 rounded-lg border border-teal-400/30 bg-teal-500/10 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-teal-300" />
                  <span className="font-semibold text-white">Çözüldü</span>
                  {resolvedTeam ? (
                    <span className="text-xs text-slate-400">· {resolvedTeam}</span>
                  ) : null}
                </div>

                {afterImageSrc ? (
                  <div className="mb-3 overflow-hidden rounded-lg border border-white/10 bg-slate-950/40">
                    <img src={afterImageSrc} alt="Çözüm kanıtı" className="h-64 w-full object-cover" />
                  </div>
                ) : null}

                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-teal-200">
                  Belediye notu
                </span>
                <p className="text-sm text-slate-200">{adminNote || "Not eklenmedi."}</p>
              </div>
            ) : null}
          </section>

          <aside className="space-y-6">
            <section className="uc-panel">
              <h3 className="mb-6 font-semibold">Durum takibi</h3>
              <div className="relative">
                <div className="absolute bottom-2 left-3.5 top-2 z-0 w-px bg-white/15" />
                <div className="relative z-10 space-y-6">
                  {getTimeline(report).map((step, index) => (
                    <div key={index} className="flex items-start gap-4">
                      <div className="relative shrink-0">
                        {step.status === "current" && (
                          <span className="absolute inset-0 rounded-full animate-ping border-2 border-blue-300 opacity-40" />
                        )}
                        <div
                          className={`flex h-7 w-7 items-center justify-center rounded-full border-2 bg-[#080d12] ${
                            step.status === "completed"
                              ? "border-teal-300 text-teal-300"
                              : step.status === "current"
                                ? "border-blue-300 text-blue-300"
                                : step.status === "rejected"
                                  ? "border-red-400 text-red-400"
                                  : "border-white/20 text-transparent"
                          }`}
                        >
                          {step.status === "completed" ? <CheckCircle2 className="h-4 w-4" /> : step.status === "current" ? <div className="h-2 w-2 rounded-full bg-blue-300" /> : step.status === "rejected" ? <div className="h-2 w-2 rounded-full bg-red-400" /> : null}
                        </div>
                      </div>
                      <div className="pt-1">
                        <p className={`text-sm font-medium ${step.status === "pending" ? "text-slate-500" : step.status === "rejected" ? "text-red-400" : "text-white"}`}>{step.label}</p>
                        {step.date ? <p className="mt-0.5 text-xs text-slate-500">{new Date(step.date).toLocaleDateString()}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="uc-panel">
              <h3 className="mb-4 font-semibold">Konum</h3>
              <p className="mb-3 flex items-center gap-2 text-sm text-slate-400">
                <MapPin className="h-4 w-4 text-teal-300" />
                {gps.latitude != null ? `${Number(gps.latitude).toFixed(5)}, ${Number(gps.longitude).toFixed(5)}` : "GPS kullanılamıyor"}
              </p>
              {mapLink ? (
                <a href={mapLink} target="_blank" rel="noreferrer" className="uc-button uc-button-ghost w-full">
                  <ExternalLink className="h-4 w-4" />
                  Haritada aç
                </a>
              ) : null}
            </section>

            <div className="uc-note">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-300" />
              <span>Güncellemeleri görmek için bu sayfayı kaydedebilirsin.</span>
            </div>

            <Link to="/" className="inline-flex text-sm font-semibold text-slate-400 hover:text-white">
              Ana sayfaya dön
            </Link>
          </aside>
        </div>
      </div>
    </main>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <span className="block text-xs font-semibold uppercase text-slate-500">{label}</span>
      <strong className="mt-2 block text-lg text-white">{value}</strong>
    </div>
  );
}
