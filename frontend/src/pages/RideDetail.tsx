import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, errorKey } from "../api";
import { useAuth } from "../auth";
import { Screen } from "../components/Layout";
import { AiBadge, CountUp, Empty, ErrorBox, Icon, Loading, matchKey } from "../components/ui";
import { initials } from "../geo";
import { useAsync } from "../hooks";
import { parseLocal, useI18n, type Key } from "../i18n";

/** Ride detail + ask for a seat (v3 AppRide3 board). */
export default function RideDetail() {
  const { id } = useParams();
  const rideId = Number(id);
  const { t, lang, day, time, plural } = useI18n();
  const { user, ready } = useAuth();
  const nav = useNavigate();
  const ride = useAsync(() => api.ride(rideId), [rideId, user?.id]);
  const mine = useAsync(() => (user ? api.myRequests() : Promise.resolve([])), [user?.id]);
  const others = useAsync(() => (ride.data ? api.rides({ event_id: ride.data.event.id, limit: 100 }) : Promise.resolve([])), [ride.data?.event.id]);
  const [why, setWhy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sure, setSure] = useState(false); // "are you sure?" before withdrawing

  useEffect(() => {
    setWhy(null);
    if (!user || !ride.data?.match) return;
    let live = true;
    api.explain({ ride_ids: [rideId], lang }).then((r) => { if (live) setWhy(r.rides[String(rideId)] ?? null); }).catch(() => {});
    return () => { live = false; };
  }, [user, ride.data?.match, rideId, lang]);

  if (ride.loading && !ride.data) return <Screen><Loading /></Screen>;
  if (ride.error instanceof ApiError && ride.error.status === 404) return <Screen><Empty title={t("ride.notFound")}><Link className="btn btn-sm" to="/search">{t("nav.find")}</Link></Empty></Screen>;
  if (ride.error || !ride.data) return <Screen><ErrorBox error={ride.error} onRetry={ride.reload} /></Screen>;

  const r = ride.data;
  const m = r.match;
  const k = m ? matchKey(m) : "diff";
  const own = user?.id === r.driver.id;
  const found = (mine.data ?? []).find((q) => q.ride_id === r.id);
  const req = found?.status === "cancelled" ? undefined : found; // withdrew: free to ask again
  const askedOthers = (mine.data ?? []).filter((q) => q.ride.event.id === r.event.id && q.ride_id !== r.id && q.status === "pending").length;
  const departed = parseLocal(r.departure_time) <= new Date();
  const taken = r.seats_total - r.seats_left;
  const firstName = r.driver.display_name.split(" ")[0];
  const carsHere = others.data?.length ?? 0;

  const withdraw = async () => {
    if (!req) return;
    setBusy(true);
    setError("");
    try {
      await api.cancelRequest(req.id);
      setSure(false);
      mine.reload();
      ride.reload();
    } catch (err) {
      setError(t(errorKey(err) as Key));
    } finally {
      setBusy(false);
    }
  };

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

  const goBack = () => ((window.history.state?.idx ?? 0) > 0 ? nav(-1) : nav(`/search?event_id=${r.event.id}`));
  const bandBits = [...r.driver.music_genres.slice(0, 2), t(`ride.carStyle.${r.driver.driving_style}`), r.smoking_allowed ? t("ride.smokingOk") : t("ride.noSmoking")];
  const bars: [string, number, number, string][] = m ? [
    [`${t("landing.music")}${m.shared_genres.length ? `: ${m.shared_genres.join(", ")}` : ""}`, m.music, 60, "var(--pink)"],
    [`${t("landing.style")}: ${t(`style.${r.driver.driving_style}`)}`, m.style, 25, "var(--blue)"],
  ] : [];
  // smoking is yes/no (both smoke or both don't): +15 or 0, shown as a chip rather than a bar
  const meSmokes = !!user?.smoker, driverSmokes = r.driver.smoker;
  const smokingWords = meSmokes === driverSmokes
    ? t(meSmokes ? "smoke.bothYes" : "smoke.bothNo")
    : t(meSmokes ? "smoke.youOnly" : "smoke.driverOnly", { name: firstName });

  return (
    <Screen>
      <div className="ride3">
        <div style={{ minWidth: 0 }}>
          <button type="button" className="back" onClick={goBack}>
            <Icon name="back" />{carsHere ? t("ride.carsTo", { cars: plural(carsHere, "car"), event: r.event.name }) : t("ride.back")}
          </button>
          <div className="who3">
            <span className="ava blobby" aria-hidden="true">{initials(r.driver.display_name)}</span>
            <div style={{ minWidth: 0 }}>
              <h1 className="h1">{t("ride.with", { name: r.driver.display_name })}</h1>
              <div className="tagline">{r.driver.music_genres.join(", ")} · {t("ride.drives", { style: t(`style.${r.driver.driving_style}`) })}</div>
            </div>
          </div>

          {/* wristband */}
          {m && (
            <div className="band-row" aria-hidden="true">
              <div className="wb">
                <div className="stub"><span className="num"><CountUp to={m.percent} suffix="%" /></span><span>{t(`match.${k}`).split(" ").join("\n")}</span></div>
                <span className="poster">{bandBits.join(" ✶ ")}</span>
              </div>
            </div>
          )}

          <div className="cards">
            {m && (
              <div className="cd">
                <h2>{t("ride.why", { n: m.percent })}</h2>
                <div className="bars3">
                  {bars.map(([label, score, max, color]) => (
                    <div key={label}>
                      <div className="r"><span>{label}</span><span>{Math.round(score * max)} / {max}</span></div>
                      <div className="t"><i style={{ width: `${score * 100}%`, background: color }} /></div>
                    </div>
                  ))}
                  {m && (
                    <div className="r yn-row"><span>{t("landing.smoking")}</span><span className={`yn${m.smoking ? " on" : ""}`}>{smokingWords} · {m.smoking ? "+15" : "0"}</span></div>
                  )}
                </div>
                {why && <div className="why3"><Icon name="spark" /><span>{why} <AiBadge /></span></div>}
              </div>
            )}
            <div className="cd">
              <h2>{t("ride.route")}</h2>
              <div className="route">
                <span className="o" /><span>{r.origin_city.toLowerCase()}</span><span>{time(r.departure_time)}</span>
                <span className="l" /><span className="mut">{day(r.departure_time)}</span><span />
                <span className="d" /><span>{[r.event.city, r.event.venue].filter(Boolean).join(", ").toLowerCase()}</span><span>{r.event.event_date ? day(r.event.event_date) : ""}</span>
              </div>
              <div className="pills">
                <span>{r.event.name}</span>
                <span>{plural(r.seats_left, "seatLeft")}</span>
                <span className={r.smoking_allowed ? "warn" : undefined}>{r.smoking_allowed ? t("ride.smokingOk") : t("ride.noSmoking")}</span>
              </div>
              {r.note && <p className="note3">“{r.note}”</p>}
            </div>
          </div>
        </div>

        {/* booking panel */}
        <aside>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <span className="num">{r.price} zł</span><span className="pp">{t("ride.perSeat")}</span>
          </div>
          <div className="seats3" role="group" aria-label={t("ride.seatsAria", { taken, total: r.seats_total })}>
            {Array.from({ length: r.seats_total }, (_, i) => i < taken
              ? (req?.status === "accepted" && i === taken - 1
                ? <span key={i} className="t me">{t("ride.yourSeat")}</span> /* your own seat once the driver said yes */
                : <span key={i} className="t">{t("ride.taken")}</span>)
              : i === taken && !own && !req && !departed && !r.cancelled ? <span key={i} className="y">{t("ride.you")}</span> : <span key={i} className="f">{t("ride.free")}</span>)}
          </div>

          {!ready || (user && mine.loading) ? <Loading />
            : user && mine.error ? <ErrorBox error={mine.error} onRetry={mine.reload} />
            : r.cancelled ? <><span className="state called_off">{t("ride.status.called_off")}</span><p className="fine">{t("ride.calledOffNote")}</p></>
            : own ? <><p style={{ marginTop: 22 }}>{t("ride.own")}</p><Link className="askbtn btn3" to={`/drive?ride=${r.id}`}>{t("ride.manage")}</Link></>
            : req ? <>
                <span className={`state ${req.status}`}>{t(`ride.status.${req.status}`)}</span>
                {req.status === "pending" && <p className="fine">{t("ride.sent")}</p>}
                {req.status === "removed" && <p className="fine">{t("ride.removedNote")}</p>}
                {(req.status === "pending" || req.status === "accepted") && !departed && (
                  <div className="quit">
                    {!sure
                      ? <button type="button" className="linkish" onClick={() => setSure(true)}>{t(req.status === "accepted" ? "ride.giveUp" : "ride.withdraw")}</button>
                      : <><span>{t(req.status === "accepted" ? "ride.giveUpSure" : "ride.withdrawSure")}</span>
                          <button type="button" className="btn btn-sm" disabled={busy} onClick={withdraw}>{t("ride.sureYes")}</button>
                          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setSure(false)}>{t("ride.sureNo")}</button></>}
                    {error && <p className="err" role="alert">{error}</p>}
                  </div>
                )}
              </>
            : departed ? <p className="fine">{t("ride.left")}</p>
            : r.seats_left <= 0 ? <p className="fine">{t("ride.full")}</p>
            : !user ? <Link className="askbtn btn3" to={`/login?next=/rides/${r.id}`}>{t("ride.loginToAsk")}</Link>
            : (
              <form onSubmit={ask}>
                <label htmlFor="ask-msg">{t("ride.lineFor", { name: firstName })}</label>
                <textarea id="ask-msg" maxLength={300} placeholder={t("ride.messagePh")} value={message} onChange={(e) => setMessage(e.target.value)} />
                {error && <p className="err" role="alert">{error}</p>}
                <button className="askbtn btn3" type="submit" disabled={busy}>{t("ride.askName", { name: firstName })}</button>
              </form>
            )}
          {!own && !r.cancelled && <p className="fine">{askedOthers ? t("ride.askedOthers", { n: askedOthers }) : t("ride.multi")}</p>}
        </aside>
      </div>
    </Screen>
  );
}
