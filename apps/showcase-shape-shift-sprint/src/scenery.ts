/**
 * Shape Shift Sprint scenery (presentation only): "Toybox Skyway". The cream road is a sky bridge on candy
 * pillars above a sea of cloud, with floating toy islands (grass caps on rock undersides, giant sphere / cube /
 * pyramid toys, lollipop trees, shape-sorter arches and turret towers) drifting past in three parallax layers,
 * a painted sky dome with a warm horizon, sun glow and drifting cloud bands, and distance fog on every surface.
 *
 * Everything here is a pure function of the simulation's `scroll` and `elapsed`; it never reads or advances the
 * gameplay RNG, never touches collision, scoring or timing, and draws with game-local `material.custom` programs.
 */
import { geometry, material } from "@aura3d/engine";
import { hexToLinear, type CustomSpec, type MeshData, type Rgb } from "../../../examples/shared/runner-kit/index";
import { boxMesh, coneMesh, groundQuad, mergeMeshes, sphereMesh, ROAD_DIMS } from "./meshes";

/* ------------------------------------------------------------------ palette */

export const SCENERY = {
  /** Fog colour = the sky's horizon so far surfaces melt into it. */
  fog: "#fbe6d2",
  /** Fog colour for surfaces far below the road (the cloud sea haze). */
  fogLow: "#e7e1f4",
  fogStart: 34,
  fogDensity: 0.0125,
  grass: ["#7cc95a", "#5fb34e", "#9bd86a"],
  rockTop: "#d9a47a",
  rockMid: "#b9785a",
  rockBottom: "#7f5a6e",
  trunk: "#9a6a4a",
  crowns: ["#ff8fb1", "#7fd36b", "#ffb347", "#b48cf0"],
  toys: ["#e8453c", "#f7c531", "#2f6fe4"],
  pastels: ["#ffb3a7", "#ffe08a", "#9fc2ff", "#c7f0d8", "#e3c8ff"],
  cream: "#fff3e0",
  coral: "#ff8a7a",
  mint: "#8fe0c4",
  cloudTop: "#ffffff",
  cloudShade: "#e9e6f7"
} as const;

const L = (hex: string): Rgb => hexToLinear(hex);

/* ------------------------------------------------------------------ shaders */

const SHOULDER = /* glsl */ `
vec3 shoulder(vec3 c) {
  const float k = 0.82;
  vec3 over = max(c - k, vec3(0.0));
  return min(c, vec3(k)) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}`;

const VERTEX = (tone: boolean): string => /* glsl */ `
${tone ? "in vec3 tone;\nout vec3 vTone;" : ""}
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  ${tone ? "vTone = tone;" : ""}
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/**
 * Toybox toon: the runner-kit's soft two-band ramp and hemisphere, re-aimed with a warm key from behind the camera,
 * a cool front fill, a warm-white fresnel rim (rounded toy plastic), and exponential distance fog that also hazes
 * anything far below the road into the cloud sea. Colours are linear; the engine encodes to sRGB on output.
 */
const FRAGMENT = (tone: boolean, stripes = false): string => /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
${tone ? "in vec3 vTone;" : ""}
out vec4 outColor;
${SHOULDER}
float ramp(float d) {
  float c = d * 0.5 + 0.5;
  float fw = fwidth(c) * 0.5;
  return mix(0.68, 1.0, smoothstep(0.66 - fw, 0.66 + fw, c));
}
void main() {
  vec3 N = normalize(vNormal);
  vec3 toCam = cameraPosition - vWorld;
  if (dot(N, toCam) < 0.0) N = -N;
  vec3 V = normalize(toCam);
  vec3 base = baseColor${tone ? " * vTone" : ""};
${stripes ? "  base = mix(stripeA, stripeB, step(0.5, fract(vWorld.z / stripePeriod)));" : ""}
  vec3 skyC = vec3(0.86, 0.93, 1.0);
  vec3 groundC = vec3(0.36, 0.30, 0.46);
  vec3 hemi = mix(groundC, skyC, 0.5 * N.y + 0.5) * 0.46;
  vec3 L1 = normalize(vec3(5.0, 11.0, 7.5));
  vec3 L2 = normalize(vec3(-7.0, 6.0, -6.0));
  vec3 lit = hemi + vec3(0.70, 0.62, 0.50) * ramp(dot(N, L1)) + vec3(0.22, 0.30, 0.52) * ramp(dot(N, L2));
  vec3 c = shoulder(base * lit);
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  c += vec3(1.0, 0.86, 0.72) * rim * rimStrength;
  c += emissive;
  float d = length(toCam);
  float f = 1.0 - exp(-max(d - fogStart, 0.0) * fogDensity);
  float low = clamp((-vWorld.y - 6.0) / 26.0, 0.0, 1.0);
  vec3 fc = mix(fogColor, fogLow, low);
  f = clamp(max(f, low * 0.45), 0.0, 1.0);
  outColor = vec4(mix(c, fc, f), alpha);
}`;

