/**
 * Number Surge scenery (presentation only): a synthwave "number city" around the highway.
 *
 * Layers, far to near: the striped dusk sun and stars in the sky dome; two rings of neon-ridged mountains; a scrolling
 * magenta grid floor 14 m below the road; two rows of skyscrapers per side with lit windows and neon roof lines; road
 * pylons; floating rock islands carrying giant glowing arithmetic glyphs (cyan = good ops, magenta = bad ops, gold
 * digits, the same colour language as the gates); and drifting data motes beside the road.
 *
 * Everything here is a pure function of the shown scroll distance and time. It never reads or writes the simulation's
 * state or its random stream (layout variety comes from a fixed hash), so gameplay is unchanged.
 */
import { geometry, material, scene, type AuraApp } from "@aura3d/engine";
import { Batch, hexToLinear, mergeMeshes, type CustomSpec, type MeshData, type Rgb } from "../../../examples/shared/runner-kit/index";
import { boxMesh } from "./meshes";

type Scene = ReturnType<typeof scene>;
type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;

/* ------------------------------------------------------------ palette */

export const SCENERY = {
  floorY: -14,
  fog: "#5a2a8c",
  horizon: "#ff6fb8",
  grid: "#ff4fd8",
  gridBase: "#0c0722",
  facade: "#110b2c",
  mountainNear: "#1d1045",
  mountainFar: "#3a1f72",
  ridge: "#ff5fd0",
  rockTop: "#241a5c",
  rock: "#5a3596",
  glyphGood: "#3ef2ff",
  glyphBad: "#ff4fd8",
  glyphDigit: "#ffd84d"
} as const;

const L = (hex: string): Rgb => hexToLinear(hex);
const FOG = L(SCENERY.fog);
const HORIZON = L(SCENERY.horizon);

/** Deterministic presentation hash in [0, 1) (never the gameplay RNG). */
export const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/* ------------------------------------------------------------ shared GLSL */

const FOG_GLSL = /* glsl */ `
vec3 nsFogMix(vec3 col, vec3 world, float density) {
  float d = length(world - cameraPosition);
  float f = 1.0 - exp(-d * density);
  // haze gathers low (towards the grid floor) and towards the hot horizon
  float low = clamp((8.0 - world.y) / 30.0, 0.0, 1.0);
  vec3 fogCol = mix(nsFog, nsHorizon, clamp(f * 0.9 * (0.4 + 0.6 * low), 0.0, 1.0));
  return mix(col, fogCol, clamp(f * (0.75 + 0.25 * low), 0.0, 1.0));
}`;

const fogUniforms = (density: number) => ({
  nsFog: { type: "color3" as const, value: [...FOG] },
  nsHorizon: { type: "color3" as const, value: [...HORIZON] },
  nsDensity: { type: "f32" as const, value: density }
});

const LIT_VERTEX = (tone: boolean) => /* glsl */ `
${tone ? "in vec3 tone;\nout vec3 vTone;" : ""}
out vec3 vNormal;
out vec3 vWorld;
out vec3 vLocal;
out vec2 vUv;
void main() {
  ${tone ? "vTone = tone;" : ""}
  vUv = uv;
  vLocal = position;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/* ------------------------------------------------------------ sky dome: gradient, striped sun, stars */

export const SKY_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 dir = normalize(vWorld);
  float y = dir.y;
  vec3 zenith = vec3(0.004, 0.003, 0.03);
  vec3 upper = vec3(0.025, 0.010, 0.14);
  vec3 mid = vec3(0.13, 0.025, 0.32);
  vec3 low = vec3(0.62, 0.09, 0.42);
  vec3 hot = vec3(1.0, 0.33, 0.36);
  vec3 col = mix(low, hot, smoothstep(0.10, 0.0, y));
  col = mix(col, mid, smoothstep(0.06, 0.24, y));
  col = mix(col, upper, smoothstep(0.24, 0.55, y));
  col = mix(col, zenith, smoothstep(0.55, 1.0, y));
  if (y < 0.0) col = mix(hot * 0.55, vec3(0.05, 0.02, 0.12), smoothstep(0.0, -0.25, y));

  // stars in the upper half, twinkling slowly
  vec2 sp = vec2(atan(dir.x, -dir.z) * 90.0, asin(clamp(y, -1.0, 1.0)) * 90.0);
  vec2 cell = floor(sp);
  float star = step(0.985, h21(cell));
  vec2 f = fract(sp) - 0.5 - (vec2(h21(cell + 3.1), h21(cell + 7.7)) - 0.5) * 0.6;
  float tw = 0.6 + 0.4 * sin(uTime * (1.0 + 2.0 * h21(cell + 1.3)) + h21(cell) * 40.0);
  col += star * tw * smoothstep(0.12, 0.0, length(f)) * smoothstep(0.12, 0.4, y) * vec3(0.9, 0.85, 1.0) * 1.4;

  // the striped synthwave sun straight down the road
  vec3 sunDir = normalize(vec3(0.0, 0.085, -1.0));
  float ang = acos(clamp(dot(dir, sunDir), -1.0, 1.0));
  float radius = 0.24;
  float sv = (y - sunDir.y) / radius; // -1 bottom .. 1 top of the disc
  float bands = 1.0;
  if (sv < 0.25) {
    float k = (0.25 - sv) / 1.25;            // 0 at the first gap, 1 at the bottom
    float period = 0.16;
    float g = fract((sv - 0.25) / period);
    bands = step(0.18 + 0.55 * k, g);
  }
  float disc = smoothstep(radius, radius - 0.004, ang) * bands;
  vec3 sunCol = mix(vec3(1.0, 0.05, 0.4) * 1.1, vec3(1.0, 0.36, 0.06) * 1.25, smoothstep(-0.85, 0.8, sv));
  col = mix(col, sunCol, disc);
  // halo (bloom is not available on this output path, so the glow is painted)
  col += vec3(1.0, 0.25, 0.5) * (0.30 * exp(-ang * 5.0) + 0.25 * exp(-ang * 16.0)) * (1.0 - disc);
  outColor = vec4(col, 1.0);
}`;

