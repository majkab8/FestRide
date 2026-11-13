import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Event, type MyRequest } from "../api";
import { useAuth } from "../auth";
import { Screen } from "../components/Layout";
import {
  CountUp,
  ErrorBox,
  Icon,
  Loading,
  matchKey,
  shapeFor,
} from "../components/ui";
import { billName } from "../geo";
import { useAsync } from "../hooks";
import { parseLocal, useI18n } from "../i18n";

export default function Home() {
  const { user } = useAuth();
  const { t, day, time, relDay, plural } = useI18n();
  const mine = useAsync(() => api.myRequests(), []);
  const genres = user?.music_genres.slice(0, 3) ?? [];
  const sound = useAsync(async () => {
    const lists = await Promise.all(
      genres.map((genre) => api.events({ genre: genre, limit: 6 })),
    );
    const seen = new Set<number>();
    const out: Event[] = [];
    for (const list of lists)
      for (const e of list)
        if (!seen.has(e.id)) {
          seen.add(e.id);
          out.push(e);
        }
    return out
      .sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""))
      .slice(0, 6);
  }, [genres.join(",")]);
  const rides = useAsync(
    () => api.rides({ limit: 200, sort: "departure" }),
    [],
  );
  const slidesRef = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const onSlides = () => {
    const el = slidesRef.current;
    if (!el || !el.children.length) return;
    const slideWidth = (el.children[0] as HTMLElement).offsetWidth + 12;
    setSlide(Math.round(el.scrollLeft / slideWidth));
  };

  const now = new Date();
  const upcoming = (mine.data ?? []).filter(
    (request) => parseLocal(request.ride.departure_time) > now,
  );
  const next = upcoming
    .filter((request) => request.status === "accepted")
    .sort((a, b) =>
      a.ride.departure_time.localeCompare(b.ride.departure_time),
    )[0];
  const waitingBy = new Map<number, MyRequest[]>();
  for (const request of upcoming.filter((other) => other.status !== "accepted"))
    waitingBy.set(request.ride.event.id, [
      ...(waitingBy.get(request.ride.event.id) ?? []),
      request,
    ]);
  const waiting = [...waitingBy.values()].filter((group) =>
    group.some((request) => request.status === "pending"),
  );

  // feed: the best-matching cars still leaving with a free seat, to events you don't already have a ride or open requests for
  const covered = new Set(
    upcoming
      .filter(
        (request) =>
          request.status === "pending" || request.status === "accepted",
      )
      .map((request) => request.ride.event.id),
  );
  const picks = (rides.data ?? [])
    .filter(
      (ride) =>
        ride.match &&
        ride.driver.id !== user?.id &&
        !covered.has(ride.event.id) &&
        ride.seats_left > 0 &&
        parseLocal(ride.departure_time) > now,
    )
    .sort((a, b) => (b.match?.percent ?? 0) - (a.match?.percent ?? 0))
    .slice(0, 3);
  const sentences = [
    t("landing.example"),
    ...(genres[0] ? [t("home.trySentenceGenre", { genre: genres[0] })] : []),
  ];

  const carsTo = (eventId: number) =>
    (rides.data ?? []).filter((ride) => ride.event.id === eventId).length;
  const first = (user?.display_name ?? "").split(" ")[0];
  const hour = now.getHours();
  const greeting = t(
    hour < 12 ? "home.morning" : hour < 18 ? "home.afternoon" : "home.evening",
    { name: first },
  );

  return (
    <Screen>
      <div className="home-page">
        <div style={{ minWidth: 0 }}>
          <h1 className="h1">{greeting}</h1>
          <p className="lead">
            {next
              ? t("home.nextLine", {
                  event: next.ride.event.name,
                  when: relDay(next.ride.departure_time),
                  driver: next.ride.driver.display_name,
                  from: next.ride.origin_city,
                  time: time(next.ride.departure_time),
                })
              : t("home.noRide")}
          </p>

          {mine.loading && <Loading />}
          {mine.error != null && (
            <ErrorBox error={mine.error} onRetry={mine.reload} />
          )}

          {/* next ride: wristband card */}
          {next ? (
            <Link className="next-ride" to={`/rides/${next.ride.id}`}>
              <div className="small-label">
                {t("home.next")} · {day(next.ride.departure_time)}
              </div>
              <div className="wristband">
                <div className="stub">
                  <span className="num">
                    {next.ride.match ? (
                      <CountUp to={next.ride.match.percent} suffix="%" />
                    ) : (
                      "✶"
                    )}
                  </span>
                  <span>
                    {next.ride.driver.display_name}
                    <br />
                    {time(next.ride.departure_time)} →{" "}
                    {(
                      next.ride.event.venue || next.ride.event.city
                    ).toLowerCase()}
                  </span>
                </div>
                <span className="poster">
                  {next.ride.origin_city} ✶ {next.ride.event.name} ✶{" "}
                  {next.ride.event.city}
                </span>
              </div>
              <div className="card-actions">
                <span className="solid pill-btn">{t("home.details")}</span>
              </div>
            </Link>
          ) : (
            !mine.loading &&
            !mine.error && (
              <div className="empty-next">
                <p style={{ fontSize: 17 }}>{t("home.noRideCta")}</p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link className="btn" to="/search">
                    {t("home.findRide")}
                  </Link>
                  <Link className="btn btn-ghost" to="/drive/new">
                    {t("home.offer")}
                  </Link>
                </div>
              </div>
            )
          )}

          {/* waiting for a yes */}
          {waiting.map((group) => {
            const ev = group[0].ride.event;
            return (
              <div className="wait" key={ev.id}>
                <div className="wait-head">
                  <h2>
                    {t("home.waiting", {
                      event: [ev.name, ev.city].join(", "),
                    })}
                  </h2>
                  <span
                    className="mono meta"
                    style={{ fontSize: 13, color: "var(--muted)" }}
                  >
                    {ev.event_date && (
                      <>
                        <span>{day(ev.event_date)}</span> ·{" "}
                      </>
                    )}
                    <span>{t("home.askedN", { n: group.length })}</span>
                  </span>
                </div>
                <div className="cars">
                  {group.map((request) => {
                    const off =
                      request.status !== "pending" ||
                      request.ride.seats_left <= 0;
                    const level = request.ride.match
                      ? matchKey(request.ride.match)
                      : "diff";
                    return (
                      <Link
                        key={request.id}
                        to={`/rides/${request.ride.id}`}
                        className={`car${off ? " unavailable" : ""}`}
                      >
                        <span
                          className={`score-badge ${shapeFor(level)} ${off ? "score-fill-none" : `score-fill-${level}`}${request.ride.match?.percent === 100 ? " perfect-score" : ""}`}
                        >
                          {request.ride.match?.percent ?? "·"}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b>{request.ride.driver.display_name}</b>
                          <br />
                          <small>
                            {off
                              ? request.status !== "pending"
                                ? t(`ride.status.${request.status}`)
                                : t("ride.full")
                              : `${request.ride.origin_city.toLowerCase()} ${time(request.ride.departure_time)}`}
                          </small>
                        </span>
                      </Link>
                    );
                  })}
                </div>
                <p>{t("home.firstYes")}</p>
              </div>
            );
          })}
        </div>

        {/* right column: a feed of suggestions, each card marked as one */}
        <aside className="suggestions feed" aria-label={t("home.feed")}>
          <div className="feed-head">
            <span className="dot" aria-hidden="true" />
            {t("home.feed")}
            <span className="dots" aria-hidden="true">
              {[0, 1, 2].slice(0, 2 + (picks.length > 0 ? 1 : 0)).map((i) => (
                <i key={i} className={i === slide ? "on" : undefined} />
              ))}
            </span>
          </div>
          <div className="slides" ref={slidesRef} onScroll={onSlides}>
            <div className="sound">
              {sound.data?.[0]?.image_url && (
                <img
                  className="backdrop"
                  src={sound.data[0].image_url}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="eyebrow">
                ✶ {t("home.forSound")} · {genres.join(", ")}
              </div>
              {sound.loading && <Loading />}
              {sound.data?.[0] && (
                <>
                  <div
                    className="tier poster tier-1"
                    style={{
                      marginTop: 20,
                      fontSize: "clamp(44px, 5.3vw, 76px)",
                    }}
                  >
                    <Link
                      to={`/search?event_id=${sound.data[0].id}`}
                      title={sound.data[0].name}
                    >
                      {billName(sound.data[0].name)}
                    </Link>
                  </div>
                  <div className="sub meta">
                    <span>{sound.data[0].city.toLowerCase()}</span>
                    {sound.data[0].event_date && (
                      <>
                        {" "}
                        · <span>{day(sound.data[0].event_date)}</span>
                      </>
                    )}{" "}
                    · <span>{plural(carsTo(sound.data[0].id), "car")}</span>
                  </div>
                </>
              )}
              {sound.data && sound.data.length > 1 && (
                <div
                  className="tier poster tier-2"
                  style={{
                    marginTop: 22,
                    fontSize: 42,
                    color: "var(--pink-2)",
                  }}
                >
                  {sound.data.slice(1, 3).map((e, i) => (
                    <span key={e.id}>
                      {i > 0 && " · "}
                      <Link to={`/search?event_id=${e.id}`} title={e.name}>
                        {billName(e.name)}
                      </Link>
                    </span>
                  ))}
                </div>
              )}
              {sound.data && sound.data.length > 3 && (
                <div
                  className="tier poster tier-3"
                  style={{
                    marginTop: 16,
                    fontSize: 26,
                    lineHeight: 1.15,
                    color: "var(--inv-muted)",
                  }}
                >
                  {sound.data.slice(3).map((e, i) => (
                    <span key={e.id}>
                      {i > 0 && " · "}
                      <Link to={`/search?event_id=${e.id}`} title={e.name}>
                        {billName(e.name)}
                      </Link>
                    </span>
                  ))}
                </div>
              )}
              <Link className="cta pill-btn" to="/events">
                {t("landing.allEvents")}
              </Link>
            </div>

            {picks.length > 0 && (
              <div className="picks">
                <div className="feed-tag">✶ {t("home.feedRides")}</div>
                {picks.map((ride) => (
                  <Link key={ride.id} to={`/rides/${ride.id}`} className="pick">
                    <span
                      className={`score-badge ${shapeFor(matchKey(ride.match!))} score-fill-${matchKey(ride.match!)}${ride.match!.percent === 100 ? " perfect-score" : ""}`}
                    >
                      {ride.match!.percent}
                    </span>
                    <span className="pick-text">
                      <b title={ride.event.name}>{ride.event.name}</b>
                      <small>
                        {ride.origin_city.toLowerCase()} →{" "}
                        {ride.event.city.toLowerCase()} ·{" "}
                        {day(ride.departure_time)} {time(ride.departure_time)} ·{" "}
                        {ride.driver.display_name}
                      </small>
                    </span>
                    <Icon name="arrow" />
                  </Link>
                ))}
              </div>
            )}

            <div className="try-sentences">
              <div className="feed-tag">✶ {t("home.trySentence")}</div>
              {sentences.map((sentence) => (
                <Link
                  key={sentence}
                  className="example-sentence"
                  to={`/search?text=${encodeURIComponent(sentence)}`}
                >
                  <span>“{sentence}”</span>
                  <Icon name="arrow" />
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </Screen>
  );
}
