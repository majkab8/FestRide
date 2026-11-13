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
    const counts = new Map<number, number>();
    for (const ride of rides.data ?? []) counts.set(ride.event.id, (counts.get(ride.event.id) ?? 0) + 1);
    return counts;
  }, [rides.data]);

  const months = useMemo(() => [...new Set((events.data ?? []).map((e) => e.event_date?.slice(0, 7)).filter(Boolean) as string[])].slice(0, 6), [events.data]);

  const list = useMemo(() => {
    const needle = fold(query);
    return (events.data ?? []).filter((e) =>
      (monthKey === "all" || e.event_date?.startsWith(monthKey)) &&
      (!needle || fold(`${e.name} ${e.venue ?? ""} ${e.city} ${e.genre ?? ""}`).includes(needle)));
  }, [events.data, monthKey, query]);

  const visible = list.slice(0, shown);
  const selectedEvent: Event | undefined = visible.find((e) => e.id === selected) ?? visible[0];
  const pins: MapPin[] = visible.filter((e) => e.latitude != null && e.longitude != null)
    .map((e) => ({ id: e.id, pos: [e.latitude!, e.longitude!], label: String(rideCount.get(e.id) ?? "·"), title: e.name, on: e.id === selectedEvent?.id }));

  return (
    <Page>
      <div className="split">
        <div className="list">
          <div className="list-head"><h1 className="display-title" style={{ fontSize: "clamp(34px,4.4vw,52px)" }}>{t("events.title")}</h1>
            {events.data && <span className="note">{plural(list.length, "event")}</span>}</div>
          <div className="field" style={{ padding: "0 6px 10px" }}>
            <label htmlFor="ev-q" className="sr-only">{t("events.search")}</label>
            <input id="ev-q" type="search" placeholder={t("events.search")} value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
          </div>
          <div className="chips months" style={{ padding: "0 6px 12px" }}>
            <button className="chip" type="button" aria-pressed={monthKey === "all"} onClick={() => { setMonthKey("all"); setShown(PAGE); }}>{t("events.all")}</button>
            {months.map((yearMonth) => <button key={yearMonth} className="chip" type="button" aria-pressed={monthKey === yearMonth} onClick={() => { setMonthKey(yearMonth); setShown(PAGE); }}>{month(`${yearMonth}-01`)}</button>)}
          </div>

          {events.loading && <Loading />}
          {events.error != null && <ErrorBox error={events.error} onRetry={events.reload} />}
          {events.data && !list.length && <Empty title={t("events.empty")} />}

          {selectedEvent && (
            <div className="ticket" style={{ marginBottom: 10 }}>
              <div>
                <div className="note">{[selectedEvent.event_date && day(selectedEvent.event_date), selectedEvent.venue, selectedEvent.city].filter(Boolean).join(" · ")}</div>
                <h2 className="display-title" style={{ fontSize: 34, marginTop: 6 }}>{selectedEvent.name}</h2>
              </div>
              <div className="row">
                <span className="note">{plural(rideCount.get(selectedEvent.id) ?? 0, "ride")}</span>
                <Link className="btn btn-pink" to={`/search?event_id=${selectedEvent.id}`}>{t("events.showRides")}<Icon name="arrow" /></Link>
              </div>
            </div>
          )}

          {visible.map((e, i) => <EventRow key={e.id} ev={e} i={i} on={e.id === selectedEvent?.id} rides={rideCount.get(e.id) ?? 0} onSelect={() => setSelected(e.id)} />)}
          {list.length > shown && <button className="btn btn-ghost" type="button" style={{ marginTop: 10 }} onClick={() => setShown(shown + PAGE)}>{t("events.more")}</button>}
        </div>
        <MapView label={t("events.title")} pins={pins} onPin={(id) => setSelected(Number(id))} />
      </div>
    </Page>
  );
}
