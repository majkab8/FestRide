import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, errorKey } from "../api";
import { useAuth } from "../auth";
import { Screen } from "../components/Layout";
import {
  AiBadge,
  CountUp,
  Empty,
  ErrorBox,
  Icon,
  Loading,
  matchKey,
} from "../components/ui";
import { initials } from "../geo";
import { useAsync } from "../hooks";
import { parseLocal, useI18n, type Key } from "../i18n";

export default function RideDetail() {
  const { id } = useParams();
  const rideId = Number(id);
  const { t, lang, day, time, plural } = useI18n();
  const { user, ready } = useAuth();
  const nav = useNavigate();
  const rideLoad = useAsync(() => api.ride(rideId), [rideId, user?.id]);
  const mine = useAsync(
    () => (user ? api.myRequests() : Promise.resolve([])),
    [user?.id],
  );
  const others = useAsync(
    () =>
      rideLoad.data
        ? api.rides({ event_id: rideLoad.data.event.id, limit: 100 })
        : Promise.resolve([]),
    [rideLoad.data?.event.id],
  );
  const [why, setWhy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sure, setSure] = useState(false);

  useEffect(() => {
    setWhy(null);
    if (!user || !rideLoad.data?.match) return;
    let live = true;
    api
      .explain({ ride_ids: [rideId], lang })
      .then((response) => {
        if (live) setWhy(response.rides[String(rideId)] ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [user, rideLoad.data?.match, rideId, lang]);

  if (rideLoad.loading && !rideLoad.data)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (rideLoad.error instanceof ApiError && rideLoad.error.status === 404)
    return (
      <Screen>
        <Empty title={t("ride.notFound")}>
          <Link className="btn btn-sm" to="/search">
            {t("nav.find")}
          </Link>
        </Empty>
      </Screen>
    );
  if (rideLoad.error || !rideLoad.data)
    return (
      <Screen>
        <ErrorBox error={rideLoad.error} onRetry={rideLoad.reload} />
      </Screen>
    );

  const ride = rideLoad.data;
  const match = ride.match;
  const level = match ? matchKey(match) : "diff";
  const own = user?.id === ride.driver.id;
  const found = (mine.data ?? []).find(
    (request) => request.ride_id === ride.id,
  );
  const req = found?.status === "cancelled" ? undefined : found;
  const askedOthers = (mine.data ?? []).filter(
    (request) =>
      request.ride.event.id === ride.event.id &&
      request.ride_id !== ride.id &&
      request.status === "pending",
  ).length;
  const departed = parseLocal(ride.departure_time) <= new Date();
  const taken = ride.seats_total - ride.seats_left;
  const firstName = ride.driver.display_name.split(" ")[0];
  const carsHere = others.data?.length ?? 0;

  const withdraw = async () => {
    if (!req) return;
    setBusy(true);
    setError("");
    try {
      await api.cancelRequest(req.id);
      setSure(false);
      mine.reload();
      rideLoad.reload();
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
      await api.askSeat(ride.id, message.trim());
      mine.reload();
      rideLoad.reload();
    } catch (err) {
      setError(t(errorKey(err) as Key));
    } finally {
      setBusy(false);
    }
  };

  const goBack = () =>
    (window.history.state?.idx ?? 0) > 0
      ? nav(-1)
      : nav(`/search?event_id=${ride.event.id}`);
  const bandBits = [
    ...ride.driver.music_genres.slice(0, 2),
    t(`ride.carStyle.${ride.driver.driving_style}`),
    ride.smoking_allowed ? t("ride.smokingOk") : t("ride.noSmoking"),
  ];
  const bars: [string, number, number, string][] = match
    ? [
        [
          `${t("landing.music")}${match.shared_genres.length ? `: ${match.shared_genres.join(", ")}` : ""}`,
          match.music,
          60,
          "var(--pink)",
        ],
        [
          `${t("landing.style")}: ${t(`style.${ride.driver.driving_style}`)}`,
          match.style,
          25,
          "var(--blue)",
        ],
      ]
    : [];
  const meSmokes = !!user?.smoker,
    driverSmokes = ride.driver.smoker;
  const smokingWords =
    meSmokes === driverSmokes
      ? t(meSmokes ? "smoke.bothYes" : "smoke.bothNo")
      : t(meSmokes ? "smoke.youOnly" : "smoke.driverOnly", { name: firstName });

  return (
    <Screen>
      <div className="ride-page">
        <div style={{ minWidth: 0 }}>
          <button type="button" className="back" onClick={goBack}>
            <Icon name="back" />
            {carsHere
              ? t("ride.carsTo", {
                  cars: plural(carsHere, "car"),
                  event: ride.event.name,
                })
              : t("ride.back")}
          </button>
          <div className="driver-intro">
            <span className="driver-avatar blobby" aria-hidden="true">
              {initials(ride.driver.display_name)}
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 className="h1">
                {t("ride.with", { name: ride.driver.display_name })}
              </h1>
              <div className="tagline">
                {ride.driver.music_genres.join(", ")} ·{" "}
                {t("ride.drives", {
                  style: t(`style.${ride.driver.driving_style}`),
                })}
              </div>
            </div>
          </div>

          {/* wristband */}
          {match && (
            <div className="band-row" aria-hidden="true">
              <div className="wristband">
                <div className="stub">
                  <span className="num">
                    <CountUp to={match.percent} suffix="%" />
                  </span>
                  <span>{t(`match.${level}`).split(" ").join("\n")}</span>
                </div>
                <span className="poster">{bandBits.join(" ✶ ")}</span>
              </div>
            </div>
          )}

          <div className="cards">
            {match && (
              <div className="info-card">
                <h2>{t("ride.why", { n: match.percent })}</h2>
                <div className="score-bars">
                  {bars.map(([label, score, max, color]) => (
                    <div key={label}>
                      <div className="bar-head">
                        <span>{label}</span>
                        <span>
                          {Math.round(score * max)} / {max}
                        </span>
                      </div>
                      <div className="track">
                        <i
                          style={{
                            width: `${score * 100}%`,
                            background: color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {match && (
                    <div className="bar-head smoking-row">
                      <span>{t("landing.smoking")}</span>
                      <span
                        className={`smoking-chip${match.smoking ? " on" : ""}`}
                      >
                        {smokingWords} · {match.smoking ? "+15" : "0"}
                      </span>
                    </div>
                  )}
                </div>
                {why && (
                  <div className="ai-reason">
                    <Icon name="spark" />
                    <span>
                      {why} <AiBadge />
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="info-card">
              <h2>{t("ride.route")}</h2>
              <div className="route">
                <span className="route-start" />
                <span>{ride.origin_city.toLowerCase()}</span>
                <span>{time(ride.departure_time)}</span>
                <span className="route-line" />
                <span className="soft-text">{day(ride.departure_time)}</span>
                <span />
                <span className="route-end" />
                <span>
                  {[ride.event.city, ride.event.venue]
                    .filter(Boolean)
                    .join(", ")
                    .toLowerCase()}
                </span>
                <span>
                  {ride.event.event_date ? day(ride.event.event_date) : ""}
                </span>
              </div>
              <div className="pills">
                <span>{ride.event.name}</span>
                <span>{plural(ride.seats_left, "seatLeft")}</span>
                <span className={ride.smoking_allowed ? "warn" : undefined}>
                  {ride.smoking_allowed
                    ? t("ride.smokingOk")
                    : t("ride.noSmoking")}
                </span>
              </div>
              {ride.note && <p className="driver-note">“{ride.note}”</p>}
            </div>
          </div>
        </div>

        {/* booking panel */}
        <aside>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 10,
            }}
          >
            <span className="num">{ride.price} zł</span>
            <span className="per-seat">{t("ride.perSeat")}</span>
          </div>
          <div
            className="seat-map"
            role="group"
            aria-label={t("ride.seatsAria", { taken, total: ride.seats_total })}
          >
            {Array.from({ length: ride.seats_total }, (_, i) =>
              i < taken ? (
                req?.status === "accepted" && i === taken - 1 ? (
                  <span key={i} className="seat-taken yours">
                    {t("ride.yourSeat")}
                  </span> /* your own seat once the driver said yes */
                ) : (
                  <span key={i} className="seat-taken">
                    {t("ride.taken")}
                  </span>
                )
              ) : i === taken &&
                !own &&
                !req &&
                !departed &&
                !ride.cancelled ? (
                <span key={i} className="seat-you">
                  {t("ride.you")}
                </span>
              ) : (
                <span key={i} className="seat-free">
                  {t("ride.free")}
                </span>
              ),
            )}
          </div>

          {!ready || (user && mine.loading) ? (
            <Loading />
          ) : user && mine.error ? (
            <ErrorBox error={mine.error} onRetry={mine.reload} />
          ) : ride.cancelled ? (
            <>
              <span className="state called_off">
                {t("ride.status.called_off")}
              </span>
              <p className="fine-print">{t("ride.calledOffNote")}</p>
            </>
          ) : own ? (
            <>
              <p style={{ marginTop: 22 }}>{t("ride.own")}</p>
              <Link className="ask-btn pill-btn" to={`/drive?ride=${ride.id}`}>
                {t("ride.manage")}
              </Link>
            </>
          ) : req ? (
            <>
              <span className={`state ${req.status}`}>
                {t(`ride.status.${req.status}`)}
              </span>
              {req.status === "pending" && (
                <p className="fine-print">{t("ride.sent")}</p>
              )}
              {req.status === "removed" && (
                <p className="fine-print">{t("ride.removedNote")}</p>
              )}
              {(req.status === "pending" || req.status === "accepted") &&
                !departed && (
                  <div className="withdraw">
                    {!sure ? (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setSure(true)}
                      >
                        {t(
                          req.status === "accepted"
                            ? "ride.giveUp"
                            : "ride.withdraw",
                        )}
                      </button>
                    ) : (
                      <>
                        <span>
                          {t(
                            req.status === "accepted"
                              ? "ride.giveUpSure"
                              : "ride.withdrawSure",
                          )}
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={busy}
                          onClick={withdraw}
                        >
                          {t("ride.sureYes")}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          onClick={() => setSure(false)}
                        >
                          {t("ride.sureNo")}
                        </button>
                      </>
                    )}
                    {error && (
                      <p className="inline-error" role="alert">
                        {error}
                      </p>
                    )}
                  </div>
                )}
            </>
          ) : departed ? (
            <p className="fine-print">{t("ride.left")}</p>
          ) : ride.seats_left <= 0 ? (
            <p className="fine-print">{t("ride.full")}</p>
          ) : !user ? (
            <Link
              className="ask-btn pill-btn"
              to={`/login?next=/rides/${ride.id}`}
            >
              {t("ride.loginToAsk")}
            </Link>
          ) : (
            <form onSubmit={ask}>
              <label htmlFor="ask-msg">
                {t("ride.lineFor", { name: firstName })}
              </label>
              <textarea
                id="ask-msg"
                maxLength={300}
                placeholder={t("ride.messagePh")}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="ask-btn pill-btn"
                type="submit"
                disabled={busy}
              >
                {t("ride.askName", { name: firstName })}
              </button>
            </form>
          )}
          {!own && !ride.cancelled && (
            <p className="fine-print">
              {askedOthers
                ? t("ride.askedOthers", { n: askedOthers })
                : t("ride.multi")}
            </p>
          )}
        </aside>
      </div>
    </Screen>
  );
}
