import { camera, createAuraApp, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";

// Low-poly island with animated water and a 20 second day/night cycle.
// Island: one flat-shaded custom mesh (terrain, pines, rocks) built from code.
// Sky: a custom-shader dome. Water: a custom-shader wave surface that reflects the same sky function.

type V3 = [number, number, number];

const DAY_SECONDS = 20;
const ORBIT_RADS_PER_SECOND = 0.05;

// ---------------------------------------------------------------- helpers
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale3 = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const toHex = (c: V3): string =>
  "#" + c.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("");

const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------------------------------------------------------------- flat-shaded mesh builder
class FlatMesh {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];

  /** Adds one faceted triangle. `inside` is a point on the inner side of the surface; it fixes the winding. */
  tri(a: V3, b: V3, c: V3, color: V3, inside: V3): void {
    let n = cross3(sub3(b, a), sub3(c, a));
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-7) return;
    n = [n[0] / len, n[1] / len, n[2] / len];
    const centroid: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    let p1 = b;
    let p2 = c;
    if (dot3(n, sub3(centroid, inside)) < 0) {
      p1 = c;
      p2 = b;
      n = [-n[0], -n[1], -n[2]];
    }
    const base = this.positions.length / 3;
    for (const p of [a, p1, p2]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.colors.push(color[0], color[1], color[2], 1);
    }
    this.indices.push(base, base + 1, base + 2);
  }

  bounds(): { min: V3; max: V3 } {
    const min: V3 = [Infinity, Infinity, Infinity];
    const max: V3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < this.positions.length; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        const v = this.positions[i + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
    }
    return { min, max };
  }
}

// ---------------------------------------------------------------- island shape
const islandShape = (a: number): number => 1 + 0.16 * Math.sin(3 * a + 1.0) + 0.09 * Math.sin(5 * a + 2.3) + 0.05 * Math.sin(9 * a);

const heightAt = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const d = r / (11.5 * islandShape(a));
  let h = 5.2 * (1 - d * d) - 0.7;
  const landWeight = clamp01(1.2 - d * 0.9);
  h += landWeight * (0.55 * Math.sin(x * 0.8 + 1) * Math.cos(z * 0.7) + 0.35 * Math.sin(x * 1.7 + z * 1.3));
  h += 2.3 * Math.exp(-((x + 1.5) * (x + 1.5) + (z - 1) * (z - 1)) / 12);
  return Math.max(h, -4.5);
};

const SAND: V3 = [0.9, 0.8, 0.52];
const GRASS_LIGHT: V3 = [0.42, 0.7, 0.28];
const GRASS_DARK: V3 = [0.24, 0.5, 0.2];
const ROCK: V3 = [0.52, 0.5, 0.48];
const PEAK: V3 = [0.9, 0.92, 0.94];
const SEABED_NEAR: V3 = [0.62, 0.62, 0.45];
const SEABED_DEEP: V3 = [0.07, 0.24, 0.34];

const terrainColor = (h: number): V3 => {
  if (h < -0.3) return mix3(SEABED_NEAR, SEABED_DEEP, clamp01((-h - 0.3) / 3.6));
  if (h < 0.55) return SAND;
  if (h < 3.7) return mix3(GRASS_LIGHT, GRASS_DARK, clamp01((h - 0.55) / 3.1));
  if (h < 5.7) return ROCK;
  return PEAK;
};

