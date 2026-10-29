/**
 * Keyboard, mouse and touch input (audit C5, C6, C14).
 *
 * C5: Space, Enter and the arrow keys no longer reach a focused top-bar button (preventDefault here, and the bar
 * buttons blur after a click in hud.ts), so a shot can never re-click ELIM.
 * C6: phones get pointer-event controls with targets of 44 px or more: a steer pad, FIRE, BOOST, ROLL, ITEM, the
 * autopilot toggle and mute. They write the same input the keyboard does.
 * C14: keys, mouse buttons and touches are cleared on blur and when the page is hidden.
 */
import { DRONE_ORDER, type DroneId } from "./data";
import type { Action, SimInput } from "./sim";

export interface InputCallbacks {
  readonly stage: HTMLElement | null;
  readonly touchRoot: HTMLElement | null;
  onAction(action: Action): void;
  onStart(): void;
  /** Enter: start, or restart from the results panel. */
  onConfirm(): void;
  onRestart(): void;
  onToggleAutopilot(): void;
  onToggleMute(): void;
  onDrone(id: DroneId): void;
  /** First user gesture: unlock audio. */
  onGesture(): void;
}

export interface Inputs {
  /** Write the held controls into `out`. */
  read(out: SimInput): void;
  boostHeld(): boolean;
  /** Coarse pointer (phone or tablet): touch controls are shown. */
  readonly touch: boolean;
  clear(): void;
}

