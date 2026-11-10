import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, errorKey, type Event } from "../api";
import { Page } from "../components/Layout";
import { EventRow } from "../components/Rows";
import { Loading } from "../components/ui";
import { cityCoords } from "../geo";
import { useI18n, type Key } from "../i18n";

export default function OfferRide() {
  const { t, day } = useI18n();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Event[] | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [origin, setOrigin] = useState("");
  const [departure, setDeparture] = useState("");
  const [seats, setSeats] = useState(3);
  const [price, setPrice] = useState(40);
  const [smoking, setSmoking] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Preselected event (?event_id=) from an event page.
  useEffect(() => {
    const id = Number(params.get("event_id"));
    if (id) api.event(id).then(pick).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced event search.
  useEffect(() => {
    if (event) return;
    const q = query.trim();
    if (q.length < 2) { setResults(null); return; }
    let live = true;
    const h = setTimeout(() => api.events({ q, limit: 8 }).then((r) => { if (live) setResults(r); }).catch(() => { if (live) setResults([]); }), 250);
    return () => { live = false; clearTimeout(h); };
  }, [query, event]);

  function pick(e: Event) {
    setEvent(e);
    setResults(null);
    if (e.event_date) setDeparture(`${e.event_date}T12:00`);
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!event) { setError(t("offer.needEvent")); return; }
    setBusy(true);
    setError("");
    const coords = cityCoords(origin);
    try {
      const ride = await api.createRide({
        event_id: event.id, origin_city: origin.trim(), departure_time: departure, seats_total: seats, price, smoking_allowed: smoking,
        note: note.trim() || null, origin_lat: coords?.[0] ?? null, origin_lng: coords?.[1] ?? null,
      });
      nav(`/drive?ride=${ride.id}`);
    } catch (err) {
      setError(t(errorKey(err) as Key));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <form className="form" onSubmit={submit}>
        <h1 className="disp">{t("offer.title")}</h1>

        <div className="group">
          <span className="label">{t("offer.event")}</span>
          {event ? (
            <div className="row" style={{ background: "var(--bg)", borderRadius: 32, padding: "6px 10px 6px 6px", flexWrap: "nowrap" }}>
              <div style={{ minWidth: 0, flex: 1 }}><EventRow ev={event} i={0} asStatic /></div>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setEvent(null); setQuery(""); }}>{t("offer.change")}</button>
            </div>
          ) : (
            <>
              <div className="field"><label htmlFor="of-q" className="sr-only">{t("offer.event")}</label>
                <input id="of-q" type="search" placeholder={t("offer.eventPh")} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" /></div>
              {results === null && query.trim().length >= 2 && <Loading />}
              {results && results.map((ev, i) => <EventRow key={ev.id} ev={ev} i={i} onSelect={() => pick(ev)} />)}
            </>
          )}
          {event?.event_date && <span className="note">{day(event.event_date)}</span>}
        </div>

        <div className="grid2">
          <div className="field"><label htmlFor="of-origin">{t("offer.origin")}</label>
            <input id="of-origin" required maxLength={60} placeholder={t("offer.originPh")} value={origin} onChange={(e) => setOrigin(e.target.value)} /></div>
          <div className="field"><label htmlFor="of-when">{t("offer.when")}</label>
            <input id="of-when" type="datetime-local" required value={departure} max={event?.event_date ? `${event.event_date}T23:59` : undefined} onChange={(e) => setDeparture(e.target.value)} /></div>
          <div className="field"><label htmlFor="of-seats">{t("offer.seats")}</label>
            <input id="of-seats" type="number" min={1} max={8} required value={seats} onChange={(e) => setSeats(Number(e.target.value))} /></div>
          <div className="field"><label htmlFor="of-price">{t("offer.price")}</label>
            <input id="of-price" type="number" min={0} max={1000} step={1} required value={price} onChange={(e) => setPrice(Number(e.target.value))} /></div>
        </div>
        <label className="switch"><input type="checkbox" checked={smoking} onChange={(e) => setSmoking(e.target.checked)} />{t("offer.smoking")}</label>
        <div className="field"><label htmlFor="of-note">{t("offer.note")}</label>
          <textarea id="of-note" maxLength={500} placeholder={t("offer.notePh")} value={note} onChange={(e) => setNote(e.target.value)} /></div>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-pink" type="submit" disabled={busy}>{t("offer.submit")}</button>
      </form>
    </Page>
  );
}
