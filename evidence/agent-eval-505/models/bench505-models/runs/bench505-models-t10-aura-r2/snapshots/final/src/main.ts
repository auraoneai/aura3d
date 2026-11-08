import { camera, createAuraApp, effects, environments, lights, material, primitives, scene, sky } from "@aura3d/engine";

// Procedural coastal lighthouse: every part is a primitive, no external files.
type Vec3 = [number, number, number];
type SceneNodeInput = Parameters<ReturnType<typeof scene>["addMany"]>[0][number];

const nodes: SceneNodeInput[] = [];
let partCount = 0;
const put = (node: SceneNodeInput): void => {
  nodes.push(node);
  partCount += 1;
};

// Deterministic random numbers so every load builds the same rocks.
let seed = 1337;
const rand = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const range = (a: number, b: number): number => a + (b - a) * rand();

// ---- Materials ------------------------------------------------------------
const paintRed = material.pbr({ color: "#c9281d", roughness: 0.55, metallic: 0 });
const paintWhite = material.pbr({ color: "#f3f0e7", roughness: 0.6, metallic: 0 });
const stone = material.pbr({ color: "#8d9096", roughness: 0.9, metallic: 0 });
const ironDark = material.pbr({ color: "#23272e", roughness: 0.45, metallic: 0.6 });
const roofRed = material.pbr({ color: "#a31f18", roughness: 0.5, metallic: 0.1 });
const windowGlass = material.pbr({ color: "#1c2b3d", roughness: 0.2, metallic: 0.2 });
const doorWood = material.pbr({ color: "#5b3820", roughness: 0.7, metallic: 0 });
const lanternGlass = material.pbr({ color: "#cdeef7", roughness: 0.05, metallic: 0, opacity: 0.28 });
const lampGlow = material.emissive({ color: "#fff2b8", emissive: "#ffd36b", emissiveIntensity: 3 });
const rockColors = ["#7b7f86", "#696d75", "#8a8c8f", "#5d6168", "#74706b"].map((c) =>
  material.pbr({ color: c, roughness: 0.95, metallic: 0 })
);

// ---- Helpers --------------------------------------------------------------
// Unit cylinder: size [1, h, 1] makes the radius params absolute metres.
const frustum = (
  name: string, rBottom: number, rTop: number, h: number, yBottom: number,
  mat: ReturnType<typeof material.pbr>, x = 0, z = 0, segments?: number, castShadow = true
): void => {
  put(primitives.cylinder({
    name, size: [1, h, 1], position: [x, yBottom + h / 2, z],
    params: segments === undefined
      ? { radiusBottom: rBottom, radiusTop: rTop }
      : { radiusBottom: rBottom, radiusTop: rTop, radialSegments: segments },
    material: mat, castShadow
  }));
};

const box = (
  name: string, size: Vec3, position: Vec3, mat: ReturnType<typeof material.pbr>,
  rotation: Vec3 = [0, 0, 0], castShadow = true
): void => {
  put(primitives.box({ name, size, position, rotation, material: mat, castShadow }));
};

// ---- Sea and island ---------------------------------------------------------
put(primitives.plane({
  name: "sea", size: [600, 1, 600], position: [0, 0, 0], castShadow: false,
  material: material.pbr({ color: "#2a6f9e", roughness: 0.12, metallic: 0.1 })
}));
frustum("beach", 8.9, 8.4, 0.35, -0.2, material.pbr({ color: "#d8c690", roughness: 0.95 }), 0, 0, 64, false);
frustum("grass", 7.8, 7.2, 0.35, 0.15, material.pbr({ color: "#5d8a3c", roughness: 0.95 }), 0, 0, 64, false);

// ---- Rocks (irregular, under and around the tower) ---------------------------
const addRock = (name: string, x: number, z: number, w: number, h: number, d: number, angular: boolean): void => {
  const mat = rockColors[Math.floor(rand() * rockColors.length)] ?? stone;
  const rotation: Vec3 = [range(-0.35, 0.35), range(0, Math.PI * 2), range(-0.35, 0.35)];
  const position: Vec3 = [x, 0.5 + h * 0.22, z];
  if (angular) {
    put(primitives.box({ name, size: [w, h, d], position, rotation, material: mat }));
  } else {
    put(primitives.sphere({ name, size: [w, h, d], position, rotation, material: mat, params: { widthSegments: 7, heightSegments: 5 } }));
  }
};