const buildIsland = (): FlatMesh => {
  const rnd = mulberry32(20240607);
  const mesh = new FlatMesh();
  const shade = (c: V3): V3 => scale3(c, 0.9 + rnd() * 0.18);

  // Terrain: jittered polar grid, one flat colour per face.
  const RINGS = 18;
  const SEGS = 44;
  const RMAX = 26;
  const spacing = RMAX / RINGS;
  const grid: V3[][] = [];
  for (let i = 0; i <= RINGS; i += 1) {
    const row: V3[] = [];
    for (let j = 0; j < SEGS; j += 1) {
      const r = i === 0 ? 0 : i * spacing + (i < RINGS ? (rnd() - 0.5) * 0.55 * spacing : 0);
      const a = ((j + (rnd() - 0.5) * 0.5 + (i % 2) * 0.5) / SEGS) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      row.push([x, heightAt(x, z), z]);
    }
    grid.push(row);
  }
  for (let i = 0; i < RINGS; i += 1) {
    for (let j = 0; j < SEGS; j += 1) {
      const j1 = (j + 1) % SEGS;
      const a = grid[i][j];
      const b = grid[i][j1];
      const c = grid[i + 1][j];
      const d = grid[i + 1][j1];
      for (const t of [[a, c, d], [a, d, b]] as V3[][]) {
        const h = (t[0][1] + t[1][1] + t[2][1]) / 3;
        const cx = (t[0][0] + t[1][0] + t[2][0]) / 3;
        const cz = (t[0][2] + t[1][2] + t[2][2]) / 3;
        mesh.tri(t[0], t[1], t[2], shade(terrainColor(h)), [cx, h - 100, cz]);
      }
    }
  }

  const addCone = (cx: number, cy: number, cz: number, r: number, h: number, sides: number, color: V3, spin: number): void => {
    const apex: V3 = [cx, cy + h, cz];
    const center: V3 = [cx, cy, cz];
    const inside: V3 = [cx, cy + h * 0.35, cz];
    const ring: V3[] = [];
    for (let k = 0; k < sides; k += 1) {
      const a = spin + (k / sides) * Math.PI * 2;
      ring.push([cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r]);
    }
    for (let k = 0; k < sides; k += 1) {
      const p = ring[k];
      const q = ring[(k + 1) % sides];
      mesh.tri(apex, p, q, shade(color), inside);
      mesh.tri(center, p, q, scale3(color, 0.6), inside);
    }
  };

  const addPine = (x: number, z: number, s: number): void => {
    const y = heightAt(x, z) - 0.25;
    const spin = rnd() * 6;
    addCone(x, y, z, 0.24 * s, 1.5 * s, 5, [0.4, 0.27, 0.16], spin);
    addCone(x, y + 0.7 * s, z, 1.2 * s, 1.6 * s, 6, [0.17, 0.46, 0.25], spin);
    addCone(x, y + 1.5 * s, z, 0.95 * s, 1.4 * s, 6, [0.2, 0.52, 0.27], spin + 0.5);
    addCone(x, y + 2.2 * s, z, 0.66 * s, 1.3 * s, 6, [0.25, 0.58, 0.3], spin + 1);
  };

  const ICO: V3[] = (() => {
    const t = (1 + Math.sqrt(5)) / 2;
    return [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((v) => norm3(v as V3));
  })();
  const ICO_FACES = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];

  const addRock = (x: number, z: number, size: number, sink: number): void => {
    const y = heightAt(x, z) + size * 0.25 - sink;
    const sx = 1 + rnd() * 0.5;
    const sz = 1 + rnd() * 0.5;
    const pts: V3[] = ICO.map((v) => {
      const k = size * (0.75 + rnd() * 0.5);
      return [x + v[0] * k * sx, y + v[1] * k * 0.75, z + v[2] * k * sz];
    });
    const inside: V3 = [x, y, z];
    const tint = 0.85 + rnd() * 0.2;
    const base: V3 = [0.5 * tint, 0.5 * tint, 0.52 * tint];
    for (const f of ICO_FACES) mesh.tri(pts[f[0]], pts[f[1]], pts[f[2]], shade(base), inside);
  };

  // Trees on gentle grass slopes, rocks on land and in the shallows.
  const trees: Array<[number, number]> = [];
  for (let tries = 0; tries < 400 && trees.length < 16; tries += 1) {
    const a = rnd() * Math.PI * 2;
    const r = 1.5 + rnd() * 9;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < 0.9 || h > 4.4) continue;
    const slope = Math.abs(heightAt(x + 0.8, z) - h) + Math.abs(heightAt(x, z + 0.8) - h);
    if (slope > 1.5) continue;
    if (trees.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 2.4)) continue;
    trees.push([x, z]);
    addPine(x, z, 0.8 + rnd() * 0.55);
  }
  let rocks = 0;
  for (let tries = 0; tries < 600 && rocks < 10; tries += 1) {
    const a = rnd() * Math.PI * 2;
    const r = 4 + rnd() * 13;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = heightAt(x, z);
    const onShore = h > -1.4 && h < 0.4;
    const onLand = h > 0.5 && h < 4.5;
    if (!onShore && !onLand) continue;
    if (trees.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 1.6)) continue;
    addRock(x, z, onShore ? 0.7 + rnd() * 0.7 : 0.4 + rnd() * 0.5, onShore ? 0.1 : 0.15);
    rocks += 1;
  }
  return mesh;
};

