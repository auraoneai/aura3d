import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const width = 640;
const height = 360;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(width, height, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2b2b2b);

// Image-based lighting from a procedural room (no network assets).
const pmrem = new THREE.PMREMGenerator(renderer);
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTexture;
scene.environmentIntensity = 0.7;

// Key + fill lights
const key = new THREE.DirectionalLight(0xffffff, 2.5);
key.position.set(3, 4, 5);
scene.add(key);
const fill = new THREE.DirectionalLight(0x8fb0ff, 0.8);
fill.position.set(-4, -1, 2);
scene.add(fill);

const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
camera.position.set(2.8, 2.0, 3.6);
camera.lookAt(0, 0, 0);

const material = new THREE.MeshStandardMaterial({
  color: 0xc8a165,
  metalness: 0.9,
  roughness: 0.35,
});
const cube = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), material);
scene.add(cube);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.minDistance = 3;
controls.maxDistance = 12;
controls.update();

const clock = new THREE.Clock();
let first = true;

function frame(): void {
  const dt = clock.getDelta();
  cube.rotation.y += dt * 0.8;
  cube.rotation.x += dt * 0.35;
  controls.update();
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