const innerRocks = 11;
for (let i = 0; i < innerRocks; i += 1) {
  const a = (i / innerRocks) * Math.PI * 2 + range(-0.12, 0.12);
  if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI / 2) < 0.4) continue; // keep the doorway side clear (+z is angle pi/2 in x,z)
  const r = range(2.2, 3.2);
  addRock(`base-rock-${i}`, Math.cos(a) * r, Math.sin(a) * r, range(1.3, 2.1), range(1.0, 1.7), range(1.2, 1.9), i % 3 === 0);
}
// Outer rocks on the shore and in the water.
for (let i = 0; i < 8; i += 1) {
  const a = (i / 8) * Math.PI * 2 + range(-0.2, 0.2) + 0.3;
  const r = range(8.3, 9.8);
  const w = range(0.9, 1.8);
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const mat = rockColors[Math.floor(rand() * rockColors.length)] ?? stone;
  put(primitives.sphere({
    name: `shore-rock-${i}`, size: [w, range(0.7, 1.3), range(0.9, 1.6)], position: [x, 0.05, z],
    rotation: [range(-0.3, 0.3), range(0, Math.PI * 2), range(-0.3, 0.3)], material: mat,
    params: { widthSegments: 7, heightSegments: 5 }
  }));
}

// ---- Tower ---------------------------------------------------------------------
const Y0 = 1.2;           // top of the plinth
const BAND_H = 1.5;
const BANDS = 7;
const R_BOTTOM = 1.75;
const R_TOP = 1.2;
const Y_TOP = Y0 + BAND_H * BANDS;
const towerRadius = (y: number): number => R_BOTTOM + ((y - Y0) / (Y_TOP - Y0)) * (R_TOP - R_BOTTOM);

frustum("plinth", 2.3, 2.0, Y0 - 0.5, 0.5, stone, 0, 0, 48);
for (let i = 0; i < BANDS; i += 1) {
  const y = Y0 + i * BAND_H;
  frustum(`band-${i}`, towerRadius(y), towerRadius(y + BAND_H), BAND_H, y, i % 2 === 0 ? paintRed : paintWhite);
}

// Door, frame and step on the +z side.
const doorR = towerRadius(Y0 + 0.7);
box("door-frame", [1.05, 1.5, 0.16], [0, Y0 + 0.75, doorR], stone);
box("door", [0.78, 1.28, 0.2], [0, Y0 + 0.64, doorR + 0.02], doorWood);
put(primitives.sphere({ name: "door-knob", size: 0.09, position: [0.26, Y0 + 0.62, doorR + 0.14], material: ironDark }));
box("door-step", [1.3, 0.2, 0.5], [0, Y0 + 0.1, doorR + 0.3], stone);

// Seven windows spiralling up the tower.
for (let k = 0; k < 7; k += 1) {
  const y = 2.9 + k * 1.3;
  const theta = 0.9 + k * 0.95; // angle measured from +z toward +x
  const r = towerRadius(y);
  const dir: Vec3 = [Math.sin(theta), 0, Math.cos(theta)];
  box(`window-frame-${k}`, [0.42, 0.66, 0.1], [dir[0] * (r - 0.01), y, dir[2] * (r - 0.01)], stone, [0, theta, 0]);
  box(`window-${k}`, [0.28, 0.52, 0.12], [dir[0] * (r + 0.02), y, dir[2] * (r + 0.02)], windowGlass, [0, theta, 0], false);
}

// ---- Gallery balcony with railing ------------------------------------------------
frustum("gallery-corbel", 1.3, 2.05, 0.4, Y_TOP - 0.35, ironDark);
frustum("gallery-floor", 2.2, 2.2, 0.22, Y_TOP + 0.05, ironDark);
const GALLERY_TOP = Y_TOP + 0.27;
const POSTS = 20;
const RAIL_R = 2.08;
const railPoint = (i: number): [number, number] => {
  const a = (i / POSTS) * Math.PI * 2;
  return [Math.sin(a) * RAIL_R, Math.cos(a) * RAIL_R];
};
for (let i = 0; i < POSTS; i += 1) {
  const [x, z] = railPoint(i);
  const [nx, nz] = railPoint(i + 1);
  box(`rail-post-${i}`, [0.07, 0.95, 0.07], [x, GALLERY_TOP + 0.475, z], ironDark);
  const dx = nx - x;
  const dz = nz - z;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx);
  box(`rail-top-${i}`, [len + 0.03, 0.06, 0.06], [(x + nx) / 2, GALLERY_TOP + 0.95, (z + nz) / 2], ironDark, [0, yaw, 0]);
  box(`rail-mid-${i}`, [len + 0.03, 0.04, 0.04], [(x + nx) / 2, GALLERY_TOP + 0.5, (z + nz) / 2], ironDark, [0, yaw, 0]);
}