// ---------------------------------------------------------------- water mesh (dense near the island, sparse far away)
const buildWater = (): { positions: Float32Array; normals: Float32Array; indices: Uint32Array; half: number } => {
  const N = 160;
  const HALF = 260;
  const coord = (i: number): number => {
    const u = (i / N) * 2 - 1;
    return HALF * (0.35 * u + 0.65 * u * u * u);
  };
  const positions = new Float32Array((N + 1) * (N + 1) * 3);
  const normals = new Float32Array(positions.length);
  const indices = new Uint32Array(N * N * 6);
  let k = 0;
  for (let j = 0; j <= N; j += 1) {
    for (let i = 0; i <= N; i += 1) {
      const v = j * (N + 1) + i;
      positions[v * 3] = coord(i);
      positions[v * 3 + 1] = 0;
      positions[v * 3 + 2] = coord(j);
      normals[v * 3 + 1] = 1;
      if (i < N && j < N) {
        indices.set([v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2], k);
        k += 6;
      }
    }
  }
  return { positions, normals, indices, half: HALF };
};

// ---------------------------------------------------------------- shaders
const skyUniforms = () => ({
  skySunDir: { type: "vec3" as const, value: [0, 1, 0] },
  skyMoonDir: { type: "vec3" as const, value: [0, -1, 0] },
  skyHorizon: { type: "vec3" as const, value: [0.6, 0.8, 0.95] },
  skyZenith: { type: "vec3" as const, value: [0.12, 0.38, 0.8] },
  skySunTint: { type: "vec3" as const, value: [1, 0.95, 0.8] },
  skyNight: { type: "f32" as const, value: 0 },
  skySunAmt: { type: "f32" as const, value: 1 },
  skyMoonAmt: { type: "f32" as const, value: 0 },
  skyLight: { type: "f32" as const, value: 1 }
});

const SKY_GLSL = /* glsl */ `
float skyHash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
vec3 skyColor(vec3 d) {
  float y = d.y;
  vec3 col = mix(skyHorizon, skyZenith, pow(clamp(y, 0.0, 1.0), 0.45));
  if (y < 0.0) col = mix(skyHorizon, skyHorizon * 0.75, clamp(-y * 4.0, 0.0, 1.0));
  float above = smoothstep(-0.01, 0.02, y);
  float sd = max(dot(d, skySunDir), 0.0);
  col += skySunTint * skySunAmt * (smoothstep(0.9993, 0.9998, sd) * 5.0 + pow(sd, 10.0) * 0.28) * above;
  float md = max(dot(d, skyMoonDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9993, 0.9997, md) * 1.6 * skyNight * above;
  if (y > 0.0 && skyNight > 0.01) {
    vec3 q = floor(d * 240.0);
    float h = skyHash(q);
    float star = step(0.9965, h) * (0.5 + 0.5 * skyHash(q + 7.3));
    col += vec3(star) * skyNight * smoothstep(0.0, 0.12, y) * 1.4;
  }
  return col;
}`;

