import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

declare global {
  interface Window {
    __EVAL__?: { clip: () => string };
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb4c8);

const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 100);

scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.8));

const light = new THREE.DirectionalLight(0xffffff, 2.5);
light.position.set(3, 5, 4);
light.castShadow = true;
light.shadow.mapSize.set(2048, 2048);
light.shadow.camera.left = -3;
light.shadow.camera.right = 3;
light.shadow.camera.top = 3;
light.shadow.camera.bottom = -3;
light.shadow.camera.near = 0.5;
light.shadow.camera.far = 15;
light.shadow.bias = -0.0005;
light.shadow.normalBias = 0.02;
scene.add(light);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x7a8a6a, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

let mixer: THREE.AnimationMixer | null = null;
const actions: Record<string, THREE.AnimationAction> = {};
let current = 'Idle';
let current_action: THREE.AnimationAction | null = null;

function play(name: string, duration: number): void {
  const next = actions[name];
  if (!next || name === current) return;
  const prev = current_action;
  next.enabled = true;
  next.reset();
  next.setEffectiveTimeScale(1);
  next.setEffectiveWeight(1);
  next.play();
  if (prev) prev.crossFadeTo(next, duration, false);
  current = name;
  current_action = next;
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'r') play('Run', 0.4);
  else if (k === 'i') play('Idle', 0.4);
});

window.__EVAL__ = { clip: () => current };

const clock = new THREE.Clock();
let ready = false;

function frame(): void {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (mixer) mixer.update(dt);
  renderer.render(scene, camera);
  if (!ready && mixer) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
}

new GLTFLoader().load('/assets/soldier.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });
  scene.add(model);

  // Normalise height to 1.8 and stand on the ground.
  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  const h = box.max.y - box.min.y;
  if (h > 0) model.scale.multiplyScalar(1.8 / h);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  model.position.x -= c.x;
  model.position.z -= c.z;
  model.position.y -= box.min.y;

  camera.position.set(0, 1.2, 5.2);
  camera.lookAt(0, 0.9, 0);

  mixer = new THREE.AnimationMixer(model);
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  const idle = actions['Idle'];
  if (idle) {
    idle.play();
    current_action = idle;
  }
  current = 'Idle';
});

requestAnimationFrame(frame);
