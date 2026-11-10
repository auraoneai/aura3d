import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// World definition (periodic in z so the flythrough loops seamlessly)
// ---------------------------------------------------------------------------
const P = 320; // world period along z
const TWO_PI_P = (Math.PI * 2) / P;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function hash2(ix: number, iz: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Value noise in [0,1], periodic in z with n cells per period. */
function pn(x: number, z: number, n: number): number {
  const cell = P / n;
  const u = x / cell;
  const v = z / cell;
  const ix = Math.floor(u);
  const iz = Math.floor(v);
  let fx = u - ix;
  let fz = v - iz;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  const z0 = ((iz % n) + n) % n;
  const z1 = (z0 + 1) % n;
  const a = hash2(ix, z0);
  const b = hash2(ix + 1, z0);
  const c = hash2(ix, z1);
  const d = hash2(ix + 1, z1);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

function center(z: number): number {
  return (
    15 * Math.sin(TWO_PI_P * z + 0.5) +
    6 * Math.sin(TWO_PI_P * 3 * z + 2.0) +
    2 * Math.sin(TWO_PI_P * 7 * z + 4.0)
  );
}

function riverHalf(z: number): number {
  return 7.5 + 2.5 * Math.sin(TWO_PI_P * 2 * z + 1.0) + 1.0 * Math.sin(TWO_PI_P * 5 * z);
}

function heightAt(x: number, z: number): number {
  const c = center(z);
  const hw = riverHalf(z);
  const dx = x - c;
  const d = Math.abs(dx);
  let tt = Math.max(0, d - hw);
  tt += (2.5 * (pn(x, z, 40) - 0.5) + 1.0 * (pn(x, z, 100) - 0.5)) * Math.min(1, tt / 3);
  tt = Math.max(0, tt);

  const H = 22 + 18 * pn(x, z, 12);
  const base = H * (1 - Math.exp(-tt / 10)) + 0.1 * tt;
  const stepH = 4.0;
  const s = base / stepH;
  const fl = Math.floor(s);
  const f = s - fl;
  let h = (fl + smoothstep(0.6, 1.0, f)) * stepH;
  h += 2.5 * pn(x, z, 24) * smoothstep(10, 25, tt);

  const bed = 0.35 * pn(x, z, 64);
  const dip = -0.7 * (1 - smoothstep(0, hw, d));
  return h + bed + dip;
}

// ---------------------------------------------------------------------------
// Lighting constants (display-space colours for sky/haze)
// ---------------------------------------------------------------------------
const sunDir = new THREE.Vector3(-0.37, 0.2, -0.93).normalize();
const fogDisplay = new THREE.Vector3(0.69, 0.5, 0.56);
const hazeSunDisplay = new THREE.Vector3(1.0, 0.58, 0.34);

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(
  new THREE.Color().setRGB(fogDisplay.x, fogDisplay.y, fogDisplay.z, THREE.SRGBColorSpace),
  0.0105,
);

const camera = new THREE.PerspectiveCamera(55, 640 / 360, 0.3, 1400);

// Shared shader patch: direction-dependent haze colour + low-lying haze.
function patchMaterial(mat: THREE.MeshStandardMaterial, terrain: boolean): void {
  mat.customProgramCacheKey = () => (terrain ? 'canyon-terrain' : 'canyon-prop');
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = { value: sunDir };
    shader.uniforms.uHazeSun = { value: hazeSunDisplay };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `varying vec3 vWPos;\nvarying vec3 vWN;\n#include <common>`)
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
         vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
         vWN = normal;`,
      );

    const terrainColor = /* glsl */ `
      #include <color_fragment>
      {
        float y = vWPos.y;
        float warp = vn(vWPos.xz * 0.04) * 2.0 + sin(vWPos.z * 0.11 + vWPos.x * 0.07) * 0.4;
        float b = y * 0.36 + warp;
        float id = floor(b);
        float r = h21(vec2(id, 3.7));
        vec3 c0 = vec3(0.48, 0.20, 0.12);
        vec3 c1 = vec3(0.80, 0.40, 0.19);
        vec3 c2 = vec3(0.88, 0.64, 0.40);
        vec3 c3 = vec3(0.64, 0.33, 0.27);
        vec3 rock = mix(c0, c1, smoothstep(0.0, 0.33, r));
        rock = mix(rock, c2, smoothstep(0.33, 0.66, r));
        rock = mix(rock, c3, smoothstep(0.66, 1.0, r));
        float fl = fract(b * 3.0);
        rock *= 0.86 + 0.14 * smoothstep(0.0, 0.25, fl);
        float streak = vn(vec2((vWPos.x + vWPos.z) * 1.3, y * 0.18));
        rock *= 0.78 + 0.4 * streak;
        rock *= 0.9 + 0.2 * vn(vWPos.xz * 2.5 + y);
        vec3 sand = vec3(0.82, 0.58, 0.40) * (0.88 + 0.2 * vn(vWPos.xz * 1.7));
        float flatness = smoothstep(0.72, 0.95, vWN.y);
        vec3 col = mix(rock, sand, flatness * 0.7);
        float ripple = sin(vWPos.z * 1.3 + vn(vWPos.xz * 0.5) * 6.0) * 0.5 + 0.5;
        vec3 bed = vec3(0.74, 0.60, 0.50) * (0.85 + 0.15 * ripple);
        bed *= 0.85 + 0.3 * vn(vWPos.xz * 6.0);
        float pebbles = step(0.82, vn(vWPos.xz * 9.0));
        bed = mix(bed, bed * 0.6, pebbles * 0.5);
        col = mix(col, bed, vColor.r);
        diffuseColor.rgb = pow(col, vec3(2.2));
      }
    `;

    const noiseFns = /* glsl */ `
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
                   mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
      }
    `;

    const fogCode = /* glsl */ `
      #ifdef USE_FOG
        vec3 vd = normalize(vWPos - cameraPosition);
        float sd = max(dot(vd, uSunDir), 0.0);
        vec3 fc = mix(fogColor, uHazeSun, pow(sd, 5.0) * 0.85);
        float fd = vFogDepth * (1.0 + 0.5 * exp(-vWPos.y * 0.06));
        float ff = 1.0 - exp(-fogDensity * fogDensity * fd * fd);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fc, clamp(ff, 0.0, 1.0));
      #endif
    `;

    let frag = shader.fragmentShader.replace(
      '#include <common>',
      `varying vec3 vWPos;\nvarying vec3 vWN;\nuniform vec3 uSunDir;\nuniform vec3 uHazeSun;\n${terrain ? noiseFns : ''}\n#include <common>`,
    );
    frag = frag.replace('#include <fog_fragment>', fogCode);
    if (terrain) frag = frag.replace('#include <color_fragment>', terrainColor);
    shader.fragmentShader = frag;
  };
}

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    uSunDir: { value: sunDir },
    uFog: { value: fogDisplay },
    uHazeSun: { value: hazeSunDisplay },
    uMid: { value: new THREE.Vector3(0.52, 0.31, 0.58) },
    uZenith: { value: new THREE.Vector3(0.07, 0.11, 0.38) },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vDir;
    uniform vec3 uSunDir, uFog, uHazeSun, uMid, uZenith;
    void main() {
      vec3 d = normalize(vDir);
      float e = max(d.y, 0.0);
      float sd = max(dot(d, uSunDir), 0.0);
      vec3 hor = mix(uFog, uHazeSun, pow(sd, 5.0) * 0.85);
      vec3 col = mix(hor, uMid, smoothstep(0.0, 0.22, e));
      col = mix(col, uZenith, smoothstep(0.12, 0.85, e));
      float low = 1.0 - smoothstep(0.0, 0.5, e);
      col += vec3(1.0, 0.42, 0.16) * pow(sd, 14.0) * 0.75 * low;
      col += vec3(0.55, 0.1, 0.32) * pow(sd, 3.0) * 0.28 * low;
      col += vec3(1.0, 0.85, 0.6) * smoothstep(0.9993, 0.9998, sd) * 2.0;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
sky.frustumCulled = false;
sky.renderOrder = -1;
scene.add(sky);

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------
const sun = new THREE.DirectionalLight(0xffa05c, 4.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const SH = 64;
sun.shadow.camera.left = -SH;
sun.shadow.camera.right = SH;
sun.shadow.camera.top = SH;
sun.shadow.camera.bottom = -SH;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 420;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.25;
sun.shadow.radius = 3;
scene.add(sun);
scene.add(sun.target);

scene.add(new THREE.HemisphereLight(0x6a6cc4, 0x8a5240, 1.5));

// ---------------------------------------------------------------------------
// Terrain tile
// ---------------------------------------------------------------------------
function buildTerrain(): THREE.Mesh {
  const X0 = -70;
  const STEP = 0.8;
  const NX = 176;
  const NZ = Math.round(P / STEP) + 1;
  const count = NX * NZ;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const eps = 0.4;
  let i = 0;
  for (let iz = 0; iz < NZ; iz++) {
    const z = iz * STEP;
    const c = center(z);
    const hw = riverHalf(z);
    for (let ix = 0; ix < NX; ix++) {
      const x = X0 + ix * STEP;
      const h = heightAt(x, z);
      const dhx = (heightAt(x + eps, z) - heightAt(x - eps, z)) / (2 * eps);
      const dhz = (heightAt(x, z + eps) - heightAt(x, z - eps)) / (2 * eps);
      const l = Math.hypot(dhx, 1, dhz);
      pos[i * 3] = x;
      pos[i * 3 + 1] = h;
      pos[i * 3 + 2] = z;
      nor[i * 3] = -dhx / l;
      nor[i * 3 + 1] = 1 / l;
      nor[i * 3 + 2] = -dhz / l;
      const d = Math.abs(x - c);
      col[i * 3] = 1 - smoothstep(hw * 0.8, hw * 1.15, d);
      col[i * 3 + 1] = 0;
      col[i * 3 + 2] = 0;
      i++;
    }
  }
  const idx = new Uint32Array((NX - 1) * (NZ - 1) * 6);
  let k = 0;
  for (let iz = 0; iz < NZ - 1; iz++) {
    for (let ix = 0; ix < NX - 1; ix++) {
      const a = iz * NX + ix;
      const b = a + 1;
      const c2 = a + NX;
      const d2 = c2 + 1;
      // CCW seen from +y
      idx[k++] = a;
      idx[k++] = c2;
      idx[k++] = b;
      idx[k++] = b;
      idx[k++] = c2;
      idx[k++] = d2;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
  });
  patchMaterial(mat, true);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Props: boulders and dead shrubs
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeBoulderGeometry(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n =
      1 +
      0.22 * Math.sin(v.x * 2.3 + seed) * Math.sin(v.y * 2.1 + seed * 1.7) +
      0.12 * Math.sin(v.z * 5.1 + seed * 3.1 + v.x * 3.0) +
      0.05 * Math.sin(v.x * 11 + v.y * 9 + v.z * 7 + seed);
    v.multiplyScalar(n);
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.15;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function makeShrubGeometry(seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  const branch = (origin: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number): void => {
    const geo = new THREE.CylinderGeometry(rad * 0.6, rad, len, 4, 1);
    geo.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
    geo.applyQuaternion(q);
    geo.translate(origin.x, origin.y, origin.z);
    parts.push(geo);
    if (depth <= 0) return;
    const end = origin.clone().addScaledVector(dir, len);
    const kids = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < kids; i++) {
      const nd = dir
        .clone()
        .add(new THREE.Vector3((rnd() - 0.5) * 1.3, rnd() * 0.5, (rnd() - 0.5) * 1.3))
        .normalize();
      branch(end, nd, len * (0.62 + rnd() * 0.15), rad * 0.62, depth - 1);
    }
  };

  const stems = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < stems; i++) {
    const a = (i / stems) * Math.PI * 2 + rnd();
    const dir = new THREE.Vector3(Math.cos(a) * 0.55, 1, Math.sin(a) * 0.55).normalize();
    branch(new THREE.Vector3(0, -0.05, 0), dir, 0.45 + rnd() * 0.2, 0.035, 3);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return merged ?? new THREE.BufferGeometry();
}

function buildProps(tile: THREE.Group): void {
  const rnd = mulberry32(1234);

  const boulderGeos = [makeBoulderGeometry(1.3), makeBoulderGeometry(4.1), makeBoulderGeometry(7.7)];
  const boulderMats = [0x8c5b3f, 0x9d6d4b, 0x7b4e3d].map((c) => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0, flatShading: true });
    patchMaterial(m, false);
    return m;
  });

  const addBoulder = (x: number, z: number, s: number): void => {
    const vi = Math.floor(rnd() * 3);
    const mesh = new THREE.Mesh(boulderGeos[vi], boulderMats[vi]);
    mesh.scale.set(s * (0.9 + rnd() * 0.4), s * (0.6 + rnd() * 0.35), s * (0.9 + rnd() * 0.4));
    mesh.rotation.y = rnd() * Math.PI * 2;
    mesh.position.set(x, heightAt(x, z) + 0.05 * s, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    tile.add(mesh);
  };

  for (let i = 0; i < 26; i++) {
    const z = rnd() * P;
    const hw = riverHalf(z);
    const x = center(z) + (rnd() * 2 - 1) * (hw + 2);
    const s = 0.5 + Math.pow(rnd(), 2.5) * 2.4;
    addBoulder(x, z, s);
    const extra = Math.floor(rnd() * 3);
    for (let j = 0; j < extra; j++) {
      addBoulder(x + (rnd() - 0.5) * 3.5 * s, z + (rnd() - 0.5) * 3.5 * s, s * (0.25 + rnd() * 0.3));
    }
  }

  const shrubGeos = [makeShrubGeometry(11), makeShrubGeometry(29), makeShrubGeometry(53)];
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0x5a463a, roughness: 1, metalness: 0 });
  patchMaterial(shrubMat, false);
  for (let i = 0; i < 46; i++) {
    const z = rnd() * P;
    const hw = riverHalf(z);
    const x = center(z) + (rnd() * 2 - 1) * (hw + 1.5);
    const mesh = new THREE.Mesh(shrubGeos[Math.floor(rnd() * 3)], shrubMat);
    const s = 0.9 + rnd() * 1.1;
    mesh.scale.set(s, s * (0.8 + rnd() * 0.5), s);
    mesh.rotation.y = rnd() * Math.PI * 2;
    mesh.position.set(x, heightAt(x, z), z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    tile.add(mesh);
  }
}

