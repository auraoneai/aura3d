/**
 * M-INPUT swipe: TypeScript transcription of apps/showcase-top-tennis/public/toptennis/mobile-swipe.js.
 * Touch gestures describe shots; the match engine owns movement and contact. Pure (storage is injected).
 */
import { SWIPE_STORAGE_KEY, type ControlStyle, type RawSwipeGesture, type SwipeShot } from "../contract/input";
import type { StorageLike } from "./bindings";

const VERSION = 1;
const validStyle = (style: unknown): style is ControlStyle => style === "classic" || style === "swipe";
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function classifyGesture(gesture: RawSwipeGesture | null | undefined): SwipeShot | null {
  if (!gesture) return null;
  const { startX, startY, endX, endY, startTime, endTime, width, height } = gesture;
  if (![startX, startY, endX, endY, startTime, endTime, width, height].every(finite) || width <= 0 || height <= 0 || endTime <= startTime) return null;
  const scale = Math.min(width, height), dx = endX - startX, forward = startY - endY;
  const distance = Math.hypot(dx, forward) / scale;
  // A tap, downward drag or mostly sideways movement cannot fire a shot.
  if (distance < 0.055 || forward / scale < 0.035 || forward / Math.hypot(dx, forward) < 0.3) return null;
  const angle = Math.atan2(dx, forward);
  const duration = Math.max(30, endTime - startTime) / 1000;
  return {
    targetX: clamp(angle / (Math.PI / 3), -1, 1) * 0.8,
    targetDepth: 0.23 + clamp((forward / scale - 0.055) / 0.495, 0, 1) * 0.69,
    directionX: dx / Math.hypot(dx, forward), directionY: forward / Math.hypot(dx, forward),
    strength: clamp((distance / duration - 0.35) / 2.15, 0, 1),
  };
}

export interface ScreenPoint { x: number; y: number }
export interface DirectionalTargetOptions { origin?: ScreenPoint; left?: ScreenPoint; right?: ScreenPoint; minX?: number; maxX?: number }

/**
 * Intersect the swipe's screen-space ray with the projected landing-depth line. This keeps an upward swipe in the
 * player's lane even near a sideline.
 */
export function directionalTarget(shot: SwipeShot | null | undefined, options: DirectionalTargetOptions = {}): number | null {
  const { origin, left, right, minX = -0.8, maxX = 0.8 } = options;
  if (!shot || !origin || !left || !right || !finite(shot.directionX) || !finite(shot.directionY) || shot.directionY <= 0) return null;
  if (![origin.x, origin.y, left.x, left.y, right.x, right.y, minX, maxX].every(finite) || maxX <= minX) return null;
  const slope = shot.directionX / shot.directionY;
  const denominator = right.x - left.x + slope * (right.y - left.y);
  if (Math.abs(denominator) < 1e-8) return null;
  const fraction = clamp((origin.x + slope * (origin.y - left.y) - left.x) / denominator, 0, 1);
  return minX + (maxX - minX) * fraction;
}

export interface GesturePointInput { pointerId?: number; x?: number; y?: number; time?: number; width?: number; height?: number }
export interface GestureSnapshot { active: boolean; pointerId: number | null; points: ScreenPoint[]; startX?: number; startY?: number; x?: number; y?: number; startTime?: number; time?: number; width?: number; height?: number }
export interface SwipeGesture {
  begin(point?: GesturePointInput): boolean;
  move(point?: GesturePointInput): boolean;
  end(point?: GesturePointInput): SwipeShot | null;
  cancel(pointerId?: number): boolean;
  snapshot(): GestureSnapshot;
}

interface CurrentGesture {
  pointerId: number; startX: number; startY: number; x: number; y: number; startTime: number; time: number; width: number; height: number; points: ScreenPoint[];
}

export function createGesture(): SwipeGesture {
  let current: CurrentGesture | null = null;
  function begin({ pointerId, x, y, time, width, height }: GesturePointInput = {}): boolean {
    if (current || !Number.isInteger(pointerId) || ![x, y, time, width, height].every(finite) || (width as number) <= 0 || (height as number) <= 0) return false;
    current = { pointerId: pointerId as number, startX: x as number, startY: y as number, x: x as number, y: y as number, startTime: time as number, time: time as number, width: width as number, height: height as number, points: [{ x: x as number, y: y as number }] };
    return true;
  }
  function move({ pointerId, x, y, time }: GesturePointInput = {}): boolean {
    if (!current || pointerId !== current.pointerId || ![x, y, time].every(finite) || (time as number) < current.time) return false;
    current.x = x as number; current.y = y as number; current.time = time as number;
    current.points.push({ x: x as number, y: y as number });
    if (current.points.length > 24) current.points.splice(1, 1);
    return true;
  }
  function end(point: GesturePointInput = {}): SwipeShot | null {
    if (!current || point.pointerId !== current.pointerId) return null;
    const valid = move(point), done = current; current = null;
    return valid ? classifyGesture({ ...done, endX: done.x, endY: done.y, endTime: done.time }) : null;
  }
  function cancel(pointerId?: number): boolean {
    if (!current || (pointerId !== undefined && pointerId !== current.pointerId)) return false;
    current = null; return true;
  }
  function snapshot(): GestureSnapshot {
    return current ? { active: true, ...current, points: current.points.map((point) => ({ ...point })) } : { active: false, pointerId: null, points: [] };
  }
  return Object.freeze({ begin, move, end, cancel, snapshot });
}

export type StyleListener = (event: { style: ControlStyle; saved: boolean }) => void;
export interface SwipePreferences {
  getPreference(): ControlStyle;
  setPreference(style: unknown): { ok: boolean; saved: boolean };
  classifyGesture: typeof classifyGesture;
  directionalTarget: typeof directionalTarget;
  createGesture: typeof createGesture;
  subscribe(listener: StyleListener): () => void;
}

export function createSwipePreferences({ storage }: { storage?: StorageLike | null } = {}): SwipePreferences {
  let preference: ControlStyle = "classic";
  const listeners = new Set<StyleListener>();
  try {
    const stored = JSON.parse(storage?.getItem(SWIPE_STORAGE_KEY) || "null") as { version?: number; style?: unknown } | null;
    if (stored?.version === VERSION && validStyle(stored.style)) preference = stored.style;
  } catch { /* corrupt or unavailable storage keeps the classic default */ }
  function setPreference(style: unknown): { ok: boolean; saved: boolean } {
    if (!validStyle(style)) return { ok: false, saved: false };
    preference = style;
    let saved = false;
    try {
      if (typeof storage?.setItem === "function") {
        storage.setItem(SWIPE_STORAGE_KEY, JSON.stringify({ version: VERSION, style }));
        saved = true;
      }
    } catch { /* the preference still applies for this session */ }
    for (const listener of listeners) { try { listener({ style, saved }); } catch { /* ignored */ } }
    return { ok: true, saved };
  }
  return Object.freeze({
    getPreference: () => preference, setPreference, classifyGesture, directionalTarget, createGesture,
    subscribe(listener: StyleListener) { if (typeof listener !== "function") return () => undefined; listeners.add(listener); return () => { listeners.delete(listener); }; },
  });
}
