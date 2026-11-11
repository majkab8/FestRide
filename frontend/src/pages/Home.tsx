import { Link } from "react-router-dom";
import { api, type Event, type MyRequest } from "../api";
import { useAuth } from "../auth";
import { Screen } from "../components/Layout";
import { CountUp, ErrorBox, Icon, Loading, matchKey } from "../components/ui";
import { billName } from "../geo";
import { useAsync } from "../hooks";
import { parseLocal, useI18n } from "../i18n";

const SHAPES = ["round", "arch", "blobby"];

/** Home, logged in (v3 AppHome3 board). */
export default function Home() {
  const { user } = useAuth();
  const { t, day, time, relDay, plural } = useI18n();
  const mine = useAsync(() => api.myRequests(), []);
  const genres = user?.music_genres.slice(0, 3) ?? [];
  const sound = useAsync(async () => {
    const lists = await Promise.all(genres.map((g) => api.events({ genre: g, limit: 6 })));
    const seen = new Set<number>();
    const out: Event[] = [];
    for (const l of lists) for (const e of l) if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
    return out.sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? "")).slice(0, 6);
  }, [genres.join(",")]);
  const rides = useAsync(() => api.rides({ limit: 200, sort: "departure" }), []);

  const now = new Date();
  const upcoming = (mine.data ?? []).filter((q) => parseLocal(q.ride.departure_time) > now);
  const next = upcoming.filter((q) => q.status === "accepted").sort((a, b) => a.ride.departure_time.localeCompare(b.ride.departure_time))[0];
  const waitingBy = new Map<number, MyRequest[]>();
  for (const q of upcoming.filter((x) => x.status !== "accepted")) waitingBy.set(q.ride.event.id, [...(waitingBy.get(q.ride.event.id) ?? []), q]);
  const waiting = [...waitingBy.values()].filter((g) => g.some((q) => q.status === "pending"));

  const carsTo = (eventId: number) => (rides.data ?? []).filter((r) => r.event.id === eventId).length;
  const first = (user?.display_name ?? "").split(" ")[0];
  const hour = now.getHours();
  const greeting = t(hour < 12 ? "home.morning" : hour < 18 ? "home.afternoon" : "home.evening", { name: first });

  return (
    <Screen>
      <div className="home3">
        <div style={{ minWidth: 0 }}>
          <h1 className="h1">{greeting}</h1>
          <p className="lead">
            {next
              ? t("home.nextLine", { event: next.ride.event.name, when: relDay(next.ride.departure_time), driver: next.ride.driver.display_name, from: next.ride.origin_city, time: time(next.ride.departure_time) })
              : t("home.noRide")}
          </p>

          {mine.loading && <Loading />}
          {mine.error != null && <ErrorBox error={mine.error} onRetry={mine.reload} />}

          {/* next ride: wristband card */}
          {next ? (
            <Link className="next" to={`/rides/${next.ride.id}`}>
              <div className="lbl">{t("home.next")} · {day(next.ride.departure_time)}</div>
              <div className="wb">
                <div className="stub">
                  <span className="num">{next.ride.match ? <CountUp to={next.ride.match.percent} suffix="%" /> : "✶"}</span>
                  <span>{next.ride.driver.display_name}<br />{time(next.ride.departure_time)} → {(next.ride.event.venue || next.ride.event.city).toLowerCase()}</span>
                </div>
                <span className="poster">{next.ride.origin_city} ✶ {next.ride.event.name} ✶ {next.ride.event.city}</span>
              </div>
              <div className="acts"><span className="solid btn3">{t("home.details")}</span></div>
            </Link>
          ) : !mine.loading && !mine.error && (
            <div className="empty-next">
              <p style={{ fontSize: 17 }}>{t("home.noRideCta")}</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link className="btn" to="/search">{t("home.findRide")}</Link>
                <Link className="btn btn-ghost" to="/drive/new">{t("home.offer")}</Link>
              </div>
            </div>
          )}

          {/* waiting for a yes */}
          {waiting.map((group) => {
            const ev = group[0].ride.event;
            return (
              <div className="wait" key={ev.id}>
                <div className="whead">
                  <h2>{t("home.waiting", { event: [ev.name, ev.city].join(", ") })}</h2>
                  <span className="mono" style={{ fontSize: 13, color: "var(--muted)" }}>{ev.event_date ? day(ev.event_date) : ""} · {t("home.askedN", { n: group.length })}</span>
                </div>
                <div className="cars">
                  {group.map((q, i) => {
                    const off = q.status === "declined" || q.ride.seats_left <= 0;
                    const k = q.ride.match ? matchKey(q.ride.match) : "diff";
                    return (
                      <Link key={q.id} to={`/rides/${q.ride.id}`} className={`car${off ? " off" : ""}`}>
                        <span className={`sc ${SHAPES[i % 3]} ${off ? "s-none" : `s-${k}`}`}>{q.ride.match?.percent ?? "·"}</span>
                        <span style={{ flex: 1, minWidth: 0 }}><b>{q.ride.driver.display_name}</b><br />
                          <small>{off ? (q.status === "declined" ? t("ride.status.declined") : t("ride.full")) : `${q.ride.origin_city.toLowerCase()} ${time(q.ride.departure_time)}`}</small></span>
                      </Link>
                    );
                  })}
                </div>
                <p>{t("home.firstYes")}</p>
              </div>
            );
          })}
        </div>

        {/* right column */}
        <div className="rcol">
          <div className="sound">
            {sound.data?.[0]?.image_url && <img className="bg" src={sound.data[0].image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />}
            <div className="eyebrow">{t("home.forSound")} · {genres.join(", ")}</div>
            {sound.loading && <Loading />}
            {sound.data?.[0] && <>
              <div className="tier poster" style={{ marginTop: 20, fontSize: "clamp(44px, 5.3vw, 76px)" }}>
                <Link to={`/search?event_id=${sound.data[0].id}`} title={sound.data[0].name}>{billName(sound.data[0].name)}</Link>
              </div>
              <div className="sub">{sound.data[0].city.toLowerCase()} · {sound.data[0].event_date ? day(sound.data[0].event_date) : ""} · {plural(carsTo(sound.data[0].id), "car")}</div>
            </>}
            {sound.data && sound.data.length > 1 && (
              <div className="tier poster" style={{ marginTop: 22, fontSize: 42, color: "var(--pink-2)" }}>
                {sound.data.slice(1, 3).map((e, i) => <span key={e.id}>{i > 0 && " · "}<Link to={`/search?event_id=${e.id}`} title={e.name}>{billName(e.name)}</Link></span>)}
              </div>
            )}
            {sound.data && sound.data.length > 3 && (
              <div className="tier poster" style={{ marginTop: 16, fontSize: 26, lineHeight: 1.15, color: "var(--inv-muted)" }}>
                {sound.data.slice(3).map((e, i) => <span key={e.id}>{i > 0 && " · "}<Link to={`/search?event_id=${e.id}`} title={e.name}>{billName(e.name)}</Link></span>)}
              </div>
            )}
            <Link className="cta btn3" to="/events">{t("landing.allEvents")}</Link>
          </div>
          <Link className="try" to="/search">
            <div className="mono" style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("home.trySentence")}</div>
            <div style={{ marginTop: 10, fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 24, lineHeight: 1.2 }}>“{t("landing.example")}”</div>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>{t("home.findRide")}</span><Icon name="arrow" />
            </div>
          </Link>
        </div>
      </div>
    </Screen>
  );
}
