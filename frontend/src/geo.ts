export function fold(s: string): string {
  return s.trim().replace(/ł/g, "l").replace(/Ł/g, "L").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const CITY_COORDS: Record<string, [number, number]> = {
  warszawa: [52.2297, 21.0122], krakow: [50.0647, 19.945], lodz: [51.7592, 19.456], wroclaw: [51.1079, 17.0385],
  poznan: [52.4064, 16.9252], gdansk: [54.352, 18.6466], gdynia: [54.5189, 18.5305], sopot: [54.4416, 18.5601],
  katowice: [50.2649, 19.0238], lublin: [51.2465, 22.5684], bialystok: [53.1325, 23.1688], szczecin: [53.4285, 14.5528],
  bydgoszcz: [53.1235, 18.0084], torun: [53.0138, 18.5984], rzeszow: [50.0412, 21.9991], kielce: [50.8661, 20.6286],
  olsztyn: [53.7784, 20.4801], opole: [50.6751, 17.9213], plock: [52.5463, 19.7065], radom: [51.4027, 21.1471],
  czestochowa: [50.8118, 19.1203], gliwice: [50.2945, 18.6714], zabrze: [50.3249, 18.7857], sosnowiec: [50.2863, 19.104],
  "bielsko-biala": [49.8224, 19.0584], legnica: [51.207, 16.1553], "zielona gora": [51.9356, 15.5062],
  "gorzow wielkopolski": [52.7368, 15.2288], koszalin: [54.1944, 16.1722], slupsk: [54.4641, 17.0285],
  elblag: [54.1561, 19.4045], tarnow: [50.0121, 20.9858], "nowy sacz": [49.6218, 20.6971], zakopane: [49.2992, 19.9496],
  kalisz: [51.7611, 18.091], konin: [52.2235, 18.2511], pila: [53.1515, 16.7388], swinoujscie: [53.9105, 14.2471],
  czaplinek: [53.5583, 16.2333], wloclawek: [52.6482, 19.0678], ostrow: [51.6538, 17.8065], przemysl: [49.7838, 22.7678],
  "gdansk/sopot": [54.4, 18.6],
};

export function cityCoords(city: string): [number, number] | null {
  return CITY_COORDS[fold(city)] ?? null;
}

const FAMILIES: Record<string, string[]> = {
  electronic: ["electronic", "dance", "edm", "techno", "house", "trance", "drum and bass", "dnb", "dubstep", "ambient", "minimal", "electro", "hardstyle", "elektronika"],
  rock: ["rock", "alternative", "indie", "punk", "grunge", "emo", "metal", "hardcore", "metalcore"],
  urban: ["hip hop", "hiphop", "rap", "trap", "drill", "r and b", "rnb", "soul", "funk"],
  pop: ["pop", "disco", "k pop", "kpop", "synthpop", "disco polo"],
  jazz_blues: ["jazz", "blues", "swing", "gospel"],
  classical: ["classical", "opera", "symphonic", "orchestral", "klasyczna"],
  folk_world: ["folk", "world", "country", "reggae", "latin", "ska"],
};

export function familyOf(genre: string | null | undefined): string {
  if (!genre) return "other";
  const g = fold(genre).replace(/&/g, " and ").replace(/[-/]/g, " ").replace(/\s+/g, " ");
  for (const [fam, list] of Object.entries(FAMILIES)) {
    if (list.some((x) => g === x || g.startsWith(x + " ") || g.includes(" " + x) || g.startsWith(x))) return fam;
  }
  return "other";
}

export function initials(name: string): string {
  return name.split(/\s+/).map((w) => w.replace(/[^\p{L}]/gu, "")[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "?";
}

export function billName(name: string): string {
  return name.split(/\s[|–-]\s|:\s|\s\|/)[0].trim() || name;
}
