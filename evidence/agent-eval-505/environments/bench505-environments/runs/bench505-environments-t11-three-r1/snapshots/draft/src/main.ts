import * as THREE from 'three';
import { createSky, SUN_DIR } from './sky';
import { Island, type IslandSpec } from './islands';
import { Clouds } from './clouds';
import { Waterfall } from './waterfall';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const W = canvas.width;
const H = canvas.height;
const FOV = 48;
const LOOP_SECONDS = 50;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#c2b0e0', 35, 260);

const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.5, 1800);

const sky = createSky();
scene.add(sky);

// Lighting: low warm sun from behind the islands, plus pink fill and a sky/ground hemisphere.
const sun = new THREE.DirectionalLight('#ffa860', 3.2);
sun.position.copy(SUN_DIR).multiplyScalar(100);
scene.add(sun);
const fill = new THREE.DirectionalLight('#ff9cc0', 1.5);
fill.position.set(30, 40, 80);
scene.add(fill);
scene.add(new THREE.HemisphereLight('#ffc4a8', '#8a6a9c', 2.2));

const specs: IslandSpec[] = [
  { x: 0, y: 0, z: -15, radius: 13, seed: 1, speed: 0.45, phase: 0.0, amp: 0.9, trees: 8, crystals: 3 },
  { x: -27, y: 6, z: -5, radius: 6, seed: 2, speed: 0.7, phase: 1.7, amp: 0.8, trees: 3, crystals: 2 },
  { x: 25, y: -4, z: 0, radius: 7, seed: 3, speed: 0.55, phase: 3.1, amp: 0.9, trees: 4, crystals: 2 },
  { x: -46, y: 13, z: -45, radius: 9, seed: 4, speed: 0.38, phase: 4.4, amp: 1.0, trees: 5, crystals: 2 },
  { x: 40, y: 11, z: -42, radius: 8, seed: 5, speed: 0.62, phase: 2.2, amp: 0.9, trees: 4, crystals: 2 },
  { x: 8, y: 17, z: -72, radius: 10, seed: 6, speed: 0.33, phase: 5.5, amp: 1.2, trees: 5, crystals: 3 },
  { x: -18, y: -8, z: -92, radius: 12, seed: 7, speed: 0.4, phase: 0.9, amp: 1.2, trees: 6, crystals: 2 },
  { x: 14, y: 11, z: 20, radius: 3, seed: 8, speed: 0.85, phase: 2.9, amp: 0.6, trees: 1, crystals: 1 },
  { x: 62, y: 2, z: -85, radius: 10, seed: 9, speed: 0.5, phase: 3.8, amp: 1.1, trees: 5, crystals: 2 },
];

const islands = specs.map((s) => new Island(s));
for (const i of islands) scene.add(i.group);

// Waterfall from the largest island (index 0), falling from its rim facing the camera.
const main = islands[0];
const fallAngle = 0.4;
const rim = main.rimPoint(fallAngle).multiplyScalar(1.03);
rim.y = 0.3;
const waterfall = new Waterfall(rim, fallAngle, H, FOV);
main.group.add(waterfall.group);

const clouds = new Clouds();
scene.add(clouds.group);

const center = new THREE.Vector3(0, 0, -20);
const target = new THREE.Vector3();
let last = performance.now() / 1000;
const start = last;
let ready = false;

function frame(): void {
  const now = performance.now() / 1000;
  const dt = Math.min(0.1, now - last);
  last = now;
  const t = now - start;

  const phase = (t / LOOP_SECONDS) * Math.PI * 2;
  const theta = 0.4 * Math.sin(phase);
  const R = 78;
  camera.position.set(
    center.x + Math.sin(theta) * R,
    7 + 3 * Math.sin(phase * 2 + 1),
    center.z + Math.cos(theta) * R,
  );
  target.set(0, 3 + 1.5 * Math.cos(phase), -25);
  camera.lookAt(target);
  sky.position.copy(camera.position);

  for (const i of islands) i.update(t);
  waterfall.update(t);
  clouds.update(dt);

  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
