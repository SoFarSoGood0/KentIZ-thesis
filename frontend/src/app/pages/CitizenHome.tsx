import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router";
import { motion, type Variants } from "framer-motion";
import { ArrowRight, BarChart3, Bell, Camera, CheckCircle2, ClipboardCheck, FileText, Hourglass, LocateFixed, MapPin, PlusCircle, ShieldCheck, UploadCloud, UserRound } from "lucide-react";
import { API_BASE, getCitizenReports, getCitizenSummary } from "../lib/api";
import { CitizenOutletContext } from "../components/CitizenLayout";
import { interventionStatusLabel, reportStatusLabel, reportTypeLabel } from "../lib/labels";

export function getLocationLabel(report: any) {
  const scope = report?.location_scope || {};
  const parts = [scope.province || report?.province, scope.district || report?.district, scope.neighborhood].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  if (report?.gps?.latitude != null && report?.gps?.longitude != null) {
    return `${Number(report.gps.latitude).toFixed(5)}, ${Number(report.gps.longitude).toFixed(5)}`;
  }
  return "Konum bilgisi bekleniyor";
}

export function getDisplayStatus(report: any) {
  const intervention = String(report?.assignment?.intervention_status || report?.intervention_status || "");
  if (intervention === "resolved" || intervention === "assigned" || intervention === "in_progress") {
    return interventionStatusLabel(intervention);
  }
  return reportStatusLabel(report?.status || "pending_review");
}

export function getPillClass(report: any) {
  const intervention = String(report?.assignment?.intervention_status || report?.intervention_status || "");
  if (intervention === "resolved") return "done";
  if (intervention === "assigned" || intervention === "in_progress") return "ok";
  if (String(report?.status || "") === "rejected") return "rejected";
  return "wait";
}

const revealContainer: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.05,
    },
  },
};

const revealItem: Variants = {
  hidden: { opacity: 0, y: 34, filter: "blur(8px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.7,
      ease: "easeOut",
    },
  },
};

const panelReveal: Variants = {
  hidden: { opacity: 0, y: 38, scale: 0.985, filter: "blur(10px)" },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      duration: 0.75,
      ease: "easeOut",
    },
  },
};

