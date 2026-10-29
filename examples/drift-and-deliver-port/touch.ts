/**
 * Gridlock Courier: touch controls. A steering pad on the left (drag left or right) and GAS, BRAKE, DRIFT and NITRO
 * buttons on the right write into the same `keys` object the keyboard drives, so the sim sees one input. PAUSE and
 * SOUND buttons sit at the top. Pointer events throughout, so several fingers work at once; every control is at
 * least 48 CSS px.
 */
import type { Keys } from "./sim";

/** Drag distance (CSS px) from where the finger landed before the pad steers. */
export const STEER_DEAD_PX = 14;

/** Keys held for a horizontal drag of `dx` CSS px on the steering pad. */
export function steerKeys(dx: number, dead = STEER_DEAD_PX): { a: boolean; d: boolean } {
  return { a: dx < -dead, d: dx > dead };
}

export interface TouchActions {
  pause(): void;
  mute(): void;
}

export interface TouchControls {
  /** Show the controls (first touch, or a coarse pointer at load). */
  enable(): void;
  readonly enabled: boolean;
  /** Release every held key (pause, results, blur). */
  release(): void;
}

const BUTTONS: readonly (readonly [string, keyof Keys])[] = [
  ["t-gas", "w"],
  ["t-brake", "s"],
  ["t-drift", "space"],
  ["t-nitro", "shift"]
];

export function mountTouchControls(doc: Document, keys: Keys, actions: TouchActions): TouchControls {
  const root = doc.getElementById("touch");
  let enabled = false;
  const held = new Set<keyof Keys>();
  const press = (k: keyof Keys, down: boolean): void => {
    keys[k] = down;
    if (down) held.add(k);
    else held.delete(k);
  };
  const capture = (el: Element, e: PointerEvent): void => {
    try { el.setPointerCapture(e.pointerId); } catch { /* not capturable (synthetic event) */ }
  };

  for (const [id, key] of BUTTONS) {
    const el = doc.getElementById(id);
    if (!el) continue;
    const down = (e: PointerEvent): void => { e.preventDefault(); capture(el, e); press(key, true); el.classList.add("on"); };
    const up = (e: PointerEvent): void => { e.preventDefault(); press(key, false); el.classList.remove("on"); };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
  }

  const pad = doc.getElementById("t-steer");
  const knob = doc.getElementById("t-knob");
  if (pad) {
    let origin: number | null = null;
    let pointer = -1;
    const move = (e: PointerEvent): void => {
      if (origin === null || e.pointerId !== pointer) return;
      e.preventDefault();
      const dx = e.clientX - origin;
      const s = steerKeys(dx);
      press("a", s.a);
      press("d", s.d);
      if (knob) knob.style.transform = `translateX(${Math.max(-44, Math.min(44, dx))}px)`;
    };
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== pointer) return;
      origin = null;
      pointer = -1;
      press("a", false);
      press("d", false);
      if (knob) knob.style.transform = "";
    };
    pad.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      capture(pad, e);
      origin = e.clientX;
      pointer = e.pointerId;
    });
    pad.addEventListener("pointermove", move);
    pad.addEventListener("pointerup", end);
    pad.addEventListener("pointercancel", end);
    pad.addEventListener("lostpointercapture", end);
  }

  const tap = (id: string, fn: () => void): void => {
    doc.getElementById(id)?.addEventListener("pointerup", (e) => { e.preventDefault(); fn(); });
  };
  tap("t-pause", actions.pause);
  tap("t-mute", actions.mute);

  const controls: TouchControls = {
    get enabled() { return enabled; },
    enable() {
      if (enabled) return;
      enabled = true;
      doc.body.classList.add("touch");
      root?.removeAttribute("hidden");
    },
    release() {
      for (const k of [...held]) press(k, false);
      if (knob) knob.style.transform = "";
      for (const [id] of BUTTONS) doc.getElementById(id)?.classList.remove("on");
    }
  };
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  if (coarse) controls.enable();
  addEventListener("touchstart", () => controls.enable(), { passive: true, once: true });
  return controls;
}
