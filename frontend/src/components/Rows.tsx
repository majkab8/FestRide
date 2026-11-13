import { Link } from "react-router-dom";
import type { Event, Ride } from "../api";
import { useI18n } from "../i18n";
import { Avatar, Icon, Score, Thumb } from "./ui";

export function EventRow({ ev, i, on, rides, onSelect, asStatic, posters }: { ev: Event; i: number; on?: boolean; rides?: number; onSelect?: () => void; asStatic?: boolean; posters?: boolean }) {
  const { dayLong, plural } = useI18n();
  const body = (
    <>
      <Thumb genre={ev.genre} shape={posters ? 3 /* uniform rounded square */ : i} image={posters ? ev.image_url : null} />
      <span style={{ minWidth: 0 }}>
        <span className="event-title">{ev.name}</span>
        <span className="meta" style={{ marginTop: 3 }}>
          {ev.event_date && <span className="tag">{dayLong(ev.event_date)}</span>}
          <span className="tag">{[ev.venue, ev.city].filter(Boolean).join(", ").toLowerCase()}</span>
        </span>
      </span>
      {rides !== undefined && <span className="count">{plural(rides, "ride")}</span>}
    </>
  );
  if (asStatic) return <div className="event-row">{body}</div>;
  return onSelect
    ? <button type="button" className={`event-row${on ? " on" : ""}`} onClick={onSelect} aria-pressed={on}>{body}</button>
    : <Link className="event-row" to={`/search?event_id=${ev.id}`}>{body}</Link>;
}

export function RideRow({ ride, i, why, own }: { ride: Ride; i: number; why?: string; own?: boolean }) {
  const { t, time, day, plural } = useI18n();
  return (
    <Link className="ride" to={`/rides/${ride.id}`}>
      <div className="ride-top">
        {ride.match ? <Score match={ride.match} shape={i} /> : <div className="score"><Avatar name={ride.driver.display_name} shape={i} /><span>{own ? t("ride.own") : t(`style.${ride.driver.driving_style}`)}</span></div>}
        <div className="ride-who">
          <h3>{ride.driver.display_name}</h3>
          <div className="ride-route">
            {ride.origin_city.toLowerCase()} {time(ride.departure_time)} → {(ride.event.venue || ride.event.city).toLowerCase()} · {day(ride.departure_time)}
          </div>
          <div className="ride-route">{ride.event.name}</div>
        </div>
        <span className="price">{ride.price} zł</span>
      </div>
      <div className="ride-more">
        <div className="facts">
          <span className="fact"><Icon name="seat" />{plural(ride.seats_left, "seatLeft")}</span>
          <span className="fact">{t(`style.${ride.driver.driving_style}`)}</span>
          {ride.smoking_allowed
            ? <span className="fact warn"><Icon name="smoke" />{t("ride.smokingOk")}</span>
            : <span className="fact"><Icon name="nosmoke" />{t("ride.noSmoking")}</span>}
        </div>
        {why && <div className="why"><Icon name="spark" /><span>{why}</span></div>}
      </div>
    </Link>
  );
}
