import {
  camera,
  createAuraApp,
  effects,
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

type V3 = [number, number, number];

declare global {
  interface Window {
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: string };
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------- mesh helpers

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

interface GridVertex {
  p: V3;
  n: V3;
  uv: [number, number];
}

/** Build an indexed mesh from a (S+1) x (R+1) vertex grid; winding is chosen so triangles face along the normals. */
function gridMesh(grid: GridVertex[][]) {
  const S = grid.length - 1;
  const R = grid[0]!.length - 1;
  const positions = new Float32Array((S + 1) * (R + 1) * 3);
  const normals = new Float32Array((S + 1) * (R + 1) * 3);
  const uvs = new Float32Array((S + 1) * (R + 1) * 2);
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let j = 0; j <= S; j += 1) {
    for (let i = 0; i <= R; i += 1) {
      const g = grid[j]![i]!;
      const k = j * (R + 1) + i;
      positions.set(g.p, k * 3);
      normals.set(g.n, k * 3);
      uvs.set(g.uv, k * 2);
      for (let c = 0; c < 3; c += 1) {
        min[c] = Math.min(min[c]!, g.p[c]!);
        max[c] = Math.max(max[c]!, g.p[c]!);
      }
    }
  }
  // Pick the winding from a well-formed quad in the middle of the grid.
  const jm = Math.floor(S / 2);
  const a = grid[jm]![0]!;
  const b = grid[jm]![1]!;
  const c = grid[jm + 1]![0]!;
  const faceN = cross(sub(b.p, a.p), sub(c.p, a.p));
  const flip = dot(faceN, a.n) < 0;
  const indices: number[] = [];
  for (let j = 0; j < S; j += 1) {
    for (let i = 0; i < R; i += 1) {
      const v00 = j * (R + 1) + i;
      const v10 = v00 + 1;
      const v01 = v00 + (R + 1);
      const v11 = v01 + 1;
      if (!flip) indices.push(v00, v10, v01, v10, v11, v01);
      else indices.push(v00, v01, v10, v10, v01, v11);
    }
  }
  return geometry.define({ positions, normals, uvs, indices, bounds: { min, max } });
}

interface BodyShape {
  L: number; // half length (x)
  W: number; // half width (z)
  Ht: number; // height above centre line
  Hb: number; // depth below centre line
  nose: number; // front-end lowering of the upper surface (0..1)
  tail: number; // rear-end lowering of the upper surface (0..1)
  edge: number; // superellipse exponent of the cross section
  lenP: number; // length superellipse exponent
  uvScale: number;
}

const sgnPow = (x: number, e: number) => Math.sign(x) * Math.pow(Math.abs(x), e);

function bodyPoint(s: BodyShape, u: number, v: number): V3 {
  const cx = Math.cos(u); // -1 (rear) .. 1 (front)
  const prof = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(cx), s.lenP)));
  const cv = sgnPow(Math.cos(v), 2 / s.edge);
  const sv = sgnPow(Math.sin(v), 2 / s.edge);
  let h = sv > 0 ? s.Ht : s.Hb;
  if (sv > 0) h *= 1 - (cx > 0 ? s.nose * cx * cx : s.tail * cx * cx);
  return [s.L * cx, h * prof * sv, s.W * prof * cv];
}

function bodyMesh(s: BodyShape, S = 96, R = 96) {
  const grid: GridVertex[][] = [];
  const eps = 1e-3;
  for (let j = 0; j <= S; j += 1) {
    const u = (j / S) * Math.PI;
    const row: GridVertex[] = [];
    for (let i = 0; i <= R; i += 1) {
      const v = (i / R) * Math.PI * 2;
      const p = bodyPoint(s, u, v);
      const uc = Math.min(Math.max(u, 0.02), Math.PI - 0.02);
      const du = sub(bodyPoint(s, uc + eps, v), bodyPoint(s, uc - eps, v));
      const dv = sub(bodyPoint(s, uc, v + eps), bodyPoint(s, uc, v - eps));
      let n = norm(cross(du, dv));
      if (dot(n, p) < 0) n = [-n[0], -n[1], -n[2]];
      if (u < 1e-6 || u > Math.PI - 1e-6) n = [Math.sign(p[0] || (u < 1 ? 1 : -1)), 0, 0];
      row.push({ p, n, uv: [(p[0] / s.L) * s.uvScale * 1.2, (v / (Math.PI * 2)) * s.uvScale * 2.6] });
    }
    grid.push(row);
  }
  return gridMesh(grid);
}

