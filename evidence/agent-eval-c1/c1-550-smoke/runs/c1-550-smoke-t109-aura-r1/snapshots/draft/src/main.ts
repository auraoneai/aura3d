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
  surfaces,
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
    // Most texels are near flat; ~35% carry a sparkling tilted flake.
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
const BODY_Y = 0.62;

const bodyLoft = loft({
  halfLength: 1.4,
  stations: 56,
  ring: 64,
  centerY: BODY_Y,
  power: 2.7,
  width: (s) => 0.62 * Math.pow(s, 0.42),
  top: (s, u) => (0.3 + 0.07 * (1 - u)) * Math.pow(s, 0.5) * (1 - 0.28 * Math.pow(u, 3)),
  bottom: (s) => 0.25 * Math.pow(s, 0.38)
});

const cabinLoft = loft({
  halfLength: 0.62,
  stations: 40,
  ring: 48,
  centerY: 0,
  power: 2.4,
  width: (s) => 0.5 * Math.pow(s, 0.55),
  top: (s) => 0.3 * Math.pow(s, 0.8),
  bottom: (s) => 0.06 * Math.pow(s, 0.5)
});

const flake = flakeNormalMap();

// Candy red: deep saturated base, metallic flake, glossy clear coat on top.
const candyPaint = material.carPaint({
  color: "#a60a16",
  metallic: 0.62,
  roughness: 0.3,
  clearcoat: 1,
  clearcoatRoughness: 0.025,
  normal: flake,
  normalScale: 0.9,
  envMapIntensity: 1.5,
  sheen: 0.25,
  sheenColor: "#ff4a50",
  sheenRoughness: 0.4
});

const chrome = material.pbr({ color: "#f2f4f8", metallic: 1, roughness: 0.04, envMapIntensity: 1.6 });
const glass = material.pbr({ color: "#05070a", metallic: 0.2, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 1.4 });
const rubber = material.pbr({ color: "#0b0b0d", metallic: 0, roughness: 0.85 });
const darkTrim = material.pbr({ color: "#08090b", metallic: 0.3, roughness: 0.35 });

// ---------------------------------------------------------------- car
const WHEEL_R = 0.3;
const WHEEL_Y = 0.3;
const wheelAt = (x: number, z: number) => {
  const side = z > 0 ? 1 : -1;
  return [
    primitives.cylinder({ name: `tyre ${x} ${z}`, size: [WHEEL_R * 2, 0.22, WHEEL_R * 2], material: rubber }).rotation(Math.PI / 2, 0, 0).position(x, WHEEL_Y, z),
    primitives.cylinder({ name: `rim ${x} ${z}`, size: [WHEEL_R * 1.2, 0.235, WHEEL_R * 1.2], material: chrome }).rotation(Math.PI / 2, 0, 0).position(x, WHEEL_Y, z + side * 0.004),
    primitives.cylinder({ name: `hub ${x} ${z}`, size: [WHEEL_R * 0.5, 0.25, WHEEL_R * 0.5], material: darkTrim }).rotation(Math.PI / 2, 0, 0).position(x, WHEEL_Y, z + side * 0.005)
  ];
};

const car = groups.create("car", [
  geometry.custom(toGeometry(bodyLoft), { name: "body paint", material: candyPaint, castShadow: true }),
  geometry.custom(toGeometry(cabinLoft), { name: "cabin glass", material: glass, castShadow: true }).position(-0.12, BODY_Y + 0.17, 0),
  // chrome belt-line ring hugging the cabin base
  primitives.torus({ name: "cabin chrome ring", size: [1.0, 0.12, 0.98], material: chrome }).rotation(Math.PI / 2, 0, 0).position(-0.12, BODY_Y + 0.2, 0),
  // chrome bumpers and grille strip
  primitives.capsule({ name: "front bumper", size: [0.05, 0.62, 0.05], material: chrome }).rotation(Math.PI / 2, 0, 0).position(1.37, 0.4, 0),
  primitives.capsule({ name: "rear bumper", size: [0.05, 0.62, 0.05], material: chrome }).rotation(Math.PI / 2, 0, 0).position(-1.37, 0.4, 0),
  primitives.capsule({ name: "side sill L", size: [0.025, 1.3, 0.025], material: chrome }).rotation(0, 0, Math.PI / 2).position(0, 0.4, 0.595),
  primitives.capsule({ name: "side sill R", size: [0.025, 1.3, 0.025], material: chrome }).rotation(0, 0, Math.PI / 2).position(0, 0.4, -0.595),
  primitives.sphere({ name: "headlight L", size: 0.11, material: chrome }).position(1.3, 0.62, 0.36),
  primitives.sphere({ name: "headlight R", size: 0.11, material: chrome }).position(1.3, 0.62, -0.36),
  ...wheelAt(0.88, 0.62),
  ...wheelAt(0.88, -0.62),
  ...wheelAt(-0.88, 0.62),
  ...wheelAt(-0.88, -0.62)
]);

