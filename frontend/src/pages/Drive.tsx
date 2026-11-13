import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, errorKey, type JoinRequest } from "../api";
import { REQUESTS_CHANGED, Screen } from "../components/Layout";
import {
  AiBadge,
  Empty,
  ErrorBox,
  Icon,
  Loading,
  matchKey,
  Percent,
} from "../components/ui";
import { useAsync } from "../hooks";
import { parseLocal, useI18n, type Key } from "../i18n";

export default function Drive() {
  const { t, lang, day, time, plural } = useI18n();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const rides = useAsync(() => api.myRides(), []);
  const now = new Date();
  const list = [...(rides.data ?? [])].sort((a, b) => {
    const aIsPast = parseLocal(a.departure_time) < now,
      bIsPast = parseLocal(b.departure_time) < now;
    return aIsPast === bIsPast
      ? a.departure_time.localeCompare(b.departure_time)
      : aIsPast
        ? 1
        : -1;
  });
  const ride =
    list.find((candidate) => candidate.id === Number(params.get("ride"))) ??
    list[0];
  const selectedId = ride?.id;
  const all = useAsync(async () => {
    const entries = await Promise.all(
      (rides.data ?? []).map(
        async (myRide) =>
          [myRide.id, await api.rideRequests(myRide.id)] as const,
      ),
    );
    return new Map<number, JoinRequest[]>(entries);
  }, [rides.data]);
  const reqs = (selectedId && all.data?.get(selectedId)) || [];
  const [why, setWhy] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  const pending = reqs.filter((request) => request.status === "pending");
  const accepted = reqs.filter((request) => request.status === "accepted");
  const declined = reqs.filter((request) => request.status === "declined");
  const withdrew = reqs.filter((request) => request.status === "cancelled");
  const removed = reqs.filter((request) => request.status === "removed");
  const [removing, setRemoving] = useState<number | null>(null);
  const [callingOff, setCallingOff] = useState(false);

  useEffect(() => {
    setWhy({});
    setRemoving(null);
    setCallingOff(false);
  }, [selectedId, lang]);
  const pendingKey = pending
    .slice(0, 5)
    .map((request) => request.id)
    .join(",");
  useEffect(() => {
    const requestIds = pendingKey ? pendingKey.split(",").map(Number) : [];
    if (!requestIds.length) return;
    let live = true;
    api
      .explain({ request_ids: requestIds, lang })
      .then((response) => {
        if (live) setWhy((previous) => ({ ...previous, ...response.requests }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pendingKey, lang]);

  const decide = async (
    request: JoinRequest,
    status: "accepted" | "declined",
  ) => {
    setBusy(request.id);
    setError("");
    try {
      await api.decide(request.id, status);
      rides.reload();
      window.dispatchEvent(new Event(REQUESTS_CHANGED));
    } catch (err) {
      setError(t(errorKey(err) as Key));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (request: JoinRequest) => {
    setBusy(request.id);
    setError("");
    try {
      await api.removePassenger(request.id);
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

  if (rides.loading && !rides.data)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (rides.error)
    return (
      <Screen>
        <ErrorBox error={rides.error} onRetry={rides.reload} />
      </Screen>
    );
  if (!list.length)
    return (
      <Screen>
        <Empty title={t("drive.none")}>
          <Link className="btn btn-pink" to="/drive/new">
            {t("drive.new")}
          </Link>
        </Empty>
      </Screen>
    );

  const full = ride ? ride.seats_left <= 0 : false;
  const departed = ride ? parseLocal(ride.departure_time) <= now : false;
  const verb = (count: number) =>
    t(
      lang === "en"
        ? count === 1
          ? "drive.wantOne"
          : "drive.wantFew"
        : new Intl.PluralRules("pl").select(count) === "few"
          ? "drive.wantFew"
          : "drive.wantOne",
    );

  return (
    <Screen>
      <div className="driver-page">
        {/* rides I offer */}
        <aside className="my-rides-nav" aria-label={t("drive.yours")}>
          <div className="small-label">{t("drive.yours")}</div>
          {list.map((myRide) => {
            const past = parseLocal(myRide.departure_time) < now;
            const fresh = (all.data?.get(myRide.id) ?? []).filter(
              (request) => request.status === "pending",
            ).length;
            return (
              <Link
                key={myRide.id}
                to={`?ride=${myRide.id}`}
                className={`item${myRide.id === selectedId ? " on" : ""}${past ? " past" : ""}`}
                aria-current={myRide.id === selectedId ? "true" : undefined}
              >
                <span style={{ minWidth: 0 }}>
                  <b>{myRide.event.name}</b>
                  <br />
                  <small>
                    {day(myRide.departure_time)} ·{" "}
                    {past
                      ? t("drive.done")
                      : t("drive.seatsTaken", {
                          taken: myRide.seats_total - myRide.seats_left,
                          total: myRide.seats_total,
                        })}
                  </small>
                </span>
                {!past && fresh > 0 && (
                  <span className="new-badge">
                    {t("drive.fresh", { n: fresh })}
                  </span>
                )}
              </Link>
            );
          })}
          <Link className="offer pill-btn" to="/drive/new">
            {t("drive.new")}
          </Link>
        </aside>

        {ride && (
          <section style={{ minWidth: 0 }}>
            <div className="ride-head">
              <div style={{ minWidth: 0 }}>
                <div className="mono">
                  {day(ride.departure_time)} · {ride.origin_city.toLowerCase()}{" "}
                  {time(ride.departure_time)} →{" "}
                  {(ride.event.venue || ride.event.city).toLowerCase()} ·{" "}
                  {t("drive.perSeat", { n: ride.price })}
                </div>
                <h1 className="h1">
                  {t("drive.title", {
                    from: ride.origin_city,
                    event: ride.event.name,
                  })}
                </h1>
              </div>
              <div className="fuel-total">
                {t("drive.fill", { n: ride.price * ride.seats_total })}
              </div>
            </div>
            {ride.note && <p className="driver-note">“{ride.note}”</p>}

            <div
              className="seat-bar"
              role="group"
              aria-label={t("ride.seatsAria", {
                taken: accepted.length,
                total: ride.seats_total,
              })}
            >
              {Array.from({ length: ride.seats_total }, (_, i) => {
                const seated = accepted[i];
                if (!seated)
                  return (
                    <div key={i} className="seat-free">
                      {t("drive.seatFree", { n: i + 1 })}
                    </div>
                  );
                const first = seated.passenger.display_name.split(" ")[0];
                return removing === seated.id ? (
                  <div key={i} className="seat-taken confirming">
                    {t("drive.removeSure", { name: first })}
                    <button
                      type="button"
                      disabled={busy === seated.id}
                      onClick={() => remove(seated)}
                    >
                      {t("drive.yes")}
                    </button>
                    <button
                      type="button"
                      disabled={busy === seated.id}
                      onClick={() => setRemoving(null)}
                    >
                      {t("drive.no")}
                    </button>
                  </div>
                ) : (
                  <div key={i} className="seat-taken">
                    {seated.passenger.display_name}{" "}
                    <span>
                      {t("drive.seatN", { n: i + 1 })}
                      {seated.match ? ` · ${seated.match.percent}%` : ""}
                    </span>
                    {!departed && (
                      <button
                        type="button"
                        className="remove-btn"
                        aria-label={t("drive.remove", {
                          name: seated.passenger.display_name,
                        })}
                        title={t("drive.remove", {
                          name: seated.passenger.display_name,
                        })}
                        onClick={() => setRemoving(seated.id)}
                      >
                        <Icon name="x" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <h2 className="requests-title poster">
              {pending.length
                ? t("drive.want", {
                    n: plural(pending.length, "person"),
                    verb: verb(pending.length),
                  })
                : t("drive.noRequests")}
            </h2>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {all.loading && !all.data && <Loading />}
            {all.error != null && (
              <ErrorBox error={all.error} onRetry={all.reload} />
            )}
            {pending.length > 0 && (
              <div className="request-tickets">
                {pending.map((request) => {
                  const level = request.match
                    ? matchKey(request.match)
                    : "diff";
                  const first = request.passenger.display_name.split(" ")[0];
                  return (
                    <article className="request-ticket" key={request.id}>
                      <div className="ticket-body">
                        <div className="passenger">
                          <span className={`num score-text-${level}`}>
                            <Percent value={request.match?.percent} />
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <b>{request.passenger.display_name}</b>
                            <br />
                            <small>
                              {request.passenger.music_genres
                                .slice(0, 3)
                                .join(", ")}{" "}
                              · {t(`style.${request.passenger.driving_style}`)}
                            </small>
                          </div>
                        </div>
                        {request.message ? (
                          <q>{request.message}</q>
                        ) : (
                          <div style={{ minHeight: 46 }} />
                        )}
                        {why[String(request.id)] && (
                          <div className="ai-reason">
                            <Icon name="spark" />
                            <span>
                              {why[String(request.id)]} <AiBadge />
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ticket-cut" />
                      <div className="ticket-actions">
                        <button
                          type="button"
                          className="decline"
                          disabled={busy === request.id}
                          onClick={() => decide(request, "declined")}
                        >
                          {t("drive.notNow")}
                        </button>
                        <button
                          type="button"
                          className="accept pill-btn"
                          disabled={busy === request.id || full || departed}
                          onClick={() => decide(request, "accepted")}
                        >
                          {full
                            ? t("drive.full")
                            : t("drive.take", { name: first })}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {declined.length > 0 && (
              <p className="note" style={{ marginTop: 18 }}>
                {t("drive.decided")}:{" "}
                {declined
                  .map((request) => request.passenger.display_name)
                  .join(", ")}
              </p>
            )}
            {withdrew.length > 0 && (
              <p className="note" style={{ marginTop: 8 }}>
                {t("drive.withdrew")}:{" "}
                {withdrew
                  .map((request) => request.passenger.display_name)
                  .join(", ")}
              </p>
            )}
            {removed.length > 0 && (
              <p className="note" style={{ marginTop: 8 }}>
                {t("drive.removed")}:{" "}
                {removed
                  .map((request) => request.passenger.display_name)
                  .join(", ")}
              </p>
            )}

            {!departed && (
              <div className="call-off">
                {!callingOff ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setCallingOff(true)}
                  >
                    {t("drive.callOff")}
                  </button>
                ) : (
                  <>
                    <span>
                      {pending.length + accepted.length
                        ? t("drive.callOffSureWith")
                        : t("drive.callOffSure")}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={busy === -ride.id}
                      onClick={callOff}
                    >
                      {t("drive.callOffYes")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy === -ride.id}
                      onClick={() => setCallingOff(false)}
                    >
                      {t("drive.callOffNo")}
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </Screen>
  );
}
