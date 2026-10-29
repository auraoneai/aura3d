// Touch router (PRD 04 B04, PRD 03 section 6): turns child taps into the
// story's semantic target ids.
//
// - Only targets of the current beat count. A tap on anything else, a tap
//   when no beat is waiting, or a tap on a target from an earlier beat (stale)
//   does nothing. A random screen touch never advances the story.
// - Rapid repeats (double taps, palms, two fingers) are debounced, and a tap
//   and a parent confirm share the same debounce: both are the same turn.
// - Taps act on pointerdown: no drag, hold or precision is needed, and the
//   hit test is generous (nearby points are tried when the exact point misses).
//
// createTouchRouter is pure: the caller passes the time in. bindCanvasTaps is
// the thin DOM binding; it reads time only through the `now` it is given.

import { MAX_TARGETS } from "./beat-runner.js";

/** Taps closer together than this are one tap. */
export const DEFAULT_DEBOUNCE_MS = 400;

export interface TouchRouterOptions {
  readonly debounceMs?: number;
}

export interface TouchRouter {
  /** The current beat's targets (at most two are kept); null when nothing is waiting. */
  setTargets(ids: readonly string[] | null): void;
  /**
   * A tap that hit `target` (null for a miss) at `nowMs`. Returns the target
   * id to send as a TAP, or null when inactive, not a current target (missed
   * or stale) or debounced.
   */
  route(target: string | null, nowMs: number): string | null;
  /**
   * A parent confirm at `nowMs`. True when a turn is waiting and the press is
   * not a repeat of a tap or confirm just accepted.
   */
  confirm(nowMs: number): boolean;
  /** The active target ids, or null when inactive. */
  active(): readonly string[] | null;
  /** Clear targets and debounce memory (route change, story end, dispose). */
  reset(): void;
}

function debounceOf(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : DEFAULT_DEBOUNCE_MS;
}

/**
 * True when a press at `nowMs` repeats the one accepted at `lastMs`: within
 * `debounceMs` either way, so events delivered slightly out of order are
 * still one press. A time far before `lastMs` means the caller's clock
 * restarted (a new story clock, a reset time source); that is a fresh press,
 * never a reason to ignore taps until the old time comes round again.
 */
function repeats(nowMs: number, lastMs: number | null, debounceMs: number): boolean {
  return lastMs !== null && Math.abs(nowMs - lastMs) < debounceMs;
}

function cleanTargets(ids: readonly string[]): readonly string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (id.length === 0 || out.includes(id)) continue;
    out.push(id);
    if (out.length >= MAX_TARGETS) break;
  }
  return out;
}

export function createTouchRouter(options: TouchRouterOptions = {}): TouchRouter {
  const debounceMs = debounceOf(options.debounceMs);
  let targets: readonly string[] | null = null;
  let lastAcceptedAt: number | null = null;

  /** Not a real time, or a repeat of the press just accepted. */
  function blocked(nowMs: number): boolean {
    return !Number.isFinite(nowMs) || repeats(nowMs, lastAcceptedAt, debounceMs);
  }

  return {
    setTargets(ids) {
      targets = ids === null ? null : cleanTargets(ids);
    },
    route(target, nowMs) {
      if (targets === null || target === null || !targets.includes(target)) return null;
      if (blocked(nowMs)) return null;
      lastAcceptedAt = nowMs;
      return target;
    },
    confirm(nowMs) {
      if (targets === null || blocked(nowMs)) return false;
      lastAcceptedAt = nowMs;
      return true;
    },
    active() {
      return targets;
    },
    reset() {
      targets = null;
      lastAcceptedAt = null;
    }
  };
}

/** The pointer fields the canvas binding reads (a DOM PointerEvent has them all). */
export interface TapPointerEvent {
  readonly clientX: number;
  readonly clientY: number;
  readonly button: number;
  preventDefault(): void;
}

export type TapListener = (event: TapPointerEvent) => void;

/** What the binding needs from the canvas; any HTMLElement provides it. */
export interface TapSurface {
  addEventListener(type: "pointerdown", listener: TapListener): void;
  removeEventListener(type: "pointerdown", listener: TapListener): void;
  getBoundingClientRect(): { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
}

/** Hit test in CSS pixels relative to the canvas; returns an active target id or null. */
export type TapPick = (x: number, y: number) => string | null;

export interface CanvasTapOptions {
  readonly debounceMs?: number;
  /** Rings (CSS px) tried around the touch point when it misses, innermost first. */
  readonly radiiPx?: readonly number[];
}

/** Forgiving hit test: the touch point, then rings 18 and 36 CSS px around it. */
export const GENEROUS_RADII_PX: readonly number[] = [0, 18, 36];

const D = Math.SQRT1_2;
/** Directions sampled on each ring: the four sides first, then the diagonals. */
const RING: readonly (readonly [number, number])[] = [
  [1, 0], [0, 1], [-1, 0], [0, -1],
  [D, D], [-D, D], [-D, -D], [D, -D]
];

/**
 * The target nearest the touch point: the exact point first, then each ring
 * in order (points outside the canvas are skipped). Deterministic.
 */
export function generousPick(
  pick: TapPick,
  x: number,
  y: number,
  width: number,
  height: number,
  radiiPx: readonly number[] = GENEROUS_RADII_PX
): string | null {
  for (const radius of radiiPx) {
    if (!Number.isFinite(radius) || radius < 0) continue;
    if (radius === 0) {
      const hit = pick(x, y);
      if (hit !== null) return hit;
      continue;
    }
    for (const [dx, dy] of RING) {
      const px = x + dx * radius;
      const py = y + dy * radius;
      if (px < 0 || py < 0 || px > width || py > height) continue;
      const hit = pick(px, py);
      if (hit !== null) return hit;
    }
  }
  return null;
}

/**
 * Binds child taps on the canvas: each pointerdown is hit-tested generously
 * through `pick` (canvas-relative CSS px) and a hit calls `onTarget(id)`,
 * unless it repeats a delivered tap within the debounce. Only the primary
 * button counts (touch contact, pen tip, left mouse button). Returns an
 * unbind function; calling it more than once is safe.
 */
export function bindCanvasTaps(
  canvas: TapSurface,
  pick: TapPick,
  onTarget: (id: string) => void,
  now: () => number,
  options: CanvasTapOptions = {}
): () => void {
  const debounceMs = debounceOf(options.debounceMs);
  const radii = options.radiiPx ?? GENEROUS_RADII_PX;
  let lastDeliveredAt: number | null = null;
  let bound = true;

  const listener: TapListener = (event) => {
    if (!bound || event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const hit = generousPick(pick, event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height, radii);
    if (hit === null) return;
    // The touch landed on a target: keep the browser from also using it for its own default action.
    event.preventDefault();
    const at = now();
    if (!Number.isFinite(at) || repeats(at, lastDeliveredAt, debounceMs)) return;
    lastDeliveredAt = at;
    onTarget(hit);
  };

  canvas.addEventListener("pointerdown", listener);
  return () => {
    if (!bound) return;
    bound = false;
    canvas.removeEventListener("pointerdown", listener);
  };
}
