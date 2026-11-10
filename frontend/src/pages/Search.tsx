import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type Ride, type SearchFilters } from "../api";
import { useAuth } from "../auth";
import { Screen } from "../components/Layout";
import { MapView, type MapOrigin, type MapPin, type MapRoute } from "../components/MapView";
import { Empty, ErrorBox, Icon, Loading, matchKey } from "../components/ui";
import { cityCoords, fold } from "../geo";
import { useAsync } from "../hooks";
import { useI18n, type Key } from "../i18n";

/* Filters live in the URL, so a search can be shared and survives a reload.
   Keys are exactly GET /rides query parameters. */
const FILTER_KEYS = ["event_id", "q", "origin_city", "event_city", "genre", "date_from", "date_to", "max_price", "min_seats", "no_smoking"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type Filters = Partial<Record<FilterKey, string>>;
const SHAPES = ["round", "arch", "blobby"];

function toParams(f: SearchFilters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) if (v !== null && v !== undefined && v !== "" && v !== false) out[k] = String(v);
  return out;
}

/* ---------- colour the parts of the sentence that became filters ---------- */
type Span = [start: number, end: number, cls: string];
const DATE_WORDS = /\b(stycz\w*|lut\w*|mar[cz]\w*|kwie\w*|maj\w*|czerw\w*|lip\w*|sierp\w*|wrze\w*|pazdz\w*|listop\w*|grud\w*|january|february|march|april|may|june|july|august|september|october|november|december|weekend\w*|jutro|tomorrow|dzis\w*|today|tonight|piat\w*|sobot\w*|niedziel\w*|friday|saturday|sunday|tydzien|week)\b/g;

