import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, errorKey, type Event } from "../api";
import { Page } from "../components/Layout";
import { EventRow } from "../components/Rows";
import { AiBadge, Loading } from "../components/ui";
import { cityCoords } from "../geo";
import { useAsync } from "../hooks";
import { parseLocal, useI18n, type Key } from "../i18n";

export default function OfferRide() {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Event[] | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const suggested = useRef<{ q: string; events: Event[] } | null>(null);
  useEffect(() => {
    if (!listOpen) return;
    const away = (e: MouseEvent) => { if (!pickerRef.current?.contains(e.target as Node)) setListOpen(false); };
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === "Escape") setListOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", closeOnEscape); };
  }, [listOpen]);
  const [origin, setOrigin] = useState("");
  const [departure, setDeparture] = useState("");
  const [seats, setSeats] = useState(3);
  const [price, setPrice] = useState(40);
  const [smoking, setSmoking] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const myRides = useAsync(() => api.myRides(), []);
  const existing = event ? (myRides.data ?? []).find((ride) => ride.event.id === event.id && parseLocal(ride.departure_time) > new Date()) : undefined;
  const [busy, setBusy] = useState(false);
  const [sentence, setSentence] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftInfo, setDraftInfo] = useState<"" | "ai" | "rules" | "none" | "error">("");
  const [writing, setWriting] = useState(false);
  const [noteBy, setNoteBy] = useState<"" | "ai" | "template">("");

  const fillFromSentence = async () => {
    const text = sentence.trim();
    if (!text) return;
    setDrafting(true);
    try {
      const draft = await api.offerDraft(text);
      if (draft.event) pick(draft.event);
      else if (draft.event_hint) {
        setEvent(null);
        suggested.current = draft.event_options.length ? { q: draft.event_hint, events: draft.event_options } : null;
        setQuery(draft.event_hint);
        setListOpen(true);
      }
      if (draft.origin_city) setOrigin(draft.origin_city);
      if (draft.departure) setDeparture(draft.departure);
      if (draft.seats) setSeats(draft.seats);
      if (draft.price !== null) setPrice(draft.price);
      if (draft.smoking_allowed !== null) setSmoking(draft.smoking_allowed);
      if (draft.note && !note.trim()) setNote(draft.note);
      setDraftInfo(draft.understood ? draft.source : "none");
    } catch {
      setDraftInfo("error");
    } finally {
      setDrafting(false);
    }
  };

  const writeNote = async () => {
    setWriting(true);
    try {
      const result = await api.rideNote({ event_id: event?.id ?? null, origin_city: origin.trim() || null, departure: departure || null, smoking_allowed: smoking, hint: note.trim() || null, lang });
      setNote(result.text);
      setNoteBy(result.source);
    } catch {
      setNoteBy("");
    } finally {
      setWriting(false);
    }
  };

  useEffect(() => {
    const id = Number(params.get("event_id"));
    if (id) api.event(id).then(pick).catch(() => {});
  }, []);

  useEffect(() => {
    if (event) return;
    const needle = query.trim();
    if (needle.length < 2) { setResults(null); return; }
    if (suggested.current?.q === query) { setResults(suggested.current.events); return; }
    let live = true;
    const timer = setTimeout(() => api.events({ q: needle, limit: 8 }).then((found) => { if (live) setResults(found); }).catch(() => { if (live) setResults([]); }), 250);
    return () => { live = false; clearTimeout(timer); };
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
        <h1 className="display-title">{t("offer.title")}</h1>

        {/* AI: describe the ride in one sentence and the form fills itself */}
        <div className="ai-fill">
          <label htmlFor="of-ai" className="label">{t("offer.aiLabel")} <AiBadge /></label>
          <div className="ai-row">
            <input id="of-ai" value={sentence} maxLength={400} placeholder={t("offer.aiPh")} onChange={(e) => setSentence(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fillFromSentence(); } }} />
            <button className="btn btn-sm" type="button" onClick={fillFromSentence} disabled={drafting || !sentence.trim()}>{drafting ? t("offer.aiBusy") : t("offer.aiFill")}</button>
          </div>
          {draftInfo && <p className="note" role="status">{t(`offer.ai.${draftInfo}` as Key)}</p>}
        </div>

        <div className="group">
          <span className="label">{t("offer.event")}</span>
          {event ? (
            <div className="row" style={{ background: "var(--bg)", borderRadius: 32, padding: "6px 10px 6px 6px", flexWrap: "nowrap" }}>
              <div style={{ minWidth: 0, flex: 1 }}><EventRow ev={event} i={0} asStatic posters /></div>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setEvent(null); setQuery(""); }}>{t("offer.change")}</button>
            </div>
          ) : null}
          {event && existing && (
            <p className="error" role="alert">{t("offer.haveOne")} <Link to={`/drive?ride=${existing.id}`}>{t("offer.manageIt")}</Link></p>
          )}
          {event ? null : (
            <>
              <div className="event-picker" ref={pickerRef}>
                <div className="field"><label htmlFor="of-q" className="sr-only">{t("offer.event")}</label>
                  <input id="of-q" type="search" placeholder={t("offer.eventPh")} value={query} autoComplete="off" aria-expanded={listOpen && !!results?.length} aria-controls="of-results"
                    onChange={(e) => { setQuery(e.target.value); setListOpen(true); }} onFocus={() => setListOpen(true)} /></div>
                {/* results float over the form as a dropdown instead of pushing it down */}
                {listOpen && query.trim().length >= 2 && (
                  <div className="event-results" id="of-results">
                    {results === null ? <Loading /> : results.map((ev, i) => <EventRow key={ev.id} ev={ev} i={i} posters onSelect={() => { pick(ev); setListOpen(false); }} />)}
                  </div>
                )}
              </div>
            </>
          )}
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
        <div className="field">
          <div className="note-head">
            <label htmlFor="of-note">{t("offer.note")}</label>
            <button className="btn btn-ghost btn-sm ai-write" type="button" onClick={writeNote} disabled={writing}>
              {writing ? t("offer.writing") : <>✶ {t("offer.writeForMe")}</>}
            </button>
          </div>
          <textarea id="of-note" maxLength={500} placeholder={t("offer.notePh")} value={note} onChange={(e) => { setNote(e.target.value); setNoteBy(""); }} />
          {noteBy && <span className="hint">{noteBy === "ai" ? <><AiBadge /> {t("offer.noteByAi")}</> : t("offer.noteByTemplate")}</span>}
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-pink" type="submit" disabled={busy || !!existing}>{t("offer.submit")}</button>
      </form>
    </Page>
  );
}
