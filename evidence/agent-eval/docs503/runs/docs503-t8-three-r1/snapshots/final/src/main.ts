import * as THREE from 'three';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const CYCLE_SECONDS = 20;

// ---------- helpers ----------
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

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

function hash2(ix: number, iz: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

function fbm(x: number, z: number): number {
  return valueNoise(x, z) * 0.6 + valueNoise(x * 2.1 + 17, z * 2.1 + 3) * 0.3 + valueNoise(x * 4.3 + 5, z * 4.3 + 11) * 0.1;
}

function heightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const warp = 1 + (fbm(x * 0.18 + 40, z * 0.18 + 40) - 0.5) * 0.7;
  const fall = 1 - smoothstep(3, 10.5, r * warp);
  const hill = 4.2 * Math.exp(-(r * r) / 24);
  const bumps = (fbm(x * 0.35, z * 0.35) - 0.4) * 3.2;
  return (2.2 + bumps) * fall + hill * fall - 0.9 * (1 - fall);
}

// ---------- renderer / scene ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xaaccee, 0.009);

const camera = new THREE.PerspectiveCamera(48, 640 / 360, 0.5, 2000);

// ---------- sky ----------
const skyUniforms = {
  topColor: { value: new THREE.Color() },
  horizonColor: { value: new THREE.Color() },
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  sunColor: { value: new THREE.Color(1, 0.9, 0.7) },
  glow: { value: 1 },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(900, 32, 16),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      uniform float glow;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(horizonColor, topColor, pow(h, 0.55));
        if (d.y < 0.0) col = horizonColor;
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 8.0) * 0.35 + pow(s, 120.0) * 0.8) * glow;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }),
);
sky.renderOrder = -10;
scene.add(sky);

// stars
const starMat = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 2,
  sizeAttenuation: false,
  transparent: true,
  opacity: 0,
  fog: false,
  depthWrite: false,
});
{
  const rnd = mulberry32(7);
  const n = 700;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1;
    const phi = rnd() * Math.PI * 2;
    const y = Math.abs(u) * 0.95 + 0.05;
    const rr = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(phi) * rr * 800;
    pos[i * 3 + 1] = y * 800;
    pos[i * 3 + 2] = Math.sin(phi) * rr * 800;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(g, starMat);
  stars.frustumCulled = false;
  scene.add(stars);
}

const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(18, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }),
);
const moonMesh = new THREE.Mesh(
  new THREE.SphereGeometry(12, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false }),
);
scene.add(sunMesh, moonMesh);

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xbfdfff, 0x6a6a50, 0.8);
scene.add(hemi);

const sunLight = new THREE.DirectionalLight(0xfff0d0, 2.5);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
const sc = sunLight.shadow.camera;
sc.left = -16;
sc.right = 16;
sc.top = 16;
sc.bottom = -16;
sc.near = 1;
sc.far = 120;
sunLight.shadow.bias = -0.0008;
sunLight.shadow.normalBias = 0.05;
scene.add(sunLight, sunLight.target);

const moonLight = new THREE.DirectionalLight(0x7f9fff, 0.4);
scene.add(moonLight, moonLight.target);

// ---------- island ----------
const island = new THREE.Group();
scene.add(island);

