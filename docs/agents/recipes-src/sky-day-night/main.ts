import { camera, createAuraApp, effects, instances, lights, material, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

// Procedural sky + moving sun and moon, with shadows that swing across a small meadow.
// ?hour=17.5 freezes the clock for a capture; without it a full day takes 90 seconds.
const fixedHour = new URLSearchParams(location.search).get("hour");
const DAY_SECONDS = 90;

let seed = 7;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const trunks: AuraTransformSpec[] = [];
const crowns: AuraTransformSpec[] = [];
for (let i = 0; i < 28; i += 1) {
  const a = rand() * Math.PI * 2, r = 14 + rand() * 24, s = 0.8 + rand() * 0.8;
  trunks.push({ position: [Math.cos(a) * r, 0.9 * s, Math.sin(a) * r], scale: [0.35 * s, 1.8 * s, 0.35 * s] });
  crowns.push({ position: [Math.cos(a) * r, 2.9 * s, Math.sin(a) * r], scale: [2.2 * s, 3 * s, 2.2 * s] });
}

const sunDir = (hour: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((hour - 6) / 24) * Math.PI * 2) * 70, // 6h sunrise, 12h noon, 18h sunset
  azimuthDeg: 90 + ((hour - 6) / 12) * 180
});
const lightAt = (elevationDeg: number, azimuthDeg: number, distance = 40): [number, number, number] => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e) * distance, Math.sin(e) * distance, -Math.cos(a) * Math.cos(e) * distance];
};

const hour0 = fixedHour === null ? 15 : Number(fixedHour);
const s0 = sunDir(hour0);
const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 600 } }))
    .add(lights.hemisphere({ skyColor: "#b8d0f0", groundColor: "#35422a", intensity: 1.1 }))
    .add(lights.directional({ name: "sun", position: lightAt(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 4.2, color: "#fff0d0", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: lightAt(-s0.elevationDeg, s0.azimuthDeg + 180), target: [0, 0, 0], intensity: 0.5, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(primitives.plane({ name: "meadow", size: [90, 1, 90], material: material.pbr({ color: "#5d7f3f", roughness: 1 }) }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "crowns", transforms: crowns, material: material.pbr({ color: "#2f6b34", roughness: 0.9 }), params: { radialSegments: 8 } }))
    .add(primitives.box({ name: "hut", material: material.pbr({ color: "#c9b79a", roughness: 0.9 }) }).position(0, 1.1, 0).scale([3.4, 2.2, 3]))
    .add(effects.fog({ color: "#a9c4e0", density: 0.006 }))
    .camera(camera.perspective({ position: [13, 5.5, 15], target: [0, 1.8, 0], fov: 46, near: 0.5, far: 400 }))
});
let clock = 0;
app.onFrame((frame) => {
  clock += frame.dt;
  const hour = fixedHour === null ? (hour0 + (clock / DAY_SECONDS) * 24) % 24 : hour0;
  const s = sunDir(hour);
  app.nodes.require("sun").setPosition(...lightAt(s.elevationDeg, s.azimuthDeg));
  app.nodes.require("moon").setPosition(...lightAt(-s.elevationDeg, s.azimuthDeg + 180));
  if (fixedHour === null) app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
});
void app.ready();