export function CitizenHome() {
  const { session, openAuth } = useOutletContext<CitizenOutletContext>();
  const navigate = useNavigate();
  const [reports, setReports] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loadingReports, setLoadingReports] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoadingReports(Boolean(session));
      try {
        const [summaryData, reportsData] = session ? await Promise.all([getCitizenSummary(), getCitizenReports(8)]) : [null, { reports: [] }];
        if (!active) return;
        setSummary(summaryData);
        setReports(reportsData.reports || []);
      } catch {
        if (active) {
          setSummary(null);
          setReports([]);
        }
      } finally {
        if (active) setLoadingReports(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [session]);

  const handleCreateReport = () => {
    if (session) {
      navigate("/upload");
      return;
    }
    openAuth("login");
  };

  const handleReportsClick = () => {
    if (!session) {
      openAuth("login");
      return;
    }
    document.getElementById("reports")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (session) {
    return (
      <CitizenDashboard
        session={session}
        summary={summary}
        reports={reports}
        loadingReports={loadingReports}
        onCreateReport={handleCreateReport}
      />
    );
  }

  return (
    <>
      <main id="top" className="uc-hero">
        <div className="uc-container uc-hero-grid">
          <section>
            <div className="uc-eyebrow">Çevre sorunlarını kolayca bildir</div>
            <h1 className="uc-title">
              Çevrendeki sorunu <span className="uc-serif">görünür</span> hale getir.
            </h1>
            <p className="uc-lead">
              Yoldaki çukur, çöp yığını veya kaldırım problemi gibi durumları fotoğrafla bildir. Konumu ekle, başvurunu gönder ve çözüm
              sürecini hesabından takip et.
            </p>
            <div className="uc-hero-actions">
              <button type="button" className="uc-button uc-button-primary uc-button-xl" onClick={handleCreateReport}>
                <Camera className="h-5 w-5" />
                Bildirim Oluştur
              </button>
              <button type="button" className="uc-button uc-button-ghost uc-button-xl" onClick={handleReportsClick}>
                <ClipboardCheck className="h-5 w-5" />
                Raporlarım
              </button>
            </div>
            <div className="uc-trust-row">
              <div className="uc-trust-icons">
                <span>
                  <Camera className="h-4 w-4" />
                </span>
                <span>
                  <LocateFixed className="h-4 w-4" />
                </span>
                <span>
                  <Bell className="h-4 w-4" />
                </span>
              </div>
              <span>Fotoğraf yükle, konum ekle, durumunu takip et.</span>
            </div>
          </section>

          <motion.section
            className="uc-phone-visual"
            aria-hidden="true"
            initial={{ opacity: 0, y: 28, rotate: -1.5 }}
            animate={{ opacity: 1, y: [0, -14, 0], rotate: [-1.5, -0.4, -1.5] }}
            transition={{ opacity: { duration: 0.55 }, y: { duration: 6.5, repeat: Infinity, ease: "easeInOut" }, rotate: { duration: 6.5, repeat: Infinity, ease: "easeInOut" } }}
          >
            <div className="uc-phone-shell">
              <div className="uc-phone-screen">
                <div className="uc-phone-status">
                  <span>09:41</span>
                  <span className="uc-signal">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
                <div className="uc-phone-head">
                  <div>
                    <span>Yeni Bildirim</span>
                    <strong>Fotoğrafı seç, analiz et.</strong>
                  </div>
                  <b>
                    <UserRound className="h-6 w-6" />
                  </b>
                </div>

                <motion.div
                  className="uc-phone-card uc-phone-upload"
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <div className="uc-phone-file">
                    <span>
                      <UploadCloud className="h-5 w-5" />
                    </span>
                    <div>
                      <strong>yol-sorunu.jpg</strong>
                      <small>Konum bağlandı · Görsel hazır</small>
                    </div>
                  </div>
                  <button type="button">Analiz Et</button>
                </motion.div>

                <motion.div
                  className="uc-phone-card uc-analysis-card"
                  animate={{ y: [0, 9, 0] }}
                  transition={{ duration: 5.8, repeat: Infinity, ease: "easeInOut" }}
                >
                  <div className="uc-analysis-head">
                    <strong>Analiz Sonucu</strong>
                    <span>
                      <i />
                      Aktif tarama
                    </span>
                  </div>
                  <div className="uc-phone-progress">
                    <span />
                  </div>
                  <div className="uc-analysis-grid">
                    <div>
                      <small>Sorun</small>
                      <strong>Yol Çukuru</strong>
                    </div>
                    <div>
                      <small>Güven</small>
                      <strong>96%</strong>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>

            <motion.div
              className="uc-proof-card"
              animate={{ x: [0, -8, 0], y: [0, -12, 0] }}
              transition={{ duration: 6.2, repeat: Infinity, ease: "easeInOut" }}
            >
              <strong>Güvenli kayıt</strong>
              <p>Onaylanan bildirimler işlem geçmişiyle korunur.</p>
              <div className="uc-proof-lines">
                <span />
                <span />
                <span />
              </div>
            </motion.div>

            <motion.div
              className="uc-map-float-card"
              animate={{ x: [0, 10, 0], y: [0, 12, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="uc-map-mini">
                <span />
                <i />
                <b />
              </div>
              <strong>Konum eşleşti</strong>
              <p>Koordinat bilgisi rapora bağlandı.</p>
            </motion.div>
          </motion.section>
        </div>
      </main>

      <motion.section className="uc-section" id="how" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.24 }}>
        <div className="uc-container">
          <motion.div className="uc-section-head uc-section-head-single" variants={revealItem}>
            <div>
              <div className="uc-kicker">Süreç</div>
              <h2 className="uc-section-title">Bildirimin nasıl ilerleyeceğini baştan gör.</h2>
            </div>
          </motion.div>
          <motion.div className="uc-steps" variants={revealContainer}>
            <ProcessCard icon={Camera} number="01" title="Fotoğraf seç" text="Şehirde gördüğün problemi net görünen bir fotoğrafla bildirime ekle." />
            <ProcessCard icon={LocateFixed} number="02" title="Konumu ekle" text="Bulunduğun yeri canlı konum veya fotoğraf GPS verisiyle bildirime bağla." />
            <ProcessCard icon={ClipboardCheck} number="03" title="Başvuruyu gönder" text="Görsel ve konum bilgisiyle bildirimi oluştur." />
            <ProcessCard icon={Bell} number="04" title="Durumu takip et" text="Hesabına giriş yaptıysan bildirimlerini hesabından izle." />
          </motion.div>
        </div>
      </motion.section>

      <motion.section className="uc-section" id="report" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}>
        <div className="uc-container">
          <motion.div className="uc-section-head" variants={revealItem}>
            <div>
              <div className="uc-kicker">Bildirim</div>
              <h2 className="uc-section-title">Fotoğrafını ekle, konumunu bağla, bildirimi oluştur.</h2>
            </div>
            <p className="uc-section-copy">Fotoğrafını yükle, konumunu ekle ve bildiriminin durumunu hesabından takip et.</p>
          </motion.div>
          <motion.div className="uc-report-zone" variants={revealContainer}>
            <motion.div className="uc-panel" variants={panelReveal}>
              <h3 className="uc-panel-title">Yeni bildirim</h3>
              <p>Fotoğrafını yükle, konumu kontrol et ve bildirimi gönder.</p>
              <div className="uc-drop-area mt-6 w-full">
                <span>
                  <span className="uc-drop-icon">
                    <UploadCloud className="h-8 w-8" />
                  </span>
                  <strong className="block text-xl">Fotoğraf yükle</strong>
                  <span className="text-sm text-slate-400">JPG, PNG veya WEBP dosyası seçebilirsin.</span>
                </span>
              </div>
            </motion.div>

            <motion.div className="uc-panel" id="tracking" variants={panelReveal}>
              <h3 className="uc-panel-title">{session ? "Bildirimlerim" : "Bildirimlerini takip et"}</h3>
              <p>{session ? "Hesabına bağlı bildirimlerin durumları burada görünür." : "Bildirim geçmişini görmek ve yeni bildirim oluşturmak için hesabına giriş yap."}</p>
              <div className="uc-track-list mt-6">
                {!session ? (
                  <div className="uc-empty-state">Kişisel bildirim takibi için giriş yapmalısın.</div>
                ) : loadingReports ? (
                  <div className="uc-empty-state">Raporlar yükleniyor...</div>
                ) : reports.length ? (
                  reports.map((report, index) => (
                    <Link key={report.id} to={`/report/${report.id}`} className="uc-track-item">
                      <div className="uc-track-dot">{index + 1}</div>
                      <div>
                        <strong>{reportTypeLabel(report.report_type)}</strong>
                        <span>
                          {getLocationLabel(report)} · {new Date(report.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <span className={`uc-pill ${getPillClass(report)}`}>{getDisplayStatus(report)}</span>
                    </Link>
                  ))
                ) : (
                  <div className="uc-empty-state">Henüz hesabına bağlı bildirim yok.</div>
                )}
              </div>
              {!session ? (
                <button type="button" className="uc-button uc-button-ghost mt-5 w-full" onClick={() => openAuth("login")}>
                  <ShieldCheck className="h-4 w-4" />
                  Hesabımla Giriş Yap
                </button>
              ) : null}
            </motion.div>
          </motion.div>
        </div>
      </motion.section>

      <motion.section className="uc-section" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}>
        <div className="uc-container">
          <motion.div className="uc-panel flex flex-col gap-6 md:flex-row md:items-center md:justify-between" variants={panelReveal}>
            <div>
              <h2 className="uc-section-title text-[38px]">Şehrin için basit ama güçlü bir bildirim deneyimi.</h2>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-300">
              Hesabınla giriş yaptıktan sonra bildirimlerini tek yerden takip edebilirsin.
            </div>
          </motion.div>
        </div>
      </motion.section>
    </>
  );
}

function CitizenDashboard({
  session,
  summary,
  reports,
  loadingReports,
  onCreateReport,
}: {
  session: CitizenOutletContext["session"];
  summary: any;
  reports: any[];
  loadingReports: boolean;
  onCreateReport: () => void;
}) {
  const totalReports = Number(summary?.total_reports ?? reports.length ?? 0);
  const pendingReports = Number(summary?.pending_review_reports ?? 0);
  const inProgressReports = Number(summary?.in_progress_reports ?? 0);
  const resolvedReports = Number(summary?.resolved_reports ?? 0);
  const approvedReports = Number(summary?.approved_reports ?? 0);
  const mapReports = reports.filter((report) => report?.gps?.latitude != null && report?.gps?.longitude != null).slice(0, 4);

  // The dashboard shows only the most recent few; the full history lives on a
  // dedicated /reports page (so this layout never grows unbounded).
  const PREVIEW_COUNT = 5;
  const displayedReports = reports.slice(0, PREVIEW_COUNT);
  const hasMoreReports = totalReports > PREVIEW_COUNT || reports.length > PREVIEW_COUNT;
  const firstMapReport = mapReports[0];
  const mapLink =
    firstMapReport?.gps?.latitude != null && firstMapReport?.gps?.longitude != null
      ? `https://www.google.com/maps?q=${firstMapReport.gps.latitude},${firstMapReport.gps.longitude}`
      : "";

  const stats = [
    { label: "Toplam Bildirim", value: totalReports, hint: "Tüm zamanlar", icon: FileText, tone: "mint" },
    { label: "İnceleniyor", value: pendingReports + inProgressReports, hint: "Devam eden", icon: Hourglass, tone: "gold" },
    { label: "Çözüldü", value: resolvedReports, hint: "Tamamlanan", icon: CheckCircle2, tone: "green" },
    { label: "Onaylandı", value: approvedReports, hint: "Doğrulanan", icon: BarChart3, tone: "blue" },
  ];

  return (
    <main id="top" className="uc-citizen-dashboard">
      <div className="uc-container">
        <motion.section className="uc-dashboard-hero" initial="hidden" animate="visible" variants={revealContainer}>
          <motion.div variants={revealItem}>
            <div className="uc-kicker">Hoş geldin</div>
            <h1 className="uc-dashboard-title">{session?.full_name || "Vatandaş"}</h1>
            <p className="uc-dashboard-copy">Bildirimlerini, inceleme durumunu ve konum kayıtlarını hesabına bağlı gerçek verilerle takip edebilirsin.</p>
          </motion.div>
          <motion.button type="button" className="uc-button uc-button-primary" onClick={onCreateReport} variants={revealItem}>
            <PlusCircle className="h-5 w-5" />
            Yeni Bildirim
          </motion.button>
        </motion.section>

        <motion.section className="uc-dashboard-stats" initial="hidden" animate="visible" variants={revealContainer}>
          {stats.map((item) => (
            <motion.article className={`uc-dashboard-stat ${item.tone}`} key={item.label} variants={panelReveal}>
              <div className="uc-dashboard-stat-icon">
                <item.icon className="h-6 w-6" />
              </div>
              <div>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.hint}</small>
              </div>
            </motion.article>
          ))}
        </motion.section>

        <section className="uc-dashboard-grid">
          <motion.article className="uc-dashboard-panel uc-dashboard-map-panel" id="map" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={panelReveal}>
            <div className="uc-dashboard-panel-head">
              <div>
                <h2>Konum özeti</h2>
                <p>Bildirimlerin konum bilgisiyle birlikte listelenir.</p>
              </div>
              {mapLink ? (
                <a href={mapLink} target="_blank" rel="noreferrer" className="uc-mini-action">
                  Haritada Aç
                  <ArrowRight className="h-4 w-4" />
                </a>
              ) : null}
            </div>

            <div className="uc-user-map">
              {mapReports.length ? (
                mapReports.map((report, index) => (
                  <Link
                    to={`/report/${report.id}`}
                    className={`uc-user-map-pin pin-${index + 1}`}
                    key={report.id}
                    aria-label={`${reportTypeLabel(report.report_type)} konumu`}
                  >
                    <MapPin className="h-5 w-5" />
                  </Link>
                ))
              ) : (
                <div className="uc-map-empty">
                  <MapPin className="h-8 w-8" />
                  <span>Konumlu bildirimin henüz yok.</span>
                </div>
              )}
            </div>
          </motion.article>

          <motion.article className="uc-dashboard-panel" id="reports" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={panelReveal}>
            <div className="uc-dashboard-panel-head">
              <div>
                <h2>Raporlarım</h2>
                <p>Hesabına bağlı en güncel kayıtlar.</p>
              </div>
              {hasMoreReports ? (
                <Link
                  to="/reports"
                  className="uc-link-button"
                  style={{ color: "var(--uc-mint)", fontWeight: 800, whiteSpace: "nowrap" }}
                >
                  Tüm raporlarım →
                </Link>
              ) : null}
            </div>

            <div className="uc-dashboard-report-list">
              {loadingReports ? (
                <div className="uc-empty-state">Bildirimlerin yükleniyor...</div>
              ) : displayedReports.length ? (
                displayedReports.map((report) => (
                  <Link to={`/report/${report.id}`} className="uc-dashboard-report" key={report.id}>
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
                    <span className="uc-dashboard-report-main">
                      <strong>{reportTypeLabel(report.report_type)}</strong>
                      <small>{getLocationLabel(report)}</small>
                    </span>
                    <span className="uc-dashboard-report-side">
                      <b className={`uc-pill ${getPillClass(report)}`}>{getDisplayStatus(report)}</b>
                      <small>{new Date(report.created_at || Date.now()).toLocaleDateString()}</small>
                    </span>
                  </Link>
                ))
              ) : (
                <div className="uc-empty-state">
                  Henüz bildirimin yok. İlk kaydını oluşturduğunda bu alanda durumunu takip edeceksin.
                </div>
              )}
            </div>
          </motion.article>
        </section>

        <motion.section className="uc-dashboard-timeline" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.24 }} variants={revealContainer}>
          <motion.article className="uc-dashboard-panel" variants={panelReveal}>
            <div className="uc-dashboard-panel-head">
              <div>
                <h2>Süreç dağılımı</h2>
                <p>Bildirimlerinin hangi aşamada olduğunu buradan görebilirsin.</p>
              </div>
            </div>
            <div className="uc-status-bars">
              <StatusBar label="İnceleniyor" value={pendingReports + inProgressReports} total={Math.max(totalReports, 1)} tone="gold" />
              <StatusBar label="Onaylandı" value={approvedReports} total={Math.max(totalReports, 1)} tone="mint" />
              <StatusBar label="Çözüldü" value={resolvedReports} total={Math.max(totalReports, 1)} tone="blue" />
            </div>
          </motion.article>
        </motion.section>
      </div>
    </main>
  );
}

function StatusBar({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const width = Math.max(3, Math.min(100, Math.round((value / total) * 100)));
  return (
    <div className="uc-status-bar">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <i>
        <b className={tone} style={{ width: `${width}%` }} />
      </i>
    </div>
  );
}

function ProcessCard({ icon: Icon, number, title, text }: { icon: any; number: string; title: string; text: string }) {
  return (
    <motion.article className="uc-step-card" variants={panelReveal}>
      <div className="uc-step-number">
        <div className="uc-step-icon">
          <Icon className="h-7 w-7" />
        </div>
        <span>{number}</span>
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
    </motion.article>
  );
}
