// §6.2 context loss (14-P0FIX, #683): pause on device loss; re-mount and
// resume on restore so a lost WebGL context cannot leave the route drawing
// nothing. Kept out of boot.ts so the 14-LOC ≤ 400 line budget holds.
// PRD-11 Q-14-7 (#118, C-07): a polite `role="status"` overlay tells the
// player the view is reconnecting while the device is lost, and clears on
// restore.
import type { AuraApp } from "@aura3d/engine";

type ContextLossApp = Pick<AuraApp, "onDeviceLost" | "onDeviceRestored" | "pause" | "resume" | "setScene" | "ready" | "step">;

/** The slice of `Document` the overlay needs (injectable for tests). */
export type ContextLossDocument = {
  createElement(tag: "div"): HTMLDivElement;
  readonly body: Pick<HTMLElement, "appendChild">;
};

export const DEVICE_LOST_MESSAGE = "Graphics device lost. Reconnecting…";

function createStatusOverlay(doc: ContextLossDocument): HTMLDivElement {
  const overlay = doc.createElement("div");
  overlay.className = "courier-device-status";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("data-device-state", "ok");
  overlay.hidden = true;
  // Solid panel + white text keeps contrast independent of the frozen frame.
  overlay.style.cssText = [
    "position:fixed", "left:50%", "top:16px", "transform:translateX(-50%)", "z-index:20",
    "padding:10px 16px", "border-radius:8px", "background:#101418", "color:#ffffff",
    "font:600 15px/1.3 system-ui,sans-serif", "pointer-events:none"
  ].join(";");
  doc.body.appendChild(overlay);
  return overlay;
}

export function installCourierContextLoss(
  app: ContextLossApp,
  buildScene: () => Parameters<AuraApp["setScene"]>[0],
  doc: ContextLossDocument = document
): HTMLDivElement {
  const overlay = createStatusOverlay(doc);
  app.onDeviceLost?.(() => {
    app.pause();
    overlay.textContent = DEVICE_LOST_MESSAGE;
    overlay.setAttribute("data-device-state", "lost");
    overlay.hidden = false;
  });
  app.onDeviceRestored?.(() => {
    app.setScene(buildScene());
    void app.ready().then(() => {
      app.resume();
      app.step(1 / 60);
      overlay.textContent = "";
      overlay.setAttribute("data-device-state", "ok");
      overlay.hidden = true;
    });
  });
  return overlay;
}
