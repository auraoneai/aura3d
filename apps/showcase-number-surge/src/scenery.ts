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
import { geometry, instances, material, scene, texture, type AuraApp, type AuraTransformSpec } from "@aura3d/engine";
import { Batch, hexToLinear, mergeMeshes, scrollFrameZ, type CustomSpec, type MeshData, type Rgb } from "../../../examples/shared/runner-kit/index";
import {
  SURGE_MATERIALS,
  buildMergedHighwayPylonSpec,
  buildSkyHoloGlyphSpec,
  buildSynthwaveSkylineSpireSpec,
  buildTropicalTreasureIslandSpec,
  steppedSkyscraperMeshData
} from "./art/proceduralModels";
import { boxMesh } from "./meshes";
import {
  CRYSTAL_WALL_FRAGMENT_WGSL, DECK_FRAGMENT_WGSL, EDGE_GLOW_FRAGMENT_WGSL, EDGE_GLOW_VERTEX_WGSL, FROSTED_GATE_FRAGMENT_WGSL,
  GLYPH_FRAGMENT_WGSL, GRID_FRAGMENT_WGSL, HALO_FRAGMENT_WGSL, HEX_SHIELD_FRAGMENT_WGSL, MOTE_FRAGMENT_WGSL,
  MOTE_VERTEX_WGSL, MOUNTAIN_FRAGMENT_WGSL, ROCK_FRAGMENT_WGSL, SKY_FRAGMENT_WGSL, SPARKS_FLIPBOOK_FRAGMENT_WGSL,
  STANCHION_FRAGMENT_WGSL, STRIP_FRAGMENT_WGSL, TOWER_FRAGMENT_WGSL, UV_VERTEX_WGSL,
  WORLD_VERTEX_WGSL, litVertexWgsl
} from "./scenery-wgsl";

type Scene = ReturnType<typeof scene>;
type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;

/* ------------------------------------------------------------ palette */