/** Thin round tube along a closed polyline that lies roughly in a horizontal plane. */
function loopTube(points: V3[], radius: number, sides = 10) {
  const grid: GridVertex[][] = [];
  const n = points.length;
  for (let j = 0; j <= n; j += 1) {
    const p = points[j % n]!;
    const t = norm(sub(points[(j + 1) % n]!, points[(j + n - 1) % n]!));
    const lateral = norm(cross([0, 1, 0], t));
    const up = norm(cross(t, lateral));
    const row: GridVertex[] = [];
    for (let i = 0; i <= sides; i += 1) {
      const a = (i / sides) * Math.PI * 2;
      const dir: V3 = [
        Math.cos(a) * lateral[0] + Math.sin(a) * up[0],
        Math.cos(a) * lateral[1] + Math.sin(a) * up[1],
        Math.cos(a) * lateral[2] + Math.sin(a) * up[2]
      ];
      row.push({
        p: [p[0] + dir[0] * radius, p[1] + dir[1] * radius, p[2] + dir[2] * radius],
        n: dir,
        uv: [j / n, i / sides]
      });
    }
    grid.push(row);
  }
  return gridMesh(grid);
}

// ---------------------------------------------------------------- flake texture

/** Fine metallic flake: a tiling tangent-space normal map of randomly tilted micro mirrors. */
function flakeNormalMap(size = 256) {
  const data = new Uint8Array(size * size * 4);
  let seed = 1234567;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let k = 0; k < size * size; k += 1) {
    const a = rnd() * Math.PI * 2;
    // Most flakes are subtle; a few are strongly tilted and catch the light.
    const r = rnd();
    const tilt = r > 0.82 ? 0.55 + rnd() * 0.4 : 0.1 + rnd() * 0.25;
    const nx = Math.cos(a) * tilt;
    const ny = Math.sin(a) * tilt;
    const nz = Math.sqrt(Math.max(0.0, 1 - nx * nx - ny * ny));
    data[k * 4] = Math.round((nx * 0.5 + 0.5) * 255);
    data[k * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    data[k * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    data[k * 4 + 3] = 255;
  }
  return texture.data({ width: size, height: size, data, format: "rgba8", colorSpace: "linear" });
}

// ---------------------------------------------------------------- materials

const paint = material.carPaint({
  color: "#b3000f",
  metallic: 0.62,
  roughness: 0.34,
  clearcoat: 1,
  clearcoatRoughness: 0.025,
  envMapIntensity: 1.5,
  normal: flakeNormalMap(),
  normalScale: 0.9,
  sampling: { wrap: "repeat", generateMipmaps: true }
});

const glass = material.pbr({
  color: "#04060a",
  metallic: 0.2,
  roughness: 0.06,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  envMapIntensity: 1.8
});

const chrome = material.pbr({ color: "#f2f4f8", metallic: 1, roughness: 0.04, envMapIntensity: 1.8 });
const rubber = material.pbr({ color: "#0b0b0d", metallic: 0, roughness: 0.85 });

// ---------------------------------------------------------------- car

const BODY: BodyShape = {
  L: 1.85,
  W: 0.82,
  Ht: 0.5,
  Hb: 0.3,
  nose: 0.35,
  tail: 0.12,
  edge: 3.2,
  lenP: 2.6,
  uvScale: 1
};
const CABIN: BodyShape = {
  L: 0.95,
  W: 0.6,
  Ht: 0.46,
  Hb: 0.08,
  nose: 0.2,
  tail: 0.3,
  edge: 2.6,
  lenP: 2.2,
  uvScale: 1
};

const GROUND = 0.12; // top of the platform
const BODY_Y = GROUND + 0.62; // body centre line
const WHEEL_R = 0.37;

// Chrome beltline: a thin loop round the widest part of the body.
const belt: V3[] = [];
{
  const N = 90;
  for (let k = 0; k < N; k += 1) {
    const t = (k / N) * Math.PI * 2;
    // Walk down one side (+z) then back up the other (-z) with a cosine spacing so the tips stay round.
    const u = Math.acos(Math.cos(t)) ; // 0..pi..0
    const side = Math.sin(t) >= 0 ? 1 : -1;
    const uu = Math.min(Math.max(u, 0.05), Math.PI - 0.05);
    const p = bodyPoint(BODY, uu, side > 0 ? 0 : Math.PI);
    belt.push([p[0] * 1.004, 0.06, p[2] * 1.012]);
  }
}

const wheelNodes = [] as ReturnType<typeof primitives.cylinder>[];
for (const [wx, wz] of [
  [1.12, 0.64],
  [1.12, -0.64],
  [-1.12, 0.64],
  [-1.12, -0.64]
] as const) {
  const outward = wz > 0 ? 1 : -1;
  wheelNodes.push(
    primitives
      .cylinder({ name: `tire-${wx}-${wz}`, size: [WHEEL_R * 2, 0.24, WHEEL_R * 2], material: rubber })
      .position(wx, GROUND + WHEEL_R, wz)
      .rotate(Math.PI / 2, 0, 0),
    primitives
      .cylinder({ name: `hub-${wx}-${wz}`, size: [WHEEL_R * 1.25, 0.25, WHEEL_R * 1.25], material: chrome })
      .position(wx, GROUND + WHEEL_R, wz + outward * 0.005)
      .rotate(Math.PI / 2, 0, 0)
  );
}

const headRings = [0.38, -0.38].map((z) =>
  primitives
    .torus({
      name: `headlight-${z}`,
      size: 0.17,
      params: { tubeRadius: 0.1, radialSegments: 16, tubularSegments: 32 },
      material: chrome
    })
    .position(1.66, BODY_Y + 0.07, z)
    .rotate(0, Math.PI / 2, 0)
);

const car = groups.create("car", [
  geometry.custom(bodyMesh(BODY), { name: "body", material: paint }).position(0, BODY_Y, 0),
  geometry.custom(bodyMesh(CABIN, 72, 72), { name: "cabin", material: glass }).position(-0.18, BODY_Y + 0.36, 0),
  geometry.custom(loopTube(belt, 0.022), { name: "belt-trim", material: chrome }).position(0, BODY_Y, 0),
  ...wheelNodes,
  ...headRings
]);

// ---------------------------------------------------------------- turntable

const platformRim = primitives
  .torus({
    name: "platform-rim",
    size: 3.05,
    params: { tubeRadius: 0.018, radialSegments: 16, tubularSegments: 128 },
    material: chrome
  })
  .position(0, GROUND + 0.005, 0)
  .rotate(Math.PI / 2, 0, 0);

const ringLight = primitives
  .torus({
    name: "ring-light",
    size: 2.7,
    params: { tubeRadius: 0.01, radialSegments: 8, tubularSegments: 160 },
    material: material.pbr({
      color: "#101820",
      emissive: "#bfe0ff",
      emissiveIntensity: 3.2,
      roughness: 0.4
    })
  })
  .position(0, GROUND + 0.01, 0)
  .rotate(Math.PI / 2, 0, 0);

const platformSide = primitives
  .cylinder({
    name: "platform-side",
    size: [3.1, GROUND, 3.1],
    material: material.pbr({ color: "#0d0f13", metallic: 0.6, roughness: 0.25 })
  })
  .position(0, GROUND / 2 - 0.002, 0);

const turntable = groups.create("turntable", [car]).runtime({ id: "turntable", mutable: true });

// ---------------------------------------------------------------- scene

const app = createAuraApp("#app", {
  scene: scene({ background: "#04050a" })
    .add(environments.studio({ preset: "softbox", intensity: 1.15, background: false }))
    .add(lights.directional({ name: "key", position: [-3, 6, 3], target: [0, 0.6, 0], intensity: 1.2, color: "#fff3e6", shadow: true }))
    .add(lights.directional({ name: "rim", position: [3, 3, -5], target: [0, 0.6, 0], intensity: 1.6, color: "#8fc2ff" }))
    .add(lights.rect({ name: "strip-top", position: [0, 4.2, 0], target: [0, 0.5, 0], width: 0.5, height: 6, intensity: 6, color: "#ffffff" }))
    .add(lights.rect({ name: "strip-left", position: [-4, 2.6, 0.5], target: [0, 0.5, 0], width: 0.4, height: 5, intensity: 5, color: "#f4f8ff" }))
    .add(lights.rect({ name: "strip-right", position: [4, 2.6, -1], target: [0, 0.5, 0], width: 0.4, height: 5, intensity: 5, color: "#fff2e4" }))
    .add(surfaces.mirror({ name: "floor-mirror", size: [22, 22], resolution: 512, tint: "#2a2d33", position: [0, GROUND, 0] }))
    .add(platformSide)
    .add(platformRim)
    .add(ringLight)
    .add(turntable)
    .add(effects.bloom({ intensity: 0.45, threshold: 0.85, radius: 0.5 }))
    .camera(camera.perspective({ position: [5.0, 1.35, 6.0], target: [0, 0.72, 0], fov: 30 }))
});

const SPEED_DEG_PER_S = 20;
let angleDeg = 0;
window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: "clearcoat" };

app.onFrame((f) => {
  angleDeg += SPEED_DEG_PER_S * f.dt;
  app.nodes.require("turntable").setRotation(0, (angleDeg * Math.PI) / 180, 0);
  window.__TASK_STATE__ = { turntableAngleDeg: angleDeg, paintFinish: "clearcoat" };
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
});

void app.ready();
