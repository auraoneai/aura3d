import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  lights,
  material,
  scene
} from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { spheres: { name: string }[]; keyLightX: number };
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];
type V4 = [number, number, number, number];

// ---------------------------------------------------------------------------
// Procedural grid mesh builder. Winding is corrected per triangle against the
// supplied vertex normals, so the surface always faces the way the normals say.
// ---------------------------------------------------------------------------
interface GridSpec {
  nu: number;
  nv: number;
  pos: (i: number, j: number) => V3;
  nrm: (i: number, j: number) => V3;
  uv: (i: number, j: number) => [number, number];
  color?: (i: number, j: number) => V4;
}

function buildGrid(g: GridSpec) {
  const count = (g.nu + 1) * (g.nv + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const colors = g.color ? new Float32Array(count * 4) : undefined;
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let j = 0; j <= g.nv; j += 1) {
    for (let i = 0; i <= g.nu; i += 1) {
      const v = j * (g.nu + 1) + i;
      const p = g.pos(i, j);
      positions.set(p, v * 3);
      normals.set(g.nrm(i, j), v * 3);
      uvs.set(g.uv(i, j), v * 2);
      if (colors && g.color) colors.set(g.color(i, j), v * 4);
      for (let k = 0; k < 3; k += 1) {
        min[k] = Math.min(min[k], p[k]);
        max[k] = Math.max(max[k], p[k]);
      }
    }
  }
  const indices: number[] = [];
  const pushTri = (a: number, b: number, c: number): void => {
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const e1x = positions[b * 3] - ax, e1y = positions[b * 3 + 1] - ay, e1z = positions[b * 3 + 2] - az;
    const e2x = positions[c * 3] - ax, e2y = positions[c * 3 + 1] - ay, e2z = positions[c * 3 + 2] - az;
    const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
    const nx = normals[a * 3] + normals[b * 3] + normals[c * 3];
    const ny = normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1];
    const nz = normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2];
    const d = fx * nx + fy * ny + fz * nz;
    if (d < 0) indices.push(a, c, b);
    else indices.push(a, b, c);
  };
  for (let j = 0; j < g.nv; j += 1) {
    for (let i = 0; i < g.nu; i += 1) {
      const a = j * (g.nu + 1) + i;
      const b = a + 1;
      const c = a + g.nu + 1;
      const d = c + 1;
      pushTri(a, b, c);
      pushTri(b, d, c);
    }
  }
  return geometry.define({
    positions,
    normals,
    uvs,
    ...(colors ? { colors } : {}),
    indices,
    bounds: { min, max }
  });
}

// ---------------------------------------------------------------------------
// Spheres: radius R, a radial displacement d(u, v) and a per-vertex tone.
// u runs around the axis, v from the north pole (0) to the south pole (1).
// Normals come from finite differences of the displaced surface, so the
// weave bump is lit correctly.
// ---------------------------------------------------------------------------
const R = 0.8;

