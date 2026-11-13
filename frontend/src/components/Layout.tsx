import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { api, type AppNotification } from "../api";
import { useAuth } from "../auth";
import { initials } from "../geo";
import { useI18n, type Key } from "../i18n";
import { Icon } from "./ui";
import "../app.css";

function useTheme() {
  const darkScheme = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  const read = () => {
    const forced = document.documentElement.dataset.theme;
    return forced ? forced === "dark" : !!darkScheme?.matches;
  };
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const on = () => setDark(read());
    darkScheme?.addEventListener("change", on);
    return () => darkScheme?.removeEventListener("change", on);
  }, []);
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("festride-theme", next); } catch { /* storage blocked */ }
    setDark(!dark);
  };
  return { dark, toggle };
}

export const REQUESTS_CHANGED = "festride:requests-changed";

function useNotifications() {
  const { user } = useAuth();
  const loc = useLocation();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((count) => count + 1);
    window.addEventListener(REQUESTS_CHANGED, bump);
    const every = setInterval(() => { if (document.visibilityState === "visible") bump(); }, 60_000);
    return () => { window.removeEventListener(REQUESTS_CHANGED, bump); clearInterval(every); };
  }, []);
  useEffect(() => {
    if (!user) { setItems([]); setUnread(0); return; }
    let live = true;
    api.notifications().then((response) => { if (live) { setItems(response.items); setUnread(response.unread); } }).catch(() => {});
    return () => { live = false; };
  }, [user, tick, loc.pathname]);
  const markRead = () => {
    if (!unread) return;
    setUnread(0);
    api.readNotifications().catch(() => {});
  };
  return { items, unread, markRead };
}

