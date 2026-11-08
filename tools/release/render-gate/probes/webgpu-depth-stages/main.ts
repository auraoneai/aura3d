/**
 * Build: `PROBE_OUT=/tmp/out pnpm exec vite build --config tools/release/render-gate/probes/vite.config.ts`.
 * Isolated proof page for the WebGPU native depth stages (W4). The same scene renders on WebGL2 (default) and on
 * WebGPU (`?backend=webgpu`), so a pair of captures compares the passes directly.
 *
 *   ?fx=god      S4 god rays (effects.godRays) through a row of pillars against a bright sky
 *   ?fx=mb       S7 camera motion blur (effects.motionBlur) with the camera sweeping sideways
 *   ?fx=both     both stages (default)
 *   ?fx=fog      volumetric fog (god rays from the volumetric-fog node, as the games author it)
 *   ?fx=none     neither (baseline)
 *   ?compat=3    compat.post "3.0": volumetric fog compiles to the legacy volumetric-light pass
 *   ?post=0      post lane flag off (legacy chain; volumetric fog runs the legacy volumetric-light pass)
 *   ?tier=high   pin the post quality tier (S7 motion blur needs High or Ultra)
 *   ?step=<sec>  sweep step alternated per frame while frozen (default 0.03)
 *   ?t=<sec>     freeze the camera sweep at this time (deterministic captures)
 */
import { camera, createAuraApp, effects, environments, lights, material, primitives, scene } from "@aura3d/engine";
import { labAppOptions, readLabFlags } from "../../../../../examples/shared/lab-flags.js";

const params = new URLSearchParams(location.search);
const fx = params.get("fx") ?? "both";
const frozen = params.has("t") ? Number(params.get("t")) : undefined;
const god = fx === "god" || fx === "both";
const blur = fx === "mb" || fx === "both";
const fog = fx === "fog";

const eye = (t: number): [number, number, number] => [Math.sin(t * 2.2) * 5, 2.4, 14];

const minimal = params.get("min");
const s = scene({ background: "#cfe3f6" });
if (minimal !== "1") s.add(environments.neutral({ intensity: 0.55, background: false }));
if (minimal !== "1" && minimal !== "2") s.add(lights.directional({ position: [0, 9, -40], target: [0, 0, 0], intensity: 2.6, color: "#fff2d8", shadow: true }));
s.add(primitives.plane({ name: "ground", size: [80, 1, 120], material: material.pbr({ color: "#5d6b55", roughness: 0.9 }) }));
for (let i = -6; i <= 6; i += 1) {
  s.add(primitives.box({ name: `pillar-${i}`, size: [0.7, 9, 0.7], position: [i * 1.6, 4.5, -6], material: material.pbr({ color: i % 2 ? "#3b3f4a" : "#8a5a3c", roughness: 0.6 }) }));
}
for (let i = 0; i < 10; i += 1) {
  s.add(primitives.sphere({ name: `ball-${i}`, size: 0.9, position: [-8 + i * 1.8, 0.45, 4 - (i % 3)], material: material.pbr({ color: ["#e4572e", "#f3a712", "#29a0b1", "#ffffff"][i % 4]!, roughness: 0.35 }) }));
}
if (god) s.add(effects.godRays({ source: [0, 7, -40], intensity: 1.1, samples: 48, decay: 0.95, color: "#fff1d0" }));
if (fog) s.add(effects.volumetricFog({ density: 0.35, intensity: 0.8, godRayDensity: 0.6 } as never));
if (blur) s.add(effects.motionBlur({ intensity: 1 }));
s.camera(camera.perspective({ position: eye(frozen ?? 0), target: [eye(frozen ?? 0)[0], 3, -40], fov: 55, near: 0.1, far: 200 }));

const app = createAuraApp("#app", {
  scene: s,
  ...labAppOptions(readLabFlags()),
  ...(params.get("compat") === "3" ? { compat: { post: "3.0" as const } } : {}),
  // ?post=0 turns the post lane flag off: the legacy chain, where WebGL2 runs its CPU volumetric-light kernel.
  ...(params.get("post") === "0" ? { qualityRebuild: { flags: { A3D_QR_POST: false } } } as never : {})
});
// ?tier=high|ultra pins the post quality tier (motion blur runs from High up; auto may resolve lower headless).
const tier = params.get("tier");
if (tier) (app as unknown as { post?: { setQualityTier(tier: string): void } }).post?.setQualityTier(tier);
let time = frozen ?? 0;
let frameCount = 0;
const step = Number(params.get("step") ?? 0.03);
app.onFrame((f) => {
  frameCount += 1;
  // A frozen time still moves the camera one sweep step per frame, so motion blur has a real previous view.
  time = frozen === undefined ? f.time : frozen + (frameCount % 2) * step;
  const position = eye(time);
  (app as unknown as { camera?: { setPose(pose: { position: number[]; target: number[] }): void } }).camera?.setPose({ position, target: [position[0], 3, -40] });
});
// No top-level await: a bundled entry chunk still evaluating cannot be re-entered by the engine's own dynamic imports,
// so `await app.ready()` at module top level deadlocks the mount (see tools/release/render-gate/probes).
app.ready().then(() => {
  document.body.dataset.probeReady = "1";
  (window as unknown as { __PROBE__: unknown }).__PROBE__ = { fx, app };
  const diagnostics = app.diagnostics() as unknown as { renderer?: { backendSelection?: unknown } };
  console.log("[probe] ready", JSON.stringify(diagnostics.renderer?.backendSelection ?? null));
  setTimeout(() => {
    const later = app.diagnostics() as unknown as { post?: { stagesRan?: unknown; skipped?: unknown }; errors?: unknown };
    console.log("[probe] camera", typeof (app as unknown as { camera?: { setPose?: unknown } }).camera?.setPose, frameCount);
    console.log("[probe] post", JSON.stringify({ stagesRan: later.post?.stagesRan, skipped: later.post?.skipped, errors: later.errors }).slice(0, 1200));
  }, 3000);
}, (error: unknown) => {
  document.body.dataset.probeReady = "failed";
  console.error("[probe] ready failed", String((error as Error)?.stack ?? error).slice(0, 800));
});
