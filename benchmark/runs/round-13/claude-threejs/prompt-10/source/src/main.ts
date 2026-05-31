import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// The sneaker model is served from Vite's public/ directory. Its served URL is
// the real on-disk path benchmark/assets/sneaker.glb mapped to the web root.
const SNEAKER_URL = '/benchmark/assets/sneaker.glb';

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const app = document.getElementById('app') as HTMLDivElement;
app.style.margin = '0';
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

// ---------------------------------------------------------------------------
// Scene & camera
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15171c);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(3.2, 2.2, 4.4);

// Studio image-based lighting from a procedural room environment so the
// physically based sneaker material reads cleanly with soft reflections.
const pmrem = new THREE.PMREMGenerator(renderer);
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTexture;

// ---------------------------------------------------------------------------
// Studio lighting (three-point + ambient fill)
// ---------------------------------------------------------------------------
const ambient = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
keyLight.position.set(4, 6, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 30;
keyLight.shadow.camera.left = -6;
keyLight.shadow.camera.right = 6;
keyLight.shadow.camera.top = 6;
keyLight.shadow.camera.bottom = -6;
keyLight.shadow.bias = -0.0001;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xcfe0ff, 1.1);
fillLight.position.set(-5, 3, 2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 1.4);
rimLight.position.set(-2, 4, -6);
scene.add(rimLight);

// ---------------------------------------------------------------------------
// Plinth / product base
// ---------------------------------------------------------------------------
const PLINTH_TOP_Y = 0; // the plinth's top surface sits at y = 0
const PLINTH_HEIGHT = 0.6;
const PLINTH_RADIUS = 1.6;

const turntable = new THREE.Group();
scene.add(turntable);

const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(PLINTH_RADIUS, PLINTH_RADIUS * 1.08, PLINTH_HEIGHT, 64),
  new THREE.MeshStandardMaterial({
    color: 0xf3f4f6,
    roughness: 0.55,
    metalness: 0.05,
  }),
);
plinth.position.y = PLINTH_TOP_Y - PLINTH_HEIGHT / 2;
plinth.castShadow = true;
plinth.receiveShadow = true;
turntable.add(plinth);

// A larger floor disc to catch the contact shadow beneath the plinth.
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(12, 96),
  new THREE.MeshStandardMaterial({ color: 0x1d2027, roughness: 1, metalness: 0 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = PLINTH_TOP_Y - PLINTH_HEIGHT;
floor.receiveShadow = true;
scene.add(floor);

// ---------------------------------------------------------------------------
// Orbit controls
// ---------------------------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.495; // keep the camera above the floor
controls.target.set(0, PLINTH_TOP_Y + 0.55, 0);
controls.update();

// ---------------------------------------------------------------------------
// Load, center and auto-scale the sneaker, then mount it on the turntable
// ---------------------------------------------------------------------------
const TARGET_SIZE = 1.8; // longest model dimension after auto-scaling

const loader = new GLTFLoader();
loader.load(
  SNEAKER_URL,
  (gltf: any) => {
    const model = gltf.scene;

    model.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Auto-scale: fit the longest dimension to TARGET_SIZE.
    let box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    model.scale.setScalar(TARGET_SIZE / maxDim);

    // Recompute the box after scaling, then center horizontally and rest the
    // model's base on the plinth top.
    box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y; // base flush with plinth top (y = 0)
    model.position.y += PLINTH_TOP_Y;

    turntable.add(model);
  },
  undefined,
  (error: unknown) => {
    console.error('Failed to load sneaker.glb', error);
  },
);

// ---------------------------------------------------------------------------
// Resize handling
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Render loop: turntable rotation + orbit damping
// ---------------------------------------------------------------------------
const TURNTABLE_SPEED = 0.4; // radians per second
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  turntable.rotation.y += TURNTABLE_SPEED * dt;
  controls.update();
  renderer.render(scene, camera);
});
