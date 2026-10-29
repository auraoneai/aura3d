/**
 * Touch controls for phones and tablets (audit row SO-1). The left part of the screen is a steer pad: touching it
 * pedals, and dragging sideways steers (full lock at `STEER_RANGE_PX` from where the finger landed). The right side
 * has hold buttons for Boost, Rise (jump) and Brake and a tap button for Gravity. Pause and sound live in the HUD
 * tools row (`ui.ts`), so they work for mouse players too.
 *
 * `createTouchInput` is the input state with no DOM, so it is unit tested; `mountTouchControls` wires it to
 * pointer events. The overlay shows on the first touch (or on coarse-pointer devices, or with `?touch=1`) and hides
 * again on a key press.
 */

export const STEER_RANGE_PX = 70;
export const TOUCH_BUTTON_PX = 56;

export type TouchHold = "boost" | "jump" | "brake";
export type TouchTap = "gravity";

export interface TouchSample {
  readonly active: boolean;
  readonly pedal: boolean;
  readonly steer: number;
  readonly boost: boolean;
  readonly jump: boolean;
  readonly brake: boolean;
  readonly gravity: boolean;
}

export interface TouchInput {
  steerDown(pointerId: number, x: number): void;
  steerMove(pointerId: number, x: number): void;
  steerUp(pointerId: number): void;
  press(action: TouchHold): void;
  release(action: TouchHold): void;
  tap(action: TouchTap): void;
  /** Current input; tap actions read true once, then clear. */
  sample(): TouchSample;
  reset(): void;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Steer value in -1..1 for a sideways drag of `dx` CSS px. */
export const steerFromDrag = (dx: number, range = STEER_RANGE_PX): number => clamp(dx / Math.max(1, range), -1, 1);

export function createTouchInput(): TouchInput {
  let steerPointer: number | null = null;
  let originX = 0;
  let steer = 0;
  const held = new Set<TouchHold>();
  let gravity = false;
  return {
    steerDown(pointerId, x) {
      if (steerPointer !== null) return;
      steerPointer = pointerId;
      originX = x;
      steer = 0;
    },
    steerMove(pointerId, x) {
      if (pointerId === steerPointer) steer = steerFromDrag(x - originX);
    },
    steerUp(pointerId) {
      if (pointerId !== steerPointer) return;
      steerPointer = null;
      steer = 0;
    },
    press(action) { held.add(action); },
    release(action) { held.delete(action); },
    tap(action) { if (action === "gravity") gravity = true; },
    sample() {
      const pedaling = steerPointer !== null;
      const out: TouchSample = {
        active: pedaling || held.size > 0 || gravity,
        // the steer pad pedals; Boost also pedals so a thumb on Boost alone keeps the bike going
        pedal: (pedaling || held.has("boost")) && !held.has("brake"),
        steer,
        boost: held.has("boost"),
        jump: held.has("jump"),
        brake: held.has("brake"),
        gravity
      };
      gravity = false;
      return out;
    },
    reset() {
      steerPointer = null;
      steer = 0;
      held.clear();
      gravity = false;
    }
  };
}

const CSS = /* css */ `
#touch-controls { position: fixed; inset: 0; z-index: 4; pointer-events: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
#touch-controls.hidden { display: none; }
#touch-steer { position: absolute; left: 0; bottom: 0; width: 58%; height: 62%; pointer-events: auto; touch-action: none; }
#touch-steer .hint { position: absolute; left: max(14px, env(safe-area-inset-left)); bottom: calc(max(12px, env(safe-area-inset-bottom)) + 96px); font: 500 12px/1.3 "Graphik Web", sans-serif; color: rgba(244, 234, 214, 0.62); pointer-events: none; }
#touch-steer .knob { position: absolute; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%; border: 2px solid rgba(243, 230, 203, 0.55); background: rgba(243, 230, 203, 0.12); pointer-events: none; display: none; }
#touch-steer.held .knob { display: block; }
#touch-buttons { position: absolute; right: max(12px, env(safe-area-inset-right)); bottom: calc(max(12px, env(safe-area-inset-bottom)) + 92px); display: grid; grid-template-columns: repeat(2, ${TOUCH_BUTTON_PX}px); gap: 10px; pointer-events: none; }
#touch-buttons button { width: ${TOUCH_BUTTON_PX}px; height: ${TOUCH_BUTTON_PX}px; padding: 0; border-radius: 50%; font: 500 12px/1 "Graphik Web", sans-serif; color: #f4ead6; background: rgba(11, 28, 34, 0.62); border: 1px solid rgba(160, 222, 214, 0.38); pointer-events: auto; touch-action: none; }
#touch-buttons button.down { background: rgba(243, 230, 203, 0.36); color: #14201f; }
#touch-buttons button[data-touch="boost"] { border-color: rgba(240, 165, 107, 0.7); }
/* keep the race notice clear of the buttons and the steer hint */
body.touch-on #notice { bottom: calc(max(12px, env(safe-area-inset-bottom)) + 236px); max-width: 86vw; }
`;

export interface MountedTouchControls {
  readonly el: HTMLElement;
  visible(): boolean;
  setVisible(on: boolean): void;
}

export interface MountTouchOptions {
  /** Show from the start (coarse pointer or `?touch=1`). */
  readonly visible: boolean;
  /** Called on every pointer down inside the overlay (unlock audio). */
  readonly onInteract?: () => void;
}

export function mountTouchControls(doc: Document, input: TouchInput, options: MountTouchOptions): MountedTouchControls {
  const style = doc.createElement("style");
  style.id = "touch-controls-style";
  style.textContent = CSS;
  doc.head.appendChild(style);

  const root = doc.createElement("div");
  root.id = "touch-controls";
  root.setAttribute("aria-label", "Touch controls");
  const pad = doc.createElement("div");
  pad.id = "touch-steer";
  pad.setAttribute("role", "application");
  pad.setAttribute("aria-label", "Steer pad: touch to ride, drag left or right to steer");
  const hint = doc.createElement("div");
  hint.className = "hint";
  hint.textContent = "Hold to ride · drag to steer";
  const knob = doc.createElement("div");
  knob.className = "knob";
  pad.append(hint, knob);

  pad.addEventListener("pointerdown", (e) => {
    options.onInteract?.();
    input.steerDown(e.pointerId, e.clientX);
    try { pad.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    const box = pad.getBoundingClientRect();
    knob.style.left = `${e.clientX - box.left}px`;
    knob.style.top = `${e.clientY - box.top}px`;
    pad.classList.add("held");
    e.preventDefault();
  });
  pad.addEventListener("pointermove", (e) => { input.steerMove(e.pointerId, e.clientX); e.preventDefault(); });
  const padUp = (e: PointerEvent) => { input.steerUp(e.pointerId); pad.classList.remove("held"); };
  pad.addEventListener("pointerup", padUp);
  pad.addEventListener("pointercancel", padUp);

  const buttons = doc.createElement("div");
  buttons.id = "touch-buttons";
  const make = (action: TouchHold | TouchTap, label: string): HTMLButtonElement => {
    const b = doc.createElement("button");
    b.type = "button";
    b.dataset.touch = action;
    b.textContent = label;
    b.setAttribute("aria-label", label);
    const down = (e: PointerEvent) => {
      options.onInteract?.();
      if (action === "gravity") input.tap("gravity"); else input.press(action);
      b.classList.add("down");
      try { b.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
      e.preventDefault();
    };
    const up = () => {
      if (action !== "gravity") input.release(action);
      b.classList.remove("down");
    };
    b.addEventListener("pointerdown", down);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("contextmenu", (e) => e.preventDefault());
    return b;
  };
  buttons.append(make("gravity", "Gravity"), make("jump", "Rise"), make("brake", "Brake"), make("boost", "Boost"));
  root.append(pad, buttons);
  doc.body.appendChild(root);

  let shown = options.visible;
  const apply = () => { root.classList.toggle("hidden", !shown); doc.body.classList.toggle("touch-on", shown); };
  apply();
  return {
    el: root,
    visible: () => shown,
    setVisible(on) {
      if (on === shown) return;
      shown = on;
      if (!on) input.reset();
      apply();
    }
  };
}