export const SKY_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const synthSkySpec = (): CustomSpec => ({ glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT }, side: "double", depthWrite: false });

/* ------------------------------------------------------------ grid floor */

const GRID_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
out vec4 outColor;
${FOG_GLSL}
void main() {
  vec2 p = vec2(vWorld.x, vWorld.z - nsScroll);
  vec2 g = p / 6.0;
  vec2 w = fwidth(g) * 1.2;
  vec2 a = abs(fract(g - 0.5) - 0.5) / max(w, vec2(1e-4));
  float line = 1.0 - min(min(a.x, a.y), 1.0);
  float d = length(vWorld - cameraPosition);
  float near = 1.0 - smoothstep(40.0, 210.0, d);
  vec3 col = nsBase;
  // sun reflection streak running down the floor towards the camera
  float streak = exp(-abs(vWorld.x) / 26.0) * smoothstep(30.0, 230.0, d);
  col += vec3(1.0, 0.32, 0.5) * 0.28 * streak;
  col += nsLine * line * (0.35 + 1.3 * near);
  col = nsFogMix(col, vWorld, nsDensity);
  outColor = vec4(col, 1.0);
}`;

const gridSpec = (): CustomSpec => ({
  glsl: { vertex: LIT_VERTEX(false), fragment: GRID_FRAGMENT },
  uniforms: {
    nsBase: { type: "color3", value: [...L(SCENERY.gridBase)] },
    nsLine: { type: "color3", value: [...L(SCENERY.grid)].map((c) => c * 1.5) },
    nsScroll: { type: "f32", value: 0 },
    ...fogUniforms(0.0055)
  },
  side: "double"
});

/* ------------------------------------------------------------ mountains */

const MOUNTAIN_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
out vec4 outColor;
${FOG_GLSL}
void main() {
  float wy = fwidth(vUv.y);
  float ridge = smoothstep(1.0 - 3.0 * wy, 1.0 - 0.6 * wy, vUv.y);
  float contour = 1.0 - min(abs(fract(vWorld.y / 5.0) - 0.5) / max(fwidth(vWorld.y / 5.0) * 1.1, 1e-4), 1.0);
  vec3 col = mix(nsBase * 0.55, nsBase * 1.25, vUv.y);
  col += nsRidge * contour * 0.14 * vUv.y;
  col = nsFogMix(col, vWorld, nsDensity);
  col = mix(col, nsRidge * 1.6, ridge);
  outColor = vec4(col, 1.0);
}`;

const mountainSpec = (base: string, density: number): CustomSpec => ({
  glsl: { vertex: LIT_VERTEX(false), fragment: MOUNTAIN_FRAGMENT },
  uniforms: {
    nsBase: { type: "color3", value: [...L(base)] },
    nsRidge: { type: "color3", value: [...L(SCENERY.ridge)] },
    ...fogUniforms(density)
  },
  side: "double"
});

