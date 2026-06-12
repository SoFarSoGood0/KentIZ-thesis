import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router";
import Lenis from "lenis";
import { WelcomeTour } from "./WelcomeTour";
import { ThemeToggle } from "./ThemeToggle";
import { Bell, ChevronDown, ClipboardList, LifeBuoy, LogOut, PlusCircle, Settings, ShieldCheck, UserRound, X } from "lucide-react";
import kentizLogo from "../../assets/logo-lockup.png";
import {
  clearStoredCitizenSession,
  confirmCitizenPasswordReset,
  getCitizenMe,
  getStoredCitizenEmail,
  getStoredCitizenId,
  getStoredCitizenName,
  getStoredCitizenToken,
  loginCitizen,
  registerCitizen,
  requestCitizenPasswordReset,
  setStoredCitizenSession,
  verifyCitizen,
} from "../lib/api";

type AuthMode = "login" | "register" | "verify" | "forgot" | "reset";

export type CitizenSession = {
  token: string;
  user_id: number;
  email: string;
  full_name: string;
};

export type CitizenOutletContext = {
  session: CitizenSession | null;
  openAuth: (mode?: AuthMode) => void;
};

function readStoredSession(): CitizenSession | null {
  const token = getStoredCitizenToken();
  if (!token) return null;
  return {
    token,
    user_id: getStoredCitizenId(),
    email: getStoredCitizenEmail(),
    full_name: getStoredCitizenName() || "Vatandaş",
  };
}

function KentizBrand() {
  return <img src={kentizLogo} alt="Kentİz" className="uc-brand-logo" />;
}

function getAuthTitle(mode: AuthMode) {
  if (mode === "login") return "Hesabına giriş yap";
  if (mode === "register") return "Kentİz hesabı oluştur";
  if (mode === "forgot") return "Şifreni sıfırla";
  if (mode === "reset") return "Yeni şifre belirle";
  return "E-postanı doğrula";
}

function getAuthDescription(mode: AuthMode) {
  if (mode === "login") return "Raporlarını takip etmek ve yeni bildirim oluşturmak için devam et.";
  if (mode === "register") return "Bildirimlerini hesabına bağlamak için kısa kayıt formunu tamamla.";
  if (mode === "forgot") return "Kayıtlı e-posta adresine 6 haneli sıfırlama kodu gönderelim.";
  if (mode === "reset") return "E-postana gelen kodu gir ve yeni şifreni oluştur.";
  return "E-posta adresine gönderilen 6 haneli kodu gir.";
}

