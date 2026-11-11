import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type Ref } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Ride } from "../api";
import { billName } from "../geo";
import { useAsync } from "../hooks";
import { useI18n, parseLocal } from "../i18n";
import "./landing.css";
import RecordCar, { CAR_START_ANGLE, stepCar } from "./RecordCar"; // EXPERIMENT: car on the record

const SHOW_RECORD_CAR = true; // EXPERIMENT: set to false (or delete RecordCar) to remove

/* Copy of the v3 Landing board, in both languages. */
const COPY = {
  en: {
    nav: ["Events", "Rides", "Drive"], start: "Home", menu: "Menu", login: "Log in", langLabel: "Language",
    eyebrow: "Carpools to Polish gigs & festivals", title: ["Every road ends", "at a stage."],
    askLabel: "Describe your trip", ask: "from Łódź to techno in Kraków in December, max 50 zł", find: "Find a car",
    record: "A spinning vinyl record", gigs: "GIGS LOADED", gigsShort: "GIGS", side: "SIDE A", byMusic: "match by music", signStage: "to the stage", signCity: "KRAKÓW · 270 KM",
    lineup: "Cars leaving for this weekend's line-up", lineupSoon: "Cars leaving for the next shows", together: "together",
    allOnMap: (n: number) => `See all ${n} events on the map`,
    howTitle: ["Sofa to barrier,", "in three moves."],
    how: [
      ["Say it like a text", "“Gdańsk to Wiatr on Friday, two of us.” We turn the sentence into city, date, genre and budget."],
      ["Pick by match", "Every car shows a percentage: the music you both play, how loud the ride is, smoking or not."],
      ["Split the fuel", "Ask a few cars at once. The first driver who says yes gets you, the other requests close."],
    ],
    matchTitle: "Four hours is long with the wrong DJ.",
    matchText: "Kasia drives Łódź to Kraków and plays techno and house. You share the house, neither of you smokes, she just likes a quiet ride. That's a 67.",
    bars: ["music", "ride style", "smoking"], great: "GOOD MATCH", bothNoSmoke: "neither of you smokes", bandDay: "SAT 12.12", bandBack: "Both into house ✶ Smoke-free",
    filterNote: ["same vibe,", "same", "route"],
    photo1: "Crowd with flags in front of the main stage at Pol'and'Rock 2024", photo2: "Festival field with the main stage and a Ferris wheel at Pol'and'Rock 2024",
    photoBy: "Photos:", cropped: "cropped",
    driveTitle: "Three empty seats? That's 135 zł of fuel.",
    driveText: "Post your route and time. People who like your music ask for a seat, you pick who comes.",
    offer: "Offer a ride", perSeat: "45 zł / seat",
    footTitle: "See you at the gate.", footLines: ["See you", "at the gate."], foot: ["Find a ride", "Offer a ride", "Sign up"],
    credit: "Photos: Thesupermat (CC BY-SA 3.0), Nathan (CC BY-SA 2.0), via Wikimedia Commons.",
  },
  pl: {
    nav: ["Wydarzenia", "Przejazdy", "Kierowca"], start: "Start", menu: "Menu", login: "Zaloguj się", langLabel: "Język",
    eyebrow: "Wspólne dojazdy na koncerty i festiwale", title: ["Każda droga kończy się", "pod sceną."],
    askLabel: "Opisz swoją trasę", ask: "z Łodzi na techno do Krakowa w grudniu, max 50 zł", find: "Znajdź auto",
    record: "Kręcąca się płyta winylowa", gigs: "KONCERTÓW", gigsShort: "KONCERTÓW", side: "STRONA A", byMusic: "dopasowanie po muzyce", signStage: "pod scenę", signCity: "KRAKÓW · 270 KM",
    lineup: "Auta jadą na line-up tego weekendu", lineupSoon: "Auta jadą na najbliższe koncerty", together: "razem",
    allOnMap: (n: number) => `Wszystkie wydarzenia na mapie (${n})`,
    howTitle: ["Z kanapy pod barierki", "w trzech ruchach."],
    how: [
      ["Napisz jak SMS-a", "„Z Gdańska na Wiatr w piątek, jedziemy we dwójkę.” Zamienimy to zdanie na miasto, datę, gatunek i budżet."],
      ["Wybierz po dopasowaniu", "Każde auto ma procent: wspólna muzyka, jak głośno jest w trasie, palenie albo nie."],
      ["Podzielcie się paliwem", "Poproś kilka aut naraz. Pierwszy kierowca, który się zgodzi, zabiera cię, a reszta próśb się zamyka."],
    ],
    matchTitle: "Cztery godziny to długo ze złym DJ-em.",
    matchText: "Kasia jedzie z Łodzi do Krakowa i puszcza techno i house. Wspólny macie house, oboje nie palicie, tylko ona woli ciszę w trasie. Razem 67.",
    bars: ["muzyka", "styl jazdy", "palenie"], great: "DOBRE DOPASOWANIE", bothNoSmoke: "oboje nie palicie", bandDay: "SOB 12.12", bandBack: "Wspólny house ✶ Bez palenia",
    filterNote: ["ten sam vibe,", "ta sama", "trasa"],
    photo1: "Tłum z flagami pod dużą sceną na Pol'and'Rock 2024", photo2: "Pole festiwalowe z dużą sceną i diabelskim młynem na Pol'and'Rock 2024",
    photoBy: "fot.", cropped: "kadr",
    driveTitle: "Trzy wolne miejsca? To 135 zł na paliwo.",
    driveText: "Dodaj trasę i godzinę. Osoby, które lubią twoją muzykę, poproszą o miejsce, a ty wybierasz, kto jedzie.",
    offer: "Zaproponuj przejazd", perSeat: "45 zł / miejsce",
    footTitle: "Do zobaczenia pod bramą.", footLines: ["Do zobaczenia", "pod bramą."], foot: ["Znajdź przejazd", "Zaproponuj przejazd", "Załóż konto"],
    credit: "Zdjęcia: Thesupermat (CC BY-SA 3.0), Nathan (CC BY-SA 2.0), Wikimedia Commons.",
  },
};

