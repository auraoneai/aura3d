import { camera, createAuraApp, effects, environments, lights, material, primitives, scene, sky } from "@aura3d/engine";

type Part = ReturnType<typeof primitives.box>;
type Vec3 = [number, number, number];

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; partCount: number; bandCount: number };
  }
}

// Seeded RNG: the same rocks on every load.
let seed = 424242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();

const parts: Part[] = [];
const add = (p: Part): void => {
  parts.push(p);
};

// ---- Palette / materials ----------------------------------------------------------------------
const mat = (color: string, roughness = 0.85) => material.pbr({ color, roughness });
const RED = mat("#c8312b", 0.6);
const WHITE = mat("#f2f1ec", 0.6);
const DARK = mat("#2b2f36", 0.55);
const IRON = mat("#3a3f47", 0.5);
const GLASS = material.pbr({ color: "#bfe6f5", roughness: 0.05, opacity: 0.25 });
const LAMP = material.pbr({ color: "#fff2b0", emissive: "#ffd86a", emissiveIntensity: 3, roughness: 0.3 });
const LENS = material.pbr({ color: "#ffd98a", emissive: "#ffb43a", emissiveIntensity: 1.5, roughness: 0.2, opacity: 0.85 });
const WINDOW = mat("#16202c", 0.2);
const FRAME = mat("#e9e6dc", 0.7);
const WOOD = mat("#5a3a22", 0.8);

// ---- Geometry constants ---------------------------------------------------------------------------
const GROUND_Y = 0.9; // top of the island
const PLINTH_TOP = 1.6;
const BAND_COUNT = 6;
const BAND_H = 2;
const TOWER_BASE = PLINTH_TOP;
const TOWER_TOP = TOWER_BASE + BAND_COUNT * BAND_H; // 13.6
const R_BASE = 2.2;
const R_TOP = 1.3;
const radiusAt = (y: number): number => R_BASE + ((R_TOP - R_BASE) * (y - TOWER_BASE)) / (TOWER_TOP - TOWER_BASE);

// ---- Sea and island ---------------------------------------------------------------------------------
add(primitives.plane({ name: "sea", size: [700, 1, 700], material: material.pbr({ color: "#1f5f8f", roughness: 0.18 }) }));
add(primitives.cylinder({ name: "shallows", size: [1, 0.06, 1], position: [0, 0.03, 0], params: { radiusTop: 15, radiusBottom: 15, radialSegments: 40 }, material: mat("#5fa6b8", 0.3) }));
add(primitives.cylinder({ name: "island", size: [1, GROUND_Y + 0.6, 1], position: [0, (GROUND_Y - 0.6) / 2, 0], params: { radiusTop: 10.2, radiusBottom: 11.6, radialSegments: 15 }, material: mat("#6f8c4b", 1) }));
add(primitives.cylinder({ name: "sandRing", size: [1, 0.05, 1], position: [0, GROUND_Y + 0.01, 0], params: { radiusTop: 3.6, radiusBottom: 3.6, radialSegments: 24 }, material: mat("#a99a78", 1) }));

// Irregular rocks: rim of the island plus a low outcrop at the tower foot (away from the door side).
const rockMats = ["#6b6d70", "#585b60", "#7a7468", "#4d5054", "#85837c"].map((c) => mat(c, 0.95));
const rockAt = (name: string, x: number, z: number, w: number, h: number, d: number, y: number): void => {
  add(
    primitives.polyhedron({
      name,
      size: [w, h, d],
      position: [x, y, z],
      rotation: [between(-0.4, 0.4), between(0, Math.PI * 2), between(-0.4, 0.4)],
      params: { variant: rand() < 0.5 ? "icosahedron" : "dodecahedron", radius: 0.5, detail: 0 },
      material: rockMats[Math.floor(rand() * rockMats.length)]
    })
  );
};
for (let i = 0; i < 18; i += 1) {
  const a = (i / 18) * Math.PI * 2 + between(-0.12, 0.12);
  const r = between(9.6, 12.2);
  const s = between(1.8, 3.6);
  rockAt(`rimRock${i}`, Math.sin(a) * r, Math.cos(a) * r, s * between(0.9, 1.4), s * between(0.6, 1.1), s * between(0.9, 1.3), s * 0.18);
}
for (let i = 0; i < 7; i += 1) {
  const a = 2.2 + (i / 7) * (Math.PI * 1.5) + between(-0.1, 0.1); // skips the door side (angle ~0.8 rad)
  const r = between(3.0, 4.2);
  const s = between(1.1, 1.9);
  rockAt(`footRock${i}`, Math.sin(a) * r, Math.cos(a) * r, s * 1.2, s * between(0.7, 1.0), s, GROUND_Y + s * 0.12);
}
for (let i = 0; i < 5; i += 1) {
  const a = between(0, Math.PI * 2);
  const r = between(16, 24);
  const s = between(1.2, 2.6);
  rockAt(`seaRock${i}`, Math.sin(a) * r, Math.cos(a) * r, s, s * between(0.7, 1.4), s * 1.1, s * 0.15);
}

