import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildCart } from './cart';
import { makeDirtTexture, mulberry32 } from './textures';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; wheelCount: number; spokeCount: number; plankCount: number };
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const SKY = 0xe3cfa9;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 14, 34);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.25;

const camera = new THREE.PerspectiveCamera(36, 640 / 360, 0.1, 100);
camera.position.set(4.6, 2.9, 5.0);
camera.lookAt(0, 0.85, -0.35);

// lights
const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x7a5a38, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd7a0, 3.2);
sun.position.set(-4.5, 6.5, 3.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -4.5;
sun.shadow.camera.right = 4.5;
sun.shadow.camera.top = 4.5;
sun.shadow.camera.bottom = -4.5;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 20;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 4;
scene.add(sun);

// ground
function groundHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const t = Math.min(1, Math.max(0, (r - 2.2) / 2.5));
  const k = t * t * (3 - 2 * t);
  const n = Math.sin(x * 0.9 + 1) * Math.cos(z * 0.7) * 0.5 + Math.sin(x * 2.3 + z * 1.7) * 0.2 + Math.sin(z * 3.1 - x * 1.3) * 0.1;
  return n * 0.14 * k;
}

const groundGeo = new THREE.PlaneGeometry(80, 80, 200, 200);
groundGeo.rotateX(-Math.PI / 2);
{
  const pos = groundGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)));
  }
  groundGeo.computeVertexNormals();
}
const ground = new THREE.Mesh(
  groundGeo,
  new THREE.MeshStandardMaterial({ map: makeDirtTexture(), color: 0xffffff, roughness: 1, metalness: 0 }),
);
ground.receiveShadow = true;
scene.add(ground);

// stones
{
  const rnd = mulberry32(555);
  const stoneMat = [0x8a867e, 0x756f68, 0x9a9488].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }),
  );
  const placed: { x: number; z: number; r: number }[] = [];
  let tries = 0;
  while (placed.length < 16 && tries < 500) {
    tries++;
    const ang = rnd() * Math.PI * 2;
    const dist = 1.9 + rnd() * 4.5;
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;
    const size = 0.07 + Math.pow(rnd(), 2) * 0.22;
    // keep clear of the cart and its handles (which swing with the turntable)
    if (Math.hypot(x, z) < 2.3 + size) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + size + 0.1)) continue;
    placed.push({ x, z, r: size });
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const n = 1 + 0.18 * Math.sin(vx * 4.1 + vz * 2.3) + 0.12 * Math.sin(vy * 5.7 + vx * 3.1);
      pos.setXYZ(i, vx * n, vy * n, vz * n);
    }
    geo.computeVertexNormals();
    const stone = new THREE.Mesh(geo, stoneMat[Math.floor(rnd() * stoneMat.length)]);
    stone.scale.set(size * (1 + rnd() * 0.4), size * (0.55 + rnd() * 0.2), size * (1 + rnd() * 0.4));
    stone.rotation.y = rnd() * Math.PI;
    stone.position.set(x, groundHeight(x, z) + size * 0.25, z);
    stone.castShadow = true;
    stone.receiveShadow = true;
    scene.add(stone);
  }
}

// cart
const cart = buildCart();
const turntable = new THREE.Group();
turntable.add(cart.root);
scene.add(turntable);

const clock = new THREE.Clock();
function frame(): void {
  const t = clock.getElapsedTime();
  turntable.rotation.y = 0.25 + Math.sin(t * 0.35) * 0.5;
  for (const s of cart.spinners) s.rotation.z = -t * 0.5;
  renderer.render(scene, camera);
}

let first = true;
function loop(): void {
  requestAnimationFrame(loop);
  frame();
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
    window.__TASK_STATE__ = {
      ready: true,
      wheelCount: cart.wheelCount,
      spokeCount: cart.spokeCount,
      plankCount: cart.plankCount,
    };
  }
}
loop();
