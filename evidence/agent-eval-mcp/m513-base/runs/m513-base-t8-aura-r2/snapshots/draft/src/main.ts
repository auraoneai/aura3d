import { camera, createAuraApp, effects, geometry, lights, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type Vec3 = [number, number, number];

// ---------------------------------------------------------------- helpers
let seed = 11;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const hex = (h: string): Vec3 => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const toCss = (c: Vec3): string => {
  const h = (v: number): string => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
};
/** Piecewise-linear colour ramp over sun elevation (degrees). */
const ramp = (e: number, stops: ReadonlyArray<readonly [number, Vec3]>): Vec3 => {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return [0, 0, 0];
  if (e <= first[0]) return first[1];
  if (e >= last[0]) return last[1];
  for (let i = 1; i < stops.length; i += 1) {
    const a = stops[i - 1];
    const b = stops[i];
    if (a && b && e <= b[0]) return mix3(a[1], b[1], (e - a[0]) / (b[0] - a[0]));
  }
  return last[1];
};

// ---------------------------------------------------------------- flat-shaded mesh builder
class FlatMesh {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly col: number[] = [];

  /** Adds one triangle with its own face normal. With `inside`, the winding is flipped to face away from that point. */
  tri(a: Vec3, b: Vec3, c: Vec3, color: Vec3, inside?: Vec3): void {
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    nx /= len;
    ny /= len;
    nz /= len;
    let q = b;
    let r = c;
    if (inside) {
      const mx = (a[0] + b[0] + c[0]) / 3 - inside[0];
      const my = (a[1] + b[1] + c[1]) / 3 - inside[1];
      const mz = (a[2] + b[2] + c[2]) / 3 - inside[2];
      if (nx * mx + ny * my + nz * mz < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
        q = c;
        r = b;
      }
    }
    for (const p of [a, q, r]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(color[0], color[1], color[2], 1);
    }
  }

  /** Faceted cone (or truncated pyramid when topR > 0) around a vertical axis. */
  cone(cx: number, cy: number, cz: number, r: number, h: number, sides: number, color: Vec3, topR = 0, twist = 0): void {
    const mid: Vec3 = [cx, cy + h * 0.5, cz];
    const ring = (y: number, rad: number, off: number): Vec3[] =>
      Array.from({ length: sides }, (_, i): Vec3 => {
        const a = ((i + off) / sides) * Math.PI * 2 + twist;
        return [cx + Math.cos(a) * rad, y, cz + Math.sin(a) * rad];
      });
    const base = ring(cy, r, 0);
    const top = topR > 0 ? ring(cy + h, topR, 0) : undefined;
    const apex: Vec3 = [cx, cy + h, cz];
    for (let i = 0; i < sides; i += 1) {
      const j = (i + 1) % sides;
      const shade = 0.92 + 0.16 * rand();
      const c = scale3(color, shade);
      const b0 = base[i] as Vec3;
      const b1 = base[j] as Vec3;
      if (top) {
        const t0 = top[i] as Vec3;
        const t1 = top[j] as Vec3;
        this.tri(b0, b1, t1, c, mid);
        this.tri(b0, t1, t0, c, mid);
        this.tri([cx, cy + h, cz], t0, t1, c, mid);
      } else {
        this.tri(b0, b1, apex, c, mid);
      }
      this.tri([cx, cy, cz], b0, b1, scale3(color, 0.6), mid);
    }
  }

  /** Jittered low-poly ellipsoid. */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, segs: number, rings: number, color: Vec3, jitter: number): void {
    const centre: Vec3 = [cx, cy, cz];
    const grid: Vec3[][] = [];
    for (let k = 1; k < rings; k += 1) {
      const phi = (k / rings) * Math.PI;
      const row: Vec3[] = [];
      for (let i = 0; i < segs; i += 1) {
        const th = (i / segs) * Math.PI * 2;
        const j = 1 + (rand() - 0.5) * 2 * jitter;
        row.push([cx + rx * Math.sin(phi) * Math.cos(th) * j, cy + ry * Math.cos(phi) * j, cz + rz * Math.sin(phi) * Math.sin(th) * j]);
      }
      grid.push(row);
    }
    const topP: Vec3 = [cx, cy + ry * (1 + (rand() - 0.5) * jitter), cz];
    const botP: Vec3 = [cx, cy - ry * (1 - rand() * jitter), cz];
    const first = grid[0] as Vec3[];
    const last = grid[grid.length - 1] as Vec3[];
    for (let i = 0; i < segs; i += 1) {
      const j = (i + 1) % segs;
      this.tri(topP, first[i] as Vec3, first[j] as Vec3, scale3(color, 0.95 + 0.1 * rand()), centre);
      this.tri(botP, last[i] as Vec3, last[j] as Vec3, scale3(color, 0.7), centre);
      for (let k = 0; k + 1 < grid.length; k += 1) {
        const a = grid[k] as Vec3[];
        const b = grid[k + 1] as Vec3[];
        const c = scale3(color, 0.9 + 0.2 * rand());
        this.tri(a[i] as Vec3, b[i] as Vec3, b[j] as Vec3, c, centre);
        this.tri(a[i] as Vec3, b[j] as Vec3, a[j] as Vec3, scale3(color, 0.9 + 0.2 * rand()), centre);
      }
    }
  }

  build(name: string) {
    const positions = new Float32Array(this.pos);
    const normals = new Float32Array(this.nor);
    const colors = new Float32Array(this.col);
    const indices = new Uint32Array(positions.length / 3);
    for (let i = 0; i < indices.length; i += 1) indices[i] = i;
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let a = 0; a < 3; a += 1) {
        const v = positions[i + a] as number;
        if (v < (min[a] as number)) min[a] = v;
        if (v > (max[a] as number)) max[a] = v;
      }
    }
    return { name, geom: geometry.define({ positions, normals, colors, indices, bounds: { min, max } }) };
  }
}

