import { camera, createAuraApp, effects, environments, group, instances, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: string };
    __EVAL_READY__?: boolean;
  }
}

type Vec3 = [number, number, number];

// ---------------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------------
// Candy-red base coat with a glossy clear coat on top. The metallic flakes are a separate instanced layer (below).
const paint = material.physical({
  color: "#a80510",
  metallic: 0.55,
  roughness: 0.3,
  clearcoat: 1,
  clearcoatRoughness: 0.03
});
const flakeMat = material.physical({ color: "#ffffff", metallic: 1, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.03 });
const glass = material.physical({ color: "#04060a", metallic: 0.35, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 });
const chrome = material.pbr({ color: "#f4f6fa", metallic: 1, roughness: 0.05 });
const rubber = material.pbr({ color: "#0b0b0d", metallic: 0, roughness: 0.82 });
const tailLight = material.emissive({ color: "#ff1a1a", emissive: "#ff2a1a", emissiveIntensity: 2 });
const platformMat = material.physical({ color: "#0b0c10", metallic: 0.85, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05 });
const ringGlow = material.emissive({ color: "#9fd2ff", emissive: "#6fb4ff", emissiveIntensity: 2.2 });

// ---------------------------------------------------------------------------------------------
// Body layout (the car points along +z, platform top is y = 0)
// ---------------------------------------------------------------------------------------------
const BODY_CENTER: Vec3 = [0, 0.78, 0];
const BODY_AXES: Vec3 = [0.85, 0.4, 1.9]; // semi-axes of the body ellipsoid

let seed = 20240611;
const rand = (): number => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Metallic flakes: small bright specks scattered just above the body surface.
const flakeTransforms: { position: Vec3; scale: Vec3 }[] = [];
const flakeColors: string[] = [];
const flakePalette = ["#ff6a55", "#ffb08a", "#ff3a3a", "#ffd8b8", "#ff8f6a"];
while (flakeTransforms.length < 1100) {
  const u = rand() * 2 - 1;
  const phi = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  const dx = r * Math.cos(phi);
  const dy = u;
  const dz = r * Math.sin(phi);
  if (dy < -0.35) continue; // keep the flakes on the visible upper shell
  const k = 1.006;
  const size = 0.018 + rand() * 0.016;
  flakeTransforms.push({
    position: [
      BODY_CENTER[0] + dx * BODY_AXES[0] * k,
      BODY_CENTER[1] + dy * BODY_AXES[1] * k,
      BODY_CENTER[2] + dz * BODY_AXES[2] * k
    ],
    scale: [size, size, size]
  });
  flakeColors.push(flakePalette[Math.floor(rand() * flakePalette.length)] ?? "#ff6a55");
}

// Chrome belt trim: a chain of small beads that follows the widest ellipse of the body.
const beltTransforms: { position: Vec3; scale: Vec3 }[] = [];
const BELT_COUNT = 220;
for (let i = 0; i < BELT_COUNT; i += 1) {
  const a = (i / BELT_COUNT) * Math.PI * 2;
  beltTransforms.push({
    position: [Math.cos(a) * BODY_AXES[0] * 1.004, BODY_CENTER[1] + 0.02, Math.sin(a) * BODY_AXES[2] * 1.004],
    scale: [0.055, 0.055, 0.055]
  });
}

// Studs on the turntable top so the rotation reads clearly.
const studTransforms: { position: Vec3; scale: Vec3 }[] = [];
for (let i = 0; i < 24; i += 1) {
  const a = (i / 24) * Math.PI * 2;
  studTransforms.push({ position: [Math.cos(a) * 2.7, 0.012, Math.sin(a) * 2.7], scale: [0.14, 0.035, 0.14] });
}

const wheel = (name: string, x: number, z: number) => {
  const side = x < 0 ? -1 : 1;
  return group(name, [
    primitives.cylinder({ name: `${name}-tire`, size: [0.76, 0.3, 0.76], material: rubber }).rotate(0, 0, Math.PI / 2),
    primitives
      .cylinder({ name: `${name}-hub`, size: [0.42, 0.05, 0.42], material: chrome })
      .position(side * 0.16, 0, 0)
      .rotate(0, 0, Math.PI / 2),
    primitives
      .cylinder({ name: `${name}-cap`, size: [0.12, 0.07, 0.12], material: rubber })
      .position(side * 0.17, 0, 0)
      .rotate(0, 0, Math.PI / 2)
  ], { position: [x, 0.38, z] });
};