// ---- Lantern room -------------------------------------------------------------------
const LANTERN_H = 1.25;
const LANTERN_R = 1.0;
frustum("lantern-base", 1.15, 1.15, 0.2, GALLERY_TOP, ironDark);
const lanternY = GALLERY_TOP + 0.2;
put(primitives.cylinder({
  name: "lantern-glass", size: [LANTERN_R * 2, LANTERN_H, LANTERN_R * 2],
  position: [0, lanternY + LANTERN_H / 2, 0], material: lanternGlass, castShadow: false
}));
for (let i = 0; i < 8; i += 1) {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
  box(`mullion-${i}`, [0.07, LANTERN_H, 0.07], [Math.sin(a) * LANTERN_R, lanternY + LANTERN_H / 2, Math.cos(a) * LANTERN_R], ironDark, [0, a, 0]);
}
// The lamp: pedestal, emissive bulb and a warm lens ring.
frustum("lamp-pedestal", 0.3, 0.22, 0.35, lanternY, ironDark);
put(primitives.sphere({ name: "lamp-bulb", size: 0.55, position: [0, lanternY + 0.7, 0], material: lampGlow, castShadow: false }));
put(primitives.cylinder({
  name: "lamp-lens", size: [0.75, 0.2, 0.75], position: [0, lanternY + 0.7, 0],
  material: material.emissive({ color: "#ffe9a8", emissive: "#ffc94d", emissiveIntensity: 1.5, opacity: 0.6 }), castShadow: false
}));
const lanternTop = lanternY + LANTERN_H;
frustum("lantern-ring", 1.15, 1.15, 0.16, lanternTop, ironDark);

// ---- Roof and finial -----------------------------------------------------------------
frustum("roof", 1.4, 0, 1.05, lanternTop + 0.16, roofRed);
put(primitives.sphere({ name: "finial-ball", size: 0.24, position: [0, lanternTop + 1.28, 0], material: ironDark }));
frustum("finial-spike", 0.06, 0, 0.55, lanternTop + 1.3, ironDark);

// ---- Keeper's cottage -----------------------------------------------------------------
const CX = 4.6;
const CZ = 0.6;
const CW = 3.2;
const CH = 1.9;
const cream = material.pbr({ color: "#e9e0cb", roughness: 0.85 });
const brick = material.pbr({ color: "#8a4a38", roughness: 0.9 });
box("cottage-body", [CW, CH, CW], [CX, 0.5 + CH / 2, CZ], cream);
put(primitives.cylinder({
  name: "cottage-roof", size: [(CW + 0.5) / 0.7071, 1.25, (CW + 0.5) / 0.7071],
  position: [CX, 0.5 + CH + 0.625, CZ], rotation: [0, Math.PI / 4, 0],
  params: { radialSegments: 4, radiusBottom: 0.5, radiusTop: 0 }, material: roofRed
}));
box("cottage-chimney", [0.42, 1.1, 0.42], [CX + 0.9, 0.5 + CH + 0.75, CZ - 0.5], brick);
const cz = CZ + CW / 2;
const cx = CX + CW / 2;
box("cottage-door", [0.72, 1.2, 0.1], [CX - 0.7, 0.5 + 0.6, cz + 0.02], doorWood);
box("cottage-window-front", [0.7, 0.6, 0.1], [CX + 0.7, 1.6, cz + 0.02], windowGlass, [0, 0, 0], false);
box("cottage-window-front-frame", [0.86, 0.76, 0.08], [CX + 0.7, 1.6, cz - 0.01], paintWhite);
box("cottage-window-side", [0.1, 0.6, 0.7], [cx + 0.02, 1.6, CZ], windowGlass, [0, 0, 0], false);
box("cottage-window-side-frame", [0.08, 0.76, 0.86], [cx - 0.01, 1.6, CZ], paintWhite);
box("cottage-window-back", [0.7, 0.6, 0.1], [CX, 1.6, CZ - CW / 2 - 0.02], windowGlass, [0, 0, 0], false);
box("cottage-step", [1.0, 0.14, 0.4], [CX - 0.7, 0.57, cz + 0.2], stone);

// ---- Scene -----------------------------------------------------------------------------
const CAMERA_TARGET: Vec3 = [0.5, 6.6, 0];

const app = createAuraApp("#app", {
  scene: scene({ background: "#9fc4e8" })
    .add(sky.preetham({ sun: { elevationDeg: 38, azimuthDeg: 135, intensity: 1 } }))
    .add(environments.neutral({ intensity: 0.35, background: false }))
    .add(lights.hemisphere({ skyColor: "#cfe3ff", groundColor: "#5a6a58", intensity: 0.5 }))
    .add(lights.directional({
      name: "key", position: [16, 22, 14], target: [0, 5, 0], intensity: 2.8, color: "#fff0d6",
      shadow: { mapSize: 2048, filter: "pcf", fit: { center: [0, 6, 0], extent: 14 } }
    }))
    .add(lights.directional({ name: "fill", position: [-14, 8, -10], target: [0, 5, 0], intensity: 0.7, color: "#a9c8ff" }))
    .add(lights.point({ name: "lamp-light", position: [0, lanternY + 0.7, 0], intensity: 10, distance: 9, color: "#ffd48a" }))
    .addMany(nodes)
    .add(effects.fog({ color: "#bcd5ea", density: 0.004 }))
    .camera(camera.orbit({
      position: [0, 11, 31], target: CAMERA_TARGET, fov: 40, near: 0.5, far: 600, autoRotate: 0.1
    }))
});

await app.ready();

const globals = window as unknown as Record<string, unknown>;
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    globals.__TASK_STATE__ = { ready: true, partCount, bandCount: BANDS };
    globals.__EVAL_READY__ = true;
  });
});
