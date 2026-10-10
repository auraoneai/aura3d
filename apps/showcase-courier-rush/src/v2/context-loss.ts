// §6.2 context loss (14-P0FIX, #683): pause on device loss; re-mount and
// resume on restore so a lost WebGL context cannot leave the route drawing
// nothing. Kept out of boot.ts so the 14-LOC ≤ 400 line budget holds.
import type { AuraApp } from "@aura3d/engine";

type ContextLossApp = Pick<AuraApp, "onDeviceLost" | "onDeviceRestored" | "pause" | "resume" | "setScene" | "ready" | "step">;

export function installCourierContextLoss(
  app: ContextLossApp,
  buildScene: () => Parameters<AuraApp["setScene"]>[0]
): void {
  app.onDeviceLost?.(() => {
    app.pause();
  });
  app.onDeviceRestored?.(() => {
    app.setScene(buildScene());
    void app.ready().then(() => {
      app.resume();
      app.step(1 / 60);
    });
  });
}
