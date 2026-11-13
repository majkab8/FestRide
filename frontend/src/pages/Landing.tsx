import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type Ref } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Ride } from "../api";
import { billName } from "../geo";
import { useAsync, useFittingPlaceholder } from "../hooks";
import { useI18n, parseLocal } from "../i18n";
import { AiBadge } from "../components/ui";
import "./landing.css";
import RecordCar, { CAR_START_ANGLE, stepCar } from "./RecordCar";

const SHOW_RECORD_CAR = true;

const COPY = {
  en: {
    nav: ["Events", "Rides", "Drive"], start: "Home", menu: "Menu", login: "Log in", langLabel: "Language",
    eyebrow: "Carpools to Polish gigs & festivals", title: ["Every road ends", "at a stage."],
    askLabel: "Describe your trip", aiHint: "AI turns your sentence into search filters", ask: "from Łódź to techno in Kraków in December, max 50 zł", askShort: ["from Łódź to techno in Kraków in December", "from Łódź to techno in Kraków", "techno in Kraków"], find: "Find a car",
    record: "A spinning vinyl record", gigs: "GIGS LOADED", gigsShort: "GIGS", side: "SIDE A", byMusic: "match by music", signStage: "to the stage", signCity: "KRAKÓW · 270 KM",
    lineup: "Cars leaving for this weekend's line-up", lineupSoon: "Cars leaving for the next shows", together: "together",
    allOnMap: (count: number) => `See all ${count} events on the map`,
    howTitle: ["Sofa to barrier,", "in three moves."],
    how: [
      ["Say it like a text", "“Gdańsk to Wiatr on Friday, two of us.” We turn the sentence into city, date, genre and budget."],
      ["Pick by match", "Every car shows a match percentage: whether you like the same music, quiet or party on the road, and whether anyone smokes."],
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
  },
  pl: {
    nav: ["Wydarzenia", "Przejazdy", "Kierowca"], start: "Start", menu: "Menu", login: "Zaloguj się", langLabel: "Język",
    eyebrow: "Wspólne dojazdy na koncerty i festiwale", title: ["Każda droga kończy się", "pod sceną."],
    askLabel: "Opisz swoją trasę", aiHint: "AI zamienia twoje zdanie na filtry wyszukiwania", ask: "z Łodzi na techno do Krakowa w grudniu, max 50 zł", askShort: ["z Łodzi na techno do Krakowa w grudniu", "z Łodzi na techno do Krakowa", "z Łodzi na techno"], find: "Znajdź auto",
    record: "Kręcąca się płyta winylowa", gigs: "KONCERTÓW", gigsShort: "KONCERTÓW", side: "STRONA A", byMusic: "dopasowanie po muzyce", signStage: "pod scenę", signCity: "KRAKÓW · 270 KM",
    lineup: "Auta jadą na line-up tego weekendu", lineupSoon: "Auta jadą na najbliższe koncerty", together: "razem",
    allOnMap: (count: number) => `Wszystkie wydarzenia na mapie (${count})`,
    howTitle: ["Z kanapy pod barierki", "w trzech ruchach."],
    how: [
      ["Napisz jak SMS-a", "„Z Gdańska na Wiatr w piątek, jedziemy we dwójkę.” Zamienimy to zdanie na miasto, datę, gatunek i budżet."],
      ["Wybierz po dopasowaniu", "Każde auto ma procent dopasowania: wspólna muzyka, cisza albo impreza w trasie i to, czy ktoś pali."],
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
  },
};

interface Act { id: number; name: string; city: string; venue: string | null; cars: number; date: string | null; }

function weekend(now = new Date()): [Date, Date, Date] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = today.getDay(); // 0 = Sunday
  const friday = new Date(today);
  friday.setDate(today.getDate() + (day === 6 ? -1 : day === 0 ? -2 : 5 - day));
  const plus = (days: number) => { const date = new Date(friday); date.setDate(friday.getDate() + days); return date; };
  return [friday, plus(1), plus(2)];
}
const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;


function acts(rides: Ride[]): Act[] {
  const byEvent = new Map<number, Act>();
  for (const ride of rides) {
    const a = byEvent.get(ride.event.id) ?? { id: ride.event.id, name: ride.event.name, city: ride.event.city, venue: ride.event.venue, cars: 0, date: ride.event.event_date };
    a.cars += 1;
    byEvent.set(ride.event.id, a);
  }
  return [...byEvent.values()].sort((a, b) => b.cars - a.cars || (a.date ?? "").localeCompare(b.date ?? ""));
}

function useRecordSpin() {
  const recordRef = useRef<SVGSVGElement>(null);
  const carRef = useRef<SVGGElement>(null);
  const carAngle = useRef(CAR_START_ANGLE);
  const spin = useRef({ cur: 0, target: 0, grab: null as null | { a: number; r: number }, lastY: null as null | number });
  useEffect(() => {
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onScroll = () => {
      const scrolled = window.scrollY;
      if (spin.current.lastY !== null) spin.current.target += (scrolled - spin.current.lastY) * 0.35;
      spin.current.lastY = scrolled;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    let prev = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const seconds = Math.min(now - prev, 50) / 1000;
      prev = now;
      const state = spin.current;
      if (!state.grab && !calm) state.target += 8 * seconds;
      const before = state.cur;
      state.cur += (state.target - state.cur) * 0.14;
      if (recordRef.current) recordRef.current.style.transform = `rotate(${state.cur.toFixed(2)}deg)`;
      if (carRef.current) {
        carAngle.current = stepCar(carAngle.current, seconds, state.cur - before, calm);
        carRef.current.style.transform = `rotate(${carAngle.current.toFixed(2)}deg)`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", onScroll); };
  }, []);
  const angle = (e: MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return (Math.atan2(e.clientY - (box.top + box.height / 2), e.clientX - (box.left + box.width / 2)) * 180) / Math.PI;
  };
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const state = spin.current;
    const a = angle(e);
    if (!state.grab) { state.grab = { a, r: state.target }; return; }
    let delta = a - state.grab.a;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    state.target = state.grab.r + delta;
    state.grab = { a, r: state.target };
  };
  const onLeave = () => { spin.current.grab = null; };
  return { recordRef, carRef, onMove, onLeave };
}

const GROOVES: [number, string][] = Array.from({ length: 41 }, (_, i) => {
  const radius = 43 + i * 1.32;
  const shades = ["#2B2723", "#25211D", "#2F2B26", "#221F1B"];
  return [Number(radius.toFixed(2)), shades[(i * 7 + (i >> 2)) % shades.length]];
});

const DATE_PILLS = [{ background: "#FF4F8B", color: "#1E1B18" }, { background: "#1E1B18", color: "#F7EBD8" }, { background: "#D7FF4A" }];
const TILES = [
  { background: "#FF4F8B", color: "#FFFAF2", minHeight: 420 },
  { background: "#2D5BFF", color: "#FFFAF2", minHeight: 480 },
  { background: "#D7FF4A", color: "#1E1B18", minHeight: 540 },
];

function useScrollReveal() {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("seen"); observer.unobserve(e.target); }
    }, { threshold: 0, rootMargin: "0px 0px -8% 0px" });
    el.querySelectorAll(":scope > section:not(.hero)").forEach((section) => { section.classList.add("reveal"); observer.observe(section); });
    const steps = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const t = e.target;
        if (e.intersectionRatio >= 0.35 && !t.classList.contains("in-view")) {
          t.classList.toggle("from-above", e.boundingClientRect.top < 0);
          t.classList.add("in-view");
        } else if (!e.isIntersecting) t.classList.remove("in-view", "from-above");
      }
    }, { threshold: [0, 0.35] });
    el.querySelectorAll(".tiles").forEach((t) => { t.classList.add("steps"); steps.observe(t); });
    return () => { observer.disconnect(); steps.disconnect(); };
  }, []);
  return root;
}

