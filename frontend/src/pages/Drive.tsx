import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errorKey, type JoinRequest } from "../api";
import { Page } from "../components/Layout";
import { Empty, ErrorBox, Icon, Loading, matchKey } from "../components/ui";
import { useAsync } from "../hooks";
import { useI18n, parseLocal, type Key } from "../i18n";

export default function Drive() {
  const { t, lang, day, time, plural } = useI18n();
  const [params] = useSearchParams();
  const rides = useAsync(() => api.myRides(), []);
  const now = new Date();
  const list = [...(rides.data ?? [])].sort((a, b) => {
    const pa = parseLocal(a.departure_time) < now, pb = parseLocal(b.departure_time) < now;
    return pa === pb ? a.departure_time.localeCompare(b.departure_time) : pa ? 1 : -1;
  });
  const ride = list.find((r) => r.id === Number(params.get("ride"))) ?? list[0]; // stale/foreign ?ride= -> first own ride
  const selectedId = ride?.id;
  const reqs = useAsync(() => (selectedId ? api.rideRequests(selectedId) : Promise.resolve([] as JoinRequest[])), [selectedId]);
  const [why, setWhy] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  const pending = (reqs.data ?? []).filter((q) => q.status === "pending");
  const accepted = (reqs.data ?? []).filter((q) => q.status === "accepted");
  const decided = (reqs.data ?? []).filter((q) => q.status === "declined");

  useEffect(() => {
    setWhy({});
    const ids = pending.slice(0, 5).map((q) => q.id);
    if (!ids.length) return;
    let live = true;
    api.explain({ request_ids: ids, lang }).then((r) => { if (live) setWhy(r.requests); }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqs.data, lang]);

  const decide = async (q: JoinRequest, status: "accepted" | "declined") => {
    setBusy(q.id);
    setError("");
    try {
      await api.decide(q.id, status);
      reqs.reload();
      rides.reload();
    } catch (err) {
      setError(t(errorKey(err) as Key));
    } finally {
      setBusy(null);
    }
  };

  if (rides.loading && !rides.data) return <Page><Loading /></Page>;
  if (rides.error) return <Page><ErrorBox error={rides.error} onRetry={rides.reload} /></Page>;

  if (!list.length) {
    return (
      <Page>
        <Empty title={t("drive.none")}><Link className="btn btn-pink" to="/drive/new">{t("drive.new")}</Link></Empty>
      </Page>
    );
  }

  const full = ride ? ride.seats_left <= 0 : false;
  const departed = ride ? parseLocal(ride.departure_time) <= now : false;

  return (
    <Page>
      <div className="drive-grid">
        <aside className="side" aria-label={t("drive.yours")}>
          <div className="eyebrow muted" style={{ padding: "0 16px 6px" }}>{t("drive.yours")}</div>
          {list.map((r) => {
            const past = parseLocal(r.departure_time) < now;
            return (
              <Link key={r.id} to={`?ride=${r.id}`} className={`${r.id === selectedId ? "on" : ""}${past ? " past" : ""}`}
                aria-current={r.id === selectedId ? "true" : undefined}>
                <span style={{ minWidth: 0 }}><b style={{ fontSize: 17 }}>{r.event.name}</b><br />
                  <span className="note">{day(r.departure_time)} · {past ? t("drive.done") : `${r.seats_total - r.seats_left}/${r.seats_total}`}</span></span>
              </Link>
            );
          })}
          <Link className="btn" to="/drive/new" style={{ marginTop: 12 }}>{t("drive.new")}</Link>
        </aside>

        {ride && (
          <section style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <div style={{ minWidth: 0 }}>
                <div className="note">{day(ride.departure_time)} · {ride.origin_city.toLowerCase()} {time(ride.departure_time)} → {(ride.event.venue || ride.event.city).toLowerCase()} · {ride.price} zł</div>
                <h1 className="disp" style={{ fontSize: "clamp(40px,5vw,66px)", marginTop: 10 }}>{ride.origin_city} → {ride.event.name}</h1>
              </div>
              <span className="lime-sticker">{t("drive.fill", { n: ride.price * ride.seats_total })}</span>
            </div>

            <div className="seat-row" role="group" aria-label={t("ride.seatsAria", { taken: ride.seats_total - ride.seats_left, total: ride.seats_total })}>
              {Array.from({ length: ride.seats_total }, (_, i) => accepted[i]
                ? <div key={i} className="taken">{accepted[i].passenger.display_name}<span className="mono" style={{ fontSize: 12, fontWeight: 400, opacity: 0.85 }}>{t("drive.seatN", { n: i + 1 })}{accepted[i].match ? ` · ${accepted[i].match!.percent}` : ""}</span></div>
                : <div key={i} className="free">{t("drive.seatFree", { n: i + 1 })}</div>)}
            </div>

            <h2 className="poster" style={{ fontSize: "clamp(30px,4vw,44px)" }}>{pending.length ? t("drive.want", { n: plural(pending.length, "person"), verb: t(["few"].includes(new Intl.PluralRules(lang).select(pending.length)) || (lang === "en" && pending.length !== 1) ? "drive.wantFew" : "drive.wantOne") }) : t("drive.noRequests")}</h2>
            {error && <p className="error" role="alert">{error}</p>}
            {reqs.loading && <Loading />}
            {reqs.error != null && <ErrorBox error={reqs.error} onRetry={reqs.reload} />}
            {pending.length > 0 && (
              <div className="tix-grid">
                {pending.map((q) => {
                  const k = q.match ? matchKey(q.match) : "diff";
                  return (
                    <article className="tix" key={q.id}>
                      <div className="body">
                        <div className="row" style={{ justifyContent: "flex-start", flexWrap: "nowrap" }}>
                          <span className={`num c-${k}`} style={{ fontSize: 54, lineHeight: 1 }}>{q.match?.percent ?? "·"}</span>
                          <div style={{ minWidth: 0 }}><b style={{ fontSize: 19 }}>{q.passenger.display_name}</b><br />
                            <span className="note">{q.passenger.music_genres.slice(0, 3).join(", ")} · {t(`style.${q.passenger.driving_style}`)}</span></div>
                        </div>
                        {q.message && <p className="quote">“{q.message}”</p>}
                        {why[String(q.id)] && <div className="why"><Icon name="spark" /><span>{why[String(q.id)]}</span></div>}
                      </div>
                      <div className="cut" />
                      <div className="acts">
                        <button className="btn btn-light btn-sm" type="button" style={{ background: "var(--bg)" }} disabled={busy === q.id} onClick={() => decide(q, "declined")}>{t("drive.notNow")}</button>
                        <button className="btn btn-sm" type="button" disabled={busy === q.id || full || departed} onClick={() => decide(q, "accepted")}>{full ? t("drive.full") : t("drive.take", { name: q.passenger.display_name.split(" ")[0] })}</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {decided.length > 0 && (
              <div className="card" style={{ background: "transparent", padding: "4px 6px", gap: 8 }}>
                <span className="eyebrow muted">{t("drive.decided")}</span>
                <div className="chips">{decided.map((q) => <span key={q.id} className="pill declined">{q.passenger.display_name} · {t("ride.status.declined")}</span>)}</div>
              </div>
            )}
          </section>
        )}
      </div>
    </Page>
  );
}
