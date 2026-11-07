import * as THREE from 'three';
import { uTime } from './util';
import { createSeabed, createRocks, createCorals, createPlants } from './reef';
import {
  createSchool,
  createLoners,
  createBubbles,
  createSnow,
  createBeams,
  createBackdrop,
} from './life';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('canvas #app not found');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);

const fogColor = new THREE.Color(0x0c7486);
const scene = new THREE.Scene();
scene.background = fogColor;
scene.fog = new THREE.FogExp2(fogColor, 0.05);

const camera = new THREE.PerspectiveCamera(55, 640 / 360, 0.1, 150);

// Lighting: sun from above, bluish-green ambient.
const sun = new THREE.DirectionalLight(0xdff8ee, 2.0);
sun.position.set(-4, 20, -3);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x8fe6ee, 0x1f6a66, 1.0));

const backdrop = createBackdrop(fogColor);
scene.add(backdrop);

const seabed = createSeabed();
scene.add(seabed);
scene.add(createRocks());
scene.add(createCorals());
scene.add(createPlants());

const school = createSchool(48);
const loners = createLoners();
scene.add(school.mesh);
scene.add(loners.mesh);

const bubbles = createBubbles();
const snow = createSnow();
const beams = createBeams();
scene.add(bubbles.object);
scene.add(snow.object);
scene.add(beams.object);

const target = new THREE.Vector3();
let ready = false;

function frame(ms: number): void {
  const t = ms / 1000;
  uTime.value = t;

  const angle = t * 0.12;
  const radius = 11.5 + 0.8 * Math.sin(t * 0.17);
  camera.position.set(
    Math.cos(angle) * radius,
    3.3 + 0.35 * Math.sin(t * 0.55) + 0.1 * Math.sin(t * 1.3),
    Math.sin(angle) * radius,
  );
  target.set(0, 1.3 + 0.1 * Math.sin(t * 0.55 + 1), 0);
  camera.lookAt(target);
  backdrop.position.copy(camera.position);

  school.update(t);
  loners.update(t);
  bubbles.update(t);
  snow.update(t);
  beams.update(t);

  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
