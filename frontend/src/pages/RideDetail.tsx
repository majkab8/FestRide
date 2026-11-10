import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, errorKey } from "../api";
import { useAuth } from "../auth";
import { Page } from "../components/Layout";
import { MapView } from "../components/MapView";
import { Avatar, Empty, ErrorBox, Icon, Loading, Wristband } from "../components/ui";
import { cityCoords } from "../geo";
import { useAsync } from "../hooks";
import { useI18n, parseLocal, type Key } from "../i18n";

export default function RideDetail() {
  const { id } = useParams();
  const rideId = Number(id);
  const { t, lang, dayTime, time, day } = useI18n();
  const { user, ready } = useAuth();
  const nav = useNavigate();
  const ride = useAsync(() => api.ride(rideId), [rideId, user?.id]);
  const mine = useAsync(() => (user ? api.myRequests() : Promise.resolve([])), [user?.id]);
  const event = useAsync(() => (ride.data ? api.event(ride.data.event.id) : Promise.resolve(null)), [ride.data?.event.id]);
  const [why, setWhy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setWhy(null);
    if (!user || !ride.data?.match) return;
    let live = true;
    api.explain({ ride_ids: [rideId], lang }).then((r) => { if (live) setWhy(r.rides[String(rideId)] ?? null); }).catch(() => {});
    return () => { live = false; };
  }, [user, ride.data?.match, rideId, lang]);

  if (ride.loading && !ride.data) return <Page><Loading /></Page>;
  if (ride.error instanceof ApiError && ride.error.status === 404) return <Page><Empty title={t("ride.notFound")}><Link className="btn btn-sm" to="/search">{t("nav.find")}</Link></Empty></Page>;
  if (ride.error || !ride.data) return <Page><ErrorBox error={ride.error} onRetry={ride.reload} /></Page>;

  const r = ride.data;
  const own = user?.id === r.driver.id;
  const req = (mine.data ?? []).find((q) => q.ride_id === r.id);
  const departed = parseLocal(r.departure_time) <= new Date();
  const taken = r.seats_total - r.seats_left;
  const m = r.match;

  const ask = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.askSeat(r.id, message.trim());
      mine.reload();
      ride.reload();
    } catch (err) {
      setError(t(errorKey(err) as Key));
    } finally {
      setBusy(false);
    }
  };

  const to = event.data?.latitude != null ? [event.data.latitude, event.data.longitude!] as [number, number] : cityCoords(r.event.city);
  const from = r.origin_lat != null ? [r.origin_lat, r.origin_lng!] as [number, number] : cityCoords(r.origin_city);

  const bars: [string, number, number, string][] = m ? [
    [`${t("landing.music")}${m.shared_genres.length ? `: ${m.shared_genres.join(", ")}` : ""}`, m.music, 60, "var(--pink)"],
    [`${t("landing.style")}: ${t(`style.${r.driver.driving_style}`)}`, m.style, 25, "var(--blue)"],
    [`${t("landing.smoking")}: ${r.smoking_allowed ? t("ride.smokingOk") : t("ride.noSmoking")}`, m.smoking, 15, "var(--lime)"],
  ] : [];

  return (
    <Page>
      <div className="home-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <button type="button" className="back" onClick={() => ((window.history.state?.idx ?? 0) > 0 ? nav(-1) : nav("/search"))} style={{ border: 0, background: "none", padding: 0, alignSelf: "flex-start", minHeight: 44, display: "inline-flex", gap: 6, alignItems: "center", color: "var(--muted)" }}>
            <Icon name="back" />{t("ride.back")}
          </button>
          <div className="row" style={{ justifyContent: "flex-start", alignItems: "flex-end", gap: 24, flexWrap: "nowrap" }}>
            <Avatar name={r.driver.display_name} size={110} />
            <div style={{ minWidth: 0 }}>
              <h1 className="disp" style={{ fontSize: "clamp(40px,6vw,72px)" }}>{t("ride.with", { name: r.driver.display_name })}</h1>
              <p className="muted" style={{ marginTop: 10, fontSize: 17 }}>{r.driver.music_genres.join(", ")} · {t(`style.${r.driver.driving_style}`)}</p>
            </div>
          </div>

          {m && <div style={{ margin: "8px -16px" }}><Wristband ride={r} /></div>}

          <div className="grid2">
            {m && (
              <div className="card">
                <h2 style={{ fontSize: 20 }}>{t("ride.why", { n: m.percent })}</h2>
                <div className="bars">
                  {bars.map(([label, score, max, color]) => (
                    <div key={label}>
                      <div className="row"><span>{label}</span><span>{Math.round(score * max)} / {max}</span></div>
                      <div className="bar"><i style={{ width: `${score * 100}%`, background: color }} /></div>
                    </div>
                  ))}
                </div>
                {why && <div className="why"><Icon name="spark" /><span>{why}</span></div>}
              </div>
            )}
            <div className="card">
              <h2 style={{ fontSize: 20 }}>{t("ride.route")}</h2>
              <div className="bars" style={{ gap: 6 }}>
                <div className="row"><span>● {r.origin_city}</span><span>{time(r.departure_time)}</span></div>
                <div className="note" style={{ paddingLeft: 4 }}>{dayTime(r.departure_time)}</div>
                <div className="row"><span style={{ color: "var(--pink)" }}>● {[r.event.venue, r.event.city].filter(Boolean).join(", ")}</span><span>{r.event.event_date ? day(r.event.event_date) : ""}</span></div>
              </div>
              <p style={{ fontWeight: 700 }}>{r.event.name}</p>
              {r.note && <div><div className="note">{t("ride.note")}</div><p className="disp" style={{ fontSize: 18, letterSpacing: "-0.01em", lineHeight: 1.35 }}>“{r.note}”</p></div>}
            </div>
          </div>
          {to && <div style={{ height: 320 }}><MapView label={t("ride.route")} pins={[{ id: "ev", pos: to, label: "✶", title: r.event.venue || r.event.city, on: true }]}
            origins={from ? [{ id: "o", pos: from, title: r.origin_city.toLowerCase(), on: true }] : []} routes={from ? [{ id: "r", from, to, on: true }] : []} /></div>}
        </div>

        <aside className="ticket" style={{ position: "sticky", top: 96 }}>
          <div className="row" style={{ alignItems: "baseline" }}><span className="num" style={{ fontSize: 60, lineHeight: 1 }}>{r.price} zł</span><span className="note">{t("ride.perSeat")}</span></div>
          <div className="seats" role="group" aria-label={t("ride.seatsAria", { taken, total: r.seats_total })}>
            {Array.from({ length: r.seats_total }, (_, i) => i < taken
              ? <span key={i} className="taken">{t("ride.taken")}</span>
              : i === taken && !own && !req && !departed ? <span key={i} className="you">{t("ride.you")}</span> : <span key={i} className="free">{t("ride.free")}</span>)}
          </div>

          {!ready || (user && mine.loading) ? (
            <Loading />
          ) : user && mine.error ? (
            <ErrorBox error={mine.error} onRetry={mine.reload} />
          ) : own ? (
            <><p>{t("ride.own")}</p><Link className="btn btn-pink" to={`/drive?ride=${r.id}`}>{t("ride.manage")}</Link></>
          ) : req ? (
            <><span className={`pill ${req.status}`} style={{ alignSelf: "flex-start" }}>{t(`ride.status.${req.status}`)}</span>
              {req.status === "pending" && <p className="note">{t("ride.sent")}</p>}</>
          ) : departed ? (
            <p>{t("ride.left")}</p>
          ) : r.seats_left <= 0 ? (
            <p>{t("ride.full")}</p>
          ) : !user ? (
            <Link className="btn btn-pink" to={`/login?next=/rides/${r.id}`}>{t("ride.loginToAsk")}</Link>
          ) : (
            <form onSubmit={ask} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field"><label htmlFor="ask-msg">{t("ride.message")}</label>
                <textarea id="ask-msg" maxLength={300} placeholder={t("ride.messagePh")} value={message} onChange={(e) => setMessage(e.target.value)} /></div>
              {error && <p className="error" role="alert">{error}</p>}
              <button className="btn btn-pink" type="submit" disabled={busy}>{t("ride.ask")}</button>
            </form>
          )}
          {!own && <p className="note">{t("ride.multi")}</p>}
        </aside>
      </div>
    </Page>
  );
}