// ---------------------------------------------------------------- island
const COAST = 16; // coast radius in "island space"
const shape = (a: number): number => 1 + 0.12 * Math.sin(3 * a + 1) + 0.07 * Math.sin(5 * a + 2);
const islandRadius = (x: number, z: number): number => Math.hypot(x, z) / shape(Math.atan2(z, x));
const height = (x: number, z: number): number => {
  const rr = islandRadius(x, z);
  if (rr >= COAST) return Math.max(-(rr - COAST) * 0.4, -4);
  const dome = 1 - Math.pow(rr / COAST, 1.7);
  return dome * (3.6 + 1.6 * Math.sin(x * 0.4 + 1) * Math.cos(z * 0.33) + 0.7 * Math.sin(x * 0.8 + z * 0.65));
};

const SAND = hex("#d9c58e");
const GRASS = hex("#5c9a45");
const GRASS_DARK = hex("#3d7a3a");
const ROCK = hex("#857f76");
const SEABED = hex("#3d6f7c");
const colorFor = (h: number, slope: number): Vec3 => {
  if (h < -0.3) return SEABED;
  if (h < 0.45) return SAND;
  if (slope > 0.95 || h > 4.6) return ROCK;
  return h < 2.4 ? GRASS : GRASS_DARK;
};

const GRID = 56;
const EXTENT = 28;
const CELL = (EXTENT * 2) / GRID;
const verts: Vec3[] = [];
for (let j = 0; j <= GRID; j += 1) {
  for (let i = 0; i <= GRID; i += 1) {
    const edge = i === 0 || j === 0 || i === GRID || j === GRID;
    const x = -EXTENT + i * CELL + (edge ? 0 : (rand() - 0.5) * CELL * 0.55);
    const z = -EXTENT + j * CELL + (edge ? 0 : (rand() - 0.5) * CELL * 0.55);
    verts.push([x, height(x, z), z]);
  }
}
const terrain = new FlatMesh();
const vAt = (i: number, j: number): Vec3 => verts[j * (GRID + 1) + i] as Vec3;
const addFace = (a: Vec3, b: Vec3, c: Vec3): void => {
  const avg = (a[1] + b[1] + c[1]) / 3;
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const slope = Math.hypot(nx, nz) / Math.max(Math.abs(ny), 1e-6);
  terrain.tri(a, b, c, scale3(colorFor(avg, slope), 0.93 + 0.14 * rand()), [a[0], a[1] - 50, a[2]]);
};
for (let j = 0; j < GRID; j += 1) {
  for (let i = 0; i < GRID; i += 1) {
    const p00 = vAt(i, j), p10 = vAt(i + 1, j), p01 = vAt(i, j + 1), p11 = vAt(i + 1, j + 1);
    if ((i + j) % 2 === 0) {
      addFace(p00, p01, p10);
      addFace(p10, p01, p11);
    } else {
      addFace(p00, p01, p11);
      addFace(p00, p11, p10);
    }
  }
}

