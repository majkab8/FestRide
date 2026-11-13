import { useState, type FormEvent } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { ApiError, type DrivingStyle } from "../api";
import { useAuth } from "../auth";
import { Page } from "../components/Layout";
import { useToast } from "../components/Toast";
import { Icon } from "../components/ui";
import { familyOf } from "../geo";
import { useI18n } from "../i18n";

function useNext() {
  const [params] = useSearchParams();
  const next = params.get("next");
  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/home";
}

export function Login() {
  const { t } = useI18n();
  const { login, user } = useAuth();
  const nav = useNavigate();
  const next = useNext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user && !busy) return <Navigate to={next} replace />; // already logged in

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      nav(next, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && (err.status === 401 || err.status === 422)
          ? t("auth.badLogin")
          : t("common.error"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <form className="form" onSubmit={submit}>
        <h1 className="display-title">{t("auth.loginTitle")}</h1>
        <div className="field">
          <label htmlFor="li-email">{t("auth.email")}</label>
          <input
            id="li-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="li-pw">{t("auth.password")}</label>
          <input
            id="li-pw"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-pink" type="submit" disabled={busy}>
          {t("auth.login")}
        </button>
        <p className="note" style={{ textAlign: "center" }}>
          {t("auth.demo")}
        </p>
        <p style={{ textAlign: "center" }}>
          {t("auth.noAccount")}{" "}
          <Link
            to={`/signup${next !== "/home" ? `?next=${encodeURIComponent(next)}` : ""}`}
          >
            {t("nav.signup")}
          </Link>
        </p>
      </form>
    </Page>
  );
}

const GENRES = [
  "techno",
  "house",
  "drum and bass",
  "trance",
  "rock",
  "metal",
  "punk",
  "indie",
  "pop",
  "hip-hop",
  "r&b",
  "jazz",
  "reggae",
  "folk",
  "classical",
];
const famClass = (genre: string) => {
  const family = familyOf(genre);
  return family === "electronic"
    ? "chip-genre-electronic"
    : family === "rock"
      ? "chip-genre-rock"
      : family === "urban"
        ? "chip-genre-urban"
        : "chip-genre-other";
};
const STYLE_DOT: Record<DrivingStyle, React.CSSProperties> = {
  quiet: { background: "var(--blue)", color: "var(--on-blue)" },
  chatty: { background: "var(--pink)", color: "var(--on-bright)" },
  party: { background: "var(--lime)", color: "var(--on-bright)" },
};

/** Two-step sign-up (decision Q13): the account is created only after the profile step. */
export function Signup() {
  const { t } = useI18n();
  const { register, user } = useAuth();
  const nav = useNavigate();
  const next = useNext();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [style, setStyle] = useState<DrivingStyle>("chatty");
  const [smoker, setSmoker] = useState(false);
  const [gender, setGender] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toStep2 = (e: FormEvent) => {
    e.preventDefault();
    setStep(2);
  };
  if (user && !busy) return <Navigate to={next} replace />; // already logged in

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      await register({
        email,
        password,
        display_name: name.trim(),
        music_genres: genres,
        driving_style: style,
        smoker,
        gender: gender || null,
      });
      nav(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t("su.taken"));
        setStep(1);
      } else if (err instanceof ApiError && err.status === 422)
        setError(t("su.invalid"));
      else setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const steps = (
    <div
      className="steps"
      role="img"
      aria-label={`${t("su.stepsAria")}: ${t("su.step", { n: step })}`}
    >
      <i className="on" />
      <i className={step === 2 ? "on" : ""} />
    </div>
  );

  if (step === 1) {
    return (
      <Page>
        <form className="form" onSubmit={toStep2}>
          {steps}
          <div>
            <span className="eyebrow">{t("su.step", { n: 1 })}</span>
            <h1 className="display-title">{t("su.h1a")}</h1>
          </div>
          <div className="field">
            <label htmlFor="su-name">{t("su.name")}</label>
            <input
              id="su-name"
              autoComplete="given-name"
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="su-email">{t("auth.email")}</label>
            <input
              id="su-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="su-pw">{t("auth.password")}</label>
            <input
              id="su-pw"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="hint">{t("su.pwHint")}</span>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn" type="submit">
            {t("su.next")}
          </button>
          <p className="note" style={{ textAlign: "center" }}>
            {t("su.later")}
          </p>
          <p style={{ textAlign: "center" }}>
            {t("auth.haveAccount")} <Link to="/login">{t("nav.login")}</Link>
          </p>
        </form>
      </Page>
    );
  }

  return (
    <Page>
      <div className="form">
        {steps}
        <div>
          <span className="eyebrow">{t("su.step", { n: 2 })}</span>
          <h1 className="display-title">{t("su.h1b")}</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            {t("su.subB")}
          </p>
        </div>
        <ProfileFields
          id="su"
          {...{
            genres,
            setGenres,
            style,
            setStyle,
            smoker,
            setSmoker,
            gender,
            setGender,
          }}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setStep(1)}
          >
            {t("su.back")}
          </button>
          <button
            className="btn btn-pink"
            type="button"
            onClick={create}
            disabled={!genres.length || busy}
          >
            {t("su.create")}
          </button>
        </div>
      </div>
    </Page>
  );
}

interface ProfileFieldsProps {
  id: string;
  genres: string[];
  setGenres: (fn: (current: string[]) => string[]) => void;
  style: DrivingStyle;
  setStyle: (style: DrivingStyle) => void;
  smoker: boolean;
  setSmoker: (smoker: boolean) => void;
  gender: string;
  setGender: (gender: string) => void;
}

