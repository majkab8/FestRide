import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, type DrivingStyle } from "../api";
import { useAuth } from "../auth";
import { Page } from "../components/Layout";
import { Icon } from "../components/ui";
import { familyOf } from "../geo";
import { useI18n } from "../i18n";

function useNext() {
  const [params] = useSearchParams();
  const next = params.get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/home";
}

export function Login() {
  const { t } = useI18n();
  const { login } = useAuth();
  const nav = useNavigate();
  const next = useNext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      nav(next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && (err.status === 401 || err.status === 422) ? t("auth.badLogin") : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <form className="form" onSubmit={submit}>
        <h1 className="disp">{t("auth.loginTitle")}</h1>
        <div className="field"><label htmlFor="li-email">{t("auth.email")}</label><input id="li-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="li-pw">{t("auth.password")}</label><input id="li-pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-pink" type="submit" disabled={busy}>{t("auth.login")}</button>
        <p className="note" style={{ textAlign: "center" }}>{t("auth.demo")}</p>
        <p style={{ textAlign: "center" }}>{t("auth.noAccount")} <Link to={`/signup${next !== "/home" ? `?next=${encodeURIComponent(next)}` : ""}`}>{t("nav.signup")}</Link></p>
      </form>
    </Page>
  );
}

const GENRES = ["techno", "house", "drum and bass", "trance", "rock", "metal", "punk", "indie", "pop", "hip-hop", "r&b", "jazz", "reggae", "folk", "classical"];
const famClass = (g: string) => {
  const f = familyOf(g);
  return f === "electronic" ? "f-electronic" : f === "rock" ? "f-rock" : f === "urban" ? "f-urban" : "f-other";
};
const STYLE_DOT: Record<DrivingStyle, React.CSSProperties> = {
  quiet: { background: "var(--blue)", color: "var(--on-blue)" },
  chatty: { background: "var(--pink)", color: "var(--on-bright)" },
  party: { background: "var(--lime)", color: "var(--on-bright)" },
};

/** Two-step sign-up (decision Q13): the account is created only after the profile step. */
export function Signup() {
  const { t } = useI18n();
  const { register } = useAuth();
  const nav = useNavigate();
  const next = useNext();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [style, setStyle] = useState<DrivingStyle>("chatty");
  const [smoker, setSmoker] = useState(false);
  const [gender, setGender] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (g: string) => setGenres((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g].slice(0, 20)));
  const addCustom = () => {
    const g = custom.trim().toLowerCase().slice(0, 40);
    if (g && !genres.includes(g)) setGenres([...genres, g]);
    setCustom("");
  };

  const toStep2 = (e: FormEvent) => { e.preventDefault(); setStep(2); };

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      await register({ email, password, display_name: name.trim(), music_genres: genres, driving_style: style, smoker, gender: gender || null });
      nav(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) { setError(t("su.taken")); setStep(1); }
      else if (err instanceof ApiError && err.status === 422) setError(t("su.invalid"));
      else setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const steps = <div className="steps" role="img" aria-label={`${t("su.stepsAria")}: ${t("su.step", { n: step })}`}><i className="on" /><i className={step === 2 ? "on" : ""} /></div>;

  if (step === 1) {
    return (
      <Page>
        <form className="form" onSubmit={toStep2}>
          {steps}
          <div><span className="eyebrow">{t("su.step", { n: 1 })}</span><h1 className="disp">{t("su.h1a")}</h1></div>
          <div className="field"><label htmlFor="su-name">{t("su.name")}</label><input id="su-name" autoComplete="given-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label htmlFor="su-email">{t("auth.email")}</label><input id="su-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="su-pw">{t("auth.password")}</label><input id="su-pw" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} /><span className="hint">{t("su.pwHint")}</span></div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" type="submit">{t("su.next")}</button>
          <p className="note" style={{ textAlign: "center" }}>{t("su.later")}</p>
          <p style={{ textAlign: "center" }}>{t("auth.haveAccount")} <Link to="/login">{t("nav.login")}</Link></p>
        </form>
      </Page>
    );
  }

  const shown = [...GENRES, ...genres.filter((g) => !GENRES.includes(g))];
  return (
    <Page>
      <div className="form">
        {steps}
        <div><span className="eyebrow">{t("su.step", { n: 2 })}</span><h1 className="disp">{t("su.h1b")}</h1><p className="muted" style={{ marginTop: 8 }}>{t("su.subB")}</p></div>
        <div className="group">
          <div className="row"><span className="label" id="su-genres">{t("su.listen")}</span><span className="note">{t("su.selected", { n: genres.length })}</span></div>
          <div className="chips genres" role="group" aria-labelledby="su-genres">
            {shown.map((g) => <button key={g} type="button" className={`chip ${famClass(g)}`} aria-pressed={genres.includes(g)} onClick={() => toggle(g)}>{g}</button>)}
          </div>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <div className="field" style={{ flex: 1 }}><label htmlFor="su-custom" className="sr-only">{t("su.other")}</label>
              <input id="su-custom" placeholder={t("su.other")} maxLength={40} value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} /></div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={addCustom} disabled={!custom.trim()}>{t("su.add")}</button>
          </div>
        </div>
        <div className="group">
          <span className="label" id="su-style">{t("su.style")}</span>
          <div className="tiles" role="group" aria-labelledby="su-style">
            {(["quiet", "chatty", "party"] as DrivingStyle[]).map((s, i) => (
              <button key={s} className="tile" type="button" aria-pressed={style === s} onClick={() => setStyle(s)}>
                <span className={`dot sh${i}`} style={STYLE_DOT[s]}><Icon name={s === "quiet" ? "moon" : s === "chatty" ? "spark" : "sun"} /></span>
                <b>{t(`styleT.${s}`)}</b><span className="d">{t(`styleD.${s}`)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <span className="label" id="su-smoke">{t("su.smoking")}</span>
          <div className="seg" role="group" aria-labelledby="su-smoke">
            <button type="button" aria-pressed={!smoker} onClick={() => setSmoker(false)}>{t("su.noSmoke")}</button>
            <button type="button" aria-pressed={smoker} onClick={() => setSmoker(true)}>{t("su.smoke")}</button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="su-gender">{t("su.gender")} <span className="muted" style={{ fontWeight: 400 }}>{t("su.optional")}</span></label>
          <select id="su-gender" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">{t("su.gNone")}</option><option value="female">{t("su.gF")}</option><option value="male">{t("su.gM")}</option><option value="non-binary">{t("su.gX")}</option>
          </select>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row">
          <button className="btn btn-ghost" type="button" onClick={() => setStep(1)}>{t("su.back")}</button>
          <button className="btn btn-pink" type="button" onClick={create} disabled={!genres.length || busy}>{t("su.create")}</button>
        </div>
      </div>
    </Page>
  );
}