// ---- Tower ------------------------------------------------------------------------------------------
add(primitives.cylinder({ name: "plinth", size: [1, PLINTH_TOP - GROUND_Y + 0.2, 1], position: [0, (PLINTH_TOP + GROUND_Y - 0.2) / 2, 0], params: { radiusTop: 2.55, radiusBottom: 2.75, radialSegments: 24 }, material: mat("#8a8d90", 0.9) }));
for (let i = 0; i < BAND_COUNT; i += 1) {
  const y0 = TOWER_BASE + i * BAND_H;
  const y1 = y0 + BAND_H;
  add(
    primitives.cylinder({
      name: `band${i}`,
      size: [1, BAND_H, 1],
      position: [0, (y0 + y1) / 2, 0],
      params: { radiusBottom: radiusAt(y0), radiusTop: radiusAt(y1), radialSegments: 32 },
      material: i % 2 === 0 ? RED : WHITE
    })
  );
}

// Door (faces +x/+z diagonal, angle 0.8 rad) with frame and handle.
const towerFeature = (name: string, angle: number, y: number, size: Vec3, material: ReturnType<typeof mat>, push = 0): void => {
  const r = radiusAt(y) + push;
  add(primitives.box({ name, size, position: [Math.sin(angle) * r, y, Math.cos(angle) * r], rotation: [0, angle, 0], material }));
};
const DOOR_ANGLE = 0.8;
towerFeature("doorFrame", DOOR_ANGLE, TOWER_BASE + 0.9, [1.1, 1.8, 0.12], FRAME, 0.0);
towerFeature("door", DOOR_ANGLE, TOWER_BASE + 0.85, [0.82, 1.65, 0.12], WOOD, 0.06);
towerFeature("doorStep", DOOR_ANGLE, TOWER_BASE + 0.04, [1.3, 0.12, 0.7], mat("#8a8d90", 0.9), 0.25);
{
  const r = radiusAt(TOWER_BASE + 0.85) + 0.15;
  const a = DOOR_ANGLE + 0.12;
  add(primitives.sphere({ name: "doorKnob", size: 0.09, position: [Math.sin(a) * r, TOWER_BASE + 0.85, Math.cos(a) * r], material: mat("#d4b45a", 0.3) }));
}

// Windows spiralling up the tower.
const WINDOW_COUNT = 7;
for (let i = 0; i < WINDOW_COUNT; i += 1) {
  const y = TOWER_BASE + 2.6 + i * 1.5;
  const a = DOOR_ANGLE + 1.0 + i * 1.15;
  towerFeature(`windowFrame${i}`, a, y, [0.52, 0.8, 0.1], FRAME, 0.0);
  towerFeature(`window${i}`, a, y, [0.36, 0.64, 0.1], WINDOW, 0.04);
}

