import * as THREE from 'three';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; partCount: number; bandCount: number };
  }
}

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

// position-based noise so duplicated vertices move identically
function pnoise(x: number, y: number, z: number): number {
  return (
    Math.sin(x * 1.9 + y * 0.7) * Math.cos(z * 1.7 - y * 1.3) * 0.5 +
    Math.sin(x * 4.1 + z * 3.3 + y * 2.1) * 0.25 +
    Math.sin(z * 6.7 - x * 5.3) * 0.12
  );
}

function std(color: number, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...opts });
}

// ---------- renderer / scene ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const horizonColor = new THREE.Color(0xcfe3ee);
scene.fog = new THREE.Fog(horizonColor, 90, 1000);

const camera = new THREE.PerspectiveCamera(42, 640 / 360, 0.1, 3000);

// sky dome
{
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x2f78c8) },
      horizonColor: { value: horizonColor.clone() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(horizonColor, topColor, pow(h, 0.55));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), skyMat);
  sky.name = 'sky';
  scene.add(sky);
}

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xbfd8f0, 0x4a5a48, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff0d8, 3.0);
sun.position.set(18, 26, 12);
sun.target.position.set(0, 6, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -17;
sun.shadow.camera.right = 17;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -12;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

const fill = new THREE.DirectionalLight(0x9db8ff, 0.7);
fill.position.set(-16, 8, -12);
scene.add(fill);

interface Animated {
  beamPivot?: THREE.Group;
  lampLight?: THREE.PointLight;
  lampMat?: THREE.MeshStandardMaterial;
}
const animated: Animated = {};

// ---------- world root ----------
const world = new THREE.Group();
scene.add(world);

function add<T extends THREE.Object3D>(parent: THREE.Object3D, obj: T): T {
  parent.add(obj);
  return obj;
}
function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material | THREE.Material[],
  name: string,
  cast = true,
  receive = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// ---------- sea ----------
const seaMat = std(0x1f5f86, { roughness: 0.25, metalness: 0.1 });
const sea = mesh(new THREE.CircleGeometry(1500, 64), seaMat, 'sea', false, true);
sea.rotation.x = -Math.PI / 2;
add(world, sea);

// ---------- island (ground patch) ----------
const ISLAND_C = new THREE.Vector3(2.4, 0, 1.4);
const GROUND_Y = 0.6;
{
  const geo = new THREE.CylinderGeometry(6.6, 8.0, 2.0, 40, 3);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const y = p.getY(i);
    const r = Math.hypot(x, z);
    if (r > 0.01) {
      const k = 1 + pnoise(x * 0.6, 0, z * 0.6) * 0.22;
      p.setX(i, x * k);
      p.setZ(i, z * k);
    }
    if (y > 0.5) p.setY(i, y + pnoise(x * 0.8, 1, z * 0.8) * 0.12);
  }
  geo.computeVertexNormals();
  const island = mesh(geo, [std(0x6b6258, { flatShading: true }), std(0x5f8a46, { roughness: 0.95 }), std(0x4a443d)], 'island');
  island.position.set(ISLAND_C.x, GROUND_Y - 1.0, ISLAND_C.z);
  add(world, island);

  // foam ring
  const foam = mesh(
    new THREE.RingGeometry(7.4, 10.0, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }),
    'foam',
    false,
    false,
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(ISLAND_C.x, 0.03, ISLAND_C.z);
  add(world, foam);
}

// ---------- rocks ----------
function makeRock(radius: number, color: number, seed: number): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + pnoise(x * 1.3 + seed, y * 1.3, z * 1.3 - seed) * 0.55;
    p.setXYZ(i, x * k, y * k * 0.75, z * k);
  }
  geo.computeVertexNormals();
  return mesh(geo, std(color, { flatShading: true, roughness: 0.9 }), 'rock');
}

const rockColors = [0x5d5851, 0x6f685f, 0x4f4b46, 0x7a7266, 0x57534d];
const rockSpecs: Array<[number, number, number]> = []; // x, z, radius
// ring of rocks around the island edge and base
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2 + rand() * 0.4;
  const d = 6.6 + rand() * 1.4;
  rockSpecs.push([ISLAND_C.x + Math.cos(a) * d, ISLAND_C.z + Math.sin(a) * d, 0.8 + rand() * 1.1]);
}
// rocks hugging the tower foot
rockSpecs.push([-2.6, -1.4, 1.0], [-1.2, -2.8, 1.2], [-2.9, 1.2, 0.8], [1.2, -3.0, 0.9], [-0.3, 2.9, 0.7]);
let rockIdx = 0;
for (const [x, z, r] of rockSpecs) {
  const rock = makeRock(r, rockColors[rockIdx % rockColors.length], rockIdx * 3.1);
  const onIsland = Math.hypot(x - ISLAND_C.x, z - ISLAND_C.z) < 6.8;
  rock.position.set(x, onIsland ? GROUND_Y + r * 0.2 : r * 0.25, z);
  rock.rotation.y = rand() * Math.PI * 2;
  add(world, rock);
  rockIdx++;
}