function CarShape({ body, light }: { body: string; light: string }) {
  return <>
    <path d="M-7.6 -6.4 L-5.2 -11.2 Q-4.6 -12.2 -3.4 -12.2 L3.6 -12.2 Q4.8 -12.2 5.4 -11.2 L8.2 -6.4 Z" fill={body} />
    <path d="M-12 -6.4 Q-12 -8.6 -9.8 -8.6 L10.2 -8.6 Q12.6 -8.6 12.6 -6.2 L12.6 -2.6 Q12.6 -1.4 11.4 -1.4 L-10.8 -1.4 Q-12 -1.4 -12 -2.6 Z" fill={body} />
    <circle cx="-6.4" cy="-1.2" r="2.5" fill={body} />
    <circle cx="6.8" cy="-1.2" r="2.5" fill={body} />
    <rect x="10.4" y="-6.6" width="2.2" height="1.6" rx=".6" fill={light} />
  </>;
}

function Vinyl({ svgRef, className, pathId, label, text }: { svgRef?: Ref<SVGSVGElement>; className?: string; pathId: string; label?: string; text: string }) {
  return (
    <svg ref={svgRef} className={className} viewBox="0 0 200 200" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <circle cx="100" cy="100" r="99" fill="#1E1B18" />
      {/* smooth lead-in at the rim and run-out by the label */}
      <circle cx="100" cy="100" r="96.6" fill="none" stroke="#16130F" strokeWidth="3.2" />
      <circle cx="100" cy="100" r="98.6" fill="none" stroke="#3A3530" strokeWidth=".6" />
      <circle cx="100" cy="100" r="40.6" fill="none" stroke="#16130F" strokeWidth="3.6" />
      {/* fine grooves, a slightly different shade each, with three track gaps */}
      {GROOVES.map(([radius, shade]) => <circle key={radius} cx="100" cy="100" r={radius} fill="none" stroke={shade} strokeWidth=".38" />)}
      {[57.5, 71, 84].map((radius) => <circle key={radius} cx="100" cy="100" r={radius} fill="none" stroke="#141210" strokeWidth="1.5" />)}
      <circle cx="100" cy="100" r="38" fill="#FF4F8B" />
      <circle cx="100" cy="100" r="38" fill="none" stroke="#D7FF4A" strokeWidth="2" strokeDasharray="3 5" />
      {/* label ring text, drawn at 2x and scaled down: same look, but a legible font size for audits / zoom */}
      <g transform="translate(100 100) scale(0.5) translate(-100 -100)">
        <path id={pathId} d="M100,100 m-50,0 a50,50 0 1,1 100,0 a50,50 0 1,1 -100,0" fill="none" />
        <text fontFamily="DM Mono, monospace" fontSize="12.4" letterSpacing="2.4" fill="#FFFAF2">
          <textPath href={`#${pathId}`}>{text}</textPath>
        </text>
      </g>
      <text x="100" y="106" textAnchor="middle" fontFamily="Fraunces, serif" fontStyle="italic" fontWeight="700" fontSize="17" fill="#1E1B18">fr</text>
      <circle cx="100" cy="100" r="2.6" fill="#FFFFFF" />
    </svg>
  );
}

