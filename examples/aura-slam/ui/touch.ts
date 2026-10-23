import { byId, maybeById } from "./dom";

/** Capture can throw for pointers the browser does not know (synthetic events); input still works without it. */
function capture(el: Element, pointerId: number): void {
  try { el.setPointerCapture?.(pointerId); } catch { /* not an active pointer */ }
}

const TOUCH_DEAD_ZONE = 10;
const TOUCH_RADIUS = 48;
const TOUCH_TAP_MS = 280;

export interface TouchStickState {
  pointerId: number | null; originX: number; originY: number; x: number; y: number;
  dragged: boolean; usedSecondFinger: boolean; startedAt: number; target: HTMLElement | null; radius: number;
}

export interface TouchDeps {
  canvas: HTMLCanvasElement;
  touchPlayEnabled(): boolean;
  swipeActive(): boolean;
  inputOverlayOpen(): boolean;
  matchMode(): string;
  requestSwing(event: Event | undefined, forcePower?: boolean): void;
  requestLobSwing(event: Event): void;
  intentionalLobEnabled(): boolean;
  modernServe(): boolean;
  initAudio(): void;
}

export interface TouchControls {
  readonly stick: TouchStickState;
  clearStick(): void;
  clearHit(): void;
  clearLob(): void;
  clearAll(): void;
  /** Show or hide the on-screen buttons for the current phase (the touch part of game.js `render()`). */
  render(view: { phase: string; server: string; touchEnabled: boolean; coarse: boolean }): void;
}

