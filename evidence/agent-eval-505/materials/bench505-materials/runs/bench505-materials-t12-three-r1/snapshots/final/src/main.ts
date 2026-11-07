import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createEnvironment } from './environment';
import { makeEngravingBump, makeFloorTexture, makeMarbleTexture, makePlateBump } from './textures';

declare global {
  interface Window {
    __TASK_STATE__: { materials: string[]; cameraAzimuthDeg: number };
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0705);
scene.fog = new THREE.Fog(0x0a0705, 14, 30);

const envMap = createEnvironment(renderer);

const camera = new THREE.PerspectiveCamera(35, 640 / 360, 0.1, 80);
const target = new THREE.Vector3(0, 1.7, 0);

// ---------- Materials ----------
const marbleTexA = makeMarbleTexture(1);
const marbleTexB = makeMarbleTexture(2);

function marbleMaterial(map: THREE.Texture): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    map,
    roughness: 0.2,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.06,
    envMap,
    envMapIntensity: 0.55,
  });
}
const marbleColumn = marbleMaterial(marbleTexA);
const marbleSteps = marbleMaterial(marbleTexB);

const gold = new THREE.MeshPhysicalMaterial({
  color: 0xffc65a,
  metalness: 1,
  roughness: 0.1,
  envMap,
  envMapIntensity: 1.6,
});
const goldEngraved = new THREE.MeshPhysicalMaterial({
  color: 0xb8892e,
  metalness: 1,
  roughness: 0.42,
  envMap,
  envMapIntensity: 1.2,
  bumpMap: makeEngravingBump(),
  bumpScale: 2.5,
});
const goldDarkPlain = new THREE.MeshPhysicalMaterial({
  color: 0xb8892e,
  metalness: 1,
  roughness: 0.4,
  envMap,
  envMapIntensity: 1.2,
});
const plateBump = makePlateBump();
const goldPlate = new THREE.MeshPhysicalMaterial({
  color: 0xffc65a,
  metalness: 1,
  roughness: 0.18,
  envMap,
  envMapIntensity: 1.5,
  bumpMap: plateBump,
  bumpScale: 1.5,
});
const darkstone = new THREE.MeshPhysicalMaterial({
  color: 0x0b0b0d,
  metalness: 0,
  roughness: 0.14,
  clearcoat: 1,
  clearcoatRoughness: 0.03,
  envMap,
  envMapIntensity: 0.9,
});

function shadowed<T extends THREE.Mesh>(m: T, cast = true, receive = true): T {
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// ---------- Room ----------
const floorTex = makeFloorTexture();
floorTex.repeat.set(5, 5);
const floor = shadowed(
  new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.38,
      metalness: 0,
      envMap,
      envMapIntensity: 0.25,
    }),
  ),
  false,
  true,
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const wall = shadowed(
  new THREE.Mesh(
    new THREE.PlaneGeometry(30, 14),
    new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.85, metalness: 0 }),
  ),
  false,
  true,
);
wall.position.set(0, 7, -3.8);
scene.add(wall);

// ---------- Pedestal ----------
const pedestal = new THREE.Group();
scene.add(pedestal);

function slab(w: number, h: number, d: number, y: number, mat: THREE.Material, r: number): void {
  const m = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat));
  m.position.y = y + h / 2;
  pedestal.add(m);
}
slab(1.95, 0.16, 1.95, 0.0, marbleSteps, 0.012);
slab(1.58, 0.16, 1.58, 0.16, marbleSteps, 0.012);
slab(1.15, 1.2, 1.15, 0.32, marbleColumn, 0.01);
slab(1.4, 0.12, 1.4, 1.52, marbleSteps, 0.015);
const PED_TOP = 1.64;

// ---------- Trophy base (black polished stone) + gold plate ----------
const baseH = 0.2;
const stoneBase = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.95, baseH, 0.95, 4, 0.02), darkstone));
stoneBase.position.y = PED_TOP + baseH / 2;
scene.add(stoneBase);
const plate = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.12, 0.012, 2, 0.004), goldPlate), true, false);
plate.position.set(0, PED_TOP + baseH / 2, 0.475 + 0.004);
scene.add(plate);

// ---------- Trophy ----------
const trophy = new THREE.Group();
trophy.position.y = PED_TOP + baseH;
trophy.scale.setScalar(1.15);
scene.add(trophy);

function spline2(pts: [number, number][], n: number): THREE.Vector2[] {
  const curve = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return curve.getPoints(n).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
}

