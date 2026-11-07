import * as THREE from 'three';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xaaccee, 60, 190);

const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.5, 600);

// ---------- deterministic random ----------
let seed = 12345;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

// ---------- terrain ----------
const WATER_LEVEL = 0;
function heightAt(x: number, z: number): number {
  const r = Math.sqrt(x * x * 0.9 + z * z * 1.15);
  const ang = Math.atan2(z, x);
  const R = 10.5 + Math.sin(ang * 3 + 1.0) * 1.2 + Math.sin(ang * 5 + 2.0) * 0.6;
  const t = Math.max(0, 1 - r / R);
  const base = Math.pow(t, 0.8) * 5.2 - 0.9;
  const bumps =
    Math.sin(x * 0.7 + 1.3) * Math.cos(z * 0.6 - 0.4) * 0.5 +
    Math.sin(x * 1.7 - z * 1.3) * 0.25;
  const h = base + bumps * Math.min(1, t * 3);
  return Math.max(h, -1.4 + t * 0.5);
}

const SIZE = 30;
const SEG = 50;
const terrainGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
terrainGeo.rotateX(-Math.PI / 2);
{
  const pos = terrainGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
}
const flatGeo = terrainGeo.toNonIndexed();
flatGeo.computeVertexNormals();
{
  const pos = flatGeo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const h = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const jitter = (rand() - 0.5) * 0.08;
    if (h < -0.4) c.setHex(0xc9b27a);
    else if (h < 0.35) c.setHex(0xe8d49a);
    else if (h < 2.4) c.setHex(0x5fae4a);
    else if (h < 3.5) c.setHex(0x8a8f78);
    else c.setHex(0xf2f4f6);
    if (h >= 0.35 && h < 2.4) c.lerp(new THREE.Color(0x3e8a3a), Math.min(1, h / 2.4) * 0.6);
    c.offsetHSL(0, 0, jitter);
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = c.r;
      colors[(i + k) * 3 + 1] = c.g;
      colors[(i + k) * 3 + 2] = c.b;
    }
  }
  flatGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
const terrain = new THREE.Mesh(
  flatGeo,
  new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }),
);
terrain.receiveShadow = true;
terrain.castShadow = true;
scene.add(terrain);

// ---------- trees and rocks ----------
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, flatShading: true, roughness: 1 });
const leafMats = [0x2f8f3f, 0x3aa04a, 0x2a7a38].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9 }),
);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8b92, flatShading: true, roughness: 1 });

function addTree(x: number, z: number, s: number): void {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.22 * s, 1.2 * s, 6), trunkMat);
  trunk.position.y = 0.6 * s;
  g.add(trunk);
  const mat = leafMats[Math.floor(rand() * leafMats.length)];
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry((1.1 - i * 0.28) * s, 1.3 * s, 7), mat);
    cone.position.y = (1.5 + i * 0.8) * s;
    cone.castShadow = true;
    g.add(cone);
  }
  trunk.castShadow = true;
  g.position.set(x, heightAt(x, z) - 0.05, z);
  g.rotation.y = rand() * 6.28;
  scene.add(g);
}

function addRock(x: number, z: number, s: number): void {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
  m.position.set(x, heightAt(x, z) + s * 0.3, z);
  m.rotation.set(rand() * 3, rand() * 3, rand() * 3);
  m.scale.y = 0.7;
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
}

{
  let placed = 0;
  let tries = 0;
  while (placed < 16 && tries < 600) {
    tries++;
    const x = (rand() - 0.5) * 20;
    const z = (rand() - 0.5) * 20;
    const h = heightAt(x, z);
    if (h > 0.5 && h < 2.6) {
      addTree(x, z, 0.8 + rand() * 0.6);
      placed++;
    }
  }
  placed = 0;
  tries = 0;
  while (placed < 8 && tries < 600) {
    tries++;
    const x = (rand() - 0.5) * 24;
    const z = (rand() - 0.5) * 24;
    const h = heightAt(x, z);
    if (h > -0.5 && h < 1.2) {
      addRock(x, z, 0.3 + rand() * 0.5);
      placed++;
    }
  }
  // palm-less beach hut-ish rock on the summit
  addRock(0.5, -0.3, 0.7);
}

