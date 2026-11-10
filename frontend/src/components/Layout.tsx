import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { initials } from "../geo";
import { Icon } from "./ui";

/* ---------- theme: system by default, toggle overrides ---------- */
function useTheme() {
  const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  const read = () => {
    const forced = document.documentElement.dataset.theme;
    return forced ? forced === "dark" : !!mq?.matches;
  };
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem("festride-theme");
      if (saved === "dark" || saved === "light") document.documentElement.dataset.theme = saved;
    } catch { /* storage blocked */ }
    return read();
  });
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
  const ini = initials(user.display_name);
  return (
    <div className="menu" ref={ref}>
      <button className="avatar" type="button" aria-expanded={open} aria-label={t("menu.open")} onClick={() => setOpen(!open)}>{ini}</button>
      {open && (
        <div className="menu-pop">
          <div className="who"><div className="note">{t("nav.signedIn")}</div><b>{user.display_name}</b><div className="note">{user.email}</div></div>
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
  const tabs = user
    ? [["/home", t("nav.home")], ["/search", t("nav.find")], ["/events", t("nav.events")], ["/drive", t("nav.drive")]]
    : [["/events", t("nav.events")], ["/search", t("nav.find")], ["/drive", t("nav.drive")]];
  return (
    <header className="top gut">
      <div className="top-in wrap">
        <Link className="logo" to={user ? "/home" : "/"}>festride</Link>
        <nav className="tabs" aria-label={t("nav.main")}>
          {tabs.map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : undefined)}>{label}</NavLink>)}
        </nav>
        <div className="tools">
          <div className="seg lang" role="group" aria-label={t("lang.label")}>
            <button type="button" aria-pressed={lang === "pl"} onClick={() => setLang("pl")}>PL</button>
            <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
          </div>
          <button className="icon-btn" type="button" onClick={toggle} aria-label={dark ? t("theme.toLight") : t("theme.toDark")}>
            <Icon name={dark ? "sun" : "moon"} />
          </button>
          {user ? <AccountMenu /> : <><Link className="btn btn-ghost btn-sm" to="/login">{t("nav.login")}</Link><Link className="btn btn-sm" to="/signup">{t("nav.signup")}</Link></>}
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
