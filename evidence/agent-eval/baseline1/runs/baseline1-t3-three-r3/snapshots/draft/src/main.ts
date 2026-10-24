import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

declare global {
  interface Window {
    __EVAL__?: { clip: () => string };
    __EVAL_READY__?: boolean;
  }
}

const FADE = 0.4;
const canvas = document.getElementById('app') as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaab4c0);
scene.fog = new THREE.Fog(0xaab4c0, 12, 30);

const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 100);
camera.position.set(0, 1.2, 5);
camera.lookAt(0, 0.9, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.0));

const light = new THREE.DirectionalLight(0xffffff, 2.5);
light.position.set(3, 5, 3);
light.castShadow = true;
light.shadow.mapSize.set(1024, 1024);
light.shadow.camera.left = -3;
light.shadow.camera.right = 3;
light.shadow.camera.top = 3;
light.shadow.camera.bottom = -3;
light.shadow.camera.near = 0.5;
light.shadow.camera.far = 15;
light.shadow.bias = -0.0005;
light.target.position.set(0, 0.9, 0);
scene.add(light, light.target);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x7d8a72, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

let mixer: THREE.AnimationMixer | null = null;
const actions: Record<string, THREE.AnimationAction> = {};
let current: THREE.AnimationAction | null = null;
let currentName = 'Idle';

function fadeTo(name: string): void {
  const next = actions[name];
  if (!next || next === current) return;
  next.reset();
  next.setEffectiveTimeScale(1);
  next.setEffectiveWeight(1);
  next.play();
  if (current) {
    current.crossFadeTo(next, FADE, false);
  } else {
    next.fadeIn(FADE);
  }
  current = next;
  currentName = name;
}

window.__EVAL__ = { clip: () => currentName };

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'r') fadeTo('Run');
  else if (k === 'i') fadeTo('Idle');
});

const clock = new THREE.Clock();
function frame(): void {
  requestAnimationFrame(frame);
  if (mixer) mixer.update(Math.min(clock.getDelta(), 0.1));
  renderer.render(scene, camera);
  if (mixer && !window.__EVAL_READY__) window.__EVAL_READY__ = true;
}

new GLTFLoader().load(
  '/assets/soldier.glb',
  (gltf) => {
    const model = gltf.scene;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = false;
        m.frustumCulled = false;
      }
    });

    // Normalize size: ~1.8 tall, centered on origin, feet on ground.
    const group = new THREE.Group();
    group.add(model);
    scene.add(group);
    group.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const s = size.y > 0 ? 1.8 / size.y : 1;
    model.scale.multiplyScalar(s);
    group.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;

    mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      actions[clip.name] = mixer.clipAction(clip);
    }
    const idle = actions['Idle'];
    if (idle) {
      idle.play();
      current = idle;
      currentName = 'Idle';
    }
    clock.getDelta();
  },
  undefined,
  (err) => console.error('Failed to load model', err),
);

requestAnimationFrame(frame);
