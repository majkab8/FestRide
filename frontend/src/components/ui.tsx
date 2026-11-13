import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Match, Ride } from "../api";
import { familyOf, initials } from "../geo";
import { useI18n } from "../i18n";


const PATHS = {
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  cal: "M4 5h16v15H4zM4 10h16M9 3v4M15 3v4",
  pin: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  seat: "M12 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5",
  nosmoke: "M3 14h13v3H3zM19 14v3M4 4l16 16",
  smoke: "M3 14h13v3H3zM19 14v3M18 4c0 2 2 2 2 4",
  x: "M6 6l12 12M18 6L6 18",
  back: "M15 5l-7 7 7 7",
  arrow: "M5 12h14M13 6l6 6-6 6",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2",
  check: "M5 12.5l4.5 4.5L19 7",
  car: "M5 16h14M6 16l1.5-5h9L18 16M7 16v2M17 16v2M8.5 13.5h.01M15.5 13.5h.01",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "icon" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export type MatchKey = "great" | "good" | "some" | "diff";
export function matchKey(m: Pick<Match, "percent"> | number): MatchKey {
  const percent = typeof m === "number" ? m : m.percent;
  return percent >= 85 ? "great" : percent >= 60 ? "good" : percent >= 30 ? "some" : "diff";
}

export const shapeFor = (level: MatchKey) => ({ great: "starry", good: "round", some: "squircle", diff: "hexa" })[level];

export function Score({ match, shape = 0, size }: { match: Match; shape?: number; size?: number }) {
  const { t } = useI18n();
  const level = matchKey(match);
  const style = size ? { width: size, height: size, fontSize: size * 0.45 } : undefined;
  return (
    <div className={`score score-blob-${level}`}>
      <span className={`blob num shape-${shape % 3}`} style={style}>{match.percent}</span>
      <span>{t(`match.${level}`)}</span>
    </div>
  );
}

export function Avatar({ name, shape = 2, size = 60 }: { name: string; shape?: number; size?: number }) {
  const letters = initials(name);
  return (
    <span className={`blob shape-${shape % 3}`} style={{ width: size, height: size, fontSize: size * 0.3, background: "var(--lime)", color: "var(--on-bright)", fontWeight: 700 }} aria-hidden="true">
      {letters}
    </span>
  );
}

export function AiBadge({ title }: { title?: string }) {
  return <span className="ai-badge" title={title}>✶ AI</span>;
}

export function Thumb({ genre, shape = 0, big = false, image }: { genre: string | null; shape?: number; big?: boolean; image?: string | null }) {
  if (image) return <img className={`thumb photo${big ? " big" : ""}`} src={image} alt="" loading="lazy" referrerPolicy="no-referrer" aria-hidden="true" />;
  return (
    <span className={`thumb poster ${shape === 3 ? "shape-3" : `shape-${shape % 3}`} genre-${familyOf(genre)}${big ? " big" : ""}`} aria-hidden="true">
      {genre ? genre.replace("Dance/Electronic", "Electronic").replace("Hip-Hop/Rap", "Hip-hop") : "live"}
    </span>
  );
}

export function Wristband({ ride, small = false }: { ride: Ride; small?: boolean }) {
  const { t } = useI18n();
  if (!ride.match) return null;
  const bits = [...ride.driver.music_genres.slice(0, 3), t(`style.${ride.driver.driving_style}`), ride.smoking_allowed ? t("ride.smokingOk") : t("ride.noSmoking")];
  return (
    <div className={`band${small ? " small" : ""}`} aria-hidden="true">
      <span className="stub"><span className="num">{ride.match.percent}%</span><span>{t(`match.${matchKey(ride.match)}`)}</span></span>
      <span className="poster">{bits.join(" ✶ ")} ✶ {bits.join(" ✶ ")}</span>
    </div>
  );
}

export function CountUp({ to, suffix = "", ms = 900 }: { to: number; suffix?: string; ms?: number }) {
  const [still] = useState(() => typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [value, setValue] = useState(still ? to : 0);
  const shown = useRef(value);
  shown.current = value;
  useEffect(() => {
    if (still) { setValue(to); return; }
    let frame = 0;
    const from = shown.current;
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / ms);
      setValue(Math.round(from + (to - from) * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to, ms, still]);
  return <>{value}{suffix}</>;
}

export function Loading() {
  const { t } = useI18n();
  return <div className="loading" role="status"><span className="spinner" aria-hidden="true" />{t("common.loading")}</div>;
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  const offline = error instanceof TypeError;
  return (
    <div className="card empty" role="alert">
      <h3 className="display-title">{offline ? t("common.offline") : t("common.error")}</h3>
      {onRetry && <button className="btn btn-sm" type="button" onClick={onRetry}>{t("common.retry")}</button>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="card empty"><h3 className="display-title">{title}</h3>{children}</div>;
}
