import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import './style.css';
import sneakerUrl from '../../../../../../assets/sneaker.glb?url';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app mount point');
}

const SNEAKER_URL = sneakerUrl;
const PLINTH_HEIGHT = 0.34;
const TARGET_MODEL_SIZE = 3.35;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f1ea);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(4.4, 2.65, 5.25);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 3.2;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 0.72, 0);

const turntable = new THREE.Group();
turntable.name = 'rotating-turntable';
scene.add(turntable);

const plinthMaterial = new THREE.MeshStandardMaterial({
  color: 0xd8d2c7,
  roughness: 0.58,
  metalness: 0.04,
});
const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.38, PLINTH_HEIGHT, 96), plinthMaterial);
plinth.name = 'product-plinth';
plinth.position.y = PLINTH_HEIGHT * 0.5;
plinth.receiveShadow = true;
plinth.castShadow = true;
turntable.add(plinth);

const bevel = new THREE.Mesh(
  new THREE.TorusGeometry(2.255, 0.035, 16, 128),
  new THREE.MeshStandardMaterial({ color: 0xefe9dd, roughness: 0.5 }),
);
bevel.name = 'plinth-highlight-rim';
bevel.position.y = PLINTH_HEIGHT + 0.012;
bevel.rotation.x = Math.PI * 0.5;
bevel.receiveShadow = true;
turntable.add(bevel);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(9, 128),
  new THREE.ShadowMaterial({ color: 0x2c2924, opacity: 0.16 }),
);
floor.name = 'soft-studio-shadow-floor';
floor.rotation.x = -Math.PI * 0.5;
floor.receiveShadow = true;
scene.add(floor);

const fillDome = new THREE.HemisphereLight(0xffffff, 0xc7b8a7, 1.55);
scene.add(fillDome);

const keyLight = new THREE.DirectionalLight(0xffffff, 4.4);
keyLight.name = 'large-left-studio-key';
keyLight.position.set(-3.6, 5.2, 4.2);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 14;
keyLight.shadow.camera.left = -5;
keyLight.shadow.camera.right = 5;
keyLight.shadow.camera.top = 5;
keyLight.shadow.camera.bottom = -5;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xddeaff, 2.2);
rimLight.name = 'cool-back-rim-light';
rimLight.position.set(3.8, 3.3, -4.3);
scene.add(rimLight);

const frontSoftbox = new THREE.RectAreaLight(0xffffff, 7.5, 4.5, 3);
frontSoftbox.name = 'front-softbox-reflection';
frontSoftbox.position.set(0, 3.8, 4.4);
frontSoftbox.lookAt(0, 0.7, 0);
scene.add(frontSoftbox);

const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(11, 7),
  new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.86 }),
);
backdrop.name = 'warm-studio-backdrop';
backdrop.position.set(0, 2.6, -4.1);
backdrop.receiveShadow = true;
scene.add(backdrop);

const loadingBadge = document.createElement('div');
loadingBadge.className = 'status';
loadingBadge.textContent = 'Loading sneaker...';
app.appendChild(loadingBadge);

const loader = new GLTFLoader();
loader.load(
  SNEAKER_URL,
  (gltf) => {
    const sneaker = gltf.scene;
    sneaker.name = 'provided-sneaker-model';

    sneaker.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if ('envMapIntensity' in material) {
            material.envMapIntensity = 0.85;
          }
        }
      }
    });

    const originalBox = new THREE.Box3().setFromObject(sneaker);
    const originalSize = originalBox.getSize(new THREE.Vector3());
    const largestDimension = Math.max(originalSize.x, originalSize.y, originalSize.z);
    const scale = TARGET_MODEL_SIZE / largestDimension;
    sneaker.scale.setScalar(scale);

    const scaledBox = new THREE.Box3().setFromObject(sneaker);
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
    const scaledSize = scaledBox.getSize(new THREE.Vector3());
    sneaker.position.sub(scaledCenter);
    sneaker.position.y += PLINTH_HEIGHT + scaledSize.y * 0.5 + 0.055;

    turntable.add(sneaker);
    loadingBadge.remove();
  },
  undefined,
  (error) => {
    loadingBadge.classList.add('error');
    loadingBadge.textContent = 'Unable to load benchmark/assets/sneaker.glb';
    console.error(error);
  },
);

const clock = new THREE.Clock();

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resize);

function animate() {
  const delta = clock.getDelta();
  turntable.rotation.y += delta * 0.42;
  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