function useNavSpy() {
  const [on, setOn] = useState<"start" | "events" | "rides" | "drive">("start");
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const line = innerHeight * 0.35;
      const top = (id: string) => document.getElementById(id)?.getBoundingClientRect().top ?? Infinity;
      setOn(top("drive") < line ? "drive" : top("rides") < line ? "rides" : top("events") < line ? "events" : "start");
      setScrolled(scrollY > 8);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(check); };
    check();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); cancelAnimationFrame(frame); };
  }, []);
  return [on, setOn, scrolled] as const;
}

export default function Landing() {
  const { lang, setLang } = useI18n();
  const copy = COPY[lang];
  const nav = useNavigate();
  const [text, setText] = useState("");
  const { recordRef, carRef, onMove, onLeave } = useRecordSpin();
  const revealRoot = useScrollReveal();
  const [navOn, setNavOn, scrolled] = useNavSpy();

  const rides = useAsync(() => api.rides({ limit: 200, sort: "departure", min_seats: 0 }), []);
  const cities = useAsync(() => api.cities(), []);
  const soon = useAsync(() => api.events({ limit: 20 }), []);
  const total = cities.data?.reduce((sum, city) => sum + city.events, 0) ?? 574;

  const [friday, sat, sun] = useMemo(() => weekend(), []);
  const lineup = useMemo(() => {
    const all = acts(rides.data ?? []);
    const days = new Set([friday, sat, sun].map(isoDay));
    const thisWeekend = all.filter((a) => a.date && days.has(a.date));
    const base = thisWeekend.length >= 2 ? thisWeekend : all;
    const fill: Act[] = (soon.data ?? []).filter((e) => !base.some((a) => a.id === e.id))
      .map((e) => ({ id: e.id, name: e.name, city: e.city, venue: e.venue, cars: 0, date: e.event_date }));
    const seen = new Set<string>();
    const items = [...base, ...fill].filter((a) => { const nameKey = billName(a.name).toLowerCase(); if (seen.has(nameKey)) return false; seen.add(nameKey); return true; });
    return { weekend: thisWeekend.length >= 2, items: items.slice(0, 11) };
  }, [rides.data, soon.data, friday, sat, sun]);

  const carWord = (count: number) => {
    if (lang === "en") return `${count} ${count === 1 ? "car" : "cars"}`;
    const form = new Intl.PluralRules("pl").select(count);
    return `${count} ${form === "one" ? "auto" : form === "few" ? "auta" : "aut"}`;
  };
  const pill = (date: Date) => {
    const weekday = new Intl.DateTimeFormat(lang === "pl" ? "pl-PL" : "en-GB", { weekday: "short" }).format(date).replace(".", "");
    return `${weekday} ${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
  };
  const place = (a: Act) => [a.city, a.venue].filter(Boolean).join(", ").toLowerCase();
  const subline = (a: Act) => (a.cars ? `${place(a)} · ${carWord(a.cars)}` : place(a));
  const [t1, t2, t3] = [lineup.items.slice(0, 2), lineup.items.slice(2, 5), lineup.items.slice(5, 11)];
  const upcomingDays = [...new Set(lineup.items.map((a) => a.date).filter(Boolean) as string[])].sort().slice(0, 3).map(parseLocal);
  const dateRow = lineup.weekend || upcomingDays.length < 3 ? [friday, sat, sun] : upcomingDays;

  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    addEventListener("keydown", closeOnEscape);
    return () => removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const bandRef = useRef<HTMLDivElement>(null);
  const [bandOpen, setBandOpen] = useState(false);
  useEffect(() => {
    const el = bandRef.current;
    if (!el || !matchMedia("(hover: none)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let t = 0;
    const observer = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      observer.disconnect();
      t = window.setTimeout(() => { setBandOpen(true); t = window.setTimeout(() => setBandOpen(false), 2200); }, 400);
    }, { threshold: 0.7 });
    observer.observe(el);
    return () => { observer.disconnect(); clearTimeout(t); };
  }, []);

  const [askRef, askPh] = useFittingPlaceholder([copy.ask, ...copy.askShort]);
  const footTargets: [string, string][] = [["/events", copy.nav[0]], ["/search", copy.foot[0]], ["/drive/new", copy.foot[1]], ["/signup", copy.foot[2]]];
  const footLinks = footTargets.map(([to, label]) => <Link key={to} to={to}>{label}</Link>);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    nav(`/search?text=${encodeURIComponent(text.trim() || askPh)}`);
  };

  return (
    <div className="landing" ref={revealRoot}>
      {/* HERO: sunset sky, striped sun with the crowd inside */}
      <section className="hero">
        <div className="inner">
          <nav aria-label="Main" className={[scrolled && "scrolled", menuOpen && "menu-open"].filter(Boolean).join(" ") || undefined}>
            <Link className="landing-logo" to="/">festride</Link>
            {/* very narrow phones: language moves into the dropdown, under the section links */}
            <div className="lang-switch menu-lang" role="group" aria-label={copy.langLabel}>
              <button type="button" aria-pressed={lang === "pl"} onClick={() => setLang("pl")}>PL</button>
              <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            </div>
            <div className="section-nav" id="landing-menu">
              <a href="#top" className={navOn === "start" ? "on" : undefined} onClick={(e) => { e.preventDefault(); setNavOn("start"); setMenuOpen(false); scrollTo({ top: 0, behavior: "smooth" }); }}>{copy.start}</a>
              <a href="#events" className={navOn === "events" ? "on" : undefined} onClick={() => { setNavOn("events"); setMenuOpen(false); }}>{copy.nav[0]}</a>
              <a href="#rides" className={navOn === "rides" ? "on" : undefined} onClick={() => { setNavOn("rides"); setMenuOpen(false); }}>{copy.nav[1]}</a>
              <a href="#drive" className={navOn === "drive" ? "on" : undefined} onClick={() => { setNavOn("drive"); setMenuOpen(false); }}>{copy.nav[2]}</a>
            </div>
            <div className="nav-actions">
              <div className="lang-switch" role="group" aria-label={copy.langLabel}>
                <button type="button" aria-pressed={lang === "pl"} onClick={() => setLang("pl")}>PL</button>
                <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
              </div>
              <Link to="/login" className="pill-btn login-btn">{copy.login}</Link>
              {/* phones: the section links fold into this menu */}
              <button type="button" className="burger" aria-expanded={menuOpen} aria-controls="landing-menu" aria-label={copy.menu} onClick={() => setMenuOpen((wasOpen) => !wasOpen)}>
                <span /><span /><span />
              </button>
            </div>
          </nav>

          <div className="hero-copy">
            <div className="hero-eyebrow">{copy.eyebrow}</div>
            <h1>{copy.title[0]}<br />{copy.title[1]}</h1>
            <form className="hero-search" role="search" onSubmit={submit}>
              <label htmlFor="q3" className="sr-only">{copy.askLabel}</label>
              <input id="q3" ref={askRef} value={text} placeholder={askPh} onChange={(e) => setText(e.target.value)} />
              <span className="ask-ai"><AiBadge title={copy.aiHint} /></span>
              <button className="pill-btn" type="submit">{copy.find}</button>
            </form>
          </div>
        </div>

        {/* the record, spinning where the sun used to rise */}
        <div className="turntable" onMouseMove={onMove} onMouseLeave={onLeave}>
          <Vinyl svgRef={recordRef} className="record" pathId="lbl3" label={copy.record} text={`FESTRIDE ✶ ${copy.side} ✶ ŁÓDŹ → KRAKÓW ✶ ${total} ${copy.gigsShort} ✶`} />
          {/* light catching the grooves: stays put while the record turns under it */}
          <div className="record-sheen" aria-hidden="true" />
          <svg viewBox="0 0 200 200" aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
            {SHOW_RECORD_CAR && <RecordCar carRef={carRef} />}
          </svg>
        </div>

        {/* signpost: every road ends at a stage */}
        <svg className="signpost" viewBox="0 0 230 290" role="img" aria-label={`${copy.signStage} 0 km · ${total} ${copy.gigs.toLowerCase()} · ${copy.signCity}`}>
          <rect x="106" y="20" width="16" height="270" rx="3" fill="#1E1B18" />
          <circle cx="114" cy="20" r="11" fill="#1E1B18" />
          <g className="sign sign-1" transform="translate(14 44) rotate(-4 100 26)">
            <polygon points="0,0 176,0 204,26 176,52 0,52" fill="#2D5BFF" />
            <text x="16" y="34" fontFamily="Fraunces, serif" fontStyle="italic" fontWeight="700" fontSize="25" fill="#D7FF4A">{copy.signStage}</text>
            <text x="172" y="31" textAnchor="end" fontFamily="DM Mono, monospace" fontSize="12" fill="#FFFAF2">0 KM</text>
          </g>
          <g className="sign sign-2" transform="translate(12 112) rotate(3 102 30)">
            <polygon points="0,30 28,0 206,0 206,60 28,60" fill="#FF4F8B" />
            <text x="40" y="42" fontFamily="Fraunces, serif" fontStyle="italic" fontWeight="700" fontSize="34" fill="#FFFAF2">{total}</text>
            <text x="194" y="38" textAnchor="end" fontFamily="DM Mono, monospace" fontSize="12" fill="#1E1B18">{copy.gigs}</text>
          </g>
          <g className="sign sign-3" transform="translate(22 190) rotate(-2 92 22)">
            <polygon points="0,0 160,0 184,22 160,44 0,44" fill="#D7FF4A" />
            <text x="14" y="28" fontFamily="DM Mono, monospace" fontSize="13" letterSpacing="1" fill="#1E1B18">{copy.signCity}</text>
          </g>
        </svg>
        <div className="tag-lime">{copy.byMusic}</div>
      </section>

      {/* LINE-UP POSTER: rides leaving this weekend */}
      <section id="events" className="lineup">
        <div className="inner">
          <div className="dates">
            {dateRow.map((date, i) => <span key={i} className="poster" style={DATE_PILLS[i]}>{pill(date)}</span>)}
          </div>
          <h2>{lineup.weekend ? copy.lineup : copy.lineupSoon}</h2>

          {t1.length > 0 && <>
            <div className="tier poster tier-1">
              {t1.map((a, i) => <span key={a.id}>{i > 0 && <span className="tier-1-star" aria-hidden="true">✶</span>}<Link className="tier-1-name" to={`/search?event_id=${a.id}`} title={a.name}>{billName(a.name)}</Link></span>)}
            </div>
            <div className="tier-sub">{t1.map(subline).join("  ·  ")}</div>
          </>}
          {t2.length > 0 && <>
            <div className="tier poster tier-2">
              {t2.map((a, i) => <span key={a.id}>{i > 0 && " · "}<Link to={`/search?event_id=${a.id}`} title={a.name}>{billName(a.name)}</Link></span>)}
            </div>
            <div className="tier-sub">{[...new Set(t2.map((a) => a.city.toLowerCase()))].join(" · ")}{t2.some((a) => a.cars) ? ` · ${carWord(t2.reduce((n, a) => n + a.cars, 0))} ${copy.together}` : ""}</div>
          </>}
          {t3.length > 0 && (
            <div className="tier poster tier-3">
              {t3.map((a, i) => <span key={a.id}>{i > 0 && " · "}<Link to={`/search?event_id=${a.id}`} title={a.name}>{billName(a.name)}</Link></span>)}
            </div>
          )}

          <Link to="/events" className="pill-btn cta-ink">{copy.allOnMap(total)}</Link>
        </div>
      </section>

      {/* HOW IT WORKS: three colour tiles with scalloped tops */}
      <section className="how">
        <div className="inner">
          <h2>{copy.howTitle[0]}<br />{copy.howTitle[1]}</h2>
          <div className="tiles">
            {copy.how.map(([heading, body], i) => (
              <div key={heading} className="tile" style={TILES[i]}>
                <span className="step-number">{i + 1}</span>
                <h3>{heading}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MATCH: a festival wristband */}
      <section id="rides" className="match-section">
        <div className="inner grid">
          <div>
            <h2>{copy.matchTitle}</h2>
            <p>{copy.matchText}</p>
            <div className="score-bars">
              {([[copy.bars[0], "40 / 60", 67, "#D7FF4A"], [copy.bars[1], "12 / 25", 48, "#FF4F8B"]] as const).map(([label, score, width, color]) => (
                <div key={label}>
                  <div className="bar-head"><span>{label}</span><span>{score}</span></div>
                  <div className="track"><i style={{ width: `${width}%`, background: color }} /></div>
                </div>
              ))}
              {/* smoking is yes/no: it either matches (+15) or it doesn't (0), so a chip, not a bar */}
              <div className="bar-head smoking-row"><span>{copy.bars[2]}</span><span className="smoking-chip on">{copy.bothNoSmoke} · +15</span></div>
            </div>
          </div>
          <div className="band-wrap">
            {/* touch screens have no hover: the band unrolls by itself once it comes into view, and a tap unrolls / rolls it up */}
            <div className={`demo-band${bandOpen ? " open" : ""}`} ref={bandRef} onClick={() => { if (matchMedia("(hover: none)").matches) setBandOpen((wasOpen) => !wasOpen); }}>
              <div className="band-stub">
                <b>67%</b>
                <span>{copy.great}<br />KASIA W. · {copy.bandDay}<br />ŁÓDŹ → KRAKÓW</span>
              </div>
              <span className="poster">Łódź ✶ Kraków</span>
              {/* the other side of the band, revealed when it unrolls: what the two of you share (why it is a 67) */}
              <span className="band-back poster" aria-hidden="true">{copy.bandBack}</span>
              <span className="band-curl" aria-hidden="true" />
            </div>
            <div className="note-lime">{copy.filterNote[0]}<br />{copy.filterNote[1]}<br />{copy.filterNote[2]}</div>
          </div>
        </div>
      </section>

      {/* DRIVE: photos over the sunset */}
      <section id="drive" className="drive-section">
        <div className="inner grid">
          <div className="photos">
            <div className="landing-photo arch"><img src="/img/festival-crowd-800.webp" srcSet="/img/festival-crowd-480.webp 480w, /img/festival-crowd-800.webp 800w" sizes="(max-width: 1100px) 62vw, 400px" width="800" height="1040" loading="lazy" decoding="async" alt={copy.photo1} /></div>
            <div className="landing-photo round"><img src="/img/festival-field-800.webp" srcSet="/img/festival-field-480.webp 480w, /img/festival-field-800.webp 720w" sizes="(max-width: 1100px) 52vw, 340px" width="720" height="720" loading="lazy" decoding="async" alt={copy.photo2} /></div>
            <p className="credit">
              {copy.photoBy} Krzysztof Popławski (<a href="https://commons.wikimedia.org/wiki/File:30_PolAndRock_Festival,_2024,_du%C5%BCa_scena,_Coma,_widok_od_zaplecza_na_scen%C4%99_i_publiczno%C5%9B%C4%87,_KsP_265.jpg" target="_blank" rel="noreferrer">1</a>, <a href="https://commons.wikimedia.org/wiki/File:30_Pol%27and%27Rock_2024,_widok_ca%C5%82ej_przestrzeni_podczas_koncertu_PFK_Live_0018.jpg" target="_blank" rel="noreferrer">2</a>), <a href={lang === "pl" ? "https://creativecommons.org/licenses/by/4.0/deed.pl" : "https://creativecommons.org/licenses/by/4.0/"} target="_blank" rel="noreferrer">CC BY 4.0</a>, {copy.cropped}
            </p>
          </div>
          <div>
            <h2>{copy.driveTitle}</h2>
            <p>{copy.driveText}</p>
            <Link to="/drive/new" className="pill-btn cta-offer">{copy.offer} <span>{copy.perSeat}</span></Link>
          </div>
        </div>
      </section>

      {/* FOOTER: a car driving into the striped sun */}
      {/* FOOTER: the striped sun with the car; on phones a small corner sun */}
      <footer>
        {/* the striped sun, with a car silhouette driving across it into the sunset */}
        <div className="footer-sun" aria-hidden="true" />
        <div className="sunroad" aria-hidden="true">
          <svg className="footer-car" viewBox="-17 -18 31 19"><CarShape body="#1E1B18" light="#D7FF4A" /></svg>
        </div>
        <div className="inner">
          <h2 aria-label={copy.footTitle}><span>{copy.footLines[0]}</span> <span className="second-line">{copy.footLines[1]}</span></h2>
          <div className="links">{footLinks}</div>
        </div>
      </footer>
    </div>
  );
}
