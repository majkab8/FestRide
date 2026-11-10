import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

export interface MapPin { id: string | number; pos: [number, number]; label: string; title: string; on?: boolean; }
export interface MapOrigin { id: string | number; pos: [number, number]; title: string; on?: boolean; }
export interface MapRoute { id: string | number; from: [number, number]; to: [number, number]; on?: boolean; }

const POLAND_CENTER: [number, number] = [52.0, 19.2];

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function pinIcon(label: string, on: boolean) {
  const size = on ? 44 : 36;
  return L.divIcon({
    className: "",
    html: `<div class="pin${on ? " on" : ""}" style="width:${size}px;height:${size}px"><span>${escapeHtml(label)}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}
const originIcon = (on: boolean) => L.divIcon({ className: "", html: `<div class="origin-dot${on ? " on" : ""}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });

/** Re-fit the view whenever the set of points changes. */
function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (points.length === 0) map.setView(POLAND_CENTER, 6);
    else if (points.length === 1) map.setView(points[0], 9);
    else map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 10 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

/** Arc between two points, so overlapping routes stay readable. */
function arc(a: [number, number], b: [number, number]): [number, number][] {
  const [lat1, lng1] = a, [lat2, lng2] = b;
  const mid: [number, number] = [(lat1 + lat2) / 2 + (lng2 - lng1) * 0.12, (lng1 + lng2) / 2 - (lat2 - lat1) * 0.12];
  const pts: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push([(1 - t) ** 2 * lat1 + 2 * (1 - t) * t * mid[0] + t ** 2 * lat2, (1 - t) ** 2 * lng1 + 2 * (1 - t) * t * mid[1] + t ** 2 * lng2]);
  }
  return pts;
}

export function MapView({ pins = [], origins = [], routes = [], onPin, label }: {
  pins?: MapPin[]; origins?: MapOrigin[]; routes?: MapRoute[]; onPin?: (id: string | number) => void; label: string;
}) {
  const points = useMemo(() => [...pins.map((p) => p.pos), ...origins.map((o) => o.pos)], [pins, origins]);
  return (
    <div className="map-box" role="region" aria-label={label}>
      <MapContainer center={POLAND_CENTER} zoom={6} scrollWheelZoom={false} style={{ width: "100%", height: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {[...routes].sort((a, b) => Number(!!a.on) - Number(!!b.on)).map((r) => (
          <Polyline key={`${r.id}-${!!r.on}`} positions={arc(r.from, r.to)} pathOptions={{ className: r.on ? "route on" : "route", weight: r.on ? 6 : 3, dashArray: r.on ? undefined : "2 10", lineCap: "round" }} />
        ))}
        {origins.map((o) => (
          <Marker key={`o${o.id}`} position={o.pos} icon={originIcon(!!o.on)} keyboard={false}>
            <Tooltip direction="right" offset={[10, 0]} permanent={!!o.on} className="map-tip">{o.title}</Tooltip>
          </Marker>
        ))}
        {pins.map((p) => (
          <Marker key={`p${p.id}`} position={p.pos} icon={pinIcon(p.label, !!p.on)} title={p.title}
            eventHandlers={onPin ? { click: () => onPin(p.id) } : undefined} zIndexOffset={p.on ? 1000 : 0}>
            <Tooltip direction="top" offset={[0, -40]} permanent={!!p.on}>{p.title}</Tooltip>
          </Marker>
        ))}
        <Fit points={points} />
      </MapContainer>
    </div>
  );
}
