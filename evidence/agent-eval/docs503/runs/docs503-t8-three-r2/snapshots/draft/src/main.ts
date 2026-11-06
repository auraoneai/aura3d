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
scene.fog = new THREE.FogExp2(0xbfe0f5, 0.009);

const camera = new THREE.PerspectiveCamera(45, 640 / 360, 0.5, 3000);

// ---------- helpers ----------
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(1234);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

// ---------- terrain ----------
const SEA_FLOOR = -2.2;
const ISLAND_R = 18;

function heightAt(x: number, z: number): number {
  const theta = Math.atan2(z, x);
  const warp = 1 + 0.14 * Math.sin(3 * theta + 1) + 0.08 * Math.sin(5 * theta + 2) + 0.05 * Math.sin(2 * theta);
  const d = (Math.hypot(x, z) / ISLAND_R) * warp;
  const f = 1 - smoothstep(0.12, 1.0, d);
  const bumps = 0.9 * Math.sin(x * 0.55 + 1.3) * Math.sin(z * 0.5) + 0.5 * Math.sin(x * 1.1 + z * 0.8);
  return SEA_FLOOR + f * (7.6 + bumps);
}

const terrainColors = {
  floor: new THREE.Color(0x1a5a78),
  wetSand: new THREE.Color(0xc9b27a),
  sand: new THREE.Color(0xe6d395),
  grassA: new THREE.Color(0x5fae4a),
  grassB: new THREE.Color(0x4a9540),
  rock: new THREE.Color(0x8a8780),
  peak: new THREE.Color(0xb9b6ae),
};

function terrainColor(h: number, r: number, out: THREE.Color): THREE.Color {
  if (h < -0.6) return out.copy(terrainColors.floor);
  if (h < -0.05) return out.lerpColors(terrainColors.floor, terrainColors.wetSand, smoothstep(-0.6, -0.05, h));
  if (h < 0.35) return out.copy(terrainColors.sand);
  if (h < 0.9) return out.lerpColors(terrainColors.sand, terrainColors.grassA, smoothstep(0.35, 0.9, h));
  if (h < 3.4) return out.lerpColors(terrainColors.grassA, terrainColors.grassB, r);
  if (h < 4.2) return out.lerpColors(terrainColors.grassB, terrainColors.rock, smoothstep(3.4, 4.2, h));
  return out.lerpColors(terrainColors.rock, terrainColors.peak, smoothstep(4.2, 5.8, h));
}

function buildTerrain(): THREE.Mesh {
  const size = 70;
  const segs = 70;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const cell = size / segs;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let z = pos.getZ(i);
    const edge = Math.abs(x) > size / 2 - 0.01 || Math.abs(z) > size / 2 - 0.01;
    if (!edge) {
      x += (rand() - 0.5) * cell * 0.7;
      z += (rand() - 0.5) * cell * 0.7;
    }
    let y = heightAt(x, z);
    if (y > SEA_FLOOR + 0.01) y += (rand() - 0.5) * 0.35;
    pos.setXYZ(i, x, y, z);
  }
  const flat = geo.toNonIndexed();
  const p = flat.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    terrainColor(cy, rand(), c);
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = c.r;
      colors[(i + k) * 3 + 1] = c.g;
      colors[(i + k) * 3 + 2] = c.b;
    }
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  flat.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(flat, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
scene.add(buildTerrain());

// seabed plane that continues the terrain floor to the horizon
{
  const geo = new THREE.PlaneGeometry(3000, 3000);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: terrainColors.floor, roughness: 0.95, flatShading: true });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = SEA_FLOOR - 0.02;
  m.receiveShadow = true;
  scene.add(m);
}