// ---------------------------------------------------------------- turntable
const PLATFORM_TOP = 0.14;
const tickLights = Array.from({ length: 24 }, (_, i) => {
  const a = (i / 24) * Math.PI * 2;
  return primitives.box({
    name: `tick ${i}`,
    size: [0.22, 0.02, 0.05],
    material: material.pbr({ color: "#e8f2ff", emissive: "#bcd8ff", emissiveIntensity: 2.2, roughness: 0.4 })
  }).rotation(0, -a, 0).position(Math.cos(a) * 2.2, 0.0, Math.sin(a) * 2.2);
});

const rotor = groups.create("rotor", [
  groups.create("car lift", [car], { position: [0, PLATFORM_TOP, 0] }),
  groups.create("ticks", tickLights, { position: [0, PLATFORM_TOP, 0] })
]).runtime({ id: "rotor", mutable: true });

// ---------------------------------------------------------------- strip lights (seen in the floor mirror)
const stripMat = material.pbr({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 5, roughness: 0.6 });
const strip = (name: string, size: [number, number, number], pos: [number, number, number], rotY = 0) =>
  primitives.box({ name, size, material: stripMat }).position(...pos).rotation(0, rotY, 0);

const sc = scene({ background: "#050608" })
  .add(environments.studio({ preset: "softbox", intensity: 1.0, background: false }))
  .add(lights.ambient({ intensity: 0.05 }))
  .add(lights.key({ position: [-3, 5, 2.5], target: [0, 0.4, 0], intensity: 2.2, color: "#fff4e8" }))
  .add(lights.directional({ name: "cool rim", position: [-2.5, 2.2, -4], target: [0, 0.5, 0], intensity: 2.4, color: "#9cc4ff" }))
  .add(lights.directional({ name: "side strip fill", position: [4.5, 1.8, -1.5], target: [0, 0.5, 0], intensity: 1.0, color: "#cfe0ff" }))
  // showroom floor
  .add(primitives.plane({ name: "showroom floor", size: [60, 1, 60], material: material.pbr({ color: "#0a0b0e", roughness: 0.7 }) }))
  // platform
  .add(primitives.cylinder({ name: "turntable", size: [4.9, PLATFORM_TOP, 4.9], material: material.pbr({ color: "#15171c", metallic: 0.6, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05 }) }).position(0, PLATFORM_TOP / 2, 0))
  .add(primitives.torus({ name: "ring light", size: [4.55, 0.07, 4.55], material: material.pbr({ color: "#dff0ff", emissive: "#a9d0ff", emissiveIntensity: 2.6, roughness: 0.3 }) }).rotation(Math.PI / 2, 0, 0).position(0, PLATFORM_TOP + 0.01, 0))
  .add(surfaces.mirror({ name: "platform mirror", size: [3.1, 3.1], position: [0, PLATFORM_TOP + 0.003, 0], resolution: 512, tint: "#5a5e68" }))
  .add(rotor)
  // overhead / side soft-box strips
  .add(strip("strip top centre", [0.3, 0.05, 6], [0, 3.6, 0]))
  .add(strip("strip top left", [0.25, 0.05, 6], [-1.8, 3.4, 0]))
  .add(strip("strip top right", [0.25, 0.05, 6], [1.8, 3.4, 0]))
  .camera(camera.perspective({ position: [4.2, 1.55, 5.4], target: [0, 0.5, 0], fov: 33 }));

const app = createAuraApp("#app", { scene: sc });

// ---------------------------------------------------------------- animation
const SPEED_DEG = 20;
let angleDeg = 0;
let ready = false;
window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: "clearcoat" };

app.onFrame((frame) => {
  angleDeg += frame.dt * SPEED_DEG;
  app.nodes.require("rotor").setRotation(0, (angleDeg * Math.PI) / 180, 0);
  window.__TASK_STATE__ = { turntableAngleDeg: angleDeg, paintFinish: "clearcoat" };
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
});

void app.ready();
