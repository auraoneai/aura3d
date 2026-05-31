import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Only allowed asset. Served by Vite from public/benchmark/assets/sneaker.glb.
const SNEAKER_URL = '/benchmark/assets/sneaker.glb';

const app = document.getElementById('app') as HTMLDivElement;

// --- Renderer -------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
renderer.domElement.style.display = 'block';

// --- Scene & camera -------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202327);

const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.01,
  100,
);
camera.position.set(2.4, 1.6, 3.2);

// Studio environment for readable PBR materials.
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex;

// --- Orbit controls -------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1.2;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * 0.495; // keep camera above the plinth
controls.target.set(0, 0.55, 0);
controls.update();

// --- Studio lighting ------------------------------------------------------
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
keyLight.position.set(4, 6, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 30;
keyLight.shadow.camera.left = -4;
keyLight.shadow.camera.right = 4;
keyLight.shadow.camera.top = 4;
keyLight.shadow.camera.bottom = -4;
keyLight.shadow.bias = -0.0002;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xbcd4ff, 1.1);
fillLight.position.set(-5, 3, 2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 2.0);
rimLight.position.set(-2, 4, -5);
scene.add(rimLight);

// --- Plinth (product base) -----------------------------------------------
const PLINTH_HEIGHT = 0.18;
const PLINTH_RADIUS = 1.1;
const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(PLINTH_RADIUS, PLINTH_RADIUS * 1.06, PLINTH_HEIGHT, 64),
  new THREE.MeshStandardMaterial({ color: 0xf2f2f4, roughness: 0.35, metalness: 0.0 }),
);
plinth.position.y = PLINTH_HEIGHT / 2;
plinth.receiveShadow = true;
plinth.castShadow = true;
scene.add(plinth);

// Soft studio floor to ground the shadow.
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(8, 64),
  new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.9, metalness: 0.0 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// --- Turntable + model ----------------------------------------------------
const turntable = new THREE.Group();
turntable.position.y = PLINTH_HEIGHT; // sit the model on top of the plinth
scene.add(turntable);

const TARGET_SIZE = 1.4; // largest model dimension after auto-scaling

const loader = new GLTFLoader();
loader.load(
  SNEAKER_URL,
  (gltf) => {
    const model = gltf.scene;

    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    // Center the model and auto-scale to a consistent size.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = TARGET_SIZE / maxDim;
    model.scale.setScalar(scale);

    // Recenter on X/Z and rest the model's base on the plinth (y = 0 locally).
    model.position.x = -center.x * scale;
    model.position.z = -center.z * scale;
    model.position.y = -box.min.y * scale;

    turntable.add(model);

    // Frame the camera/target around the scaled model.
    const modelHeight = size.y * scale;
    controls.target.set(0, PLINTH_HEIGHT + modelHeight * 0.5, 0);
    controls.update();
  },
  undefined,
  (err) => {
    console.error('Failed to load sneaker.glb', err);
  },
);

// --- Resize ---------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Render loop (turntable rotation) ------------------------------------
const clock = new THREE.Clock();
const TURNTABLE_SPEED = 0.35; // radians / second

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  turntable.rotation.y += TURNTABLE_SPEED * dt;
  controls.update();
  renderer.render(scene, camera);
});
