import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  FogExp2,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  BackSide,
  NoToneMapping,
  Uint32BufferAttribute,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  L,
  X,
  buildTerrain,
  centerX,
  halfWidth,
  heightAt,
  wallDist,
} from './terrain';
import {
  makeBoulderGeometry,
  makeRng,
  makeRockMaterial,
  makeShrubGeometry,
  makeShrubMaterial,
} from './props';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.toneMapping = NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;

const scene = new Scene();

// ---- colours (display / sRGB space) ----
const HORIZON: [number, number, number] = [0.78, 0.46, 0.54];
const fogColor = new Color().setRGB(HORIZON[0], HORIZON[1], HORIZON[2], SRGBColorSpace);
scene.fog = new FogExp2(fogColor, 0.0105);
scene.background = fogColor.clone();

const SUN = new Vector3(0.25, 0.2, -1).normalize(); // direction towards the sun
const sunViewDir = { value: new Vector3() };
const sunGlow = { value: new Vector3(0.9, 0.45, 0.18) };

// ---- sky dome ----
const skyMat = new ShaderMaterial({
  side: BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    sunDir: { value: SUN.clone() },
    sunGlow: sunGlow,
    horizon: { value: new Vector3(HORIZON[0], HORIZON[1], HORIZON[2]) },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vDir;
    uniform vec3 sunDir;
    uniform vec3 sunGlow;
    uniform vec3 horizon;
    void main() {
      vec3 d = normalize(vDir);
      float e = max(d.y, 0.0);
      vec3 mid = vec3(0.50, 0.36, 0.62);
      vec3 zenith = vec3(0.06, 0.09, 0.30);
      vec3 col = mix(horizon, mid, smoothstep(0.0, 0.3, e));
      col = mix(col, zenith, smoothstep(0.2, 0.9, e));
      float s = max(dot(d, sunDir), 0.0);
      col += sunGlow * (0.35 * pow(s, 6.0) + 0.5 * pow(s, 32.0));
      col += vec3(1.0, 0.85, 0.6) * smoothstep(0.9993, 0.9998, s);
      // faint stars high up
      vec3 q = floor(d * 140.0);
      float h = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      col += vec3(0.8) * step(0.9985, h) * smoothstep(0.45, 0.8, d.y) * 0.5;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
});
const sky = new Mesh(new SphereGeometry(500, 32, 16), skyMat);
sky.renderOrder = -1;
sky.frustumCulled = false;
scene.add(sky);

// ---- fog patch: haze that picks up warm in-scattering toward the sun ----
function patchFog<T extends Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.sunViewDir = sunViewDir;
    shader.uniforms.sunGlow = sunGlow;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <fog_pars_fragment>',
        `#include <fog_pars_fragment>
         uniform vec3 sunViewDir;
         uniform vec3 sunGlow;`,
      )
      .replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
           float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
           float sd = max(dot(normalize(-vViewPosition), sunViewDir), 0.0);
           vec3 fogCol2 = fogColor + sunGlow * (0.35 * pow(sd, 6.0) + 0.5 * pow(sd, 32.0));
           gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol2, fogF);
         #endif`,
      );
  };
  return mat;
}

// ---- lights ----
const hemi = new HemisphereLight(0x8a80d8, 0x8a5038, 2.0);
scene.add(hemi);

const sun = new DirectionalLight(0xff9e52, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.15;
const SH_W = 85;
const SH_H = 50;
sun.shadow.camera.left = -SH_W;
sun.shadow.camera.right = SH_W;
sun.shadow.camera.top = SH_H;
sun.shadow.camera.bottom = -SH_H;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 620;
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);
scene.add(sun.target);

