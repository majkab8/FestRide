import { Link } from "react-router-dom";
import { api, type Event, type MyRequest } from "../api";
import { useAuth } from "../auth";
import { Page } from "../components/Layout";
import { ErrorBox, Icon, Loading, Wristband, matchKey } from "../components/ui";
import { useAsync } from "../hooks";
import { useI18n, parseLocal } from "../i18n";

export default function Home() {
  const { user } = useAuth();
  const { t, day, time, relDay, plural } = useI18n();
  const mine = useAsync(() => api.myRequests(), []);
  const driving = useAsync(() => api.myRides(), []);
  const genres = user?.music_genres.slice(0, 3) ?? [];
  const sound = useAsync(async () => {
    const lists = await Promise.all(genres.map((g) => api.events({ genre: g, limit: 6 })));
    const seen = new Set<number>(); const out: Event[] = [];
    for (const l of lists) for (const e of l) if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
    return out.sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? "")).slice(0, 6);
  }, [genres.join(",")]);

  const now = new Date();
  const upcoming = (mine.data ?? []).filter((q) => parseLocal(q.ride.departure_time) > now);
  const next = upcoming.filter((q) => q.status === "accepted").sort((a, b) => a.ride.departure_time.localeCompare(b.ride.departure_time))[0];
  const waitingBy = new Map<number, MyRequest[]>();
  for (const q of upcoming.filter((x) => x.status === "pending")) waitingBy.set(q.ride.event.id, [...(waitingBy.get(q.ride.event.id) ?? []), q]);
  const waiting = [...waitingBy.values()];
  const myOffers = (driving.data ?? []).filter((r) => parseLocal(r.departure_time) > now);

  const hour = now.getHours();
  const greeting = t(hour < 12 ? "home.morning" : hour < 18 ? "home.afternoon" : "home.evening", { name: user?.display_name.split(" ")[0] ?? "" });

  return (
    <Page>
      <div className="home-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <div>
            <h1 className="disp" style={{ fontSize: "clamp(44px,6vw,72px)" }}>{greeting}</h1>
            <p className="muted" style={{ marginTop: 12, fontSize: 19 }}>
              {next ? t("home.nextIn", { event: next.ride.event.name, when: relDay(next.ride.departure_time) }) : t("home.noRide")}
            </p>
          </div>

          {mine.loading && <Loading />}
          {mine.error != null && <ErrorBox error={mine.error} onRetry={mine.reload} />}
          {next ? (
            <Link className="next-ride" to={`/rides/${next.ride.id}`}>
              <div className="eyebrow">{t("home.next")} · {day(next.ride.departure_time)}</div>
              <Wristband ride={next.ride} />
              <div className="actions"><span className="btn btn-light btn-sm">{t("home.details")}</span></div>
              <div className="note" style={{ position: "absolute", left: 30, bottom: 26, color: "var(--on-blue)" }}>
                {next.ride.driver.display_name} · {next.ride.origin_city} {time(next.ride.departure_time)}
              </div>
            </Link>
          ) : !mine.loading && !mine.error && (
            <div className="card" style={{ alignItems: "flex-start" }}>
              <p>{t("home.noRideCta")}</p>
              <div className="row"><Link className="btn" to="/search">{t("home.findRide")}</Link><Link className="btn btn-ghost" to="/drive/new">{t("home.offer")}</Link></div>
            </div>
          )}

          {waiting.map((group) => (
            <div className="card" key={group[0].ride.event.id}>
              <div className="row" style={{ alignItems: "baseline" }}>
                <h2 style={{ fontSize: 22, fontWeight: 700 }}>{t("home.waiting", { event: group[0].ride.event.name })}</h2>
                <span className="note">{group[0].ride.event.event_date ? day(group[0].ride.event.event_date) : ""} · {t("home.askedN", { n: group.length })}</span>
              </div>
              <div className="waiting">
                {group.map((q, i) => {
                  const k = q.ride.match ? matchKey(q.ride.match) : "diff";
                  return (
                    <Link key={q.id} to={`/rides/${q.ride.id}`} style={{ textDecoration: "none", display: "contents" }}>
                      <div className={`m-${k}`}>
                        <span className={`blob num sh${i % 3}`}>{q.ride.match?.percent ?? "·"}</span>
                        <span style={{ minWidth: 0 }}><b>{q.ride.driver.display_name}</b><br /><span className="note">{q.ride.origin_city.toLowerCase()} {time(q.ride.departure_time)}</span></span>
                      </div>
                    </Link>
                  );
                })}
              </div>
              <p className="note">{t("home.firstYes")}</p>
            </div>
          ))}

          {myOffers.length > 0 && (
            <Link className="card" to="/drive" style={{ textDecoration: "none" }}>
              <div className="row"><h2 style={{ fontSize: 20 }}>{t("home.offers")}</h2><Icon name="arrow" /></div>
              <p className="note">{myOffers.map((r) => `${r.event.name} · ${plural(r.seats_left, "seatLeft")}`).join("  ·  ")}</p>
            </Link>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="sound">
            <div className="eyebrow" style={{ color: "var(--lime)" }}>{t("home.forSound")} · {genres.join(", ")}</div>
            {sound.loading && <Loading />}
            
            {sound.data?.[0] && <>
              <div className="tier poster" style={{ fontSize: "clamp(40px,5vw,68px)" }}><Link to={`/search?event_id=${sound.data[0].id}`}>{sound.data[0].name}</Link></div>
              <div className="note">{sound.data[0].city.toLowerCase()} · {sound.data[0].event_date ? day(sound.data[0].event_date) : ""}</div>
            </>}
            {sound.data && sound.data.length > 1 && (
              <div className="tier poster" style={{ fontSize: "clamp(24px,3vw,38px)", color: "var(--pink)" }}>
                {sound.data.slice(1, 3).map((e, i) => <span key={e.id}>{i > 0 && " · "}<Link to={`/search?event_id=${e.id}`}>{e.name}</Link></span>)}
              </div>
            )}
            {sound.data && sound.data.length > 3 && (
              <div className="tier poster" style={{ fontSize: 22, lineHeight: 1.15, color: "var(--inv-muted)" }}>
                {sound.data.slice(3).map((e, i) => <span key={e.id}>{i > 0 && " · "}<Link to={`/search?event_id=${e.id}`}>{e.name}</Link></span>)}
              </div>
            )}
            <Link className="btn btn-light btn-sm" to="/events">{t("landing.allEvents")}</Link>
          </div>
          <Link className="card" to="/search" style={{ background: "var(--lime)", color: "var(--on-bright)", textDecoration: "none" }}>
            <div className="eyebrow">{t("search.title")}</div>
            <div className="disp" style={{ fontSize: 24, lineHeight: 1.2, letterSpacing: "-0.01em" }}>“{t("landing.example")}”</div>
            <div className="row"><b>{t("home.findRide")}</b><Icon name="arrow" /></div>
          </Link>
        </div>
      </div>
    </Page>
  );
}
