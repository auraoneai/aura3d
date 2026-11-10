import {
  camera,
  createAuraApp,
  environments,
  geometry,
  groups,
  lights,
  material,
  primitives,
  scene,
  texture
} from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: string };
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------- helpers
let seed = 1337;
const rand = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

/** Fine metallic flake: a tiny random tilt per texel, stored as a tangent-space normal map. */
function flakeNormalMap() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    const flake = rand() < 0.35;
    const amt = flake ? 0.55 : 0.1;
    const a = rand() * Math.PI * 2;
    const t = rand() * amt;
    const nx = Math.cos(a) * t;
    const ny = Math.sin(a) * t;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    data[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = texture.data({ width: size, height: size, data, format: "rgba8", colorSpace: "linear" });
  tex.wrapS = "repeat";
  tex.wrapT = "repeat";
  tex.repeat = [6, 3];
  tex.needsUpdate = true;
  return tex;
}

interface Loft {
  readonly positions: Float32Array;
  readonly indices: number[];
  readonly uvs: Float32Array;
  readonly bounds: { min: [number, number, number]; max: [number, number, number] };
}

/**
 * Smooth lofted body along X. Cross-sections are super-ellipses with per-station
 * half-width / top / bottom, closed by single pole vertices at nose and tail.
 */
function loft(opts: {
  halfLength: number;
  stations: number;
  ring: number;
  width: (s: number, u: number) => number;
  top: (s: number, u: number) => number;
  bottom: (s: number, u: number) => number;
  centerY: number;
  power: number;
}): Loft {
  const { halfLength, stations, ring } = opts;
  const vertCount = (stations - 1) * ring + 2;
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices: number[] = [];
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const put = (vi: number, x: number, y: number, z: number, u: number, v: number): void => {
    positions.set([x, y, z], vi * 3);
    uvs.set([u, v], vi * 2);
    min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z);
    max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z);
  };
  const xAt = (u: number): number => -halfLength * Math.cos(Math.PI * u);
  put(0, xAt(0), opts.centerY, 0, 0, 0.5);
  for (let j = 1; j < stations; j += 1) {
    const u = j / stations;
    const s = Math.sin(Math.PI * u);
    const w = opts.width(s, u);
    const ht = opts.top(s, u);
    const hb = opts.bottom(s, u);
    for (let i = 0; i < ring; i += 1) {
      const phi = (i / ring) * Math.PI * 2;
      const c = Math.cos(phi);
      const sn = Math.sin(phi);
      const e = 2 / opts.power;
      const cz = Math.sign(c) * Math.pow(Math.abs(c), e);
      const sy = Math.sign(sn) * Math.pow(Math.abs(sn), e);
      const y = opts.centerY + (sy >= 0 ? ht : hb) * sy;
      put(1 + (j - 1) * ring + i, xAt(u), y, w * cz, u * 4, i / ring);
    }
  }
  const last = vertCount - 1;
  put(last, xAt(1), opts.centerY, 0, 4, 0.5);
  for (let i = 0; i < ring; i += 1) {
    const n = (i + 1) % ring;
    indices.push(0, 1 + n, 1 + i);
  }
  for (let j = 1; j < stations - 1; j += 1) {
    for (let i = 0; i < ring; i += 1) {
      const n = (i + 1) % ring;
      const a = 1 + (j - 1) * ring + i;
      const b = 1 + (j - 1) * ring + n;
      const c = 1 + j * ring + i;
      const d = 1 + j * ring + n;
      indices.push(a, b, c, b, d, c);
    }
  }
  const base = 1 + (stations - 2) * ring;
  for (let i = 0; i < ring; i += 1) {
    const n = (i + 1) % ring;
    indices.push(last, base + i, base + n);
  }
  return { positions, indices, uvs, bounds: { min, max } };
}

function toGeometry(l: Loft) {
  return geometry.define({
    positions: l.positions,
    normals: geometry.computeNormals({ positions: l.positions, indices: l.indices }),
    indices: l.indices,
    uvs: l.uvs,
    bounds: l.bounds
  });
}

