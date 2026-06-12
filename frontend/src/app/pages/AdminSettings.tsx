import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  BellOff,
  CheckCircle2,
  Cpu,
  Globe,
  KeyRound,
  Moon,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import { API_BASE, fetchJson, getAdminMe } from "../lib/api";

const NOTIF_PREFS_KEY = "ktz_notif_prefs";
const DEFAULT_PREFS = { new_report: true, report_status: true, intervention_status: true };

function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(NOTIF_PREFS_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}
function savePrefs(prefs: typeof DEFAULT_PREFS) {
  localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs));
}

export function AdminSettings() {
  const [me, setMe] = useState<{ username: string; role: string; province_scope?: string | null; district_scopes?: string[] } | null>(null);
  const [prefs, setPrefs] = useState(loadPrefs());
  const [health, setHealth] = useState<{ status: string; model: string } | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    getAdminMe().then(setMe).catch(() => undefined);
    fetch(`${API_BASE}/health`)
      .then((r) => r.json())
      .then((d) => setHealth(d))
      .catch(() => setHealth({ status: "error", model: "—" }))
      .finally(() => setHealthLoading(false));
  }, []);

  function togglePref(key: keyof typeof DEFAULT_PREFS) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    savePrefs(next);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  }

  const province = String(me?.province_scope || "").trim();
  const districtList = Array.isArray(me?.district_scopes) ? me.district_scopes.filter(Boolean) : [];
  const scopeLabel = [province, districtList.join(", ")].filter(Boolean).join(" / ") || "Tüm bölgeler";

  const serverOk = health?.status === "ok";

  return (
    <div className="grid gap-6 max-w-2xl">
      {savedFlash ? (
        <div className="admin-flash-message">Tercihler kaydedildi.</div>
      ) : null}

      {/* Hesap */}
      <div className="admin-panel">
        <div className="ktz-settings-section-header">
          <User size={15} className="text-cyan-400" />
          <h3>Hesap Bilgileri</h3>
        </div>
        <div className="grid gap-3 mt-4">
          <div className="ktz-settings-row">
            <span className="ktz-settings-label">Kullanıcı adı</span>
            <span className="ktz-settings-value">{me?.username ?? "—"}</span>
          </div>
          <div className="ktz-settings-row">
            <span className="ktz-settings-label">Rol</span>
            <span className="ktz-settings-value capitalize">{me?.role ?? "—"}</span>
          </div>
          <div className="ktz-settings-row">
            <span className="ktz-settings-label">Yetki kapsamı</span>
            <span className="ktz-settings-value">{me ? scopeLabel : "—"}</span>
          </div>
          <div className="ktz-settings-row">
            <span className="ktz-settings-label">Şifre değiştir</span>
            <span className="ktz-settings-soon">
              <KeyRound size={12} /> Yakında
            </span>
          </div>
        </div>
      </div>

      {/* Bildirimler */}
      <div className="admin-panel">
        <div className="ktz-settings-section-header">
          <Bell size={15} className="text-cyan-400" />
          <h3>Bildirim Tercihleri</h3>
          <span className="ktz-settings-hint">Değişiklikler bu tarayıcıya kaydedilir.</span>
        </div>
        <div className="grid gap-3 mt-4">
          <ToggleRow
            icon={<Activity size={14} />}
            label="Yeni raporlar"
            description="Vatandaştan yeni rapor geldiğinde bildir"
            value={prefs.new_report}
            onToggle={() => togglePref("new_report")}
          />
          <ToggleRow
            icon={<ShieldCheck size={14} />}
            label="Durum değişiklikleri"
            description="İnceleme onayı veya reddi bildirilsin"
            value={prefs.report_status}
            onToggle={() => togglePref("report_status")}
          />
          <ToggleRow
            icon={<CheckCircle2 size={14} />}
            label="Müdahale güncellemeleri"
            description="Ekip atama ve çözüm adımlarını takip et"
            value={prefs.intervention_status}
            onToggle={() => togglePref("intervention_status")}
          />
        </div>
      </div>

      {/* Görünüm */}
      <div className="admin-panel">
        <div className="ktz-settings-section-header">
          <Moon size={15} className="text-cyan-400" />
          <h3>Görünüm</h3>
        </div>
        <div className="grid gap-3 mt-4">
          <div className="ktz-settings-row">
            <span className="ktz-settings-label">Tema</span>
            <span className="ktz-settings-value flex items-center gap-1.5">
              <Moon size={12} className="text-slate-400" /> Karanlık mod
              <span className="ktz-settings-active-tag">Aktif</span>
            </span>
          </div>
          <div className="ktz-settings-row">
            <span className="ktz-settings-label">Arayüz dili</span>
            <span className="ktz-settings-value flex items-center gap-1.5">
              <Globe size={12} className="text-slate-400" /> Türkçe
              <span className="ktz-settings-active-tag">Aktif</span>
            </span>
          </div>
        </div>
      </div>

      {/* Sistem */}
      <div className="admin-panel">
        <div className="ktz-settings-section-header">
          <Cpu size={15} className="text-cyan-400" />
          <h3>Sistem Durumu</h3>
        </div>
        <div className="grid gap-3 mt-4">
          <div className="ktz-settings-row">
            <span className="ktz-settings-label">Sunucu</span>
            <span className="ktz-settings-value flex items-center gap-1.5">
              {healthLoading ? (
                <span className="text-slate-400">Kontrol ediliyor…</span>
              ) : serverOk ? (
                <><CheckCircle2 size={13} className="text-emerald-400" /><span className="text-emerald-300">Çevrimiçi</span></>
              ) : (
                <><XCircle size={13} className="text-red-400" /><span className="text-red-300">Ulaşılamıyor</span></>
              )}
            </span>
          </div>
          <div className="ktz-settings-row">
            <span className="ktz-settings-label">AI Modeli</span>
            <span className="ktz-settings-value font-mono text-xs">{health?.model ?? "—"}</span>
          </div>
          <div className="ktz-settings-row">
            <span className="ktz-settings-label">API Adresi</span>
            <span className="ktz-settings-value font-mono text-xs text-slate-400">{API_BASE}</span>
          </div>
          <div className="ktz-settings-row">
            <span className="ktz-settings-label">Versiyon</span>
            <span className="ktz-settings-value text-slate-400">KentİZ v1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  icon, label, description, value, onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="ktz-settings-toggle-row">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-slate-400">{icon}</span>
        <div>
          <p className="text-sm font-medium text-slate-200">{label}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`ktz-toggle${value ? " ktz-toggle-on" : ""}`}
        aria-pressed={value}
      >
        <span className="ktz-toggle-knob" />
      </button>
    </div>
  );
}
