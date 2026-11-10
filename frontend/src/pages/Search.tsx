import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type Explanations, type Ride, type SearchFilters } from "../api";
import { useAuth } from "../auth";
import { Page } from "../components/Layout";
import { MapView, type MapOrigin, type MapPin, type MapRoute } from "../components/MapView";
import { RideRow } from "../components/Rows";
import { Empty, ErrorBox, Icon, Loading } from "../components/ui";
import { cityCoords } from "../geo";
import { useAsync } from "../hooks";
import { useI18n, type Key } from "../i18n";

/* Filters live in the URL, so a search can be shared and survives a reload.
   Keys are exactly GET /rides query parameters. */
const FILTER_KEYS = ["event_id", "q", "origin_city", "event_city", "genre", "date_from", "date_to", "max_price", "min_seats", "no_smoking"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

function toParams(f: SearchFilters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) if (v !== null && v !== undefined && v !== "" && v !== false) out[k] = String(v);
  return out;
}

export default function Search() {
  const { t, lang, day, plural } = useI18n();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const text = params.get("text") ?? "";
  const [input, setInput] = useState(text);
  const [source, setSource] = useState<"ai" | "rules" | null>(null);
  const [understood, setUnderstood] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [nonce, setNonce] = useState(0); // re-parse even when the same sentence is sent again
  const [editing, setEditing] = useState(false);
  const [why, setWhy] = useState<Explanations["rides"]>({});

  const filters = useMemo(() => Object.fromEntries(FILTER_KEYS.filter((k) => params.get(k)).map((k) => [k, params.get(k)!])) as Partial<Record<FilterKey, string>>, [params]);
  const hasFilters = Object.keys(filters).length > 0;
  const awaitingParse = !!text && !hasFilters && (parsing || source === null) && understood;

  // A sentence without filters yet: ask the backend to read it, once per submit.
  // The router applies the cleared URL a render after `nonce` changes, so wait
  // for `hasFilters` to drop, and remember which submit was already read (so
  // removing every chip by hand doesn't silently re-apply the sentence).
  const parsedKey = useRef<string | null>(null);
  const latestKey = useRef<string>("");
  useEffect(() => {
    const key = `${nonce}|${text}`;
    if (!text || hasFilters || parsedKey.current === key) return;
    parsedKey.current = key;
    latestKey.current = key;
    setParsing(true);
    api.search(text)
      .then((res) => {
        if (latestKey.current !== key) return; // a newer sentence was sent meanwhile
        setSource(res.source);
        setUnderstood(res.understood);
        setEditing(!res.understood);
        setParams({ text, ...toParams(res.filters) }, { replace: true });
      })
      .catch(() => { if (latestKey.current === key) { setSource(null); setUnderstood(false); setEditing(true); } })
      .finally(() => { if (latestKey.current === key) setParsing(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, nonce, hasFilters]);

  // Wait for the sentence to be read, so we never flash (or explain) the unfiltered list.
  const rides = useAsync(() => (awaitingParse ? Promise.resolve(null) : api.rides({ ...filters, min_seats: filters.min_seats ?? 1, limit: 100 })), [JSON.stringify(filters), user?.id, awaitingParse]);
  const event = useAsync(() => (filters.event_id ? api.event(Number(filters.event_id)) : Promise.resolve(null)), [filters.event_id]);

  // AI one-liners for the top five, after the list is on screen.
  useEffect(() => {
    setWhy({});
    const top = (rides.data ?? []).filter((r) => r.match).slice(0, 5).map((r) => r.id);
    if (!user || !top.length) return;
    let live = true;
    api.explain({ ride_ids: top, lang }).then((r) => { if (live) setWhy(r.rides); }).catch(() => {});
    return () => { live = false; };
  }, [rides.data, user, lang]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = input.trim();
    if (!s) return;
    setSource(null);
    setUnderstood(true);
    setNonce((n) => n + 1);
    setParams({ text: s });
  };
  const removeFilter = (k: FilterKey) => { const p = new URLSearchParams(params); p.delete(k); setParams(p); };

  const chipLabel = (k: FilterKey, v: string): [string, string] => {
    switch (k) {
      case "event_id": return [t("f.event"), event.data?.name ?? "…"];
      case "origin_city": return [t("f.from"), v];
      case "event_city": return [t("f.to"), v];
      case "q": return [t("f.q"), v];
      case "genre": return [t("f.genre"), v];
      case "date_from": return [t("f.dateFrom"), day(v)];
      case "date_to": return [t("f.dateTo"), day(v)];
      case "max_price": return [t("f.price"), Number(v) === 0 ? t("f.free") : t("f.maxPrice", { n: v })];
      case "min_seats": return [t("f.seats"), `${v}+`];
      case "no_smoking": return [t("f.smoke"), ""];
    }
  };
  const chipClass: Record<FilterKey, string> = { event_id: "k-q", q: "k-q", genre: "k-genre", origin_city: "k-from", event_city: "k-to", date_from: "k-date", date_to: "k-date", max_price: "k-price", min_seats: "k-seats", no_smoking: "k-smoke" };

  const list: Ride[] = rides.data ?? [];
  const pins: MapPin[] = []; const origins: MapOrigin[] = []; const routes: MapRoute[] = [];
  const seenEv = new Set<number>(); const seenOr = new Set<string>();
  list.forEach((r, i) => {
    const to = event.data?.id === r.event.id && event.data.latitude != null ? [event.data.latitude, event.data.longitude!] as [number, number] : cityCoords(r.event.city);
    const from = r.origin_lat != null && r.origin_lng != null ? [r.origin_lat, r.origin_lng] as [number, number] : cityCoords(r.origin_city);
    if (to && !seenEv.has(r.event.id)) { seenEv.add(r.event.id); pins.push({ id: r.event.id, pos: to, label: "✶", title: r.event.name, on: i === 0 }); }
    if (from && !seenOr.has(r.origin_city)) { seenOr.add(r.origin_city); origins.push({ id: r.origin_city, pos: from, title: r.origin_city.toLowerCase(), on: i === 0 }); }
    if (from && to) routes.push({ id: r.id, from, to, on: i === 0 });
  });

  return (
    <Page>
      <section className="sky compact">
        <h1 className="disp">{t("search.title")}</h1>
        <p style={{ maxWidth: 560 }}>{t("search.sub")}</p>
        <form className="ask" role="search" onSubmit={submit}>
          <label htmlFor="s-q" className="sr-only">{t("landing.ask")}</label>
          <Icon name="spark" />
          <input id="s-q" value={input} placeholder={t("landing.example")} onChange={(e) => setInput(e.target.value)} />
          <button className="btn" type="submit" disabled={parsing}>{t("search.cta")}</button>
        </form>
        <div className="examples">
          {[t("landing.example"), t("search.examples1"), t("search.examples2")].map((x) => <button key={x} type="button" onClick={() => { setInput(x); setSource(null); setUnderstood(true); setNonce((n) => n + 1); setParams({ text: x }); }}>{x}</button>)}
        </div>
      </section>

      <div className="split">
        <div className="list" style={{ gap: 14 }}>
          <div className="card">
            <div className="row">
              <div className="row" style={{ justifyContent: "flex-start" }}>
                <span className="eyebrow">{t("search.read")}</span>
                {source === "ai" && <span className="src ai"><Icon name="spark" />{t("search.ai")}</span>}
                {source === "rules" && <span className="src rules">{t("search.rules")}</span>}
              </div>
              <button className="btn btn-ghost btn-sm" type="button" aria-expanded={editing} onClick={() => setEditing(!editing)}>{editing ? t("search.hideEdit") : t("search.edit")}</button>
            </div>
            {parsing && <Loading />}
            {source === "rules" && understood && <p className="note">{t("search.rulesNote")}</p>}
            {!understood && !parsing && <p className="note">{t("search.notUnderstood")}</p>}
            {text && <p className="disp" style={{ fontSize: 22, lineHeight: 1.25 }}>“{text}”</p>}
            {hasFilters && (
              <div className="reading-chips">
                {FILTER_KEYS.filter((k) => filters[k]).map((k) => {
                  const [label, value] = chipLabel(k, filters[k]!);
                  return <button key={k} type="button" className={`fchip ${chipClass[k]}`} onClick={() => removeFilter(k)} aria-label={`${t("search.remove")}: ${label} ${value}`}><span className="k">{label}</span>{value}<Icon name="x" /></button>;
                })}
              </div>
            )}
            {editing && <FilterForm key={params.toString()} filters={filters} onApply={(f) => setParams({ ...(text ? { text } : {}), ...f })} />}
          </div>

          <div className="section-title" style={{ padding: "0 6px" }}>
            <h2 className="disp">{rides.data ? plural(list.length, "ride") : t("nav.find")}</h2>
            <span className="note">{user ? t("search.sortedMatch") : t("search.sortedTime")}</span>
          </div>
          {!user && <p className="note" style={{ padding: "0 6px" }}>{t("search.loginForMatch")}</p>}
          {(rides.loading || awaitingParse) && <Loading />}
          {rides.error != null && <ErrorBox error={rides.error} onRetry={rides.reload} />}
          {rides.data && !list.length && <Empty title={t("search.empty")}><p className="muted">{t("search.emptyHint")}</p></Empty>}
          {list.map((r, i) => <RideRow key={r.id} ride={r} i={i} why={why[String(r.id)]} />)}
        </div>
        <MapView label={t("nav.find")} pins={pins} origins={origins} routes={routes} />
      </div>
    </Page>
  );
}

function FilterForm({ filters, onApply }: { filters: Partial<Record<FilterKey, string>>; onApply: (f: Record<string, string>) => void }) {
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
