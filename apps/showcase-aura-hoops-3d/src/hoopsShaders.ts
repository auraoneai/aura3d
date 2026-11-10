/**
 * Paired GLSL 300 es + WGSL custom materials for Aura Hoops 3D (`backend: "auto"` WebGPU + WebGL2 parity).
 *
 * Follows Aura3D 5.5.1 custom-shader contracts:
 *   - Never redeclare `spec.uniforms` in GLSL (injected by the engine prelude).
 *   - WGSL stages start with `/* @aura3d-bindings * /` via `wgslStage(...)`, read scalar/vector uniforms from
 *     `aura.u_<name>`, textures from `u_<name>Texture` / `u_<name>Sampler`, and wrap clip-space vertex output
 *     in `a3dRasterPosition(...)`.
 */
import type { AuraTextureMagFilter, AuraTextureMinFilter, AuraTextureWrapMode, material } from "@aura3d/engine";
import type { FlipbookAtlasSpec } from "../../showcase-port-shared/vfx-pack";

declare module "../../../packages/engine/src/agent-api/nodes/types.js" {
  interface AuraTextureDataOptions {
    readonly wrapS?: AuraTextureWrapMode | "clamp-to-edge";
    readonly wrapT?: AuraTextureWrapMode | "clamp-to-edge";
    readonly minFilter?: AuraTextureMinFilter;
    readonly magFilter?: AuraTextureMagFilter;
  }
}
import {
  WGSL_CLIP,
  WGSL_COLOR,
  WGSL_ENVIRONMENT_FOG,
  WGSL_MATH,
  WGSL_NOISE,
  WGSL_PBR_MICRO,
  wgslStage
} from "../../showcase-port-shared/wgsl-twins";

export type CustomMaterialSpec = Parameters<typeof material.custom>[0];

const STANDARD_VERTEX_GLSL = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const STANDARD_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct HoopsVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_uv: vec2<f32>
) -> HoopsVarying {
  var out: HoopsVarying;
  out.vUv = a_uv;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

function hexToLinearRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
    : clean;
  const n = Number.parseInt(full, 16);
  const toLin = (byte: number): number => {
    const c = (byte & 0xff) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [toLin(n >> 16), toLin(n >> 8), toLin(n)];
}

export interface DualCourtSurfaceOptions {
  readonly baseHex: string;
  readonly accentHex: string;
  /** 0 = multi-lobe hardwood maple / composite planks, 1 = silica acrylic / blacktop asphalt, 2 = Voronoi wet puddle asphalt */
  readonly surfaceKind: 0 | 1 | 2;
  readonly roughness: number;
  readonly puddleStrength?: number;
  readonly sunDir?: readonly [number, number, number];
}

/**
 * Multi-lobe court surface shader (paired GLSL 300 es + WGSL):
 *   - `surfaceKind = 0`: staggered hardwood maple / composite planks with per-board grain variation and lacquer clearcoat sheen.
 *   - `surfaceKind = 1`: outdoor streetball silica-acrylic / micro-aggregate asphalt with subtle court wear and grazing Fresnel.
 *   - `surfaceKind = 2`: rain-slicked Voronoi micro-puddle mask + animated raindrop ripple normals (replaces deprecated `weather.wetGround`).
 */
export function dualCourtSurfaceSpec(options: DualCourtSurfaceOptions): CustomMaterialSpec {
  const baseColor = hexToLinearRgb(options.baseHex);
  const accentColor = hexToLinearRgb(options.accentHex);
  const sunDir = options.sunDir ?? [0.36, 0.84, 0.4];
  const puddleStrength = options.puddleStrength ?? (options.surfaceKind === 2 ? 0.76 : 0);

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;

float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x),
    mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float voronoiPuddle(vec2 p) {
  vec2 g = floor(p);
  vec2 f = fract(p);
  float minDist = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 cell = g + o;
      vec2 jitter = vec2(h21(cell), h21(cell + vec2(19.7, 41.3)));
      vec2 r = o + 0.15 + 0.7 * jitter - f;
      minDist = min(minDist, dot(r, r));
    }
  }
  return sqrt(minDist);
}

