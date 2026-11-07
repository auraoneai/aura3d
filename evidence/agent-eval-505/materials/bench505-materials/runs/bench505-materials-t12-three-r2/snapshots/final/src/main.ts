import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  canvasTexture,
  makeBandCanvas,
  makeMarbleCanvas,
  makePlateCanvas,
  makeWindowCanvas,
} from './textures';

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
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070504);
scene.fog = new THREE.Fog(0x070504, 18, 40);

/* ---------------- Procedural reflection environment ---------------- */
function buildEnvironment(): THREE.Texture {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(40, 18, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.035, 0.022, 0.014), side: THREE.BackSide }),
  );
  room.position.y = 6;
  env.add(room);

  // warm floor glow so downward reflections are not black
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.09, 0.05, 0.03) }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.9;
  env.add(floor);

  const winTex = canvasTexture(makeWindowCanvas(2, 4), false);
  const addWindow = (
    pos: [number, number, number],
    w: number,
    h: number,
    lookAt: [number, number, number],
    tint: THREE.Color,
  ) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: winTex, color: tint, side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(...lookAt);
    env.add(m);
  };
  // windows in front-left, front-right and the sides (front is where the camera sits)
  addWindow([-14, 5, 6], 5, 10, [0, 2, 0], new THREE.Color(9, 9.5, 11));
  addWindow([-14, 5, -4], 4, 9, [0, 2, 0], new THREE.Color(7, 7.5, 9));
  addWindow([13, 4, 10], 5, 9, [0, 2, 0], new THREE.Color(10, 8.5, 6.5));
  addWindow([2, 6, 18], 6, 8, [0, 2, 0], new THREE.Color(5, 4.6, 4));

  const addLamp = (pos: [number, number, number], r: number, c: THREE.Color) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ color: c }));
    m.position.set(...pos);
    env.add(m);
  };
  addLamp([-6, 9, 12], 0.7, new THREE.Color(40, 24, 10));
  addLamp([7, 8, 6], 0.6, new THREE.Color(36, 22, 9));
  addLamp([0, 8, -12], 0.8, new THREE.Color(24, 15, 7));

  // long ceiling strip light
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 18),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4, 3), side: THREE.DoubleSide }),
  );
  strip.rotation.x = Math.PI / 2;
  strip.position.set(1, 14.5, 4);
  env.add(strip);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.015, 0.1, 100);
  pmrem.dispose();
  return rt.texture;
}
const envMap = buildEnvironment();

/* ---------------- Materials ---------------- */
const marbleCanvas = makeMarbleCanvas(1024);
const marbleBase = canvasTexture(marbleCanvas, true);
function marbleMaterial(rx: number, ry: number, ox: number, oy: number): THREE.MeshPhysicalMaterial {
  const map = marbleBase.clone();
  map.repeat.set(rx, ry);
  map.offset.set(ox, oy);
  map.needsUpdate = true;
  return new THREE.MeshPhysicalMaterial({
    color: 0xf4f1ec,
    map,
    roughness: 0.22,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.06,
    envMap,
    envMapIntensity: 0.45,
  });
}

const goldMat = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(1.0, 0.74, 0.28),
  metalness: 1,
  roughness: 0.12,
  envMap,
  envMapIntensity: 1.6,
  side: THREE.DoubleSide,
});
goldMat.name = 'gold';

const bandTex = canvasTexture(makeBandCanvas(), true);
const darkGoldMat = new THREE.MeshPhysicalMaterial({
  color: 0xd9a64a,
  map: bandTex,
  metalness: 1,
  roughness: 0.42,
  envMap,
  envMapIntensity: 1.1,
  side: THREE.DoubleSide,
});

const darkStoneMat = new THREE.MeshPhysicalMaterial({
  color: 0x0b0b0d,
  roughness: 0.14,
  metalness: 0,
  clearcoat: 1,
  clearcoatRoughness: 0.04,
  envMap,
  envMapIntensity: 0.9,
});
darkStoneMat.name = 'darkstone';

