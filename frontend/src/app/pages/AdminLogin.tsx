import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router";
import { Eye, KeyRound, Lock, Mail, ShieldCheck } from "lucide-react";
import kentizLogo from "../../assets/logo-transparent.png";
import adminBackground from "../../assets/background.png";
import {
  getAdminRemembered,
  getAdminSavedEmail,
  getStoredAdminToken,
  loginAdmin,
  setAdminRemember,
  setStoredAdminSession,
  verifyAdminLogin,
} from "../lib/api";
import "../../styles/kentiz-admin-login.css";

export function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lightsOff, setLightsOff] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe] = useState(getAdminRemembered);
  const navigate = useNavigate();

  useEffect(() => {
    if (getStoredAdminToken()) {
      navigate("/admin");
      return;
    }
    if (getAdminRemembered()) {
      const saved = getAdminSavedEmail();
      if (saved) setUsername(saved);
    }
  }, [navigate]);

  const toggleLight = () => setLightsOff((v) => !v);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      if (step === "code") {
        const session = await verifyAdminLogin(username.trim(), challengeId, verificationCode.trim());
        setStoredAdminSession(session.token, session.username, session.role);
        setAdminRemember(rememberMe, username.trim());
        navigate("/admin");
        return;
      }

      const result = await loginAdmin(username.trim(), password);
      if ("token" in result) {
        setStoredAdminSession(result.token, result.username, result.role);
        setAdminRemember(rememberMe, username.trim());
        navigate("/admin");
        return;
      }

      setChallengeId(result.challenge_id);
      setMaskedEmail(result.masked_email);
      setStep("code");
      setMessage(result.message || `${result.masked_email} adresine doğrulama kodu gönderildi.`);
      if (result.development_code) {
        setVerificationCode(result.development_code);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş yapılamadı.");
    } finally {
      setIsLoading(false);
    }
  };

  const resetVerification = () => {
    setStep("credentials");
    setVerificationCode("");
    setChallengeId("");
    setMaskedEmail("");
    setMessage("");
    setError("");
  };

  return (
    <main
      className={`kentiz-admin-login ${lightsOff ? "is-dark" : "is-lit"}`}
      style={{ backgroundImage: `url(${adminBackground})` }}
    >
      <div className="kentiz-admin-login__shade" />
      <div className="kentiz-admin-login__warm-glow" />

      <div className="kentiz-wall-switch-wrapper">
        <motion.button
          type="button"
          className={`kentiz-wall-switch ${lightsOff ? "is-off" : "is-on"}`}
          aria-label="Işığı aç veya kapat"
          onClick={toggleLight}
          whileTap={{ scale: 0.93 }}
          transition={{ type: "spring", stiffness: 500, damping: 18 }}
        >
          <span className="kentiz-wall-switch__plate" />
          <span className="kentiz-wall-switch__bezel" />
          <motion.span
            className="kentiz-wall-switch__face"
            whileTap={{ y: 2 }}
            transition={{ type: "spring", stiffness: 600, damping: 22 }}
          />
          <span className="kentiz-wall-switch__glow" />
        </motion.button>
      </div>

      <section className="kentiz-admin-card" aria-label="Kentİz yönetim paneli girişi">
        <div className="kentiz-admin-card__logo">
          <img src={kentizLogo} alt="Kentİz" />
        </div>

        <h1>Yönetim Paneli</h1>
        <p className="kentiz-admin-card__subtitle">
          <ShieldCheck size={18} />
          Güvenli yönetici erişimi
        </p>

        <form className="kentiz-admin-form" onSubmit={handleLogin}>
          <label className="kentiz-admin-field">
            <Mail className="kentiz-admin-field__icon" size={22} />
            <input
              type="email"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="E-posta"
              disabled={step === "code" || isLoading}
              autoComplete="email"
            />
          </label>

          {step === "credentials" ? (
            <label className="kentiz-admin-field">
              <Lock className="kentiz-admin-field__icon" size={22} />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Şifre"
                disabled={isLoading}
                autoComplete="current-password"
              />
              <button
                className="kentiz-admin-field__action"
                type="button"
                aria-label="Şifreyi göster veya gizle"
                onClick={() => setShowPassword((v) => !v)}
              >
                <Eye size={22} />
              </button>
            </label>
          ) : (
            <label className="kentiz-admin-field">
              <KeyRound className="kentiz-admin-field__icon" size={22} />
              <input
                className="kentiz-admin-code"
                required
                inputMode="numeric"
                maxLength={6}
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Doğrulama kodu"
                disabled={isLoading}
              />
            </label>
          )}

          {step === "credentials" ? (
            <div className="kentiz-admin-options">
              <button type="button" className="kentiz-admin-link">Şifremi unuttum</button>
            </div>
          ) : null}

          {message ? <div className="kentiz-admin-message is-success">{message}</div> : null}
          {error ? <div className="kentiz-admin-message is-error">{error}</div> : null}

          <button className="kentiz-admin-submit" type="submit" disabled={isLoading}>
            <span>{isLoading ? "Kontrol ediliyor..." : step === "credentials" ? "Giriş Yap" : "Doğrula ve Panele Gir"}</span>
            <span aria-hidden="true">→</span>
          </button>

          {step === "code" ? (
            <button type="button" className="kentiz-admin-secondary" onClick={resetVerification} disabled={isLoading}>
              E-postayı Değiştir
            </button>
          ) : null}
        </form>

        <div className="kentiz-admin-note">
          <span />
          <p>Vatandaş bildirimlerini incele, raporları doğrula ve ilgili belediye ekiplerine yönlendir.</p>
          <span />
        </div>
      </section>
    </main>
  );
}