function highlight(text: string, f: Filters): Span[] {
  const low = fold(text); // same length as `text` (trimmed by the caller) for Polish/Latin letters
  const spans: Span[] = [];
  const word = (stem: string, cls: string) => {
    if (stem.length < 3) return;
    const m = new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\w*`).exec(low);
    if (m) spans.push([m.index, m.index + m[0].length, cls]);
  };
  const stem = (s: string) => { const x = fold(s); return x.length > 5 ? x.slice(0, x.length - 2) : x.slice(0, 4); };
  if (f.origin_city) word(stem(f.origin_city), "hl-from");
  if (f.event_city) word(stem(f.event_city), "hl-to");
  if (f.genre) word(fold(f.genre).slice(0, 4), "hl-genre");
  if (f.q) { const i = low.indexOf(fold(f.q)); if (i >= 0) spans.push([i, i + f.q.length, "hl-q"]); }
  if (f.date_from || f.date_to) {
    for (const m of low.matchAll(DATE_WORDS)) {
      const before = /(\d{1,2})\s+$/.exec(low.slice(0, m.index));
      spans.push([before ? m.index! - before[0].length : m.index!, m.index! + m[0].length, "hl-date"]);
    }
  }
  if (f.max_price) { const m = /(do|max|maks|under|up to)?\s?\d+\s?(zl|pln|zlotych)/.exec(low); if (m) spans.push([m.index + (m[1] ? m[1].length + 1 : 0), m.index + m[0].length, "hl-price"]); }
  if (f.min_seats) { const m = /\d+\s?(miejsc\w*|osob\w*|seats?|people)/.exec(low); if (m) spans.push([m.index, m.index + m[0].length, "hl-seats"]); }
  spans.sort((a, b) => a[0] - b[0]);
  return spans.filter((s, i) => i === 0 || s[0] >= spans[i - 1][1]);
}

function Highlighted({ text, filters }: { text: string; filters: Filters }) {
  const spans = highlight(text, filters);
  const out: (string | React.ReactElement)[] = [];
  let at = 0;
  spans.forEach(([s, e, cls], i) => {
    if (s > at) out.push(text.slice(at, s));
    out.push(<span key={i} className={`hl ${cls}`}>{text.slice(s, e)}</span>);
    at = e;
  });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

/** Find a ride (v3 AppSearch3 board). */
export default function Search() {
  const { t, day, time, plural } = useI18n();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const text = params.get("text") ?? "";
  const [input, setInput] = useState(text);
  const [editingText, setEditingText] = useState(!text);
  const [source, setSource] = useState<"ai" | "rules" | null>(null);
  const [understood, setUnderstood] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filters = useMemo(() => Object.fromEntries(FILTER_KEYS.filter((k) => params.get(k)).map((k) => [k, params.get(k)!])) as Filters, [params]);
  const hasFilters = Object.keys(filters).length > 0;
  const awaitingParse = !!text && !hasFilters && (parsing || source === null) && understood;

  // Read each submitted sentence once. A URL that already carries filters
  // (shared link, reload) counts as read, so removing its last chip won't
  // silently re-apply the sentence.
  const parsedKey = useRef<string | null>(hasFilters ? `0|${text}` : null);
  const latestKey = useRef("");
  useEffect(() => {
    const key = `${nonce}|${text}`;
    if (!text || hasFilters || parsedKey.current === key) return;
    parsedKey.current = key;
    latestKey.current = key;
    setParsing(true);
    api.search(text)
      .then((res) => {
        if (latestKey.current !== key) return;
        setSource(res.source);
        setUnderstood(res.understood);
        setFormOpen(!res.understood);
        setParams({ text, ...toParams(res.filters) }, { replace: true });
      })
      .catch(() => { if (latestKey.current === key) { setSource(null); setUnderstood(false); setFormOpen(true); } })
      .finally(() => { if (latestKey.current === key) setParsing(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, nonce, hasFilters]);

  const rides = useAsync(() => (awaitingParse ? Promise.resolve(null) : api.rides({ ...filters, min_seats: filters.min_seats ?? 1, limit: 100 })), [JSON.stringify(filters), user?.id, awaitingParse]);
  const event = useAsync(() => (filters.event_id ? api.event(Number(filters.event_id)) : Promise.resolve(null)), [filters.event_id]);

  const send = (s: string) => {
    if (!s.trim()) return;
    setSource(null); setUnderstood(true); setNonce((n) => n + 1); setEditingText(false);
    setParams({ text: s.trim() });
  };
  const submit = (e: FormEvent) => { e.preventDefault(); send(input); };
  const removeFilter = (k: FilterKey) => { const p = new URLSearchParams(params); p.delete(k); setParams(p); };
  useEffect(() => { if (editingText) inputRef.current?.focus(); }, [editingText]);
  useEffect(() => { setInput(text); }, [text]); // back/forward to another sentence

  const list: Ride[] = rides.data ?? [];
  const sel = list.find((r) => r.id === selected) ?? list[0];

  const chipText = (k: FilterKey, v: string): string => {
    switch (k) {
      case "origin_city": return `${t("f.from")} ${v}`;
      case "event_city": return `${t("f.to")} ${v}`;
      case "q": return v;
      case "genre": return v;
      case "date_from": return `${t("f.dateFrom").toLowerCase()} ${day(v)}`;
      case "date_to": return `${t("f.dateTo").toLowerCase()} ${day(v)}`;
      case "max_price": return Number(v) === 0 ? t("f.free") : t("f.maxPrice", { n: v });
      case "min_seats": return `${v}+ ${t("f.seats").toLowerCase()}`;
      default: return v;
    }
  };

  // map: event pins, ride origins, routes; the hovered/selected ride is highlighted
  const pins: MapPin[] = []; const origins: MapOrigin[] = []; const routes: MapRoute[] = [];
  const seenEv = new Set<number>(); const seenOr = new Set<string>();
  for (const r of list) {
    const on = r.id === sel?.id;
    const to = event.data?.id === r.event.id && event.data.latitude != null ? [event.data.latitude, event.data.longitude!] as [number, number] : cityCoords(r.event.city);
    const from = r.origin_lat != null && r.origin_lng != null ? [r.origin_lat, r.origin_lng] as [number, number] : cityCoords(r.origin_city);
    if (to && !seenEv.has(r.event.id)) { seenEv.add(r.event.id); pins.push({ id: r.event.id, pos: to, label: "✶", title: r.event.name, on: r.event.id === sel?.event.id }); }
    if (from && !seenOr.has(r.origin_city)) { seenOr.add(r.origin_city); origins.push({ id: r.origin_city, pos: from, title: r.origin_city.toLowerCase(), on: r.origin_city === sel?.origin_city }); }
    if (from && to) routes.push({ id: r.id, from, to, on });
  }

  return (
    <Screen className="search3">
      {/* sentence search */}
      <form className="sbar" role="search" onSubmit={submit}>
        <label htmlFor="s-q" className="sr-only">{t("landing.ask")}</label>
        {editingText || !text ? (
          <input id="s-q" ref={inputRef} value={input} placeholder={t("landing.example")} onChange={(e) => setInput(e.target.value)} />
        ) : (
          <button type="button" id="s-q" className="said" onClick={() => setEditingText(true)} aria-label={`${t("search.edit")}: ${text}`}>
            <Highlighted text={text.trim()} filters={filters} />
          </button>
        )}
        <button className="go btn3" type="submit" disabled={parsing} onClick={(e) => { if (!editingText && text) { e.preventDefault(); send(text); } }}>
          {text ? t("search.again") : t("search.cta")}
        </button>
      </form>

      {/* filter chips */}
      <div className="chips3">
        {source === "ai" && <span className="src ai">✶ {t("search.ai")}</span>}
        {source === "rules" && <span className="src rules">{t("search.rules")}</span>}
        {filters.event_id && (
          <button type="button" className="c dark" onClick={() => removeFilter("event_id")} aria-label={`${t("search.remove")}: ${event.data?.name ?? ""}`}>
            {event.data ? `${event.data.name}${event.data.event_date ? ` · ${day(event.data.event_date)}` : ""}` : "…"} <Icon name="x" />
          </button>
        )}
        {filters.no_smoking && <button type="button" className="c lime" onClick={() => removeFilter("no_smoking")}>{t("f.smoke").toLowerCase()} ✓</button>}
        {FILTER_KEYS.filter((k) => k !== "event_id" && k !== "no_smoking" && filters[k]).map((k) => (
          <button key={k} type="button" className="c" onClick={() => removeFilter(k)} aria-label={`${t("search.remove")}: ${chipText(k, filters[k]!)}`}>
            {chipText(k, filters[k]!)} <Icon name="x" />
          </button>
        ))}
        <button type="button" className="c" aria-expanded={formOpen} onClick={() => setFormOpen(!formOpen)}>{formOpen ? t("search.hideEdit") : t("search.addFilter")}</button>
        {rides.data && <span className="count">{plural(list.length, "car")} · {user ? t("search.sortedMatch").toLowerCase() : t("search.sortedTime").toLowerCase()}</span>}
      </div>
      {source === "rules" && understood && <p className="note" style={{ marginTop: 10 }}>{t("search.rulesNote")}</p>}
      {!understood && !parsing && <p className="note" style={{ marginTop: 10 }}>{t("search.notUnderstood")}</p>}
      {formOpen && <div className="form3"><FilterForm key={params.toString()} filters={filters} onApply={(f) => setParams({ ...(text ? { text } : {}), ...f })} /></div>}

      <div className="grid">
        {/* list */}
        <div className="rows">
          {!user && <p className="note" style={{ padding: "0 8px 8px" }}>{t("search.loginForMatch")}</p>}
          {(rides.loading || awaitingParse) && <Loading />}
          {rides.error != null && <ErrorBox error={rides.error} onRetry={rides.reload} />}
          {rides.data && !list.length && <Empty title={t("search.empty")}><p className="muted">{t("search.emptyHint")}</p></Empty>}
          {list.map((r, i) => {
            const k = r.match ? matchKey(r.match) : "diff";
            return (
              <Link key={r.id} to={`/rides/${r.id}`} className={`row3${r.id === sel?.id ? " on" : ""}`} onMouseEnter={() => setSelected(r.id)} onFocus={() => setSelected(r.id)}>
                <span className={`sc ${SHAPES[i % 3]} ${r.match ? `s-${k}` : "s-none"}`}>{r.match?.percent ?? "·"}</span>
                <span className="who"><b>{r.driver.display_name}</b>
                  <span>{[r.match && t(`match.${k}`), t(`style.${r.driver.driving_style}`), `${r.origin_city.toLowerCase()} ${time(r.departure_time)}`, !filters.event_id && r.event.name].filter(Boolean).join(" · ")}</span></span>
                <span className="pr">{r.price} zł</span>
              </Link>
            );
          })}
        </div>

        {/* map */}
        <div className="mapwrap">
          <MapView label={t("nav.find")} pins={pins} origins={origins} routes={routes} />
          {sel && (
            <Link className="float" to={`/rides/${sel.id}`}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {sel.match && <span className="num">{sel.match.percent}</span>}<b style={{ fontWeight: 600, fontSize: 16 }}>{sel.driver.display_name}</b>
              </div>
              <div className="mono">{time(sel.departure_time)} → {(sel.event.venue || sel.event.city).toLowerCase()} · {plural(sel.seats_left, "seatLeft")}</div>
            </Link>
          )}
        </div>
      </div>
    </Screen>
  );
}

function FilterForm({ filters, onApply }: { filters: Filters; onApply: (f: Record<string, string>) => void }) {
  const { t } = useI18n();
  const [f, setF] = useState<Record<string, string>>(() => ({ ...filters }));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target.checked ? "true" : "") : e.target.value });
  const fields: [FilterKey, Key, string][] = [["origin_city", "f.from", "text"], ["event_city", "f.to", "text"], ["q", "f.q", "text"], ["genre", "f.genre", "text"], ["date_from", "f.dateFrom", "date"], ["date_to", "f.dateTo", "date"], ["max_price", "f.price", "number"], ["min_seats", "f.seats", "number"]];
  return (
    <form className="filters-form" onSubmit={(e) => { e.preventDefault(); onApply(Object.fromEntries(Object.entries(f).filter(([, v]) => v))); }}>
      {fields.map(([k, label, type]) => (
        <div className="field" key={k}>
          <label htmlFor={`ff-${k}`}>{t(label)}</label>
          <input id={`ff-${k}`} type={type} min={type === "number" ? (k === "min_seats" ? 1 : 0) : undefined} max={k === "min_seats" ? 8 : undefined} value={f[k] ?? ""} onChange={set(k)} />
        </div>
      ))}
      <label className="switch"><input type="checkbox" checked={!!f.no_smoking} onChange={set("no_smoking")} />{t("f.smoke")}</label>
      <div className="row" style={{ justifyContent: "flex-start" }}>
        <button className="btn btn-sm" type="submit">{t("search.apply")}</button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setF({}); onApply({}); }}>{t("search.clear")}</button>
      </div>
    </form>
  );
}
