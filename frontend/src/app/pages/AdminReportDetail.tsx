import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Mail,
  MapPin,
  MessageCircle,
  Printer,
  Share2,
  Zap,
} from "lucide-react";
import {
  API_BASE,
  getAdminNotesHistory,
  getAdminReportDetail,
  updateAdminAssignment,
  updateAdminNotes,
  updateAdminReportStatus,
  uploadAdminAfterPhoto,
} from "../lib/api";
import { interventionStatusLabel, reportStatusLabel, reportTypeLabel } from "../lib/labels";

function formatLocationLabel(value: string) {
  const key = String(value || "").toLowerCase();
  if (key === "matched") return "Eşleşti";
  if (key === "browser_only") return "Tarayıcı konumu";
  if (key === "exif_only") return "EXIF GPS";
  if (key === "unverified") return "Doğrulanmadı";
  return key.replaceAll("_", " ") || "—";
}

function getActiveStageLabel(reviewStatus: string, interventionStatus: string) {
  if (reviewStatus === "pending_review") return reportStatusLabel("pending_review");
  if (reviewStatus === "in_review") return reportStatusLabel("in_review");
  if (reviewStatus === "rejected") return reportStatusLabel("rejected");
  if (interventionStatus === "resolved") return "Tamamlandı";
  if (interventionStatus === "assigned") return "Ekip Atandı";
  if (interventionStatus === "in_progress") return "Saha Ekibi Çalışıyor";
  if (interventionStatus === "pending_dispatch") return "Ekip Atama Bekleniyor";
  return interventionStatusLabel(interventionStatus);
}

function DetailRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="admin-detail-row py-2 border-b border-white/5 last:border-0">
      <span className="text-slate-400 text-xs">{label}</span>
      <strong className={`text-sm text-right ${accent ? "text-emerald-400" : "text-slate-100"}`}>{value}</strong>
    </div>
  );
}

