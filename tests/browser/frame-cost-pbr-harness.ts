import { camera, createAuraApp, defineModelAssets, effects, environments, interactions, lights, material, model, primitives, scene } from "@aura3d/engine";

/**
 * The tools/bench-vs-threejs/pbr-viewer/aura scene (Cesium milk truck, HDR environment, one shadowed directional light,
 * bloom, ACES output, orbit), built against the in-repo sources instead of the published package, so draw calls can be
 * measured for the working tree. Query: `?sha=<sha256 of the GLB>&quality=auto|production`, plus optional
 * `&bloomFusion=separable|fused-2d` (renderer.bloomFusion), `&w=<px>&h=<px>` (canvas size, default 640x360) and
 * `&bloom=0` (scene without the bloom effect).
 */
interface PbrHarnessApi {
  ready: boolean;
  errors: string[];
  renderPath: unknown;
  stepOnce(): void;
  /** `diagnostics().renderSize` now (the adaptive governor can lower it below the canvas size). */
  renderSize(): readonly number[] | null;
  /** Wait until the HDRI environment has settled, render `frames` more frames, and return the canvas as base64 RGBA (canvas size). */
  settledPixels(frames: number): Promise<string>;
  /** Wall time of `frames` steady frames (render + readPixels wait), in ms each. */
  measure(frames: number): number[];
}
declare global { interface Window { __PBR__?: PbrHarnessApi } }

const params = new URLSearchParams(location.search);
const errors: string[] = [];
window.addEventListener("error", (event) => errors.push(String(event.message)));
window.addEventListener("unhandledrejection", (event) => errors.push(String((event.reason as Error)?.message ?? event.reason)));

async function main(): Promise<void> {
  const canvas = document.createElement("canvas");
  const width = Number(params.get("w") ?? 640);
  const height = Number(params.get("h") ?? 360);
  canvas.width = width;
  canvas.height = height;
  canvas.style.cssText = `width:${width}px;height:${height}px`;
  document.body.appendChild(canvas);
  try {
    const assets = defineModelAssets(
      { truck: { url: "/fixtures/threejs-parity/assets/physics/cesium-milk-truck.glb", sha256: params.get("sha") ?? "" } },
      { license: "CC-BY 4.0, Cesium" }
    );
    const viewerScene = scene()
      .background("#1a1d24")
      .camera(camera.orbit({ fov: 40, near: 0.1, far: 100, position: [4.5, 2.2, 5.5], target: [0, 0.8, 0] }))
      .add(environments.hdri({ name: "env", intensity: 1, background: false, texture: { type: "texture", format: "hdr", url: "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr" } as never }))
      .add(lights.directional({ color: "#fff4e0", intensity: 2.5, position: [5, 8, 4], shadow: true }))
      .add(primitives.plane({ name: "ground", size: [30, 1, 30], material: material.pbr({ color: "#2b2f38", roughness: 0.9 }) }))
      .add(model(assets.refs.truck, { name: "truck", targetHeight: 2, castShadow: true }));
    if (params.get("bloom") !== "0") viewerScene.add(effects.bloom({ intensity: 0.35, threshold: 0.85, radius: 0.6 }));
    viewerScene.add(interactions.orbit({ target: "truck" }));
    const app = createAuraApp(canvas, {
      autoStart: false,
      resize: false,
      pixelRatio: 1,
      quality: (params.get("quality") ?? "auto") as "auto",
      renderer: {
        mode: "production",
        qualityProfile: "production",
        fallback: "safe-basic",
        ...(params.get("bloomFusion") ? { bloomFusion: params.get("bloomFusion") as "separable" } : {})
      },
      output: { toneMapping: "aces" },
      scene: viewerScene
    });
    await app.ready();
    // Experiment knob (variant exploration): `?fusion=off` or `?fusion=acc=1,b2d=3,ext=1` sets the bloom fusion config on the device.
    const fusionParam = params.get("fusion");
    if (fusionParam !== null) {
      const device = ((app as unknown as Record<symbol, { device?: Record<string, unknown> } | undefined>)[Symbol.for("a3d.prd01.renderer")])?.device;
      if (device) {
        if (fusionParam === "off") {
          device.bloomFusedPasses = false;
        } else {
          const kv = Object.fromEntries(fusionParam.split(",").map((pair) => pair.split("=") as [string, string]));
          device.bloomFusedPasses = true;
          device.bloomFusion = { accumulate: kv.acc !== "0", blur2dFromLevel: Number(kv.b2d ?? 5), extract: kv.ext !== "0" };
        }
      }
    }
    const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
    const sink = new Uint8Array(4);
    const stepOnce = (): void => { app.step(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sink); };
    stepOnce();
    const settledPixels = async (frames: number): Promise<string> => {
      // Both qualities must be compared on the same lighting: wait for the HDRI chain, then render a fixed number of frames.
      for (let i = 0; i < 600; i += 1) {
        const status = (app.diagnostics() as { renderer?: { environment?: { hdriStatus?: string } } }).renderer?.environment?.hdriStatus;
        if (status === "ready" || status === "none" || status === "fallback") break;
        stepOnce();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      for (let i = 0; i < frames; i += 1) stepOnce();
      const bitmap = (await (app as unknown as { capture(options: { type: "image-bitmap" }): Promise<ImageBitmap> }).capture({ type: "image-bitmap" }));
      const scratch = document.createElement("canvas");
      scratch.width = bitmap.width;
      scratch.height = bitmap.height;
      const context = scratch.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, scratch.width, scratch.height).data;
      let binary = "";
      for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
      return btoa(binary);
    };
    window.__PBR__ = {
      ready: true,
      errors,
      renderPath: (app.diagnostics() as { renderPath?: unknown }).renderPath,
      stepOnce,
      renderSize: () => ((app.diagnostics() as { renderSize?: readonly number[] }).renderSize ?? null),
      settledPixels,
      measure(frames) {
        for (let i = 0; i < 2; i += 1) stepOnce();
        const totals: number[] = [];
        for (let i = 0; i < frames; i += 1) {
          const t0 = performance.now();
          stepOnce();
          totals.push(performance.now() - t0);
        }
        return totals;
      }
    };
  } catch (error) {
    errors.push(`start failed: ${(error as Error)?.stack ?? error}`);
    window.__PBR__ = { ready: false, errors, renderPath: null, stepOnce: () => undefined, renderSize: () => null, settledPixels: async () => "", measure: () => [] };
  }
}

void main();