// trees and rocks
const props = new FlatMesh();
const placed: Array<[number, number]> = [];
const TRUNK = hex("#6b4a2e");
const PINES = [hex("#2f6b3a"), hex("#3a7a40"), hex("#2a5f48")];
let trees = 0;
for (let tries = 0; tries < 400 && trees < 18; tries += 1) {
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(rand()) * 14;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const h = height(x, z);
  if (h < 0.7 || h > 3.9 || placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.6)) continue;
  placed.push([x, z]);
  trees += 1;
  const s = 0.8 + rand() * 0.6;
  const col = PINES[trees % PINES.length] as Vec3;
  props.cone(x, h - 0.2, z, 0.22 * s, 1.2 * s, 5, TRUNK, 0.16 * s);
  if (trees % 4 === 0) {
    props.blob(x, h + 1.9 * s, z, 1.15 * s, 1.0 * s, 1.15 * s, 7, 4, hex("#6aa84f"), 0.12);
  } else {
    for (let t = 0; t < 3; t += 1) props.cone(x, h + (0.8 + t * 0.85) * s, z, (1.35 - t * 0.38) * s, 1.4 * s, 7, col, 0, t * 0.5);
  }
}
let rocks = 0;
for (let tries = 0; tries < 300 && rocks < 9; tries += 1) {
  const a = rand() * Math.PI * 2;
  const r = 5 + rand() * 10;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const h = height(x, z);
  if (h < 0.0 || h > 4.2 || placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.8)) continue;
  placed.push([x, z]);
  rocks += 1;
  const s = 0.6 + rand() * 0.9;
  props.blob(x, h + 0.1 * s, z, 1.1 * s, 0.75 * s, 0.95 * s, 6, 3, mix3(ROCK, hex("#a39d92"), rand()), 0.22);
}
const terrainMesh = terrain.build("terrain");
const propsMesh = props.build("props");

// ---------------------------------------------------------------- water
const WATER_N = 180;
const WATER_SIZE = 300;
const wPos = new Float32Array((WATER_N + 1) ** 2 * 3);
const wNor = new Float32Array(wPos.length);
const wIdx: number[] = [];
for (let j = 0; j <= WATER_N; j += 1) {
  for (let i = 0; i <= WATER_N; i += 1) {
    const v = j * (WATER_N + 1) + i;
    wPos.set([(i / WATER_N - 0.5) * WATER_SIZE, 0, (j / WATER_N - 0.5) * WATER_SIZE], v * 3);
    wNor[v * 3 + 1] = 1;
    if (i < WATER_N && j < WATER_N) wIdx.push(v, v + WATER_N + 1, v + 1, v + 1, v + WATER_N + 1, v + WATER_N + 2);
  }
}
const waterMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
void addWave(vec2 p, float t, vec2 d, float k, float a, float s, inout float h, inout vec2 slope) {
  float ph = dot(p, d) * k + t * s;
  h += sin(ph) * a;
  slope += d * (cos(ph) * a * k);
}
void main() {
  float h = 0.0;
  vec2 slope = vec2(0.0);
  vec2 p = position.xz;
  addWave(p, waveClock, vec2(0.80, 0.60), 0.55, 0.11, 1.1, h, slope);
  addWave(p, waveClock, vec2(-0.55, 0.83), 0.80, 0.07, 1.5, h, slope);
  addWave(p, waveClock, vec2(0.31, -0.95), 1.30, 0.035, 2.2, h, slope);
  vec3 wp = vec3(p.x, h, p.y);
  vPos = wp;
  vNormal = normalize(vec3(-slope.x * 1.8, 1.0, -slope.y * 1.8));
  gl_Position = modelViewProjectionMatrix * vec4(wp, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 0.001);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float ang = atan(vPos.z, vPos.x);
  float rr = length(vPos.xz) / (1.0 + 0.12 * sin(3.0 * ang + 1.0) + 0.07 * sin(5.0 * ang + 2.0));
  float off = rr - 16.0;
  float depth = clamp(off / 9.0, 0.0, 1.0);
  vec3 body = mix(waveShallow, waveDeep, sqrt(depth));
  vec3 col = mix(body, waveSky, clamp(fres * 0.8 + 0.06, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-waveSunDir, n), v), 0.0), 120.0);
  col += waveSunCol * glint * 1.6;
  float ripple = 0.5 + 0.5 * sin(off * 2.4 - waveClock * 1.3 + sin(ang * 9.0) * 1.5);
  float foam = (1.0 - smoothstep(0.0, 1.5, off)) * (0.55 + 0.45 * ripple);
  foam += smoothstep(0.75, 1.0, ripple) * (1.0 - smoothstep(1.0, 5.0, off)) * 0.35;
  foam *= step(-0.2, off);
  col = mix(col, vec3(0.92, 0.96, 1.0) * waveLight, clamp(foam, 0.0, 1.0) * 0.85);
  float fogF = exp(-pow(dist * 0.011, 2.0));
  col = mix(waveHorizon, col, fogF);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    waveLight: { type: "f32", value: 1 },
    waveSunDir: { type: "vec3", value: [0, 1, 0] },
    waveSunCol: { type: "vec3", value: [1, 0.9, 0.7] },
    waveSky: { type: "vec3", value: [0.6, 0.78, 0.92] },
    waveHorizon: { type: "vec3", value: [0.66, 0.77, 0.88] },
    waveDeep: { type: "vec3", value: [0.03, 0.3, 0.45] },
    waveShallow: { type: "vec3", value: [0.2, 0.66, 0.66] }
  }
});