export function AdminReportDetail() {
  const { id } = useParams();
  const [report, setReport] = useState<any>(null);
  const [notesHistory, setNotesHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [notes, setNotes] = useState("");
  const [afterPhotoFile, setAfterPhotoFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const [imageLayout, setImageLayout] = useState({ width: 0, height: 0, offsetX: 0, offsetY: 0 });

  async function load() {
    if (!id) return;
    setIsLoading(true);
    try {
      const detail = await getAdminReportDetail(id);
      const history = await getAdminNotesHistory(id);
      setReport(detail);
      setNotesHistory(history.entries || []);
      setSelectedTeam(detail.assignment?.assigned_team || "");
      setNotes(detail.notes || "");
      setAfterPhotoFile(null);
    } catch (error) {
      flash(error instanceof Error ? error.message : "Bildirim yüklenemedi.", true);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  function flash(msg: string, err = false) {
    setMessage(msg);
    setIsError(err);
  }

  const runAdminAction = async (action: () => Promise<void>, successMessage: string) => {
    if (isSaving) return;
    setIsSaving(true);
    setMessage("");
    try {
      await action();
      flash(successMessage, false);
    } catch (error) {
      flash(error instanceof Error ? error.message : "İşlem tamamlanamadı.", true);
    } finally {
      setIsSaving(false);
    }
  };

  const imageSrc = report?.saved_as ? `${API_BASE}/uploads/${report.saved_as}` : "";
  const gpsText = report?.gps ? `${Number(report.gps.latitude).toFixed(5)}, ${Number(report.gps.longitude).toFixed(5)}` : "GPS mevcut değil";
  const reviewStatus = String(report?.status || "pending_review");
  const interventionStatus = String(report?.assignment?.intervention_status || "pending_dispatch");
  const activeStageLabel = getActiveStageLabel(reviewStatus, interventionStatus);
  const canStartReview = reviewStatus === "pending_review";
  const canFinalizeReview = reviewStatus === "in_review";
  const canShowFieldOps = reviewStatus === "approved";
  const isResolved = interventionStatus === "resolved";
  const activeAssignedTeam = String(selectedTeam || report?.assignment?.assigned_team || "").trim();
  const districtLabel = String(report?.district_name || report?.location_scope?.district || "").trim();
  const provinceLabel = String(report?.province_name || report?.location_scope?.province || "").trim();
  const neighborhoodLabel = String(report?.neighborhood_name || report?.location_scope?.neighborhood || "").trim();
  const bbox = Array.isArray(report?.top_detection?.bbox_xyxy) ? report.top_detection.bbox_xyxy : null;
  const shareLatitude = report?.gps?.latitude ?? null;
  const shareLongitude = report?.gps?.longitude ?? null;
  const shareMapUrl = shareLatitude != null && shareLongitude != null ? `https://www.google.com/maps?q=${shareLatitude},${shareLongitude}` : "";
  const shareLocationText = [
    `UrbanChain bildirim #${report?.id ?? ""}`,
    `Konum: ${[provinceLabel, districtLabel, neighborhoodLabel].filter(Boolean).join(" / ") || "Bölge bilgisi yok"}`,
    shareMapUrl ? `Harita: ${shareMapUrl}` : "",
  ].filter(Boolean).join("\n");
  const shareSubject = `UrbanChain konum paylaşımı #${report?.id ?? ""}`;

  const boxStyle = useMemo(() => {
    if (!bbox || !imageLayout.width || !imageLayout.height) return null;
    const naturalWidth = imageElementRef.current?.naturalWidth || 0;
    const naturalHeight = imageElementRef.current?.naturalHeight || 0;
    if (!naturalWidth || !naturalHeight) return null;
    const scaleX = imageLayout.width / naturalWidth;
    const scaleY = imageLayout.height / naturalHeight;
    return {
      left: `${imageLayout.offsetX + bbox[0] * scaleX}px`,
      top: `${imageLayout.offsetY + bbox[1] * scaleY}px`,
      width: `${Math.max(80, (bbox[2] - bbox[0]) * scaleX)}px`,
      height: `${Math.max(40, (bbox[3] - bbox[1]) * scaleY)}px`,
    };
  }, [bbox, imageLayout]);

  useEffect(() => {
    const update = () => {
      const container = imageContainerRef.current;
      const image = imageElementRef.current;
      if (!container || !image || !image.naturalWidth || !image.naturalHeight) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const scale = Math.min(cw / image.naturalWidth, ch / image.naturalHeight);
      const w = image.naturalWidth * scale;
      const h = image.naturalHeight * scale;
      setImageLayout({ width: w, height: h, offsetX: (cw - w) / 2, offsetY: (ch - h) / 2 });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [report?.saved_as]);

  if (isLoading) return <div className="admin-empty-state">Yükleniyor...</div>;
  if (!report) {
    return <div className="admin-status-error">{message || "Bildirim bulunamadı."}</div>;
  }

  const handleStatus = async (status: string) => {
    await runAdminAction(async () => {
      await updateAdminReportStatus(report.id, status);
      await load();
    }, "Durum güncellendi.");
  };

  const handleInterventionSave = async () => {
    if (!canShowFieldOps) return;
    const teamValue = activeAssignedTeam;
    if (interventionStatus === "pending_dispatch") {
      if (!teamValue) { flash("Ekip adı girin.", true); return; }
      await runAdminAction(async () => {
        await updateAdminAssignment(report.id, { assigned_team: teamValue, intervention_status: "assigned" });
        await load();
      }, "Ekip ataması kaydedildi.");
      return;
    }
    if (!teamValue || !notes.trim() || !afterPhotoFile) {
      flash("Tamamlamak için ekip, operasyon notu ve çözüm fotoğrafı gerekli.", true);
      return;
    }
    await runAdminAction(async () => {
      await updateAdminNotes(report.id, notes.trim());
      const formData = new FormData();
      formData.append("file", afterPhotoFile);
      await uploadAdminAfterPhoto(report.id, formData);
      await updateAdminAssignment(report.id, { assigned_team: teamValue, intervention_status: "resolved" });
      await load();
    }, "Müdahale tamamlandı.");
  };

  const handleShareLocation = async () => {
    if (!shareMapUrl) return;
    setShareMessage("");
    if (navigator.share) {
      try {
        await navigator.share({ title: shareSubject, text: shareLocationText, url: shareMapUrl });
        return;
      } catch {
        setSharePanelOpen(true);
      }
    } else {
      setSharePanelOpen(true);
    }
  };

  const handleCopyShareLink = async () => {
    await navigator.clipboard.writeText(`${shareLocationText}\n${shareMapUrl}`);
    setShareMessage("Kopyalandı.");
  };

  const shareMailHref = `mailto:?subject=${encodeURIComponent(shareSubject)}&body=${encodeURIComponent(`${shareLocationText}\n\n${shareMapUrl}`)}`;
  const shareWhatsappHref = `https://wa.me/?text=${encodeURIComponent(`${shareLocationText}\n${shareMapUrl}`)}`;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {message ? (
        <div className={isError ? "admin-status-error" : "admin-flash-message"}>{message}</div>
      ) : null}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/admin/reports" className="admin-ghost-btn inline-flex items-center gap-1.5 text-sm">
            <ArrowLeft size={15} />
            Geri
          </Link>
          <div>
            <h2 className="text-xl font-bold text-white">Bildirim #{report.id}</h2>
            <p className="text-xs text-slate-400">{new Date(report.created_at).toLocaleString("tr-TR")}</p>
          </div>
        </div>
        <button type="button" onClick={() => window.print()} className="admin-ghost-btn inline-flex items-center gap-2 text-sm">
          <Printer size={15} />
          Yazdır
        </button>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">

        {/* ── Left column ── */}
        <div className="space-y-5">

          {/* Image */}
          <div className="overflow-hidden rounded-xl">
            <div ref={imageContainerRef} className="relative h-80 bg-slate-950">
              <img src={imageSrc} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl" />
              <img
                ref={imageElementRef}
                src={imageSrc}
                alt="Bildirim görseli"
                className="absolute inset-0 m-auto max-h-full max-w-full object-contain drop-shadow-2xl"
                onLoad={() => {
                  const container = imageContainerRef.current;
                  const image = imageElementRef.current;
                  if (!container || !image || !image.naturalWidth || !image.naturalHeight) return;
                  const cw = container.clientWidth;
                  const ch = container.clientHeight;
                  const scale = Math.min(cw / image.naturalWidth, ch / image.naturalHeight);
                  const w = image.naturalWidth * scale;
                  const h = image.naturalHeight * scale;
                  setImageLayout({ width: w, height: h, offsetX: (cw - w) / 2, offsetY: (ch - h) / 2 });
                }}
              />
              {boxStyle ? (
                <div
                  className="absolute z-10 border-2 border-emerald-400 bg-emerald-400/20 shadow-[0_0_15px_rgba(52,211,153,0.5)]"
                  style={boxStyle}
                >
                  <div className="-mt-5 -ml-0.5 whitespace-nowrap bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {reportTypeLabel(report.top_detection.class_name)} {(report.top_detection.confidence * 100).toFixed(0)}%
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Report info */}
          <div className="admin-panel">
            <div className="admin-panel-head ktz-compact-head">
              <div>
                <h3 className="flex items-center gap-2">
                  <Zap size={15} className="text-teal-400" />
                  Rapor Bilgileri
                </h3>
              </div>
              <span className="ktz-report-id-pill">RP-{report.id}</span>
            </div>

            <div className="mb-4">
              <DetailRow label="Sınıflandırma" value={reportTypeLabel(report.report_type)} />
              <DetailRow label="Güven skoru" value={`%${(Number(report.top_confidence ?? 0) * 100).toFixed(1)}`} accent />
              <DetailRow label="GPS koordinatları" value={gpsText} />
              <DetailRow label="Konum kaynağı" value={formatLocationLabel(report.location?.status)} />
              <DetailRow
                label="Bölge"
                value={[provinceLabel, districtLabel, neighborhoodLabel].filter(Boolean).join(" / ") || "Konum bilgisi yok"}
              />
              <DetailRow label="Aktif aşama" value={activeStageLabel} />
            </div>

            {report.citizen_note ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Vatandaş notu</p>
                <p className="text-sm text-slate-300 italic">"{report.citizen_note}"</p>
              </div>
            ) : null}
          </div>

          {/* Kanıt doğrulama */}
          <div className="admin-panel">
            <div className="admin-panel-head ktz-compact-head">
              <div><h3>Kanıt Doğrulama</h3></div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-white/8 bg-white/5 px-3 py-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">IPFS CID</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-300 break-all">{report.ipfs?.cid || "Yok"}</p>
                </div>
                {report.ipfs?.cid
                  ? <span className="shrink-0 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">SABİTLENDİ</span>
                  : <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-400">SABİTLENMEDİ</span>}
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/8 bg-white/5 px-3 py-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Zincir özeti</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-300 break-all">{report.proof?.chain_hash || "Yok"}</p>
                </div>
                {report.proof?.chain_hash
                  ? <span className="shrink-0 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">MÜHÜRLENDİ</span>
                  : <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-400">MÜHÜRLENMEDİ</span>}
              </div>
            </div>
          </div>

          {/* Notes history - only when there are entries */}
          {notesHistory.length > 0 ? (
            <div className="admin-panel">
              <div className="admin-panel-head ktz-compact-head">
                <div><h3>Not Geçmişi</h3></div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {notesHistory.map((entry) => (
                  <div key={`${entry.created_at}-${entry.actor_username}`} className="rounded-lg border border-white/8 bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <strong className="text-xs text-slate-200">{entry.actor_username}</strong>
                      <span className="text-[10px] text-slate-500">{new Date(entry.created_at).toLocaleString("tr-TR")}</span>
                    </div>
                    <p className="text-xs text-slate-400">{entry.note_text}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Right column ── */}
        <div className="space-y-5">

          {/* Review panel */}
          <div className="admin-panel">
            <div className="admin-panel-head ktz-compact-head">
              <div><h3>İnceleme</h3></div>
              <span className="inline-flex rounded-full border border-white/15 bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-slate-200">
                {activeStageLabel}
              </span>
            </div>

            {canStartReview ? (
              <button
                type="button"
                onClick={() => handleStatus("in_review")}
                disabled={isSaving}
                className="w-full rounded-lg border border-amber-400/30 bg-amber-500/15 py-2.5 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
              >
                {isSaving ? "Kaydediliyor..." : "İncelemeye Al"}
              </button>
            ) : canFinalizeReview ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleStatus("approved")}
                  disabled={isSaving}
                  className="flex-1 rounded-lg border border-teal-400/30 bg-teal-500/15 py-2.5 text-sm font-semibold text-teal-300 transition-colors hover:bg-teal-500/25 disabled:opacity-50"
                >
                  Onayla
                </button>
                <button
                  type="button"
                  onClick={() => handleStatus("rejected")}
                  disabled={isSaving}
                  className="flex-1 rounded-lg border border-red-400/30 bg-red-500/15 py-2.5 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/25 disabled:opacity-50"
                >
                  Reddet
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                {reviewStatus === "approved" ? "Bildirim onaylandı." : reviewStatus === "rejected" ? "Bildirim reddedildi." : "—"}
              </p>
            )}
          </div>

          {/* Field ops panel — only after approval */}
          {canShowFieldOps ? (
            <div className="admin-panel">
              <div className="admin-panel-head ktz-compact-head">
                <div>
                  <h3>
                    {isResolved
                      ? "Müdahale Tamamlandı"
                      : interventionStatus === "pending_dispatch"
                        ? "Ekip Ata"
                        : "Müdahale Onayı"}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isResolved
                      ? "Bildirim işleme alındı ve tamamlandı."
                      : interventionStatus === "pending_dispatch"
                        ? "Hangi belediye ekibinin bu bildirimi çözeceğini belirle."
                        : "İşlemin yapıldığına dair kanıtı yükle ve bildirimi kapat."}
                  </p>
                </div>
              </div>

              {interventionStatus === "pending_dispatch" ? (
                /* ── Step 1: Assign team ── */
                <div className="space-y-3">
                  <input
                    type="text"
                    value={selectedTeam}
                    onChange={(e) => setSelectedTeam(e.target.value)}
                    placeholder="Örn: Niğde Belediyesi Yol Bakım Ekibi"
                    className="ktz-filter-select w-full"
                  />
                  <p className="text-xs text-slate-500">
                    Bölge: {[provinceLabel, districtLabel].filter(Boolean).join(" / ") || "Bilinmiyor"}
                  </p>
                  <button
                    type="button"
                    onClick={handleInterventionSave}
                    disabled={isSaving || !activeAssignedTeam}
                    className="w-full rounded-lg border border-teal-400/30 bg-teal-500/15 py-2.5 text-sm font-semibold text-teal-300 transition-colors hover:bg-teal-500/25 disabled:opacity-40"
                  >
                    {isSaving ? "Kaydediliyor..." : "Ekibi Ata"}
                  </button>
                </div>
              ) : isResolved ? (
                /* ── Resolved state ── */
                <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-4 text-center">
                  <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-400" />
                  <p className="text-sm font-semibold text-emerald-300">Tamamlandı</p>
                  {activeAssignedTeam ? (
                    <p className="mt-1 text-xs text-slate-400">{activeAssignedTeam}</p>
                  ) : null}
                </div>
              ) : (
                /* ── Step 2: Confirm completion ── */
                <div className="space-y-3">
                  {/* Assigned team — read-only */}
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Atanan Ekip</p>
                    <p className="text-sm text-slate-200">{activeAssignedTeam || "—"}</p>
                  </div>

                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Yapılan müdahaleyi kısaca açıkla..."
                    rows={3}
                    className="ktz-filter-select w-full resize-none"
                  />

                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Kanıt Fotoğrafı
                    </p>
                    <p className="mb-2 text-xs text-slate-400">
                      Sorunun çözüldüğünü gösteren bir fotoğraf yükle.
                    </p>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp"
                      onChange={(e) => setAfterPhotoFile(e.target.files?.[0] || null)}
                      className="text-xs text-slate-300"
                    />
                    {afterPhotoFile ? (
                      <p className="mt-1 text-[10px] text-slate-500">{afterPhotoFile.name}</p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={handleInterventionSave}
                    disabled={isSaving || !notes.trim() || !afterPhotoFile}
                    className="w-full rounded-lg border border-teal-400/30 bg-teal-500/15 py-2.5 text-sm font-semibold text-teal-300 transition-colors hover:bg-teal-500/25 disabled:opacity-40"
                  >
                    {isSaving ? "Kaydediliyor..." : "Müdahaleyi Onayla"}
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {/* Location & share */}
          <div className="admin-panel">
            <div className="admin-panel-head ktz-compact-head">
              <div><h3>Konum</h3></div>
            </div>

            <div className="mb-4">
              {[
                { label: "İl", value: provinceLabel },
                { label: "İlçe", value: districtLabel },
                { label: "Mahalle", value: neighborhoodLabel },
              ].filter((r) => r.value).map((r) => (
                <DetailRow key={r.label} label={r.label} value={r.value} />
              ))}
              {gpsText !== "GPS mevcut değil" ? <DetailRow label="GPS" value={gpsText} /> : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleShareLocation}
                disabled={!shareMapUrl}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:opacity-40"
              >
                <Share2 size={12} />
                Konumu Paylaş
              </button>
              {shareMapUrl ? (
                <a
                  href={shareMapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/10"
                >
                  <MapPin size={12} />
                  Haritada Aç
                </a>
              ) : null}
            </div>

            {sharePanelOpen ? (
              <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-slate-400">Paylaş seçenekleri</p>
                <div className="flex flex-wrap gap-2">
                  <a href={shareWhatsappHref} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg bg-green-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600">
                    <MessageCircle size={12} /> WhatsApp
                  </a>
                  <a href={shareMailHref} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15">
                    <Mail size={12} /> E-posta
                  </a>
                  <button type="button" onClick={handleCopyShareLink} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10">
                    <Copy size={12} /> Kopyala
                  </button>
                </div>
                {shareMessage ? <p className="text-[10px] text-emerald-400">{shareMessage}</p> : null}
              </div>
            ) : null}
          </div>

          {/* AI detection info */}
          {report.top_detection ? (
            <div className="admin-panel">
              <div className="admin-panel-head ktz-compact-head">
                <div><h3>Model Tespiti</h3></div>
              </div>
              <div>
                <DetailRow label="Sınıf" value={reportTypeLabel(report.top_detection.class_name)} />
                <DetailRow label="Güven" value={`%${(report.top_detection.confidence * 100).toFixed(1)}`} accent />
                {report.top_detection.bbox_xyxy ? (
                  <DetailRow
                    label="Bounding box"
                    value={report.top_detection.bbox_xyxy.map((v: number) => Math.round(v)).join(", ")}
                  />
                ) : null}
              </div>
              {!report.location?.status || report.location.status === "unverified" ? (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  <AlertTriangle size={12} />
                  GPS doğrulaması yapılmadı
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                  <CheckCircle2 size={12} />
                  GPS doğrulandı
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