// ---------------------------------------------------------------- shapes
const BODY_Y = 0.4;
const CABIN_X = -0.15;
const CABIN_Y = BODY_Y + 0.3;

const bodyGeo = toGeometry(loft({
  halfLength: 1.4,
  stations: 56,
  ring: 64,
  centerY: BODY_Y,
  power: 2.8,
  width: (s) => 0.7 * Math.pow(s, 0.4),
  top: (s, u) => (0.38 + 0.08 * (1 - u)) * Math.pow(s, 0.5) * (1 - 0.3 * Math.pow(u, 3)),
  bottom: (s) => 0.3 * Math.pow(s, 0.36)
}));

const cabinGeo = toGeometry(loft({
  halfLength: 0.64,
  stations: 40,
  ring: 48,
  centerY: 0,
  power: 2.4,
  width: (s) => 0.5 * Math.pow(s, 0.55),
  top: (s) => 0.34 * Math.pow(s, 0.8),
  bottom: (s) => 0.05 * Math.pow(s, 0.5)
}));

const trimGeo = toGeometry(loft({
  halfLength: 0.66,
  stations: 40,
  ring: 48,
  centerY: 0,
  power: 2.4,
  width: (s) => 0.54 * Math.pow(s, 0.5),
  top: (s) => 0.02 * Math.pow(s, 0.5),
  bottom: (s) => 0.02 * Math.pow(s, 0.5)
}));

const flake = flakeNormalMap();

interface CarMats {
  paint: ReturnType<typeof material.pbr>;
  chrome: ReturnType<typeof material.pbr>;
  glass: ReturnType<typeof material.pbr>;
  rubber: ReturnType<typeof material.pbr>;
  trim: ReturnType<typeof material.pbr>;
}

// Candy red: deep saturated base, metallic flake, glossy clear coat on top.
const realMats: CarMats = {
  paint: material.carPaint({
    color: "#7e0213",
    metallic: 0.5,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    normal: flake,
    normalScale: 0.15,
    envMapIntensity: 0.8
  }),
  chrome: material.pbr({ color: "#f2f4f8", metallic: 1, roughness: 0.04, envMapIntensity: 1.6 }),
  glass: material.pbr({ color: "#04060a", metallic: 0.2, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 0.5 }),
  rubber: material.pbr({ color: "#050506", metallic: 0, roughness: 0.9, envMapIntensity: 0.25 }),
  trim: material.pbr({ color: "#08090b", metallic: 0.3, roughness: 0.35, envMapIntensity: 0.5 })
};

// Dimmer, double-sided set for the faux floor reflection (mirrored copy seen through the glossy floor).
const ghostMats: CarMats = {
  paint: material.pbr({ color: "#7a0610", metallic: 0.3, roughness: 0.3, envMapIntensity: 0.6, doubleSided: true }),
  chrome: material.pbr({ color: "#c8ccd4", metallic: 1, roughness: 0.1, envMapIntensity: 0.8, doubleSided: true }),
  glass: material.pbr({ color: "#04060a", metallic: 0.2, roughness: 0.1, envMapIntensity: 0.6, doubleSided: true }),
  rubber: material.pbr({ color: "#050506", roughness: 0.9, envMapIntensity: 0.2, doubleSided: true }),
  trim: material.pbr({ color: "#08090b", roughness: 0.4, envMapIntensity: 0.3, doubleSided: true })
};

// ---------------------------------------------------------------- car
const WHEEL_R = 0.21;
const WHEEL_Y = 0.21;
const PLATFORM_TOP = 0.02;