// ---- detail texture (grain) ----
function makeGrain(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const img = ctx.createImageData(256, 256);
  const rng = makeRng(99);
  for (let i = 0; i < 256 * 256; i++) {
    const v = 0.8 + 0.2 * rng();
    const b = Math.round(255 * v);
    img.data[i * 4] = b;
    img.data[i * 4 + 1] = b;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.repeat.set(X / 4, L / 4);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---- terrain tile ----
const NX = 240;
const NZ = 400;
const td = buildTerrain(NX, NZ);
const terrainGeo = new BufferGeometry();
terrainGeo.setAttribute('position', new Float32BufferAttribute(td.positions, 3));
terrainGeo.setAttribute('normal', new Float32BufferAttribute(td.normals, 3));
terrainGeo.setAttribute('color', new Float32BufferAttribute(td.colors, 3));
terrainGeo.setAttribute('uv', new Float32BufferAttribute(td.uvs, 2));
terrainGeo.setIndex(new Uint32BufferAttribute(td.indices, 1));

const terrainMat = patchFog(
  new MeshStandardMaterial({ vertexColors: true, map: makeGrain(), roughness: 1, metalness: 0 }),
);
const tile = new Group();
const terrain = new Mesh(terrainGeo, terrainMat);
terrain.castShadow = true;
terrain.receiveShadow = true;
tile.add(terrain);

// ---- props: boulders and dead shrubs ----
const rockMat = patchFog(makeRockMaterial());
const shrubMat = patchFog(makeShrubMaterial());
const boulderGeos = [1, 2, 3, 4, 5].map((s) => makeBoulderGeometry(s * 1.37));
const shrubGeos = [11, 12, 13, 14].map((s) => makeShrubGeometry(s));
const rng = makeRng(2024);

function onFloor(x: number, z: number, r: number): boolean {
  return (
    wallDist(x, z) <= 0.01 &&
    wallDist(x - r, z) <= 0.2 &&
    wallDist(x + r, z) <= 0.2 &&
    Math.abs(x - centerX(z)) < halfWidth(z) - 1
  );
}

let placed = 0;
for (let tries = 0; placed < 44 && tries < 600; tries++) {
  const z = rng() * L;
  const c = centerX(z);
  const x = c + (rng() * 2 - 1) * halfWidth(z);
  const big = rng() < 0.35;
  const s = big ? 1.6 + rng() * 1.8 : 0.35 + rng() * 0.9;
  if (!onFloor(x, z, s * 1.2)) continue;
  if (Math.abs(x - c) < 4.5 && s > 0.8) continue;
  const m = new Mesh(boulderGeos[Math.floor(rng() * boulderGeos.length)], rockMat);
  const sy = s * (0.6 + rng() * 0.4);
  m.scale.set(s * (0.9 + rng() * 0.4), sy, s * (0.9 + rng() * 0.4));
  m.rotation.y = rng() * Math.PI * 2;
  m.position.set(x, heightAt(x, z) + 0.3 * sy, z);
  m.castShadow = true;
  m.receiveShadow = true;
  tile.add(m);
  placed++;
}

placed = 0;
for (let tries = 0; placed < 80 && tries < 1200; tries++) {
  const z = rng() * L;
  const c = centerX(z);
  const x = c + (rng() * 2 - 1) * halfWidth(z);
  if (!onFloor(x, z, 0.8)) continue;
  const m = new Mesh(shrubGeos[Math.floor(rng() * shrubGeos.length)], shrubMat);
  const s = 0.7 + rng() * 1.0;
  m.scale.setScalar(s);
  m.rotation.y = rng() * Math.PI * 2;
  m.position.set(x, heightAt(x, z), z);
  m.castShadow = true;
  m.receiveShadow = true;
  tile.add(m);
  placed++;
}

// tile covers z in [0, L]; a copy covers [-L, 0]
const tileB = tile.clone();
tileB.position.z = -L;
scene.add(tile, tileB);

// ---- camera flythrough ----
const camera = new PerspectiveCamera(55, 640 / 360, 0.3, 800);
const LOOP = 80; // seconds per loop
const TWO_PI = Math.PI * 2;

function drift(t: number): number {
  return 2.2 * Math.sin((TWO_PI * 3 * t) / LOOP) + 0.8 * Math.sin((TWO_PI * 7 * t) / LOOP + 1);
}

const tmpTarget = new Vector3();
const fwd = new Vector3();
const lx = new Vector3();
const ly = new Vector3();
const lc = new Vector3();
const UP = new Vector3(0, 1, 0);

function updateCamera(t: number): void {
  const frac = (((t / LOOP) % 1) + 1) % 1;
  const z = L * (1 - frac);
  camera.position.set(
    centerX(z) + drift(t),
    1.8 + 0.1 * Math.sin((TWO_PI * 9 * t) / LOOP),
    z,
  );
  const zt = z - 18;
  tmpTarget.set(centerX(zt) + 0.7 * drift(t + 4.5), 6.5, zt);
  camera.lookAt(tmpTarget);
  camera.rotateZ(0.015 * Math.sin((TWO_PI * 4 * t) / LOOP));
  camera.updateMatrixWorld();
}

function updateLighting(): void {
  camera.getWorldDirection(fwd);
  fwd.y = 0;
  fwd.normalize();
  lc.copy(camera.position).addScaledVector(fwd, 45);
  lc.y = 22;
  lx.crossVectors(UP, SUN).normalize();
  ly.crossVectors(SUN, lx);
  const tx = (2 * SH_W) / 2048;
  const ty = (2 * SH_H) / 2048;
  const cx = Math.round(lc.dot(lx) / tx) * tx;
  const cy = Math.round(lc.dot(ly) / ty) * ty;
  const cz = lc.dot(SUN);
  lc.set(0, 0, 0).addScaledVector(lx, cx).addScaledVector(ly, cy).addScaledVector(SUN, cz);
  sun.target.position.copy(lc);
  sun.position.copy(lc).addScaledVector(SUN, 300);
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();
  sunViewDir.value.copy(SUN).transformDirection(camera.matrixWorldInverse);
}

const T0 = 6;
const start = performance.now();
let first = true;

function frame(now: number): void {
  const t = T0 + (now - start) / 1000;
  updateCamera(t);
  updateLighting();
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
