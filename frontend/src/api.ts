export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export type DrivingStyle = "quiet" | "chatty" | "party";
export type RequestStatus = "pending" | "accepted" | "declined" | "cancelled" | "removed" | "called_off";

export interface User {
  id: number; email: string; display_name: string; music_genres: string[];
  driving_style: DrivingStyle; smoker: boolean; gender: string | null;
}
export interface UserPublic { id: number; display_name: string; music_genres: string[]; driving_style: DrivingStyle; smoker: boolean; }
export interface Event {
  id: number; name: string; city: string; venue: string | null; genre: string | null; event_date: string | null;
  latitude: number | null; longitude: number | null; url: string | null; image_url: string | null;
}
export interface EventSummary { id: number; name: string; city: string; venue: string | null; event_date: string | null; }
export interface Match { percent: number; label: string; music: number; style: number; smoking: number; shared_genres: string[]; }
export interface Ride {
  id: number; event: EventSummary; driver: UserPublic; origin_city: string; origin_lat: number | null; origin_lng: number | null;
  departure_time: string; seats_total: number; seats_left: number; price: number; smoking_allowed: boolean;
  note: string | null; cancelled: boolean; created_at: string; match: Match | null;
}
export interface JoinRequest {
  id: number; ride_id: number; passenger: UserPublic; status: RequestStatus; message: string | null; created_at: string; match: Match | null;
}
export interface MyRequest extends JoinRequest { ride: Ride; }
export type NotificationKind = "request" | "withdrew" | "accepted" | "declined" | "removed" | "called_off";
export interface AppNotification {
  id: number; kind: NotificationKind; read: boolean; created_at: string; ride_id: number; event_name: string; actor_name: string;
}
export interface NotificationList { unread: number; items: AppNotification[]; }
export interface SearchFilters {
  q?: string | null; event_city?: string | null; origin_city?: string | null; genre?: string | null;
  date_from?: string | null; date_to?: string | null; max_price?: number | null; min_seats?: number | null; no_smoking?: boolean;
}
export interface SearchResult { filters: SearchFilters; chips: string[]; source: "ai" | "rules"; understood: boolean; }
export interface Explanations { rides: Record<string, string>; requests: Record<string, string>; ai_available: boolean; }
export interface CityCount { city: string; events: number; }
export interface OfferDraft {
  event: Event | null; event_hint: string | null; event_options: Event[]; origin_city: string | null; departure: string | null;
  seats: number | null; price: number | null; smoking_allowed: boolean | null; note: string | null;
  source: "ai" | "rules"; understood: boolean;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

const DETAIL_KEYS: [RegExp, string][] = [
  [/full|no seats left/i, "err.full"],
  [/already requested/i, "err.duplicate"],
  [/accepted ride to this event/i, "err.alreadyGoing"],
  [/already left|in the future|on or before the event/i, "err.time"],
  [/own ride/i, "err.own"],
  [/already offer a ride/i, "err.twoRides"],
  [/called off/i, "err.calledOff"],
  [/request already/i, "err.decided"],
];
export function errorKey(err: unknown): string {
  if (err instanceof ApiError && typeof err.detail === "string") {
    for (const [re, key] of DETAIL_KEYS) if (re.test(err.detail)) return key;
  }
  if (err instanceof ApiError && err.status === 422) return "su.invalid";
  return err instanceof TypeError ? "common.offline" : "common.error";
}

const TOKEN_KEY = "festride-token";
export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null): void {
  try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void): void { onUnauthorized = fn; }

type Params = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