const outer = spline2(
  [
    [0.3, 0.0],
    [0.3, 0.025],
    [0.26, 0.06],
    [0.14, 0.1],
    [0.07, 0.17],
    [0.055, 0.28],
    [0.1, 0.34],
    [0.118, 0.37],
    [0.1, 0.4],
    [0.055, 0.46],
    [0.05, 0.53],
    [0.09, 0.6],
    [0.2, 0.68],
    [0.32, 0.8],
    [0.395, 0.95],
    [0.415, 1.1],
    [0.41, 1.17],
  ],
  220,
);
const lip: THREE.Vector2[] = [
  new THREE.Vector2(0.412, 1.18),
  new THREE.Vector2(0.4, 1.195),
  new THREE.Vector2(0.386, 1.18),
];
const inner = spline2(
  [
    [0.385, 1.16],
    [0.37, 1.0],
    [0.3, 0.86],
    [0.15, 0.76],
    [0.0, 0.72],
  ],
  60,
);
const cupGeo = new THREE.LatheGeometry([...outer, ...lip, ...inner], 96);
trophy.add(shadowed(new THREE.Mesh(cupGeo, gold)));

// engraved band following the cup wall
const bandPts: THREE.Vector2[] = [];
const bandOuter = outer.filter((p) => p.y >= 0.76 && p.y <= 0.88);
bandOuter.forEach((p, i) => {
  const s = i / (bandOuter.length - 1);
  bandPts.push(new THREE.Vector2(p.x + 0.002 + 0.008 * Math.sin(Math.PI * s) ** 0.4, p.y));
});
trophy.add(shadowed(new THREE.Mesh(new THREE.LatheGeometry(bandPts, 96), goldEngraved), true, false));

// thin dark-gold ring on stem and at foot
function ring(y: number, radius: number, tube: number, mat: THREE.Material): void {
  const m = shadowed(new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 14, 64), mat), true, false);
  m.rotation.x = Math.PI / 2;
  m.position.y = y;
  trophy.add(m);
}
ring(0.2, 0.068, 0.016, goldDarkPlain);
ring(0.5, 0.058, 0.012, goldDarkPlain);
ring(0.085, 0.2, 0.01, goldDarkPlain);

// handles
const handleCurve = (sign: number) =>
  new THREE.CatmullRomCurve3(
    (
      [
        [0.34, 0.99],
        [0.5, 1.09],
        [0.64, 1.02],
        [0.68, 0.86],
        [0.58, 0.7],
        [0.4, 0.62],
        [0.2, 0.6],
        [0.12, 0.6],
      ] as [number, number][]
    ).map(([x, y]) => new THREE.Vector3(sign * x, y, 0)),
    false,
    'centripetal',
  );
for (const sign of [1, -1]) {
  trophy.add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(handleCurve(sign), 96, 0.03, 16), gold), true, false));
}

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0x3a2e28, 0x120c08, 0.35));

const spot = new THREE.SpotLight(0xffd9a2, 240, 0, 0.36, 0.85, 2);
spot.position.set(2.2, 6.6, 6.2);
spot.target.position.set(0, 1.5, 0);
spot.castShadow = true;
spot.shadow.mapSize.set(2048, 2048);
spot.shadow.radius = 7;
spot.shadow.bias = -0.0003;
spot.shadow.normalBias = 0.02;
spot.shadow.camera.near = 3;
spot.shadow.camera.far = 20;
scene.add(spot, spot.target);

const fill = new THREE.DirectionalLight(0x8aa4d6, 0.35);
fill.position.set(-6, 3, 4);
scene.add(fill);

const rim = new THREE.SpotLight(0xffe2b8, 130, 0, 0.5, 0.7, 2);
rim.position.set(-3.5, 5, -5.5);
rim.target.position.set(0, 1.8, 0);
scene.add(rim, rim.target);

// ---------- Animation ----------
window.__TASK_STATE__ = { materials: ['marble', 'gold', 'darkstone'], cameraAzimuthDeg: 0 };

const RADIUS = 7.4;
const CAM_H = 2.5;
const AMPLITUDE = 15;

function setCamera(timeSec: number): void {
  const az = AMPLITUDE * Math.sin(timeSec * 0.28);
  const a = THREE.MathUtils.degToRad(az);
  camera.position.set(target.x + RADIUS * Math.sin(a), CAM_H, target.z + RADIUS * Math.cos(a));
  camera.lookAt(target);
  window.__TASK_STATE__.cameraAzimuthDeg = az;
}

const t0 = performance.now();
let first = true;
function frame(): void {
  setCamera((performance.now() - t0) / 1000);
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
setCamera(0);
requestAnimationFrame(frame);
