import * as THREE from 'three';
import { SUN } from './terrain';

const f = (n: number) => n.toFixed(5);

// Shared GLSL: sky gradient in display (sRGB) space. The same function is used
// for the sky dome and for the haze colour on geometry, so distant walls fade
// into the sky.
const SKY_GLSL = /* glsl */ `
const vec3 SUNDIR = vec3(${f(SUN[0])}, ${f(SUN[1])}, ${f(SUN[2])});
vec3 skyColor(vec3 d) {
  float t = max(d.y, 0.0);
  vec3 hor = vec3(0.86, 0.50, 0.50);
  vec3 mid = vec3(0.50, 0.36, 0.62);
  vec3 zen = vec3(0.10, 0.14, 0.42);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, t));
  c = mix(c, zen, smoothstep(0.15, 0.75, t));
  float sd = max(dot(normalize(d), SUNDIR), 0.0);
  float fall = exp(-t * 3.0);
  c += vec3(1.0, 0.45, 0.16) * pow(sd, 5.0) * 0.55 * fall;
  c += vec3(1.0, 0.30, 0.38) * pow(sd, 24.0) * 0.5 * fall;
  return c;
}
`;

export function makeNoiseTexture(rng: () => number): THREE.DataTexture {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rng() * 256);
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

const TERRAIN_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec2 q = vWPos.xz / 512.0;
  float n1 = texture2D(uNoise, q * 1.0).r;
  float n2 = texture2D(uNoise, q * 4.0 + 0.37).r;
  float n3 = texture2D(uNoise, q * 16.0 + 0.71).r;
  float n4 = texture2D(uNoise, q * 64.0 + 0.13).r;
  float streak = texture2D(uNoise, vec2((vWPos.x + vWPos.z) / 512.0 * 24.0, vWPos.y / 512.0 * 2.0)).r;

  float y = vWPos.y + (n1 - 0.5) * 4.0 + (n2 - 0.5) * 1.5;
  float ia = floor(y * 0.09);
  vec3 st = strataPalette(hash11(ia * 1.7 + 3.0));
  st *= 0.85 + 0.30 * hash11(floor(y * 0.7) + 11.0);
  st *= 0.94 + 0.12 * hash11(floor(y * 2.3) + 5.0);
  st *= 0.82 + 0.36 * mix(n3, n4, 0.5);
  st *= 0.82 + 0.36 * streak;
  st *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.10, fract(y * 0.7)));

  vec3 sand = mix(vec3(0.74, 0.56, 0.40), vec3(0.62, 0.45, 0.34), n2);
  sand *= 0.85 + 0.30 * n3;
  sand *= 0.92 + 0.16 * n4;
  float riv = smoothstep(-0.15, -0.55, vWPos.y);
  sand = mix(sand, vec3(0.86, 0.74, 0.58) * (0.9 + 0.2 * n4), riv * 0.7);
  sand = mix(sand, st, 0.2);

  float dust = smoothstep(0.78, 0.93, vWNrm.y);
  vec3 col = mix(st, sand, dust * 0.9);
  diffuseColor.rgb = pow(col, vec3(2.2));
}
`;

const TERRAIN_PARS = /* glsl */ `
float hash11(float p) { return fract(sin(p * 127.1) * 43758.5453); }
vec3 strataPalette(float h) {
  vec3 c0 = vec3(0.50, 0.20, 0.12);
  vec3 c1 = vec3(0.78, 0.40, 0.20);
  vec3 c2 = vec3(0.80, 0.58, 0.38);
  vec3 c3 = vec3(0.62, 0.33, 0.26);
  vec3 c4 = vec3(0.86, 0.70, 0.50);
  h *= 4.0;
  if (h < 1.0) return mix(c0, c1, h);
  if (h < 2.0) return mix(c1, c2, h - 1.0);
  if (h < 3.0) return mix(c2, c3, h - 2.0);
  return mix(c3, c4, h - 3.0);
}
`;

/**
 * Adds to a MeshStandardMaterial: per-vertex baked sun shadow (attribute
 * `bake`), sun-aware haze, and for terrain a procedural strata colour.
 */
export function patchMaterial(mat: THREE.MeshStandardMaterial, kind: 'terrain' | 'prop', noise: THREE.Texture): void {
  mat.customProgramCacheKey = () => 'canyon-' + kind;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: noise };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float bake;
varying float vBake;
varying vec3 vWPos;
varying vec3 vWNrm;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vBake = bake;
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWNrm = objectNormal;`,
      );

    let frag = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform sampler2D uNoise;
varying float vBake;
varying vec3 vWPos;
varying vec3 vWNrm;
${SKY_GLSL}
${kind === 'terrain' ? TERRAIN_PARS : ''}`,
    );
    if (kind === 'terrain') {
      frag = frag.replace('#include <color_fragment>', TERRAIN_COLOR);
    }
    frag = frag
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
reflectedLight.directDiffuse *= vBake;
reflectedLight.directSpecular *= vBake;`,
      )
      .replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
{
  float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  vec3 vd = normalize(vWPos - cameraPosition);
  vd.y = min(vd.y, 0.12);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, skyColor(vd), fogF);
}
#endif`,
      );
    shader.fragmentShader = frag;
  };
}

export function makeSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: /* glsl */ `
varying vec3 vDir;
${SKY_GLSL}
void main() {
  vec3 d = normalize(vDir);
  vec3 c = skyColor(d);
  float sd = dot(d, SUNDIR);
  float disc = smoothstep(0.99955, 0.99985, sd);
  c = mix(c, vec3(1.0, 0.86, 0.62), disc);
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}