/** Virtual joystick, HIT, LOB and POWER HIT buttons, and the mouse/touch court gestures from game.js. */
export function createTouchControls(deps: TouchDeps): TouchControls {
  const canvas = deps.canvas;
  const controls = byId("touch-controls");
  const joystick = byId("touch-joystick");
  const thumb = byId("touch-stick-thumb");
  const hit = byId<HTMLButtonElement>("touch-hit");
  const lob = byId<HTMLButtonElement>("touch-lob");
  const powerServe = maybeById<HTMLButtonElement>("touch-power-serve");
  let hitPointerId: number | null = null;
  let lobPointerId: number | null = null;
  const stick: TouchStickState = { pointerId: null, originX: 0, originY: 0, x: 0, y: 0, dragged: false, usedSecondFinger: false, startedAt: 0, target: null, radius: TOUCH_RADIUS };

  function clearStick(): void {
    const pointerId = stick.pointerId;
    const target = stick.target;
    stick.pointerId = null; stick.target = null; stick.x = 0; stick.y = 0; stick.dragged = false; stick.usedSecondFinger = false;
    thumb.style.transform = "translate(0px, 0px)";
    joystick.classList.remove("active");
    if (pointerId !== null && target?.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
  }
  function clearHit(): void {
    const pointerId = hitPointerId;
    hitPointerId = null;
    hit.classList.remove("pressed");
    if (pointerId !== null && hit.hasPointerCapture(pointerId)) hit.releasePointerCapture(pointerId);
  }
  function clearLob(): void {
    const pointerId = lobPointerId;
    lobPointerId = null;
    lob.classList.remove("pressed");
    if (pointerId !== null && lob.hasPointerCapture(pointerId)) lob.releasePointerCapture(pointerId);
  }

  function moveStick(event: PointerEvent): void {
    if (event.pointerId !== stick.pointerId) return;
    if (!deps.touchPlayEnabled()) { clearStick(); return; }
    event.preventDefault();
    const dx = event.clientX - stick.originX, dy = event.clientY - stick.originY;
    const distance = Math.hypot(dx, dy);
    if (distance > TOUCH_DEAD_ZONE) stick.dragged = true;
    // The origin stays fixed so holding an offset keeps running; returning to it stops, and one finger can reverse indefinitely.
    const strength = Math.min(1, Math.max(0, (distance - TOUCH_DEAD_ZONE) / (stick.radius - TOUCH_DEAD_ZONE)));
    stick.x = distance ? (dx / distance) * strength : 0;
    stick.y = distance ? (dy / distance) * strength : 0;
    if (stick.target === joystick) {
      const scale = distance ? Math.min(distance, stick.radius) / distance : 0;
      thumb.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
    }
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (deps.inputOverlayOpen() || deps.swipeActive()) return;
    deps.initAudio();
    if (event.pointerType !== "touch") {
      if (deps.matchMode() === "playing") deps.requestSwing(event);
      return;
    }
    if (!deps.touchPlayEnabled()) return;
    event.preventDefault();
    capture(canvas, event.pointerId);
    if (stick.pointerId !== null) {
      // Strike immediately with the second finger, preserving the held stick.
      stick.usedSecondFinger = true;
      deps.requestSwing(event);
      return;
    }
    Object.assign(stick, { pointerId: event.pointerId, originX: event.clientX, originY: event.clientY, x: 0, y: 0, dragged: false, usedSecondFinger: false, startedAt: performance.now(), target: canvas, radius: TOUCH_RADIUS });
  }, { passive: false });
  canvas.addEventListener("pointermove", moveStick, { passive: false });
  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerId !== stick.pointerId) return;
    moveStick(event);
    const tap = !stick.dragged && !stick.usedSecondFinger && performance.now() - stick.startedAt <= TOUCH_TAP_MS && deps.touchPlayEnabled();
    clearStick();
    if (tap) deps.requestSwing(event);
  }, { passive: false });
  for (const type of ["pointercancel", "lostpointercapture"] as const) {
    canvas.addEventListener(type, (event) => { if (event.pointerId === stick.pointerId) clearStick(); });
  }

  joystick.addEventListener("pointerdown", (event) => {
    if (deps.swipeActive() || !deps.touchPlayEnabled() || stick.pointerId !== null || event.button !== 0) return;
    event.preventDefault();
    const box = joystick.getBoundingClientRect();
    Object.assign(stick, { pointerId: event.pointerId, originX: box.left + box.width / 2, originY: box.top + box.height / 2, x: 0, y: 0, dragged: false, usedSecondFinger: false, target: joystick, radius: (box.width - thumb.offsetWidth) / 2 - 4 });
    capture(joystick, event.pointerId);
    joystick.classList.add("active");
    moveStick(event);
  }, { passive: false });
  joystick.addEventListener("pointermove", moveStick, { passive: false });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
    joystick.addEventListener(type, (event) => { if (event.pointerId === stick.pointerId) clearStick(); });
  }

  hit.addEventListener("pointerdown", (event) => {
    if (!deps.touchPlayEnabled() || hitPointerId !== null || event.button !== 0) return;
    event.preventDefault();
    hitPointerId = event.pointerId;
    capture(hit, event.pointerId);
    hit.classList.add("pressed");
    if (stick.pointerId !== null) stick.usedSecondFinger = true;
    deps.requestSwing(event);
  }, { passive: false });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
    hit.addEventListener(type, (event) => { if (event.pointerId === hitPointerId) clearHit(); });
  }
  // Keyboard and assistive activation has no pointerdown; pointer clicks already hit.
  hit.addEventListener("click", (event) => { if (event.detail === 0 && deps.touchPlayEnabled()) deps.requestSwing(event); });

  lob.addEventListener("pointerdown", (event) => {
    if (!deps.touchPlayEnabled() || !deps.intentionalLobEnabled() || lobPointerId !== null || event.button !== 0) return;
    event.preventDefault();
    lobPointerId = event.pointerId;
    capture(lob, event.pointerId);
    lob.classList.add("pressed");
    if (stick.pointerId !== null) stick.usedSecondFinger = true;
    deps.requestLobSwing(event);
  }, { passive: false });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
    lob.addEventListener(type, (event) => { if (event.pointerId === lobPointerId) clearLob(); });
  }
  lob.addEventListener("click", (event) => { if (event.detail === 0) deps.requestLobSwing(event); });

  powerServe?.addEventListener("pointerdown", (event) => {
    if (!deps.touchPlayEnabled() || !deps.modernServe() || event.button !== 0) return;
    event.preventDefault(); deps.initAudio();
    if (stick.pointerId !== null) stick.usedSecondFinger = true;
    deps.requestSwing(event, true);
  });
  powerServe?.addEventListener("click", (event) => {
    if (event.detail === 0 && deps.touchPlayEnabled() && deps.modernServe()) deps.requestSwing(event, true);
  });

  return {
    stick, clearStick, clearHit, clearLob,
    clearAll() { clearStick(); clearHit(); clearLob(); },
    render({ phase, server, touchEnabled, coarse }) {
      controls.hidden = !coarse || !touchEnabled || deps.swipeActive();
      const powerServeVisible = deps.modernServe() && server === "player" && ["serveToss", "serveSwing"].includes(phase);
      lob.hidden = !deps.intentionalLobEnabled() || powerServeVisible;
      lob.disabled = !touchEnabled || phase !== "rally";
      if (powerServe) powerServe.hidden = !powerServeVisible;
      if (!touchEnabled) { clearStick(); clearHit(); clearLob(); }
    }
  };
}
