import * as THREE from 'three';
import { P, U_MAX, SUN, cl, clSlope, camU, height, sunShadow, mulberry32 } from './terrain';
import { makeNoiseTexture, makeSky, patchMaterial } from './materials';
import { buildBoulders, buildShrubs } from './props';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xdb8080, 0.0065);

const camera = new THREE.PerspectiveCamera(60, 640 / 360, 0.3, 1500);

const sky = makeSky();
scene.add(sky);

// ---- lights ----
const sunDir = new THREE.Vector3(SUN[0], SUN[1], SUN[2]);
const sun = new THREE.DirectionalLight(0xffc890, 4.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const SH = 70;
sun.shadow.camera.left = -SH;
sun.shadow.camera.right = SH;
sun.shadow.camera.top = SH;
sun.shadow.camera.bottom = -SH;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 400;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.08;
sun.shadow.radius = 2;
scene.add(sun);
scene.add(sun.target);
scene.add(new THREE.HemisphereLight(0x7f86d6, 0x9a5a48, 3.4));

// light-space basis for texel snapping of the shadow frustum
const lightRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize();
const lightUp = new THREE.Vector3().crossVectors(sunDir, lightRight).normalize();
const texel = (2 * SH) / 2048;

// ---- terrain ----
const rng = mulberry32(20240611);
const noiseTex = makeNoiseTexture(rng);

function buildTerrain(): THREE.BufferGeometry {
  const NU = 160;
  const NZ = 384;
  const vc = (NU + 1) * (NZ + 1);
  const pos = new Float32Array(vc * 3);
  const nor = new Float32Array(vc * 3);
  const bake = new Float32Array(vc);
  const e = 0.35;
  let v = 0;
  for (let k = 0; k <= NZ; k++) {
    const z = (P * k) / NZ;
    const c = cl(z);
    const slope = clSlope(z);
    for (let i = 0; i <= NU; i++) {
      const s = -1 + (2 * i) / NU;
      const u = U_MAX * (0.45 * s + 0.55 * s * s * s);
      const h = height(u, z);
      const hu = (height(u + e, z) - height(u - e, z)) / (2 * e);
      const hz = (height(u, z + e) - height(u, z - e)) / (2 * e);
      let nx = -hu;
      let ny = 1;
      let nz = -(hz - hu * slope);
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      pos[v * 3] = c + u;
      pos[v * 3 + 1] = h;
      pos[v * 3 + 2] = z;
      nor[v * 3] = nx;
      nor[v * 3 + 1] = ny;
      nor[v * 3 + 2] = nz;
      bake[v] = sunShadow(c + u, h + 0.15, z);
      v++;
    }
  }
  const idx = new Uint32Array(NU * NZ * 6);
  let q = 0;
  for (let k = 0; k < NZ; k++) {
    for (let i = 0; i < NU; i++) {
      const a = k * (NU + 1) + i;
      const b = a + 1;
      const c2 = a + NU + 1;
      const d = c2 + 1;
      // winding chosen so the +y face is front-facing
      idx[q++] = a;
      idx[q++] = c2;
      idx[q++] = b;
      idx[q++] = b;
      idx[q++] = c2;
      idx[q++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('bake', new THREE.BufferAttribute(bake, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const terrainMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
patchMaterial(terrainMat, 'terrain', noiseTex);
const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0 });
patchMaterial(rockMat, 'prop', noiseTex);
const shrubMat = new THREE.MeshStandardMaterial({ color: 0x5c4332, roughness: 1, metalness: 0 });
patchMaterial(shrubMat, 'prop', noiseTex);

const terrainGeo = buildTerrain();
const boulderGeo = buildBoulders(rng, 80);
const shrubGeo = buildShrubs(rng, 70);

// Two copies of one periodic canyon section, back to back.
for (let n = 0; n < 2; n++) {
  const group = new THREE.Group();
  group.position.z = n * P;
  const t = new THREE.Mesh(terrainGeo, terrainMat);
  t.receiveShadow = true;
  group.add(t);
  const b = new THREE.Mesh(boulderGeo, rockMat);
  b.castShadow = true;
  b.receiveShadow = true;
  group.add(b);
  const s = new THREE.Mesh(shrubGeo, shrubMat);
  s.castShadow = true;
  s.receiveShadow = true;
  group.add(s);
  scene.add(group);
}

// ---- camera flythrough ----
const SPEED = 5.5;
const EYE = 1.9;

function floorAvg(z: number): number {
  let sum = 0;
  for (let i = -2; i <= 2; i++) sum += height(camU(z + i * 2), z + i * 2);
  return sum / 5;
}

const camPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const shadowTarget = new THREE.Vector3();
const fwd = new THREE.Vector3();

function updateCamera(time: number): void {
  const z = (time * SPEED) % P;
  camPos.set(cl(z) + camU(z), floorAvg(z) + EYE, z);
  const zt = z + 14;
  camTarget.set(cl(zt) + camU(zt), floorAvg(zt) + EYE + 2.2, zt);
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
  camera.updateMatrixWorld();

  sky.position.copy(camPos);

  // shadow frustum follows the camera, snapped to light-space texels
  camera.getWorldDirection(fwd);
  shadowTarget.copy(camPos).addScaledVector(fwd, 35);
  shadowTarget.y = camPos.y - EYE;
  const tx = shadowTarget.dot(lightRight);
  const ty = shadowTarget.dot(lightUp);
  shadowTarget
    .addScaledVector(lightRight, Math.round(tx / texel) * texel - tx)
    .addScaledVector(lightUp, Math.round(ty / texel) * texel - ty);
  sun.target.position.copy(shadowTarget);
  sun.position.copy(shadowTarget).addScaledVector(sunDir, 200);
  sun.target.updateMatrixWorld();
}

let ready = false;
function frame(ms: number): void {
  updateCamera(ms / 1000);
  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
