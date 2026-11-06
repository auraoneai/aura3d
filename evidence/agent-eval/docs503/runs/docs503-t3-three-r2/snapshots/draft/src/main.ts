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
scene.background = new THREE.Color(0x9fb4c7);

const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 100);

scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.0));

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
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
  new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.9 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

let mixer: THREE.AnimationMixer | null = null;
const actions = new Map<string, THREE.AnimationAction>();
let currentName = '';
let current: THREE.AnimationAction | null = null;

function findName(clips: THREE.AnimationClip[], wanted: string): string | undefined {
  return clips.find((c) => c.name.toLowerCase() === wanted.toLowerCase())?.name;
}

function fadeTo(name: string, duration = 0.4): void {
  const next = actions.get(name);
  if (!next || next === current) return;
  next.reset();
  next.setEffectiveTimeScale(1);
  next.setEffectiveWeight(1);
  next.play();
  if (current) next.crossFadeFrom(current, duration, false);
  current = next;
  currentName = name;
}

window.__EVAL__ = { clip: () => currentName };

const clock = new THREE.Clock();
let ready = false;

function frame(): void {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (mixer) mixer.update(dt);
  renderer.render(scene, camera);
  if (mixer && !ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
}

new GLTFLoader().load('/assets/soldier.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false;
    }
  });

  // Normalize to ~1.8 units tall, feet on y = 0, centered on x/z.
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
  scene.add(model);

  const h = 1.8;
  const dist = (h * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.5;
  camera.position.set(0, h * 0.55, dist);
  camera.lookAt(0, h * 0.5, 0);

  mixer = new THREE.AnimationMixer(model);
  for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
  const idle = findName(gltf.animations, 'Idle');
  const run = findName(gltf.animations, 'Run');
  if (idle) fadeTo(idle, 0);

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'r' && run) fadeTo(run, 0.4);
    else if (k === 'i' && idle) fadeTo(idle, 0.4);
  });
});

requestAnimationFrame(frame);
