import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app mount element');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#ece7dd';

app.style.width = '100vw';
app.style.height = '100vh';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xece7dd);
scene.fog = new THREE.Fog(0xece7dd, 7, 16);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(3.1, 2.1, 4.4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const environment = new RoomEnvironment(renderer);
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(environment, 0.04).texture;
environment.dispose();
pmremGenerator.dispose();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.4;
controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * 0.47;
controls.target.set(0, 0.62, 0);

const productStage = new THREE.Group();
scene.add(productStage);

const plinthHeight = 0.42;
const plinthRadius = 1.55;
const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(plinthRadius, plinthRadius * 1.06, plinthHeight, 96),
  new THREE.MeshStandardMaterial({
    color: 0xf8f4ec,
    roughness: 0.58,
    metalness: 0.02,
  }),
);
plinth.position.y = plinthHeight * 0.5;
plinth.receiveShadow = true;
plinth.castShadow = true;
productStage.add(plinth);

const bevelRing = new THREE.Mesh(
  new THREE.TorusGeometry(plinthRadius * 1.005, 0.026, 12, 128),
  new THREE.MeshStandardMaterial({
    color: 0xd7d0c3,
    roughness: 0.42,
    metalness: 0.12,
  }),
);
bevelRing.position.y = plinthHeight + 0.018;
bevelRing.rotation.x = Math.PI * 0.5;
productStage.add(bevelRing);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(7.5, 128),
  new THREE.ShadowMaterial({ color: 0x5a5147, opacity: 0.18 }),
);
floor.rotation.x = -Math.PI * 0.5;
floor.position.y = -0.006;
floor.receiveShadow = true;
scene.add(floor);

const keyLight = new THREE.DirectionalLight(0xffffff, 3.3);
keyLight.position.set(3.5, 5, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 14;
keyLight.shadow.camera.left = -4;
keyLight.shadow.camera.right = 4;
keyLight.shadow.camera.top = 4;
keyLight.shadow.camera.bottom = -4;
scene.add(keyLight);

const softBoxLeft = new THREE.RectAreaLight(0xffffff, 4.8, 3.2, 2.3);
softBoxLeft.position.set(-3.4, 3.2, 2.1);
softBoxLeft.lookAt(0, 0.8, 0);
scene.add(softBoxLeft);

const rimLight = new THREE.DirectionalLight(0xdcecff, 1.35);
rimLight.position.set(-2.8, 2.5, -3.2);
scene.add(rimLight);

const fillLight = new THREE.HemisphereLight(0xffffff, 0xb8aa98, 1.25);
scene.add(fillLight);

const loader = new GLTFLoader();
const sneakerGroup = new THREE.Group();
sneakerGroup.position.y = plinthHeight;
productStage.add(sneakerGroup);

const loadingText = document.createElement('div');
loadingText.textContent = 'Loading sneaker...';
loadingText.style.position = 'fixed';
loadingText.style.left = '24px';
loadingText.style.bottom = '22px';
loadingText.style.color = '#4d463c';
loadingText.style.font = '600 14px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
loadingText.style.letterSpacing = '0';
loadingText.style.pointerEvents = 'none';
app.appendChild(loadingText);

loader.load(
  '/benchmark/assets/sneaker.glb',
  (gltf) => {
    const sneaker = gltf.scene;
    sneaker.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if ('envMapIntensity' in material) {
            material.envMapIntensity = 0.9;
          }
        });
      }
    });

    const box = new THREE.Box3().setFromObject(sneaker);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    const targetWidth = 2.45;
    const scale = targetWidth / maxDimension;

    sneaker.position.sub(center);
    sneaker.scale.setScalar(scale);

    const scaledBox = new THREE.Box3().setFromObject(sneaker);
    sneaker.position.y -= scaledBox.min.y;

    sneakerGroup.add(sneaker);
    loadingText.remove();
  },
  undefined,
  (error) => {
    loadingText.textContent = 'Could not load benchmark/assets/sneaker.glb';
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
  productStage.rotation.y += delta * 0.45;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