void main() {
  vec2 wp = vWorld.xz;
  vec3 N = normalize(vNormal);
  vec3 albedo = baseColor;
  float rough = clamp(surfaceParams.y, 0.06, 0.96);
  float clearcoatWeight = 0.18;

  if (surfaceParams.x < 0.5) {
    // Staggered maple / composite planks (0.12 m wide x 1.55 m long)
    float plankRow = floor(wp.x / 0.12);
    float stagger = h21(vec2(plankRow, 3.1)) * 1.55;
    float plankCol = floor((wp.y + stagger) / 1.55);
    float boardId = h21(vec2(plankRow * 1.37, plankCol * 2.11));
    float fx = fract(wp.x / 0.12);
    float fy = fract((wp.y + stagger) / 1.55);
    float seam = smoothstep(0.0, 0.045, fx) * smoothstep(1.0, 0.955, fx)
               * smoothstep(0.0, 0.012, fy) * smoothstep(1.0, 0.988, fy);
    float fiber = vnoise(vec2(wp.x * 52.0, wp.y * 3.4 + boardId * 17.0));
    float tone = mix(0.86, 1.15, boardId) * mix(0.94, 1.06, fiber);
    albedo = mix(baseColor * tone, accentColor * 0.35, (1.0 - seam) * 0.42);
    albedo *= mix(0.82, 1.0, seam);
    rough = clamp(rough * mix(0.88, 1.08, boardId), 0.12, 0.55);
    clearcoatWeight = 0.62;
    N = normalize(N + vec3((fx - 0.5) * (1.0 - seam) * 0.16, 0.0, 0.0));
  } else if (surfaceParams.x < 1.5) {
    // Outdoor silica-acrylic / streetball asphalt aggregate + subtle wear
    float grit = vnoise(wp * 16.0) * 0.65 + vnoise(wp * 43.0) * 0.35;
    float patchMask = vnoise(wp * 0.42 + vec2(4.2, -1.7));
    float crack = smoothstep(0.018, 0.0, abs(vnoise(wp * 0.85) - 0.5));
    albedo = baseColor * mix(0.9, 1.1, grit) * mix(0.93, 1.05, patchMask);
    albedo = mix(albedo, albedo * 0.68, crack * 0.35);
    rough = clamp(rough * mix(0.92, 1.06, grit), 0.22, 0.92);
    clearcoatWeight = clamp(1.0 - rough, 0.08, 0.45);
    N = normalize(N + vec3((grit - 0.5) * 0.08, 0.0, (patchMask - 0.5) * 0.06));
  } else {
    // Voronoi micro-puddle mask + animated raindrop ripple normals
    float grit = vnoise(wp * 18.0);
    float vCell = voronoiPuddle(wp * 0.38);
    float macro = vnoise(wp * 0.21 + vec2(2.7, 6.1));
    float puddle = smoothstep(0.62, 0.24, vCell * 0.78 + (1.0 - macro) * 0.34) * surfaceParams.z;
    vec2 rCell = floor(wp * 2.2);
    vec2 rLocal = fract(wp * 2.2) - 0.5;
    float rSeed = h21(rCell);
    float rPhase = fract(uTime * 1.35 + rSeed);
    float rDist = length(rLocal);
    float ring = sin((rDist - rPhase * 0.46) * 46.0) * exp(-rDist * 7.5) * (1.0 - rPhase) * puddle;
    vec2 rGrad = normalize(rLocal + vec2(1e-4)) * ring * 0.14;
    N = normalize(vec3(rGrad.x + (grit - 0.5) * 0.05 * (1.0 - puddle), 1.0, rGrad.y + (grit - 0.5) * 0.05 * (1.0 - puddle)));
    albedo = mix(baseColor * mix(0.92, 1.08, grit), baseColor * 0.56 + accentColor * 0.08, puddle);
    rough = mix(clamp(surfaceParams.y, 0.26, 0.72), 0.045, puddle);
    clearcoatWeight = mix(0.24, 0.94, puddle);
  }

  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(sunDir);
  vec3 H = normalize(L + V);
  float ndotl = max(dot(N, L), 0.0);
  float ndotv = max(dot(N, V), 0.0);
  float ndoth = max(dot(N, H), 0.0);
  float fresnel = 0.04 + 0.96 * pow(clamp(1.0 - ndotv, 0.0, 1.0), 5.0);
  float a = max(rough * rough, 0.003);
  float a2 = a * a;
  float denom = (ndoth * ndoth) * (a2 - 1.0) + 1.0;
  float ggx = a2 / max(3.14159265 * denom * denom, 1e-5);
  float spec = min(ggx * fresnel * clearcoatWeight * 0.38, 2.2);
  vec3 bounce = mix(baseColor * 0.45, accentColor * 0.42 + vec3(0.18, 0.22, 0.3), 0.5);
  vec3 lit = albedo * (0.38 + 0.68 * ndotl) + bounce * (fresnel * clearcoatWeight * 0.42) + vec3(1.0, 0.97, 0.92) * spec;
  outColor = vec4(lit, 1.0);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH, WGSL_NOISE, WGSL_PBR_MICRO, WGSL_ENVIRONMENT_FOG], /* wgsl */ `
fn hoopsVoronoiPuddle(p: vec2<f32>) -> f32 {
  let g = floor(p);
  let f = fract(p);
  var minDist = 8.0;
  for (var y: i32 = -1; y <= 1; y = y + 1) {
    for (var x: i32 = -1; x <= 1; x = x + 1) {
      let o = vec2<f32>(f32(x), f32(y));
      let cell = g + o;
      let jitter = vec2<f32>(a3dHash21(cell), a3dHash21(cell + vec2<f32>(19.7, 41.3)));
      let r = o + vec2<f32>(0.15) + 0.7 * jitter - f;
      minDist = min(minDist, dot(r, r));
    }
  }
  return sqrt(minDist);
}

@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
  @builtin(position) fragCoord: vec4<f32>
) -> @location(0) vec4<f32> {
  let _uv = vUv;
  let wp = vWorld.xz;
  var N = normalize(vNormal);
  var albedo = aura.u_baseColor;
  var rough = clamp(aura.u_surfaceParams.y, 0.06, 0.96);
  var clearcoatWeight = 0.18;

  if (aura.u_surfaceParams.x < 0.5) {
    let plankRow = floor(wp.x / 0.12);
    let stagger = a3dHash21(vec2<f32>(plankRow, 3.1)) * 1.55;
    let plankCol = floor((wp.y + stagger) / 1.55);
    let boardId = a3dHash21(vec2<f32>(plankRow * 1.37, plankCol * 2.11));
    let fx = fract(wp.x / 0.12);
    let fy = fract((wp.y + stagger) / 1.55);
    let seam = smoothstep(0.0, 0.045, fx) * (1.0 - smoothstep(0.955, 1.0, fx))
             * smoothstep(0.0, 0.012, fy) * (1.0 - smoothstep(0.988, 1.0, fy));
    let fiber = a3dValueNoise2(vec2<f32>(wp.x * 52.0, wp.y * 3.4 + boardId * 17.0));
    let tone = mix(0.86, 1.15, boardId) * mix(0.94, 1.06, fiber);
    albedo = mix(aura.u_baseColor * tone, aura.u_accentColor * 0.35, (1.0 - seam) * 0.42);
    albedo = albedo * mix(0.82, 1.0, seam);
    rough = clamp(rough * mix(0.88, 1.08, boardId), 0.12, 0.55);
    clearcoatWeight = 0.62;
    N = normalize(N + vec3<f32>((fx - 0.5) * (1.0 - seam) * 0.16, 0.0, 0.0));
  } else if (aura.u_surfaceParams.x < 1.5) {
    let grit = a3dValueNoise2(wp * 16.0) * 0.65 + a3dValueNoise2(wp * 43.0) * 0.35;
    let patchMask = a3dValueNoise2(wp * 0.42 + vec2<f32>(4.2, -1.7));
    let crack = 1.0 - smoothstep(0.0, 0.018, abs(a3dValueNoise2(wp * 0.85) - 0.5));
    albedo = aura.u_baseColor * mix(0.9, 1.1, grit) * mix(0.93, 1.05, patchMask);
    albedo = mix(albedo, albedo * 0.68, crack * 0.35);
    rough = clamp(rough * mix(0.92, 1.06, grit), 0.22, 0.92);
    clearcoatWeight = clamp(1.0 - rough, 0.08, 0.45);
    N = normalize(N + vec3<f32>((grit - 0.5) * 0.08, 0.0, (patchMask - 0.5) * 0.06));
  } else {
    let grit = a3dValueNoise2(wp * 18.0);
    let vCell = hoopsVoronoiPuddle(wp * 0.38);
    let macroNoise = a3dValueNoise2(wp * 0.21 + vec2<f32>(2.7, 6.1));
    let puddle = (1.0 - smoothstep(0.24, 0.62, vCell * 0.78 + (1.0 - macroNoise) * 0.34)) * aura.u_surfaceParams.z;
    let rCell = floor(wp * 2.2);
    let rLocal = fract(wp * 2.2) - vec2<f32>(0.5);
    let rSeed = a3dHash21(rCell);
    let rPhase = fract(aura.u_time * 1.35 + rSeed);
    let rDist = length(rLocal);
    let ring = sin((rDist - rPhase * 0.46) * 46.0) * exp(-rDist * 7.5) * (1.0 - rPhase) * puddle;
    let rGrad = normalize(rLocal + vec2<f32>(1e-4, 1e-4)) * ring * 0.14;
    N = normalize(vec3<f32>(rGrad.x + (grit - 0.5) * 0.05 * (1.0 - puddle), 1.0, rGrad.y + (grit - 0.5) * 0.05 * (1.0 - puddle)));
    albedo = mix(aura.u_baseColor * mix(0.92, 1.08, grit), aura.u_baseColor * 0.56 + aura.u_accentColor * 0.08, puddle);
    rough = mix(clamp(aura.u_surfaceParams.y, 0.26, 0.72), 0.045, puddle);
    clearcoatWeight = mix(0.24, 0.94, puddle);
  }

  let V = a3dSafeNormalize3(aura.u_cameraPosition - vWorld, vec3<f32>(0.0, 1.0, 0.0));
  let L = a3dSafeNormalize3(aura.u_sunDir, vec3<f32>(0.0, 1.0, 0.0));
  let H = a3dSafeNormalize3(L + V, vec3<f32>(0.0, 1.0, 0.0));
  let ndotl = max(dot(N, L), 0.0);
  let ndotv = max(dot(N, V), 0.0);
  let ndoth = max(dot(N, H), 0.0);
  let fresnel = a3dFresnelSchlick(ndotv, vec3<f32>(0.04)).x;
  let ggx = a3dGgxDistribution(ndoth, rough);
  let spec = min(ggx * fresnel * clearcoatWeight * 0.38, 2.2);
  let bounce = mix(aura.u_baseColor * 0.45, aura.u_accentColor * 0.42 + vec3<f32>(0.18, 0.22, 0.3), 0.5);
  let lit = albedo * (0.38 + 0.68 * ndotl) + bounce * (fresnel * clearcoatWeight * 0.42) + vec3<f32>(1.0, 0.97, 0.92) * spec;
  let fogged = a3dApplyEnvironmentFog(lit, vWorld, fragCoord.xy);
  return vec4<f32>(fogged, 1.0);
}`);

  return {
    glsl: { vertex: STANDARD_VERTEX_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: STANDARD_VERTEX_WGSL, fragment: fragmentWgsl },
    uniforms: {
      baseColor: { type: "color3", value: baseColor },
      accentColor: { type: "color3", value: accentColor },
      sunDir: { type: "vec3", value: [...sunDir] },
      surfaceParams: { type: "vec3", value: [options.surfaceKind, options.roughness, puddleStrength] }
    },
    fog: true
  };
}

