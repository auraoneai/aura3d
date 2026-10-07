/**
 * Lane prd02 page (PRD-02 §16.1). Two modes, selected by `?mode=`:
 *
 *  - `render` (default): `?engine=aura3d|three&scene=<id>[&control=<broken-control>][&a3d-qr=<flags>]`.
 *    Runs the shared translator on the lane spec and publishes
 *    `window.__QR_READY__` / `__QR_ERROR__` exactly like the base page.
 *    Broken controls are applied to the spec as pure data transforms.
 *
 *  - `metrics`: exposes `window.__qrPrd02` with the bundled metrics + mask
 *    builders, so `capture-lane.mjs` can decode screenshots and evaluate
 *    the §16.4 metrics inside the same browser (dependency-free, matching
 *    the parent `capture.mjs` pattern).
 */
import { runAuraScene } from "../../aura3d/common";
import { runThreeScene } from "../../three/common";
import type { ReadyPayload } from "../../shared/types";
import { applyBrokenControl } from "./controls";
import { getPrd02Spec } from "./specs";

declare global {
  interface Window {
    __QR_READY__?: ReadyPayload;
    __QR_ERROR__?: unknown;
    __qrPrd02?: unknown;
  }
}

async function runRenderMode(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const sceneId = params.get("scene") ?? "";
  const engine = params.get("engine") ?? "aura3d";
  const control = params.get("control");
  const host = document.getElementById("stage");
  if (!host) throw new Error("missing #stage element");
  try {
    const base = getPrd02Spec(sceneId);
    const spec = control ? applyBrokenControl(base, control) : base;
    const payload = engine === "three" ? await runThreeScene(spec, host) : await runAuraScene(spec, host);
    window.__QR_READY__ = payload;
  } catch (error) {
    window.__QR_ERROR__ = { message: String(error), stack: error instanceof Error ? error.stack : undefined };
  }
}

async function runMetricsMode(): Promise<void> {
  const [regionMetrics, masks, specs, sceneMetrics] = await Promise.all([
    import("../../../../tests/qr/prd02/metrics/regionMetrics"),
    import("./masks"),
    import("./specs"),
    import("../../../../tests/qr/prd02/metrics/sceneMetrics")
  ]);
  window.__qrPrd02 = { regionMetrics, masks, specs, sceneMetrics };
}

const params = new URLSearchParams(window.location.search);
if (params.get("mode") === "metrics") {
  void runMetricsMode();
} else {
  void runRenderMode();
}