export interface ToyToonOptions {
  /** Candy stripes along world z: [colour A, colour B, period]; replaces the base colour. */
  readonly stripes?: readonly [Rgb, Rgb, number];
  readonly emissive?: Rgb;
  readonly rim?: number;
  readonly tone?: boolean;
  /** Surfaces that must stay crisp at gameplay distance (walls, road) can push the fog start out. */
  readonly fogStart?: number;
}

/** The game's lit surface program (road, walls, player, tokens, particles and all scenery). */
export function toyToonSpec(base: Rgb, options: ToyToonOptions = {}): CustomSpec {
  const tone = options.tone ?? false;
  return {
    glsl: { vertex: VERTEX(tone), fragment: FRAGMENT(tone, options.stripes !== undefined) },
    uniforms: {
      baseColor: { type: "color3", value: [...base] },
      emissive: { type: "color3", value: [...(options.emissive ?? [0, 0, 0])] },
      alpha: { type: "f32", value: 1 },
      rimStrength: { type: "f32", value: options.rim ?? 0.22 },
      fogColor: { type: "color3", value: [...L(SCENERY.fog)] },
      fogLow: { type: "color3", value: [...L(SCENERY.fogLow)] },
      fogStart: { type: "f32", value: options.fogStart ?? SCENERY.fogStart },
      fogDensity: { type: "f32", value: SCENERY.fogDensity },
      ...(options.stripes ? {
        stripeA: { type: "color3" as const, value: [...options.stripes[0]] },
        stripeB: { type: "color3" as const, value: [...options.stripes[1]] },
        stripePeriod: { type: "f32" as const, value: options.stripes[2] }
      } : {})
    },
    side: "double"
  };
}

const SKY_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/**
 * Painted day sky: deep zenith blue to a peach horizon, a warm sun glow low over the road's far left, two bands of
 * soft value-noise cloud that drift slowly with uTime, and a lavender-white haze below the horizon that matches the
 * cloud-sea fog.
 */
const SKY_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  float y = dir.y;
  vec3 zenith = vec3(0.090, 0.330, 0.760);
  vec3 mid = vec3(0.300, 0.620, 0.900);
  vec3 low = vec3(0.700, 0.820, 0.920);
  vec3 horizon = fogColor;
  vec3 c = mix(horizon, low, smoothstep(0.0, 0.10, y));
  c = mix(c, mid, smoothstep(0.08, 0.32, y));
  c = mix(c, zenith, smoothstep(0.30, 0.85, y));
  vec3 sun = normalize(vec3(-0.55, 0.16, -0.82));
  float s = max(dot(dir, sun), 0.0);
  c += vec3(1.0, 0.62, 0.34) * (pow(s, 6.0) * 0.28 + pow(s, 48.0) * 0.45) + vec3(1.0, 0.95, 0.85) * pow(s, 900.0) * 3.0;
  float az = atan(dir.x, -dir.z);
  float t = uTime * 0.004;
  vec2 q = vec2(az * 3.2 + t, y * 13.0);
  float band = smoothstep(0.015, 0.09, y) * (1.0 - smoothstep(0.20, 0.42, y));
  float cl = smoothstep(0.50, 0.78, fbm(q) * 0.85 + fbm(q * 2.7 + 3.1) * 0.3) * band;
  float hi = (1.0 - smoothstep(0.55, 0.9, y)) * smoothstep(0.32, 0.5, y);
  float cl2 = smoothstep(0.58, 0.8, fbm(vec2(az * 2.0 - t * 1.6, y * 5.0) + 11.0)) * hi * 0.7;
  vec3 cloudLit = mix(vec3(0.93, 0.89, 0.97), vec3(1.0, 0.97, 0.92), smoothstep(0.0, 0.3, y));
  c = mix(c, cloudLit + vec3(1.0, 0.7, 0.45) * pow(s, 4.0) * 0.35, cl * 0.92);
  c = mix(c, vec3(0.97, 0.97, 1.0), cl2);
  c = mix(c, fogLow, smoothstep(0.0, -0.18, y));
  outColor = vec4(c, 1.0);
}`;

export function toySkySpec(): CustomSpec {
  return {
    glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
    uniforms: {
      fogColor: { type: "color3", value: [...L(SCENERY.fog)] },
      fogLow: { type: "color3", value: [...L(SCENERY.fogLow)] }
    },
    side: "double",
    depthWrite: false
  };
}

const CONTACT_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/** Soft ambient-occlusion band: dark at uv.y 0 (the object's foot), fading to nothing at uv.y 1 and at the ends. */
const CONTACT_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
void main() {
  float ends = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);
  float a = alpha * pow(1.0 - clamp(vUv.y, 0.0, 1.0), 2.2) * ends;
  outColor = vec4(baseColor, a);
}`;

