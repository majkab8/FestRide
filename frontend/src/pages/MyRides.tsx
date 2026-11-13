import { Link } from "react-router-dom";
import { api, type MyRequest } from "../api";
import { Screen } from "../components/Layout";
import { ErrorBox, Loading, matchKey, shapeFor } from "../components/ui";
import { useAsync } from "../hooks";
import { parseLocal, useI18n } from "../i18n";


export default function MyRides() {
  const { t, day, time } = useI18n();
  const mine = useAsync(() => api.myRequests(), []);
  const now = new Date();
  const all = [...(mine.data ?? [])].sort((a, b) => a.ride.departure_time.localeCompare(b.ride.departure_time));
  const upcoming = all.filter((q) => parseLocal(q.ride.departure_time) > now);
  const groups: [string, MyRequest[]][] = [
    [t("mine.going"), upcoming.filter((q) => q.status === "accepted")],
    [t("mine.waiting"), upcoming.filter((q) => q.status === "pending")],
    [t("mine.past"), [...all.filter((q) => !upcoming.includes(q)), ...upcoming.filter((q) => q.status !== "accepted" && q.status !== "pending")].reverse()],
  ];

  return (
    <Screen className="mine3">
      <h1 className="h1">{t("mine.title")}</h1>
      {mine.loading && <Loading />}
      {mine.error != null && <ErrorBox error={mine.error} onRetry={mine.reload} />}
      {mine.data && !all.length && (
        <div className="emp">
          <p style={{ fontSize: 17 }}>{t("mine.none")}</p>
          <Link className="btn" to="/search">{t("home.findRide")}</Link>
        </div>
      )}
      {groups.filter(([, list]) => list.length).map(([title, list]) => (
        <section key={title}>
          <h2 className="disp">{title}</h2>
          <div className="rows" style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 760 }}>
            {list.map((q) => {
              const k = q.ride.match ? matchKey(q.ride.match) : "diff";
              const dim = (q.status !== "accepted" && q.status !== "pending") || parseLocal(q.ride.departure_time) <= now;
              return (
                <Link key={q.id} to={`/rides/${q.ride.id}`} className={`row3${dim ? " dim" : ""}`}>
                  <span className={`sc ${shapeFor(k)} ${dim ? "s-none" : `s-${k}`}${q.ride.match?.percent === 100 ? " n3" : ""}`}>{q.ride.match?.percent ?? "·"}</span>
                  <span className="who"><b>{q.ride.event.name}</b>
                    <span>{q.ride.origin_city.toLowerCase()} → {q.ride.event.city.toLowerCase()} · {day(q.ride.departure_time)} {time(q.ride.departure_time)} · {q.ride.driver.display_name}</span></span>
                  <span className={`st ${q.status}`}>{t(`ride.status.${q.status}`)}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </Screen>
  );
}
