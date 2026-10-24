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
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2b2b2b);

// Environment lighting for metallic reflections (generated locally, no network)
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

const camera = new THREE.PerspectiveCamera(45, 640 / 360, 0.1, 100);
camera.position.set(2.8, 2.0, 3.6);

// Key + fill + rim lights
const key = new THREE.DirectionalLight(0xffffff, 2.5);
key.position.set(3, 4, 5);
scene.add(key);
const fill = new THREE.DirectionalLight(0x99aaff, 0.8);
fill.position.set(-4, 1, 2);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffddaa, 1.0);
rim.position.set(-2, 3, -4);
scene.add(rim);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1.5, 1.5, 1.5),
  new THREE.MeshStandardMaterial({
    color: 0xc8a050,
    metalness: 0.9,
    roughness: 0.4,
  }),
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
  cube.rotation.y += dt * 0.7;
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
