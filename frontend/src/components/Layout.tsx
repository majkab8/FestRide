import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
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
  const { t } = useI18n();
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
  const tabs = user
    ? [["/home", t("nav.home")], ["/search", t("nav.find")], ["/my-rides", t("nav.myRides")], ["/drive", t("nav.drive")]]
    : [["/events", t("nav.events")], ["/search", t("nav.find")], ["/drive", t("nav.drive")]];
  return (
    <header className="app-head">
      <div className="in">
        <Link className="logo" to={user ? "/home" : "/"}>festride</Link>
        <nav className="tabs3" aria-label={t("nav.main")}>
          {tabs.map(([to, label]) => <NavLink key={to} to={to} end={to === "/drive"} className={({ isActive }) => (isActive ? "active" : undefined)}>{label}</NavLink>)}
        </nav>
        <div className="right">
          <div className="mini" role="group" aria-label={t("lang.label")}>
            <button type="button" aria-pressed={lang === "pl"} onClick={() => setLang("pl")}>PL</button>
            <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
          </div>
          <div className="mini">
            <button type="button" onClick={toggle} aria-label={dark ? t("theme.toLight") : t("theme.toDark")}><Icon name={dark ? "sun" : "moon"} /></button>
          </div>
          {user ? (
            <>
              <Link className="bell" to="/drive" aria-label={pending ? t("nav.newRequests", { n: pending }) : t("nav.noRequests")}>
                <Icon name="bell" />{pending > 0 && <b>{pending}</b>}
              </Link>
              <AccountMenu />
            </>
          ) : (
            <><Link className="btn btn-ghost btn-sm" to="/login">{t("nav.login")}</Link><Link className="btn btn-sm" to="/signup">{t("nav.signup")}</Link></>
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
