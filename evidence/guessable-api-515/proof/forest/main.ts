// Benchmark b504 task 2 shape (forest of instances): the guesses that failed there were plane size [w, d] and a
// light with castShadow. ?variant=alias uses the three.js spellings; the default uses the canonical Aura3D ones.
import { camera, createAuraApp, effects, environments, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

const alias = new URLSearchParams(location.search).get("variant") === "alias";
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const trees: AuraTransformSpec[] = Array.from({ length: 160 }, () => ({ position: [(rnd() - 0.5) * 20, 0.9, (rnd() - 0.5) * 20] as const, scale: [1, 1.8, 1] as const }));
const colors = trees.map((_, i) => ["#2f6b3a", "#3f8a4a", "#285a34", "#4e9a55"][i % 4]!);

const ground = primitives.plane({ name: "ground", size: alias ? [24, 24] : [24, 1, 24], material: material.pbr({ color: "#3b4a35", roughness: 1 }) });
const sun = alias
  ? lights.directional({ name: "sun", position: [6, 9, 4], target: [0, 0, 0], intensity: 2.6, castShadow: true })
  : lights.directional({ name: "sun", position: [6, 9, 4], target: [0, 0, 0], intensity: 2.6, shadow: true });

const app = createAuraApp("#app", {
  autoStart: false,
  scene: scene({ background: "#bcd0e6" })
    .add(environments.neutral({ intensity: 0.6, background: false }))
    .add(sun)
    .add(ground)
    .add(instances.cone({ name: "canopies", transforms: trees, colors, material: material.pbr({ color: "#ffffff", roughness: 0.9 }) }))
    .add(effects.fog({ color: "#bcd0e6", density: 0.02 }))
    .camera(camera.perspective({ position: [12, 8, 14], target: [0, 1, 0], fov: 45 }))
});
await app.ready();
Object.assign(window, { __PROOF_APP__: app, __PROOF_READY__: true });