function qs(params?: Params): string {
  if (!params) return "";
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    if (Array.isArray(value)) value.forEach((item) => query.append(name, String(item)));
    else query.set(name, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

async function request<T>(method: string, path: string, opts: { params?: Params; body?: unknown; auth?: "required" | "optional" | "none" } = {}): Promise<T> {
  const { params, body, auth = "optional" } = opts;
  const token = auth === "none" ? null : getToken();
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}${qs(params)}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

  if (res.status === 401 && token) {
    if (getToken() === token) { setToken(null); onUnauthorized(); }
    if (auth === "optional") return request<T>(method, path, { ...opts, auth: "none" });
  }
  if (!res.ok) {
    let detail: unknown = null;
    try { detail = (await res.json()).detail; } catch { /* no body */ }
    throw new ApiError(res.status, detail);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  register: (data: { email: string; password: string; display_name: string; music_genres: string[]; driving_style: DrivingStyle; smoker: boolean; gender?: string | null }) =>
    request<{ access_token: string; user: User }>("POST", "/auth/register", { body: data, auth: "none" }),
  login: (email: string, password: string) =>
    request<{ access_token: string; user: User }>("POST", "/auth/login", { body: { email, password }, auth: "none" }),
  me: () => request<User>("GET", "/auth/me", { auth: "required" }),
  updateMe: (data: Partial<Pick<User, "display_name" | "music_genres" | "driving_style" | "smoker" | "gender">>) =>
    request<User>("PATCH", "/auth/me", { body: data, auth: "required" }),

  events: (params: Params) => request<Event[]>("GET", "/events", { params, auth: "none" }),
  event: (id: number) => request<Event>("GET", `/events/${id}`, { auth: "none" }),
  cities: () => request<CityCount[]>("GET", "/events/cities", { auth: "none" }),

  rides: (params: Params) => request<Ride[]>("GET", "/rides", { params }),
  ride: (id: number) => request<Ride>("GET", `/rides/${id}`),
  myRides: () => request<Ride[]>("GET", "/rides/mine", { auth: "required" }),
  createRide: (data: { event_id: number; origin_city: string; departure_time: string; seats_total: number; price: number; smoking_allowed: boolean; note?: string | null; origin_lat?: number | null; origin_lng?: number | null }) =>
    request<Ride>("POST", "/rides", { body: data, auth: "required" }),

  askSeat: (rideId: number, message: string) =>
    request<JoinRequest>("POST", `/rides/${rideId}/requests`, { body: { message: message || null }, auth: "required" }),
  rideRequests: (rideId: number) => request<JoinRequest[]>("GET", `/rides/${rideId}/requests`, { auth: "required" }),
  myRequests: () => request<MyRequest[]>("GET", "/requests/mine", { auth: "required" }),
  decide: (requestId: number, status: "accepted" | "declined") =>
    request<JoinRequest>("PATCH", `/requests/${requestId}`, { body: { status }, auth: "required" }),
  cancelRequest: (requestId: number) => request<JoinRequest>("POST", `/requests/${requestId}/cancel`, { auth: "required" }),
  notifications: () => request<NotificationList>("GET", "/notifications", { auth: "required" }),
  readNotifications: () => request<void>("POST", "/notifications/read", { auth: "required" }),
  cancelRide: (rideId: number) => request<void>("DELETE", `/rides/${rideId}`, { auth: "required" }),
  removePassenger: (requestId: number) => request<JoinRequest>("POST", `/requests/${requestId}/remove`, { auth: "required" }),

  search: (text: string) => request<SearchResult>("POST", "/ai/search", { body: { text }, auth: "none" }),
  explain: (data: { ride_ids?: number[]; request_ids?: number[]; lang: "pl" | "en" }) =>
    request<Explanations>("POST", "/ai/explain", { body: data, auth: "required" }),
  offerDraft: (text: string) => request<OfferDraft>("POST", "/ai/offer", { body: { text }, auth: "required" }),
  rideNote: (data: { event_id?: number | null; origin_city?: string | null; departure?: string | null; smoking_allowed: boolean; hint?: string | null; lang: "pl" | "en" }) =>
    request<{ text: string; source: "ai" | "template" }>("POST", "/ai/ride-note", { body: data, auth: "required" }),
};