function Bell() {
  const { t } = useI18n();
  const { items, unread, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", closeOnEscape); };
  }, [open]);
  const toggle = () => { if (!open) markRead(); setOpen(!open); };
  return (
    <div className="menu" ref={ref}>
      <button className="bell" type="button" aria-expanded={open} aria-label={unread ? t("bell.unread", { n: unread }) : t("bell.label")} onClick={toggle}>
        <Icon name="bell" />{unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}
      </button>
      {open && (
        <div className="menu-pop bell-pop">
          <div className="bell-head">{t("bell.label")}</div>
          {!items.length && <p className="bell-empty">{t("bell.empty")}</p>}
          {items.map((notification) => (
            <Link key={notification.id} className={notification.read ? "" : "unread"} onClick={() => setOpen(false)}
              to={notification.kind === "request" || notification.kind === "withdrew" ? `/drive?ride=${notification.ride_id}` : `/rides/${notification.ride_id}`}>
              <span>{t(`bell.${notification.kind}` as Key, { name: notification.actor_name.split(" ")[0], event: notification.event_name })}</span>
              <small>{timeAgo(notification.created_at, t)}</small>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string, t: ReturnType<typeof useI18n>["t"]): string {
  const sentAt = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  const minutes = Math.max(0, Math.round((Date.now() - sentAt) / 60_000));
  if (minutes < 1) return t("bell.now");
  if (minutes < 60) return t("bell.min", { n: minutes });
  const hours = Math.round(minutes / 60);
  return hours < 24 ? t("bell.h", { n: hours }) : t("bell.d", { n: Math.round(hours / 24) });
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { dark, toggle } = useTheme();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", closeOnEscape); };
  }, [open]);
  if (!user) return null;
  return (
    <div className="menu" ref={ref}>
      <button className="avatar" type="button" aria-expanded={open} aria-label={t("menu.open")} onClick={() => setOpen(!open)}>{initials(user.display_name)}</button>
      {open && (
        <div className="menu-pop">
          <div className="who"><div className="note">{t("nav.signedIn")}</div><b>{user.display_name}</b><div className="note">{user.email}</div></div>
          {/* language and theme live here instead of the header */}
          <div className="prefs">
            <div className="pref"><span>{t("lang.label")}</span>
              <div className="segmented" role="group" aria-label={t("lang.label")}>
                <button type="button" aria-pressed={lang === "pl"} onClick={() => setLang("pl")}>PL</button>
                <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
              </div>
            </div>
            <div className="pref"><span>{t("theme.label")}</span>
              <div className="segmented" role="group" aria-label={t("theme.label")}>
                <button type="button" aria-pressed={!dark} onClick={() => dark && toggle()} aria-label={t("theme.light")}><Icon name="sun" /></button>
                <button type="button" aria-pressed={dark} onClick={() => !dark && toggle()} aria-label={t("theme.dark")}><Icon name="moon" /></button>
              </div>
            </div>
          </div>
          <Link to="/profile" onClick={() => setOpen(false)}>{t("nav.profile")}</Link>
          <button type="button" onClick={() => { logout(); setOpen(false); nav("/"); }}>{t("nav.logout")}</button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { user } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { dark, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setMenuOpen(false), [loc.pathname]);
  const tabs = user
    ? [["/home", t("nav.home"), t("nav.home")], ["/search", t("nav.find"), t("nav.findShort")], ["/my-rides", t("nav.myRides"), t("nav.myRidesShort")], ["/drive", t("nav.drive"), t("nav.drive")]]
    : [["/events", t("nav.events"), t("nav.events")], ["/search", t("nav.find"), t("nav.findShort")], ["/drive", t("nav.drive"), t("nav.drive")]];
  return (
    <header className={`app-head${user ? "" : " guest"}${menuOpen ? " menu-open" : ""}`}>
      <div className="inner">
        <Link className="logo" to={user ? "/home" : "/"}>festride</Link>
        <nav className="nav-tabs" id="main-tabs" aria-label={t("nav.main")}>
          {tabs.map(([to, label, short]) => (
            <NavLink key={to} to={to} end={to === "/drive"} className={({ isActive }) => (isActive ? "active" : undefined)} aria-label={label}>
              <span className="label-long">{label}</span><span className="label-short" aria-hidden="true">{short}</span>
            </NavLink>
          ))}
        </nav>
        {!user && (
          <div className="guest-prefs">
            <div className="header-toggle" role="group" aria-label={t("lang.label")}>
              <button type="button" aria-pressed={lang === "pl"} onClick={() => setLang("pl")}>PL</button>
              <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            </div>
            <div className="header-toggle">
              <button type="button" onClick={toggle} aria-label={dark ? t("theme.toLight") : t("theme.toDark")}><Icon name={dark ? "sun" : "moon"} /></button>
            </div>
          </div>
        )}
        <div className="header-actions">
          {/* logged out: language + theme in the header; logged in they live in the account menu */}
          {!user && <>
            <div className="header-toggle" role="group" aria-label={t("lang.label")}>
              <button type="button" aria-pressed={lang === "pl"} onClick={() => setLang("pl")}>PL</button>
              <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            </div>
            <div className="header-toggle">
              <button type="button" onClick={toggle} aria-label={dark ? t("theme.toLight") : t("theme.toDark")}><Icon name={dark ? "sun" : "moon"} /></button>
            </div>
          </>}
          {user ? (
            <>
              <Bell />
              <AccountMenu />
            </>
          ) : (
            <>{/* on the log-in page offer sign-up first (and vice versa) instead of a button to the page you're on */}
              {loc.pathname === "/login"
                ? <Link className="btn btn-ghost btn-sm" to="/signup">{t("nav.signup")}</Link>
                : <><Link className="btn btn-ghost btn-sm" to="/login">{t("nav.login")}</Link>{loc.pathname !== "/signup" && <Link className="btn btn-sm" to="/signup">{t("nav.signup")}</Link>}</>}
              {/* phones, logged out: the tabs fold into this menu */}
              <button type="button" className="burger" aria-expanded={menuOpen} aria-controls="main-tabs" aria-label={t("nav.menu")} onClick={() => setMenuOpen((wasOpen) => !wasOpen)}><span /><span /><span /></button></>
          )}
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="site">
      <div className="sun" aria-hidden="true" />
      {/* the same little car as on the landing, driving across the sun and back in from the left */}
      <div className="sunroad" aria-hidden="true">
        <svg className="footer-car" viewBox="-17 -18 31 19">
          <path d="M-7.6 -6.4 L-5.2 -11.2 Q-4.6 -12.2 -3.4 -12.2 L3.6 -12.2 Q4.8 -12.2 5.4 -11.2 L8.2 -6.4 Z" fill="#1E1B18" />
          <path d="M-12 -6.4 Q-12 -8.6 -9.8 -8.6 L10.2 -8.6 Q12.6 -8.6 12.6 -6.2 L12.6 -2.6 Q12.6 -1.4 11.4 -1.4 L-10.8 -1.4 Q-12 -1.4 -12 -2.6 Z" fill="#1E1B18" />
          <circle cx="-6.4" cy="-1.2" r="2.5" fill="#1E1B18" /><circle cx="6.8" cy="-1.2" r="2.5" fill="#1E1B18" />
          <rect x="10.4" y="-6.6" width="2.2" height="1.6" rx=".6" fill="#D7FF4A" />
        </svg>
      </div>
      <div className="inner wrap page-gutter">
        <h2 className="display-title">{t("footer.title")}</h2>
        <nav aria-label={t("nav.footer")}>
          <Link to="/events">{t("nav.events")}</Link>
          <Link to="/search">{t("nav.find")}</Link>
          <Link to="/drive">{t("nav.drive")}</Link>
        </nav>
        <p>{t("footer.note")}</p>
      </div>
    </footer>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="page wrap page-gutter">{children}</main>;
}

export function Screen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`app-screen ${className}`}>{children}</main>;
}

export function Credit() {
  return (
    <div className="credit">
      Made by Maja Bednarek with love for Xelerit
    </div>
  );
}