// ---- Gallery and railing ---------------------------------------------------------------------------
const DECK_Y = TOWER_TOP + 0.12;
add(primitives.cylinder({ name: "corbel", size: [1, 0.4, 1], position: [0, TOWER_TOP - 0.18, 0], params: { radiusBottom: 1.5, radiusTop: 2.2, radialSegments: 32 }, material: DARK }));
add(primitives.cylinder({ name: "gallery", size: [1, 0.26, 1], position: [0, DECK_Y, 0], params: { radiusBottom: 2.2, radiusTop: 2.2, radialSegments: 32 }, material: IRON }));
const RAIL_R = 2.0;
const POSTS = 16;
const RAIL_TOP = DECK_Y + 1.05;
for (let i = 0; i < POSTS; i += 1) {
  const a = (i / POSTS) * Math.PI * 2;
  add(primitives.cylinder({ name: `post${i}`, size: [0.07, 1.05, 0.07], position: [Math.sin(a) * RAIL_R, DECK_Y + 0.13 + 0.525, Math.cos(a) * RAIL_R], params: { radialSegments: 6 }, material: DARK }));
  const am = a + Math.PI / POSTS;
  const len = 2 * RAIL_R * Math.sin(Math.PI / POSTS);
  const rm = RAIL_R * Math.cos(Math.PI / POSTS);
  add(primitives.box({ name: `topRail${i}`, size: [len, 0.07, 0.07], position: [Math.sin(am) * rm, RAIL_TOP, Math.cos(am) * rm], rotation: [0, am, 0], material: DARK }));
  add(primitives.box({ name: `midRail${i}`, size: [len, 0.05, 0.05], position: [Math.sin(am) * rm, DECK_Y + 0.55, Math.cos(am) * rm], rotation: [0, am, 0], material: DARK }));
}

// ---- Lantern room ------------------------------------------------------------------------------------
const LANTERN_BASE = DECK_Y + 0.13;
const LANTERN_H = 1.7;
const LANTERN_R = 1.1;
const LANTERN_TOP = LANTERN_BASE + LANTERN_H;
const LAMP_Y = LANTERN_BASE + 0.9;
add(primitives.cylinder({ name: "lanternPlinth", size: [1, 0.2, 1], position: [0, LANTERN_BASE + 0.1, 0], params: { radiusBottom: 1.3, radiusTop: 1.2, radialSegments: 24 }, material: DARK }));
add(primitives.cylinder({ name: "lanternGlass", size: [1, LANTERN_H - 0.2, 1], position: [0, LANTERN_BASE + 0.2 + (LANTERN_H - 0.2) / 2, 0], params: { radiusBottom: LANTERN_R, radiusTop: LANTERN_R, radialSegments: 24 }, material: GLASS, castShadow: false }));
for (let i = 0; i < 8; i += 1) {
  const a = ((i + 0.5) / 8) * Math.PI * 2;
  add(primitives.box({ name: `mullion${i}`, size: [0.07, LANTERN_H - 0.2, 0.07], position: [Math.sin(a) * LANTERN_R, LANTERN_BASE + 0.2 + (LANTERN_H - 0.2) / 2, Math.cos(a) * LANTERN_R], rotation: [0, a, 0], material: DARK }));
}
add(primitives.cylinder({ name: "lampPedestal", size: [0.2, 0.55, 0.2], position: [0, LANTERN_BASE + 0.45, 0], params: { radialSegments: 12 }, material: IRON }));
add(primitives.sphere({ name: "lamp", size: 0.5, position: [0, LAMP_Y, 0], material: LAMP, castShadow: false }));
add(primitives.cylinder({ name: "fresnelLens", size: [0.85, 0.85, 0.85], position: [0, LAMP_Y, 0], params: { radialSegments: 20 }, material: LENS, castShadow: false }));
add(primitives.cylinder({ name: "lanternRim", size: [1, 0.14, 1], position: [0, LANTERN_TOP - 0.07, 0], params: { radiusBottom: 1.2, radiusTop: 1.25, radialSegments: 24 }, material: DARK }));

// ---- Roof and finial -----------------------------------------------------------------------------------
const ROOF_H = 1.2;
add(primitives.cone({ name: "roof", size: [3.0, ROOF_H, 3.0], position: [0, LANTERN_TOP + ROOF_H / 2, 0], params: { radius: 0.5, height: 1, radialSegments: 24 }, material: RED }));
add(primitives.cylinder({ name: "finialRod", size: [0.07, 0.7, 0.07], position: [0, LANTERN_TOP + ROOF_H + 0.3, 0], params: { radialSegments: 8 }, material: IRON }));
add(primitives.sphere({ name: "finialBall", size: 0.28, position: [0, LANTERN_TOP + ROOF_H + 0.3, 0], material: mat("#d4b45a", 0.3) }));
add(primitives.cone({ name: "finialTip", size: [0.14, 0.3, 0.14], position: [0, LANTERN_TOP + ROOF_H + 0.8, 0], params: { radius: 0.5, height: 1, radialSegments: 8 }, material: mat("#d4b45a", 0.3) }));

