import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

declare global {
  interface Window {
    __EVAL__: { clip: () => string };
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
scene.background = new THREE.Color(0x8fa6bd);

const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 100);

scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.9));

const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 6, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -4;
sun.shadow.camera.right = 4;
sun.shadow.camera.top = 4;
sun.shadow.camera.bottom = -4;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 20;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ color: 0x778877, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

let currentClip = 'Idle';
window.__EVAL__ = { clip: () => currentClip };

const clock = new THREE.Clock();
let mixer: THREE.AnimationMixer | null = null;
const actions: Record<string, THREE.AnimationAction> = {};
let active: THREE.AnimationAction | null = null;

function fadeTo(name: string, duration = 0.4): void {
  const next = actions[name];
  if (!next || next === active) return;
  next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
  next.enabled = true;
  next.play();
  if (active) active.crossFadeTo(next, duration, false);
  active = next;
  currentClip = name;
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'r') fadeTo('Run');
  else if (k === 'i') fadeTo('Idle');
});

function frame(): void {
  requestAnimationFrame(frame);
  if (mixer) mixer.update(Math.min(clock.getDelta(), 0.1));
  renderer.render(scene, camera);
}

new GLTFLoader().load('/assets/soldier.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = false;
      m.frustumCulled = false;
    }
  });
  const holder = new THREE.Group();
  holder.add(model);
  scene.add(holder);

  mixer = new THREE.AnimationMixer(model);
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  const idle = actions['Idle'];
  if (idle) {
    idle.play();
    active = idle;
  }
  currentClip = 'Idle';
  mixer.update(0);
  model.updateMatrixWorld(true);

  // Fit: scale to ~1.8 units tall, feet on y=0, centred on x/z.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = size.y > 0 ? 1.8 / size.y : 1;
  holder.scale.setScalar(s);
  holder.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(holder);
  const c = b2.getCenter(new THREE.Vector3());
  holder.position.set(-c.x, -b2.min.y, -c.z);
  holder.updateMatrixWorld(true);

  const h = 1.8;
  camera.position.set(0, h * 0.6, 5.2);
  camera.lookAt(0, h * 0.5, 0);
  sun.target.position.set(0, h * 0.5, 0);
  scene.add(sun.target);

  clock.start();
  renderer.render(scene, camera);
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
  frame();
});
