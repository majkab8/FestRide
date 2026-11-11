import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { initials } from "../geo";
import { parseLocal, useI18n } from "../i18n";
import { Icon } from "./ui";
import "../app3.css";

/* ---------- theme: system by default, toggle overrides ---------- */
function useTheme() {
  const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  const read = () => {
    const forced = document.documentElement.dataset.theme;
    return forced ? forced === "dark" : !!mq?.matches;
  };
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const on = () => setDark(read());
    mq?.addEventListener("change", on);
    return () => mq?.removeEventListener("change", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("festride-theme", next); } catch { /* storage blocked */ }
    setDark(!dark);
  };
  return { dark, toggle };
}

/** Fired by the driver dashboard after accepting/declining, so the bell updates. */
export const REQUESTS_CHANGED = "festride:requests-changed";

/** Requests waiting for my yes/no as a driver: loaded once per login, and again
    when the driver dashboard reports a decision. */
function usePendingForMe(): number {
  const { user } = useAuth();
  const [n, setN] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((x) => x + 1);
    window.addEventListener(REQUESTS_CHANGED, bump);
    return () => window.removeEventListener(REQUESTS_CHANGED, bump);
  }, []);
  useEffect(() => {
    if (!user) { setN(0); return; }
    let live = true;
    (async () => {
      const now = new Date();
      const mine = (await api.myRides()).filter((r) => parseLocal(r.departure_time) > now);
      const lists = await Promise.all(mine.map((r) => api.rideRequests(r.id)));
      if (live) setN(lists.flat().filter((q) => q.status === "pending").length);
    })().catch(() => { if (live) setN(0); });
    return () => { live = false; };
  }, [user, tick]);
  return n;
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
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
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
              <div className="seg" role="group" aria-label={t("lang.label")}>
                <button type="button" aria-pressed={lang === "pl"} onClick={() => setLang("pl")}>PL</button>
                <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
              </div>
            </div>
            <div className="pref"><span>{t("theme.label")}</span>
              <div className="seg" role="group" aria-label={t("theme.label")}>
                <button type="button" aria-pressed={!dark} onClick={() => dark && toggle()} aria-label={t("theme.light")}><Icon name="sun" /></button>
                <button type="button" aria-pressed={dark} onClick={() => !dark && toggle()} aria-label={t("theme.dark")}><Icon name="moon" /></button>
              </div>
            </div>
          </div>
          <button type="button" onClick={() => { logout(); setOpen(false); nav("/"); }}>{t("nav.logout")}</button>
        </div>
      )}
    </div>
  );
}

/** The v3 app header: logo, tab pill, (language/theme), bell, avatar blob. */
export function Header() {
  const { user } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { dark, toggle } = useTheme();
  const pending = usePendingForMe();
  const [menuOpen, setMenuOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setMenuOpen(false), [loc.pathname]);
  // [path, label, short label for phones]
  const tabs = user
    ? [["/home", t("nav.home"), t("nav.home")], ["/search", t("nav.find"), t("nav.findShort")], ["/my-rides", t("nav.myRides"), t("nav.myRidesShort")], ["/drive", t("nav.drive"), t("nav.drive")]]
    : [["/events", t("nav.events"), t("nav.events")], ["/search", t("nav.find"), t("nav.findShort")], ["/drive", t("nav.drive"), t("nav.drive")]];
  return (
    <header className={`app-head${user ? "" : " guest"}${menuOpen ? " menu-open" : ""}`}>
      <div className="in">
        <Link className="logo" to={user ? "/home" : "/"}>festride</Link>
        <nav className="tabs3" id="main-tabs" aria-label={t("nav.main")}>
          {tabs.map(([to, label, short]) => (
            <NavLink key={to} to={to} end={to === "/drive"} className={({ isActive }) => (isActive ? "active" : undefined)} aria-label={label}>
              <span className="lg">{label}</span><span className="sm" aria-hidden="true">{short}</span>
            </NavLink>
          ))}
        </nav>
        {!user && (
          /* phones, logged out: language + theme sit at the bottom of the hamburger dropdown */
          <div className="guest-prefs">
            <div className="mini" role="group" aria-label={t("lang.label")}>
              <button type="button" aria-pressed={lang === "pl"} onClick={() => setLang("pl")}>PL</button>
              <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            </div>
            <div className="mini">
              <button type="button" onClick={toggle} aria-label={dark ? t("theme.toLight") : t("theme.toDark")}><Icon name={dark ? "sun" : "moon"} /></button>
            </div>
          </div>
        )}
        <div className="right">
          {/* logged out: language + theme in the header; logged in they live in the account menu */}
          {!user && <>
            <div className="mini" role="group" aria-label={t("lang.label")}>
              <button type="button" aria-pressed={lang === "pl"} onClick={() => setLang("pl")}>PL</button>
              <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            </div>
            <div className="mini">
              <button type="button" onClick={toggle} aria-label={dark ? t("theme.toLight") : t("theme.toDark")}><Icon name={dark ? "sun" : "moon"} /></button>
            </div>
          </>}
          {user ? (
            <>
              <Link className="bell" to="/drive" aria-label={pending ? t("nav.newRequests", { n: pending }) : t("nav.noRequests")}>
                <Icon name="bell" />{pending > 0 && <b>{pending}</b>}
              </Link>
              <AccountMenu />
            </>
          ) : (
            <>{/* on the log-in page offer sign-up first (and vice versa) instead of a button to the page you're on */}
              {loc.pathname === "/login"
                ? <Link className="btn btn-ghost btn-sm" to="/signup">{t("nav.signup")}</Link>
                : <><Link className="btn btn-ghost btn-sm" to="/login">{t("nav.login")}</Link>{loc.pathname !== "/signup" && <Link className="btn btn-sm" to="/signup">{t("nav.signup")}</Link>}</>}
              {/* phones, logged out: the tabs fold into this menu */}
              <button type="button" className="burger" aria-expanded={menuOpen} aria-controls="main-tabs" aria-label={t("nav.menu")} onClick={() => setMenuOpen((o) => !o)}><span /><span /><span /></button></>
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
        <svg className="footcar" viewBox="-17 -18 31 19">
          <path d="M-7.6 -6.4 L-5.2 -11.2 Q-4.6 -12.2 -3.4 -12.2 L3.6 -12.2 Q4.8 -12.2 5.4 -11.2 L8.2 -6.4 Z" fill="#1E1B18" />
          <path d="M-12 -6.4 Q-12 -8.6 -9.8 -8.6 L10.2 -8.6 Q12.6 -8.6 12.6 -6.2 L12.6 -2.6 Q12.6 -1.4 11.4 -1.4 L-10.8 -1.4 Q-12 -1.4 -12 -2.6 Z" fill="#1E1B18" />
          <circle cx="-6.4" cy="-1.2" r="2.5" fill="#1E1B18" /><circle cx="6.8" cy="-1.2" r="2.5" fill="#1E1B18" />
          <rect x="10.4" y="-6.6" width="2.2" height="1.6" rx=".6" fill="#D7FF4A" />
        </svg>
      </div>
      <div className="in wrap gut">
        <h2 className="disp">{t("footer.title")}</h2>
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
  return <main className="page wrap gut">{children}</main>;
}

/** Full-width v3 app screen (1440 px max, 40 px sides). */
export function Screen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`app3 ${className}`}>{children}</main>;
}