export const SCENERY = {
  floorY: -14,
  fog: "#0d0820",
  horizon: "#240c46",
  grid: "#ff4fd8",
  gridBase: "#0a061c",
  facade: "#11092c",
  mountainNear: "#190c3e",
  mountainFar: "#2b135c",
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
  float rangeFade = clamp((d - 72.0) / 198.0, 0.0, 1.0);
  float f = rangeFade * (1.0 - exp(-max(d - 68.0, 0.0) * density));
  // haze gathers low towards the deep midnight-violet synthwave horizon (zero grey/white washout)
  float low = clamp((8.0 - world.y) / 30.0, 0.0, 1.0);
  vec3 fogCol = mix(nsFog, nsHorizon, clamp(f * 0.55 * (0.25 + 0.75 * low), 0.0, 1.0));
  return mix(col, fogCol, clamp(f * (0.68 + 0.22 * low), 0.0, 1.0));
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
  vec3 zenith = vec3(0.005, 0.003, 0.022);
  vec3 upper = vec3(0.014, 0.006, 0.068);
  vec3 mid = vec3(0.036, 0.010, 0.118);
  vec3 low = vec3(0.095, 0.016, 0.165);
  vec3 hot = vec3(0.24, 0.032, 0.22);
  vec3 col = mix(low, hot, smoothstep(0.09, 0.0, y));
  col = mix(col, mid, smoothstep(0.04, 0.16, y));
  col = mix(col, upper, smoothstep(0.16, 0.38, y));
  col = mix(col, zenith, smoothstep(0.38, 0.85, y));
  if (y < 0.0) col = mix(hot * 0.42, vec3(0.006, 0.003, 0.024), smoothstep(0.0, -0.14, y));

  // stars in the upper half, twinkling slowly
  vec2 sp = vec2(atan(dir.x, -dir.z) * 90.0, asin(clamp(y, -1.0, 1.0)) * 90.0);
  vec2 cell = floor(sp);
  float star = step(0.985, h21(cell));
  vec2 f = fract(sp) - 0.5 - (vec2(h21(cell + 3.1), h21(cell + 7.7)) - 0.5) * 0.6;
  float tw = 0.6 + 0.4 * sin(uTime * (1.0 + 2.0 * h21(cell + 1.3)) + h21(cell) * 40.0);
  col += star * tw * smoothstep(0.12, 0.0, length(f)) * smoothstep(0.10, 0.36, y) * vec3(0.9, 0.85, 1.0) * 1.4;

  // the striped synthwave sun straight down the road
  vec3 sunDir = normalize(vec3(0.0, 0.105, -1.0));
  float ang = acos(clamp(dot(dir, sunDir), -1.0, 1.0));
  float radius = 0.21;
  float sv = (y - sunDir.y) / radius; // -1 bottom .. 1 top of the disc
  float bands = 1.0;
  if (sv < 0.25) {
    float k = (0.25 - sv) / 1.25;            // 0 at the first gap, 1 at the bottom
    float period = 0.16;
    float g = fract((sv - 0.25) / period);
    bands = step(0.18 + 0.55 * k, g);
  }
  float disc = smoothstep(radius, radius - 0.004, ang) * bands;
  vec3 sunCol = mix(vec3(0.92, 0.06, 0.46), vec3(1.0, 0.34, 0.08), smoothstep(-0.85, 0.8, sv));
  col = mix(col, sunCol, disc);
  // controlled violet-magenta sun halo (zero grey/white washout behind number gates)
  col += vec3(0.65, 0.10, 0.45) * (0.14 * exp(-ang * 6.5) + 0.12 * exp(-ang * 18.0)) * (1.0 - disc);
  outColor = vec4(col, 1.0);
}`;

export const SKY_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const synthSkySpec = (): CustomSpec => ({ glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT }, wgsl: { vertex: WORLD_VERTEX_WGSL, fragment: SKY_FRAGMENT_WGSL }, side: "double", depthWrite: false });

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
  wgsl: { vertex: litVertexWgsl(false), fragment: GRID_FRAGMENT_WGSL },
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
  wgsl: { vertex: litVertexWgsl(false), fragment: MOUNTAIN_FRAGMENT_WGSL },
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
  wgsl: { vertex: litVertexWgsl(true), fragment: TOWER_FRAGMENT_WGSL },
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
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(nsSunDir);
  vec3 H = normalize(L + V);
  vec2 g = vec2(vLocal.x / 1.85, vLocal.z / 2.0);
  vec2 w = fwidth(g) * 1.1;
  vec2 a = abs(fract(g - 0.5) - 0.5) / max(w, vec2(1e-4));
  float line = 1.0 - min(min(a.x, a.y), 1.0);
  float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.6);
  float spec = pow(max(dot(N, H), 0.0), 64.0) * 0.42;
  float laneRail = exp(-abs(abs(vWorld.x) - 1.55) * 5.5);
  vec3 col = nsBase * (0.78 + 0.34 * max(dot(N, L), 0.0));
  col += nsLine * line * 0.22;
  col += nsLine * laneRail * 0.14;
  col += vec3(0.95, 0.88, 1.0) * spec;
  col += vec3(0.42, 0.62, 1.0) * 0.36 * fres;
  col = nsFogMix(col, vWorld, nsDensity);
  outColor = vec4(col, 1.0);
}`;