interface Act { id: number; name: string; city: string; venue: string | null; cars: number; date: string | null; }

/** This weekend's Friday..Sunday (the coming one on Mon-Thu). */
function weekend(now = new Date()): [Date, Date, Date] {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay(); // 0 = Sunday
  const fri = new Date(d);
  fri.setDate(d.getDate() + (day === 6 ? -1 : day === 0 ? -2 : 5 - day));
  const plus = (n: number) => { const x = new Date(fri); x.setDate(fri.getDate() + n); return x; };
  return [fri, plus(1), plus(2)];
}
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;


/** Rides grouped by event, most cars first: the line-up billing order. */
function acts(rides: Ride[]): Act[] {
  const by = new Map<number, Act>();
  for (const r of rides) {
    const a = by.get(r.event.id) ?? { id: r.event.id, name: r.event.name, city: r.event.city, venue: r.event.venue, cars: 0, date: r.event.event_date };
    a.cars += 1;
    by.set(r.event.id, a);
  }
  return [...by.values()].sort((a, b) => b.cars - a.cars || (a.date ?? "").localeCompare(b.date ?? ""));
}

/** The record spins slowly, follows the pointer's angle and nudges with scroll. */
function useRecordSpin() {
  const rec = useRef<SVGSVGElement>(null);
  const car = useRef<SVGGElement>(null); // EXPERIMENT: car rides the record
  const carAngle = useRef(CAR_START_ANGLE);
  const st = useRef({ cur: 0, target: 0, grab: null as null | { a: number; r: number }, lastY: null as null | number });
  useEffect(() => {
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onScroll = () => {
      const y = window.scrollY;
      if (st.current.lastY !== null) st.current.target += (y - st.current.lastY) * 0.35;
      st.current.lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    let prev = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - prev, 50) / 1000;
      prev = now;
      const s = st.current;
      if (!s.grab && !calm) s.target += 8 * dt;
      const before = s.cur;
      s.cur += (s.target - s.cur) * 0.14;
      if (rec.current) rec.current.style.transform = `rotate(${s.cur.toFixed(2)}deg)`;
      if (car.current) { // EXPERIMENT: the car follows the record's spin (faster, or backwards)
        carAngle.current = stepCar(carAngle.current, dt, s.cur - before, calm);
        car.current.style.transform = `rotate(${carAngle.current.toFixed(2)}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); };
  }, []);
  const angle = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const s = st.current;
    const a = angle(e);
    if (!s.grab) { s.grab = { a, r: s.target }; return; }
    let d = a - s.grab.a;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    s.target = s.grab.r + d;
    s.grab = { a, r: s.target };
  };
  const onLeave = () => { st.current.grab = null; };
  return { rec, car, onMove, onLeave };
}

/** Groove rings for the record: radius and a shade that drifts a little, like real vinyl. */
const GROOVES: [number, string][] = Array.from({ length: 41 }, (_, i) => {
  const r = 43 + i * 1.32;
  const shades = ["#2B2723", "#25211D", "#2F2B26", "#221F1B"];
  return [Number(r.toFixed(2)), shades[(i * 7 + (i >> 2)) % shades.length]];
});

const DATE_PILLS = [{ background: "#FF4F8B", color: "#FFFAF2" }, { background: "#1E1B18", color: "#F7EBD8" }, { background: "#D7FF4A" }];
const TILES = [
  { background: "#FF4F8B", color: "#FFFAF2", minHeight: 420 },
  { background: "#2D5BFF", color: "#FFFAF2", minHeight: 480 },
  { background: "#D7FF4A", color: "#1E1B18", minHeight: 540 },
];

/** Sections below the hero slide in as they scroll into view (motion.css).
    Layout effect: the classes go on before the first paint, so nothing flashes.
    Sections keep static classNames, so React never wipes rv/seen. */
function useScrollReveal() {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); }
    }, { threshold: 0, rootMargin: "0px 0px -8% 0px" });
    el.querySelectorAll(":scope > section:not(.hero)").forEach((s) => { s.classList.add("rv"); io.observe(s); });
    // the "three moves" tiles play every time they come on screen:
    // scrolling down they fall in from above (1 → 2 → 3), scrolling up they float up from below (3 → 2 → 1).
    // Once fully off screen they reset, ready for the next pass.
    const steps = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const t = e.target;
        if (e.intersectionRatio >= 0.35 && !t.classList.contains("go")) {
          t.classList.toggle("up", e.boundingClientRect.top < 0);
          t.classList.add("go");
        } else if (!e.isIntersecting) t.classList.remove("go", "up");
      }
    }, { threshold: [0, 0.35] });
    el.querySelectorAll(".tiles").forEach((t) => { t.classList.add("steps"); steps.observe(t); });
    return () => { io.disconnect(); steps.disconnect(); };
  }, []);
  return root;
}

/** Small side-on car silhouette (same shape as the record car), drawn in a viewBox of "-17 -18 31 19". */
function CarShape({ body, light }: { body: string; light: string }) {
  return <>
    <path d="M-7.6 -6.4 L-5.2 -11.2 Q-4.6 -12.2 -3.4 -12.2 L3.6 -12.2 Q4.8 -12.2 5.4 -11.2 L8.2 -6.4 Z" fill={body} />
    <path d="M-12 -6.4 Q-12 -8.6 -9.8 -8.6 L10.2 -8.6 Q12.6 -8.6 12.6 -6.2 L12.6 -2.6 Q12.6 -1.4 11.4 -1.4 L-10.8 -1.4 Q-12 -1.4 -12 -2.6 Z" fill={body} />
    <circle cx="-6.4" cy="-1.2" r="2.5" fill={body} />
    <circle cx="6.8" cy="-1.2" r="2.5" fill={body} />
    <rect x="10.4" y="-6.6" width="2.2" height="1.6" rx=".6" fill={light} />
  </>;
}

/** The vinyl record in the hero. */
function Vinyl({ svgRef, className, pathId, label, text }: { svgRef?: Ref<SVGSVGElement>; className?: string; pathId: string; label?: string; text: string }) {
  return (
    <svg ref={svgRef} className={className} viewBox="0 0 200 200" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs><path id={pathId} d="M100,100 m-25,0 a25,25 0 1,1 50,0 a25,25 0 1,1 -50,0" /></defs>
      <circle cx="100" cy="100" r="99" fill="#1E1B18" />
      {/* smooth lead-in at the rim and run-out by the label */}
      <circle cx="100" cy="100" r="96.6" fill="none" stroke="#16130F" strokeWidth="3.2" />
      <circle cx="100" cy="100" r="98.6" fill="none" stroke="#3A3530" strokeWidth=".6" />
      <circle cx="100" cy="100" r="40.6" fill="none" stroke="#16130F" strokeWidth="3.6" />
      {/* fine grooves, a slightly different shade each, with three track gaps */}
      {GROOVES.map(([r, shade]) => <circle key={r} cx="100" cy="100" r={r} fill="none" stroke={shade} strokeWidth=".38" />)}
      {[57.5, 71, 84].map((r) => <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#141210" strokeWidth="1.5" />)}
      <circle cx="100" cy="100" r="38" fill="#FF4F8B" />
      <circle cx="100" cy="100" r="38" fill="none" stroke="#D7FF4A" strokeWidth="2" strokeDasharray="3 5" />
      <text fontFamily="DM Mono, monospace" fontSize="6.2" letterSpacing="1.2" fill="#FFFAF2">
        <textPath href={`#${pathId}`}>{text}</textPath>
      </text>
      <text x="100" y="106" textAnchor="middle" fontFamily="Fraunces, serif" fontStyle="italic" fontWeight="700" fontSize="17" fill="#1E1B18">fr</text>
      <circle cx="100" cy="100" r="2.6" fill="#FFFFFF" />
    </svg>
  );
}

/** Top bar state: whether the page has scrolled (frosted background on), and which item is highlighted: follows the section you are looking at
    (Events = line-up, Rides = the match/wristband section, Driver = the photos and fuel section), Start at the top. */
function useNavSpy() {
  const [on, setOn] = useState<"start" | "events" | "rides" | "drive">("start");
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const line = innerHeight * 0.35;
      const top = (id: string) => document.getElementById(id)?.getBoundingClientRect().top ?? Infinity;
      setOn(top("drive") < line ? "drive" : top("rides") < line ? "rides" : top("events") < line ? "events" : "start");
      setScrolled(scrollY > 8);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, []);
  return [on, setOn, scrolled] as const;
}

export default function Landing() {
  const { lang, setLang } = useI18n();
  const c = COPY[lang];
  const nav = useNavigate();
  const [text, setText] = useState("");
  const { rec, car, onMove, onLeave } = useRecordSpin();
  const revealRoot = useScrollReveal();
  const [navOn, setNavOn, scrolled] = useNavSpy();

  const rides = useAsync(() => api.rides({ limit: 200, sort: "departure", min_seats: 0 }), []);
  const cities = useAsync(() => api.cities(), []);
  const soon = useAsync(() => api.events({ limit: 20 }), []);
  const total = cities.data?.reduce((n, x) => n + x.events, 0) ?? 574;

  const [fri, sat, sun] = useMemo(() => weekend(), []);
  const lineup = useMemo(() => {
    const all = acts(rides.data ?? []);
    const days = new Set([fri, sat, sun].map(isoDay));
    const thisWeekend = all.filter((a) => a.date && days.has(a.date));
    const base = thisWeekend.length >= 2 ? thisWeekend : all;
    // Fill the lower tiers with the next shows, so the poster always has a full bill.
    const fill: Act[] = (soon.data ?? []).filter((e) => !base.some((a) => a.id === e.id))
      .map((e) => ({ id: e.id, name: e.name, city: e.city, venue: e.venue, cars: 0, date: e.event_date }));
    const seen = new Set<string>();
    const items = [...base, ...fill].filter((a) => { const k = billName(a.name).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    return { weekend: thisWeekend.length >= 2, items: items.slice(0, 11) };
  }, [rides.data, soon.data, fri, sat, sun]);

  const carWord = (n: number) => {
    if (lang === "en") return `${n} ${n === 1 ? "car" : "cars"}`;
    const cat = new Intl.PluralRules("pl").select(n);
    return `${n} ${cat === "one" ? "auto" : cat === "few" ? "auta" : "aut"}`;
  };
  const pill = (d: Date) => {
    const wd = new Intl.DateTimeFormat(lang === "pl" ? "pl-PL" : "en-GB", { weekday: "short" }).format(d).replace(".", "");
    return `${wd} ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const place = (a: Act) => [a.city, a.venue].filter(Boolean).join(", ").toLowerCase();
  const sub = (a: Act) => (a.cars ? `${place(a)} · ${carWord(a.cars)}` : place(a));
  const [t1, t2, t3] = [lineup.items.slice(0, 2), lineup.items.slice(2, 5), lineup.items.slice(5, 11)];
  const upcomingDays = [...new Set(lineup.items.map((a) => a.date).filter(Boolean) as string[])].sort().slice(0, 3).map(parseLocal);
  const dateRow = lineup.weekend || upcomingDays.length < 3 ? [fri, sat, sun] : upcomingDays;

  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [menuOpen]);

  const bandRef = useRef<HTMLDivElement>(null);
  const [bandOpen, setBandOpen] = useState(false);
  useEffect(() => {
    const el = bandRef.current;
    if (!el || !matchMedia("(hover: none)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let t = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      t = window.setTimeout(() => { setBandOpen(true); t = window.setTimeout(() => setBandOpen(false), 2200); }, 400);
    }, { threshold: 0.7 });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);

  const footTargets: [string, string][] = [["/events", c.nav[0]], ["/search", c.foot[0]], ["/drive/new", c.foot[1]], ["/signup", c.foot[2]]];
  const footLinks = footTargets.map(([to, label]) => <Link key={to} to={to}>{label}</Link>);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    nav(`/search?text=${encodeURIComponent(text.trim() || c.ask)}`);
  };

  return (
    <div className="v3" ref={revealRoot}>
      {/* HERO: sunset sky, striped sun with the crowd inside */}
      <section className="hero">
        <div className="in">
          <nav aria-label="Main" className={[scrolled && "scrolled", menuOpen && "menu-open"].filter(Boolean).join(" ") || undefined}>
            <Link className="logo3" to="/">festride</Link>
            <div className="navpill" id="landing-menu">
              <a href="#top" className={navOn === "start" ? "on" : undefined} onClick={(e) => { e.preventDefault(); setNavOn("start"); setMenuOpen(false); scrollTo({ top: 0, behavior: "smooth" }); }}>{c.start}</a>
              <a href="#events" className={navOn === "events" ? "on" : undefined} onClick={() => { setNavOn("events"); setMenuOpen(false); }}>{c.nav[0]}</a>
              <a href="#rides" className={navOn === "rides" ? "on" : undefined} onClick={() => { setNavOn("rides"); setMenuOpen(false); }}>{c.nav[1]}</a>
              <a href="#drive" className={navOn === "drive" ? "on" : undefined} onClick={() => { setNavOn("drive"); setMenuOpen(false); }}>{c.nav[2]}</a>
            </div>
            <div className="navright">
              <div className="langpill" role="group" aria-label={c.langLabel}>
                <button type="button" aria-pressed={lang === "pl"} onClick={() => setLang("pl")}>PL</button>
                <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
              </div>
              <Link to="/login" className="btn3 login3">{c.login}</Link>
              {/* phones: the section links fold into this menu */}
              <button type="button" className="burger" aria-expanded={menuOpen} aria-controls="landing-menu" aria-label={c.menu} onClick={() => setMenuOpen((o) => !o)}>
                <span /><span /><span />
              </button>
            </div>
          </nav>

          <div className="hero-copy">
            <div className="hero-eyebrow">{c.eyebrow}</div>
            <h1>{c.title[0]}<br />{c.title[1]}</h1>
            <form className="ask3" role="search" onSubmit={submit}>
              <label htmlFor="q3" className="sr-only">{c.askLabel}</label>
              <input id="q3" value={text} placeholder={c.ask} onChange={(e) => setText(e.target.value)} />
              <button className="btn3" type="submit">{c.find}</button>
            </form>
          </div>
        </div>

        {/* the record, spinning where the sun used to rise */}
        <div className="deck" onMouseMove={onMove} onMouseLeave={onLeave}>
          <Vinyl svgRef={rec} className="rec" pathId="lbl3" label={c.record} text={`FESTRIDE ✶ ${c.side} ✶ ŁÓDŹ → KRAKÓW ✶ ${total} ${c.gigsShort} ✶`} />
          {/* light catching the grooves: stays put while the record turns under it */}
          <div className="sheen" aria-hidden="true" />
          <svg viewBox="0 0 200 200" aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
            {SHOW_RECORD_CAR && <RecordCar carRef={car} />}
          </svg>
        </div>

        {/* signpost: every road ends at a stage */}
        <svg className="signpost" viewBox="0 0 230 290" role="img" aria-label={`${c.signStage} 0 km · ${total} ${c.gigs.toLowerCase()} · ${c.signCity}`}>
          <rect x="106" y="20" width="16" height="270" rx="3" fill="#1E1B18" />
          <circle cx="114" cy="20" r="11" fill="#1E1B18" />
          <g className="sign s1" transform="translate(14 44) rotate(-4 100 26)">
            <polygon points="0,0 176,0 204,26 176,52 0,52" fill="#2D5BFF" />
            <text x="16" y="34" fontFamily="Fraunces, serif" fontStyle="italic" fontWeight="700" fontSize="25" fill="#D7FF4A">{c.signStage}</text>
            <text x="172" y="31" textAnchor="end" fontFamily="DM Mono, monospace" fontSize="12" fill="#FFFAF2">0 KM</text>
          </g>
          <g className="sign s2" transform="translate(12 112) rotate(3 102 30)">
            <polygon points="0,30 28,0 206,0 206,60 28,60" fill="#FF4F8B" />
            <text x="40" y="42" fontFamily="Fraunces, serif" fontStyle="italic" fontWeight="700" fontSize="34" fill="#FFFAF2">{total}</text>
            <text x="194" y="38" textAnchor="end" fontFamily="DM Mono, monospace" fontSize="12" fill="#1E1B18">{c.gigs}</text>
          </g>
          <g className="sign s3" transform="translate(22 190) rotate(-2 92 22)">
            <polygon points="0,0 160,0 184,22 160,44 0,44" fill="#D7FF4A" />
            <text x="14" y="28" fontFamily="DM Mono, monospace" fontSize="13" letterSpacing="1" fill="#1E1B18">{c.signCity}</text>
          </g>
        </svg>
        <div className="tag-lime">{c.byMusic}</div>
      </section>

      {/* LINE-UP POSTER: rides leaving this weekend */}
      <section id="events" className="lineup3">
        <div className="in">
          <div className="dates">
            {dateRow.map((d, i) => <span key={i} className="poster" style={DATE_PILLS[i]}>{pill(d)}</span>)}
          </div>
          <h2>{lineup.weekend ? c.lineup : c.lineupSoon}</h2>

          {t1.length > 0 && <>
            <div className="tier poster t1">
              {t1.map((a, i) => <span key={a.id}>{i > 0 && <span className="t1-star" aria-hidden="true">✶</span>}<Link className="t1-name" to={`/search?event_id=${a.id}`} title={a.name}>{billName(a.name)}</Link></span>)}
            </div>
            <div className="sub3">{t1.map(sub).join("  ·  ")}</div>
          </>}
          {t2.length > 0 && <>
            <div className="tier poster t2">
              {t2.map((a, i) => <span key={a.id}>{i > 0 && " · "}<Link to={`/search?event_id=${a.id}`} title={a.name}>{billName(a.name)}</Link></span>)}
            </div>
            <div className="sub3">{[...new Set(t2.map((a) => a.city.toLowerCase()))].join(" · ")}{t2.some((a) => a.cars) ? ` · ${carWord(t2.reduce((n, a) => n + a.cars, 0))} ${c.together}` : ""}</div>
          </>}
          {t3.length > 0 && (
            <div className="tier poster t3">
              {t3.map((a, i) => <span key={a.id}>{i > 0 && " · "}<Link to={`/search?event_id=${a.id}`} title={a.name}>{billName(a.name)}</Link></span>)}
            </div>
          )}

          <Link to="/events" className="btn3 cta-ink">{c.allOnMap(total)}</Link>
        </div>
      </section>

      {/* HOW IT WORKS: three colour tiles with scalloped tops */}
      <section className="how">
        <div className="in">
          <h2>{c.howTitle[0]}<br />{c.howTitle[1]}</h2>
          <div className="tiles">
            {c.how.map(([h, p], i) => (
              <div key={h} className="tile" style={TILES[i]}>
                <span className="n">{i + 1}</span>
                <h3>{h}</h3>
                <p>{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MATCH: a festival wristband */}
      <section id="rides" className="match3">
        <div className="in grid">
          <div>
            <h2>{c.matchTitle}</h2>
            <p>{c.matchText}</p>
            <div className="bars3">
              {([[c.bars[0], "40 / 60", 67, "#D7FF4A"], [c.bars[1], "12 / 25", 48, "#FF4F8B"]] as const).map(([label, val, w, col]) => (
                <div key={label}>
                  <div className="row3"><span>{label}</span><span>{val}</span></div>
                  <div className="track"><i style={{ width: `${w}%`, background: col }} /></div>
                </div>
              ))}
              {/* smoking is yes/no: it either matches (+15) or it doesn't (0), so a chip, not a bar */}
              <div className="row3 yn-row"><span>{c.bars[2]}</span><span className="yn on">{c.bothNoSmoke} · +15</span></div>
            </div>
          </div>
          <div className="bandwrap">
            {/* touch screens have no hover: the band unrolls by itself once it comes into view, and a tap unrolls / rolls it up */}
            <div className={`band3${bandOpen ? " open" : ""}`} ref={bandRef} onClick={() => { if (matchMedia("(hover: none)").matches) setBandOpen((o) => !o); }}>
              <div className="stub3">
                <b>67%</b>
                <span>{c.great}<br />KASIA W. · {c.bandDay}<br />ŁÓDŹ → KRAKÓW</span>
              </div>
              <span className="poster">Łódź ✶ Kraków</span>
              {/* the other side of the band, revealed when it unrolls: what the two of you share (why it is a 67) */}
              <span className="back poster" aria-hidden="true">{c.bandBack}</span>
              <span className="curl" aria-hidden="true" />
            </div>
            <div className="note-lime">{c.filterNote[0]}<br />{c.filterNote[1]}<br />{c.filterNote[2]}</div>
          </div>
        </div>
      </section>

      {/* DRIVE: photos over the sunset */}
      <section id="drive" className="drive3">
        <div className="in grid">
          <div className="photos">
            <div className="ph arch"><img src="/img/festival-crowd.jpg" alt={c.photo1} /></div>
            <div className="ph round"><img src="/img/festival-field.jpg" alt={c.photo2} /></div>
            <p className="credit">
              {c.photoBy} Krzysztof Popławski (<a href="https://commons.wikimedia.org/wiki/File:30_PolAndRock_Festival,_2024,_du%C5%BCa_scena,_Coma,_widok_od_zaplecza_na_scen%C4%99_i_publiczno%C5%9B%C4%87,_KsP_265.jpg" target="_blank" rel="noreferrer">1</a>, <a href="https://commons.wikimedia.org/wiki/File:30_Pol%27and%27Rock_2024,_widok_ca%C5%82ej_przestrzeni_podczas_koncertu_PFK_Live_0018.jpg" target="_blank" rel="noreferrer">2</a>), <a href={lang === "pl" ? "https://creativecommons.org/licenses/by/4.0/deed.pl" : "https://creativecommons.org/licenses/by/4.0/"} target="_blank" rel="noreferrer">CC BY 4.0</a>, {c.cropped}
            </p>
          </div>
          <div>
            <h2>{c.driveTitle}</h2>
            <p>{c.driveText}</p>
            <Link to="/drive/new" className="btn3 cta-offer">{c.offer} <span>{c.perSeat}</span></Link>
          </div>
        </div>
      </section>

      {/* FOOTER: a car driving into the striped sun */}
      {/* FOOTER: the striped sun with the car; on phones a small corner sun */}
      <footer>
        {/* the striped sun, with a car silhouette driving across it into the sunset */}
        <div className="sun3" aria-hidden="true" />
        <div className="sunroad" aria-hidden="true">
          <svg className="sundrive" viewBox="-17 -18 31 19"><CarShape body="#1E1B18" light="#D7FF4A" /></svg>
        </div>
        <div className="in">
          <h2 aria-label={c.footTitle}><span>{c.footLines[0]}</span> <span className="l2">{c.footLines[1]}</span></h2>
          <div className="links">{footLinks}<span>hello@festride.example</span></div>
          <p className="credit">{c.credit}</p>
        </div>
      </footer>
    </div>
  );
}
