/**
 * Saved player state for the port: personal-best times per mode, difficulty and vehicle, the best time-trial ghost,
 * and the mute preference. Everything goes through a `StorageLike` so tests run without a browser, and every read
 * tolerates a missing, full or blocked `localStorage`.
 */
import type { Mode, Route, Vehicle } from "./course";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREFIX = "craterline-gp:";
export const MUTE_KEY = `${PREFIX}muted`;

/** `window.localStorage` when it can be used, otherwise null (private mode, sandboxed iframe, tests). */
export function browserStorage(): StorageLike | null {
  try {
    const store = typeof localStorage !== "undefined" ? localStorage : null;
    if (!store) return null;
    store.setItem(`${PREFIX}probe`, "1");
    return store;
  } catch {
    return null;
  }
}

function read(store: StorageLike | null, key: string): string | null {
  try { return store?.getItem(key) ?? null; } catch { return null; }
}
function write(store: StorageLike | null, key: string, value: string): void {
  try { store?.setItem(key, value); } catch { /* quota or blocked: the preference only lasts this page */ }
}

export const readMuted = (store: StorageLike | null): boolean => read(store, MUTE_KEY) === "1";
export const writeMuted = (store: StorageLike | null, muted: boolean): void => write(store, MUTE_KEY, muted ? "1" : "0");

export const bestKey = (mode: Mode, difficulty: string, vehicle: Vehicle): string => `${PREFIX}best:${mode}:${difficulty}:${vehicle}`;

/** One ghost sample, as `RaceState.recording` stores it: [time, s, lane, height, flight-or-loop, route index]. */
export type GhostSample = readonly number[];

export interface PersonalBest {
  readonly time: number;
  readonly ghost?: readonly GhostSample[];
}

export function readBest(store: StorageLike | null, key: string): PersonalBest | null {
  const raw = read(store, key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { time?: unknown; ghost?: unknown };
    if (typeof parsed.time !== "number" || !Number.isFinite(parsed.time) || parsed.time <= 0) return null;
    const ghost = Array.isArray(parsed.ghost) && parsed.ghost.every((row) => Array.isArray(row) && row.length >= 6) ? parsed.ghost as GhostSample[] : undefined;
    return ghost ? { time: parsed.time, ghost } : { time: parsed.time };
  } catch {
    return null;
  }
}

/** Store `time` if it beats the saved best; returns the best after the call and whether this run set it. */
export function recordBest(store: StorageLike | null, key: string, time: number, ghost?: readonly GhostSample[]): { best: number; isNew: boolean } {
  const previous = readBest(store, key);
  if (previous && previous.time <= time) return { best: previous.time, isNew: false };
  write(store, key, JSON.stringify(ghost && ghost.length ? { time, ghost } : { time }));
  return { best: time, isNew: true };
}

const ROUTES: readonly Route[] = ["main", "upper", "lower", "islands", "bypass"];

export interface GhostPose { readonly s: number; readonly lane: number; readonly height: number; readonly route: Route; readonly flying: boolean }

/** The ghost's pose at race time `t`, interpolated between the two samples around it; null outside the recording. */
export function ghostAt(ghost: readonly GhostSample[], t: number): GhostPose | null {
  if (ghost.length === 0 || t < ghost[0]![0]! || t > ghost[ghost.length - 1]![0]!) return null;
  let lo = 0, hi = ghost.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ghost[mid]![0]! <= t) lo = mid; else hi = mid;
  }
  const a = ghost[lo]!, b = ghost[hi]!;
  const span = b[0]! - a[0]!;
  const k = span > 0 && a[5] === b[5] ? (t - a[0]!) / span : 0;
  const mix = (i: number) => a[i]! + (b[i]! - a[i]!) * k;
  return { s: mix(1), lane: mix(2), height: mix(3), route: ROUTES[a[5]!] ?? "main", flying: a[4] === 1 };
}