// ---------- tower ----------
const TOWER_Y0 = 0.6;
const TOWER_Y1 = 12.8;
const R_BOT = 2.1;
const R_TOP = 1.3;
function towerR(y: number): number {
  return R_BOT + ((y - TOWER_Y0) / (TOWER_Y1 - TOWER_Y0)) * (R_TOP - R_BOT);
}

const tower = new THREE.Group();
tower.name = 'lighthouse';
add(world, tower);

// plinth step
{
  const plinth = mesh(new THREE.CylinderGeometry(2.55, 2.75, 0.5, 40), std(0x8d8a84), 'plinth');
  plinth.position.y = GROUND_Y + 0.15;
  add(tower, plinth);
}

const BAND_COUNT = 6;
const bandH = (TOWER_Y1 - TOWER_Y0) / BAND_COUNT;
const bandMats = [std(0xc8281e, { roughness: 0.55 }), std(0xf4f1ea, { roughness: 0.55 })];
for (let i = 0; i < BAND_COUNT; i++) {
  const y0 = TOWER_Y0 + i * bandH;
  const y1 = y0 + bandH;
  const band = mesh(new THREE.CylinderGeometry(towerR(y1), towerR(y0), bandH, 48, 1), bandMats[i % 2], `band${i}`);
  band.position.y = (y0 + y1) / 2;
  add(tower, band);
}

// door
const doorAngle = 0.7;
function placeOnTower(obj: THREE.Object3D, y: number, angle: number, out: number): void {
  const r = towerR(y) + out;
  obj.position.set(Math.sin(angle) * r, y, Math.cos(angle) * r);
  obj.rotation.order = 'YXZ';
  obj.rotation.y = angle;
  obj.rotation.x = -Math.atan2(R_BOT - R_TOP, TOWER_Y1 - TOWER_Y0);
}
{
  const frame = mesh(new THREE.BoxGeometry(1.35, 2.0, 0.3), std(0x3b3a38), 'door-frame');
  placeOnTower(frame, 1.75, doorAngle, 0.0);
  add(tower, frame);
  const door = mesh(new THREE.BoxGeometry(1.0, 1.7, 0.3), std(0x5a3418, { roughness: 0.6 }), 'door');
  placeOnTower(door, 1.65, doorAngle, 0.05);
  add(tower, door);
  const arch = mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.3, 20, 1, false, 0, Math.PI),
    std(0x5a3418, { roughness: 0.6 }),
    'door-arch',
  );
  // half cylinder: axis along z, flat side down
  arch.geometry.rotateX(Math.PI / 2);
  arch.geometry.rotateZ(Math.PI / 2);
  placeOnTower(arch, 2.5, doorAngle, 0.05);
  add(tower, arch);
  const knob = mesh(new THREE.SphereGeometry(0.06, 10, 8), std(0xd4a53a, { metalness: 0.8, roughness: 0.3 }), 'door-knob');
  placeOnTower(knob, 1.6, doorAngle + 0.13, 0.22);
  add(tower, knob);
}

// windows (spiral)
const windowYs = [3.6, 5.5, 7.4, 9.3, 11.1];
windowYs.forEach((y, i) => {
  const a = doorAngle + 1.15 * (i + 1);
  const frame = mesh(new THREE.BoxGeometry(0.62, 0.95, 0.24), std(0x2f2f33), `window-frame${i}`);
  placeOnTower(frame, y, a, 0.0);
  add(tower, frame);
  const glass = mesh(
    new THREE.BoxGeometry(0.4, 0.72, 0.26),
    std(0x1b2a3c, { roughness: 0.1, metalness: 0.3, emissive: 0x1a2a40, emissiveIntensity: 0.6 }),
    `window${i}`,
    false,
  );
  placeOnTower(glass, y, a, 0.01);
  add(tower, glass);
});

