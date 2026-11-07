import * as THREE from 'three';

export const uTime = { value: 0 };

export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ripplePhase(x: number, z: number): number {
  return (
    (x * 0.8 + z * 0.45) * 4.2 +
    1.6 * Math.sin(z * 0.5 + x * 0.2) +
    0.8 * Math.sin(x * 0.9 - z * 0.3)
  );
}

export function ripple(x: number, z: number): number {
  return Math.sin(ripplePhase(x, z));
}

/** Height of the sand surface at (x, z). */
export function terrainHeight(x: number, z: number): number {
  const dune =
    0.3 * Math.sin(x * 0.13 + 1.0) * Math.sin(z * 0.11) +
    0.12 * Math.sin(x * 0.3 + z * 0.2);
  const r = Math.hypot(x, z);
  const rippleAmp = 0.06 * Math.min(1, 0.4 + r * 0.1);
  return dune + rippleAmp * ripple(x, z);
}

export interface PatchOptions {
  key: string;
  caustic?: number;
  swayAmp?: number;
  wag?: boolean;
}

const f = (n: number): string => n.toFixed(4);

const CAUSTIC_GLSL = /* glsl */ `
float causticPattern(vec2 uv, float t) {
  vec2 p = mod(uv * 6.28318530718, 6.28318530718) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.5);
}
`;

/** Adds drifting caustics, plant sway and fish tail wag to a standard material. */
export function patchMaterial(mat: THREE.Material, opts: PatchOptions): void {
  const caustic = opts.caustic ?? 0;
  const sway = opts.swayAmp ?? 0;
  const wag = opts.wag ?? false;
  mat.customProgramCacheKey = () => `patched-${opts.key}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;

    let vtxCommon = `#include <common>
uniform float uTime;
varying vec3 vWPos;
`;
    if (wag) vtxCommon += 'attribute float aPhase;\n';

    let vtxBegin = '#include <begin_vertex>\n';
    if (sway > 0) {
      vtxBegin += `
{
#ifdef USE_INSTANCING
  vec3 swP = vec3(instanceMatrix[3]);
#else
  vec3 swP = modelMatrix[3].xyz;
#endif
  float swH = max(transformed.y, 0.0);
  float swPh = swP.x * 0.7 + swP.z * 0.9;
  float swK = ${f(sway)} * swH * swH;
  transformed.x += sin(uTime * 1.4 + swPh + swH * 1.5) * swK;
  transformed.z += cos(uTime * 1.1 + swPh * 1.3 + swH * 1.2) * swK * 0.7;
}
`;
    }
    if (wag) {
      vtxBegin += `
{
  float wg = sin(uTime * 9.0 + aPhase - transformed.z * 4.0);
  float wk = smoothstep(0.3, -1.4, transformed.z);
  transformed.x += wg * 0.2 * wk;
  transformed.z += 0.0;
}
`;
    }

    const vtxProject = `#include <project_vertex>
{
  vec4 cwp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  cwp = instanceMatrix * cwp;
#endif
  vWPos = (modelMatrix * cwp).xyz;
}
`;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', vtxCommon)
      .replace('#include <begin_vertex>', vtxBegin)
      .replace('#include <project_vertex>', vtxProject);

    const fragCommon = `#include <common>
uniform float uTime;
varying vec3 vWPos;
${CAUSTIC_GLSL}
`;
    let fragOut = '#include <opaque_fragment>';
    if (caustic > 0) {
      fragOut = `
{
  vec2 cuv = vWPos.xz * 0.11;
  float cA = causticPattern(cuv, uTime * 0.35);
  float cB = causticPattern(cuv * 1.37 + 3.1, uTime * 0.27 + 5.0);
  float cc = 0.65 * cA + 0.5 * cB;
  float depthFade = exp(-max(vWPos.y, 0.0) * 0.18);
  outgoingLight += diffuseColor.rgb * vec3(0.75, 1.0, 0.9) * cc * ${f(caustic)} * depthFade;
}
#include <opaque_fragment>`;
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', fragCommon)
      .replace('#include <opaque_fragment>', fragOut);
  };
}
