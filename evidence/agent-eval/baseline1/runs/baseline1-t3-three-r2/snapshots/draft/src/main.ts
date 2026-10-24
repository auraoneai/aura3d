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
scene.background = new THREE.Color(0xa0b4c8);
scene.fog = new THREE.Fog(0xa0b4c8, 15, 40);

scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.0));

const light = new THREE.DirectionalLight(0xffffff, 2.5);
light.position.set(3, 6, 4);
light.castShadow = true;
light.shadow.mapSize.set(2048, 2048);
light.shadow.camera.left = -4;
light.shadow.camera.right = 4;
light.shadow.camera.top = 4;
light.shadow.camera.bottom = -4;
light.shadow.camera.near = 0.5;
light.shadow.camera.far = 20;
light.shadow.bias = -0.0005;
scene.add(light);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x7a8a6a, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 100);
camera.position.set(0, 1.3, 5);
camera.lookAt(0, 0.9, 0);

const clock = new THREE.Clock();
let mixer: THREE.AnimationMixer | null = null;
const actions: Record<string, THREE.AnimationAction> = {};
let current = 'Idle';
let ready = false;

window.__EVAL__ = { clip: () => current };

function findKey(clips: THREE.AnimationClip[], name: string): THREE.AnimationClip | undefined {
  return (
    clips.find((c) => c.name === name) ??
    clips.find((c) => c.name.toLowerCase() === name.toLowerCase()) ??
    clips.find((c) => c.name.toLowerCase().includes(name.toLowerCase()))
  );
}

function fadeTo(name: 'Idle' | 'Run'): void {
  const next = actions[name];
  const prev = actions[current];
  if (!next || current === name) return;
  next.enabled = true;
  next.reset();
  next.setEffectiveTimeScale(1);
  next.setEffectiveWeight(1);
  next.play();
  if (prev) prev.crossFadeTo(next, 0.4, false);
  current = name;
}

window.addEventListener('keydown', (e) => {
  if (!ready) return;
  const k = e.key.toLowerCase();
  if (k === 'r') fadeTo('Run');
  else if (k === 'i') fadeTo('Idle');
});

function render(): void {
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);
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
  scene.add(model);

  // Normalize: height ~1.8, feet on ground, centered.
  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = size.y > 0 ? 1.8 / size.y : 1;
  model.scale.multiplyScalar(s);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  model.updateMatrixWorld(true);

  mixer = new THREE.AnimationMixer(model);
  for (const n of ['Idle', 'Walk', 'Run']) {
    const clip = findKey(gltf.animations, n);
    if (clip) actions[n] = mixer.clipAction(clip);
  }
  const idle = actions['Idle'];
  if (idle) {
    idle.play();
  }
  current = 'Idle';
  ready = true;

  render();
  window.__EVAL_READY__ = true;
});

function loop(): void {
  requestAnimationFrame(loop);
  render();
}
requestAnimationFrame(loop);