{
  const geo = new THREE.PlaneGeometry(30, 30, 46, 46);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const step = 30 / 46;
  for (let i = 0; i < p.count; i++) {
    const jx = (hash2(i, 91) - 0.5) * step * 0.7;
    const jz = (hash2(i, 37) - 0.5) * step * 0.7;
    const x = p.getX(i) + jx;
    const z = p.getZ(i) + jz;
    p.setXYZ(i, x, heightAt(x, z), z);
  }
  const flat = geo.toNonIndexed();
  const fp = flat.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(fp.count * 3);
  const sand = new THREE.Color('#e6cf8e');
  const wetSand = new THREE.Color('#9c8a5e');
  const grassA = new THREE.Color('#5aa84a');
  const grassB = new THREE.Color('#3f8a3c');
  const rock = new THREE.Color('#8a8680');
  const snow = new THREE.Color('#e8eef2');
  const c = new THREE.Color();
  for (let f = 0; f < fp.count; f += 3) {
    const cy = (fp.getY(f) + fp.getY(f + 1) + fp.getY(f + 2)) / 3;
    const cx = (fp.getX(f) + fp.getX(f + 1) + fp.getX(f + 2)) / 3;
    const cz = (fp.getZ(f) + fp.getZ(f + 1) + fp.getZ(f + 2)) / 3;
    const v = hash2(f, 5);
    if (cy < -0.2) c.copy(wetSand);
    else if (cy < 0.55) c.copy(sand).lerp(wetSand, v * 0.2);
    else if (cy < 4.0) c.copy(grassA).lerp(grassB, clamp01(v * 0.8 + (cy - 0.5) * 0.08));
    else if (cy < 5.4) c.copy(rock).multiplyScalar(0.9 + v * 0.2);
    else c.copy(snow);
    c.multiplyScalar(0.92 + 0.16 * hash2(Math.floor(cx * 3), Math.floor(cz * 3)));
    for (let k = 0; k < 3; k++) {
      colors[(f + k) * 3] = c.r;
      colors[(f + k) * 3 + 1] = c.g;
      colors[(f + k) * 3 + 2] = c.b;
    }
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  flat.computeVertexNormals();
  const mesh = new THREE.Mesh(
    flat,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  island.add(mesh);
}

// trees and rocks
{
  const rnd = mulberry32(1234);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, flatShading: true, roughness: 1 });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: 0x2f7d3a, flatShading: true, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x3c9444, flatShading: true, roughness: 0.9 }),
  ];
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8a85, flatShading: true, roughness: 1 });
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 6);
  const coneGeo = new THREE.ConeGeometry(1, 1, 7);
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);

  const placed: THREE.Vector2[] = [];
  const free = (x: number, z: number, d: number): boolean => placed.every((q) => Math.hypot(q.x - x, q.y - z) > d);

  let trees = 0;
  for (let tries = 0; tries < 600 && trees < 24; tries++) {
    const a = rnd() * Math.PI * 2;
    const r = 1 + rnd() * 8;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = heightAt(x, z);
    if (y < 0.7 || y > 4.2 || !free(x, z, 1.6)) continue;
    placed.push(new THREE.Vector2(x, z));
    const s = 0.8 + rnd() * 0.7;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.scale.set(s, 1.2 * s, s);
    trunk.position.y = 0.6 * s;
    tree.add(trunk);
    const leaf = leafMats[trees % 2];
    for (let k = 0; k < 3; k++) {
      const cone = new THREE.Mesh(coneGeo, leaf);
      const w = (1.15 - k * 0.3) * s;
      const hgt = 1.2 * s;
      cone.scale.set(w, hgt, w);
      cone.position.y = (1.0 + k * 0.7) * s + hgt * 0.25;
      cone.rotation.y = rnd() * 3;
      tree.add(cone);
    }
    tree.position.set(x, y - 0.05, z);
    tree.rotation.y = rnd() * 6;
    tree.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    island.add(tree);
    trees++;
  }

  let rocks = 0;
  for (let tries = 0; tries < 600 && rocks < 9; tries++) {
    const a = rnd() * Math.PI * 2;
    const r = 3 + rnd() * 8;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = heightAt(x, z);
    if (y < -0.3 || y > 3.5 || !free(x, z, 1.2)) continue;
    placed.push(new THREE.Vector2(x, z));
    const rock = new THREE.Mesh(rockGeo, rockMat);
    const s = 0.4 + rnd() * 0.7;
    rock.scale.set(s * (1 + rnd() * 0.5), s * (0.6 + rnd() * 0.4), s * (1 + rnd() * 0.5));
    rock.position.set(x, y + s * 0.2, z);
    rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    island.add(rock);
    rocks++;
  }
}

// ---------- water ----------
const WATER_SIZE = 130;
const WATER_SEG = 90;
const waterGeo = (() => {
  const g = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_SEG, WATER_SEG);
  g.rotateX(-Math.PI / 2);
  return g.toNonIndexed();
})();
const waterPos = waterGeo.attributes.position as THREE.BufferAttribute;
const waterBase = new Float32Array(waterPos.count * 2);
{
  const colors = new Float32Array(waterPos.count * 3);
  const shallow = new THREE.Color('#58d6d0');
  const deep = new THREE.Color('#1d6fb0');
  const c = new THREE.Color();
  for (let i = 0; i < waterPos.count; i++) {
    const x = waterPos.getX(i);
    const z = waterPos.getZ(i);
    waterBase[i * 2] = x;
    waterBase[i * 2 + 1] = z;
    const r = Math.hypot(x, z);
    const shore = smoothstep(7, 17, r);
    c.copy(shallow).lerp(deep, shore);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  waterGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
const waterMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.28,
  metalness: 0.1,
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.frustumCulled = false;
water.receiveShadow = true;
scene.add(water);

// distant flat water so the edge of the animated grid is hidden by fog
const farWaterMat = new THREE.MeshStandardMaterial({ color: 0x1d6fb0, roughness: 0.3, metalness: 0.1 });
const farWater = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), farWaterMat);
farWater.position.y = -0.02;
scene.add(farWater);

