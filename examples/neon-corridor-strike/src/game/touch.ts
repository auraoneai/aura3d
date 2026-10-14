import type { GameInputController } from "@aura3d/engine";

export interface CorridorTouchSnapshot {
  readonly enabled: boolean;
  readonly actions: Readonly<Record<string, number>>;
  readonly lookGestures: number;
}

export interface CorridorTouchController {
  snapshot(): CorridorTouchSnapshot;
  dispose(): void;
}

interface TouchOptions {
  readonly input: GameInputController;
  readonly onLook: (dx: number, dy: number) => void;
}

export function createCorridorTouchControls(options: TouchOptions): CorridorTouchController {
  const forced = new URLSearchParams(window.location.search).get("touch") === "1";
  const enabled = forced || window.matchMedia?.("(pointer: coarse)").matches === true;
  const actionCounts: Record<string, number> = {};
  let lookGestures = 0;
  const cleanups: Array<() => void> = [];
  if (!enabled) return { snapshot: () => ({ enabled: false, actions: {}, lookGestures: 0 }), dispose: () => undefined };

  document.body.dataset.aura3dTouch = "true";
  const root = document.createElement("div");
  root.id = "fps-touch-controls";
  root.setAttribute("aria-label", "Touch controls");
  root.innerHTML = `
    <div class="fps-touch-dpad" aria-label="Movement controls">
      <button data-touch-action="forward" aria-label="Move forward">▲</button>
      <button data-touch-action="left" aria-label="Move left">◀</button>
      <button data-touch-action="back" aria-label="Move backward">▼</button>
      <button data-touch-action="right" aria-label="Move right">▶</button>
    </div>
    <div class="fps-touch-look" data-touch-look aria-label="Drag to look"><span>LOOK</span></div>
    <button class="fps-touch-reload" data-touch-action="reload">RELOAD</button>
    <button class="fps-touch-pause" data-touch-action="pause">PAUSE</button>
    <button class="fps-touch-reset" data-touch-action="reset">RESET</button>
  `;
  const style = document.createElement("style");
  style.textContent = `
    #fps-touch-controls { position:fixed;inset:0;z-index:8;pointer-events:none;font:700 11px/1 ui-sans-serif,system-ui,sans-serif;color:#e8f4ff; }
    #fps-touch-controls button,#fps-touch-controls [data-touch-look] { pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;border:1px solid rgba(126,248,255,.62);background:rgba(4,8,14,.82);color:#e8f4ff;backdrop-filter:blur(3px); }
    .fps-touch-dpad { position:absolute;left:8px;bottom:8px;width:144px;height:144px;display:grid;grid-template:repeat(3,48px)/repeat(3,48px); }
    .fps-touch-dpad button { width:48px;height:48px;border-radius:9px;font-size:17px; }
    .fps-touch-dpad button[data-touch-action="forward"] { grid-column:2;grid-row:1; }
    .fps-touch-dpad button[data-touch-action="left"] { grid-column:1;grid-row:2; }
    .fps-touch-dpad button[data-touch-action="back"] { grid-column:2;grid-row:3; }
    .fps-touch-dpad button[data-touch-action="right"] { grid-column:3;grid-row:2; }
    .fps-touch-look { position:absolute;right:8px;bottom:64px;width:140px;height:140px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:rgba(232,244,255,.62);letter-spacing:.12em; }
    .fps-touch-look::after { content:"";width:52px;height:52px;border:1px solid rgba(126,248,255,.45);border-radius:50%;position:absolute; }
    .fps-touch-reload,.fps-touch-reset { position:absolute;bottom:8px;width:70px;height:48px;border-radius:9px; }
    .fps-touch-reload { right:156px; }
    .fps-touch-reset { right:88px;top:116px;bottom:auto; }
    .fps-touch-pause { position:absolute;right:8px;top:116px;width:72px;height:48px;border-radius:9px; }
    body[data-aura3d-touch="true"] #fps-hud > div:nth-of-type(3) { bottom:160px !important; }
    body[data-aura3d-touch="true"] #fps-hud > div:nth-of-type(4) { bottom:212px !important; }
    body[data-aura3d-touch="true"] #fps-hud [data-hud="fire"] { min-width:140px !important;width:140px !important;height:48px !important;padding:8px !important; }
  `;
  root.append(style);
  document.body.append(root);

  for (const node of Array.from(root.querySelectorAll("[data-touch-action]"))) {
    if (!(node instanceof HTMLButtonElement)) continue;
    const action = node.dataset.touchAction ?? "";
    const press = (event: PointerEvent): void => {
      event.preventDefault();
      options.input.setAction(action, true);
      actionCounts[action] = (actionCounts[action] ?? 0) + 1;
    };
    const release = (event: PointerEvent): void => {
      event.preventDefault();
      options.input.setAction(action, false);
    };
    node.addEventListener("pointerdown", press);
    node.addEventListener("pointerup", release);
    node.addEventListener("pointercancel", release);
    node.addEventListener("pointerleave", release);
    cleanups.push(() => {
      node.removeEventListener("pointerdown", press);
      node.removeEventListener("pointerup", release);
      node.removeEventListener("pointercancel", release);
      node.removeEventListener("pointerleave", release);
    });
  }

  const fire = document.querySelector("[data-hud=\"fire\"]");
  if (fire) fire.textContent = "FIRE";
  const countFire = (): void => { actionCounts.fire = (actionCounts.fire ?? 0) + 1; };
  fire?.addEventListener("pointerdown", countFire);
  cleanups.push(() => fire?.removeEventListener("pointerdown", countFire));

  const look = root.querySelector("[data-touch-look]");
  let lookPointer: number | undefined;
  let lastX = 0;
  let lastY = 0;
  const lookDown = (event: PointerEvent): void => {
    lookPointer = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    lookGestures += 1;
    event.preventDefault();
  };
  const lookMove = (event: PointerEvent): void => {
    if (event.pointerId !== lookPointer) return;
    options.onLook(event.clientX - lastX, event.clientY - lastY);
    lastX = event.clientX;
    lastY = event.clientY;
    event.preventDefault();
  };
  const lookUp = (event: PointerEvent): void => {
    if (event.pointerId === lookPointer) lookPointer = undefined;
  };
  look?.addEventListener("pointerdown", lookDown as EventListener);
  window.addEventListener("pointermove", lookMove);
  window.addEventListener("pointerup", lookUp);
  cleanups.push(() => {
    look?.removeEventListener("pointerdown", lookDown as EventListener);
    window.removeEventListener("pointermove", lookMove);
    window.removeEventListener("pointerup", lookUp);
  });

  return {
    snapshot: () => ({ enabled, actions: { ...actionCounts }, lookGestures }),
    dispose(): void {
      for (const cleanup of cleanups) cleanup();
      root.remove();
      delete document.body.dataset.aura3dTouch;
    }
  };
}
