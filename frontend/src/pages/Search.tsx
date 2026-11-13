import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type Ride, type SearchFilters } from "../api";
import { useAuth } from "../auth";
import { Screen } from "../components/Layout";
import {
  MapView,
  type MapOrigin,
  type MapPin,
  type MapRoute,
} from "../components/MapView";
import {
  AiBadge,
  Empty,
  ErrorBox,
  Icon,
  Loading,
  matchKey,
  Percent,
  shapeFor,
} from "../components/ui";
import { billName, cityCoords, fold } from "../geo";
import { useFittingPlaceholder, useAsync } from "../hooks";
import { useI18n, type Key } from "../i18n";

const FILTER_KEYS = [
  "event_id",
  "q",
  "origin_city",
  "event_city",
  "genre",
  "date_from",
  "date_to",
  "max_price",
  "min_seats",
  "no_smoking",
] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type Filters = Partial<Record<FilterKey, string>>;

function toParams(f: SearchFilters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(f))
    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      value !== false
    )
      out[name] = String(value);
  return out;
}

type Span = [start: number, end: number, cls: string];
const DATE_WORDS =
  /\b(stycz\w*|lut\w*|mar[cz]\w*|kwie\w*|maj\w*|czerw\w*|lip\w*|sierp\w*|wrze\w*|pazdz\w*|listop\w*|grud\w*|january|february|march|april|may|june|july|august|september|october|november|december|weekend\w*|jutro|tomorrow|dzis\w*|today|tonight|piat\w*|sobot\w*|niedziel\w*|friday|saturday|sunday|tydzien|week)\b/g;