/**
 * Paired GLSL 300 es + WGSL vertex-whipping & derivative-antialiased (`fwidth`) diamond woven swish net shader.
 * Driven per frame via `handle.setUniform("swishState", [uSwishImpulse, gameTime])`.
 */
export function dualSwishNetSpec(chainTone = false): CustomMaterialSpec {
  const vertexGlsl = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  float hang = clamp(0.5 - position.y, 0.0, 1.0);
  float taper = mix(1.0, 0.66, smoothstep(0.0, 0.92, hang));
  float impulse = clamp(swishState.x, 0.0, 1.5);
  float phase = swishState.y * 21.0 - hang * 5.2;
  float flare = impulse * sin(hang * 3.14159265) * (0.34 + 0.16 * sin(phase));
  float swayX = impulse * sin(swishState.y * 17.0 + hang * 4.0) * hang * 0.11;
  float swayZ = impulse * cos(swishState.y * 14.0 + hang * 3.5) * hang * 0.09;
  vec3 pos = position;
  pos.xz *= (taper + flare);
  pos.x += swayX;
  pos.z += swayZ;
  pos.y += impulse * hang * 0.14;
  vWorld = (modelMatrix * vec4(pos, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(pos, 1.0);
}`;

  const vertexWgsl = wgslStage([WGSL_CLIP], /* wgsl */ `
struct NetVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_uv: vec2<f32>
) -> NetVarying {
  var out: NetVarying;
  out.vUv = a_uv;
  let hang = clamp(0.5 - a_position.y, 0.0, 1.0);
  let taper = mix(1.0, 0.66, smoothstep(0.0, 0.92, hang));
  let impulse = clamp(aura.u_swishState.x, 0.0, 1.5);
  let phase = aura.u_swishState.y * 21.0 - hang * 5.2;
  let flare = impulse * sin(hang * 3.14159265) * (0.34 + 0.16 * sin(phase));
  let swayX = impulse * sin(aura.u_swishState.y * 17.0 + hang * 4.0) * hang * 0.11;
  let swayZ = impulse * cos(aura.u_swishState.y * 14.0 + hang * 3.5) * hang * 0.09;
  var pos = a_position;
  let radial = taper + flare;
  pos.x = pos.x * radial + swayX;
  pos.z = pos.z * radial + swayZ;
  pos.y = pos.y + impulse * hang * 0.14;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(pos, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(pos, 1.0));
  return out;
}`);

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 g = vec2(vUv.x * 12.0, vUv.y * 5.5);
  float d1 = abs(fract(g.x + g.y) - 0.5);
  float d2 = abs(fract(g.x - g.y) - 0.5);
  float d = min(d1, d2);
  float fw = max(fwidth(d), 0.015);
  if (abs(vNormal.y) > 0.96) discard;
  float cord = 1.0 - smoothstep(0.075 - fw, 0.095 + fw, d);
  float rimLoops = 1.0 - smoothstep(0.04, 0.09, 1.0 - vUv.y);
  float fringe = (1.0 - smoothstep(0.0, 0.12, vUv.y)) * (0.55 + 0.45 * step(0.35, fract(vUv.x * 24.0)));
  float alpha = clamp(max(cord, max(rimLoops * 0.75, fringe * 0.82)), 0.0, 0.95);
  if (alpha < 0.04) discard;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float grazing = pow(1.0 - abs(dot(N, V)), 2.2);
  float knot = exp(-d * 18.0) * 0.22;
  vec3 col = cordColor * (0.76 + 0.24 * vUv.y + knot) + vec3(0.95, 0.97, 1.0) * (grazing * 0.32 + swishState.x * 0.22);
  outColor = vec4(col, alpha);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>
) -> @location(0) vec4<f32> {
  let g = vec2<f32>(vUv.x * 12.0, vUv.y * 5.5);
  let d1 = abs(fract(g.x + g.y) - 0.5);
  let d2 = abs(fract(g.x - g.y) - 0.5);
  let d = min(d1, d2);
  let fw = max(fwidth(d), 0.015);
  if (abs(vNormal.y) > 0.96) { discard; }
  let cord = 1.0 - smoothstep(0.075 - fw, 0.095 + fw, d);
  let rimLoops = 1.0 - smoothstep(0.04, 0.09, 1.0 - vUv.y);
  let fringe = (1.0 - smoothstep(0.0, 0.12, vUv.y)) * (0.55 + 0.45 * step(0.35, fract(vUv.x * 24.0)));
  let alpha = clamp(max(cord, max(rimLoops * 0.75, fringe * 0.82)), 0.0, 0.95);
  if (alpha < 0.04) { discard; }
  let N = normalize(vNormal);
  let V = a3dSafeNormalize3(aura.u_cameraPosition - vWorld, vec3<f32>(0.0, 1.0, 0.0));
  let grazing = a3dPow(1.0 - abs(dot(N, V)), 2.2);
  let knot = exp(-d * 18.0) * 0.22;
  let col = aura.u_cordColor * (0.76 + 0.24 * vUv.y + knot) + vec3<f32>(0.95, 0.97, 1.0) * (grazing * 0.32 + aura.u_swishState.x * 0.22);
  return vec4<f32>(col, alpha);
}`);

  return {
    glsl: { vertex: vertexGlsl, fragment: fragmentGlsl },
    wgsl: { vertex: vertexWgsl, fragment: fragmentWgsl },
    uniforms: {
      cordColor: { type: "color3", value: chainTone ? [0.68, 0.72, 0.77] : [0.91, 0.9, 0.86] },
      swishState: { type: "vec2", value: [0, 0] }
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  };
}

