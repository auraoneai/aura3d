/**
 * Lane prd02 page (PRD-02 §16.1). Two modes, selected by `?mode=`:
 *
 *  - `render` (default): `?engine=aura3d|three&scene=<id>[&control=<broken-control>][&a3d-qr=<flags|none>]`.
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
import { applyAuraProbes, applyThreeLightProbe, applyThreeRoomEnvironment, installReceiveShadowFixture } from "./fixtures";
import { getPrd02Spec } from "./specs";
import { prd02LastBridgeDevice, prd02ShadowBridgeReason, prd02ShadowDepthProbe } from "@aura3d/rendering/lanes";

declare global {
  interface Window {
    __QR_READY__?: ReadyPayload;
    __QR_ERROR__?: unknown;
    __qrPrd02?: unknown;
    /** The mounted Aura app (render mode), for specs that drive frames after READY. */
    __qrPrd02App?: unknown;
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
    // `a3d-qr` selects the flag set: absent → the spec's own qrFlags
    // (["lighting"]); "none" → no flags (the real flag-off control);
    // otherwise the comma list. createAuraApp never reads the URL itself.
    const qrParam = params.get("a3d-qr");
    const qrFlags = qrParam === null
      ? undefined
      : qrParam === "none" ? [] : qrParam.split(",").map((flag) => flag.trim()).filter(Boolean);
    // 02-T1923: the receive-shadow controls also register the C-01 collect
    // fixture (production items get `receiveShadow` only after Q-15-5/Q-04-2).
    if (engine !== "three" && control) installReceiveShadowFixture(control);
    // 02-S12: the `with-probes` control appends the probe nodes (Aura) or the
    // CubeCamera + LightProbeGenerator reference (three); default captures
    // keep the probe-free day-0 scene.
    const withProbes = control === "with-probes";
    const payload = engine === "three"
      ? await runThreeScene(spec, host).then(async (ready) => {
          applyThreeRoomEnvironment(sceneId);
          if (withProbes) await applyThreeLightProbe(sceneId);
          return ready;
        })
      : await runAuraScene(spec, host, {
          ...(qrFlags !== undefined ? { qrFlags } : {}),
          // Shadow specs (S5/S6) step frames and read diagnostics after READY.
          collectExtra: async (app) => {
            window.__qrPrd02App = app;
            const probeNodes = withProbes ? await applyAuraProbes(sceneId, app as unknown as Parameters<typeof applyAuraProbes>[1]) : 0;
            if (params.get("shadowDiagnostics") !== "1") return probeNodes > 0 ? { prd02ProbeNodes: probeNodes } : {};
            // Shadow-pixels GPU evidence: cascade depth stats of the flag-path
            // bridge after the ready frame (empty when the bridge did not run).
            const laneRenderer = (app as unknown as Record<symbol, { device?: unknown } | undefined>)[Symbol.for("a3d.prd01.renderer")];
            // Without the renderer symbol the probe falls back to the device
            // the bridge last ran on ("never-ran" = bridge not reached).
            const laneDevice = (laneRenderer?.device as never | undefined) ?? undefined;
            const shadowDepth = prd02ShadowDepthProbe(laneDevice);
            const prd02ShadowBridge = prd02ShadowBridgeReason(laneDevice);
            // Draw tap: what the GPU forward draws of shadow receivers were
            // handed over the next stepped frame (binding, enable, strength).
            const prd02ShadowDraws = tapShadowReceiverDraws(laneDevice ?? (prd02LastBridgeDevice() as never), () => (app as unknown as { step(dt: number): void }).step(0));
            return { ...(probeNodes > 0 ? { prd02ProbeNodes: probeNodes } : {}), prd02ShadowDepth: shadowDepth, prd02ShadowBridge, prd02ShadowDraws };
          }
        });
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

/** Records shadow uniforms of up to 8 forward draws over one stepped frame (GPU evidence). */
function tapShadowReceiverDraws(device: { draw?: (command: unknown) => void } | null | undefined, renderFrame: () => void): unknown[] {
  if (!device || typeof device.draw !== "function") return [];
  const original = device.draw;
  const seen: unknown[] = [];
  device.draw = function (this: unknown, command: unknown) {
    const c = command as { label?: string; shader?: { label?: string }; uniforms?: ReadonlyMap<string, unknown> };
    const u = c.uniforms;
    if (seen.length < 8 && u?.get && u.has?.("u_shadowMapEnabled")) {
      const binding = u.get("u_shadowMapTexture") as { texture?: { label?: string; format?: string } | null; sampler?: unknown } | undefined;
      const matrix = u.get("u_shadowMapMatrix") as Float32Array | undefined;
      seen.push({
        label: c.label ?? null,
        shader: c.shader?.label ?? null,
        enabled: u.get("u_shadowMapEnabled"),
        strength: u.get("u_shadowMapStrength"),
        texture: binding?.texture?.label ?? null,
        format: binding?.texture?.format ?? null,
        sampler: binding?.sampler ?? null,
        matrix: matrix ? Array.from(matrix).map((v) => Math.round(v * 1e4) / 1e4) : null
      });
    }
    return original.call(this, command);
  };
  try {
    renderFrame();
  } finally {
    device.draw = original;
  }
  return seen;
}
