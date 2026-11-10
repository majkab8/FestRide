import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Event, type Ride } from "../api";
import { Page } from "../components/Layout";
import { Icon } from "../components/ui";
import { useAsync } from "../hooks";
import { useI18n } from "../i18n";

/** Group rides by event, most cars first, for the line-up poster. */
function lineup(rides: Ride[]) {
  const by = new Map<number, { ev: Ride["event"]; n: number }>();
  for (const r of rides) {
    const cur = by.get(r.event.id) ?? { ev: r.event, n: 0 };
    cur.n += 1;
    by.set(r.event.id, cur);
  }
  return [...by.values()].sort((a, b) => b.n - a.n);
}

export default function Landing() {
  const { t, plural, day } = useI18n();
  const nav = useNavigate();
  const [text, setText] = useState("");
  const rides = useAsync(() => api.rides({ limit: 100, sort: "departure", min_seats: 0 }), []);
  const events = useAsync(() => api.events({ limit: 9 }), []);
  const cities = useAsync(() => api.cities(), []);
  const total = cities.data?.reduce((n, c) => n + c.events, 0);

  const tiers = useMemo(() => {
    const fromRides = lineup(rides.data ?? []).map((x) => ({ id: x.ev.id, name: x.ev.name, sub: `${x.ev.city.toLowerCase()} · ${plural(x.n, "car")}` }));
    if (fromRides.length >= 3) return { title: t("landing.lineupTitle"), items: fromRides };
    const evs = (events.data ?? []).slice(0, 9).map((e: Event) => ({ id: e.id, name: e.name, sub: `${e.city.toLowerCase()} · ${e.event_date ? day(e.event_date) : ""}` }));
    return { title: t("landing.lineupEmpty"), items: [...fromRides, ...evs.filter((e) => !fromRides.some((f) => f.id === e.id))].slice(0, 9) };
  }, [rides.data, events.data, t, plural, day]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    nav(`/search?text=${encodeURIComponent(text.trim() || t("landing.example"))}`);
  };

  const [top, mid, rest] = [tiers.items.slice(0, 2), tiers.items.slice(2, 5), tiers.items.slice(5, 9)];

  return (
    <Page>
      <section className="sky">
        <div className="stickers" aria-hidden="true">
          <span className="sticker" style={{ left: "7%", top: "62%", background: "var(--lime)", color: "var(--on-bright)", transform: "rotate(-7deg)" }}>{t("landing.sticker1")}</span>
          <svg className="burst" viewBox="0 0 200 200" width="170" height="170" style={{ right: "7%", top: "48%", transform: "rotate(12deg)" }}>
            <polygon points="100,0 116,38 154,16 148,58 192,60 162,92 200,118 158,130 172,172 130,160 118,200 100,166 82,200 70,160 28,172 42,130 0,118 38,92 8,60 52,58 46,16 84,38" fill="var(--blue)" />
            <text x="100" y="104" textAnchor="middle" fontFamily="Fraunces, serif" fontStyle="italic" fontWeight="700" fontSize="48" fill="var(--lime)">{total ?? "…"}</text>
            <text x="100" y="128" textAnchor="middle" fontFamily="DM Mono, monospace" fontSize="13" fill="var(--on-blue)">{t("landing.sticker2").toUpperCase()}</text>
          </svg>
        </div>
        <div className="eyebrow">{t("landing.eyebrow")}</div>
        <h1 className="disp">{t("landing.title")}</h1>
        <form className="ask" role="search" onSubmit={submit}>
          <label htmlFor="landing-q" className="sr-only">{t("landing.ask")}</label>
          <Icon name="spark" />
          <input id="landing-q" value={text} placeholder={t("landing.example")} onChange={(e) => setText(e.target.value)} />
          <button className="btn" type="submit">{t("landing.cta")}</button>
        </form>
      </section>

      <section className="lineup" aria-labelledby="lineup-title">
        <h2 id="lineup-title" className="disp" style={{ fontSize: "clamp(28px,3.6vw,40px)" }}>{tiers.title}</h2>
        {top.length > 0 && (
          <div className="tier poster" style={{ fontSize: "clamp(48px,10vw,150px)" }}>
            {top.map((x, i) => <span key={x.id}>{i > 0 && <span style={{ color: "var(--pink)" }}> ✶ </span>}<Link to={`/search?event_id=${x.id}`}>{x.name}</Link></span>)}
          </div>
        )}
        {top.length > 0 && <div className="note">{top.map((x) => x.sub).join("  ·  ")}</div>}
        {mid.length > 0 && (
          <div className="tier poster" style={{ fontSize: "clamp(32px,6vw,84px)", color: "var(--blue)", marginTop: 18 }}>
            {mid.map((x, i) => <span key={x.id}>{i > 0 && " · "}<Link to={`/search?event_id=${x.id}`}>{x.name}</Link></span>)}
          </div>
        )}
        {rest.length > 0 && (
          <div className="tier poster" style={{ fontSize: "clamp(22px,3.4vw,42px)", maxWidth: 1100, marginTop: 18, lineHeight: 1.1 }}>
            {rest.map((x, i) => <span key={x.id}>{i > 0 && " · "}<Link to={`/search?event_id=${x.id}`}>{x.name}</Link></span>)}
          </div>
        )}
        <Link className="btn" to="/events" style={{ marginTop: 24 }}>{t("landing.allEvents")}</Link>
      </section>

      <section aria-labelledby="how-title" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        <h2 id="how-title" className="disp" style={{ fontSize: "clamp(40px,6vw,72px)", maxWidth: 760 }}>{t("landing.howTitle")}</h2>
        <div className="tiles3">
          <div className="tile3" style={{ background: "var(--pink)", color: "var(--on-bright)", minHeight: 380 }}>
            <span className="big">1</span><h3>{t("landing.how1")}</h3><p>{t("landing.how1p")}</p>
          </div>
          <div className="tile3" style={{ background: "var(--blue)", color: "var(--on-blue)", minHeight: 430 }}>
            <span className="big">2</span><h3>{t("landing.how2")}</h3><p>{t("landing.how2p")}</p>
          </div>
          <div className="tile3" style={{ background: "var(--lime)", color: "var(--on-bright)", minHeight: 480 }}>
            <span className="big">3</span><h3>{t("landing.how3")}</h3><p>{t("landing.how3p")}</p>
          </div>
        </div>
      </section>

      <section className="wide-band" aria-labelledby="match-title">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <h2 id="match-title" className="disp">{t("landing.matchTitle")}</h2>
          <p style={{ fontSize: 19, maxWidth: 520 }}>{t("landing.matchText")}</p>
        </div>
        <div className="bars" style={{ maxWidth: 520, width: "100%", fontSize: 15 }}>
          {[["landing.music", 60, "var(--lime)"], ["landing.style", 25, "var(--pink)"], ["landing.smoking", 15, "var(--peach)"]].map(([k, w, c]) => (
            <div key={k as string}>
              <div className="row"><span>{t(k as "landing.music")}</span><span>{w}%</span></div>
              <div className="bar" style={{ background: "rgba(255,255,255,.22)", height: 14 }}><i style={{ width: `${(w as number) / 0.6}%`, background: c as string }} /></div>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ padding: "48px clamp(22px,5vw,64px)", borderRadius: 48, background: "var(--blush)", color: "var(--on-bright)" }}>
        <h2 className="disp" style={{ fontSize: "clamp(36px,5vw,72px)", maxWidth: 820 }}>{t("landing.driveTitle")}</h2>
        <p style={{ fontSize: 19, maxWidth: 560 }}>{t("landing.driveText")}</p>
        <div><Link className="btn" to="/drive/new">{t("landing.driveCta")}</Link></div>
      </section>
    </Page>
  );
}
