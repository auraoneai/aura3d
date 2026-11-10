import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { makeBrushed, makeContactShadows, makeWeave } from './textures';

type SphereName = 'glass' | 'metal' | 'fabric';

declare global {
  interface Window {
    __TASK_STATE__?: {
      spheres: { name: string }[];
      keyLightX: number;
      selected: SphereName | null;
    };
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

RectAreaLightUniformsLib.init();

const scene = new THREE.Scene();
const WALL = new THREE.Color(0xc9c9c9);
scene.background = WALL;

// ---------- Environment (studio with softboxes), generated in code ----------
function buildEnvironment(): THREE.Texture {
  const env = new THREE.Scene();
  const wallMat = (c: number) => new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(26, 20, 26), [
    wallMat(0x2a2c30),
    wallMat(0x2a2c30),
    wallMat(0x3a3c40),
    wallMat(0x8a8a8a),
    wallMat(0x45474b),
    wallMat(0x2a2c30),
  ]);
  room.position.set(0, 9, 0);
  env.add(room);

  const panel = (w: number, h: number, intensity: number, pos: [number, number, number], tint = 0xffffff) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(intensity), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.set(...pos);
    mesh.lookAt(0, 1, 0);
    env.add(mesh);
  };
  panel(9, 9, 5, [0, 8.5, 1]); // overhead
  panel(5, 7, 4, [-9, 4, 6], 0xeef4ff); // left-front softbox
  panel(1.6, 8, 5, [9.5, 3.5, 2]); // right strip
  panel(14, 1.4, 4, [0, 4.5, -10]); // back strip
  panel(14, 5, 0.9, [0, 3, 11]); // dim front card
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return tex;
}
const envMap = buildEnvironment();

// ---------- Seamless cyclorama floor ----------
function buildCyc(material: THREE.Material): THREE.Mesh {
  const prof: [number, number][] = [[12, 0], [4, 0], [-3, 0]];
  const R = 3;
  const steps = 28;
  for (let i = 1; i <= steps; i++) {
    const th = (i / steps) * Math.PI * 0.5;
    prof.push([-3 - R * Math.sin(th), R - R * Math.cos(th)]);
  }
  prof.push([-6, 8], [-6, 16]);
  const X = 22;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  prof.forEach(([z, y]) => {
    for (const x of [-X, X]) {
      pos.push(x, y, z);
      uv.push((x + 8) / 16, (10 - z) / 18);
    }
  });
  for (let i = 0; i < prof.length - 1; i++) {
    const a0 = i * 2, a1 = a0 + 1, b0 = a0 + 2, b1 = a0 + 3;
    idx.push(a0, a1, b0, a1, b1, b0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.receiveShadow = true;
  return mesh;
}

const SPACING = 2.7;
const contact = makeContactShadows([
  { x: -SPACING, strength: 0.45 },
  { x: 0, strength: 0.9 },
  { x: SPACING, strength: 1.0 },
]);
const floorMat = new THREE.MeshStandardMaterial({
  color: 0xdedede,
  map: contact,
  roughness: 0.85,
  metalness: 0,
  envMap,
  envMapIntensity: 0.45,
});
scene.add(buildCyc(floorMat));

// ---------- Spheres ----------
const sphereGeo = new THREE.SphereGeometry(1, 128, 96);

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0,
  roughness: 0.02,
  transmission: 1,
  thickness: 1.8,
  ior: 1.5,
  attenuationColor: new THREE.Color(0xbfe8e0),
  attenuationDistance: 5,
  specularIntensity: 1,
  envMap,
  envMapIntensity: 1.6,
});
const glass = new THREE.Mesh(sphereGeo, glassMat);
glass.position.set(-SPACING, 1, 0);

const brushed = makeBrushed();
const metalMat = new THREE.MeshPhysicalMaterial({
  color: 0xd4d7dc,
  metalness: 1,
  roughness: 0.42,
  roughnessMap: brushed,
  bumpMap: brushed,
  bumpScale: 0.6,
  anisotropy: 0.85,
  anisotropyRotation: Math.PI / 2,
  envMap,
  envMapIntensity: 1.2,
});
const metal = new THREE.Mesh(sphereGeo, metalMat);
metal.position.set(0, 1, 0);

const weave = makeWeave();
const fabricMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  map: weave.color,
  bumpMap: weave.bump,
  bumpScale: 3,
  roughness: 1,
  metalness: 0,
  sheen: 1,
  sheenColor: new THREE.Color(0xff6a78),
  sheenRoughness: 0.35,
  envMap,
  envMapIntensity: 0.35,
});
const fabric = new THREE.Mesh(sphereGeo, fabricMat);
fabric.position.set(SPACING, 1, 0);

metal.castShadow = true;
fabric.castShadow = true;
glass.castShadow = false;
scene.add(glass, metal, fabric);

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 0.35));

const keyRect = new THREE.RectAreaLight(0xfff3e6, 6, 5, 4);
scene.add(keyRect);

const keySpot = new THREE.SpotLight(0xfff3e6, 90, 0, 0.5, 0.9, 2);
keySpot.castShadow = true;
keySpot.shadow.mapSize.set(2048, 2048);
keySpot.shadow.camera.near = 3;
keySpot.shadow.camera.far = 22;
keySpot.shadow.bias = -0.0004;
keySpot.shadow.normalBias = 0.02;
keySpot.shadow.radius = 5;
keySpot.target.position.set(0, 0.5, 0);
scene.add(keySpot, keySpot.target);

const fill = new THREE.RectAreaLight(0xdde8ff, 2.2, 4, 4);
fill.position.set(-6.5, 3, 3.5);
fill.lookAt(0, 1, 0);
scene.add(fill);

for (const sx of [-1, 1]) {
  const rim = new THREE.SpotLight(0xf2f6ff, 140, 0, 0.55, 1, 2);
  rim.position.set(sx * 3.8, 4, -4.2);
  rim.target.position.set(sx * 0.8, 1, 0);
  scene.add(rim, rim.target);
}

// ---------- Camera ----------
const camera = new THREE.PerspectiveCamera(32, 640 / 360, 0.1, 100);
camera.position.set(0, 3.1, 9.6);
camera.lookAt(0, 0.85, 0);

// ---------- State & loop ----------
const state: {
  spheres: { name: string }[];
  keyLightX: number;
  selected: SphereName | null;
} = {
  spheres: [{ name: 'glass' }, { name: 'metal' }, { name: 'fabric' }],
  keyLightX: 0,
  selected: null,
};
window.__TASK_STATE__ = state;

const meshes: Record<SphereName, THREE.Mesh> = { glass, metal, fabric };
const keyMap: Record<string, SphereName> = { '1': 'glass', '2': 'metal', '3': 'fabric' };
window.addEventListener('keydown', (e: KeyboardEvent) => {
  const name = keyMap[e.key];
  if (name) state.selected = name;
});

const SPIN_SPEED = 0.6; // rad/s
const t0 = performance.now();
let last = t0;
function frame(): void {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.selected) meshes[state.selected].rotation.y += SPIN_SPEED * dt;
  const t = (now - t0) / 1000;
  const kx = 3.5 * Math.sin(t * 0.45);
  state.keyLightX = kx;
  keyRect.position.set(kx, 5.5, 4.5);
  keyRect.lookAt(0, 1, 0);
  keySpot.position.set(kx, 7, 5.5);
  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
