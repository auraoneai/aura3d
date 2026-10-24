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
scene.background = new THREE.Color(0xa0b8cc);
scene.fog = new THREE.Fog(0xa0b8cc, 10, 30);

const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 100);

scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.2));

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
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x6b7a5a, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

let mixer: THREE.AnimationMixer | null = null;
const actions = new Map<string, THREE.AnimationAction>();
let current: THREE.AnimationAction | null = null;
let currentName = 'Idle';
const FADE = 0.4;

window.__EVAL__ = { clip: () => currentName };

function play(name: string): void {
  const next = actions.get(name);
  if (!next || next === current) return;
  next.reset();
  next.enabled = true;
  next.setEffectiveTimeScale(1);
  next.setEffectiveWeight(1);
  if (current) {
    next.play();
    current.crossFadeTo(next, FADE, false);
  } else {
    next.play();
  }
  current = next;
  currentName = name;
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'r') play('Run');
  else if (k === 'i') play('Idle');
});

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

new GLTFLoader().load(
  '/assets/soldier.glb',
  (gltf) => {
    const model = gltf.scene;
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
        o.frustumCulled = false;
      }
    });
    scene.add(model);
    model.updateMatrixWorld(true);

    // Normalise height to ~1.8 and stand on the ground at the origin.
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
    box = new THREE.Box3().setFromObject(model);

    // Frame the whole character.
    const h = box.max.y - box.min.y;
    const midY = (box.max.y + box.min.y) / 2;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const dist = (h * 0.5) / Math.tan(vFov / 2) / 0.8 + 1;
    camera.position.set(0, midY + 0.2, dist);
    camera.lookAt(0, midY, 0);

    mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      actions.set(clip.name, mixer.clipAction(clip));
    }
    const idle = actions.get('Idle');
    if (idle) {
      idle.play();
      current = idle;
      currentName = 'Idle';
    }
  },
  undefined,
  (err) => console.error('Failed to load model', err),
);

requestAnimationFrame(frame);