/** The matching answers (genres, ride style, smoking, gender): sign-up step 2 and the profile page. */
function ProfileFields({
  id,
  genres,
  setGenres,
  style,
  setStyle,
  smoker,
  setSmoker,
  gender,
  setGender,
}: ProfileFieldsProps) {
  const { t } = useI18n();
  const [custom, setCustom] = useState("");
  const toggle = (genre: string) =>
    setGenres((current) =>
      current.includes(genre)
        ? current.filter((selected) => selected !== genre)
        : [...current, genre].slice(0, 20),
    );
  const addCustom = () => {
    const genre = custom.trim().toLowerCase().slice(0, 40);
    if (genre)
      setGenres((current) =>
        current.includes(genre) ? current : [...current, genre].slice(0, 20),
      );
    setCustom("");
  };
  const shown = [
    ...GENRES,
    ...genres.filter((genre) => !GENRES.includes(genre)),
  ];
  return (
    <>
      <div className="group">
        <div className="row">
          <span className="label" id={`${id}-genres`}>
            {t("su.listen")}
          </span>
          <span className="note">{t("su.selected", { n: genres.length })}</span>
        </div>
        <div
          className="chips genres"
          role="group"
          aria-labelledby={`${id}-genres`}
        >
          {shown.map((genre) => (
            <button
              key={genre}
              type="button"
              className={`chip ${famClass(genre)}`}
              aria-pressed={genres.includes(genre)}
              onClick={() => toggle(genre)}
            >
              {genre}
            </button>
          ))}
        </div>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor={`${id}-custom`} className="sr-only">
              {t("su.other")}
            </label>
            <input
              id={`${id}-custom`}
              placeholder={t("su.other")}
              maxLength={40}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
            />
          </div>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={addCustom}
            disabled={!custom.trim()}
          >
            {t("su.add")}
          </button>
        </div>
      </div>
      <div className="group">
        <span className="label" id={`${id}-style`}>
          {t("su.style")}
        </span>
        <div className="tiles" role="group" aria-labelledby={`${id}-style`}>
          {(["quiet", "chatty", "party"] as DrivingStyle[]).map((option, i) => (
            <button
              key={option}
              className="tile"
              type="button"
              aria-pressed={style === option}
              onClick={() => setStyle(option)}
            >
              <span className={`dot shape-${i}`} style={STYLE_DOT[option]}>
                <Icon
                  name={
                    option === "quiet"
                      ? "moon"
                      : option === "chatty"
                        ? "spark"
                        : "sun"
                  }
                />
              </span>
              <b>{t(`styleT.${option}`)}</b>
              <span className="description">{t(`styleD.${option}`)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <span className="label" id={`${id}-smoke`}>
          {t("su.smoking")}
        </span>
        <div className="segmented" role="group" aria-labelledby={`${id}-smoke`}>
          <button
            type="button"
            aria-pressed={!smoker}
            onClick={() => setSmoker(false)}
          >
            {t("su.noSmoke")}
          </button>
          <button
            type="button"
            aria-pressed={smoker}
            onClick={() => setSmoker(true)}
          >
            {t("su.smoke")}
          </button>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${id}-gender`}>
          {t("su.gender")}{" "}
          <span className="muted" style={{ fontWeight: 400 }}>
            {t("su.optional")}
          </span>
        </label>
        <select
          id={`${id}-gender`}
          value={gender}
          onChange={(e) => setGender(e.target.value)}
        >
          <option value="">{t("su.gNone")}</option>
          <option value="female">{t("su.gF")}</option>
          <option value="male">{t("su.gM")}</option>
          <option value="non-binary">{t("su.gX")}</option>
        </select>
      </div>
    </>
  );
}

/** Edit the profile answers after sign-up (PATCH /auth/me). Email and password stay as they are. */
export function Profile() {
  const { t } = useI18n();
  const { user, updateProfile } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const [name, setName] = useState(user?.display_name ?? "");
  const [genres, setGenres] = useState<string[]>(user?.music_genres ?? []);
  const [style, setStyle] = useState<DrivingStyle>(
    user?.driving_style ?? "chatty",
  );
  const [smoker, setSmoker] = useState(user?.smoker ?? false);
  const [gender, setGender] = useState(user?.gender ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) return null; // RequireAuth handles the redirect

  // back to where the menu was opened; opened straight from the address bar → home
  const back = () => (loc.key === "default" ? nav("/home") : nav(-1));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await updateProfile({
        display_name: name.trim(),
        music_genres: genres,
        driving_style: style,
        smoker,
        gender: gender || null,
      });
      toast(t("pf.saved"));
      back();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 422
          ? t("su.invalid")
          : t("common.error"),
      );
      setBusy(false);
    }
  };

  return (
    <Page>
      <form className="form" onSubmit={save}>
        <div>
          <span className="eyebrow">{t("pf.eyebrow")}</span>
          <h1 className="display-title">{t("pf.title")}</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            {t("pf.sub")}
          </p>
        </div>
        <div className="field">
          <label htmlFor="pf-name">{t("pf.name")}</label>
          <input
            id="pf-name"
            autoComplete="given-name"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <span className="hint">
            {t("pf.emailNote", { email: user.email })}
          </span>
        </div>
        <ProfileFields
          id="pf"
          {...{
            genres,
            setGenres,
            style,
            setStyle,
            smoker,
            setSmoker,
            gender,
            setGender,
          }}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="btn btn-ghost" type="button" onClick={back}>
            {t("pf.cancel")}
          </button>
          <button
            className="btn btn-pink"
            type="submit"
            disabled={!genres.length || !name.trim() || busy}
          >
            {t("pf.save")}
          </button>
        </div>
      </form>
    </Page>
  );
}