function sphereMesh(
  nu: number,
  nv: number,
  displace: (u: number, v: number) => number,
  tone?: (u: number, v: number, i: number, j: number) => V4
) {
  const dir = (u: number, v: number): V3 => {
    const th = u * Math.PI * 2;
    const ph = v * Math.PI;
    return [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
  };
  const surf = (u: number, v: number): V3 => {
    const d = dir(u, v);
    const r = R + displace(u, v);
    return [d[0] * r, d[1] * r, d[2] * r];
  };
  const hu = 0.4 / nu;
  const hv = 0.4 / nv;
  return buildGrid({
    nu,
    nv,
    pos: (i, j) => surf(i / nu, j / nv),
    nrm: (i, j) => {
      const u = i / nu;
      const v = j / nv;
      const d = dir(u, v);
      const a = surf(u + hu, v), b = surf(u - hu, v);
      const c = surf(u, v + hv), e = surf(u, v - hv);
      const tu: V3 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const tv: V3 = [c[0] - e[0], c[1] - e[1], c[2] - e[2]];
      let n: V3 = [tu[1] * tv[2] - tu[2] * tv[1], tu[2] * tv[0] - tu[0] * tv[2], tu[0] * tv[1] - tu[1] * tv[0]];
      const len = Math.hypot(n[0], n[1], n[2]);
      if (len < 1e-9 || j === 0 || j === nv) return d;
      n = [n[0] / len, n[1] / len, n[2] / len];
      const s = n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0 ? -1 : 1;
      return [n[0] * s, n[1] * s, n[2] * s];
    },
    uv: (i, j) => [i / nu, j / nv],
    ...(tone ? { color: (i: number, j: number) => tone(i / nu, j / nv, i, j) } : {})
  });
}

const hash = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// Woven cloth: plain weave, warp over / weft over in a checker, with per-thread
// brightness variation and a slight fibre grain.
const WEAVE_U = 64;
const WEAVE_V = 32;
function weave(u: number, v: number): { h: number; tone: number } {
  const cu = u * WEAVE_U;
  const cv = v * WEAVE_V;
  const iu = Math.floor(cu), iv = Math.floor(cv);
  const fu = cu - iu, fv = cv - iv;
  const warpOver = (iu + iv) % 2 === 0;
  const profile = warpOver ? Math.sin(Math.PI * fu) : Math.sin(Math.PI * fv);
  const h = 0.35 + 0.65 * Math.pow(Math.max(profile, 0), 0.7);
  const thread = 0.9 + 0.1 * hash(warpOver ? iu : iv + 91, warpOver ? 3 : 7);
  const grain = 0.94 + 0.06 * hash(Math.floor(u * 900), Math.floor(v * 900));
  const crossing = 0.55 + 0.45 * h; // darker in the gaps between threads
  return { h, tone: crossing * thread * grain };
}

const glassGeo = sphereMesh(128, 64, () => 0);

const metalGeo = sphereMesh(
  256,
  192,
  () => 0,
  (u, v, _i, j) => {
    // Brushing: fine concentric streaks around the polar axis.
    const streak = 0.6 * hash(j, 1.7) + 0.4 * hash(Math.floor(v * 64), 5.1);
    const grain = hash(Math.floor(u * 700), j * 0.37);
    const t = 0.8 + 0.14 * streak + 0.06 * grain;
    return [t, t, t, 1];
  }
);

const fabricGeo = sphereMesh(
  384,
  192,
  (u, v) => 0.007 * weave(u, v).h * Math.sin(Math.PI * v) ** 0.5,
  (u, v) => {
    const t = weave(u, v).tone;
    return [t, t, t, 1];
  }
);

// ---------------------------------------------------------------------------
// Seamless cove: flat floor that curves up into a vertical backdrop.
// ---------------------------------------------------------------------------
function coveMesh() {
  const halfWidth = 40;
  const zFront = 14;
  const zBack = -5;
  const radius = 4.5;
  const wallHeight = 14;
  const flatSteps = 8;
  const arcSteps = 24;
  const wallSteps = 4;
  const profile: { y: number; z: number; ny: number; nz: number }[] = [];
  for (let k = 0; k <= flatSteps; k += 1) {
    profile.push({ y: 0, z: zFront + (zBack - zFront) * (k / flatSteps), ny: 1, nz: 0 });
  }
  for (let k = 1; k <= arcSteps; k += 1) {
    const a = (k / arcSteps) * (Math.PI / 2);
    profile.push({ y: radius * (1 - Math.cos(a)), z: zBack - radius * Math.sin(a), ny: Math.cos(a), nz: Math.sin(a) });
  }
  for (let k = 1; k <= wallSteps; k += 1) {
    profile.push({ y: radius + wallHeight * (k / wallSteps), z: zBack - radius, ny: 0, nz: 1 });
  }
  const nu = 16;
  const nv = profile.length - 1;
  return buildGrid({
    nu,
    nv,
    pos: (i, j) => [(i / nu - 0.5) * 2 * halfWidth, profile[j].y, profile[j].z],
    nrm: (_i, j) => [0, profile[j].ny, profile[j].nz],
    uv: (i, j) => [i / nu, j / nv]
  });
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const SPACING = 2.4;
const CENTRE_Y = R;
const KEY_Y = 7;
const KEY_Z = 6;
const KEY_SWING = 4.5;
const keyXAt = (seconds: number): number => KEY_SWING * Math.sin(seconds * 0.4);

window.__TASK_STATE__ = {
  spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
  keyLightX: keyXAt(0)
};

const glassMaterial = material.physical({
  color: "#e4f4f2",
  metallic: 0,
  roughness: 0.02,
  transmission: 1,
  ior: 1.5,
  thickness: 1.2,
  opacity: 0.5,
  clearcoat: 1,
  clearcoatRoughness: 0.02
});

const metalMaterial = material.physical({
  color: "#ffffff",
  metallic: 1,
  roughness: 0.34,
  anisotropy: 0.85
});

const fabricMaterial = material.physical({
  color: "#8c1424",
  metallic: 0,
  roughness: 1,
  sheen: 1
});

const floorMaterial = material.pbr({ color: "#cfd1d4", metallic: 0, roughness: 0.85 });

async function main(): Promise<void> {
  const app = createAuraApp("#app", {
    scene: scene({ background: "#c9cbce" })
      .add(environments.studio({ intensity: 1.1, background: false }))
      .add(lights.hemisphere({ skyColor: "#ffffff", groundColor: "#b9bbbf", intensity: 0.3 }))
      // Key: large, warm, shadow casting, drifts side to side.
      .add(
        lights
          .directional({ name: "key", position: [keyXAt(0), KEY_Y, KEY_Z], target: [0, CENTRE_Y, 0], intensity: 3, color: "#fff2e2", shadow: true })
          .runtime({ id: "key", mutable: true })
      )
      // Fill: dimmer, opposite side, slightly cool.
      .add(lights.directional({ name: "fill", position: [-6, 3.5, 5], target: [0, CENTRE_Y, 0], intensity: 0.9, color: "#d5e2ff" }))
      // Rim: from behind, outlines the spheres and lifts the velvet edge.
      .add(lights.directional({ name: "rim", position: [1.5, 4.5, -6], target: [0, CENTRE_Y, 0], intensity: 2, color: "#ffffff" }))
      .add(geometry.custom(coveMesh(), { name: "cove", material: floorMaterial, castShadow: false, receiveShadow: true }))
      .add(geometry.custom(glassGeo, { name: "glass", material: glassMaterial, castShadow: true, receiveShadow: false }).position(-SPACING, CENTRE_Y, 0))
      .add(geometry.custom(metalGeo, { name: "metal", material: metalMaterial, castShadow: true, receiveShadow: true }).position(0, CENTRE_Y, 0))
      .add(
        geometry
          .custom(fabricGeo, { name: "fabric", material: fabricMaterial, castShadow: true, receiveShadow: true })
          .position(SPACING, CENTRE_Y, 0)
          .rotate(0, 0, Math.PI / 2)
      )
      .add(effects.contactShadows({ intensity: 0.8 }))
      .add(effects.ambientOcclusion())
      .add(effects.bloom({ intensity: 0.3, threshold: 0.92, radius: 0.5 }))
      .camera(camera.perspective({ position: [2.4, 3.1, 8.6], target: [0, 0.95, 0], fov: 34, near: 0.5, far: 120 }))
  });

  const start = performance.now();
  app.onFrame(() => {
    const t = (performance.now() - start) / 1000;
    const x = keyXAt(t);
    app.nodes.require("key").setPosition(x, KEY_Y, KEY_Z);
    const state = window.__TASK_STATE__;
    if (state) state.keyLightX = x;
  });

  await app.ready();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  }));
}

void main();