// ---------------------------------------------------------------- day / night
const DAY_SECONDS = 20;
const lightAt = (elevationDeg: number, azimuthDeg: number, distance = 40): Vec3 => {
  const e = (elevationDeg * Math.PI) / 180;
  const a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e) * distance, Math.sin(e) * distance, -Math.cos(a) * Math.cos(e) * distance];
};

const NIGHT_HORIZON = hex("#0e1630");
const DUSK_HORIZON = hex("#f08a55");
const DAY_HORIZON = hex("#a9c9ec");
const NIGHT_ZENITH = hex("#070b1c");
const DAY_ZENITH = hex("#4d86cc");

const skyState = (timeSeconds: number) => {
  const phase = (0.1 + timeSeconds / DAY_SECONDS) % 1;
  const elevationDeg = 58 * Math.sin(phase * Math.PI * 2) + 14;
  const azimuthDeg = 90 + phase * 360;
  const day = smoothstep(-6, 25, elevationDeg);
  const sunPos = lightAt(elevationDeg, azimuthDeg);
  const sunLen = Math.hypot(...sunPos);
  const sunDir: Vec3 = [sunPos[0] / sunLen, sunPos[1] / sunLen, sunPos[2] / sunLen];
  const horizon = ramp(elevationDeg, [[-12, NIGHT_HORIZON], [0, DUSK_HORIZON], [24, DAY_HORIZON]]);
  const zenith = ramp(elevationDeg, [[-12, NIGHT_ZENITH], [0, mix3(NIGHT_ZENITH, DAY_ZENITH, 0.35)], [24, DAY_ZENITH]]);
  const sunColor = ramp(elevationDeg, [[-2, hex("#ff7a3a")], [10, hex("#ffc283")], [35, hex("#fff1d6")]]);
  const sunIntensity = 4.2 * smoothstep(-2, 10, elevationDeg);
  const moonIntensity = 0.75 * smoothstep(-4, 8, -elevationDeg);
  return {
    elevationDeg,
    azimuthDeg,
    day,
    sunPos,
    sunDir,
    horizon,
    zenith,
    sunColor,
    sunIntensity,
    moonPos: lightAt(-elevationDeg, azimuthDeg + 180),
    moonIntensity,
    hemiSky: mix3(hex("#3b4f8c"), hex("#b8d0f0"), day),
    hemiGround: mix3(hex("#1b2236"), hex("#3d4a30"), day),
    hemiIntensity: 0.6 + 0.55 * day,
    fogColor: horizon,
    waterLight: 0.16 + 0.84 * day
  };
};