// ---------- trees and rocks ----------
const vegetation = new THREE.Group();
scene.add(vegetation);
{
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, flatShading: true, roughness: 1 });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: 0x2f7d3a, flatShading: true, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x3c9446, flatShading: true, roughness: 0.9 }),
  ];
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8a84, flatShading: true, roughness: 1 });
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 1.2, 5);
  trunkGeo.translate(0, 0.6, 0);
  const coneGeo = new THREE.ConeGeometry(1, 1.6, 6);
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);

  const placed: Array<[number, number, number]> = [];
  const free = (x: number, z: number, r: number) => placed.every(([px, pz, pr]) => Math.hypot(px - x, pz - z) > pr + r);

  let trees = 0;
  let tries = 0;
  while (trees < 18 && tries++ < 2000) {
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand()) * 12;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const h = heightAt(x, z);
    if (h < 0.9 || h > 3.6 || !free(x, z, 1.1)) continue;
    placed.push([x, z, 1.1]);
    const s = 0.8 + rand() * 0.7;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.castShadow = true;
    tree.add(trunk);
    for (let k = 0; k < 3; k++) {
      const cone = new THREE.Mesh(coneGeo, leafMats[(trees + k) % 2]);
      const sc = 1.25 - k * 0.3;
      cone.scale.set(sc, 1 - k * 0.1, sc);
      cone.position.y = 1.2 + k * 0.85;
      cone.castShadow = true;
      tree.add(cone);
    }
    tree.scale.setScalar(s);
    tree.position.set(x, h - 0.3, z);
    tree.rotation.y = rand() * Math.PI * 2;
    vegetation.add(tree);
    trees++;
  }

  let rocks = 0;
  tries = 0;
  while (rocks < 9 && tries++ < 2000) {
    const a = rand() * Math.PI * 2;
    const rr = 5 + rand() * 9;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const h = heightAt(x, z);
    if (h < -0.3 || h > 3.8 || !free(x, z, 0.9)) continue;
    placed.push([x, z, 0.9]);
    const rock = new THREE.Mesh(rockGeo, rockMat);
    const s = 0.5 + rand() * 0.8;
    rock.scale.set(s * (1 + rand() * 0.5), s * (0.7 + rand() * 0.3), s * (1 + rand() * 0.5));
    rock.position.set(x, h + s * 0.25, z);
    rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    vegetation.add(rock);
    rocks++;
  }
}

// ---------- water ----------
const waterMat = new THREE.MeshStandardMaterial({
  color: 0x2a8fbf,
  roughness: 0.3,
  metalness: 0.1,
  flatShading: true,
  transparent: true,
  opacity: 0.82,
});
const WATER_SIZE = 130;
const WATER_SEGS = 72;
const waterGeo = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_SEGS, WATER_SEGS);
waterGeo.rotateX(-Math.PI / 2);
const waterPos = waterGeo.attributes.position as THREE.BufferAttribute;
{
  const cell = WATER_SIZE / WATER_SEGS;
  for (let i = 0; i < waterPos.count; i++) {
    const x = waterPos.getX(i);
    const z = waterPos.getZ(i);
    const edge = Math.abs(x) > WATER_SIZE / 2 - 0.01 || Math.abs(z) > WATER_SIZE / 2 - 0.01;
    if (!edge) waterPos.setXZ(i, x + (rand() - 0.5) * cell * 0.5, z + (rand() - 0.5) * cell * 0.5);
  }
}
const waterBaseXZ = new Float32Array(waterPos.count * 2);
for (let i = 0; i < waterPos.count; i++) {
  waterBaseXZ[i * 2] = waterPos.getX(i);
  waterBaseXZ[i * 2 + 1] = waterPos.getZ(i);
}
const water = new THREE.Mesh(waterGeo, waterMat);
scene.add(water);

// flat outer water out to the horizon
{
  const geo = new THREE.PlaneGeometry(3000, 3000);
  geo.rotateX(-Math.PI / 2);
  const outer = new THREE.Mesh(geo, waterMat);
  outer.position.y = -0.12;
  scene.add(outer);
}

function updateWater(t: number): void {
  for (let i = 0; i < waterPos.count; i++) {
    const x = waterBaseXZ[i * 2];
    const z = waterBaseXZ[i * 2 + 1];
    const y =
      0.16 * Math.sin(x * 0.45 + t * 1.6) +
      0.13 * Math.sin(z * 0.6 + t * 1.2) +
      0.1 * Math.sin((x + z) * 0.3 + t * 0.9) +
      0.06 * Math.sin((x - z) * 1.1 + t * 2.4);
    waterPos.setY(i, y - 0.06);
  }
  waterPos.needsUpdate = true;
}

// ---------- sky ----------
const skyUniforms = {
  topColor: { value: new THREE.Color() },
  horizonColor: { value: new THREE.Color() },
  glowColor: { value: new THREE.Color() },
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  glow: { value: 0 },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1000, 32, 16),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 glowColor;
      uniform vec3 sunDir;
      uniform float glow;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(horizonColor, topColor, pow(h, 0.55));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += glowColor * (pow(s, 6.0) * 0.35 + pow(s, 48.0) * 0.5) * glow;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  }),
);
sky.renderOrder = -10;
sky.frustumCulled = false;
scene.add(sky);