function highlight(text: string, f: Filters): Span[] {
  const foldedText = fold(text);
  const spans: Span[] = [];
  const word = (stem: string, cssClass: string) => {
    if (stem.length < 3) return;
    const found = new RegExp(
      `\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\w*`,
    ).exec(foldedText);
    if (found)
      spans.push([found.index, found.index + found[0].length, cssClass]);
  };
  const stem = (input: string) => {
    const folded = fold(input);
    return folded.length > 5
      ? folded.slice(0, folded.length - 2)
      : folded.slice(0, 4);
  };
  if (f.origin_city) word(stem(f.origin_city), "highlight-from");
  if (f.event_city) word(stem(f.event_city), "highlight-to");
  if (f.genre) word(fold(f.genre).slice(0, 4), "highlight-genre");
  if (f.q) {
    const i = foldedText.indexOf(fold(f.q));
    if (i >= 0) spans.push([i, i + f.q.length, "highlight-event"]);
  }
  if (f.date_from || f.date_to) {
    for (const dateWord of foldedText.matchAll(DATE_WORDS)) {
      const before = /(\d{1,2})\s+$/.exec(foldedText.slice(0, dateWord.index));
      spans.push([
        before ? dateWord.index! - before[0].length : dateWord.index!,
        dateWord.index! + dateWord[0].length,
        "highlight-date",
      ]);
    }
  }
  if (f.max_price) {
    const found = /(do|max|maks|under|up to)?\s?\d+\s?(zl|pln|zlotych)/.exec(
      foldedText,
    );
    if (found)
      spans.push([
        found.index + (found[1] ? found[1].length + 1 : 0),
        found.index + found[0].length,
        "highlight-price",
      ]);
  }
  if (f.min_seats) {
    const found = /\d+\s?(miejsc\w*|osob\w*|seats?|people)/.exec(foldedText);
    if (found)
      spans.push([
        found.index,
        found.index + found[0].length,
        "highlight-seats",
      ]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  return spans.filter((span, i) => i === 0 || span[0] >= spans[i - 1][1]);
}

function Highlighted({ text, filters }: { text: string; filters: Filters }) {
  const spans = highlight(text, filters);
  const out: (string | React.ReactElement)[] = [];
  let cursor = 0;
  spans.forEach(([start, end, cssClass], i) => {
    if (start > cursor) out.push(text.slice(cursor, start));
    out.push(
      <span key={i} className={`highlight ${cssClass}`}>
        {text.slice(start, end)}
      </span>,
    );
    cursor = end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}

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
  const [phRef, ph] = useFittingPlaceholder([
    t("landing.example"),
    ...t("landing.exampleShort").split("|"),
  ]);
  const rowsRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const filters = useMemo(
    () =>
      Object.fromEntries(
        FILTER_KEYS.filter((name) => params.get(name)).map((name) => [
          name,
          params.get(name)!,
        ]),
      ) as Filters,
    [params],
  );
  const hasFilters = Object.keys(filters).length > 0;
  const awaitingParse =
    !!text && !hasFilters && (parsing || source === null) && understood;

  const parsedKey = useRef<string | null>(hasFilters ? `0|${text}` : null);
  const latestKey = useRef("");
  useEffect(() => {
    const key = `${nonce}|${text}`;
    if (!text || hasFilters || parsedKey.current === key) return;
    parsedKey.current = key;
    latestKey.current = key;
    setParsing(true);
    api
      .search(text)
      .then((res) => {
        if (latestKey.current !== key) return;
        setSource(res.source);
        setUnderstood(res.understood);
        setFormOpen(!res.understood);
        setParams({ text, ...toParams(res.filters) }, { replace: true });
      })
      .catch(() => {
        if (latestKey.current === key) {
          setSource(null);
          setUnderstood(false);
          setFormOpen(true);
        }
      })
      .finally(() => {
        if (latestKey.current === key) setParsing(false);
      });
  }, [text, nonce, hasFilters]);

  const rides = useAsync(
    () =>
      awaitingParse
        ? Promise.resolve(null)
        : api.rides({
            ...filters,
            min_seats: filters.min_seats ?? 1,
            limit: 100,
          }),
    [JSON.stringify(filters), user?.id, awaitingParse],
  );
  const event = useAsync(
    () =>
      filters.event_id
        ? api.event(Number(filters.event_id))
        : Promise.resolve(null),
    [filters.event_id],
  );

  const send = (sentence: string) => {
    if (!sentence.trim()) return;
    setSource(null);
    setUnderstood(true);
    setNonce((count) => count + 1);
    setEditingText(false);
    setParams({ text: sentence.trim() });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };
  const removeFilter = (name: FilterKey) => {
    const next = new URLSearchParams(params);
    next.delete(name);
    setParams(next);
  };
  useEffect(() => {
    if (editingText) inputRef.current?.focus();
  }, [editingText]);
  useEffect(() => {
    setInput(text);
  }, [text]);

  const list: Ride[] = rides.data ?? [];
  const selectedRide = list.find((ride) => ride.id === selected) ?? list[0];

  const [narrow, setNarrow] = useState(
    () => matchMedia("(max-width: 1100px)").matches,
  );
  useEffect(() => {
    const narrowQuery = matchMedia("(max-width: 1100px)");
    const on = () => setNarrow(narrowQuery.matches);
    narrowQuery.addEventListener("change", on);
    return () => narrowQuery.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const narrowQuery = matchMedia("(max-width: 1100px)");
    let frame = 0;
    const pick = () => {
      frame = 0;
      if (!narrowQuery.matches || !rowsRef.current) return;
      const head = document.querySelector<HTMLElement>(".app-head");
      document.documentElement.style.setProperty(
        "--head-h",
        `${head?.offsetHeight ?? 0}px`,
      );
      const top =
        (head?.offsetHeight ?? 0) + 8 + (mapRef.current?.offsetHeight ?? 0);
      const middle = top + (innerHeight - top) / 2;
      const rows = [
        ...rowsRef.current.querySelectorAll<HTMLElement>(".ride-row[data-id]"),
      ];
      const firstR = rows[0]?.getBoundingClientRect();
      if (firstR && (firstR.top + firstR.bottom) / 2 >= middle) {
        setSelected(Number(rows[0].dataset.id));
        return;
      }
      let best: HTMLElement | null = null,
        dist = Infinity;
      for (const row of rows) {
        const box = row.getBoundingClientRect();
        const distance = Math.abs((box.top + box.bottom) / 2 - middle);
        if (distance < dist) {
          dist = distance;
          best = row;
        }
      }
      if (best) setSelected(Number(best.dataset.id));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(pick);
    };

    let lockUntil = 0,
      lastWheel = 0;
    const onWheel = (e: WheelEvent) => {
      const now = performance.now(),
        fresh = now - lastWheel > 220;
      lastWheel = now;
      if (
        !narrowQuery.matches ||
        !rowsRef.current ||
        e.ctrlKey ||
        Math.abs(e.deltaY) < Math.abs(e.deltaX)
      )
        return;
      const head = document.querySelector<HTMLElement>(".app-head");
      const line =
        (head?.offsetHeight ?? 0) + 8 + (mapRef.current?.offsetHeight ?? 0);
      const middle = line + (innerHeight - line) / 2;
      const stops = [
        0,
        ...[
          ...rowsRef.current.querySelectorAll<HTMLElement>(
            ".ride-row[data-id]",
          ),
        ].map((row) => {
          const box = row.getBoundingClientRect();
          return Math.round(scrollY + (box.top + box.bottom) / 2 - middle);
        }),
      ].filter((offset) => offset >= 0);
      const scrolled = scrollY;
      const next =
        e.deltaY > 0
          ? stops.find((stop) => stop > scrolled + 4)
          : [...stops].reverse().find((s) => s < scrolled - 4);
      if (next === undefined) return;
      e.preventDefault();
      if (!fresh || now < lockUntil) return;
      lockUntil = now + 380;
      scrollTo({ top: next, behavior: "smooth" });
    };

    pick();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    addEventListener("wheel", onWheel, { passive: false });
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      removeEventListener("wheel", onWheel);
      cancelAnimationFrame(frame);
    };
  }, [list.length]);

  const chipText = (k: FilterKey, v: string): string => {
    switch (k) {
      case "origin_city":
        return `${t("f.from")} ${v}`;
      case "event_city":
        return `${t("f.to")} ${v}`;
      case "q":
        return v;
      case "genre":
        return v;
      case "date_from":
        return `${t("f.dateFrom").toLowerCase()} ${day(v)}`;
      case "date_to":
        return `${t("f.dateTo").toLowerCase()} ${day(v)}`;
      case "max_price":
        return Number(v) === 0 ? t("f.free") : t("f.maxPrice", { n: v });
      case "min_seats":
        return `${v}+ ${t("f.seats").toLowerCase()}`;
      default:
        return v;
    }
  };

  const pins: MapPin[] = [];
  const origins: MapOrigin[] = [];
  const routes: MapRoute[] = [];
  const seenEv = new Set<number>();
  const seenOr = new Set<string>();
  for (const ride of list) {
    const on = ride.id === selectedRide?.id;
    const to =
      event.data?.id === ride.event.id && event.data.latitude != null
        ? ([event.data.latitude, event.data.longitude!] as [number, number])
        : cityCoords(ride.event.city);
    const from =
      ride.origin_lat != null && ride.origin_lng != null
        ? ([ride.origin_lat, ride.origin_lng] as [number, number])
        : cityCoords(ride.origin_city);
    if (to && !seenEv.has(ride.event.id)) {
      seenEv.add(ride.event.id);
      pins.push({
        id: ride.event.id,
        pos: to,
        label: "✶",
        title: ride.event.name,
        on: ride.event.id === selectedRide?.event.id,
      });
    }
    if (from && !seenOr.has(ride.origin_city)) {
      seenOr.add(ride.origin_city);
      origins.push({
        id: ride.origin_city,
        pos: from,
        title: ride.origin_city,
        on: ride.origin_city === selectedRide?.origin_city,
      });
    }
    if (from && to) routes.push({ id: ride.id, from, to, on });
  }
  const focusRoute = routes.find((route) => route.on);

  return (
    <Screen className="search-page">
      {/* sentence search */}
      <form className="search-bar" role="search" onSubmit={submit}>
        <label htmlFor="s-q" className="sr-only">
          {t("landing.ask")}
        </label>
        {editingText || !text ? (
          <input
            id="s-q"
            ref={(node) => {
              inputRef.current = node;
              phRef(node);
            }}
            value={input}
            placeholder={ph}
            onChange={(e) => setInput(e.target.value)}
          />
        ) : (
          <button
            type="button"
            id="s-q"
            className="typed-sentence"
            onClick={() => setEditingText(true)}
            aria-label={`${t("search.edit")}: ${text}`}
          >
            <Highlighted text={text.trim()} filters={filters} />
          </button>
        )}
        {/* the sentence is read by AI: say so right where people type it */}
        <span className="search-bar-ai">
          <AiBadge title={t("search.aiHint")} />
        </span>
        <button
          className="submit-btn pill-btn"
          type="submit"
          disabled={parsing}
          onClick={(e) => {
            if (!editingText && text) {
              e.preventDefault();
              send(text);
            }
          }}
        >
          {text ? t("search.again") : t("search.cta")}
        </button>
      </form>

      {/* filter chips */}
      <div className="filter-chips">
        {source === "ai" && (
          <span className="source-tag ai">✶ {t("search.ai")}</span>
        )}
        {source === "rules" && (
          <span className="source-tag rules">{t("search.rules")}</span>
        )}
        {filters.event_id && (
          <button
            type="button"
            className="filter-chip dark"
            onClick={() => removeFilter("event_id")}
            aria-label={`${t("search.remove")}: ${event.data?.name ?? ""}`}
          >
            {event.data
              ? `${event.data.name}${event.data.event_date ? ` · ${day(event.data.event_date)}` : ""}`
              : "…"}{" "}
            <Icon name="x" />
          </button>
        )}
        {filters.no_smoking && (
          <button
            type="button"
            className="filter-chip lime"
            onClick={() => removeFilter("no_smoking")}
          >
            {t("f.smoke").toLowerCase()} ✓
          </button>
        )}
        {FILTER_KEYS.filter(
          (name) =>
            name !== "event_id" && name !== "no_smoking" && filters[name],
        ).map((k) => (
          <button
            key={k}
            type="button"
            className="filter-chip"
            onClick={() => removeFilter(k)}
            aria-label={`${t("search.remove")}: ${chipText(k, filters[k]!)}`}
          >
            {chipText(k, filters[k]!)} <Icon name="x" />
          </button>
        ))}
        <button
          type="button"
          className="filter-chip"
          aria-expanded={formOpen}
          onClick={() => setFormOpen(!formOpen)}
        >
          {formOpen ? t("search.hideEdit") : t("search.addFilter")}
        </button>
        {rides.data && (
          <span className="count">
            {plural(list.length, "car")} ·{" "}
            {user
              ? t("search.sortedMatch").toLowerCase()
              : t("search.sortedTime").toLowerCase()}
          </span>
        )}
      </div>
      {source === "rules" && understood && (
        <p className="note" style={{ marginTop: 10 }}>
          {t("search.rulesNote")}
        </p>
      )}
      {!understood && !parsing && (
        <p className="note" style={{ marginTop: 10 }}>
          {t("search.notUnderstood")}
        </p>
      )}
      {formOpen && (
        <div className="filter-panel">
          <FilterForm
            key={params.toString()}
            filters={filters}
            onApply={(applied) =>
              setParams({ ...(text ? { text } : {}), ...applied })
            }
          />
        </div>
      )}

      <div className="grid">
        {/* list */}
        <div className="ride-list" ref={rowsRef}>
          {!user && (
            <p className="note" style={{ padding: "0 8px 8px" }}>
              {t("search.loginForMatch")}
            </p>
          )}
          {(rides.loading || awaitingParse) && <Loading />}
          {rides.error != null && (
            <ErrorBox error={rides.error} onRetry={rides.reload} />
          )}
          {rides.data && !list.length && (
            <Empty title={t("search.empty")}>
              <p className="muted">{t("search.emptyHint")}</p>
            </Empty>
          )}
          {list.map((ride) => {
            const level = ride.match ? matchKey(ride.match) : "diff";
            return (
              <Link
                key={ride.id}
                data-id={ride.id}
                to={`/rides/${ride.id}`}
                className={`ride-row${ride.id === selectedRide?.id ? " on" : ""}`}
                onMouseEnter={() => setSelected(ride.id)}
                onFocus={() => setSelected(ride.id)}
              >
                <span
                  className={`score-badge ${shapeFor(level)} ${ride.match ? `score-fill-${level}` : "score-fill-none"}${ride.match?.percent === 100 ? " perfect-score" : ""}`}
                >
                  <Percent value={ride.match?.percent} />
                </span>
                <span className="who">
                  <b>{ride.driver.display_name}</b>
                  <span>
                    {[
                      !filters.event_id && billName(ride.event.name),
                      `${ride.origin_city.toLowerCase()} → ${ride.event.city.toLowerCase()}`,
                      time(ride.departure_time),
                      ride.match && t(`match.${level}`),
                      t(`style.${ride.driver.driving_style}`),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="row-price">{ride.price} zł</span>
              </Link>
            );
          })}
        </div>

        {/* map */}
        <div className="map-wrap" ref={mapRef}>
          <MapView
            label={t("nav.find")}
            pins={pins}
            origins={origins}
            routes={routes}
            focus={
              narrow && focusRoute
                ? [focusRoute.from, focusRoute.to]
                : undefined
            }
          />
          {selectedRide && (
            <Link className="floating-card" to={`/rides/${selectedRide.id}`}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {selectedRide.match && (
                  <span className="num">
                    <Percent value={selectedRide.match.percent} />
                  </span>
                )}
                <b style={{ fontWeight: 600, fontSize: 16 }}>
                  {selectedRide.driver.display_name}
                </b>
              </div>
              <div className="mono">
                {time(selectedRide.departure_time)} →{" "}
                {(
                  selectedRide.event.venue || selectedRide.event.city
                ).toLowerCase()}{" "}
                · {plural(selectedRide.seats_left, "seatLeft")}
              </div>
            </Link>
          )}
        </div>
      </div>
    </Screen>
  );
}

function FilterForm({
  filters,
  onApply,
}: {
  filters: Filters;
  onApply: (applied: Record<string, string>) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Record<string, string>>(() => ({
    ...filters,
  }));
  const set = (name: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft({
      ...draft,
      [name]:
        e.target.type === "checkbox"
          ? e.target.checked
            ? "true"
            : ""
          : e.target.value,
    });
  const fields: [FilterKey, Key, string][] = [
    ["origin_city", "f.from", "text"],
    ["event_city", "f.to", "text"],
    ["q", "f.q", "text"],
    ["genre", "f.genre", "text"],
    ["date_from", "f.dateFrom", "date"],
    ["date_to", "f.dateTo", "date"],
    ["max_price", "f.price", "number"],
    ["min_seats", "f.seats", "number"],
  ];

  const cities = useAsync(() => api.cities(), []);
  const [eventHints, setEventHints] = useState<string[]>([]);
  const needle = (draft.q ?? "").trim();
  useEffect(() => {
    if (needle.length < 2) {
      setEventHints([]);
      return;
    }
    let live = true;
    const id = setTimeout(() => {
      api
        .events({ q: needle, limit: 8 })
        .then((events) => {
          if (live) setEventHints([...new Set(events.map((e) => e.name))]);
        })
        .catch(() => {});
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [needle]);
  const lists: Partial<Record<FilterKey, string[]>> = {
    q: eventHints,
    origin_city: (cities.data ?? []).map((entry) => entry.city),
    event_city: (cities.data ?? []).map((entry) => entry.city),
  };
  return (
    <form
      className="filters-form"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(
          Object.fromEntries(
            Object.entries(draft).filter(([, value]) => value),
          ),
        );
      }}
    >
      {fields.map(([name, label, type]) => (
        <div className="field" key={name}>
          <label htmlFor={`ff-${name}`}>{t(label)}</label>
          <input
            id={`ff-${name}`}
            type={type}
            min={type === "number" ? (name === "min_seats" ? 1 : 0) : undefined}
            max={name === "min_seats" ? 8 : undefined}
            value={draft[name] ?? ""}
            onChange={set(name)}
            list={lists[name] ? `ffl-${name}` : undefined}
            autoComplete={lists[name] ? "off" : undefined}
          />
          {lists[name] && (
            <datalist id={`ffl-${name}`}>
              {lists[name]!.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          )}
        </div>
      ))}
      <label className="switch">
        <input
          type="checkbox"
          checked={!!draft.no_smoking}
          onChange={set("no_smoking")}
        />
        {t("f.smoke")}
      </label>
      <div className="row" style={{ justifyContent: "flex-start" }}>
        <button className="btn btn-sm" type="submit">
          {t("search.apply")}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={() => {
            setDraft({});
            onApply({});
          }}
        >
          {t("search.clear")}
        </button>
      </div>
    </form>
  );
}