/** Ridge strip on an arc in front of the camera (angle 0 = straight down the road), lower in the middle so the sun shows. */
export function mountainRing(radius: number, peaks: number, minH: number, maxH: number, seed: number): MeshData {
  const m: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  const span = (110 * Math.PI) / 180;
  const n = peaks * 2;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = -span + 2 * span * t;
    const centre = Math.min(1, Math.abs(a) / 0.42);
    const peak = i % 2 === 1 ? 1 : 0.45 + 0.25 * hash(seed + i * 3.3);
    const h = (minH + (maxH - minH) * hash(seed + i) * peak) * (0.35 + 0.65 * centre * centre);
    const x = Math.sin(a) * radius, z = -Math.cos(a) * radius;
    m.positions.push(x, SCENERY.floorY - 2, z, x, SCENERY.floorY + h, z);
    m.normals.push(-Math.sin(a), 0, Math.cos(a), -Math.sin(a), 0, Math.cos(a));
    m.uvs.push(t, 0, t, 1);
    if (i < n) {
      const b = i * 2;
      m.indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  return m;
}

/* ------------------------------------------------------------ skyscrapers and pylons */

const TOWER_FRAGMENT = /* glsl */ `
in vec3 vTone;
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
out vec4 outColor;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
${FOG_GLSL}
void main() {
  vec3 N = normalize(vNormal);
  float side = 1.0 - step(0.6, abs(N.y));
  // cool facade, pink rim from the sun ahead, cyan bounce from the grid
  vec3 col = nsBase * (0.75 + 0.35 * max(N.y, 0.0));
  col += vec3(0.5, 0.12, 0.35) * 0.35 * max(-N.z, 0.0);
  col += vec3(0.05, 0.25, 0.4) * 0.12 * max(-N.y, 0.0);
  // windows (object-space so they ride with the scrolling frame)
  float along = abs(N.x) > 0.5 ? vLocal.z : vLocal.x;
  vec2 gc = vec2(along / 0.95, vLocal.y / 1.25);
  vec2 cell = floor(gc);
  vec2 f = fract(gc);
  float win = step(0.25, f.x) * step(f.x, 0.75) * step(0.32, f.y) * step(f.y, 0.68);
  float seed = vTone.r * 13.0 + vTone.b * 7.0;
  float on = step(0.62, h21(cell + seed));
  vec3 lamp = mix(vTone, vec3(1.0, 0.78, 0.35), step(0.7, h21(cell * 1.7 + seed)));
  float blur = clamp(max(fwidth(gc.x), fwidth(gc.y)) * 1.5 - 0.3, 0.0, 1.0);
  float lit = mix(win * on, 0.25 * 0.38, blur) * side * nsWindows;
  col = mix(col, lamp * 1.15, lit);
  // neon roof line and corner lines (screen-space thin)
  float wy = fwidth(vUv.y), wx = fwidth(vUv.x);
  float roof = smoothstep(1.0 - 3.0 * wy, 1.0 - 0.8 * wy, vUv.y) * side;
  float corner = max(smoothstep(2.2 * wx, 0.5 * wx, vUv.x), smoothstep(1.0 - 2.2 * wx, 1.0 - 0.5 * wx, vUv.x)) * side * nsCorners;
  col = nsFogMix(col, vWorld, nsDensity);
  col = mix(col, vTone * 2.0, max(roof, corner * 0.8) * (1.0 - 0.5 * clamp(length(vWorld - cameraPosition) / 260.0, 0.0, 1.0)));
  outColor = vec4(col, 1.0);
}`;

const towerSpec = (windows: number, corners: number, base: string): CustomSpec => ({
  glsl: { vertex: LIT_VERTEX(true), fragment: TOWER_FRAGMENT },
  uniforms: {
    nsBase: { type: "color3", value: [...L(base)] },
    nsWindows: { type: "f32", value: windows },
    nsCorners: { type: "f32", value: corners },
    ...fogUniforms(0.0062)
  },
  side: "double"
});

/* ------------------------------------------------------------ road deck and neon strips (replace the flat road look) */

const DECK_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
out vec4 outColor;
${FOG_GLSL}
void main() {
  // fine tile grid in object space, glossy horizon reflection towards the distance
  vec2 g = vec2(vLocal.x / 1.85, vLocal.z / 2.0);
  vec2 w = fwidth(g) * 1.1;
  vec2 a = abs(fract(g - 0.5) - 0.5) / max(w, vec2(1e-4));
  float line = 1.0 - min(min(a.x, a.y), 1.0);
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
  vec3 col = nsBase * 0.85;
  col += nsLine * line * 0.18;
  col += vec3(0.9, 0.25, 0.5) * 0.32 * fres;
  col += nsLine * 0.05 * (1.0 - smoothstep(0.0, 3.2, abs(vWorld.x)));
  col = nsFogMix(col, vWorld, nsDensity);
  outColor = vec4(col, 1.0);
}`;

export const deckSpec = (base: Rgb, line: Rgb): CustomSpec => ({
  glsl: { vertex: LIT_VERTEX(false), fragment: DECK_FRAGMENT },
  uniforms: { nsBase: { type: "color3", value: [...base] }, nsLine: { type: "color3", value: [...line] }, ...fogUniforms(0.006) },
  side: "double"
});

const STRIP_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const STRIP_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
void main() {
  float d = length(vWorld - cameraPosition);
  float fade = exp(-d * nsDensity);
  outColor = vec4(mix(nsHorizon * 0.6, baseColor, fade), alpha * mix(0.35, 1.0, fade));
}`;

/** Glowing neon strip (road edges, dashes): emissive above 1 so bloom picks it up, fading into the horizon haze. */
export const stripSpec = (base: Rgb, glow: number, alpha: number): CustomSpec => ({
  glsl: { vertex: STRIP_VERTEX, fragment: STRIP_FRAGMENT },
  uniforms: {
    baseColor: { type: "color3", value: base.map((c) => c * glow) },
    alpha: { type: "f32", value: alpha },
    nsHorizon: { type: "color3", value: [...HORIZON] },
    nsDensity: { type: "f32", value: 0.006 }
  },
  transparent: true,
  depthWrite: false,
  side: "double"
});

/* ------------------------------------------------------------ floating islands with glyphs */

const ROCK_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
out vec4 outColor;
${FOG_GLSL}
void main() {
  vec3 N = normalize(vNormal);
  float top = smoothstep(0.75, 0.9, N.y);
  vec3 rock = nsRock * (0.55 + 0.45 * clamp(0.5 + 0.5 * dot(N, normalize(vec3(-0.4, 0.5, -0.8))), 0.0, 1.0));
  rock += vec3(1.0, 0.3, 0.6) * 0.22 * pow(max(-N.z, 0.0), 2.0);
  float depth = clamp(-vLocal.y / (1.5 * nsR), 0.0, 1.0);
  rock = mix(rock, rock * 0.6 + vec3(0.35, 0.08, 0.3) * 0.5, depth);
  rock += nsGlow * (0.12 + 0.9 * smoothstep(0.55, 1.0, depth)) * max(-N.y, 0.15);
  vec2 g = vLocal.xz / 0.9;
  vec2 w = fwidth(g) * 1.2;
  vec2 a = abs(fract(g - 0.5) - 0.5) / max(w, vec2(1e-4));
  float line = 1.0 - min(min(a.x, a.y), 1.0);
  vec3 tile = nsTop + nsGlow * line * 0.55;
  vec3 col = mix(rock, tile, top);
  // glowing rim where the top meets the cliff
  col += nsGlow * 1.4 * smoothstep(0.55, 0.75, N.y) * (1.0 - top);
  col = nsFogMix(col, vWorld, nsDensity);
  outColor = vec4(col, 1.0);
}`;

const rockSpec = (glow: Rgb, r = 2.5): CustomSpec => ({
  glsl: { vertex: LIT_VERTEX(false), fragment: ROCK_FRAGMENT },
  uniforms: {
    nsRock: { type: "color3", value: [...L(SCENERY.rock)] },
    nsTop: { type: "color3", value: [...L(SCENERY.rockTop)] },
    nsGlow: { type: "color3", value: [...glow] },
    nsR: { type: "f32", value: r },
    ...fogUniforms(0.0065)
  },
  side: "double"
});

const GLYPH_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
out vec4 outColor;
${FOG_GLSL}
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float face = clamp(dot(N, V), 0.0, 1.0);
  float pulse = 0.9 + 0.1 * sin(uTime * 2.0 + nsPhase);
  vec3 col = baseColor * (0.55 + 1.35 * face) * pulse;
  col = nsFogMix(col, vWorld, nsDensity * 0.6);
  outColor = vec4(col, 1.0);
}`;

const glyphSpec = (color: Rgb, phase: number): CustomSpec => ({
  glsl: { vertex: LIT_VERTEX(false), fragment: GLYPH_FRAGMENT },
  uniforms: { baseColor: { type: "color3", value: [...color] }, nsPhase: { type: "f32", value: phase }, ...fogUniforms(0.0065) },
  side: "double"
});

const HALO_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = exp(-d * d * 3.5) * (1.0 - smoothstep(0.85, 1.0, d));
  outColor = vec4(baseColor, a * alpha);
}`;

/** Soft painted glow (glyph halos, neon edge glow): a radial or across-strip falloff over the quad's uv. */
export const haloSpec = (color: Rgb, alpha: number): CustomSpec => ({
  glsl: { vertex: "out vec2 vUv;\nvoid main() { vUv = uv; gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }", fragment: HALO_FRAGMENT },
  uniforms: { baseColor: { type: "color3", value: [...color] }, alpha: { type: "f32", value: alpha } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

const EDGE_GLOW_FRAGMENT = /* glsl */ `
in vec2 vUv;
in vec3 vWorld;
out vec4 outColor;
void main() {
  float d = abs(vUv.x - 0.5) * 2.0;
  float fade = exp(-length(vWorld - cameraPosition) * 0.008);
  outColor = vec4(baseColor, alpha * exp(-d * d * 5.0) * (1.0 - d) * fade);
}`;

export const edgeGlowSpec = (color: Rgb, alpha: number): CustomSpec => ({
  glsl: {
    vertex: "out vec2 vUv;\nout vec3 vWorld;\nvoid main() { vUv = uv; vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }",
    fragment: EDGE_GLOW_FRAGMENT
  },
  uniforms: { baseColor: { type: "color3", value: [...color] }, alpha: { type: "f32", value: alpha } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

/** Faceted floating rock: flat top of radius r at y 0, a skirt, and a jagged underside to a tip at -1.5 r. */
export function islandMesh(r: number, seed: number): MeshData {
  const sides = 9;
  const ring = (y: number, rad: number, jitter: number, s: number) =>
    Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2;
      const k = rad * (1 - jitter + 2 * jitter * hash(seed + s * 17 + i));
      return [Math.cos(a) * k, y, Math.sin(a) * k] as const;
    });
  const top = ring(0, r, 0.06, 1);
  const skirt = ring(-0.35 * r, r * 0.92, 0.1, 2);
  const mid = ring(-0.85 * r, r * 0.55, 0.18, 3);
  const tip = [0, -1.5 * r, 0] as const;
  const m: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  const tri = (p: readonly (readonly [number, number, number])[]) => {
    const [a, b, c] = p as [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const len = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
    n = n.map((x) => x / len);
    const base = m.positions.length / 3;
    for (const q of [a, b, c]) {
      m.positions.push(q[0], q[1], q[2]);
      m.normals.push(n[0]!, n[1]!, n[2]!);
      m.uvs.push(0, 0);
    }
    m.indices.push(base, base + 1, base + 2);
  };
  const centre = [0, 0, 0] as const;
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    tri([centre, top[j]!, top[i]!]);
    tri([top[i]!, top[j]!, skirt[j]!]);
    tri([top[i]!, skirt[j]!, skirt[i]!]);
    tri([skirt[i]!, skirt[j]!, mid[j]!]);
    tri([skirt[i]!, mid[j]!, mid[i]!]);
    tri([mid[i]!, mid[j]!, tip]);
  }
  // normals must face outward (and up on the top cap)
  for (let t = 0; t < m.indices.length; t += 3) {
    const k = m.indices[t]! * 3;
    const cx = (m.positions[k]! + m.positions[k + 3]! + m.positions[k + 6]!) / 3;
    const cy = (m.positions[k + 1]! + m.positions[k + 4]! + m.positions[k + 7]!) / 3;
    const cz = (m.positions[k + 2]! + m.positions[k + 5]! + m.positions[k + 8]!) / 3;
    const outward = cy > -1e-6 ? [0, 1, 0] : [cx, cy + 0.6 * r, cz];
    const dot = m.normals[k]! * outward[0]! + m.normals[k + 1]! * outward[1]! + m.normals[k + 2]! * outward[2]!;
    if (dot < 0) for (let q = 0; q < 9; q++) m.normals[k + q] = -m.normals[k + q]!;
  }
  return m;
}

/** Rotate a mesh about +z (glyph strokes). */
function rotZ(mesh: MeshData, angle: number): MeshData {
  const c = Math.cos(angle), s = Math.sin(angle);
  const p = mesh.positions.slice(), n = mesh.normals.slice();
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]!, y = p[i + 1]!;
    p[i] = x * c - y * s; p[i + 1] = x * s + y * c;
    const nx = n[i]!, ny = n[i + 1]!;
    n[i] = nx * c - ny * s; n[i + 1] = nx * s + ny * c;
  }
  return { positions: p, normals: n, uvs: mesh.uvs.slice(), indices: mesh.indices.slice() };
}

const SEGMENTS: Record<string, string> = {
  "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgecd", "7": "abc", "8": "abcdefg", "9": "abcdfg"
};

/** Chunky glyph, base at y 0, height h: seven-segment digits and + − × ÷. */
export function glyphMesh(ch: string, h: number): MeshData {
  const t = h * 0.16, d = h * 0.22, w = h * 0.56;
  const parts: MeshData[] = [];
  const segs = SEGMENTS[ch];
  if (segs) {
    const hx = w / 2, top = h - t / 2, mid = h / 2, bot = t / 2, vh = h / 2 - t * 0.5;
    const pos: Record<string, [number, number, number, number]> = {
      a: [0, top, w, t], g: [0, mid, w, t], d: [0, bot, w, t],
      f: [-hx + t / 2, (top + mid) / 2, t, vh], b: [hx - t / 2, (top + mid) / 2, t, vh],
      e: [-hx + t / 2, (mid + bot) / 2, t, vh], c: [hx - t / 2, (mid + bot) / 2, t, vh]
    };
    for (const s of segs) {
      const [x, y, sw, sh] = pos[s]!;
      parts.push(boxMesh(sw, sh, d, x, y, 0));
    }
  } else {
    const c = h / 2, len = h * 0.8;
    const bar = boxMesh(len, t * 1.1, d);
    const at = (m: MeshData, y: number): MeshData => ({ ...m, positions: m.positions.map((v, i) => (i % 3 === 1 ? v + y : v)) });
    if (ch === "+") parts.push(at(bar, c), at(rotZ(bar, Math.PI / 2), c));
    if (ch === "-") parts.push(at(bar, c));
    if (ch === "x") parts.push(at(rotZ(bar, Math.PI / 4), c), at(rotZ(bar, -Math.PI / 4), c));
    if (ch === "/") parts.push(at(bar, c), boxMesh(t * 1.3, t * 1.3, d, 0, c + h * 0.27, 0), boxMesh(t * 1.3, t * 1.3, d, 0, c - h * 0.27, 0));
  }
  return mergeMeshes(parts);
}

/** Vertical quad facing +z, centred at height cy, slightly behind the glyph. */
function haloQuad(size: number, cy: number): MeshData {
  const h = size / 2;
  return { positions: [-h, cy - h, -0.4, h, cy - h, -0.4, h, cy + h, -0.4, -h, cy + h, -0.4], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], uvs: [0, 0, 1, 0, 1, 1, 0, 1], indices: [0, 1, 2, 0, 2, 3] };
}

/* ------------------------------------------------------------ layout */

const AHEAD = 270;
const BEHIND = 24;

interface Row {
  readonly side: -1 | 1;
  readonly x0: number;
  readonly x1: number;
  readonly spacing: number;
  readonly count: number;
  readonly hMin: number;
  readonly hMax: number;
  readonly wMin: number;
  readonly wMax: number;
  readonly first: number;
}

const ROW_SPECS = [
  { side: -1, x0: 24, x1: 34, spacing: 19, hMin: 12, hMax: 40, wMin: 5, wMax: 9 },
  { side: 1, x0: 24, x1: 34, spacing: 19, hMin: 12, hMax: 40, wMin: 5, wMax: 9 },
  { side: -1, x0: 46, x1: 95, spacing: 14, hMin: 26, hMax: 92, wMin: 7, wMax: 14 },
  { side: 1, x0: 46, x1: 95, spacing: 14, hMin: 26, hMax: 92, wMin: 7, wMax: 14 }
] as const;

export const ROWS: readonly Row[] = (() => {
  let first = 0;
  return ROW_SPECS.map((r) => {
    const count = Math.ceil((AHEAD + BEHIND) / r.spacing) + 2;
    const row: Row = { ...r, count, first };
    first += count;
    return row;
  });
})();
const TOWER_COUNT = ROWS.reduce((s, r) => s + r.count, 0);

const TOWER_TONES: readonly Rgb[] = [L("#3ef2ff"), L("#ff4fd8"), L("#8a5cf5"), L("#3ef2ff"), L("#ff7a59")];

const PYLON_SPACING = 18;
const PYLON_COUNT = Math.ceil((AHEAD + BEHIND) / PYLON_SPACING) + 2;
const MOTE_SPACING = 3.2;
const MOTE_COUNT = Math.ceil((AHEAD * 0.45 + BEHIND) / MOTE_SPACING) + 2;

export interface Isle {
  readonly id: string;
  readonly side: -1 | 1;
  readonly x: number;
  readonly y: number;
  readonly z0: number;
  readonly r: number;
  readonly glyph: string;
  readonly color: Rgb;
}

const ISLE_SPAN = 210;
const ISLE_NEAR = 6;
const ISLE_FAR = ISLE_NEAR - ISLE_SPAN;
const GLYPHS = ["+", "7", "/", "x", "3", "-", "9", "+", "5", "x"] as const;
const glyphColor = (g: string): Rgb =>
  g === "+" || g === "x" ? L(SCENERY.glyphGood).map((c) => c * 1.9) as unknown as Rgb
    : g === "-" || g === "/" ? L(SCENERY.glyphBad).map((c) => c * 1.9) as unknown as Rgb
      : L(SCENERY.glyphDigit).map((c) => c * 1.7) as unknown as Rgb;

export const ISLES: readonly Isle[] = GLYPHS.map((glyph, i) => ({
  id: `isle-${i}`,
  side: (i % 2 === 0 ? -1 : 1) as -1 | 1,
  x: 11 + ((i * 7) % 5) * 2.2,
  y: 2.6 + ((i * 3) % 4) * 1.3,
  z0: (i / GLYPHS.length) * ISLE_SPAN + ((i * 11) % 7),
  r: 2.2 + ((i * 5) % 3) * 0.55,
  glyph,
  color: glyphColor(glyph)
}));

const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Island pose: scrolls at 0.6x the road (a middle parallax layer), grows in far away and out near the camera. */
export function islePose(p: Isle, scroll: number, time: number) {
  const z = ((((p.z0 + scroll * 0.6) % ISLE_SPAN) + ISLE_SPAN) % ISLE_SPAN) + ISLE_FAR;
  const fade = smooth((z - ISLE_FAR) / 30) * smooth((ISLE_NEAR - z) / 10);
  const bob = Math.sin(time * 0.7 + p.z0) * 0.35;
  return { x: p.side * p.x, y: p.y + bob, z, fade, yaw: -p.side * 0.38 + Math.sin(time * 0.35 + p.z0) * 0.12 };
}

/* ------------------------------------------------------------ build + bind */

export const SCENERY_BATCHES = ["grid", "mountains-far", "mountains-near", "towers", "pylons", "motes"] as const;

export interface SceneryRuntime {
  /** `travelled` is the shown distance down the road (grows as the ball moves forward). */
  update(travelled: number, time: number): void;
}

/** Programs for the shader compile test. */
export const sceneryProgramSpecs = (): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  { name: "synth-sky", spec: synthSkySpec() },
  { name: "grid", spec: gridSpec() },
  { name: "mountain", spec: mountainSpec(SCENERY.mountainNear, 0.004) },
  { name: "tower", spec: towerSpec(1, 1, SCENERY.facade) },
  { name: "deck", spec: deckSpec([0.02, 0.015, 0.07], [0.2, 0.9, 1]) },
  { name: "strip", spec: stripSpec([1, 0.1, 0.7], 1.6, 0.9) },
  { name: "rock", spec: rockSpec([0.2, 0.9, 1]) },
  { name: "glyph", spec: glyphSpec([1, 1, 1], 0) },
  { name: "halo", spec: haloSpec([1, 1, 1], 0.5) },
  { name: "edge-glow", spec: edgeGlowSpec([1, 0.1, 0.7], 0.5) }
];

export function addScenery(builder: Scene): { bind(app: AuraApp, node: (id: string) => NodeHandle): SceneryRuntime } {
  const add = (id: string, geo: ReturnType<typeof geometry.dynamic>, spec: CustomSpec): void => {
    builder.add(geometry.custom(geo, { name: id, material: material.custom(spec) }).runtime({ id }));
  };
  const dyn = (m: MeshData) =>
    geometry.dynamic({ positions: Float32Array.from(m.positions), normals: Float32Array.from(m.normals), uvs: Float32Array.from(m.uvs), indices: Uint32Array.from(m.indices) });

  const floor: MeshData = {
    positions: [-320, SCENERY.floorY, 40, 320, SCENERY.floorY, 40, 320, SCENERY.floorY, -300, -320, SCENERY.floorY, -300],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3]
  };
  add("grid", dyn(floor), gridSpec());
  add("mountains-far", dyn(mountainRing(272, 34, 18, 52, 91)), mountainSpec(SCENERY.mountainFar, 0.0024));
  add("mountains-near", dyn(mountainRing(238, 26, 10, 34, 17)), mountainSpec(SCENERY.mountainNear, 0.0034));

  const towers = new Batch(boxMesh(1, 1, 1, 0, 0.5, 0), TOWER_COUNT, [1, 1, 1]);
  builder.add(geometry.custom(towers.geometry(), { name: "towers", material: material.custom(towerSpec(1, 1, SCENERY.facade)) }).runtime({ id: "towers" }));
  const pylonMesh = mergeMeshes([
    boxMesh(0.7, 1, 0.7, -2.9, 0, 0),
    boxMesh(0.7, 1, 0.7, 2.9, 0, 0)
  ]);
  const pylons = new Batch(pylonMesh, PYLON_COUNT, L("#3ef2ff"));
  builder.add(geometry.custom(pylons.geometry(), { name: "pylons", material: material.custom(towerSpec(0, 1, "#120c2c")) }).runtime({ id: "pylons" }));
  const pylonCap = new Batch(boxMesh(7.6, 0.5, 1.2, 0, -0.45, 0), PYLON_COUNT, L("#ff4fd8"));
  builder.add(geometry.custom(pylonCap.geometry(), { name: "pylon-caps", material: material.custom(towerSpec(0, 0, "#1a1240")) }).runtime({ id: "pylon-caps" }));
  const motes = new Batch(boxMesh(0.14, 0.14, 0.14), MOTE_COUNT, [1, 1, 1]);
  builder.add(geometry.custom(motes.geometry(), {
    name: "motes",
    material: material.custom({
      glsl: { vertex: "in vec3 tone;\nout vec3 vTone;\nvoid main() { vTone = tone; gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }", fragment: "in vec3 vTone;\nout vec4 outColor;\nvoid main() { outColor = vec4(vTone, 1.0); }" },
      side: "double"
    })
  }).runtime({ id: "motes" }));

  for (const isle of ISLES) {
    add(`${isle.id}-rock`, dyn(islandMesh(isle.r, isle.z0)), rockSpec(isle.color.map((c) => c / 1.9) as unknown as Rgb, isle.r));
    add(`${isle.id}-halo`, dyn(haloQuad(isle.r * 4.2, isle.r * 0.75)), haloSpec(isle.color.map((c) => c / 1.9) as unknown as Rgb, 0.42));
    add(`${isle.id}-glyph`, dyn(glyphMesh(isle.glyph, isle.r * 1.5)), glyphSpec(isle.color, isle.z0));
  }

  return {
    bind(_app: AuraApp, node: (id: string) => NodeHandle): SceneryRuntime {
      const towerK = new Float64Array(TOWER_COUNT).fill(Number.NaN);
      const pylonK = new Float64Array(PYLON_COUNT).fill(Number.NaN);
      const moteK = new Float64Array(MOTE_COUNT).fill(Number.NaN);
      const grid = node("grid");
      for (const id of SCENERY_BATCHES) node(id);
      node("pylon-caps");

      function update(travelled: number, time: number): void {
        // Ahead of the ball is −z (the camera looks down −z), so run space decreases as the ball travels.
        const scroll = -travelled;
        /* towers: ring per row in run space (world z = runZ - scroll, ahead is runZ < scroll) */
        for (let r = 0; r < ROWS.length; r++) {
          const row = ROWS[r]!;
          const k0 = Math.floor((scroll - AHEAD) / row.spacing);
          for (let k = k0; k < k0 + row.count; k++) {
            const slot = row.first + (((k % row.count) + row.count) % row.count);
            if (towerK[slot] === k) continue;
            towerK[slot] = k;
            const seed = k * 13 + r * 101;
            const w = row.wMin + (row.wMax - row.wMin) * hash(seed + 1);
            const h = row.hMin + (row.hMax - row.hMin) * Math.pow(hash(seed + 2), 1.4);
            const dpt = w * (0.7 + 0.6 * hash(seed + 3));
            const x = row.side * (row.x0 + (row.x1 - row.x0) * hash(seed + 4) + w / 2);
            const z = k * row.spacing + (hash(seed + 5) - 0.5) * row.spacing * 0.5;
            towers.place(slot, x, SCENERY.floorY, z, 0, w, h, dpt);
            towers.setTone(slot, TOWER_TONES[Math.floor(hash(seed + 6) * TOWER_TONES.length)]!);
          }
        }
        /* pylons under the road */
        const p0 = Math.floor((scroll - AHEAD) / PYLON_SPACING);
        for (let k = p0; k < p0 + PYLON_COUNT; k++) {
          const slot = ((k % PYLON_COUNT) + PYLON_COUNT) % PYLON_COUNT;
          if (pylonK[slot] === k) continue;
          pylonK[slot] = k;
          const z = k * PYLON_SPACING;
          pylons.place(slot, 0, SCENERY.floorY / 2 - 0.4, z, 0, 1, -SCENERY.floorY, 1);
          pylonCap.place(slot, 0, 0, z, 0, 1, 1, 1);
        }
        /* data motes beside the road (off the lanes) */
        const m0 = Math.floor((scroll - AHEAD * 0.45) / MOTE_SPACING);
        for (let k = m0; k < m0 + MOTE_COUNT; k++) {
          const slot = ((k % MOTE_COUNT) + MOTE_COUNT) % MOTE_COUNT;
          if (moteK[slot] === k) continue;
          moteK[slot] = k;
          const side = hash(k * 3.7) < 0.5 ? -1 : 1;
          const x = side * (5 + 7 * hash(k * 5.1));
          const y = 0.6 + 7 * hash(k * 2.3);
          const z = k * MOTE_SPACING;
          motes.place(slot, x, y, z, hash(k) * 3, 1, 1, 1);
          const c = hash(k * 9.1);
          const tone = c < 0.4 ? L("#3ef2ff") : c < 0.75 ? L("#ff4fd8") : L("#ffd84d");
          motes.setTone(slot, [tone[0] * 2.4, tone[1] * 2.4, tone[2] * 2.4]);
        }
        const frameZ = -scroll;
        for (const id of ["towers", "pylons", "pylon-caps", "motes"]) node(id).setPosition(0, 0, frameZ);
        towers.flush(node("towers"));
        pylons.flush(node("pylons"));
        pylonCap.flush(node("pylon-caps"));
        motes.flush(node("motes"), false);
        grid.setUniform?.("nsScroll", travelled % 6000);

        for (const isle of ISLES) {
          const pose = islePose(isle, travelled, time);
          const visible = pose.fade > 0.02;
          const s = Math.max(0.001, pose.fade);
          node(`${isle.id}-rock`).setVisible(visible).setPosition(pose.x, pose.y, pose.z).setRotation(0, pose.yaw, 0).setScale(s);
          node(`${isle.id}-halo`).setVisible(visible).setPosition(pose.x, pose.y, pose.z).setRotation(0, pose.yaw, 0).setScale(s);
          node(`${isle.id}-glyph`).setVisible(visible).setPosition(pose.x, pose.y, pose.z).setRotation(0, pose.yaw, 0).setScale(s);
        }
      }
      return { update };
    }
  };
}
