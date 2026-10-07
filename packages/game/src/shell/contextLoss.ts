/**
 * §6.2 context loss (PRD-09 1763): subscribe to `app.onDeviceLost` → pause the
 * session with reason `context-lost`, hide the HUD, show the ContextLost menu;
 * `onDeviceRestored` → close the menu, stay paused until the player resumes.
 * After 3 s without restore, the screen offers Reload. The shell never
 * attaches its own canvas listeners — the engine owns `webglcontextlost`
 * behind `onDeviceLost` (WebGL2Device.ts:444); WebGPU `device.lost` wiring is
 * request Q-11-2 (PRD 11).
 */
import type { HudDocument } from "../hud/dom.js";
import { createContextLostScreen } from "./screens/ContextLost.js";

export interface DeviceLossApp {
  onDeviceLost(cb: () => void): () => void;
  onDeviceRestored(cb: () => void): () => void;
}

export interface ContextLossSink {
  pause(reason: "context-lost"): void;
  hideHud(): void;
  showHud(): void;
}

export interface ContextLossController {
  readonly lost: boolean;
  dispose(): void;
}

export function wireContextLoss(
  app: DeviceLossApp,
  doc: HudDocument,
  deps: ContextLossSink & {
    mount(el: unknown): void;
    onReload?(): void;
    now?(): number;
    setTimer?(cb: () => void, ms: number): { cancel(): void };
  }
): ContextLossController {
  const screen = createContextLostScreen(doc, {
    onReload: deps.onReload,
    now: deps.now,
    setTimer: deps.setTimer
  });
  deps.mount(screen.el);
  let lost = false;
  const offLost = app.onDeviceLost(() => {
    lost = true;
    deps.pause("context-lost");
    deps.hideHud();
    screen.show();
  });
  const offRestored = app.onDeviceRestored(() => {
    lost = false;
    screen.hide();
    // Stay paused until the player resumes (§6.2) — the HUD comes back but
    // the session keeps the `context-lost` pause until `resume("user")`.
    deps.showHud();
  });
  return {
    get lost() { return lost; },
    dispose() {
      offLost();
      offRestored();
      screen.dispose();
    }
  };
}