export const deckSpec = (base: Rgb, line: Rgb, sunDir: Rgb = [-0.42, 0.72, 0.48]): CustomSpec => ({
  glsl: { vertex: LIT_VERTEX(false), fragment: DECK_FRAGMENT },
  wgsl: { vertex: litVertexWgsl(false), fragment: DECK_FRAGMENT_WGSL },
  uniforms: {
    nsBase: { type: "color3", value: [...base] },
    nsLine: { type: "color3", value: [...line] },
    nsSunDir: { type: "vec3", value: [...sunDir] },
    ...fogUniforms(0.006)
  },
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
  wgsl: { vertex: WORLD_VERTEX_WGSL, fragment: STRIP_FRAGMENT_WGSL },
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
  wgsl: { vertex: litVertexWgsl(false), fragment: ROCK_FRAGMENT_WGSL },
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
  wgsl: { vertex: litVertexWgsl(false), fragment: GLYPH_FRAGMENT_WGSL },
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
  wgsl: { vertex: UV_VERTEX_WGSL, fragment: HALO_FRAGMENT_WGSL },
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
  wgsl: { vertex: EDGE_GLOW_VERTEX_WGSL, fragment: EDGE_GLOW_FRAGMENT_WGSL },
  uniforms: { baseColor: { type: "color3", value: [...color] }, alpha: { type: "f32", value: alpha } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

/** Data motes: unlit per-vertex tone. */
const moteSpec = (): CustomSpec => ({
  glsl: { vertex: "in vec3 tone;\nout vec3 vTone;\nvoid main() { vTone = tone; gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }", fragment: "in vec3 vTone;\nout vec4 outColor;\nvoid main() { outColor = vec4(vTone, 1.0); }" },
  wgsl: { vertex: MOTE_VERTEX_WGSL, fragment: MOTE_FRAGMENT_WGSL },
  side: "double"
});

/* ------------------------------------------------------------ holographic gate, chrome stanchions, crystal walls, hex shield & sparks */

const FROSTED_GATE_FRAGMENT = /* glsl */ `
in vec3 vTone;
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
out vec4 outColor;
${FOG_GLSL}
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndotv = clamp(abs(dot(N, V)), 0.0, 1.0);
  float fres = 0.0426 + 0.9574 * pow(1.0 - ndotv, 3.8);
  vec2 pUv = vUv + V.xy * 0.04;
  vec2 gc = pUv * vec2(10.0, 12.0);
  vec2 gw = fwidth(gc) * 1.15;
  vec2 ga = abs(fract(gc - 0.5) - 0.5) / max(gw, vec2(1e-4));
  float grid = 1.0 - min(min(ga.x, ga.y), 1.0);
  float scan = 0.5 + 0.5 * sin(vWorld.y * 16.0 - uTime * 3.4);
  float scanBand = smoothstep(0.45, 0.96, scan);
  float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float border = 1.0 - smoothstep(0.016, 0.058, edgeDist);
  vec3 core = vTone * (0.30 + 0.20 * vUv.y) + vec3(0.008, 0.004, 0.028);
  vec3 rimCol = mix(vTone, vec3(1.0), 0.22);
  vec3 col = core + rimCol * (fres * 1.55 + border * 1.25 + scanBand * 0.14 + grid * 0.16);
  col = nsFogMix(col, vWorld, nsDensity * 0.8);
  float alpha = clamp(0.54 + fres * 0.38 + border * 0.44 + grid * 0.08 + scanBand * 0.05, 0.48, 0.96);
  outColor = vec4(col, alpha);
}`;

/** Translucent refractive holographic gate panel with Schlick ior=1.52 Fresnel, parallax micro-grid & animated scanlines. */
export const frostedGateSpec = (): CustomSpec => ({
  glsl: { vertex: LIT_VERTEX(true), fragment: FROSTED_GATE_FRAGMENT },
  wgsl: { vertex: litVertexWgsl(true), fragment: FROSTED_GATE_FRAGMENT_WGSL },
  uniforms: { ...fogUniforms(0.0055) },
  transparent: true,
  depthWrite: false,
  side: "double"
});

const STANCHION_FRAGMENT = /* glsl */ `
in vec3 vTone;
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
out vec4 outColor;
${FOG_GLSL}
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(nsSunDir);
  vec3 H = normalize(L + V);
  float ndotl = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, H), 0.0), 48.0);
  float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 3.0);
  float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float bevel = 1.0 - smoothstep(0.02, 0.09, edgeDist);
  vec3 chrome = vec3(0.11, 0.09, 0.26) * (0.42 + 0.68 * ndotl);
  vec3 col = chrome + vec3(0.78, 0.86, 1.0) * (spec * 0.72) + vTone * (bevel * 1.25 + fres * 0.65);
  col = nsFogMix(col, vWorld, nsDensity);
  outColor = vec4(col, 1.0);
}`;

/** Brushed studio-chrome portal stanchions with neon bevel accents. */
export const stanchionSpec = (sunDir: Rgb = [-0.42, 0.72, 0.48]): CustomSpec => ({
  glsl: { vertex: LIT_VERTEX(true), fragment: STANCHION_FRAGMENT },
  wgsl: { vertex: litVertexWgsl(true), fragment: STANCHION_FRAGMENT_WGSL },
  uniforms: {
    nsSunDir: { type: "vec3", value: [...sunDir] },
    ...fogUniforms(0.006)
  },
  side: "double"
});

const CRYSTAL_WALL_FRAGMENT = /* glsl */ `
in vec3 vTone;
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
out vec4 outColor;
${FOG_GLSL}
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(nsSunDir);
  vec3 H = normalize(L + V);
  float ndotl = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, H), 0.0), 42.0);
  float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 3.2);
  float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float mortar = 1.0 - smoothstep(0.02, 0.085, edgeDist);
  float veinCoord = vLocal.x * 1.45 + sin(vLocal.y * 2.8) * 0.35;
  float vw = fwidth(veinCoord) * 1.4 + 1e-4;
  float vein = 1.0 - smoothstep(0.0, vw * 2.2, abs(fract(veinCoord) - 0.5));
  float smashable = smoothstep(0.96, 1.04, nsBreakRatio);
  float warnPulse = 0.72 + 0.28 * sin(uTime * 5.2);
  float goldPulse = 0.86 + 0.18 * sin(uTime * 6.8 + vLocal.y * 2.0);
  vec3 dangerGlow = vec3(1.35, 0.14, 0.32) * warnPulse;
  vec3 smashGlow = vec3(1.45, 1.05, 0.26) * goldPulse;
  vec3 fissureCol = mix(dangerGlow, smashGlow, smashable);
  vec3 crystalBase = mix(vTone * 0.78, vec3(0.16, 0.36, 0.44), smashable * 0.45);
  float fissureMask = clamp(mortar * 0.85 + vein * (0.35 + 0.45 * smashable), 0.0, 1.0);
  vec3 col = crystalBase * (0.38 + 0.72 * ndotl) + vec3(1.0, 0.95, 0.9) * (spec * 0.65) + fissureCol * (fissureMask * 0.92 + fres * 0.35);
  col = nsFogMix(col, vWorld, nsDensity);
  outColor = vec4(col, 1.0);
}`;

/** Segmented crystal-masonry boss wall shader driven by live `nsBreakRatio` (`playerNumber / wallHp`). */
export const crystalWallSpec = (sunDir: Rgb = [-0.42, 0.72, 0.48]): CustomSpec => ({
  glsl: { vertex: LIT_VERTEX(true), fragment: CRYSTAL_WALL_FRAGMENT },
  wgsl: { vertex: litVertexWgsl(true), fragment: CRYSTAL_WALL_FRAGMENT_WGSL },
  uniforms: {
    nsBreakRatio: { type: "f32", value: 0 },
    nsSunDir: { type: "vec3", value: [...sunDir] },
    ...fogUniforms(0.006)
  },
  side: "double"
});

const HEX_SHIELD_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.5);
  vec2 hp = vec2(atan(vLocal.x, vLocal.z) * 5.0, vLocal.y * 9.0);
  vec2 hw = fwidth(hp) * 1.2 + vec2(1e-4);
  vec2 ha = abs(fract(hp - 0.5) - 0.5) / hw;
  float hexLine = 1.0 - min(min(ha.x, ha.y), 1.0);
  float wave = 0.5 + 0.5 * sin(vLocal.y * 10.0 - uTime * 4.5);
  vec3 col = mix(baseColor, vec3(0.85, 1.0, 0.96), fres * 0.55 + hexLine * 0.35) * (1.05 + fres * 1.25 + wave * 0.25);
  float alpha = clamp(0.14 + fres * 0.56 + hexLine * 0.22 + wave * 0.06, 0.10, 0.84);
  outColor = vec4(col, alpha);
}`;

/** Hexagonal Fresnel energy barrier around the shielded hero core. */
export const hexShieldSpec = (color: Rgb): CustomSpec => ({
  glsl: { vertex: LIT_VERTEX(false), fragment: HEX_SHIELD_FRAGMENT },
  wgsl: { vertex: litVertexWgsl(false), fragment: HEX_SHIELD_FRAGMENT_WGSL },
  uniforms: { baseColor: { type: "color3", value: [...color] } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

const SPARKS_FLIPBOOK_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
void main() {
  float f = floor(max(nsFrame, 0.0));
  float colIdx = f - nsCols * floor(f / nsCols);
  float rowIdx = floor(f / nsCols);
  vec2 cellUv = (vec2(colIdx, rowIdx) + clamp(vUv, vec2(0.02), vec2(0.98))) / vec2(nsCols, nsRows);
  vec4 s = texture(map, cellUv);
  vec3 lin = mix(s.rgb / 12.92, pow((s.rgb + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), s.rgb));
  outColor = vec4(lin * nsTint * (alpha * s.a), alpha * s.a);
}`;

/** Additive billboard flipbook sampling `createFlipbookAtlas("sparks")` for gate-shatter & wall-breakthrough bursts. */
export const sparksFlipbookSpec = (
  map: ReturnType<typeof texture.data>,
  cols: number,
  rows: number,
  tint: Rgb = [1.4, 1.15, 0.55]
): CustomSpec => ({
  glsl: {
    vertex: "out vec2 vUv;\nvoid main() { vUv = uv; gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }",
    fragment: SPARKS_FLIPBOOK_FRAGMENT
  },
  wgsl: { vertex: UV_VERTEX_WGSL, fragment: SPARKS_FLIPBOOK_FRAGMENT_WGSL },
  uniforms: {
    map: { type: "texture2d", value: map },
    nsFrame: { type: "f32", value: 0 },
    nsCols: { type: "f32", value: cols },
    nsRows: { type: "f32", value: rows },
    nsTint: { type: "color3", value: [...tint] },
    alpha: { type: "f32", value: 0 }
  },
  transparent: true,
  depthWrite: false,
  blending: "additive",
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
  { side: -1, x0: 32, x1: 46, spacing: 22, hMin: 14, hMax: 42, wMin: 5, wMax: 9 },
  { side: 1, x0: 32, x1: 46, spacing: 22, hMin: 14, hMax: 42, wMin: 5, wMax: 9 },
  { side: -1, x0: 56, x1: 102, spacing: 18, hMin: 28, hMax: 90, wMin: 7, wMax: 14 },
  { side: 1, x0: 56, x1: 102, spacing: 18, hMin: 28, hMax: 90, wMin: 7, wMax: 14 }
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

const PYLON_SPACING = 24;
const PYLON_COUNT = Math.ceil((AHEAD + BEHIND) / PYLON_SPACING) + 2;
const SPIRE_SPACING = 28;
const SPIRE_COUNT = Math.ceil((AHEAD + BEHIND) / SPIRE_SPACING) + 2;
const MOTE_SPACING = 3.2;
const MOTE_COUNT = Math.ceil((AHEAD * 0.45 + BEHIND) / MOTE_SPACING) + 2;
const MOTE_TONES: readonly Rgb[] = (["#3ef2ff", "#ff4fd8", "#ffd84d"] as const).map((hex) => {
  const t = L(hex);
  return [t[0] * 2.4, t[1] * 2.4, t[2] * 2.4] as Rgb;
});

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
const ISLE_NEAR = -24;
const ISLE_FAR = ISLE_NEAR - ISLE_SPAN;
const GLYPHS = ["+", "7", "/", "x", "3", "-", "9", "+", "5", "x"] as const;
const glyphColor = (g: string): Rgb =>
  g === "+" || g === "x" ? L(SCENERY.glyphGood).map((c) => c * 1.9) as unknown as Rgb
    : g === "-" || g === "/" ? L(SCENERY.glyphBad).map((c) => c * 1.9) as unknown as Rgb
      : L(SCENERY.glyphDigit).map((c) => c * 1.7) as unknown as Rgb;

const glyphHex = (g: string): string =>
  g === "+" || g === "x" ? SCENERY.glyphGood
    : g === "-" || g === "/" ? SCENERY.glyphBad
      : SCENERY.glyphDigit;

export const ISLES: readonly Isle[] = GLYPHS.map((glyph, i) => ({
  id: `isle-${i}`,
  side: (i % 2 === 0 ? -1 : 1) as -1 | 1,
  x: 28 + ((i * 7) % 5) * 2.4,
  y: 8.5 + ((i * 3) % 4) * 1.6,
  z0: (i / GLYPHS.length) * ISLE_SPAN + ((i * 11) % 7),
  r: 1.8 + ((i * 5) % 3) * 0.35,
  glyph,
  color: glyphColor(glyph)
}));

const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Distant holo-glyph pose: scrolls at 0.6x the road well outboard and fades out far ahead of the camera. */
export function islePose(p: Isle, scroll: number, time: number) {
  const z = ((((p.z0 + scroll * 0.6) % ISLE_SPAN) + ISLE_SPAN) % ISLE_SPAN) + ISLE_FAR;
  const fade = smooth((z - ISLE_FAR) / 30) * smooth((ISLE_NEAR - z) / 18);
  const bob = Math.sin(time * 0.7 + p.z0) * 0.35;
  return { x: p.side * p.x, y: p.y + bob, z, fade, yaw: -p.side * 0.38 + Math.sin(time * 0.35 + p.z0) * 0.12 };
}

interface MutableSpireTransform extends AuraTransformSpec {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

interface MutableUniformTransform extends AuraTransformSpec {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

function writeSpireTransform(out: MutableSpireTransform, k: number, anchor: number): void {
  const side = (k & 1) === 0 ? -1 : 1;
  const w = 5.4 + hash(k * 7.3 + 2.1) * 4.2;
  const h = 30 + Math.pow(hash(k * 11.7 + 4.9), 1.3) * 56;
  const x = side * (44 + hash(k * 5.9 + 1.3) * 28);
  const z = k * SPIRE_SPACING + (hash(k * 3.1 + 8.7) - 0.5) * 9;
  out.position[0] = x;
  out.position[1] = SCENERY.floorY;
  out.position[2] = scrollFrameZ(z, anchor);
  out.scale[0] = w;
  out.scale[1] = h;
  out.scale[2] = w;
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
  { name: "edge-glow", spec: edgeGlowSpec([1, 0.1, 0.7], 0.5) },
  { name: "motes", spec: moteSpec() },
  { name: "frosted-gate", spec: frostedGateSpec() },
  { name: "stanchion", spec: stanchionSpec() },
  { name: "crystal-wall", spec: crystalWallSpec() },
  { name: "hex-shield", spec: hexShieldSpec([0.3, 1.0, 0.65]) },
  {
    name: "sparks-flipbook",
    spec: sparksFlipbookSpec(texture.data({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) }), 8, 4)
  }
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

  const towers = new Batch(steppedSkyscraperMeshData(), TOWER_COUNT, [1, 1, 1]);
  builder.add(geometry.custom(towers.geometry(), { name: "towers", material: material.custom(towerSpec(1, 1, SCENERY.facade)) }).runtime({ id: "towers" }));
  const motes = new Batch(boxMesh(0.14, 0.14, 0.14), MOTE_COUNT, [1, 1, 1]);
  builder.add(geometry.custom(motes.geometry(), {
    name: "motes",
    material: material.custom(moteSpec())
  }).runtime({ id: "motes" }));

  const initPylonK0 = Math.floor(-AHEAD / PYLON_SPACING);
  const pylonTransforms: MutableUniformTransform[] = Array.from({ length: PYLON_COUNT }, (_, i) => ({
    position: [0, 0, (initPylonK0 + i) * PYLON_SPACING],
    rotation: [0, 0, 0],
    scale: 1
  }));
  const initSpireK0 = Math.floor(-AHEAD / SPIRE_SPACING);
  const spireTransforms: MutableSpireTransform[] = Array.from({ length: SPIRE_COUNT }, (_, i) => {
    const t: MutableSpireTransform = { position: [0, SCENERY.floorY, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    writeSpireTransform(t, initSpireK0 + i, 0);
    return t;
  });
  const spireColors = Array.from({ length: SPIRE_COUNT }, (_, i) =>
    (i & 1) === 0 ? "#3ef2ff" : "#ff4fd8"
  );
  const skyGlyphColors = ISLES.map((isle) => glyphHex(isle.glyph));
  const skyGlyphTransforms: MutableUniformTransform[] = ISLES.map((isle) => {
    const pose = islePose(isle, 0, 0);
    return {
      position: [pose.x, pose.y, pose.z],
      rotation: [0, pose.yaw, 0],
      scale: Math.max(0.001, pose.fade * isle.r * 0.85)
    };
  });
  const skyIslandTransforms: MutableUniformTransform[] = ISLES.map((isle) => {
    const pose = islePose(isle, 0, 0);
    return {
      position: [pose.x, pose.y - isle.r * 1.45, pose.z],
      rotation: [0, pose.yaw * 0.5, 0],
      scale: Math.max(0.001, pose.fade * isle.r * 0.78)
    };
  });

  builder
    .add(
      instances
        .custom(buildMergedHighwayPylonSpec(), {
          name: "pylons",
          material: SURGE_MATERIALS.pylonIndigoMetal,
          transforms: pylonTransforms,
          castShadow: false,
          receiveShadow: false
        })
        .runtime({ id: "pylons" })
    )
    .add(
      instances
        .custom(buildSynthwaveSkylineSpireSpec(), {
          name: "scenery-skyline-spires",
          material: SURGE_MATERIALS.pylonIndigoMetal,
          transforms: spireTransforms,
          colors: spireColors,
          castShadow: false,
          receiveShadow: false
        })
        .runtime({ id: "scenery-skyline-spires" })
    )
    .add(
      instances
        .custom(buildTropicalTreasureIslandSpec(), {
          name: "scenery-tropical-islands",
          material: SURGE_MATERIALS.tropicalIslandBatch,
          transforms: skyIslandTransforms,
          castShadow: false,
          receiveShadow: false
        })
        .runtime({ id: "scenery-tropical-islands" })
    )
    .add(
      instances
        .custom(buildSkyHoloGlyphSpec(), {
          name: "scenery-sky-glyphs",
          material: SURGE_MATERIALS.neonCyanPractical,
          transforms: skyGlyphTransforms,
          colors: skyGlyphColors,
          castShadow: false,
          receiveShadow: false
        })
        .runtime({ id: "scenery-sky-glyphs" })
    );

  return {
    bind(_app: AuraApp, node: (id: string) => NodeHandle): SceneryRuntime {
      const towerK = new Float64Array(TOWER_COUNT).fill(Number.NaN);
      const moteK = new Float64Array(MOTE_COUNT).fill(Number.NaN);
      const grid = node("grid");
      for (const id of SCENERY_BATCHES) node(id);
      const towersNode = node("towers");
      const motesNode = node("motes");
      const pylonsNode = node("pylons");
      const spiresNode = node("scenery-skyline-spires");
      const skyIslandsNode = node("scenery-tropical-islands");
      const skyGlyphsNode = node("scenery-sky-glyphs");
      let lastPylonK0 = initPylonK0;
      let pylonAnchor = 0;
      let lastSpireK0 = initSpireK0;
      let spireAnchor = 0;

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
        /* merged highway pylons beneath the deck (1 GPU-instanced draw, updated only when p0 advances) */
        const p0 = Math.floor((scroll - AHEAD) / PYLON_SPACING);
        if (p0 !== lastPylonK0) {
          lastPylonK0 = p0;
          pylonAnchor = scroll;
          for (let i = 0; i < PYLON_COUNT; i++) {
            pylonTransforms[i]!.position[2] = scrollFrameZ((p0 + i) * PYLON_SPACING, pylonAnchor);
          }
          pylonsNode.setInstances(pylonTransforms);
        }
        /* outboard synthwave skyline spires (1 GPU-instanced draw, updated only when s0 advances) */
        const s0 = Math.floor((scroll - AHEAD) / SPIRE_SPACING);
        if (s0 !== lastSpireK0) {
          lastSpireK0 = s0;
          spireAnchor = scroll;
          for (let i = 0; i < SPIRE_COUNT; i++) {
            const k = s0 + i;
            writeSpireTransform(spireTransforms[i]!, k, spireAnchor);
            spireColors[i] = (k & 1) === 0 ? "#3ef2ff" : "#ff4fd8";
          }
          spiresNode.setInstances(spireTransforms, spireColors);
        }
        /* data motes beside the road (well clear of the lanes) */
        const m0 = Math.floor((scroll - AHEAD * 0.45) / MOTE_SPACING);
        for (let k = m0; k < m0 + MOTE_COUNT; k++) {
          const slot = ((k % MOTE_COUNT) + MOTE_COUNT) % MOTE_COUNT;
          if (moteK[slot] === k) continue;
          moteK[slot] = k;
          const side = hash(k * 3.7) < 0.5 ? -1 : 1;
          const x = side * (6.5 + 8 * hash(k * 5.1));
          const y = 0.8 + 7 * hash(k * 2.3);
          const z = k * MOTE_SPACING;
          motes.place(slot, x, y, z, hash(k) * 3, 1, 1, 1);
          const c = hash(k * 9.1);
          motes.setTone(slot, c < 0.4 ? MOTE_TONES[0]! : c < 0.75 ? MOTE_TONES[1]! : MOTE_TONES[2]!);
        }
        const frameZ = -scroll;
        towersNode.setPosition(0, 0, frameZ);
        motesNode.setPosition(0, 0, frameZ);
        pylonsNode.setPosition(0, 0, pylonAnchor - scroll);
        spiresNode.setPosition(0, 0, spireAnchor - scroll);
        towers.flush(towersNode);
        motes.flush(motesNode, false);
        grid.setUniform?.("nsScroll", travelled % 6000);

        for (let i = 0; i < ISLES.length; i++) {
          const isle = ISLES[i]!;
          const pose = islePose(isle, travelled, time);
          const t = skyGlyphTransforms[i]!;
          t.position[0] = pose.x;
          t.position[1] = pose.y;
          t.position[2] = pose.z;
          t.rotation[1] = pose.yaw;
          t.scale = Math.max(0.001, pose.fade * isle.r * 0.85);
          const ti = skyIslandTransforms[i]!;
          ti.position[0] = pose.x;
          ti.position[1] = pose.y - isle.r * 1.45;
          ti.position[2] = pose.z;
          ti.rotation[1] = pose.yaw * 0.5;
          ti.scale = Math.max(0.001, pose.fade * isle.r * 0.78);
        }
        skyIslandsNode.setInstances(skyIslandTransforms);
        skyGlyphsNode.setInstances(skyGlyphTransforms, skyGlyphColors);
      }
      return { update };
    }
  };
}