const GAME_KEYS = new Set(["Space", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const ACTION_KEYS: Readonly<Record<string, Action>> = { KeyQ: "shock", KeyR: "roll", KeyC: "mine", KeyE: "item", KeyF: "missile" };

/** Pointer capture keeps a held button pressed while the finger slides off it; synthetic pointers cannot be captured. */
function capture(el: HTMLElement, pointerId: number): void {
  try { el.setPointerCapture(pointerId); } catch { /* not an active pointer */ }
}

function inField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
}

export function createInputs(cb: InputCallbacks): Inputs {
  const keys = new Set<string>();
  let mouseFire = false;
  let mouseBoost = false;
  let touchSteer = 0;
  let touchPitch = 0;
  let touchFire = false;
  let touchBoost = false;
  // Same test as the CSS that shows the touch controls.
  const touch = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  let gestured = false;
  const gesture = (): void => { if (!gestured) { gestured = true; cb.onGesture(); } };

  const clear = (): void => {
    keys.clear();
    mouseFire = mouseBoost = touchFire = touchBoost = false;
    touchSteer = touchPitch = 0;
    cb.touchRoot?.querySelectorAll(".held").forEach((el) => el.classList.remove("held"));
  };

  window.addEventListener("keydown", (ev) => {
    if (inField(ev.target) || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (GAME_KEYS.has(ev.code)) ev.preventDefault();
    gesture();
    keys.add(ev.code);
    if (ev.repeat) return;
    if (ev.code === "Enter") cb.onConfirm();
    else if (ev.code === "Space") cb.onStart();
    const action = ACTION_KEYS[ev.code];
    if (action) { cb.onAction(action); return; }
    if (ev.code === "KeyN") { cb.onRestart(); return; }
    if (ev.code.startsWith("Digit")) {
      const id = DRONE_ORDER[Number(ev.code.slice(5)) - 1];
      if (id) cb.onDrone(id);
    }
  });
  window.addEventListener("keyup", (ev) => { keys.delete(ev.code); });
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "visible") clear(); });

  cb.stage?.addEventListener("mousedown", (ev) => {
    gesture();
    if (ev.button === 0) mouseFire = true;
    if (ev.button === 2) mouseBoost = true;
  });
  window.addEventListener("mouseup", (ev) => {
    if (ev.button === 0) mouseFire = false;
    if (ev.button === 2) mouseBoost = false;
  });
  cb.stage?.addEventListener("contextmenu", (ev) => ev.preventDefault());

  if (cb.touchRoot) buildTouch(cb.touchRoot);

  function buildTouch(root: HTMLElement): void {
    root.innerHTML = `
      <div class="touch-pad" data-touch="steer" role="group" aria-label="Steer: drag left or right, up or down"><span class="pad-l" aria-hidden="true">◀</span><span class="pad-knob" aria-hidden="true"></span><span class="pad-r" aria-hidden="true">▶</span></div>
      <div class="touch-cluster">
        <button type="button" class="touch-btn fire" data-touch="fire" aria-label="Fire cannons">FIRE</button>
        <button type="button" class="touch-btn" data-touch="boost" aria-label="Afterburner">BOOST</button>
        <button type="button" class="touch-btn" data-touch="roll" aria-label="Barrel roll">ROLL</button>
        <button type="button" class="touch-btn" data-touch="item" aria-label="Use item">ITEM</button>
      </div>
      <div class="touch-top">
        <button type="button" class="touch-small" data-touch="auto" aria-label="Toggle autopilot">AUTO</button>
        <button type="button" class="touch-small" data-touch="mute" aria-label="Mute sound">SOUND</button>
      </div>`;
    const pad = root.querySelector<HTMLElement>("[data-touch=steer]")!;
    const knob = root.querySelector<HTMLElement>(".pad-knob")!;
    let padPointer: number | null = null;
    const padMove = (ev: PointerEvent): void => {
      const r = pad.getBoundingClientRect();
      const nx = ((ev.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
      const ny = ((ev.clientY - r.top) / Math.max(1, r.height)) * 2 - 1;
      const dead = (v: number) => (Math.abs(v) < 0.12 ? 0 : Math.max(-1, Math.min(1, (v - Math.sign(v) * 0.12) / 0.7)));
      touchSteer = dead(nx);
      touchPitch = -dead(ny);
      knob.style.transform = `translate(${(touchSteer * 40).toFixed(0)}px, ${(-touchPitch * 22).toFixed(0)}px)`;
    };
    const padEnd = (ev: PointerEvent): void => {
      if (ev.pointerId !== padPointer) return;
      padPointer = null; touchSteer = 0; touchPitch = 0; knob.style.transform = ""; pad.classList.remove("held");
    };
    pad.addEventListener("pointerdown", (ev) => {
      ev.preventDefault(); gesture(); cb.onStart();
      padPointer = ev.pointerId;
      capture(pad, ev.pointerId);
      pad.classList.add("held");
      padMove(ev);
    });
    pad.addEventListener("pointermove", (ev) => { if (ev.pointerId === padPointer) padMove(ev); });
    pad.addEventListener("pointerup", padEnd);
    pad.addEventListener("pointercancel", padEnd);

    const hold = (name: string, set: (on: boolean) => void): void => {
      const el = root.querySelector<HTMLElement>(`[data-touch=${name}]`)!;
      const on = (ev: PointerEvent): void => { ev.preventDefault(); gesture(); cb.onStart(); capture(el, ev.pointerId); el.classList.add("held"); set(true); };
      const off = (): void => { el.classList.remove("held"); set(false); };
      el.addEventListener("pointerdown", on);
      el.addEventListener("pointerup", off);
      el.addEventListener("pointercancel", off);
      el.addEventListener("lostpointercapture", off);
    };
    hold("fire", (v) => { touchFire = v; });
    hold("boost", (v) => { touchBoost = v; });
    const tap = (name: string, fn: () => void): void => {
      const el = root.querySelector<HTMLElement>(`[data-touch=${name}]`)!;
      el.addEventListener("pointerdown", (ev) => { ev.preventDefault(); gesture(); fn(); el.classList.add("held"); });
      el.addEventListener("pointerup", () => el.classList.remove("held"));
      el.addEventListener("pointercancel", () => el.classList.remove("held"));
    };
    tap("roll", () => { cb.onStart(); cb.onAction("roll"); });
    tap("item", () => { cb.onStart(); cb.onAction("item"); });
    tap("auto", () => cb.onToggleAutopilot());
    tap("mute", () => cb.onToggleMute());
  }

  return {
    touch,
    clear,
    boostHeld: () => keys.has("ShiftLeft") || keys.has("ShiftRight") || mouseBoost || touchBoost,
    read(out) {
      const right = keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0;
      const left = keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0;
      const up = keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0;
      const down = keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0;
      out.steer = Math.max(-1, Math.min(1, right - left + touchSteer));
      out.pitch = Math.max(-1, Math.min(1, up - down + touchPitch));
      out.boost = keys.has("ShiftLeft") || keys.has("ShiftRight") || mouseBoost || touchBoost;
      out.fire = keys.has("Space") || mouseFire || touchFire;
    }
  };
}
