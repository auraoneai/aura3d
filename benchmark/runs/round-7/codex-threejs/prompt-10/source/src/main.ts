import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app mount element.');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f1eb);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(4.2, 2.7, 5.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.65, 0);
controls.minDistance = 2.8;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI * 0.47;
controls.update();

const turntable = new THREE.Group();
scene.add(turntable);

const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(1.62, 1.82, 0.36, 96),
  new THREE.MeshStandardMaterial({
    color: 0xd8d1c7,
    roughness: 0.58,
    metalness: 0.05,
  }),
);
plinth.position.y = 0.18;
plinth.castShadow = true;
plinth.receiveShadow = true;
turntable.add(plinth);

const bevelRing = new THREE.Mesh(
  new THREE.TorusGeometry(1.62, 0.022, 12, 96),
  new THREE.MeshStandardMaterial({ color: 0xf4eee5, roughness: 0.48 }),
);
bevelRing.position.y = 0.37;
bevelRing.rotation.x = Math.PI / 2;
turntable.add(bevelRing);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(8, 128),
  new THREE.ShadowMaterial({ color: 0x6a625b, opacity: 0.18 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0xb5aaa0, 1.6);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 3.8);
keyLight.position.set(3.4, 5.2, 3.1);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 12;
keyLight.shadow.camera.left = -4;
keyLight.shadow.camera.right = 4;
keyLight.shadow.camera.top = 4;
keyLight.shadow.camera.bottom = -4;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xfff0df, 1.45);
fillLight.position.set(-4.5, 2.2, 2.6);
scene.add(fillLight);

const rimLight = new THREE.SpotLight(0xdde9ff, 7.5, 8, Math.PI / 5, 0.45, 1.2);
rimLight.position.set(-2.5, 3.4, -3.7);
scene.add(rimLight);

const loadingLabel = document.createElement('div');
loadingLabel.textContent = 'Loading sneaker';
loadingLabel.style.cssText = [
  'position:fixed',
  'left:24px',
  'bottom:22px',
  'font:600 13px/1.2 system-ui, -apple-system, Segoe UI, sans-serif',
  'letter-spacing:0',
  'color:#342f2a',
  'background:rgba(255,255,255,.72)',
  'border:1px solid rgba(52,47,42,.14)',
  'border-radius:8px',
  'padding:10px 12px',
  'backdrop-filter:blur(12px)',
].join(';');
document.body.appendChild(loadingLabel);

const loader = new GLTFLoader();
loader.load(
  '/benchmark/assets/sneaker.glb',
  (gltf) => {
    const sneaker = gltf.scene;
    const box = new THREE.Box3().setFromObject(sneaker);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    const scale = 2.55 / maxDimension;

    sneaker.position.sub(center);
    sneaker.scale.setScalar(scale);

    const scaledBox = new THREE.Box3().setFromObject(sneaker);
    sneaker.position.y += 0.39 - scaledBox.min.y;

    sneaker.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        if (Array.isArray(child.material)) {
          child.material.forEach((material) => enhanceMaterial(material));
        } else {
          enhanceMaterial(child.material);
        }
      }
    });

    turntable.add(sneaker);
    loadingLabel.remove();
  },
  undefined,
  (error) => {
    loadingLabel.textContent = 'Sneaker failed to load';
    console.error('Failed to load /benchmark/assets/sneaker.glb', error);
  },
);

function enhanceMaterial(material: THREE.Material): void {
  if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
    material.envMapIntensity = 0.9;
    material.needsUpdate = true;
  }
}

function resize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resize);

const clock = new THREE.Clock();

function animate(): void {
  const delta = clock.getDelta();
  turntable.rotation.y += delta * 0.38;
  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