const plateTex = canvasTexture(makePlateCanvas(), true);
const plateMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  map: plateTex,
  metalness: 1,
  roughness: 0.2,
  envMap,
  envMapIntensity: 1.3,
});

/* ---------------- Gallery ---------------- */
const floorMat = new THREE.MeshStandardMaterial({
  color: 0x2b2018,
  roughness: 0.32,
  metalness: 0,
  envMap,
  envMapIntensity: 0.25,
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a4332, roughness: 0.9, metalness: 0 });
const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), wallMat);
wall.position.set(0, 8, -3.6);
wall.receiveShadow = true;
scene.add(wall);

/* ---------------- Pedestal ---------------- */
const pedestal = new THREE.Group();
scene.add(pedestal);
function addBlock(w: number, h: number, d: number, y: number, mat: THREE.Material, radius = 0.02) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), mat);
  m.position.y = y + h / 2;
  m.castShadow = true;
  m.receiveShadow = true;
  pedestal.add(m);
  return m;
}
addBlock(3.0, 0.3, 3.0, 0.0, marbleMaterial(1, 1, 0.0, 0.0));
addBlock(2.3, 0.35, 2.3, 0.3, marbleMaterial(0.8, 0.2, 0.3, 0.5));
addBlock(1.7, 0.15, 1.7, 0.65, marbleMaterial(0.6, 0.2, 0.6, 0.1));
addBlock(1.4, 1.4, 1.4, 0.8, marbleMaterial(0.5, 0.7, 0.15, 0.2), 0.015);
addBlock(1.8, 0.18, 1.8, 2.2, marbleMaterial(0.6, 0.2, 0.8, 0.7));

const standTop = 2.38;
const standH = 0.3;
const stand = new THREE.Mesh(new RoundedBoxGeometry(1.1, standH, 0.9, 4, 0.025), darkStoneMat);
stand.position.y = standTop + standH / 2;
stand.castShadow = true;
stand.receiveShadow = true;
scene.add(stand);

const plate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.012), plateMat);
plate.position.set(0, standTop + standH / 2, 0.45 + 0.004);
plate.castShadow = true;
scene.add(plate);

/* ---------------- Trophy ---------------- */
const trophy = new THREE.Group();
trophy.position.y = standTop + standH;
trophy.scale.setScalar(0.95);
scene.add(trophy);

// profile as (radius, height) control points, bottom to top, then down the inside of the cup
const profileCtrl: [number, number][] = [
  [0.001, 0], [0.3, 0], [0.52, 0], [0.57, 0.02], [0.58, 0.05], [0.54, 0.09], [0.42, 0.13],
  [0.28, 0.19], [0.17, 0.29], [0.12, 0.42], [0.105, 0.58], [0.11, 0.7], [0.17, 0.76],
  [0.2, 0.82], [0.17, 0.89], [0.11, 0.95], [0.1, 1.02], [0.14, 1.08], [0.3, 1.16],
  [0.48, 1.3], [0.62, 1.5], [0.71, 1.75], [0.74, 1.95], [0.74, 2.08],
  // rim
  [0.745, 2.12], [0.73, 2.15], [0.7, 2.14], [0.69, 2.11],
  // inside
  [0.66, 1.95], [0.6, 1.6], [0.45, 1.35], [0.2, 1.22], [0.001, 1.18],
];
const spline = new THREE.SplineCurve(profileCtrl.map(([r, y]) => new THREE.Vector2(r, y)));
const profile = spline.getPoints(360).map((p) => new THREE.Vector2(Math.max(0.0005, p.x), p.y));

const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 128), goldMat);
body.castShadow = true;
body.receiveShadow = true;
trophy.add(body);

// outer wall only (up to the highest point of the profile)
let topIdx = 0;
profile.forEach((p, i) => {
  if (p.y > (profile[topIdx] as THREE.Vector2).y) topIdx = i;
});
const outer = profile.slice(0, topIdx + 1);
function radiusAt(y: number): number {
  for (let i = 1; i < outer.length; i++) {
    const a = outer[i - 1] as THREE.Vector2;
    const b = outer[i] as THREE.Vector2;
    if ((a.y <= y && b.y >= y) && b.y > a.y) {
      const t = (y - a.y) / (b.y - a.y);
      return a.x + (b.x - a.x) * t;
    }
  }
  return 0.7;
}