export function CitizenLayout() {
  const navigate = useNavigate();
  const lenisRef = useRef<Lenis | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<CitizenSession | null>(() => readStoredSession());
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeModal, setActiveModal] = useState<"notif" | "account" | "support" | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("uc_notif_prefs") || "{}"); } catch { return {}; }
  });
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [showTour, setShowTour] = useState(true);

  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.08,
      wheelMultiplier: 0.9,
      smoothWheel: true,
    });
    lenisRef.current = lenis;
    let frameId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frameId = requestAnimationFrame(raf);
    };
    frameId = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(frameId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  const scrollToSection = (hash: string) => {
    const scroll = () => {
      if (lenisRef.current) {
        lenisRef.current.scrollTo(hash, { offset: -92 });
        return;
      }
      document.querySelector(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    if (window.location.pathname !== "/") {
      navigate(`/${hash}`);
      window.setTimeout(scroll, 80);
      return;
    }
    scroll();
  };

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!getStoredCitizenToken()) return;
    getCitizenMe()
      .then((me) => {
        const nextSession = { token: me.token || getStoredCitizenToken(), user_id: me.user_id, email: me.email, full_name: me.full_name };
        setStoredCitizenSession(nextSession);
        setSession(nextSession);
      })
      .catch(() => {
        clearStoredCitizenSession();
        setSession(null);
      });
  }, []);

  const openAuth = (mode: AuthMode = "login") => {
    setAuthMode(mode);
    setAuthOpen(true);
    setAuthError("");
    setAuthMessage("");
  };

  const closeAuth = () => {
    setAuthOpen(false);
    setAuthError("");
  };

  const saveSession = (nextSession: CitizenSession) => {
    setStoredCitizenSession(nextSession);
    setSession(nextSession);
    setAuthOpen(false);
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setAuthError("");
    setAuthMessage("");
    try {
      const nextSession = await loginCitizen(email.trim(), password);
      saveSession(nextSession);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Giriş yapılamadı.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setAuthError("");
    setAuthMessage("");
    try {
      const result = await registerCitizen(fullName.trim(), email.trim(), password);
      setPendingEmail(result.email);
      setAuthMode("verify");
      setAuthMessage(result.development_code ? `${result.message} Kod: ${result.development_code}` : result.message);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Kayıt oluşturulamadı.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setAuthError("");
    try {
      const nextSession = await verifyCitizen((pendingEmail || email).trim(), verificationCode.trim());
      saveSession(nextSession);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Doğrulama tamamlanamadı.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordResetRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setAuthError("");
    setAuthMessage("");
    try {
      const result = await requestCitizenPasswordReset(email.trim());
      setPendingEmail(result.email);
      setVerificationCode("");
      setNewPassword("");
      setAuthMode("reset");
      setAuthMessage(result.development_code ? `${result.message} Kod: ${result.development_code}` : result.message);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Şifre sıfırlama kodu gönderilemedi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordResetConfirm = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setAuthError("");
    try {
      const nextSession = await confirmCitizenPasswordReset((pendingEmail || email).trim(), verificationCode.trim(), newPassword);
      setPassword("");
      setNewPassword("");
      saveSession(nextSession);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Şifre sıfırlanamadı.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    clearStoredCitizenSession();
    setSession(null);
    setProfileMenuOpen(false);
  };

  const toggleNotifPref = (key: string, defaultVal = true) => {
    const next = { ...notifPrefs, [key]: !(notifPrefs[key] ?? defaultVal) };
    setNotifPrefs(next);
    localStorage.setItem("uc_notif_prefs", JSON.stringify(next));
  };

  return (
    <div className="uc-public-shell">
      <div className="uc-grain" />
      <div className="uc-nav-wrap">
        <nav className="uc-nav">
          <Link to="/" className="uc-brand">
            <KentizBrand />
          </Link>
          <div className="uc-nav-links">
            {session ? (
              <>
                <Link to="/">Ana Sayfa</Link>
                <Link to="/upload">Bildir</Link>
                <a
                  href="/#reports"
                  onClick={(event) => {
                    event.preventDefault();
                    scrollToSection("#reports");
                  }}
                >
                  Raporlarım
                </a>
                <a
                  href="/#map"
                  onClick={(event) => {
                    event.preventDefault();
                    scrollToSection("#map");
                  }}
                >
                  Harita
                </a>
              </>
            ) : (
              <>
                <a
                  href="/#how"
                  onClick={(event) => {
                    event.preventDefault();
                    scrollToSection("#how");
                  }}
                >
                  Süreç
                </a>
                <a
                  href="/#report"
                  onClick={(event) => {
                    event.preventDefault();
                    scrollToSection("#report");
                  }}
                >
                  Bildirim
                </a>
              </>
            )}
          </div>
          <div className="uc-nav-actions">
            <ThemeToggle />
            {session ? (
              <div className="uc-profile-wrap" ref={profileMenuRef}>
                <button
                  type="button"
                  className="uc-profile-trigger"
                  onClick={() => setProfileMenuOpen((value) => !value)}
                  aria-expanded={profileMenuOpen}
                  aria-label="Profil menüsü"
                >
                  <span>
                    <UserRound className="h-5 w-5" />
                  </span>
                  <ChevronDown className="h-4 w-4" />
                </button>
                {profileMenuOpen ? (
                  <div className="uc-profile-dropdown">
                    <div className="uc-profile-head">
                      <span>
                        <UserRound className="h-6 w-6" />
                      </span>
                      <div>
                        <strong>{session.full_name}</strong>
                        <small>{session.email}</small>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        scrollToSection("#top");
                      }}
                    >
                      <UserRound className="h-4 w-4" />
                      Profilim
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        scrollToSection("#reports");
                      }}
                    >
                      <ClipboardList className="h-4 w-4" />
                      Raporlarım
                    </button>
                    <Link to="/upload" onClick={() => setProfileMenuOpen(false)}>
                      <PlusCircle className="h-4 w-4" />
                      Yeni Bildirim
                    </Link>
                    <button type="button" onClick={() => { setProfileMenuOpen(false); setActiveModal("notif"); }}>
                      <Bell className="h-4 w-4" />
                      Bildirim Tercihleri
                    </button>
                    <button type="button" onClick={() => { setProfileMenuOpen(false); setActiveModal("account"); }}>
                      <Settings className="h-4 w-4" />
                      Hesap Ayarları
                    </button>
                    <button type="button" onClick={() => { setProfileMenuOpen(false); setActiveModal("support"); }}>
                      <LifeBuoy className="h-4 w-4" />
                      Destek
                    </button>
                    <button type="button" className="danger" onClick={handleLogout}>
                      <LogOut className="h-4 w-4" />
                      Oturumu Kapat
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <button type="button" className="uc-button uc-button-ghost" onClick={() => openAuth("login")}>
                  Giriş Yap
                </button>
                <button type="button" className="uc-button uc-button-primary" onClick={() => openAuth("register")}>
                  Kayıt Ol
                </button>
              </>
            )}
          </div>
        </nav>
      </div>

      <Outlet context={{ session, openAuth } satisfies CitizenOutletContext} />

      <footer className="uc-footer">
        <div className="uc-container flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="uc-brand">
            <KentizBrand />
          </div>
          <Link to="/admin/login" className="text-sm font-semibold text-slate-400 transition-colors hover:text-white">
            Yönetici girişi
          </Link>
        </div>
      </footer>

      {showTour ? <WelcomeTour onClose={() => setShowTour(false)} /> : null}

      {activeModal ? (
        <div className="uc-modal-backdrop" onClick={(e) => e.currentTarget === e.target && setActiveModal(null)}>
          <div className="uc-auth-modal">
            <button type="button" className="uc-modal-close" onClick={() => setActiveModal(null)} aria-label="Kapat">
              <X className="mx-auto h-5 w-5" />
            </button>

            {activeModal === "notif" ? (
              <>
                <div className="uc-modal-title">
                  <h3>Bildirim Tercihleri</h3>
                  <p>Bu tarayıcıya kaydedilen tercihler.</p>
                </div>
                <div className="flex flex-col gap-3" style={{ marginTop: 20 }}>
                  {([
                    { key: "status_updates", label: "Durum güncellemeleri", hint: "Raporun durumu değiştiğinde bildirim al", def: true },
                    { key: "resolved_alerts", label: "Çözüm bildirimleri", hint: "Sorun çözüldüğünde bilgilendir", def: true },
                  ] as const).map(({ key, label, hint, def }) => (
                    <div key={key} className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-white">{label}</p>
                        <p className="text-xs text-slate-400">{hint}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={notifPrefs[key] ?? def}
                        onClick={() => toggleNotifPref(key, def)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${(notifPrefs[key] ?? def) ? "bg-teal-500" : "bg-white/20"}`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${(notifPrefs[key] ?? def) ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 opacity-50">
                    <div>
                      <p className="text-sm font-medium text-white">E-posta bildirimleri</p>
                      <p className="text-xs text-slate-400">Yakında kullanılabilir olacak</p>
                    </div>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-slate-400">Yakında</span>
                  </div>
                </div>
                <div className="uc-note" style={{ marginTop: 16 }}>
                  <ShieldCheck className="h-4 w-4 shrink-0 text-teal-300" />
                  <span>Tercihler yalnızca bu tarayıcıda geçerlidir.</span>
                </div>
              </>
            ) : activeModal === "account" ? (
              <>
                <div className="uc-modal-title">
                  <h3>Hesap Ayarları</h3>
                  <p>Hesap bilgilerin ve güvenlik seçeneklerin.</p>
                </div>
                <div className="flex flex-col gap-3" style={{ marginTop: 20 }}>
                  {[
                    { label: "Ad Soyad", value: session?.full_name || "—" },
                    { label: "E-posta", value: session?.email || "—" },
                    { label: "Hesap Türü", value: "Vatandaş" },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                      <p className="mt-1 text-sm text-white">{value}</p>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="uc-button uc-button-ghost w-full"
                  style={{ marginTop: 16 }}
                  onClick={() => { setActiveModal(null); openAuth("forgot"); }}
                >
                  Şifreyi Değiştir
                </button>
                <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 opacity-50" style={{ marginTop: 12 }}>
                  <p className="text-sm font-medium text-white">Hesabı Sil</p>
                  <p className="mt-0.5 text-xs text-slate-400">Yakında kullanılabilir olacak</p>
                </div>
              </>
            ) : activeModal === "support" ? (
              <>
                <div className="uc-modal-title">
                  <h3>Destek</h3>
                  <p>Sık sorulan sorular ve iletişim.</p>
                </div>
                <div className="flex flex-col gap-2" style={{ marginTop: 20 }}>
                  {([
                    { q: "Bildirim nasıl gönderebilirim?", a: "Üst menüden 'Bildir' seçeneğine tıkla, fotoğraf yükle ve kategorini seç. Yapay zeka fotoğrafını otomatik analiz eder ve öncelik puanı atar." },
                    { q: "Raporumun durumunu nasıl takip ederim?", a: "Giriş yaptıktan sonra 'Raporlarım' bölümünden tüm bildirimlerini ve güncel durumlarını görebilirsin." },
                    { q: "Raporumu kimler görüyor?", a: "Raporlar ilgili belediye yetkililerine iletilir. Adın ve kişisel bilgilerin yetkililere gösterilmez; raporlar anonim olarak işlenir." },
                    { q: "Yanıt ne kadar sürede gelir?", a: "Belediye önceliğe göre değerlendirir. Kritik sorunlar genellikle 24-48 saat içinde sahaya atanır." },
                  ] as const).map((item, i) => (
                    <div key={i} className="rounded-lg border border-white/10 bg-white/5">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                      >
                        <span className="text-sm font-medium text-white">{item.q}</span>
                        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${faqOpen === i ? "rotate-180" : ""}`} />
                      </button>
                      {faqOpen === i ? (
                        <p className="px-4 pb-3 text-sm text-slate-400">{item.a}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center" style={{ marginTop: 16 }}>
                  <p className="text-sm text-slate-400">Sorun mu var? Bize ulaşın:</p>
                  <a href="mailto:destek@kentiz.net" className="mt-1 block text-sm font-semibold text-teal-300 hover:text-teal-200">
                    destek@kentiz.net
                  </a>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {authOpen ? (
        <div className="uc-modal-backdrop" onClick={(event) => event.currentTarget === event.target && closeAuth()}>
          <div className="uc-auth-modal">
            <button type="button" className="uc-modal-close" onClick={closeAuth} aria-label="Kapat">
              <X className="mx-auto h-5 w-5" />
            </button>
            <div className="uc-brand">
              <KentizBrand />
            </div>
            <div className="uc-modal-title">
              <h3>{getAuthTitle(authMode)}</h3>
              <p>
                {getAuthDescription(authMode)}
              </p>
            </div>

            {authMode !== "verify" && authMode !== "forgot" && authMode !== "reset" ? (
              <div className="uc-modal-tabs">
                <button type="button" className={`uc-modal-tab ${authMode === "login" ? "is-active" : ""}`} onClick={() => setAuthMode("login")}>
                  Giriş
                </button>
                <button type="button" className={`uc-modal-tab ${authMode === "register" ? "is-active" : ""}`} onClick={() => setAuthMode("register")}>
                  Kayıt
                </button>
              </div>
            ) : null}

            {authMode === "login" ? (
              <form onSubmit={handleLogin}>
                <div className="uc-field">
                  <label>E-posta</label>
                  <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ornek@mail.com" />
                </div>
                <div className="uc-field">
                  <label>Şifre</label>
                  <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" />
                </div>
                <button
                  type="button"
                  className="uc-auth-link"
                  onClick={() => {
                    setAuthMode("forgot");
                    setAuthError("");
                    setAuthMessage("");
                  }}
                >
                  Şifremi unuttum
                </button>
                {authError ? <div className="uc-status-error mb-3">{authError}</div> : null}
                <button type="submit" className="uc-button uc-button-primary w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Giriş yapılıyor..." : "Giriş Yap"}
                </button>
              </form>
            ) : null}

            {authMode === "forgot" ? (
              <form onSubmit={handlePasswordResetRequest}>
                <div className="uc-field">
                  <label>E-posta</label>
                  <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ornek@mail.com" />
                </div>
                {authError ? <div className="uc-status-error mb-3">{authError}</div> : null}
                <button type="submit" className="uc-button uc-button-primary w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Kod gönderiliyor..." : "Sıfırlama Kodu Gönder"}
                </button>
                <button type="button" className="uc-auth-link center" onClick={() => setAuthMode("login")}>
                  Giriş ekranına dön
                </button>
              </form>
            ) : null}

            {authMode === "reset" ? (
              <form onSubmit={handlePasswordResetConfirm}>
                {authMessage ? <div className="uc-status-success mb-3">{authMessage}</div> : null}
                <div className="uc-field">
                  <label>Sıfırlama kodu</label>
                  <input required inputMode="numeric" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} placeholder="000000" />
                </div>
                <div className="uc-field">
                  <label>Yeni şifre</label>
                  <input type="password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="En az 8 karakter" />
                </div>
                {authError ? <div className="uc-status-error mb-3">{authError}</div> : null}
                <button type="submit" className="uc-button uc-button-primary w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Şifre güncelleniyor..." : "Şifreyi Güncelle"}
                </button>
                <button type="button" className="uc-auth-link center" onClick={() => setAuthMode("forgot")}>
                  Yeni kod al
                </button>
              </form>
            ) : null}

            {authMode === "register" ? (
              <form onSubmit={handleRegister}>
                <div className="uc-field">
                  <label>Ad soyad</label>
                  <input required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Adınız Soyadınız" />
                </div>
                <div className="uc-field">
                  <label>E-posta</label>
                  <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ornek@mail.com" />
                </div>
                <div className="uc-field">
                  <label>Şifre</label>
                  <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Güçlü bir şifre" />
                </div>
                {authError ? <div className="uc-status-error mb-3">{authError}</div> : null}
                <button type="submit" className="uc-button uc-button-primary w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Kayıt oluşturuluyor..." : "Kayıt Ol"}
                </button>
              </form>
            ) : null}

            {authMode === "verify" ? (
              <form onSubmit={handleVerify}>
                {authMessage ? <div className="uc-status-success mb-3">{authMessage}</div> : null}
                <div className="uc-field">
                  <label>Doğrulama kodu</label>
                  <input required inputMode="numeric" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} placeholder="000000" />
                </div>
                {authError ? <div className="uc-status-error mb-3">{authError}</div> : null}
                <button type="submit" className="uc-button uc-button-primary w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Doğrulanıyor..." : "Doğrula ve Devam Et"}
                </button>
              </form>
            ) : null}

            <div className="uc-note">
              <ShieldCheck className="h-4 w-4 shrink-0 text-teal-300" />
              <span>Giriş yaptıktan sonra gönderdiğin bildirimler hesabına bağlanır ve bildirimlerin arasında görünür.</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
