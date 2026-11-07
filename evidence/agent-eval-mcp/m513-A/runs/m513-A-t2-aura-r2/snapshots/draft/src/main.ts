import { camera, createAuraApp, effects, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

let sc = scene({ background: "#b4c8d8" })
  .camera(camera.orbit({ position: [0, 85, 130], target: [0, 2, 0], fov: 45, near: 20, far: 450, autoRotate: 0.12 }))
  .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1.1 }))
  .add(lights.directional({ position: [90, 130, 60], target: [0, 0, 0], intensity: 3, shadow: true }))
  .add(effects.fog({ color: "#b4c8d8", density: 0.0045 }))
  .add(primitives.plane({ name: "ground", size: [260, 1, 260], material: material.pbr({ color: "#5e7a3e", roughness: 1 }) }));

let seed = 12345;
const rand = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const trunks: AuraTransformSpec[] = [];
const canopies: AuraTransformSpec[] = [];
const rocks: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
const rockColors: string[] = [];
const spot = (): [number, number] => {
  const a = rand() * Math.PI * 2;
  const r = 75 * Math.sqrt(rand());
  return [Math.cos(a) * r, Math.sin(a) * r];
};
for (let i = 0; i < 8000; i += 1) {
  const [x, z] = spot();
  const s = 0.8 + rand() * 0.8;
  trunks.push({ position: [x, 0.8 * s, z], scale: [0.34 * s, 1.6 * s, 0.34 * s] });
  canopies.push({ position: [x, 1.3 * s + 2, z], scale: [2.4 * s, 4 * s, 2.4 * s] });
  canopyColors.push(`hsl(${100 + Math.floor(rand() * 40)}, 55%, ${25 + Math.floor(rand() * 15)}%)`);
}
for (let i = 0; i < 2000; i += 1) {
  const [x, z] = spot();
  const s = 0.4 + rand() * 0.8;
  rocks.push({ position: [x, 0.25 * s, z], rotation: [0, rand() * 6, 0], scale: [s, s * 0.7, s] });
  rockColors.push(`hsl(30, 6%, ${35 + Math.floor(rand() * 25)}%)`);
}
const white = material.pbr({ color: "#ffffff", roughness: 0.9 });
sc = sc
  .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24" }), params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 8 } }))
  .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white }));

const app = createAuraApp("#app", { scene: sc });
app.onFrame(() => {
  // camera orbit is driven by autoRotate
});
await app.ready();
window.__EVAL_READY__ = true;
