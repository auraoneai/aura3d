import * as THREE from 'three';
import { L, K, SUN, buildTable, buildTerrain } from './terrain';
import { applyBoulderBumps, buildRocks, buildShrubs, placeBoulders } from './scatter';
import { camPos } from './camera';
import { GROUND_FRAG, GROUND_VERT, SKY_FRAG, SKY_VERT } from './shaders';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 640 / 360, 0.1, 2000);

const uniforms = {
  uSun: { value: SUN.clone() },
  uK: { value: K },
  uTime: { value: 0 },
};

// Geometry
const terrTab = buildTable();
const boulders = placeBoulders();
const shadowTab = terrTab.slice();
applyBoulderBumps(shadowTab, boulders);

const terrainMat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: GROUND_VERT,
  fragmentShader: GROUND_FRAG,
  defines: { TERRAIN: '' },
});
const propMat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: GROUND_VERT,
  fragmentShader: GROUND_FRAG,
});

const terrain = new THREE.Mesh(buildTerrain(shadowTab), terrainMat);
terrain.frustumCulled = false;
scene.add(terrain);

const rocks = new THREE.Mesh(buildRocks(boulders, terrTab), propMat);
rocks.frustumCulled = false;
scene.add(rocks);

const shrubs = new THREE.Mesh(buildShrubs(terrTab), propMat);
shrubs.frustumCulled = false;
scene.add(shrubs);

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1000, 32, 16),
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  }),
);
sky.frustumCulled = false;
sky.renderOrder = -1;
scene.add(sky);

const SPEED = 5.5;
const pos = new THREE.Vector3();
const target = new THREE.Vector3();
let first = true;

declare global {
  interface Window {
    __TASK_STATE__?: { flying: boolean; cameraX: number; cameraY: number; cameraZ: number };
  }
}

let flying = true;
let flightT = 0;
let lastNow = -1;

const button = document.createElement('button');
button.id = 'toggle-flight';
button.type = 'button';
button.textContent = 'Pause flythrough';
button.style.cssText = 'display:block;margin:8px 0 0 8px;padding:4px 10px;font:inherit;';
button.addEventListener('click', () => {
  flying = !flying;
  button.textContent = flying ? 'Pause flythrough' : 'Resume flythrough';
});
document.body.appendChild(button);

function frame(now: number): void {
  const t = now / 1000;
  const dt = lastNow < 0 ? 0 : Math.min(0.1, (now - lastNow) / 1000);
  lastNow = now;
  if (flying) flightT += dt;
  const s = (flightT * SPEED) % L;
  uniforms.uTime.value = t;
  camPos(s, 0.04 * Math.sin(flightT * 1.7), pos);
  camera.position.copy(pos);
  camPos(s + 24, 2.3, target);
  camera.lookAt(target);
  camera.rotateZ(0.02 * Math.sin(flightT * 0.35));
  sky.position.copy(pos);
  window.__TASK_STATE__ = {
    flying,
    cameraX: pos.x,
    cameraY: pos.y,
    cameraZ: pos.z,
  };
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
