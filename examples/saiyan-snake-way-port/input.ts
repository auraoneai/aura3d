/**
 * Serpentine Sky Run input state, kept free of the DOM so unit tests drive it directly. `main.ts` forwards keyboard,
 * pointer, blur and visibility events here and reads one `RunInput` per simulation step with `take()`.
 *
 * - Taps: a key press adds its code once (auto-repeat while held does not), a short touch swipe adds one lane, jump or
 *   slide tap.
 * - Held: keys held down, plus the flight steering a held touch makes while the runner flies (C6): the left or right
 *   half of the screen holds A or D, and a vertical drag of more than `DRAG_PX` holds W (up) or S (down) until the
 *   pointer lifts.
 * - `clear()` drops every tap and held key (window blur, tab hidden), so a key released while the page had no focus
 *   cannot stay held (C10).
 */
import type { RunInput } from "./sim";

/** Swipe length (CSS px) that counts as a lane change or slide instead of a jump tap. */
export const SWIPE_PX = 28;
/** Vertical drag (CSS px) during flight that holds climb or dive. */
export const DRAG_PX = 24;

export type SwipeTap = "KeyA" | "KeyD" | "KeyS" | "Space";

/** Classifies a finished touch gesture: horizontal swipes change lane, a downward swipe slides, anything else jumps. */
export function classifySwipe(dx: number, dy: number): SwipeTap {
  if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "KeyA" : "KeyD";
  if (dy > SWIPE_PX) return "KeyS";
  return "Space";
}

interface Pointer {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** True once the gesture became flight steering; it then produces no tap on release. */
  steering: boolean;
  /** Keys this pointer holds for flight steering. */
  readonly keys: Set<string>;
}

export interface RunInputState {
  /** Key pressed. Returns false when the press was dropped because `blocked()` is true. */
  keyDown(code: string): boolean;
  keyUp(code: string): void;
  /** Touch or pen down at client (x, y) on a surface `width` CSS px wide. */
  pointerDown(id: number, x: number, y: number, width: number): void;
  pointerMove(id: number, x: number, y: number, width: number): void;
  /** Returns the tap the gesture produced, or null (steering gestures and unknown pointers produce none). */
  pointerUp(id: number, x: number, y: number): SwipeTap | null;
  pointerCancel(id: number): void;
  /** Adds a tap directly (the on-screen Surge, Fly and Slide buttons). */
  tap(code: string): void;
  /** Drops every tap, held key and active pointer. */
  clear(): void;
  /** The input for one simulation step; taps are consumed, held keys stay. */
  take(): RunInput;
  readonly held: ReadonlySet<string>;
  readonly taps: ReadonlySet<string>;
}

export interface RunInputOptions {
  /** True while the runner flies: held touches steer instead of swiping. */
  readonly flying: () => boolean;
  /** True while game keys must be ignored (the pre-run countdown). */
  readonly blocked?: () => boolean;
}

export function createRunInput(options: RunInputOptions): RunInputState {
  const taps = new Set<string>();
  const keys = new Set<string>();
  const pointers = new Map<number, Pointer>();
  const blocked = options.blocked ?? (() => false);

  const held = (): Set<string> => {
    const out = new Set(keys);
    for (const p of pointers.values()) for (const k of p.keys) out.add(k);
    return out;
  };

  const steer = (p: Pointer, x: number, y: number, width: number): void => {
    p.steering = true;
    p.keys.clear();
    p.keys.add(x < width / 2 ? "KeyA" : "KeyD");
    const dy = y - p.y;
    if (dy < -DRAG_PX) p.keys.add("KeyW");
    else if (dy > DRAG_PX) p.keys.add("KeyS");
  };

  return {
    keyDown(code) {
      if (blocked()) return false;
      if (!keys.has(code)) taps.add(code);
      keys.add(code);
      return true;
    },
    keyUp(code) { keys.delete(code); },
    pointerDown(id, x, y, width) {
      const p: Pointer = { id, x, y, steering: false, keys: new Set() };
      pointers.set(id, p);
      if (options.flying() && !blocked()) steer(p, x, y, width);
    },
    pointerMove(id, x, y, width) {
      const p = pointers.get(id);
      if (!p) return;
      if (options.flying() && !blocked()) steer(p, x, y, width);
      else if (p.steering) p.keys.clear();
    },
    pointerUp(id, x, y) {
      const p = pointers.get(id);
      pointers.delete(id);
      if (!p || p.steering || blocked()) return null;
      const t = classifySwipe(x - p.x, y - p.y);
      taps.add(t);
      return t;
    },
    pointerCancel(id) { pointers.delete(id); },
    tap(code) { if (!blocked()) taps.add(code); },
    clear() { taps.clear(); keys.clear(); pointers.clear(); },
    take() {
      const input: RunInput = { taps: [...taps], held: [...held()] };
      taps.clear();
      return input;
    },
    get held() { return held(); },
    get taps() { return taps; }
  };
}