// gallery support, floor and railing
const darkMetal = std(0x26282b, { roughness: 0.5, metalness: 0.5 });
{
  const corbel = mesh(new THREE.CylinderGeometry(2.05, R_TOP, 0.35, 40), std(0x35373a), 'gallery-corbel');
  corbel.position.y = TOWER_Y1 + 0.175;
  add(tower, corbel);
  const floor = mesh(new THREE.CylinderGeometry(2.15, 2.15, 0.15, 48), std(0x35373a), 'gallery-floor');
  floor.position.y = TOWER_Y1 + 0.425;
  add(tower, floor);

  const floorTop = TOWER_Y1 + 0.5;
  const postCount = 24;
  const railR = 2.05;
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6), darkMetal, postCount);
  posts.name = 'railing-posts';
  posts.castShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < postCount; i++) {
    const a = (i / postCount) * Math.PI * 2;
    dummy.position.set(Math.cos(a) * railR, floorTop + 0.5, Math.sin(a) * railR);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
  }
  add(tower, posts);
  for (const [h, name] of [[1.0, 'rail-top'], [0.5, 'rail-mid']] as Array<[number, string]>) {
    const rail = mesh(new THREE.TorusGeometry(railR, h > 0.9 ? 0.05 : 0.03, 8, 64), darkMetal, name);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = floorTop + h;
    add(tower, rail);
  }

  // lantern room
  const lanternR = 0.98;
  const lanternH = 1.8;
  const lanternBaseY = floorTop;
  const ledge = mesh(new THREE.CylinderGeometry(1.15, 1.2, 0.3, 32), std(0xe8e4dc), 'lantern-ledge');
  ledge.position.y = lanternBaseY + 0.15;
  add(tower, ledge);

  const glassY = lanternBaseY + 0.3 + lanternH / 2;
  const glass = mesh(
    new THREE.CylinderGeometry(lanternR, lanternR, lanternH, 32, 1, true),
    new THREE.MeshPhysicalMaterial({
      color: 0xbfe6ff,
      transparent: true,
      opacity: 0.28,
      roughness: 0.05,
      metalness: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    'lantern-glass',
    false,
    false,
  );
  glass.position.y = glassY;
  add(tower, glass);

  const mullions = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, lanternH, 0.06), darkMetal, 8);
  mullions.name = 'lantern-mullions';
  mullions.castShadow = true;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    dummy.position.set(Math.cos(a) * lanternR, glassY, Math.sin(a) * lanternR);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mullions.setMatrixAt(i, dummy.matrix);
  }
  add(tower, mullions);

  // lamp: pedestal, emissive bulb
  const pedestal = mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.5, 16), darkMetal, 'lamp-pedestal');
  pedestal.position.y = lanternBaseY + 0.55;
  add(tower, pedestal);
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff2b0,
    emissive: 0xffd860,
    emissiveIntensity: 3.0,
    roughness: 0.3,
  });
  const lamp = mesh(new THREE.SphereGeometry(0.34, 24, 16), lampMat, 'lamp', false, false);
  lamp.position.y = glassY + 0.2;
  add(tower, lamp);
  // fresnel lens rings around lamp
  const lens = mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.7, 20, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xffe9a0,
      emissive: 0xffc850,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    'lamp-lens',
    false,
    false,
  );
  lens.position.y = glassY + 0.2;
  add(tower, lens);

  const lampLight = new THREE.PointLight(0xffd070, 25, 18, 2);
  lampLight.position.copy(lamp.position);
  add(tower, lampLight);

  // light beams
  const beamPivot = new THREE.Group();
  beamPivot.position.copy(lamp.position);
  beamPivot.name = 'beam-pivot';
  add(tower, beamPivot);
  const L = 30;
  for (let s = 0; s < 2; s++) {
    const g = new THREE.ConeGeometry(2.6, L, 24, 1, true);
    g.translate(0, -L / 2, 0);
    g.rotateZ(Math.PI / 2);
    const beam = mesh(
      g,
      new THREE.MeshBasicMaterial({
        color: 0xffe9a8,
        transparent: true,
        opacity: 0.13,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
      `beam${s}`,
      false,
      false,
    );
    beam.rotation.y = s * Math.PI;
    add(beamPivot, beam);
  }
  animated.beamPivot = beamPivot;
  animated.lampLight = lampLight;
  animated.lampMat = lampMat;

  // roof
  const roofBaseY = lanternBaseY + 0.3 + lanternH;
  const roofRing = mesh(new THREE.CylinderGeometry(1.2, 1.15, 0.2, 32), std(0x2d2f33), 'roof-ring');
  roofRing.position.y = roofBaseY + 0.1;
  add(tower, roofRing);
  const roof = mesh(new THREE.ConeGeometry(1.3, 1.3, 32), std(0x8f1d17, { roughness: 0.45, metalness: 0.2 }), 'roof');
  roof.position.y = roofBaseY + 0.2 + 0.65;
  add(tower, roof);
  const finialBall = mesh(new THREE.SphereGeometry(0.15, 16, 12), std(0xd4a53a, { metalness: 0.8, roughness: 0.3 }), 'finial-ball');
  finialBall.position.y = roofBaseY + 0.2 + 1.3 + 0.08;
  add(tower, finialBall);
  const spike = mesh(new THREE.ConeGeometry(0.05, 0.5, 8), std(0xd4a53a, { metalness: 0.8, roughness: 0.3 }), 'finial-spike');
  spike.position.y = roofBaseY + 0.2 + 1.3 + 0.4;
  add(tower, spike);
}

// ---------- keeper's cottage ----------
{
  const cottage = new THREE.Group();
  cottage.name = 'cottage';
  const cx = 5.6;
  const cz = 3.4;
  cottage.position.set(cx, GROUND_Y, cz);
  cottage.rotation.y = Math.atan2(-cx, -cz) + 0.0; // local +z faces the tower
  add(world, cottage);

  const W = 2.8;
  const H = 1.5;
  const D = 2.0;
  const walls = mesh(new THREE.BoxGeometry(W, H, D), std(0xeee3cc, { roughness: 0.85 }), 'cottage-walls');
  walls.position.y = H / 2;
  add(cottage, walls);

  const rr = 1.75;
  const roofGeo = new THREE.CylinderGeometry(rr, rr, W + 0.5, 3);
  roofGeo.rotateX(-Math.PI / 2); // triangular prism along z, apex up
  roofGeo.rotateY(Math.PI / 2); // ridge along x
  roofGeo.scale(1, 0.5, (D + 0.6) / (rr * Math.sqrt(3)));
  const roofTri = mesh(roofGeo, std(0x7a3a2a, { roughness: 0.8 }), 'cottage-roof');
  roofTri.position.y = H + rr * 0.5 * 0.5;
  add(cottage, roofTri);

  const chimney = mesh(new THREE.BoxGeometry(0.35, 0.9, 0.35), std(0x8a5a48), 'chimney');
  chimney.position.set(0.8, H + 0.75, -0.2);
  add(cottage, chimney);

  const door = mesh(new THREE.BoxGeometry(0.55, 1.05, 0.08), std(0x4a2d16), 'cottage-door');
  door.position.set(0, 0.525, D / 2 + 0.02);
  add(cottage, door);
  const step = mesh(new THREE.BoxGeometry(0.8, 0.12, 0.35), std(0x8d8a84), 'cottage-step');
  step.position.set(0, 0.06, D / 2 + 0.15);
  add(cottage, step);

  for (const sx of [-0.85, 0.85]) {
    const wf = mesh(new THREE.BoxGeometry(0.55, 0.5, 0.06), std(0xffffff), 'cottage-window-frame');
    wf.position.set(sx, 0.85, D / 2 + 0.02);
    add(cottage, wf);
    const wg = mesh(
      new THREE.BoxGeometry(0.4, 0.36, 0.08),
      std(0x1b2a3c, { roughness: 0.1, metalness: 0.3, emissive: 0x1a2a40, emissiveIntensity: 0.6 }),
      'cottage-window',
      false,
    );
    wg.position.set(sx, 0.85, D / 2 + 0.04);
    add(cottage, wg);
  }

  // stone path to the lighthouse door
  const path = mesh(new THREE.BoxGeometry(0.9, 0.05, 4.2), std(0xa59f92), 'path', false);
  const doorPos = new THREE.Vector3(Math.sin(doorAngle) * 2.9, GROUND_Y + 0.03, Math.cos(doorAngle) * 2.9);
  const cottageDoor = new THREE.Vector3(cx, GROUND_Y + 0.03, cz).add(
    new THREE.Vector3(0, 0, 1.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), cottage.rotation.y),
  );
  path.position.copy(doorPos).add(cottageDoor).multiplyScalar(0.5);
  const dir = cottageDoor.clone().sub(doorPos);
  path.scale.z = dir.length() / 4.2;
  path.rotation.y = Math.atan2(dir.x, dir.z);
  add(world, path);
}

// ---------- animation ----------
let partCount = 0;
world.traverse((o) => {
  if ((o as THREE.Mesh).isMesh) partCount++;
});

const clock = new THREE.Clock();
let firstFrame = true;
const TARGET = new THREE.Vector3(0.8, 8.3, 0.5);
const ORBIT_R = 33;
const ORBIT_H = 9.5;

function frame(): void {
  const t = clock.getElapsedTime();
  const ang = 0.6 + t * 0.12;
  camera.position.set(TARGET.x + Math.sin(ang) * ORBIT_R, ORBIT_H, TARGET.z + Math.cos(ang) * ORBIT_R);
  camera.lookAt(TARGET);

  if (animated.beamPivot) animated.beamPivot.rotation.y = t * 0.9;
  if (animated.lampLight) animated.lampLight.intensity = 25 + Math.sin(t * 7) * 1.5;
  if (animated.lampMat) animated.lampMat.emissiveIntensity = 3 + Math.sin(t * 5) * 0.3;
  // gentle swell
  sea.position.y = Math.sin(t * 0.8) * 0.04;

  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    window.__EVAL_READY__ = true;
    window.__TASK_STATE__ = { ready: true, partCount, bandCount: BAND_COUNT };
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