/** Soft glowing ring over a unit quad's uv (the wildcard halo under the player). */
const RING_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float band = smoothstep(0.62, 0.78, d) * (1.0 - smoothstep(0.86, 1.0, d));
  float inner = (1.0 - smoothstep(0.0, 0.8, d)) * 0.25;
  outColor = vec4(baseColor, alpha * (band + inner));
}`;

export function ringSpec(base: Rgb, alpha: number): CustomSpec {
  return {
    glsl: { vertex: CONTACT_VERTEX, fragment: RING_FRAGMENT },
    uniforms: { baseColor: { type: "color3", value: [...base] }, alpha: { type: "f32", value: alpha } },
    transparent: true,
    depthWrite: false,
    side: "double"
  };
}

export function contactSpec(alpha = 0.32): CustomSpec {
  return {
    glsl: { vertex: CONTACT_VERTEX, fragment: CONTACT_FRAGMENT },
    uniforms: { baseColor: { type: "color3", value: [0.09, 0.06, 0.16] }, alpha: { type: "f32", value: alpha } },
    transparent: true,
    depthWrite: false,
    side: "double"
  };
}

/* ------------------------------------------------------------------ toned meshes */

/** A mesh plus one linear RGB tone per vertex (multiplied with the program's base colour). */
export interface ToneMesh {
  readonly mesh: MeshData;
  readonly tones: number[];
}

interface Xform { tx?: number; ty?: number; tz?: number; sx?: number; sy?: number; sz?: number; ry?: number; rz?: number }

function xform(m: MeshData, t: Xform): MeshData {
  const { tx = 0, ty = 0, tz = 0, sx = 1, sy = 1, sz = 1, ry = 0, rz = 0 } = t;
  const cy = Math.cos(ry), sy_ = Math.sin(ry), cz = Math.cos(rz), sz_ = Math.sin(rz);
  const out: MeshData = { positions: [], normals: [], uvs: [...m.uvs], indices: [...m.indices] };
  for (let i = 0; i < m.positions.length; i += 3) {
    let x = (m.positions[i] as number) * sx, y = (m.positions[i + 1] as number) * sy, z = (m.positions[i + 2] as number) * sz;
    let nx = (m.normals[i] as number) / sx, ny = (m.normals[i + 1] as number) / sy, nz = (m.normals[i + 2] as number) / sz;
    // roll about z, then yaw about y
    [x, y] = [x * cz - y * sz_, x * sz_ + y * cz];
    [nx, ny] = [nx * cz - ny * sz_, nx * sz_ + ny * cz];
    [x, z] = [x * cy + z * sy_, -x * sy_ + z * cy];
    [nx, nz] = [nx * cy + nz * sy_, -nx * sy_ + nz * cy];
    const n = Math.hypot(nx, ny, nz) || 1;
    out.positions.push(x + tx, y + ty, z + tz);
    out.normals.push(nx / n, ny / n, nz / n);
  }
  return out;
}

function toned(m: MeshData, hex: string | ((x: number, y: number, z: number) => Rgb)): ToneMesh {
  const tones: number[] = [];
  const fixed = typeof hex === "string" ? L(hex) : null;
  for (let i = 0; i < m.positions.length; i += 3) {
    const c = fixed ?? (hex as (x: number, y: number, z: number) => Rgb)(m.positions[i] as number, m.positions[i + 1] as number, m.positions[i + 2] as number);
    tones.push(c[0], c[1], c[2]);
  }
  return { mesh: m, tones };
}

function mergeToned(parts: readonly ToneMesh[]): ToneMesh {
  return { mesh: mergeMeshes(parts.map((p) => p.mesh)), tones: parts.flatMap((p) => p.tones) };
}

/** Open-ended frustum (radius r0 at y0, r1 at y1) with optional caps; smooth side normals. */
function frustumMesh(r0: number, r1: number, y0: number, y1: number, radial: number, caps = true): MeshData {
  const m: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  const h = y1 - y0, slope = (r0 - r1) / h, nl = Math.hypot(1, slope);
  for (let k = 0; k <= radial; k++) {
    const a = (k / radial) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
    m.positions.push(r0 * s, y0, r0 * c, r1 * s, y1, r1 * c);
    m.normals.push(s / nl, slope / nl, c / nl, s / nl, slope / nl, c / nl);
    m.uvs.push(k / radial, 0, k / radial, 1);
  }
  for (let k = 0; k < radial; k++) {
    const a = k * 2;
    m.indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  if (caps) {
    for (const [r, y, ny] of [[r1, y1, 1], [r0, y0, -1]] as const) {
      if (r <= 0) continue;
      const centre = m.positions.length / 3;
      m.positions.push(0, y, 0); m.normals.push(0, ny, 0); m.uvs.push(0.5, 0.5);
      for (let k = 0; k <= radial; k++) {
        const a = (k / radial) * Math.PI * 2;
        m.positions.push(r * Math.sin(a), y, r * Math.cos(a)); m.normals.push(0, ny, 0); m.uvs.push(0.5 + 0.5 * Math.sin(a), 0.5 + 0.5 * Math.cos(a));
      }
      for (let k = 0; k < radial; k++) {
        if (ny > 0) m.indices.push(centre, centre + k + 1, centre + k + 2);
        else m.indices.push(centre, centre + k + 2, centre + k + 1);
      }
    }
  }
  return m;
}

/** Torus in the XY plane (ring axis along z): a shape-sorter arch when half of it sits below a grass cap. */
function torusMesh(R: number, r: number, radial: number, tubular: number): MeshData {
  const m: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  for (let j = 0; j <= radial; j++) {
    const v = (j / radial) * Math.PI * 2;
    for (let i = 0; i <= tubular; i++) {
      const u = (i / tubular) * Math.PI * 2;
      const cx = Math.cos(u) * R, cy = Math.sin(u) * R;
      const nx = Math.cos(u) * Math.cos(v), ny = Math.sin(u) * Math.cos(v), nz = Math.sin(v);
      m.positions.push(cx + nx * r, cy + ny * r, nz * r);
      m.normals.push(nx, ny, nz);
      m.uvs.push(i / tubular, j / radial);
    }
  }
  const row = tubular + 1;
  for (let j = 0; j < radial; j++) {
    for (let i = 0; i < tubular; i++) {
      const a = j * row + i, b = (j + 1) * row + i;
      m.indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return m;
}

/** Deterministic hash for the build-time jitter (no RNG stream involved). */
const jitter = (i: number, salt: number): number => {
  const s = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Rock underside of a floating island: a jagged inverted cone. Rings of vertices with hashed radial jitter, flat
 * per-face normals (faceted low-poly rock), tone banded from sandy top through terracotta to a mauve tip.
 */
function rockMesh(radius: number, depth: number, seed: number): ToneMesh {
  const radial = 11, rings = 4;
  const ringPts: [number, number, number][][] = [];
  for (let j = 0; j <= rings; j++) {
    const f = j / rings;
    const y = -depth * Math.pow(f, 0.9);
    const r = radius * (1 - f) * (1 - f * 0.15) + (j === rings ? 0 : 0.0);
    const pts: [number, number, number][] = [];
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2 + jitter(k + j * 7, seed) * 0.25;
      const rr = j === rings ? 0 : r * (0.82 + jitter(k * 3 + j, seed + 1) * 0.3);
      pts.push([Math.sin(a) * rr, y + (j === 0 ? 0 : (jitter(k + j * 13, seed + 2) - 0.5) * depth * 0.12), Math.cos(a) * rr]);
    }
    ringPts.push(pts);
  }
  const m: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]): void => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const n = Math.hypot(nx, ny, nz) || 1; nx /= n; ny /= n; nz /= n;
    const base = m.positions.length / 3;
    for (const p of [a, b, c]) { m.positions.push(...p); m.normals.push(nx, ny, nz); m.uvs.push(0, 0); }
    m.indices.push(base, base + 1, base + 2);
  };
  for (let j = 0; j < rings; j++) {
    const A = ringPts[j] as [number, number, number][], B = ringPts[j + 1] as [number, number, number][];
    for (let k = 0; k < radial; k++) {
      const k1 = (k + 1) % radial;
      tri(A[k]!, A[k1]!, B[k]!);
      if (j < rings - 1) tri(A[k1]!, B[k1]!, B[k]!);
    }
  }
  const top = L(SCENERY.rockTop), midC = L(SCENERY.rockMid), bot = L(SCENERY.rockBottom);
  return toned(m, (_x, y) => {
    const f = Math.min(1, Math.max(0, -y / depth));
    const a = f < 0.35 ? f / 0.35 : 1, b = f < 0.35 ? 0 : (f - 0.35) / 0.65;
    const c1: Rgb = [top[0] + (midC[0] - top[0]) * a, top[1] + (midC[1] - top[1]) * a, top[2] + (midC[2] - top[2]) * a];
    return [c1[0] + (bot[0] - c1[0]) * b, c1[1] + (bot[1] - c1[1]) * b, c1[2] + (bot[2] - c1[2]) * b];
  });
}

/** Grass cap: a slightly domed disc with a soft rounded lip, plus a thin earth band under it. */
function grassCap(radius: number, seed: number): ToneMesh {
  const grass = SCENERY.grass[seed % SCENERY.grass.length] as string;
  const lip = frustumMesh(radius * 1.02, radius * 0.97, -0.35, 0.18, 18, false);
  const dome = xform(sphereMesh(1, 18, 5), { sx: radius * 0.97, sy: 0.32, sz: radius * 0.97, ty: 0.12 });
  const earth = frustumMesh(radius * 0.98, radius * 1.02, -0.7, -0.33, 18, false);
  return mergeToned([toned(dome, grass), toned(lip, grass), toned(earth, SCENERY.rockTop)]);
}

function lollipopTree(x: number, z: number, h: number, crown: string, scale = 1): ToneMesh {
  const trunk = xform(frustumMesh(0.16, 0.11, 0, h, 8), { tx: x, tz: z, sx: scale, sy: scale, sz: scale });
  const ball = xform(sphereMesh(0.75, 12, 8), { tx: x, ty: (h + 0.45) * scale, tz: z, sx: scale, sy: scale * 0.92, sz: scale });
  return mergeToned([toned(trunk, SCENERY.trunk), toned(ball, crown)]);
}

function turret(x: number, z: number, h: number, wall: string, roof: string): ToneMesh {
  const body = xform(frustumMesh(0.75, 0.68, 0, h, 16), { tx: x, tz: z });
  const band = xform(frustumMesh(0.84, 0.84, h - 0.05, h + 0.25, 16), { tx: x, tz: z });
  const cone = xform(coneMesh(0.95, 1.5, 16, 0), { tx: x, ty: h + 0.25 + 0.75, tz: z });
  const door = xform(boxMesh(0.36, 0.6, 0.1), { tx: x, ty: 0.3, tz: z + 0.7 });
  return mergeToned([toned(body, wall), toned(band, SCENERY.cream), toned(cone, roof), toned(door, "#6a4a5a")]);
}

export type IslandVariant = "monument" | "grove" | "arch" | "turret" | "islet";

/** One floating island as a single toned mesh (unit-ish scale: cap radius 3). */
export function islandMesh(variant: IslandVariant, seed: number): ToneMesh {
  const R = variant === "islet" ? 1.8 : 3;
  const parts: ToneMesh[] = [rockMesh(R * 1.02, R * 1.5, seed), grassCap(R, seed)];
  const toy = (i: number): string => SCENERY.toys[(i + seed) % 3] as string;
  const pastel = (i: number): string => SCENERY.pastels[(i + seed) % SCENERY.pastels.length] as string;
  const crown = (i: number): string => SCENERY.crowns[(i + seed) % SCENERY.crowns.length] as string;
  if (variant === "monument") {
    parts.push(toned(xform(boxMesh(1.7, 1.7, 1.7), { ty: 0.95, ry: 0.5 }), toy(1)));
    parts.push(toned(sphereMesh(0.9, 14, 10, 0, 2.7, 0), toy(0)));
    parts.push(toned(xform(coneMesh(0.75, 1.4, 4, 0), { tx: 1.7, ty: 0.75, tz: 0.8, ry: 0.3 }), toy(2)));
    parts.push(toned(sphereMesh(0.32, 10, 8, 0.9, 0.35, -1.6), pastel(1)));
    parts.push(lollipopTree(-1.8, 0.6, 1.3, crown(0)));
    parts.push(lollipopTree(-1.0, -1.7, 1.0, crown(1), 0.8));
  } else if (variant === "grove") {
    parts.push(lollipopTree(0, 0, 1.7, crown(0), 1.2));
    parts.push(lollipopTree(1.6, 0.9, 1.2, crown(1)));
    parts.push(lollipopTree(-1.5, 1.0, 1.0, crown(2), 0.85));
    parts.push(lollipopTree(-0.6, -1.7, 1.3, crown(3), 0.95));
    parts.push(toned(sphereMesh(0.45, 12, 8, 1.4, 0.4, -1.2), toy(0)));
    parts.push(toned(xform(boxMesh(0.7, 0.7, 0.7), { tx: 2.0, ty: 0.45, tz: -0.2, ry: 0.7 }), toy(1)));
  } else if (variant === "arch") {
    parts.push(toned(xform(torusMesh(1.6, 0.42, 8, 24), { ty: 0.3 }), pastel(0)));
    parts.push(toned(xform(boxMesh(1.0, 1.0, 1.0), { tx: 1.9, ty: 0.6, tz: 1.0, ry: 0.4 }), toy(1)));
    parts.push(toned(sphereMesh(0.55, 14, 10, -2.0, 0.65, 0.9), toy(0)));
    parts.push(toned(xform(coneMesh(0.6, 1.2, 4, 0), { tx: -1.2, ty: 0.7, tz: -1.6 }), toy(2)));
    parts.push(lollipopTree(1.2, -1.6, 1.1, crown(2), 0.9));
  } else if (variant === "turret") {
    parts.push(turret(0, -0.3, 2.6, SCENERY.cream, toy(2)));
    parts.push(turret(1.6, 1.0, 1.5, pastel(1), toy(0)));
    parts.push(lollipopTree(-1.7, 0.9, 1.2, crown(1)));
    parts.push(toned(xform(boxMesh(0.8, 0.8, 0.8), { tx: -1.2, ty: 0.5, tz: -1.6, ry: 0.3 }), toy(1)));
  } else {
    parts.push(lollipopTree(0.2, 0.1, 1.0, crown(0), 0.9));
    parts.push(toned(sphereMesh(0.38, 10, 8, -0.8, 0.35, 0.5), toy(seed)));
  }
  return mergeToned(parts);
}

/** A pastel puff cloud: five squashed spheres, flat-bottomed. */
export function puffMesh(seed: number, widthSegments = 12, heightSegments = 8): ToneMesh {
  const parts: MeshData[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 1.5 + (jitter(i, seed) - 0.5) * 0.8;
    const r = 1.2 + jitter(i, seed + 3) * 1.1 - Math.abs(i - (n - 1) / 2) * 0.25;
    parts.push(sphereMesh(r, widthSegments, heightSegments, x, r * 0.35, (jitter(i, seed + 5) - 0.5) * 1.2));
  }
  const m = mergeMeshes(parts);
  for (let i = 1; i < m.positions.length; i += 3) m.positions[i] = Math.max(-0.1, m.positions[i] as number);
  const top = L(SCENERY.cloudTop), shade = L(SCENERY.cloudShade);
  return toned(m, (_x, y) => {
    const f = Math.min(1, Math.max(0, y / 1.4));
    return [shade[0] + (top[0] - shade[0]) * f, shade[1] + (top[1] - shade[1]) * f, shade[2] + (top[2] - shade[2]) * f];
  });
}

/** A tile of the cloud sea: many low puffs over `w` x `d`, tops lit, undersides lavender. */
export function cloudSeaTile(w: number, d: number, seed: number): ToneMesh {
  const parts: ToneMesh[] = [];
  const count = 46;
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    // keep the strip under the road thinner so the pillars read, fill the flanks
    const x = side * (3 + Math.pow(jitter(i, seed), 0.8) * (w / 2 - 3));
    const z = (jitter(i, seed + 9) - 0.5) * d;
    const s = 2.2 + jitter(i, seed + 4) * 2.6;
    const p = puffMesh(seed * 31 + i, 10, 7);
    parts.push({ mesh: xform(p.mesh, { tx: x, tz: z, sx: s, sy: s * 0.55, sz: s, ry: jitter(i, seed + 7) * 6.28 }), tones: p.tones });
  }
  return mergeToned(parts);
}

/** Candy pillar holding the sky bridge: cream column with coral bands, flared capital and a cloud-wrapped foot. */
export function pillarMesh(): ToneMesh {
  const parts: ToneMesh[] = [];
  parts.push(toned(frustumMesh(1.0, 0.75, -26, -1.2, 18, false), SCENERY.cream));
  for (let i = 0; i < 6; i++) parts.push(toned(frustumMesh(0.98 - i * 0.01 + 0.06, 0.95 - i * 0.01 + 0.06, -3.2 - i * 3.6, -2.6 - i * 3.6, 18, false), i % 2 === 0 ? SCENERY.coral : SCENERY.mint));
  parts.push(toned(frustumMesh(0.78, 1.5, -1.6, -0.75, 18, true), SCENERY.cream));
  return mergeToned(parts);
}

/**
 * Road skirt: the bridge deck's side fascia (below the road surface) and a raised curb each side, as one long static
 * strip from `zNear` to `zFar`. Candy stripes come from the stripe program (world z), and the node only shifts by the
 * road scroll modulo the stripe period, so the stripes travel with the road without per-segment geometry.
 */
export const SKIRT_DIMS = { depth: 0.75, curbWidth: 0.32, curbHeight: 0.16, zNear: 24, zFar: -232, period: 4 } as const;

export function skirtMesh(): MeshData {
  const w = ROAD_DIMS.width, { depth, curbWidth, curbHeight, zNear, zFar } = SKIRT_DIMS;
  const len = zNear - zFar, cz = (zNear + zFar) / 2;
  const curbX = w / 2 + curbWidth / 2;
  return mergeMeshes([
    boxMesh(w + curbWidth * 2, depth, len, 0, -depth / 2 - 0.02, cz),
    boxMesh(curbWidth, curbHeight, len, -curbX, curbHeight / 2 - 0.02, cz),
    boxMesh(curbWidth, curbHeight, len, curbX, curbHeight / 2 - 0.02, cz)
  ]);
}

/** Contact band in front of each wall cell foot (uv.y 0 at the wall). */
export function wallContactMesh(width: number, depth: number): MeshData {
  const q = groundQuad(width, depth, 0, depth / 2);
  // groundQuad uv: (0,0) at -x,-z ... (1,1) at +x,+z; -z edge is the wall side, so uv.y already runs 0 -> 1 away from it.
  return q;
}

/* ------------------------------------------------------------------ layout */

export interface ScenePiece {
  readonly id: string;
  readonly variant: IslandVariant | "puff";
  readonly layer: 0 | 1 | 2;
  readonly x: number;
  readonly y: number;
  readonly z0: number;
  readonly scale: number;
  readonly yaw: number;
}

/** Parallax factor per layer (fraction of the road scroll), loop span and near / far bounds. */
export const LAYERS = [
  { k: 0.55, span: 190, near: 24 },
  { k: 0.3, span: 230, near: 30 },
  { k: 0.12, span: 300, near: 40 }
] as const;

const VARIANTS: readonly IslandVariant[] = ["monument", "grove", "arch", "turret", "islet", "grove", "monument", "turret", "arch", "islet"];

export const PIECES: readonly ScenePiece[] = (() => {
  const out: ScenePiece[] = [];
  const counts = [12, 9, 7];
  for (let layer = 0 as 0 | 1 | 2; layer < 3; layer = (layer + 1) as 0 | 1 | 2) {
    const n = counts[layer] as number, span = LAYERS[layer].span;
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const variant = VARIANTS[(i * 3 + layer * 2) % VARIANTS.length] as IslandVariant;
      const near = layer === 0;
      const x = side * (near ? 13 + jitter(i, 21) * 9 : layer === 1 ? 30 + jitter(i, 22) * 16 : 60 + jitter(i, 23) * 40);
      const y = near ? -2.5 + jitter(i, 24) * 5 : layer === 1 ? -4 + jitter(i, 25) * 10 : -2 + jitter(i, 26) * 18;
      const scale = (near ? 1.0 + jitter(i, 27) * 0.5 : layer === 1 ? 1.8 + jitter(i, 28) * 0.9 : 3.2 + jitter(i, 29) * 2.2) * (variant === "islet" ? 1.1 : 1);
      out.push({ id: `isle-${layer}-${i}`, variant, layer, x, y, z0: (i / n) * span + jitter(i, 30 + layer) * (span / n) * 0.6, scale, yaw: jitter(i, 31) * Math.PI * 2 });
    }
  }
  // Drifting puff clouds at and above road height, near and mid layer.
  for (let i = 0; i < 10; i++) {
    const layer = (i < 6 ? 0 : 1) as 0 | 1;
    const side = i % 2 === 0 ? 1 : -1;
    out.push({
      id: `puff-${i}`, variant: "puff", layer,
      x: side * (layer === 0 ? 15 + jitter(i, 41) * 12 : 28 + jitter(i, 42) * 20),
      y: layer === 0 ? 7 + jitter(i, 43) * 8 : 11 + jitter(i, 44) * 12,
      z0: (i / 10) * LAYERS[layer].span + jitter(i, 45) * 12,
      scale: layer === 0 ? 0.6 + jitter(i, 46) * 0.5 : 1.1 + jitter(i, 47) * 0.8,
      yaw: jitter(i, 48) * 0.6 - 0.3
    });
  }
  return out;
})();

/** World z of a piece for a given road scroll: wraps inside the layer's loop, ahead of the camera. */
export function pieceZ(p: ScenePiece, scroll: number): number {
  const { k, span, near } = LAYERS[p.layer];
  const far = near - span;
  return ((((p.z0 + scroll * k) % span) + span) % span) + far;
}

export const PILLAR_SPACING = 26;
export const PILLAR_COUNT = 9;
export const SEA_TILE = { w: 360, d: 120, count: 3, y: -21 } as const;

/** Every scenery program (for the GLSL compile test). */
export function sceneryProgramSpecs(): readonly { readonly name: string; readonly spec: CustomSpec }[] {
  return [
    { name: "toy-sky", spec: toySkySpec() },
    { name: "toy-toon", spec: toyToonSpec([1, 1, 1]) },
    { name: "toy-toon-tone", spec: toyToonSpec([1, 1, 1], { tone: true }) },
    { name: "toy-toon-stripes", spec: toyToonSpec([1, 1, 1], { stripes: [[1, 0, 0], [1, 1, 1], 4] }) },
    { name: "contact", spec: contactSpec() }
  ];
}

/** `geometry.dynamic` spec from a toned mesh (static after mount; the node transform moves it). */
export function tonedGeometry(t: ToneMesh) {
  return geometry.dynamic({
    positions: Float32Array.from(t.mesh.positions), normals: Float32Array.from(t.mesh.normals),
    uvs: Float32Array.from(t.mesh.uvs), indices: Uint32Array.from(t.mesh.indices),
    attributes: { tone: { itemSize: 3, data: Float32Array.from(t.tones) } }
  });
}

export const toyMaterial = (base: Rgb, options?: ToyToonOptions) => material.custom(toyToonSpec(base, options));
