import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { POLAND_BORDER } from "../poland";

export interface MapPin {
  id: string | number;
  pos: [number, number];
  label: string;
  title: string;
  on?: boolean;
}
export interface MapOrigin {
  id: string | number;
  pos: [number, number];
  title: string;
  on?: boolean;
}
export interface MapRoute {
  id: string | number;
  from: [number, number];
  to: [number, number];
  on?: boolean;
}

const POLAND_CENTER: [number, number] = [52.0, 19.2];
const POLAND_BOUNDS = L.latLngBounds([48.7, 13.9], [55.1, 24.4]);
const WORLD: [number, number][] = [
  [-89, -179],
  [-89, 179],
  [89, 179],
  [89, -179],
];

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function pinIcon(label: string, on: boolean) {
  const size = on ? 44 : 36;
  return L.divIcon({
    className: "",
    html: `<div class="pin${on ? " on" : ""}" style="width:${size}px;height:${size}px"><span>${escapeHtml(label)}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}
const originIcon = (on: boolean) =>
  L.divIcon({
    className: "",
    html: `<div class="origin-dot${on ? " on" : ""}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((point) => point.join(",")).join("|");
  useEffect(() => {
    if (points.length === 0) map.setView(POLAND_CENTER, 6);
    else if (points.length === 1) map.setView(points[0], 9);
    else
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 10 });
  }, [key, map]);
  return null;
}

function Focus({ points }: { points?: [number, number][] }) {
  const map = useMap();
  const key = points?.map((point) => point.join(",")).join("|") ?? "";
  useEffect(() => {
    if (points && points.length > 1)
      map.flyToBounds(L.latLngBounds(points), {
        padding: [36, 36],
        maxZoom: 8,
        duration: 0.6,
      });
  }, [key, map]);
  return null;
}

function arc(a: [number, number], b: [number, number]): [number, number][] {
  const [lat1, lng1] = a,
    [lat2, lng2] = b;
  const bend: [number, number] = [
    (lat1 + lat2) / 2 + (lng2 - lng1) * 0.12,
    (lng1 + lng2) / 2 - (lat2 - lat1) * 0.12,
  ];
  const curve: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    curve.push([
      (1 - t) ** 2 * lat1 + 2 * (1 - t) * t * bend[0] + t ** 2 * lat2,
      (1 - t) ** 2 * lng1 + 2 * (1 - t) * t * bend[1] + t ** 2 * lng2,
    ]);
  }
  return curve;
}

export function MapView({
  pins = [],
  origins = [],
  routes = [],
  onPin,
  label,
  focus,
}: {
  pins?: MapPin[];
  origins?: MapOrigin[];
  routes?: MapRoute[];
  onPin?: (id: string | number) => void;
  label: string;
  focus?: [number, number][];
}) {
  const points = useMemo(
    () => [
      ...pins.map((pin) => pin.pos),
      ...origins.map((origin) => origin.pos),
    ],
    [pins, origins],
  );
  return (
    <div className="map-box" role="region" aria-label={label}>
      <MapContainer
        center={POLAND_CENTER}
        zoom={6}
        minZoom={6}
        maxBounds={POLAND_BOUNDS}
        maxBoundsViscosity={1}
        scrollWheelZoom={false}
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polygon
          positions={[WORLD, POLAND_BORDER]}
          interactive={false}
          pathOptions={{ className: "outside-pl", weight: 1.5 }}
        />
        {[...routes]
          .sort((a, b) => Number(!!a.on) - Number(!!b.on))
          .map((route) => (
            <Polyline
              key={`${route.id}-${!!route.on}`}
              positions={arc(route.from, route.to)}
              pathOptions={{
                className: route.on ? "route on" : "route",
                weight: route.on ? 6 : 3,
                dashArray: route.on ? undefined : "2 10",
                lineCap: "round",
              }}
            />
          ))}
        {/* keyed by `on` as well: Leaflet ignores later changes to a tooltip's `permanent`, so the label would stick to the first selection */}
        {origins.map((origin) => (
          <Marker
            key={`o${origin.id}-${!!origin.on}`}
            position={origin.pos}
            icon={originIcon(!!origin.on)}
            keyboard={false}
          >
            <Tooltip
              direction="right"
              offset={[10, 0]}
              permanent={!!origin.on}
              className="map-tip"
            >
              {origin.title}
            </Tooltip>
          </Marker>
        ))}
        {pins.map((pin) => (
          <Marker
            key={`p${pin.id}-${!!pin.on}`}
            position={pin.pos}
            icon={pinIcon(pin.label, !!pin.on)}
            title={pin.title}
            eventHandlers={onPin ? { click: () => onPin(pin.id) } : undefined}
            zIndexOffset={pin.on ? 1000 : 0}
          >
            <Tooltip direction="top" offset={[0, -40]} permanent={!!pin.on}>
              {pin.title}
            </Tooltip>
          </Marker>
        ))}
        <Fit points={points} />
        <Focus points={focus} />
      </MapContainer>
    </div>
  );
}