const starCount = 700;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const u = rand();
  const v = rand();
  const th = u * Math.PI * 2;
  const y = 0.05 + v * 0.95;
  const r = Math.sqrt(1 - y * y);
  starPos[i * 3] = Math.cos(th) * r * 900;
  starPos[i * 3 + 1] = y * 900;
  starPos[i * 3 + 2] = Math.sin(th) * r * 900;
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 2,
  sizeAttenuation: false,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  fog: false,
});
const stars = new THREE.Points(starGeo, starMat);
stars.frustumCulled = false;
scene.add(stars);

const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(28, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xfff2c4, fog: false, toneMapped: false }),
);
const moonMesh = new THREE.Mesh(
  new THREE.SphereGeometry(18, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xdfe6f5, fog: false, toneMapped: false }),
);
scene.add(sunMesh, moonMesh);

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xbfdfff, 0x4a4030, 1);
scene.add(hemi);

const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
const sc = sunLight.shadow.camera;
sc.left = -22;
sc.right = 22;
sc.top = 22;
sc.bottom = -22;
sc.near = 1;
sc.far = 120;
sunLight.shadow.bias = -0.0008;
sunLight.shadow.normalBias = 0.05;
scene.add(sunLight, sunLight.target);

const moonLight = new THREE.DirectionalLight(0x8fa8ff, 0.6);
scene.add(moonLight);

// ---------- day/night ----------
const DAY_SECONDS = 20;
const C = {
  dayTop: new THREE.Color(0x3a86e0),
  dayHor: new THREE.Color(0xbfe0f5),
  nightTop: new THREE.Color(0x060a1e),
  nightHor: new THREE.Color(0x1a2448),
  duskTop: new THREE.Color(0x5a5fa8),
  duskHor: new THREE.Color(0xff7a3a),
  sunWarm: new THREE.Color(0xff9a50),
  sunWhite: new THREE.Color(0xfff4e0),
  hemiDaySky: new THREE.Color(0xbfdfff),
  hemiNightSky: new THREE.Color(0x3a4a8a),
  hemiDayGround: new THREE.Color(0x5a5038),
  hemiNightGround: new THREE.Color(0x151a30),
};
const top = new THREE.Color();
const hor = new THREE.Color();
const sunDir = new THREE.Vector3();

function updateSky(phase: number): void {
  const a = phase * Math.PI * 2;
  sunDir.set(Math.cos(a) * 0.9, Math.sin(a), 0.4).normalize();
  const e = sunDir.y;
  const dayF = smoothstep(-0.1, 0.3, e);
  const dusk = Math.exp(-Math.pow(e / 0.22, 2));

  top.lerpColors(C.nightTop, C.dayTop, dayF).lerp(C.duskTop, dusk * 0.4);
  hor.lerpColors(C.nightHor, C.dayHor, dayF).lerp(C.duskHor, dusk * 0.85);

  skyUniforms.topColor.value.copy(top);
  skyUniforms.horizonColor.value.copy(hor);
  skyUniforms.glowColor.value.copy(C.sunWarm);
  skyUniforms.sunDir.value.copy(sunDir);
  skyUniforms.glow.value = smoothstep(-0.2, 0.1, e);
  (scene.fog as THREE.FogExp2).color.copy(hor);

  const camPos = camera.position;
  sky.position.copy(camPos);
  stars.position.copy(camPos);
  sunMesh.position.copy(camPos).addScaledVector(sunDir, 700);
  moonMesh.position.copy(camPos).addScaledVector(sunDir, -700);
  starMat.opacity = 1 - smoothstep(-0.15, 0.1, e);

  sunLight.position.copy(sunDir).multiplyScalar(60);
  sunLight.color.lerpColors(C.sunWarm, C.sunWhite, smoothstep(0.0, 0.45, e));
  sunLight.intensity = 2.6 * dayF;
  sunLight.castShadow = e > 0.02;

  moonLight.position.copy(sunDir).multiplyScalar(-60);
  moonLight.intensity = 0.7 * (1 - dayF);

  hemi.color.lerpColors(C.hemiNightSky, C.hemiDaySky, dayF).lerp(C.duskHor, dusk * 0.25);
  hemi.groundColor.lerpColors(C.hemiNightGround, C.hemiDayGround, dayF);
  hemi.intensity = 0.8 + 0.6 * dayF;
}

// ---------- loop ----------
const clock = new THREE.Clock();
let ready = false;
const START_PHASE = 0.18; // morning sun at start

function frame(): void {
  const t = clock.getElapsedTime();
  const phase = (START_PHASE + t / DAY_SECONDS) % 1;

  const ang = t * 0.12;
  camera.position.set(Math.cos(ang) * 36, 15, Math.sin(ang) * 36);
  camera.lookAt(0, 1.2, 0);

  updateWater(t);
  updateSky(phase);
  renderer.render(scene, camera);

  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