function buildCar(name: string, m: CarMats, shadow: boolean) {
  const wheelAt = (x: number, z: number) => {
    const side = z > 0 ? 1 : -1;
    return [
      primitives.cylinder({ name: `${name} tyre ${x} ${z}`, size: [WHEEL_R * 2, 0.2, WHEEL_R * 2], material: m.rubber }).rotation(Math.PI / 2, 0, 0).position(x, WHEEL_Y, z),
      primitives.cylinder({ name: `${name} rim ${x} ${z}`, size: [WHEEL_R * 0.72, 0.2, WHEEL_R * 0.72], material: m.chrome }).rotation(Math.PI / 2, 0, 0).position(x, WHEEL_Y, z + side * 0.012),
      primitives.cylinder({ name: `${name} hub ${x} ${z}`, size: [WHEEL_R * 0.3, 0.2, WHEEL_R * 0.3], material: m.trim }).rotation(Math.PI / 2, 0, 0).position(x, WHEEL_Y, z + side * 0.025)
    ];
  };
  return groups.create(name, [
    geometry.custom(bodyGeo, { name: `${name} body paint`, material: m.paint, castShadow: shadow }),
    geometry.custom(cabinGeo, { name: `${name} cabin glass`, material: m.glass, castShadow: shadow }).position(CABIN_X, CABIN_Y, 0),
    // chrome trim plate hugging the cabin base
    geometry.custom(trimGeo, { name: `${name} cabin chrome trim`, material: m.chrome }).position(CABIN_X, CABIN_Y - 0.1, 0),
    // chrome bumpers and side sills
    primitives.capsule({ name: `${name} front bumper`, size: [0.05, 0.4, 0.05], material: m.chrome }).rotation(Math.PI / 2, 0, 0).position(1.38, 0.34, 0),
    primitives.capsule({ name: `${name} rear bumper`, size: [0.05, 0.4, 0.05], material: m.chrome }).rotation(Math.PI / 2, 0, 0).position(-1.38, 0.34, 0),
    primitives.capsule({ name: `${name} sill L`, size: [0.025, 1.3, 0.025], material: m.chrome }).rotation(0, 0, Math.PI / 2).position(0, 0.3, 0.62),
    primitives.capsule({ name: `${name} sill R`, size: [0.025, 1.3, 0.025], material: m.chrome }).rotation(0, 0, Math.PI / 2).position(0, 0.3, -0.62),
    primitives.sphere({ name: `${name} headlight L`, size: 0.11, material: m.chrome }).position(1.3, BODY_Y - 0.02, 0.34),
    primitives.sphere({ name: `${name} headlight R`, size: 0.11, material: m.chrome }).position(1.3, BODY_Y - 0.02, -0.34),
    ...wheelAt(0.88, 0.43),
    ...wheelAt(0.88, -0.43),
    ...wheelAt(-0.88, 0.43),
    ...wheelAt(-0.88, -0.43)
  ], { position: [0, PLATFORM_TOP, 0] });
}

// ---------------------------------------------------------------- turntable
const RING_R = 2.0;
const ringMat = material.pbr({ color: "#dff0ff", emissive: "#a9d0ff", emissiveIntensity: 1.1, roughness: 0.3 });
const rimMat = material.pbr({ color: "#1b1d22", metallic: 0.9, roughness: 0.15 });
const ringSegments = Array.from({ length: 96 }, (_, i) => {
  const a = (i / 96) * Math.PI * 2;
  const arc = (RING_R * Math.PI * 2) / 96;
  return [
    primitives.box({ name: `rim ${i}`, size: [0.12, 0.05, arc * 1.04], material: rimMat })
      .rotation(0, -a, 0).position(Math.cos(a) * (RING_R + 0.08), 0.025, Math.sin(a) * (RING_R + 0.08)),
    primitives.box({ name: `glow ${i}`, size: [0.05, 0.012, arc * 1.04], material: ringMat })
      .rotation(0, -a, 0).position(Math.cos(a) * (RING_R - 0.01), 0.006, Math.sin(a) * (RING_R - 0.01))
  ];
}).flat();

