import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SNEAKER_URL = 'benchmark/assets/sneaker.glb';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app root element.');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#d9dde2';

app.style.width = '100vw';
app.style.height = '100vh';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9dde2);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(3.2, 2.1, 4.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.82, 0);
controls.minDistance = 2.7;
controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * 0.48;

const turntable = new THREE.Group();
turntable.position.y = 0.42;
scene.add(turntable);

const plinthMaterial = new THREE.MeshStandardMaterial({
  color: 0xf3f4f6,
  roughness: 0.62,
  metalness: 0.03,
});

const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.72, 0.48, 96), plinthMaterial);
plinth.position.y = 0.24;
plinth.receiveShadow = true;
plinth.castShadow = true;
scene.add(plinth);

const plinthRim = new THREE.Mesh(
  new THREE.TorusGeometry(1.63, 0.035, 12, 96),
  new THREE.MeshStandardMaterial({ color: 0xc2cad2, roughness: 0.5, metalness: 0.12 }),
);
plinthRim.position.y = 0.5;
plinthRim.receiveShadow = true;
scene.add(plinthRim);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(8, 128),
  new THREE.MeshStandardMaterial({ color: 0xcfd4da, roughness: 0.8 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
floor.receiveShadow = true;
scene.add(floor);

scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8790, 1.45));

const keyLight = new THREE.DirectionalLight(0xffffff, 3.9);
keyLight.position.set(3.5, 5, 3);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 12;
keyLight.shadow.camera.left = -4;
keyLight.shadow.camera.right = 4;
keyLight.shadow.camera.top = 4;
keyLight.shadow.camera.bottom = -4;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xbfd8ff, 1.7);
fillLight.position.set(-4, 2.4, 2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 2.2);
rimLight.position.set(-2.5, 3.2, -3.6);
scene.add(rimLight);

const loader = new GLTFLoader();
loader.load(
  SNEAKER_URL,
  (gltf) => {
    const sneaker = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(sneaker);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    const targetSize = 2.45;
    const scale = targetSize / maxDimension;

    sneaker.position.sub(center);
    sneaker.scale.setScalar(scale);

    const scaledBounds = new THREE.Box3().setFromObject(sneaker);
    sneaker.position.y += -scaledBounds.min.y + 0.08;

    sneaker.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => {
            material.needsUpdate = true;
          });
        } else {
          child.material.needsUpdate = true;
        }
      }
    });

    turntable.add(sneaker);
    controls.target.set(0, 0.95, 0);
    controls.update();
  },
  undefined,
  (error) => {
    console.error(`Unable to load ${SNEAKER_URL}`, error);
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
  turntable.rotation.y += delta * 0.45;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