const SKY_DOME = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${SKY_GLSL}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  outColor = vec4(skyColor(d), 1.0);
}`
  },
  uniforms: skyUniforms(),
  side: "double",
  fog: false,
  castShadow: false,
  receiveShadow: false
});

const WAVE_GLSL = /* glsl */ `
float waveH(vec2 p, float t, float detail, out vec2 g) {
  vec2 d1 = vec2(0.80, 0.60);
  vec2 d2 = vec2(-0.50, 0.87);
  vec2 d3 = vec2(0.20, -0.98);
  vec2 d4 = vec2(-0.90, -0.43);
  float a1 = dot(d1, p) * 0.55 + t * 0.9;
  float a2 = dot(d2, p) * 0.90 + t * 1.2;
  float a3 = dot(d3, p) * 1.90 + t * 1.9;
  float a4 = dot(d4, p) * 3.10 + t * 2.6;
  float h = 0.22 * sin(a1) + 0.12 * sin(a2);
  g = 0.22 * 0.55 * cos(a1) * d1 + 0.12 * 0.90 * cos(a2) * d2;
  h += detail * (0.05 * sin(a3) + 0.025 * sin(a4));
  g += detail * (0.05 * 1.90 * cos(a3) * d3 + 0.025 * 3.10 * cos(a4) * d4);
  return h;
}`;

const WATER = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
${WAVE_GLSL}
void main() {
  vec2 g;
  float h = waveH(position.xz, waveClock, 0.0, g);
  vec3 p = vec3(position.x, h, position.z);
  vWorld = p;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${SKY_GLSL}
${WAVE_GLSL}
void main() {
  vec2 g;
  waveH(vWorld.xz, waveClock, 1.0, g);
  vec3 n = normalize(vec3(-g.x * 1.3, 1.0, -g.y * 1.3));
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 0.001);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.1 + 0.9 * pow(1.0 - ndv, 3.0);

  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 refl = skyColor(r);

  vec3 deep = vec3(0.03, 0.22, 0.38);
  vec3 shallow = vec3(0.14, 0.58, 0.64);
  vec3 body = mix(deep, shallow, smoothstep(-0.25, 0.3, vWorld.y));
  bool sunKey = skySunAmt >= skyMoonAmt;
  vec3 keyDir = sunKey ? skySunDir : skyMoonDir;
  vec3 keyCol = sunKey ? skySunTint * skySunAmt : vec3(0.55, 0.65, 1.0) * skyMoonAmt * 0.5;
  body *= mix(0.25, 1.0, skyLight);
  body += body * keyCol * max(dot(n, keyDir), 0.0) * 0.6;

  vec3 col = mix(body, refl, fres);
  col += keyCol * pow(max(dot(r, keyDir), 0.0), 300.0) * 2.5;
  float crest = smoothstep(0.2, 0.33, vWorld.y);
  col += vec3(crest * 0.3) * mix(0.3, 1.0, skyLight);

  float distFade = smoothstep(90.0, 240.0, dist);
  vec3 horizonDir = normalize(vec3(-v.x, 0.0, -v.z));
  col = mix(col, skyColor(horizonDir), distFade);
  float alpha = mix(0.82, 1.0, max(fres, distFade));
  outColor = vec4(col, alpha);
}`
  },
  uniforms: { ...skyUniforms(), waveClock: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  side: "double",
  fog: false,
  castShadow: false,
  receiveShadow: false
});

// ---------------------------------------------------------------- scene
const island = buildIsland();
const islandBounds = island.bounds();
const water = buildWater();

const SUN_DISTANCE = 48;
const sunDirAt = (phi: number): V3 => norm3([Math.cos(phi), Math.sin(phi), -0.3]);
const moonDirAt = (phi: number): V3 => norm3([-Math.cos(phi), -Math.sin(phi), -0.3]);

const initialPhi = 0.08 * Math.PI * 2;
const initialSun = sunDirAt(initialPhi);
const initialMoon = moonDirAt(initialPhi);