const tickMat = material.pbr({ color: "#e8f2ff", emissive: "#bcd8ff", emissiveIntensity: 1.6, roughness: 0.4 });
const makeTicks = (prefix: string) => Array.from({ length: 24 }, (_, i) => {
  const a = (i / 24) * Math.PI * 2;
  return primitives.box({ name: `${prefix} tick ${i}`, size: [0.2, 0.008, 0.035], material: tickMat })
    .rotation(0, -a, 0).position(Math.cos(a) * 1.75, 0.004, Math.sin(a) * 1.75);
});

const rotor = groups.create("rotor", [
  buildCar("car", realMats, true),
  groups.create("ticks", makeTicks("real"))
]).runtime({ id: "rotor", mutable: true });

const rotorGhost = groups.create("rotor ghost", [
  buildCar("ghost car", ghostMats, false),
  groups.create("ghost ticks", makeTicks("ghost"))
]).runtime({ id: "rotorGhost", mutable: true });
const reflection = groups.create("floor reflection", [rotorGhost], { scale: [1, -1, 1] });

// ---------------------------------------------------------------- soft-box strips
// Emissive strips are captured into the environment probe, so the clear coat mirrors long soft-box bands.
const stripMat = material.pbr({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 2, roughness: 0.6 });
const coolStripMat = material.pbr({ color: "#cfe0ff", emissive: "#b8d2ff", emissiveIntensity: 3, roughness: 0.6 });
const strip = (name: string, size: [number, number, number], pos: [number, number, number], mat = stripMat) =>
  primitives.box({ name, size, material: mat }).position(...pos);

const sc = scene({ background: "#181a1f" })
  .add(environments.capture({ position: [0, 0.9, 0], resolution: 256, update: "once", include: "all", intensity: 1, diffuseIntensity: 0.25, specularIntensity: 0.75, background: false }))
  .add(lights.ambient({ intensity: 0.04 }))
  .add(lights.key({ position: [-3, 5, 2.5], target: [0, 0.4, 0], intensity: 2.2, color: "#fff4e8" }))
  .add(lights.directional({ name: "cool rim", position: [-2.5, 2.2, -4], target: [0, 0.5, 0], intensity: 2.4, color: "#9cc4ff" }))
  .add(lights.directional({ name: "side fill", position: [4.5, 1.8, -1.5], target: [0, 0.5, 0], intensity: 0.8, color: "#cfe0ff" }))
  // glossy showroom floor, dark and slightly see-through so the mirrored car shows faintly
  .add(primitives.plane({
    name: "glossy floor",
    size: [200, 1, 200],
    material: material.pbr({ color: "#040507", roughness: 0.3, specularIntensity: 0.05, opacity: 0.82, alphaMode: "blend", depthWrite: false, doubleSided: true })
  }))
  .add(reflection)
  .addMany(ringSegments)
  .add(rotor)
  // three long strip lights above and to the sides
  .add(strip("strip top centre", [0.35, 0.06, 5], [0, 4.3, 1]))
  .add(strip("strip top left", [0.3, 0.06, 5], [-2.2, 4.0, 1]))
  .add(strip("strip top right", [0.3, 0.06, 5], [2.2, 4.0, 1]))
  .add(strip("strip side left", [0.08, 0.5, 2.5], [-4.5, 1.4, 5], coolStripMat))
  .add(strip("strip side right", [0.08, 0.5, 5], [4.5, 1.4, -1], coolStripMat))
  .camera(camera.perspective({ position: [3.0, 1.6, 4.0], target: [0, 0.3, 0], fov: 33 }));

const app = createAuraApp("#app", { scene: sc });

// ---------------------------------------------------------------- animation
const SPEED_DEG = 20;
let angleDeg = 0;
let ready = false;
window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: "clearcoat" };

app.onFrame((frame) => {
  angleDeg += frame.dt * SPEED_DEG;
  const rad = (angleDeg * Math.PI) / 180;
  app.nodes.require("rotor").setRotation(0, rad, 0);
  app.nodes.require("rotorGhost").setRotation(0, rad, 0);
  window.__TASK_STATE__ = { turntableAngleDeg: angleDeg, paintFinish: "clearcoat" };
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
});

void app.ready();