const tile = new THREE.Group();
tile.add(buildTerrain());
buildProps(tile);
for (let k = -1; k <= 1; k++) {
  const t = k === 0 ? tile : tile.clone();
  t.position.z = k * P;
  scene.add(t);
}

// ---------------------------------------------------------------------------
// Camera flythrough
// ---------------------------------------------------------------------------
const SPEED = 5; // world units per second
const lookTarget = new THREE.Vector3();
const shadowCenter = new THREE.Vector3();
const tmpR = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);

function updateCamera(time: number): void {
  const z = P - ((time * SPEED + 40) % P);
  const x =
    center(z) + 2.3 * Math.sin(time * 0.33) + 0.8 * Math.sin(time * 0.81 + 1.0);
  const y = heightAt(x, z) + 2.1 + 0.2 * Math.sin(time * 0.57);
  camera.position.set(x, y, z);

  const lz = z - 24;
  const lx = center(lz) + 1.6 * Math.sin(time * 0.33 + 0.9);
  lookTarget.set(lx, y + 4.5 + 0.8 * Math.sin(time * 0.23), lz);
  camera.lookAt(lookTarget);
  camera.rotateZ(0.025 * Math.sin(time * 0.33 + 0.4));

  sky.position.copy(camera.position);

  // Shadow frustum follows the camera, snapped to shadow texels.
  shadowCenter.set(x, y - 2, z - 22);
  const texel = (2 * SH) / 2048;
  tmpR.crossVectors(worldUp, sunDir).normalize();
  tmpU.crossVectors(sunDir, tmpR).normalize();
  const a = Math.round(shadowCenter.dot(tmpR) / texel) * texel;
  const b = Math.round(shadowCenter.dot(tmpU) / texel) * texel;
  const f = shadowCenter.dot(sunDir);
  shadowCenter.set(0, 0, 0).addScaledVector(tmpR, a).addScaledVector(tmpU, b).addScaledVector(sunDir, f);
  sun.target.position.copy(shadowCenter);
  sun.position.copy(shadowCenter).addScaledVector(sunDir, 200);
  sun.target.updateMatrixWorld();
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
let first = true;
function frame(ms: number): void {
  updateCamera(ms / 1000);
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
