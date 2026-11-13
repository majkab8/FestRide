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
  const upcoming = all.filter((request) => parseLocal(request.ride.departure_time) > now);
  const groups: [string, MyRequest[]][] = [
    [t("mine.going"), upcoming.filter((request) => request.status === "accepted")],
    [t("mine.waiting"), upcoming.filter((request) => request.status === "pending")],
    [t("mine.past"), [...all.filter((request) => !upcoming.includes(request)), ...upcoming.filter((request) => request.status !== "accepted" && request.status !== "pending")].reverse()],
  ];

  return (
    <Screen className="my-rides-page">
      <h1 className="h1">{t("mine.title")}</h1>
      {mine.loading && <Loading />}
      {mine.error != null && <ErrorBox error={mine.error} onRetry={mine.reload} />}
      {mine.data && !all.length && (
        <div className="empty-state">
          <p style={{ fontSize: 17 }}>{t("mine.none")}</p>
          <Link className="btn" to="/search">{t("home.findRide")}</Link>
        </div>
      )}
      {groups.filter(([, list]) => list.length).map(([title, list]) => (
        <section key={title}>
          <h2 className="display-title">{title}</h2>
          <div className="ride-list" style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 760 }}>
            {list.map((request) => {
              const level = request.ride.match ? matchKey(request.ride.match) : "diff";
              const dim = (request.status !== "accepted" && request.status !== "pending") || parseLocal(request.ride.departure_time) <= now;
              return (
                <Link key={request.id} to={`/rides/${request.ride.id}`} className={`ride-row${dim ? " dim" : ""}`}>
                  <span className={`score-badge ${shapeFor(level)} ${dim ? "score-fill-none" : `score-fill-${level}`}${request.ride.match?.percent === 100 ? " perfect-score" : ""}`}>{request.ride.match?.percent ?? "·"}</span>
                  <span className="who"><b>{request.ride.event.name}</b>
                    <span>{request.ride.origin_city.toLowerCase()} → {request.ride.event.city.toLowerCase()} · {day(request.ride.departure_time)} {time(request.ride.departure_time)} · {request.ride.driver.display_name}</span></span>
                  <span className={`status-tag ${request.status}`}>{t(`ride.status.${request.status}`)}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </Screen>
  );
}
