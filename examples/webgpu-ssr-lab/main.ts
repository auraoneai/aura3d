import { camera, createAuraApp, effects, environments, lights, material, primitives, scene } from "@aura3d/engine";
import { labAppOptions, readLabFlags } from "../shared/lab-flags";

/**
 * W3 isolated proof: one glossy floor under three bright blocks with screen-space reflections, static camera.
 * `?backend=webgpu` runs the native WGSL SSR pass (falls back to WebGL2 with BACKEND_FALLBACK when the device lacks
 * sampleable depth); the default is the WebGL2 v2 S3 stage. `?ssr=0` removes the SSR node for an A/B frame.
 */
const params = new URLSearchParams(location.search);
const withSsr = params.get("ssr") !== "0";
const lab = labAppOptions(readLabFlags());

const s = scene()
  .add(environments.neutral({ intensity: 0.5, background: false }))
  .add(lights.directional({ position: [4, 8, 3], target: [0, 0, 0], intensity: 2.5, shadow: false }))
  .add(primitives.plane({ name: "floor", size: [40, 1, 40], material: material.pbr({ color: "#1a1d24", roughness: 0.15, metalness: 0 }) }))
  .add(primitives.box({ name: "red", size: [1.4, 2.4, 1.4], material: material.pbr({ color: "#ff3a2a", emissive: "#ff3a2a", emissiveIntensity: 0.6, roughness: 0.5 }) }).position(-2.2, 1.2, -1))
  .add(primitives.box({ name: "green", size: [1.2, 1.6, 1.2], material: material.pbr({ color: "#39d353", emissive: "#39d353", emissiveIntensity: 0.6, roughness: 0.5 }) }).position(0.2, 0.8, -2.5))
  .add(primitives.sphere({ name: "blue", size: 1.6, material: material.pbr({ color: "#2f7bff", emissive: "#2f7bff", emissiveIntensity: 0.6, roughness: 0.4 }) }).position(2.3, 0.8, -0.6));
if (withSsr) s.add(effects.screenSpaceReflections({ name: "lab ssr", intensity: 1.2, maxDistance: 14, roughness: 0.1, thickness: 0.4 }));
s.camera(camera.perspective({ position: [0, 2.2, 7.5], target: [0, 0.6, -1], fov: 45 }));

const app = createAuraApp("#app", {
  scene: s,
  renderer: { quality: { tier: "high" }, ...(lab.renderer ?? {}) }
});
await app.ready();
document.body.dataset.aura3dReady = "true";