// ---- Keeper's cottage ----------------------------------------------------------------------------------
const CX = 6.6;
const CZ = 3.4;
const CW = 3.2;
const CH = 2.0;
const WALL = mat("#eadfc6", 0.9);
add(primitives.box({ name: "cottageWalls", size: [CW, CH, CW], position: [CX, GROUND_Y + CH / 2, CZ], material: WALL }));
add(primitives.box({ name: "cottageFoundation", size: [CW + 0.2, 0.25, CW + 0.2], position: [CX, GROUND_Y + 0.12, CZ], material: mat("#7b7e82", 0.95) }));
add(primitives.cone({ name: "cottageRoof", size: [5.0, 1.7, 5.0], position: [CX, GROUND_Y + CH + 0.85, CZ], rotation: [0, Math.PI / 4, 0], params: { radius: 0.5, height: 1, radialSegments: 4 }, material: mat("#7a3b2e", 0.8) }));
add(primitives.box({ name: "chimney", size: [0.5, 1.3, 0.5], position: [CX + 0.7, GROUND_Y + CH + 1.0, CZ - 0.6], material: mat("#8c4f3c", 0.9) }));
add(primitives.box({ name: "cottageDoor", size: [0.12, 1.4, 0.7], position: [CX - CW / 2 - 0.02, GROUND_Y + 0.7, CZ], material: WOOD }));
add(primitives.box({ name: "cottageStep", size: [0.5, 0.12, 1.0], position: [CX - CW / 2 - 0.25, GROUND_Y + 0.06, CZ], material: mat("#8a8d90", 0.9) }));
for (const [name, x, z, w, d] of [
  ["cottageWindowS", CX - 0.7, CZ + CW / 2 + 0.02, 0.7, 0.1],
  ["cottageWindowS2", CX + 0.8, CZ + CW / 2 + 0.02, 0.7, 0.1],
  ["cottageWindowN", CX, CZ - CW / 2 - 0.02, 0.8, 0.1],
  ["cottageWindowE", CX + CW / 2 + 0.02, CZ, 0.1, 0.8]
] as const) {
  add(primitives.box({ name, size: [w, 0.65, d], position: [x, GROUND_Y + 1.25, z], material: WINDOW }));
}

// ---- Lights ---------------------------------------------------------------------------------------------
const SUN: Vec3 = [26, 30, 18];
let stage = scene({ background: "#9ec3e6" })
  .add(sky.gradient({ zenith: "#3d78c2", horizon: "#cfe3f2", ground: "#6f8fa8" }))
  .add(environments.neutral({ intensity: 0.55, background: false }))
  .add(lights.hemisphere({ skyColor: "#cfe3ff", groundColor: "#4d5f55", intensity: 0.55 }))
  .add(
    lights.directional({
      name: "key",
      position: SUN,
      target: [0, 6, 0],
      intensity: 3.4,
      color: "#fff0d6",
      shadow: { mapSize: 2048, fit: { center: [0, 6, 0], extent: 26 } }
    })
  )
  .add(lights.directional({ name: "fill", position: [-22, 10, -14], target: [0, 6, 0], intensity: 1.0, color: "#a9c4ff" }))
  .add(lights.point({ name: "lampLight", position: [0, LAMP_Y, 0], intensity: 12, distance: 9, color: "#ffd98a" }))
  .add(effects.fog({ color: "#cfe3f2", density: 0.004 }));
for (const part of parts) stage = stage.add(part);

stage = stage.camera(
  camera.orbit({
    position: [0, 11.5, 40],
    target: [0, 8, 0],
    fov: 42,
    autoRotate: 0.12
  })
);

const app = createAuraApp("#app", { scene: stage });

await app.ready();
const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));
await nextFrame();
await nextFrame();
window.__EVAL_READY__ = true;
window.__TASK_STATE__ = { ready: true, partCount: parts.length, bandCount: BAND_COUNT };