function updateWater(t: number): void {
  const arr = waterPos.array as Float32Array;
  for (let i = 0; i < waterPos.count; i++) {
    const x = waterBase[i * 2];
    const z = waterBase[i * 2 + 1];
    const r = Math.hypot(x, z);
    const fade = 1 - smoothstep(40, 62, r);
    const h =
      0.18 * Math.sin(x * 0.5 + t * 1.3) +
      0.15 * Math.sin(z * 0.42 - t * 1.0) +
      0.1 * Math.sin((x + z) * 0.85 + t * 1.8) +
      0.06 * Math.sin((x - z) * 1.3 - t * 2.3);
    arr[i * 3 + 1] = h * fade;
  }
  waterPos.needsUpdate = true;
}

// ---------- day / night ----------
const C = (hex: string): THREE.Color => new THREE.Color(hex);
const dayTop = C('#2f7fe0');
const dayHor = C('#bfe0f5');
const duskTop = C('#3a4a8a');
const duskHor = C('#ff8a4a');
const nightTop = C('#04071a');
const nightHor = C('#14204a');

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
function blend3(out: THREE.Color, d: THREE.Color, u: THREE.Color, n: THREE.Color, wd: number, wu: number, wn: number): THREE.Color {
  out.setRGB(0, 0, 0);
  out.r = d.r * wd + u.r * wu + n.r * wn;
  out.g = d.g * wd + u.g * wu + n.g * wn;
  out.b = d.b * wd + u.b * wu + n.b * wn;
  return out;
}

const sunDir = new THREE.Vector3();
const sunNoon = C('#fff3d8');
const sunLow = C('#ff9040');
const hemiSkyDay = C('#bfdfff');
const hemiSkyNight = C('#3a4a90');
const hemiGroundDay = C('#7a7455');
const hemiGroundNight = C('#141a30');
const waterDay = C('#ffffff');
const waterNight = C('#6a7ab0');

function updateSky(elapsed: number): void {
  const a = (elapsed / CYCLE_SECONDS) * Math.PI * 2 + 0.9;
  sunDir.set(Math.cos(a), Math.sin(a), 0.35).normalize();
  const e = sunDir.y;

  const wd = smoothstep(-0.05, 0.35, e);
  const wn = 1 - smoothstep(-0.25, 0.0, e);
  const wu = Math.max(0, 1 - wd - wn);
  const sum = wd + wn + wu;

  blend3(tmpA, dayTop, duskTop, nightTop, wd / sum, wu / sum, wn / sum);
  skyUniforms.topColor.value.copy(tmpA);
  blend3(tmpB, dayHor, duskHor, nightHor, wd / sum, wu / sum, wn / sum);
  skyUniforms.horizonColor.value.copy(tmpB);
  (scene.fog as THREE.FogExp2).color.copy(tmpB);

  const low = 1 - smoothstep(0.05, 0.45, e);
  skyUniforms.sunColor.value.copy(sunNoon).lerp(sunLow, low);
  skyUniforms.sunDir.value.copy(sunDir);
  skyUniforms.glow.value = smoothstep(-0.2, 0.05, e);

  sunMesh.position.copy(sunDir).multiplyScalar(600);
  moonMesh.position.copy(sunDir).multiplyScalar(-600);
  (sunMesh.material as THREE.MeshBasicMaterial).color.copy(skyUniforms.sunColor.value).lerp(new THREE.Color(1, 1, 0.9), 0.4);
  sunMesh.visible = sunDir.y > -0.12;
  moonMesh.visible = sunDir.y < 0.12;
  (starMat as THREE.PointsMaterial).opacity = clamp01(wn * 1.1);

  // sun light
  const sunI = smoothstep(-0.08, 0.25, e);
  sunLight.position.copy(sunDir).multiplyScalar(50);
  sunLight.color.copy(sunNoon).lerp(sunLow, low);
  sunLight.intensity = 3.0 * sunI;

  // moon light
  const moonI = 1 - smoothstep(-0.2, 0.1, e);
  moonLight.position.copy(sunDir).multiplyScalar(-50);
  moonLight.intensity = 0.7 * moonI;

  // ambient never goes to zero
  hemi.color.copy(hemiSkyNight).lerp(hemiSkyDay, wd).lerp(duskHor, wu * 0.35);
  hemi.groundColor.copy(hemiGroundNight).lerp(hemiGroundDay, wd);
  hemi.intensity = 0.45 + 0.6 * wd + 0.1 * wu;

  waterMat.color.copy(waterNight).lerp(waterDay, clamp01(wd + wu * 0.7));
  farWaterMat.color.set('#1d6fb0');
  farWaterMat.color.multiply(waterMat.color);
}

// ---------- loop ----------
const clock = new THREE.Clock();
let first = true;
const center = new THREE.Vector3(0, 1.2, 0);

function frame(): void {
  const t = clock.getElapsedTime();
  updateSky(t);
  updateWater(t);

  const ang = 0.7 + t * 0.07;
  const radius = 31;
  camera.position.set(Math.cos(ang) * radius, 13 + Math.sin(t * 0.3) * 0.7, Math.sin(ang) * radius);
  camera.lookAt(center);

  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