const app = createAuraApp("#app", {
  scene: scene({ background: "#9cc4e8" })
    .add(primitives.sphere({ name: "sky-dome", size: 900, material: SKY_DOME, castShadow: false, receiveShadow: false }).runtime({ id: "dome", mutable: true }))
    .add(environments.neutral({ intensity: 0.25, background: false }))
    .add(lights.hemisphere({ name: "fill", skyColor: "#cfe3ff", groundColor: "#5a6a48", intensity: 0.9 }).runtime({ id: "fill", mutable: true }))
    .add(lights.directional({
      name: "sun",
      position: scale3(initialSun, SUN_DISTANCE),
      target: [0, 0, 0],
      intensity: 3,
      color: "#fff1d6",
      shadow: true
    }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({
      name: "moon",
      position: scale3(initialMoon, SUN_DISTANCE),
      target: [0, 0, 0],
      intensity: 0,
      color: "#9db7ff"
    }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(
      geometry.define({
        positions: new Float32Array(island.positions),
        normals: new Float32Array(island.normals),
        colors: new Float32Array(island.colors),
        indices: new Uint32Array(island.indices),
        bounds: { min: islandBounds.min, max: islandBounds.max }
      }),
      { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }
    ).runtime({ id: "island", mutable: true }))
    .add(geometry.custom(
      geometry.define({
        positions: water.positions,
        normals: water.normals,
        indices: water.indices,
        bounds: { min: [-water.half, -1, -water.half], max: [water.half, 1, water.half] }
      }),
      { name: "water", material: WATER, castShadow: false, receiveShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .camera(camera.perspective({ position: [0, 5.6, 21.5], target: [0, 1.6, 0], fov: 60, near: 0.5, far: 1600 }))
});

// ---------------------------------------------------------------- per-frame animation
const NIGHT_HORIZON: V3 = [0.05, 0.08, 0.2];
const DAY_HORIZON: V3 = [0.62, 0.8, 0.95];
const DUSK_HORIZON: V3 = [1.0, 0.5, 0.26];
const NIGHT_ZENITH: V3 = [0.01, 0.02, 0.09];
const DAY_ZENITH: V3 = [0.12, 0.38, 0.8];
const DUSK_ZENITH: V3 = [0.28, 0.22, 0.5];
const LOW_SUN: V3 = [1.0, 0.55, 0.25];
const HIGH_SUN: V3 = [1.0, 0.95, 0.82];
const NIGHT_FILL: V3 = [0.3, 0.38, 0.7];
const DAY_FILL: V3 = [0.8, 0.89, 1.0];

const startTime = performance.now();

app.onFrame(() => {
  const t = (performance.now() - startTime) / 1000;
  const phi = (t / DAY_SECONDS + 0.08) * Math.PI * 2;
  const sunDir = sunDirAt(phi);
  const moonDir = moonDirAt(phi);
  const elevation = (Math.asin(sunDir[1]) * 180) / Math.PI;

  const day = smooth(-8, 20, elevation);
  const dusk = Math.exp(-(((elevation - 2) / 9) ** 2));
  const horizon = mix3(mix3(NIGHT_HORIZON, DAY_HORIZON, day), DUSK_HORIZON, dusk * 0.75);
  const zenith = mix3(mix3(NIGHT_ZENITH, DAY_ZENITH, day), DUSK_ZENITH, dusk * 0.35);
  const sunTint = mix3(LOW_SUN, HIGH_SUN, smooth(0, 30, elevation));
  const sunAmt = smooth(-4, 10, elevation);
  const moonAmt = smooth(-2, 12, -elevation);
  const night = 1 - smooth(-10, 4, elevation);
  const skyLight = 0.12 + 0.88 * day;

  for (const id of ["dome", "water"]) {
    const h = app.nodes.require(id);
    h.setUniform?.("skySunDir", sunDir);
    h.setUniform?.("skyMoonDir", moonDir);
    h.setUniform?.("skyHorizon", horizon);
    h.setUniform?.("skyZenith", zenith);
    h.setUniform?.("skySunTint", sunTint);
    h.setUniform?.("skyNight", night);
    h.setUniform?.("skySunAmt", sunAmt);
    h.setUniform?.("skyMoonAmt", moonAmt);
    h.setUniform?.("skyLight", skyLight);
  }
  app.nodes.require("water").setUniform?.("waveClock", t);

  const sun = app.nodes.require("sun");
  sun.setPosition(...scale3(sunDir, SUN_DISTANCE));
  sun.setVisible(elevation > -4);
  sun.setLight?.({ intensity: 3 * sunAmt, color: toHex(sunTint) });
  const moon = app.nodes.require("moon");
  moon.setPosition(...scale3(moonDir, SUN_DISTANCE));
  moon.setVisible(elevation < 4);
  moon.setLight?.({ intensity: 0.9 * moonAmt, color: "#9db7ff" });
  app.nodes.require("fill").setLight?.({ intensity: 0.4 + 0.6 * day, color: toHex(mix3(NIGHT_FILL, DAY_FILL, day)) });

  // Slow orbit: turning the island under a fixed camera is equivalent to the camera circling it.
  app.nodes.require("island").setRotation(0, t * ORBIT_RADS_PER_SECOND, 0);
});

const markReady = async (): Promise<void> => {
  await app.ready();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
    });
  });
};
void markReady();