/**
 * Paired GLSL 300 es + WGSL derivative-filtered (`fwidth`) galvanized diamond chain-link cage fencing shader.
 */
export function dualChainLinkFenceSpec(tintHex = "#8a9199"): CustomMaterialSpec {
  const steelColor = hexToLinearRgb(tintHex);

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 cell = vec2((vWorld.x + vWorld.z) * 5.8, vWorld.y * 5.8);
  float d = min(abs(fract(cell.x + cell.y) - 0.5), abs(fract(cell.x - cell.y) - 0.5));
  float fw = clamp(fwidth(d), 0.015, 0.24);
  // Distance-aware coverage keeps far fence spans silky instead of aliasing into moire
  float wire = mix(1.0 - smoothstep(0.065 - fw, 0.085 + fw, d), 0.22, smoothstep(0.08, 0.24, fw));
  float topRail = 1.0 - smoothstep(0.025, 0.045, abs(vUv.y - 0.985));
  float midRail = 1.0 - smoothstep(0.018, 0.032, abs(vUv.y - 0.52));
  float alpha = clamp(max(wire * 0.72, max(topRail, midRail) * 0.92), 0.0, 0.94);
  if (alpha < 0.035) discard;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float spec = pow(1.0 - abs(dot(N, V)), 3.0) * 0.35;
  vec3 col = steelColor * (0.68 + 0.32 * vUv.y) + vec3(0.85, 0.9, 0.96) * spec;
  outColor = vec4(col, alpha);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH, WGSL_ENVIRONMENT_FOG], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
  @builtin(position) fragCoord: vec4<f32>
) -> @location(0) vec4<f32> {
  let cell = vec2<f32>((vWorld.x + vWorld.z) * 5.8, vWorld.y * 5.8);
  let d = min(abs(fract(cell.x + cell.y) - 0.5), abs(fract(cell.x - cell.y) - 0.5));
  let fw = clamp(fwidth(d), 0.015, 0.24);
  let wire = mix(1.0 - smoothstep(0.065 - fw, 0.085 + fw, d), 0.22, smoothstep(0.08, 0.24, fw));
  let topRail = 1.0 - smoothstep(0.025, 0.045, abs(vUv.y - 0.985));
  let midRail = 1.0 - smoothstep(0.018, 0.032, abs(vUv.y - 0.52));
  let alpha = clamp(max(wire * 0.72, max(topRail, midRail) * 0.92), 0.0, 0.94);
  if (alpha < 0.035) { discard; }
  let N = normalize(vNormal);
  let V = a3dSafeNormalize3(aura.u_cameraPosition - vWorld, vec3<f32>(0.0, 1.0, 0.0));
  let spec = a3dPow(1.0 - abs(dot(N, V)), 3.0) * 0.35;
  let col = aura.u_steelColor * (0.68 + 0.32 * vUv.y) + vec3<f32>(0.85, 0.9, 0.96) * spec;
  let fogged = a3dApplyEnvironmentFog(col, vWorld, fragCoord.xy);
  return vec4<f32>(fogged, alpha);
}`);

  return {
    glsl: { vertex: STANDARD_VERTEX_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: STANDARD_VERTEX_WGSL, fragment: fragmentWgsl },
    uniforms: {
      steelColor: { type: "color3", value: steelColor }
    },
    transparent: true,
    depthWrite: false,
    side: "double",
    fog: true
  };
}

/**
 * Paired GLSL 300 es + WGSL 8x4 sprite-sheet flipbook card shader driven by `createFlipbookAtlas("sparks")`.
 * `burstState = [frameIndex (0..31), opacity (0..1), intensityBoost, 0]`.
 */
export function dualFlipbookBurstSpec(atlas: FlipbookAtlasSpec, additive = true): CustomMaterialSpec {
  const cols = atlas.columns;
  const rows = atlas.rows;
  const maxFrame = (cols * rows - 1).toFixed(1);
  const colsF = cols.toFixed(1);
  const rowsF = rows.toFixed(1);

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
vec3 srgbToLin(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
void main() {
  float fi = clamp(floor(burstState.x), 0.0, ${maxFrame});
  float col = mod(fi, ${colsF});
  float row = floor(fi / ${colsF});
  vec2 cellUv = (vec2(col, row) + clamp(vUv, 0.02, 0.98)) / vec2(${colsF}, ${rowsF});
  vec4 tex = texture(sheet, cellUv);
  float a = tex.a * clamp(burstState.y, 0.0, 1.0);
  if (a < 0.005) discard;
  vec3 rgb = srgbToLin(tex.rgb) * max(burstState.z, 0.5);
  outColor = vec4(rgb, a);
}`;

  const fragmentWgsl = wgslStage([WGSL_COLOR], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>
) -> @location(0) vec4<f32> {
  let _n = vNormal;
  let _w = vWorld;
  let fi = clamp(floor(aura.u_burstState.x), 0.0, ${maxFrame});
  let col = fi - ${colsF} * floor(fi / ${colsF});
  let row = floor(fi / ${colsF});
  let cellUv = (vec2<f32>(col, row) + clamp(vUv, vec2<f32>(0.02), vec2<f32>(0.98))) / vec2<f32>(${colsF}, ${rowsF});
  let tex = textureSample(u_sheetTexture, u_sheetSampler, cellUv);
  let a = tex.a * clamp(aura.u_burstState.y, 0.0, 1.0);
  if (a < 0.005) { discard; }
  let rgb = a3dSrgbToLinear(tex.rgb) * max(aura.u_burstState.z, 0.5);
  return vec4<f32>(rgb, a);
}`);

  return {
    glsl: { vertex: STANDARD_VERTEX_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: STANDARD_VERTEX_WGSL, fragment: fragmentWgsl },
    uniforms: {
      sheet: { type: "texture2d", value: atlas.texture },
      burstState: { type: "vec4", value: [0, 0, 1.5, 0] }
    },
    transparent: true,
    depthWrite: false,
    blending: additive ? "additive" : "normal",
    side: "double"
  };
}
