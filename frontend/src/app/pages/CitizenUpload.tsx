import { useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router";
import { useDropzone } from "react-dropzone";
import { CheckCircle2, Info, Loader2, LocateFixed, MapPin, UploadCloud, Zap } from "lucide-react";
import { CitizenOutletContext } from "../components/CitizenLayout";
import { predictReport } from "../lib/api";
import { reportTypeLabel } from "../lib/labels";

export function CitizenUpload() {
  const { session, openAuth } = useOutletContext<CitizenOutletContext>();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [desc, setDesc] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [gpsRequired, setGpsRequired] = useState(true);
  const [useLiveLocation, setUseLiveLocation] = useState(false);
  const [liveLocation, setLiveLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const navigate = useNavigate();

  const handleFile = (selectedFile: File) => {
    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (event) => setPreview(event.target?.result as string);
    reader.readAsDataURL(selectedFile);
    setError("");
    setResult(null);
    setAnalysisDone(false);
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { "image/*": [] },
    maxFiles: 1,
    multiple: false,
    noClick: Boolean(preview),
    onDrop: (acceptedFiles) => {
      if (acceptedFiles[0]) handleFile(acceptedFiles[0]);
    },
  });

  const requestLiveLocation = () => {
    if (!navigator.geolocation) {
      setError("Konum özelliği bu tarayıcıda desteklenmiyor.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLiveLocation({
          latitude: Number(position.coords.latitude),
          longitude: Number(position.coords.longitude),
        });
        setUseLiveLocation(true);
        setError("");
      },
      () => setError("Konum izni reddedildi."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session) {
      openAuth("login");
      setError("Bildirim oluşturmak için önce giriş yapmalısın.");
      return;
    }
    if (!file) {
      setError("Lütfen önce bir sorun fotoğrafı yükleyin.");
      return;
    }

    if (gpsRequired && !useLiveLocation) {
      setError("GPS doğrulaması açık. Canlı konum kullanın ya da GPS bilgisi gömülü bir fotoğraf yükleyin.");
      return;
    }

    setIsAnalyzing(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("notes", desc.trim());

      const response = await predictReport(formData, {
        require_gps: gpsRequired,
        browser_latitude: liveLocation?.latitude,
        browser_longitude: liveLocation?.longitude,
      });

      setResult(response);
      setAnalysisDone(true);
      const reportId = response.report_id || response.existing_report?.id || response.duplicate_of;
      if (reportId) {
        navigate(`/report/${reportId}`, { state: { report: response.existing_report || response } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gönderim başarısız oldu.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!session) {
    return (
      <main className="uc-section">
        <div className="uc-container">
          <div className="uc-section-head">
            <div>
              <div className="uc-kicker">Giriş gerekli</div>
              <h1 className="uc-section-title">Bildirim oluşturmak için hesabına giriş yap.</h1>
            </div>
            <p className="uc-section-copy">Fotoğraf yükleme ve bildirim takibi yalnızca giriş yapan kullanıcılar için açık.</p>
          </div>

          <div className="uc-panel">
            <h3 className="uc-panel-title">Hesabınla devam et</h3>
            <p>Giriş yaptıktan sonra fotoğraf yükleyebilir, konumu ekleyebilir ve bildiriminin durumunu takip edebilirsin.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button type="button" className="uc-button uc-button-primary" onClick={() => openAuth("login")}>
                Giriş Yap
              </button>
              <Link to="/" className="uc-button uc-button-ghost">
                Ana Sayfaya Dön
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="uc-section">
      <div className="uc-container">
        <div className="uc-section-head">
          <div>
            <div className="uc-kicker">Yeni bildirim</div>
            <h1 className="uc-section-title">Fotoğrafı seç, konumu doğrula, bildirimi gönder.</h1>
          </div>
          <p className="uc-section-copy">Fotoğrafını yükle, konumunu ekle ve bildiriminin durumunu hesabından takip et.</p>
        </div>

        <form onSubmit={handleSubmit} className="uc-report-zone">
          <div className="uc-panel">
            <h3 className="uc-panel-title">Fotoğraf</h3>
            <p>Sorunun net göründüğü bir görsel seç.</p>
            <div {...getRootProps({ className: `uc-drop-area mt-6 ${preview || isDragActive ? "is-active" : ""}` })}>
              <input {...getInputProps()} />
              {preview ? (
                <div className="relative w-full">
                  <img src={preview} alt="Önizleme" className="h-64 w-full rounded-lg object-cover" />
                  {isAnalyzing ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-slate-950/70 text-white backdrop-blur-sm">
                      <Loader2 className="mb-4 h-10 w-10 animate-spin text-teal-300" />
                      <p className="font-semibold">Görüntü analiz ediliyor...</p>
                      <p className="mt-2 text-sm text-slate-300">Bildirim hazırlanıyor</p>
                    </div>
                  ) : null}
                  {analysisDone ? (
                    <div className="absolute right-4 top-4 rounded-full bg-emerald-500 p-2 text-white shadow-lg">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                  ) : null}
                </div>
              ) : (
                <span>
                  <span className="uc-drop-icon">
                    <UploadCloud className="h-9 w-9" />
                  </span>
                  <strong className="block text-xl">Fotoğraf yükle</strong>
                  <span className="text-sm text-slate-400">JPEG, PNG, WEBP - en fazla 10 MB</span>
                </span>
              )}
            </div>

            {preview && !isAnalyzing ? (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  className="text-sm font-semibold text-teal-300 underline transition-colors hover:text-white"
                  onClick={() => { setPreview(null); setAnalysisDone(false); setResult(null); setFile(null); }}
                >
                  Farklı bir fotoğraf seç
                </button>
              </div>
            ) : null}
          </div>

          <div className="uc-panel">
            <h3 className="uc-panel-title">Bildirim bilgileri</h3>
            <p>Konum ve kısa açıklama bildiriminle birlikte kaydedilir.</p>

            <div className="uc-field mt-6">
              <label>Kısa açıklama</label>
              <textarea value={desc} onChange={(event) => setDesc(event.target.value)} placeholder="Sorunu birkaç cümleyle anlat..." />
            </div>

            <label className="mb-4 flex items-center gap-3 text-sm text-slate-300">
              <input type="checkbox" checked={gpsRequired} onChange={(event) => setGpsRequired(event.target.checked)} />
              Gönderim için GPS açık olmalı
            </label>

            <button type="button" onClick={requestLiveLocation} className="uc-button uc-button-ghost w-full">
              <LocateFixed className="h-4 w-4" />
              Canlı konumumu kullan
            </button>

            <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
              <MapPin className="h-4 w-4 text-teal-300" />
              {liveLocation ? `${liveLocation.latitude.toFixed(5)}, ${liveLocation.longitude.toFixed(5)}` : "Henüz canlı konum eklenmedi"}
            </div>

            <div className="mt-6 border-t border-white/10 pt-6">
              <div className="mb-4 flex items-center gap-2">
                <Zap className={`h-5 w-5 ${analysisDone ? "text-teal-300" : "text-slate-500"}`} />
                <h3 className="font-semibold">Analiz sonuçları</h3>
              </div>

              {error ? <div className="uc-status-error mb-4">{error}</div> : null}

              {!analysisDone && !result ? (
                <div className="uc-empty-state">
                  <Info className="mx-auto mb-3 h-8 w-8 opacity-60" />
                  <p>Analize başlamak için bir fotoğraf yükleyin.</p>
                </div>
              ) : result ? (
                <div className="grid gap-3">
                  <InfoRow label="Tespit edilen sorun" value={reportTypeLabel(result.report_type || result.existing_report?.report_type)} />
                  <InfoRow label="Güven skoru" value={`${Math.round((result.top_detection?.confidence || result.existing_report?.top_confidence || 0) * 100)}%`} />
                  <InfoRow label="Durum" value={result.duplicate ? "Benzer bildirim bulundu" : "Yeni kayıt oluşturuldu"} />
                </div>
              ) : null}
            </div>

            <button type="submit" disabled={isAnalyzing} className="uc-button uc-button-primary mt-6 w-full">
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gönderiliyor...
                </>
              ) : (
                "Bildirimi Gönder"
              )}
            </button>

            <Link to="/" className="mt-4 inline-flex text-sm font-semibold text-slate-400 hover:text-white">
              Ana sayfaya dön
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
