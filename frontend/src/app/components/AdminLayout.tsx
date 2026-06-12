import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";

export interface AdminOutletContext {
  reportSearch: string;
}
import {
  AlertTriangle, Bell, CheckCircle2, ChevronDown, Clock,
  FileText, LayoutDashboard, LogOut, Search,
  Settings, ShieldCheck, Users, X,
} from "lucide-react";
import kentizLogo from "../../assets/logo-lockup.png";
import {
  API_BASE,
  clearStoredAdminSession,
  getAdminMe,
  getAdminNotifications,
  getAdminSummary,
  getStoredAdminRole,
  getStoredAdminToken,
  getStoredAdminUser,
  markAdminNotificationsSeen,
} from "../lib/api";
import { interventionStatusLabel, reportStatusLabel, reportTypeLabel } from "../lib/labels";
import { ThemeToggle } from "./ThemeToggle";

const STATUS_WORD_MAP: Record<string, string> = {
  approved: "Onaylandı", rejected: "Reddedildi",
  in_review: "İncelemede", "in review": "İncelemede",
  pending_review: "İnceleme bekliyor", "pending review": "İnceleme bekliyor",
  resolved: "Çözüldü", assigned: "Atandı",
  in_progress: "İşlemde", "in progress": "İşlemde",
  pending_dispatch: "Atama bekliyor", "pending dispatch": "Atama bekliyor",
};
function turkishifyMessage(msg: string): string {
  return msg.replace(/\b(approved|rejected|in_review|in review|pending_review|pending review|resolved|assigned|in_progress|in progress|pending_dispatch|pending dispatch)\b/gi,
    (m) => STATUS_WORD_MAP[m.toLowerCase()] ?? m);
}

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sessionName, setSessionName] = useState(getStoredAdminUser() || "Yönetici");
  const [sessionDisplayName, setSessionDisplayName] = useState(getStoredAdminUser() || "Yönetici");
  const [sessionRole, setSessionRole] = useState(getStoredAdminRole() || "misafir");
  const [sessionScope, setSessionScope] = useState("");
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [approvedCount, setApprovedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);

  type NavItem = { name: string; path: string | null; search?: string; icon: any; disabled?: boolean; count?: number };
  const navItems: NavItem[] = [
    { name: "Genel Bakış", path: "/admin", icon: LayoutDashboard },
    { name: "Rapor Kuyruğu", path: "/admin/reports", icon: FileText },
    { name: "Ekip Atamaları", path: "/admin/teams", icon: Users },
    { name: "Onaylananlar", path: "/admin/reports", search: "status=approved", icon: CheckCircle2, count: approvedCount },
    { name: "Reddedilenler", path: "/admin/reports", search: "status=rejected", icon: X, count: rejectedCount },
    { name: "Kanıt Kayıtları", path: "/admin/verification", icon: ShieldCheck },
    { name: "Ayarlar", path: "/admin/settings", icon: Settings },
  ];

  const currentItem =
    navItems.find((item) => {
      if (!item.path) return false;
      const pathMatch = location.pathname === item.path || (item.path !== "/admin" && location.pathname.startsWith(item.path));
      if (!pathMatch) return false;
      if (item.search) return location.search === `?${item.search}`;
      return !item.search;
    }) ||
    navItems.find((item) => item.path && (location.pathname === item.path || (item.path !== "/admin" && location.pathname.startsWith(item.path)))) ||
    navItems[0];

  useEffect(() => {
    let active = true;
    if (!getStoredAdminToken()) {
      navigate("/admin/login");
      return;
    }

    getAdminMe()
      .then((me) => {
        setSessionName(me.username);
        setSessionRole(me.role);
        const province = String(me.province_scope || "").trim();
        const district = Array.isArray(me.district_scopes) ? me.district_scopes.filter(Boolean).join(", ") : "";
        setSessionDisplayName(province ? `${province} Admini` : me.username);
        setSessionScope([province, district].filter(Boolean).join(" / "));
      })
      .catch(() => {
        clearStoredAdminSession();
        navigate("/admin/login");
      });

    const loadNotifications = async () => {
      try {
        const data = await getAdminNotifications(8);
        if (!active) return;
        setNotifications(data.notifications || []);
        setUnreadCount(Number(data.unread_count || 0));
      } catch {
        if (!active) return;
      }
    };

    const loadCounts = async () => {
      try {
        const summary = await getAdminSummary();
        if (!active) return;
        const byStatus = summary?.reports_by_status || {};
        setApprovedCount(Number(byStatus.approved ?? 0));
        setRejectedCount(Number(byStatus.rejected ?? 0));
      } catch {
        if (!active) return;
      }
    };

    loadNotifications();
    loadCounts();
    const interval = window.setInterval(loadNotifications, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [navigate]);

  useEffect(() => {
    if (!notificationsOpen) return;
    markAdminNotificationsSeen()
      .then(() => setUnreadCount(0))
      .catch(() => undefined);
  }, [notificationsOpen]);

  // Aramayi rapor kuyrugu disina cikinca sifirla.
  useEffect(() => {
    if (location.pathname !== "/admin/reports") setReportSearch("");
  }, [location.pathname]);

  const handleSignOut = async () => {
    try {
      const token = getStoredAdminToken();
      if (token) {
        await fetch(`${API_BASE}/admin/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      undefined;
    } finally {
      clearStoredAdminSession();
      navigate("/admin/login");
    }
  };

  return (
    <div className="admin-premium">
      <div className="uc-grain" />
      <aside className="admin-sidebar">
        <div>
          {/* Brand */}
          <Link to="/admin" className="ktz-brand-lockup">
            <img src={kentizLogo} alt="Kentİz" className="ktz-brand-logo-img" />
            <span className="ktz-brand-subtitle">YÖNETİM MERKEZİ</span>
          </Link>

          {/* Nav */}
          <nav className="ktz-nav-list">
            {navItems.map((item) => {
              const Icon = item.icon;
              const pathMatch = item.path
                ? location.pathname === item.path || (item.path !== "/admin" && location.pathname.startsWith(item.path))
                : false;
              const isActive = pathMatch && (item.search ? location.search === `?${item.search}` : !location.search || !navItems.some((o) => o.search && location.search === `?${o.search}`));
              if (item.disabled) {
                return (
                  <span key={item.name} className="ktz-nav-item ktz-nav-disabled">
                    <Icon size={16} /><span>{item.name}</span>
                  </span>
                );
              }
              return (
                <Link
                  key={item.name}
                  to={item.search ? { pathname: item.path!, search: item.search } : item.path!}
                  className={`ktz-nav-item${isActive ? " active" : ""}`}
                >
                  <Icon size={16} />
                  <span>{item.name}</span>
                  {item.count !== undefined && item.count > 0 ? (
                    <span className="ktz-nav-badge">{item.count > 99 ? "99+" : item.count}</span>
                  ) : null}
                </Link>
              );
            })}
            <button type="button" onClick={handleSignOut} className="ktz-nav-item ktz-nav-logout">
              <LogOut size={16} /><span>Çıkış yap</span>
            </button>
          </nav>
        </div>

        {/* Sidebar bottom */}
        <div className="ktz-sidebar-bottom">
          <div className="ktz-profile-card">
            <div className="ktz-avatar-ring"><img src="/belediyelogo.jpg" alt="Belediye" /></div>
            <div className="min-w-0">
              <strong>{sessionDisplayName}</strong>
              <span>{sessionRole}</span>
              {sessionScope ? <small className="ktz-scope">{sessionScope}</small> : null}
            </div>
            <ChevronDown size={13} className="ktz-chevron" />
          </div>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div style={{ flex: 1 }}>
            <h1>{currentItem.name}</h1>
          </div>
          {location.pathname === "/admin/reports" && !location.search.startsWith("?status=") ? (
            <div className="admin-topbar-search">
              <div className="admin-topbar-search-box">
                <button
                  type="button"
                  className="admin-topbar-search-icon"
                  onClick={() => (reportSearch ? setReportSearch("") : searchInputRef.current?.focus())}
                  aria-label={reportSearch ? "Aramayı temizle" : "Ara"}
                >
                  {reportSearch ? <X style={{ width: 15, height: 15 }} /> : <Search style={{ width: 15, height: 15 }} />}
                </button>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Rapor ara... (ID, kategori, konum)"
                  className="admin-topbar-search-input"
                  value={reportSearch}
                  onChange={(e) => setReportSearch(e.target.value)}
                />
              </div>
            </div>
          ) : null}
          <div className="admin-top-actions">
            <ThemeToggle />
            <div className="admin-topbar-user">
              <div className="admin-avatar-sm"><img src="/belediyelogo.jpg" alt="Belediye" /></div>
              <span>{sessionDisplayName}</span>
            </div>
            <button type="button" onClick={() => setNotificationsOpen((value) => !value)} className="admin-ghost-btn relative inline-flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Bildirimler
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </button>

            {notificationsOpen ? (
              <div className="admin-notification-menu">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Bildirimler</p>
                    <p className="text-xs text-slate-400">{notifications.length} kayıt</p>
                  </div>
                  <button type="button" onClick={() => setNotificationsOpen(false)} className="p-1 text-slate-400 hover:text-white">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-[24rem] divide-y divide-white/10 overflow-y-auto">
                  {notifications.length ? (
                    notifications.map((item) => (
                      <Link
                        key={item.id}
                        to={item.report_id ? `/admin/reports/${item.report_id}` : "/admin"}
                        onClick={() => setNotificationsOpen(false)}
                        className="block px-4 py-3 transition-colors hover:bg-white/5"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {item.type === "new_report" ? (
                              <AlertTriangle className="h-4 w-4 text-amber-300" />
                            ) : item.type === "report_status" ? (
                              <Clock className="h-4 w-4 text-cyan-300" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-medium text-white">{item.title}</p>
                              <span className="shrink-0 text-[10px] text-slate-500">
                                {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-slate-300">{turkishifyMessage(item.message)}</p>
                            {item.report_id ? (
                              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-slate-200">
                                #{item.report_id} · {reportStatusLabel(item.payload?.status || "pending_review")}
                                {item.payload?.intervention_status ? ` · ${interventionStatusLabel(item.payload.intervention_status)}` : ""}
                                {item.payload?.report_type ? ` · ${reportTypeLabel(item.payload.report_type)}` : ""}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="px-4 py-8 text-center text-sm text-slate-400">Şimdilik bildirim yok</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </header>
        <div className="admin-content">
          <Outlet context={{ reportSearch } satisfies AdminOutletContext} />
        </div>
      </main>
    </div>
  );
}
