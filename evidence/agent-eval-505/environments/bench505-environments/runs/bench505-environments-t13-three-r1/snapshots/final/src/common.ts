import * as THREE from 'three';

/** Shared time uniform, updated once per frame. */
export const timeU = { value: 0 };

export function makeRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Height of the sandy seabed (ripples on top of low dunes). */
export function groundY(x: number, z: number): number {
  const w = x * 0.9 + z * 0.35 + 1.3 * Math.sin(z * 0.3 + x * 0.12);
  const ripple = Math.sin(w * 2.6) * 0.075 + Math.sin((x * 0.25 - z * 0.7) * 2.1 + 1.0) * 0.025;
  const dune = 0.35 * Math.sin(x * 0.13 + 0.5) * Math.cos(z * 0.11) + 0.15 * Math.sin(x * 0.31 + z * 0.23);
  return ripple + dune;
}

export function paint(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

const CAUSTIC_FN = /* glsl */ `
float causticPattern(vec2 pin, float t) {
  vec2 p = pin - 250.0;
  vec2 i = p;
  float c = 1.0;
  const float inten = 0.005;
  for (int n = 0; n < 5; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 5.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
`;

/** Adds drifting caustic light patterns (world-space, from above) to a standard material. */
export function addCaustics(mat: THREE.Material, strength: number): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeU;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        varying vec3 vWPos;
        varying vec3 vWNrm;
        ${CAUSTIC_FN}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          vec2 cp = vWPos.xz * 0.45 + vec2(vWPos.y * 0.15, 0.0);
          float cs = causticPattern(cp, uTime * 0.45 + 10.0);
          cs = min(cs, 1.6) * 0.8 + 0.2 * causticPattern(cp * 1.7 + 3.0, uTime * 0.3);
          float up = clamp(vWNrm.y * 0.6 + 0.4, 0.0, 1.0);
          float depthFade = smoothstep(9.0, 0.0, vWPos.y);
          outgoingLight += vec3(0.55, 1.0, 0.9) * cs * up * depthFade * ${strength.toFixed(3)};
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'caustics' + strength.toFixed(3);
}

/** Bends instanced geometry (local y up) like a plant swaying in a current. */
export function addSway(mat: THREE.Material, amp: number): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeU;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float h = max(position.y, 0.0);
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = vec3(instanceMatrix[3]);
          #endif
          float ph = ip.x * 0.6 + ip.z * 0.8;
          float s1 = sin(uTime * 1.3 + ph + h * 1.6);
          float s2 = cos(uTime * 1.0 + ph * 1.3 + h * 1.2);
          transformed.x += s1 * ${amp.toFixed(3)} * h * h;
          transformed.z += s2 * ${amp.toFixed(3)} * h * h * 0.7;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'sway' + amp.toFixed(3);
}
