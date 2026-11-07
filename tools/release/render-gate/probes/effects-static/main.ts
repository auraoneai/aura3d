import { camera, createAuraApp, effects, lights, material, primitives, scene, sky, world } from "@aura3d/engine";

// Clock-consumer probe. `?e=` picks ONE effect on an otherwise static, lit scene with no `.runtime`, no `app.onFrame`,
// no timeline: none | fog | water | clouds | utime. `&loop=1` adds an empty `app.onFrame` so the loop is forced on:
// that variant measures whether the effect really animates (frame difference), independent of the idle decision.
// Use `e=none` for the idle-cost baseline (a static scene with no clock consumer must stay idle).
const params = new URLSearchParams(location.search);
const which = params.get("e") ?? "none";
const forceLoop = params.get("loop") === "1";
console.log("probe-start", which, forceLoop ? "loop" : "static");

const clock = material.custom({
  glsl: { fragment: /* glsl */ `
out vec4 outColor;
void main() {
  float wave = 0.5 + 0.5 * sin(uTime);
  outColor = vec4(wave, 0.35 + 0.3 * wave, 1.0 - wave, 1.0);
}` }
});

let s = scene({ background: "#8fb4d8" })
  .add(lights.hemisphere({ skyColor: "#cfe3ff", groundColor: "#4d5a3c", intensity: 0.6 }))
  .add(lights.directional({ name: "sun", position: [8, 12, 6], target: [0, 0, 0], intensity: 2.2 }))
  .add(primitives.plane({ name: "ground", size: [60, 1, 60], material: material.pbr({ color: "#6c7a55", roughness: 0.9 }) }))
  .add(primitives.box({ name: "block-a", size: [3, 3, 3], material: which === "utime" ? clock : material.pbr({ color: "#c9774a", roughness: 0.6 }) }).position(0, 1.5, 0))
  .add(primitives.box({ name: "block-b", size: [2, 5, 2], material: material.pbr({ color: "#d8d2c4", roughness: 0.5 }) }).position(-5, 2.5, -4));

if (which === "fog") {
  s = s.add(effects.volumetricFog({ name: "shafts", density: 0.04, godRayDensity: 1, intensity: 1, color: "#fff1d6", volumetricQuality: "ultra", lightPosition: [8, 12, 6] }));
}
if (which === "water") {
  const rect = [[-30, 6], [30, 6], [30, 30], [-30, 30]] as [number, number][];
  s = s.add(world.water({ id: "lake", name: "lake", kind: "lake", shape: { kind: "polygon", points: rect }, height: 0.05, shallowColor: "#3fa6b8", deepColor: "#0e3f5c", waves: "moderate" }) as never);
}
if (which === "clouds" || which === "clouds0") {
  s = s.add(sky.gradient({ zenith: "#2a5fb0", horizon: "#bcd6f0", clouds: { coverage: 0.8, speed: which === "clouds0" ? 0 : 1 } }));
}

const app = createAuraApp("#app", {
  scene: s.camera(camera.perspective({ position: which.startsWith("clouds") ? [0, 2, 0] : [10, 6, 16], target: which.startsWith("clouds") ? [0, 30, 40] : [0, 2, 0], fov: 55, near: 0.5, far: 400 }))
});
if (forceLoop) app.onFrame(() => undefined);
// No top-level await: a bundled entry chunk that is still evaluating cannot be re-entered by the engine's own
// dynamic imports (TemporalHistory, ShaderLibrary), so `await app.ready()` at module top level can deadlock the mount.
app.ready().then(
  () => { document.body.dataset.aura3dReady ??= "true"; console.log("probe-ready"); },
  (error: unknown) => { document.body.dataset.aura3dReady = "failed"; console.error("probe-failed", String(error), (error as Error)?.stack ?? ""); }
);
