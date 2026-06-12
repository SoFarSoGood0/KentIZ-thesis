import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import kentizLogo from "../../assets/logo-lockup.png";

const slides = [
  {
    title: "Kentİz'e Hoş Geldiniz",
    desc: "Çevrendeki yol çukuru, çöp yığını veya bozuk kaldırım gibi altyapı sorunlarını fotoğraflayarak belediye yetkililerine bildirmenizi sağlayan platformdur.",
  },
  {
    title: "Yapay zeka analiz eder",
    desc: "Fotoğrafınızı yükleyin; AI sistemi sorunu otomatik tanımlar, kategorize eder ve öncelik puanı atar. Konumunuz rapora otomatik eklenir.",
  },
  {
    title: "Her adımı takip edin",
    desc: "Hesabınıza giriş yaptıktan sonra bildirimin inceleme, onaylanma ve çözüm süreçlerini gerçek zamanlı olarak izleyebilirsiniz.",
  },
] as const;

type Props = { onClose: () => void };

export function WelcomeTour({ onClose }: Props) {
  const [page, setPage] = useState(0);
  const isLast = page === slides.length - 1;

  const next = () => {
    if (isLast) onClose();
    else setPage((p) => p + 1);
  };

  const { title, desc } = slides[page];

  return (
    <div
      className="uc-modal-backdrop"
      style={{ zIndex: 9999 }}
      onClick={(e) => e.currentTarget === e.target && onClose()}
    >
      <motion.div
        className="uc-auth-modal uc-tour-modal"
        style={{ maxWidth: 380, padding: "28px 28px 24px", position: "relative" }}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <button
          type="button"
          className="uc-modal-close"
          onClick={onClose}
          aria-label="Kapat"
        >
          <X className="mx-auto h-5 w-5" />
        </button>

        {/* Logo — navbar ile aynı dosya ve boyut */}
        <div style={{ marginBottom: 28 }}>
          <img src={kentizLogo} alt="Kentİz" className="uc-brand-logo" />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <h3 className="uc-tour-title" style={{ fontSize: 19, fontWeight: 700, margin: "0 0 10px", lineHeight: 1.3 }}>
              {title}
            </h3>
            <p className="uc-tour-desc" style={{ fontSize: 14, margin: 0, lineHeight: 1.6 }}>
              {desc}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Dots */}
        <div style={{ display: "flex", gap: 6, margin: "24px 0 20px" }}>
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Slayt ${i + 1}`}
              onClick={() => setPage(i)}
              style={{
                height: 6,
                width: i === page ? 22 : 6,
                borderRadius: 99,
                background: i === page ? "var(--uc-tour-dot-active, #5eead4)" : "var(--uc-tour-dot-idle, rgba(255,255,255,0.18))",
                border: "none",
                padding: 0,
                cursor: "pointer",
                transition: "width 0.3s ease, background 0.3s ease",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {!isLast && (
            <button
              type="button"
              className="uc-button uc-button-ghost"
              style={{ flex: 1 }}
              onClick={onClose}
            >
              Geç
            </button>
          )}
          <button
            type="button"
            className="uc-button uc-button-primary"
            style={{ flex: 2 }}
            onClick={next}
          >
            {isLast ? "Başla" : "Devam Et"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
