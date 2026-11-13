import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, errorKey, type JoinRequest } from "../api";
import { REQUESTS_CHANGED, Screen } from "../components/Layout";
import { AiBadge, Empty, ErrorBox, Icon, Loading, matchKey } from "../components/ui";
import { useAsync } from "../hooks";
import { parseLocal, useI18n, type Key } from "../i18n";

export default function Drive() {
  const { t, lang, day, time, plural } = useI18n();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const rides = useAsync(() => api.myRides(), []);
  const now = new Date();
  const list = [...(rides.data ?? [])].sort((a, b) => {
    const pa = parseLocal(a.departure_time) < now, pb = parseLocal(b.departure_time) < now;
    return pa === pb ? a.departure_time.localeCompare(b.departure_time) : pa ? 1 : -1;
  });
  const ride = list.find((r) => r.id === Number(params.get("ride"))) ?? list[0];
  const selectedId = ride?.id;
  const all = useAsync(async () => {
    const entries = await Promise.all((rides.data ?? []).map(async (r) => [r.id, await api.rideRequests(r.id)] as const));
    return new Map<number, JoinRequest[]>(entries);
  }, [rides.data]);
  const reqs = (selectedId && all.data?.get(selectedId)) || [];
  const [why, setWhy] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  const pending = reqs.filter((q) => q.status === "pending");
  const accepted = reqs.filter((q) => q.status === "accepted");
  const declined = reqs.filter((q) => q.status === "declined");
  const withdrew = reqs.filter((q) => q.status === "cancelled");
  const removed = reqs.filter((q) => q.status === "removed");
  const [removing, setRemoving] = useState<number | null>(null);
  const [callingOff, setCallingOff] = useState(false);

  useEffect(() => { setWhy({}); setRemoving(null); setCallingOff(false); }, [selectedId, lang]);
  const pendingKey = pending.slice(0, 5).map((q) => q.id).join(",");
  useEffect(() => {
    const ids = pendingKey ? pendingKey.split(",").map(Number) : [];
    if (!ids.length) return;
    let live = true;
    api.explain({ request_ids: ids, lang }).then((r) => { if (live) setWhy((w) => ({ ...w, ...r.requests })); }).catch(() => {});
    return () => { live = false; };
  }, [pendingKey, lang]);

  const decide = async (q: JoinRequest, status: "accepted" | "declined") => {
    setBusy(q.id);
    setError("");
    try {
      await api.decide(q.id, status);
      rides.reload();
      window.dispatchEvent(new Event(REQUESTS_CHANGED));
    } catch (err) {
      setError(t(errorKey(err) as Key));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (q: JoinRequest) => {
    setBusy(q.id);
    setError("");
    try {
      await api.removePassenger(q.id);
      setRemoving(null);
      rides.reload();
    } catch (err) {
      setError(t(errorKey(err) as Key));
    } finally {
      setBusy(null);
    }
  };

  const callOff = async () => {
    if (!ride) return;
    setBusy(-ride.id);
    setError("");
    try {
      await api.cancelRide(ride.id);
      setCallingOff(false);
      nav("/drive", { replace: true });
      rides.reload();
      window.dispatchEvent(new Event(REQUESTS_CHANGED));
    } catch (err) {
      setError(t(errorKey(err) as Key));
    } finally {
      setBusy(null);
    }
  };

  if (rides.loading && !rides.data) return <Screen><Loading /></Screen>;
  if (rides.error) return <Screen><ErrorBox error={rides.error} onRetry={rides.reload} /></Screen>;
  if (!list.length) return <Screen><Empty title={t("drive.none")}><Link className="btn btn-pink" to="/drive/new">{t("drive.new")}</Link></Empty></Screen>;

  const full = ride ? ride.seats_left <= 0 : false;
  const departed = ride ? parseLocal(ride.departure_time) <= now : false;
  const verb = (n: number) => t(lang === "en" ? (n === 1 ? "drive.wantOne" : "drive.wantFew") : new Intl.PluralRules("pl").select(n) === "few" ? "drive.wantFew" : "drive.wantOne");

  return (
    <Screen>
      <div className="driver3">
        {/* rides I offer */}
        <aside className="side3" aria-label={t("drive.yours")}>
          <div className="lbl">{t("drive.yours")}</div>
          {list.map((r) => {
            const past = parseLocal(r.departure_time) < now;
            const fresh = (all.data?.get(r.id) ?? []).filter((q) => q.status === "pending").length;
            return (
              <Link key={r.id} to={`?ride=${r.id}`} className={`item${r.id === selectedId ? " on" : ""}${past ? " past" : ""}`} aria-current={r.id === selectedId ? "true" : undefined}>
                <span style={{ minWidth: 0 }}><b>{r.event.name}</b><br />
                  <small>{day(r.departure_time)} · {past ? t("drive.done") : t("drive.seatsTaken", { taken: r.seats_total - r.seats_left, total: r.seats_total })}</small></span>
                {!past && fresh > 0 && <span className="new">{t("drive.fresh", { n: fresh })}</span>}
              </Link>
            );
          })}
          <Link className="offer btn3" to="/drive/new">{t("drive.new")}</Link>
        </aside>

        {ride && (
          <section style={{ minWidth: 0 }}>
            <div className="head">
              <div style={{ minWidth: 0 }}>
                <div className="mono">{day(ride.departure_time)} · {ride.origin_city.toLowerCase()} {time(ride.departure_time)} → {(ride.event.venue || ride.event.city).toLowerCase()} · {t("drive.perSeat", { n: ride.price })}</div>
                <h1 className="h1">{t("drive.title", { from: ride.origin_city, event: ride.event.name })}</h1>
              </div>
              <div className="fill">{t("drive.fill", { n: ride.price * ride.seats_total })}</div>
            </div>
            {ride.note && <p className="note3">“{ride.note}”</p>}

            <div className="seatbar" role="group" aria-label={t("ride.seatsAria", { taken: accepted.length, total: ride.seats_total })}>
              {Array.from({ length: ride.seats_total }, (_, i) => {
                const q = accepted[i];
                if (!q) return <div key={i} className="f">{t("drive.seatFree", { n: i + 1 })}</div>;
                const first = q.passenger.display_name.split(" ")[0];
                return removing === q.id
                  ? <div key={i} className="t ask">{t("drive.removeSure", { name: first })}
                      <button type="button" disabled={busy === q.id} onClick={() => remove(q)}>{t("drive.yes")}</button>
                      <button type="button" disabled={busy === q.id} onClick={() => setRemoving(null)}>{t("drive.no")}</button></div>
                  : <div key={i} className="t">{q.passenger.display_name} <span>{t("drive.seatN", { n: i + 1 })}{q.match ? ` · ${q.match.percent}` : ""}</span>
                      {!departed && <button type="button" className="x" aria-label={t("drive.remove", { name: q.passenger.display_name })} title={t("drive.remove", { name: q.passenger.display_name })} onClick={() => setRemoving(q.id)}><Icon name="x" /></button>}</div>;
              })}
            </div>

            <h2 className="want poster">{pending.length ? t("drive.want", { n: plural(pending.length, "person"), verb: verb(pending.length) }) : t("drive.noRequests")}</h2>
            {error && <p className="error" role="alert">{error}</p>}
            {all.loading && !all.data && <Loading />}
            {all.error != null && <ErrorBox error={all.error} onRetry={all.reload} />}
            {pending.length > 0 && (
              <div className="tix3">
                {pending.map((q) => {
                  const k = q.match ? matchKey(q.match) : "diff";
                  const first = q.passenger.display_name.split(" ")[0];
                  return (
                    <article className="tk" key={q.id}>
                      <div className="b">
                        <div className="who">
                          <span className={`num c-${k}`}>{q.match?.percent ?? "·"}</span>
                          <div style={{ minWidth: 0 }}><b>{q.passenger.display_name}</b><br />
                            <small>{q.passenger.music_genres.slice(0, 3).join(", ")} · {t(`style.${q.passenger.driving_style}`)}</small></div>
                        </div>
                        {q.message ? <q>{q.message}</q> : <div style={{ minHeight: 46 }} />}
                        {why[String(q.id)] && <div className="ai"><Icon name="spark" /><span>{why[String(q.id)]} <AiBadge /></span></div>}
                      </div>
                      <div className="cut" />
                      <div className="acts">
                        <button type="button" className="no" disabled={busy === q.id} onClick={() => decide(q, "declined")}>{t("drive.notNow")}</button>
                        <button type="button" className="yes btn3" disabled={busy === q.id || full || departed} onClick={() => decide(q, "accepted")}>{full ? t("drive.full") : t("drive.take", { name: first })}</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {declined.length > 0 && (
              <p className="note" style={{ marginTop: 18 }}>{t("drive.decided")}: {declined.map((q) => q.passenger.display_name).join(", ")}</p>
            )}
            {withdrew.length > 0 && (
              <p className="note" style={{ marginTop: 8 }}>{t("drive.withdrew")}: {withdrew.map((q) => q.passenger.display_name).join(", ")}</p>
            )}
            {removed.length > 0 && (
              <p className="note" style={{ marginTop: 8 }}>{t("drive.removed")}: {removed.map((q) => q.passenger.display_name).join(", ")}</p>
            )}

            {!departed && (
              <div className="calloff">
                {!callingOff
                  ? <button type="button" className="linkish" onClick={() => setCallingOff(true)}>{t("drive.callOff")}</button>
                  : <>
                      <span>{pending.length + accepted.length ? t("drive.callOffSureWith") : t("drive.callOffSure")}</span>
                      <button type="button" className="btn btn-sm" disabled={busy === -ride.id} onClick={callOff}>{t("drive.callOffYes")}</button>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy === -ride.id} onClick={() => setCallingOff(false)}>{t("drive.callOffNo")}</button>
                    </>}
              </div>
            )}
          </section>
        )}
      </div>
    </Screen>
  );
}