// engraved band: darker, rougher gold sitting slightly proud of the cup wall
const bandPts: THREE.Vector2[] = [];
const bandY0 = 1.4;
const bandY1 = 1.58;
for (let i = 0; i <= 12; i++) {
  const y = bandY0 + ((bandY1 - bandY0) * i) / 12;
  bandPts.push(new THREE.Vector2(radiusAt(y) + 0.008, y));
}
const band = new THREE.Mesh(new THREE.LatheGeometry(bandPts, 192), darkGoldMat);
band.castShadow = true;
trophy.add(band);

// bright gold beads framing the band
for (const y of [bandY0 - 0.02, bandY1 + 0.02]) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radiusAt(y) + 0.008, 0.017, 16, 160), goldMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = y;
  ring.castShadow = true;
  trophy.add(ring);
}

// handles: tubes along smooth curves, mirrored left/right
function makeHandle(sign: number): THREE.Mesh {
  const pts = [
    [0.46, 1.28], [0.7, 1.2], [0.98, 1.34], [1.12, 1.62], [1.05, 1.92], [0.88, 2.06], [0.76, 1.98], [0.72, 1.9],
  ].map(([x, y]) => new THREE.Vector3(sign * (x as number), y as number, 0));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  const geo = new THREE.TubeGeometry(curve, 96, 0.05, 20, false);
  const m = new THREE.Mesh(geo, goldMat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
trophy.add(makeHandle(1), makeHandle(-1));

// small acorn finial-style bulbs where handles meet the cup
for (const s of [1, -1]) {
  for (const [x, y, r] of [[0.5, 1.28, 0.07], [0.74, 1.92, 0.065]] as [number, number, number][]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), goldMat);
    b.position.set(s * x, y, 0);
    b.castShadow = true;
    trophy.add(b);
  }
}

/* ---------------- Lights ---------------- */
const spot = new THREE.SpotLight(0xffd7a0, 520, 0, 0.36, 0.85, 2);
spot.position.set(2.5, 9, 7);
spot.target.position.set(0, 2.2, 0);
spot.castShadow = true;
spot.shadow.mapSize.set(2048, 2048);
spot.shadow.camera.near = 3;
spot.shadow.camera.far = 25;
spot.shadow.bias = -0.0004;
spot.shadow.normalBias = 0.03;
spot.shadow.radius = 5;
scene.add(spot, spot.target);

const fill = new THREE.DirectionalLight(0x8aa6ff, 0.35);
fill.position.set(-7, 3, 6);
fill.target.position.set(0, 2.2, 0);
scene.add(fill, fill.target);

const rim = new THREE.SpotLight(0xffe6c0, 160, 0, 0.5, 0.9, 2);
rim.position.set(-3.5, 6.5, -6);
rim.target.position.set(0, 3, 0);
scene.add(rim, rim.target);

scene.add(new THREE.AmbientLight(0x3a2618, 0.35));

/* ---------------- Camera ---------------- */
const camera = new THREE.PerspectiveCamera(34, 640 / 360, 0.1, 100);
const target = new THREE.Vector3(0, 2.55, 0);
const radius = 11;
const camHeight = 3.7;

window.__TASK_STATE__ = { materials: ['marble', 'gold', 'darkstone'], cameraAzimuthDeg: 0 };

let first = true;
function frame(timeMs: number) {
  const t = timeMs / 1000;
  const az = 15 * Math.sin(t * 0.35);
  const a = THREE.MathUtils.degToRad(az);
  camera.position.set(target.x + radius * Math.sin(a), camHeight, target.z + radius * Math.cos(a));
  camera.lookAt(target);
  renderer.render(scene, camera);
  window.__TASK_STATE__.cameraAzimuthDeg = az;
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
