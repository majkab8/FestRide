import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Event } from "../api";
import { Page } from "../components/Layout";
import { MapView, type MapPin } from "../components/MapView";
import { EventRow } from "../components/Rows";
import { Empty, ErrorBox, Icon, Loading } from "../components/ui";
import { fold } from "../geo";
import { useAsync } from "../hooks";
import { useI18n } from "../i18n";

const PAGE = 30;

export default function Events() {
  const { t, month, day, plural } = useI18n();
  const events = useAsync(() => api.events({ limit: 1000 }), []);
  const rides = useAsync(() => api.rides({ limit: 500, sort: "departure" }), []);
  const [monthKey, setMonthKey] = useState("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<number | null>(null);

  const rideCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of rides.data ?? []) m.set(r.event.id, (m.get(r.event.id) ?? 0) + 1);
    return m;
  }, [rides.data]);

  const months = useMemo(() => [...new Set((events.data ?? []).map((e) => e.event_date?.slice(0, 7)).filter(Boolean) as string[])].slice(0, 6), [events.data]);

  const list = useMemo(() => {
    const q = fold(query);
    return (events.data ?? []).filter((e) =>
      (monthKey === "all" || e.event_date?.startsWith(monthKey)) &&
      (!q || fold(`${e.name} ${e.venue ?? ""} ${e.city} ${e.genre ?? ""}`).includes(q)));
  }, [events.data, monthKey, query]);

  const visible = list.slice(0, shown);
  const sel: Event | undefined = visible.find((e) => e.id === selected) ?? visible[0];
  const pins: MapPin[] = visible.filter((e) => e.latitude != null && e.longitude != null)
    .map((e) => ({ id: e.id, pos: [e.latitude!, e.longitude!], label: String(rideCount.get(e.id) ?? "·"), title: e.name, on: e.id === sel?.id }));

  return (
    <Page>
      <div className="split">
        <div className="list">
          <div className="list-head"><h1 className="disp" style={{ fontSize: "clamp(34px,4.4vw,52px)" }}>{t("events.title")}</h1>
            {events.data && <span className="note">{plural(list.length, "event")}</span>}</div>
          <div className="field" style={{ padding: "0 6px 10px" }}>
            <label htmlFor="ev-q" className="sr-only">{t("events.search")}</label>
            <input id="ev-q" type="search" placeholder={t("events.search")} value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
          </div>
          <div className="chips" style={{ padding: "0 6px 12px" }}>
            <button className="chip" type="button" aria-pressed={monthKey === "all"} onClick={() => { setMonthKey("all"); setShown(PAGE); }}>{t("events.all")}</button>
            {months.map((m) => <button key={m} className="chip" type="button" aria-pressed={monthKey === m} onClick={() => { setMonthKey(m); setShown(PAGE); }}>{month(`${m}-01`)}</button>)}
          </div>

          {events.loading && <Loading />}
          {events.error != null && <ErrorBox error={events.error} onRetry={events.reload} />}
          {events.data && !list.length && <Empty title={t("events.empty")} />}

          {sel && (
            <div className="ticket" style={{ marginBottom: 10 }}>
              <div>
                <div className="note">{[sel.event_date && day(sel.event_date), sel.venue, sel.city].filter(Boolean).join(" · ")}</div>
                <h2 className="disp" style={{ fontSize: 34, marginTop: 6 }}>{sel.name}</h2>
              </div>
              <div className="row">
                <span className="note">{plural(rideCount.get(sel.id) ?? 0, "ride")}</span>
                <Link className="btn btn-pink" to={`/search?event_id=${sel.id}`}>{t("events.showRides")}<Icon name="arrow" /></Link>
              </div>
            </div>
          )}

          {visible.map((e, i) => <EventRow key={e.id} ev={e} i={i} on={e.id === sel?.id} rides={rideCount.get(e.id) ?? 0} onSelect={() => setSelected(e.id)} />)}
          {list.length > shown && <button className="btn btn-ghost" type="button" style={{ marginTop: 10 }} onClick={() => setShown(shown + PAGE)}>{t("events.more")}</button>}
        </div>
        <MapView label={t("events.title")} pins={pins} onPin={(id) => setSelected(Number(id))} />
      </div>
    </Page>
  );
}