const car = group("car", [
  // Main body, cabin glass and roof panel
  primitives.sphere({ name: "body", size: [BODY_AXES[0] * 2, BODY_AXES[1] * 2, BODY_AXES[2] * 2], material: paint }).position(...BODY_CENTER),
  primitives.sphere({ name: "cabin-glass", size: [1.2, 0.8, 2.1], material: glass, castShadow: false }).position(0, 1.1, -0.1),
  primitives.sphere({ name: "roof", size: [1.0, 0.2, 1.5], material: paint }).position(0, 1.5, -0.1),
  // Flake layer
  instances.sphere({ name: "flakes", size: 1, transforms: flakeTransforms, colors: flakeColors, material: flakeMat, castShadow: false }),
  // Chrome trim
  instances.sphere({ name: "belt-trim", size: 1, transforms: beltTransforms, material: chrome, castShadow: false }),
  primitives.sphere({ name: "headlight-l", size: [0.3, 0.15, 0.2], material: chrome }).position(-0.4, 0.86, 1.6),
  primitives.sphere({ name: "headlight-r", size: [0.3, 0.15, 0.2], material: chrome }).position(0.4, 0.86, 1.6),
  primitives.sphere({ name: "taillight-l", size: [0.3, 0.1, 0.16], material: tailLight, castShadow: false }).position(-0.4, 0.86, -1.62),
  primitives.sphere({ name: "taillight-r", size: [0.3, 0.1, 0.16], material: tailLight, castShadow: false }).position(0.4, 0.86, -1.62),
  primitives.sphere({ name: "front-bumper", size: [0.9, 0.07, 0.12], material: chrome }).position(0, 0.55, 1.78),
  primitives.sphere({ name: "rear-bumper", size: [0.9, 0.07, 0.12], material: chrome }).position(0, 0.55, -1.78),
  // Wheels
  wheel("wheel-fl", -0.82, 1.2),
  wheel("wheel-fr", 0.82, 1.2),
  wheel("wheel-rl", -0.82, -1.2),
  wheel("wheel-rr", 0.82, -1.2)
]);

const turntable = group("turntable", [
  primitives.cylinder({ name: "platform", size: [6, 0.2, 6], material: platformMat }).position(0, -0.1, 0),
  primitives.cylinder({ name: "platform-edge", size: [6.02, 0.03, 6.02], material: chrome, castShadow: false }).position(0, -0.005, 0),
  instances.sphere({ name: "studs", size: 1, transforms: studTransforms, material: chrome, castShadow: false }),
  car
]).runtime({ id: "turntable", mutable: true });

const stage = scene({ background: "#040508" })
  .add(environments.studio({ intensity: 0.85, background: false }))
  // Key light with shadow, two long soft-box strips (sides) and one overhead strip
  .add(lights.directional({ name: "key", position: [3, 7, 4], target: [0, 0.6, 0], intensity: 1.4, color: "#fff2e4", shadow: true }))
  .add(lights.softbox({ name: "strip-left", position: [-5, 4.5, 1], target: [0, 0.8, 0], width: 0.7, height: 7, intensity: 6, color: "#ffffff" }))
  .add(lights.softbox({ name: "strip-right", position: [5, 4.5, -1], target: [0, 0.8, 0], width: 0.7, height: 7, intensity: 6, color: "#f4f8ff" }))
  .add(lights.softbox({ name: "strip-top", position: [0, 6.5, 0], target: [0, 0.8, 0], width: 0.8, height: 8, intensity: 5, color: "#ffffff" }))
  // Faint cool rim from behind
  .add(lights.directional({ name: "rim", position: [-2, 3, -6], target: [0, 0.8, 0], intensity: 1.6, color: "#6fa8ff" }))
  // Showroom floor and ring light under the platform lip
  .add(primitives.cylinder({ name: "showroom-floor", size: [40, 0.1, 40], material: material.pbr({ color: "#07080b", roughness: 0.85 }), castShadow: false }).position(0, -0.25, 0))
  .add(primitives.cylinder({ name: "ring-light", size: [6.5, 0.05, 6.5], material: ringGlow, castShadow: false }).position(0, -0.17, 0))
  .add(turntable)
  .add(effects.bloom({ intensity: 0.3, threshold: 0.85, radius: 0.5 }))
  .camera(camera.perspective({ position: [4.8, 1.7, 7.4], target: [0, 0.75, 0], fov: 34 }));

const app = createAuraApp("#app", { scene: stage });

const TURN_RATE_DEG_PER_SEC = 20;
const startMs = performance.now();
window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: "clearcoat" };

app.onFrame(() => {
  const angleDeg = ((performance.now() - startMs) / 1000) * TURN_RATE_DEG_PER_SEC;
  app.nodes.require("turntable").setRotation(0, (angleDeg * Math.PI) / 180, 0);
  window.__TASK_STATE__ = { turntableAngleDeg: angleDeg, paintFinish: "clearcoat" };
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