const waterUniforms = (s: ReturnType<typeof skyState>) => {
  const lit = s.waterLight;
  return {
    waveLight: lit,
    waveSunDir: s.sunDir,
    waveSunCol: scale3(s.sunColor, smoothstep(-2, 8, s.elevationDeg)),
    waveSky: mix3(scale3(s.horizon, 0.9), s.zenith, 0.3),
    waveHorizon: s.horizon,
    waveDeep: mix3(scale3(hex("#06324d"), lit), hex("#040a1c"), 1 - s.day),
    waveShallow: mix3(scale3(hex("#34a8a0"), lit), hex("#0a1c36"), 1 - s.day)
  };
};

const s0 = skyState(0);
const CAMERA_RADIUS = 40;
const CAMERA_HEIGHT = 21;
const CAMERA_TARGET: Vec3 = [0, 0.8, 0];

const app = createAuraApp("#app", {
  scene: scene({ background: toCss(s0.horizon) })
    .add(sky.preetham({ sun: { elevationDeg: s0.elevationDeg, azimuthDeg: s0.azimuthDeg, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ name: "hemi", skyColor: toCss(s0.hemiSky), groundColor: toCss(s0.hemiGround), intensity: s0.hemiIntensity }).runtime({ id: "hemi", mutable: true }))
    .add(lights.directional({ name: "sun", position: s0.sunPos, target: [0, 0, 0], intensity: s0.sunIntensity, color: toCss(s0.sunColor), shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: s0.moonPos, target: [0, 0, 0], intensity: s0.moonIntensity, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(terrainMesh.geom, { name: terrainMesh.name, material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
    .add(geometry.custom(propsMesh.geom, { name: propsMesh.name, material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
    .add(
      geometry
        .custom(
          geometry.define({ positions: wPos, normals: wNor, indices: wIdx, bounds: { min: [-WATER_SIZE / 2, -1, -WATER_SIZE / 2], max: [WATER_SIZE / 2, 1, WATER_SIZE / 2] } }),
          { name: "water", material: waterMaterial, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .add(effects.fog({ color: toCss(s0.fogColor), density: 0.004 }))
    .camera(camera.perspective({ position: [CAMERA_RADIUS, CAMERA_HEIGHT, 0], target: CAMERA_TARGET, fov: 45, near: 0.5, far: 500 }))
});

let clock = 0;
const applyWater = (u: ReturnType<typeof waterUniforms>, t: number): void => {
  const water = app.nodes.require("water");
  water.setUniform?.("waveClock", t);
  water.setUniform?.("waveLight", u.waveLight);
  water.setUniform?.("waveSunDir", u.waveSunDir);
  water.setUniform?.("waveSunCol", u.waveSunCol);
  water.setUniform?.("waveSky", u.waveSky);
  water.setUniform?.("waveHorizon", u.waveHorizon);
  water.setUniform?.("waveDeep", u.waveDeep);
  water.setUniform?.("waveShallow", u.waveShallow);
};

app.onFrame((frame) => {
  clock += frame.dt;
  const s = skyState(clock);
  app.atmosphere?.setSky({ sun: { elevationDeg: s.elevationDeg, azimuthDeg: s.azimuthDeg, intensity: 1 } });
  app.atmosphere?.setFog({ color: toCss(s.fogColor), density: 0.004 });

  const sun = app.nodes.require("sun");
  sun.setPosition(...s.sunPos);
  sun.setLight?.({ color: toCss(s.sunColor), intensity: s.sunIntensity });
  const moon = app.nodes.require("moon");
  moon.setPosition(...s.moonPos);
  moon.setLight?.({ intensity: s.moonIntensity });
  app.nodes.require("hemi").setLight?.({ color: toCss(s.hemiSky), intensity: s.hemiIntensity });

  applyWater(waterUniforms(s), clock);

  const theta = 0.6 + clock * 0.06;
  app.camera?.setPose({ position: [Math.cos(theta) * CAMERA_RADIUS, CAMERA_HEIGHT, Math.sin(theta) * CAMERA_RADIUS], target: CAMERA_TARGET }, { cut: true });
});

void app.ready().then(() => {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  }));
});
