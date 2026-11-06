import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2b2b2b);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.7;

const camera = new THREE.PerspectiveCamera(45, 640 / 360, 0.1, 100);
camera.position.set(2.6, 2.0, 3.4);

const key = new THREE.DirectionalLight(0xffffff, 2.5);
key.position.set(3, 4, 2);
scene.add(key);
const fill = new THREE.DirectionalLight(0x9fb8ff, 0.8);
fill.position.set(-3, 1, -2);
scene.add(fill);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1.5, 1.5, 1.5),
  new THREE.MeshStandardMaterial({ color: 0xc8a060, metalness: 0.9, roughness: 0.4 }),
);
scene.add(cube);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.update();

const clock = new THREE.Clock();
let first = true;

function frame(): void {
  const dt = clock.getDelta();
  cube.rotation.y += dt * 0.6;
  cube.rotation.x += dt * 0.25;
  controls.update();
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