// ---------- water ----------
const WATER_SIZE = 400;
const WATER_SEG = 120;
const waterGeo = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_SEG, WATER_SEG);
waterGeo.rotateX(-Math.PI / 2);
const waterPos = waterGeo.attributes.position as THREE.BufferAttribute;
const baseXZ = new Float32Array(waterPos.count * 2);
for (let i = 0; i < waterPos.count; i++) {
  baseXZ[i * 2] = waterPos.getX(i);
  baseXZ[i * 2 + 1] = waterPos.getZ(i);
}
const waterMat = new THREE.MeshPhongMaterial({
  color: 0x2a8fc0,
  specular: 0xffffff,
  shininess: 70,
  flatShading: true,
  transparent: true,
  opacity: 0.82,
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.position.y = WATER_LEVEL;
water.receiveShadow = true;
scene.add(water);

function updateWater(t: number): void {
  for (let i = 0; i < waterPos.count; i++) {
    const x = baseXZ[i * 2];
    const z = baseXZ[i * 2 + 1];
    const near = Math.abs(x) < 60 && Math.abs(z) < 60;
    const amp = near ? 1 : 0.5;
    const y =
      (Math.sin(x * 0.45 + t * 1.4) * 0.12 +
        Math.sin(z * 0.38 - t * 1.1) * 0.12 +
        Math.sin((x + z) * 0.8 + t * 2.1) * 0.05) * amp;
    waterPos.setY(i, y);
  }
  waterPos.needsUpdate = true;
}

// ---------- sky ----------
const skyUniforms = {
  uTop: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color() },
  uNight: { value: 0 },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(500, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uNight;
      varying vec3 vDir;
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float k = pow(clamp(h, 0.0, 1.0), 0.55);
        vec3 col = mix(uHorizon, uTop, k);
        if (h < 0.0) col = mix(uHorizon, uHorizon * 0.8, clamp(-h * 4.0, 0.0, 1.0));
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(sd, 6.0) * 0.25 + pow(sd, 400.0) * 1.2);
        if (sd > 0.9992) col = mix(col, vec3(1.0, 0.97, 0.85), 0.95);
        // moon opposite the sun
        float md = max(dot(d, -uSunDir), 0.0);
        if (md > 0.9993) col = mix(col, vec3(0.9, 0.93, 1.0), uNight);
        col += vec3(0.5, 0.6, 1.0) * pow(md, 200.0) * 0.25 * uNight;
        // stars
        vec3 sp = floor(d * 160.0);
        float st = hash(sp);
        float star = step(0.9965, st) * smoothstep(0.0, 0.3, h) * uNight;
        col += vec3(star);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  }),
);
scene.add(sky);

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x445533, 0.6);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -18;
sc.right = 18;
sc.top = 18;
sc.bottom = -18;
sc.near = 1;
sc.far = 120;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.05;
scene.add(sun);
scene.add(sun.target);

const moon = new THREE.DirectionalLight(0x6f88ff, 0.0);
scene.add(moon);

// ---------- day/night ----------
const DAY_LENGTH = 20;
const cTopDay = new THREE.Color(0x3b82e0);
const cHorDay = new THREE.Color(0xbfe0f5);
const cTopNight = new THREE.Color(0x050a24);
const cHorNight = new THREE.Color(0x111a3d);
const cTopDusk = new THREE.Color(0x3a4a96);
const cHorDusk = new THREE.Color(0xff8a4a);
const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
const sunDir = new THREE.Vector3();
const sunWarm = new THREE.Color(0xfff0d8);
const sunLow = new THREE.Color(0xff9a50);
const hemiSkyDay = new THREE.Color(0xbcd8ff);
const hemiSkyNight = new THREE.Color(0x2a3a7a);
const waterDay = new THREE.Color(0x2a8fc0);
const waterNight = new THREE.Color(0x16407a);

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function updateSky(time: number): void {
  const a = (time / DAY_LENGTH) * Math.PI * 2 + 0.9;
  sunDir.set(Math.cos(a) * 0.9, Math.sin(a), 0.4).normalize();
  const s = sunDir.y;
  const day = smooth(-0.12, 0.3, s);
  const dusk = Math.max(0, 1 - Math.abs(s) / 0.3) ; // 1 at horizon
  const night = 1 - smooth(-0.25, 0.05, s);

  // sky colours
  tmpA.copy(cTopNight).lerp(cTopDay, day);
  tmpA.lerp(cTopDusk, dusk * 0.6);
  skyUniforms.uTop.value.copy(tmpA);
  tmpB.copy(cHorNight).lerp(cHorDay, day);
  tmpB.lerp(cHorDusk, dusk * 0.85 * smooth(-0.3, 0.0, s));
  skyUniforms.uHorizon.value.copy(tmpB);
  skyUniforms.uSunDir.value.copy(sunDir);
  skyUniforms.uSunColor.value.copy(sunLow).lerp(sunWarm, smooth(0, 0.5, s));
  skyUniforms.uNight.value = night;

  (scene.fog as THREE.Fog).color.copy(tmpB);

  // lights
  sun.position.copy(sunDir).multiplyScalar(60);
  sun.intensity = 2.6 * smooth(-0.02, 0.25, s);
  sun.color.copy(sunLow).lerp(sunWarm, smooth(0, 0.5, s));
  const mdir = sunDir.clone().multiplyScalar(-1);
  moon.position.copy(mdir).multiplyScalar(60);
  moon.intensity = 0.55 * night;
  hemi.intensity = 0.3 + 0.65 * day;
  hemi.color.copy(hemiSkyNight).lerp(hemiSkyDay, day);
  hemi.groundColor.set(0x445533).lerp(new THREE.Color(0x1a2030), night);

  waterMat.color.copy(waterNight).lerp(waterDay, day);
  waterMat.specular.setScalar(0.2 + 0.8 * day);
}

// ---------- loop ----------
const clock = new THREE.Clock();
const target = new THREE.Vector3(0, 1.2, 0);
let first = true;

function frame(): void {
  const t = clock.getElapsedTime();
  updateWater(t);
  updateSky(t);

  const ang = t * 0.12 + 0.6;
  const radius = 30;
  camera.position.set(Math.cos(ang) * radius, 13, Math.sin(ang) * radius);
  camera.lookAt(target);
  sky.position.copy(camera.position);

  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
