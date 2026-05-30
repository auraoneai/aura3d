import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Only permitted asset. Served from source/public, so the URL is root-relative.
const SNEAKER_URL = '/benchmark/assets/sneaker.glb';

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const app = document.getElementById('app') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

// ---------------------------------------------------------------------------
// Scene & camera
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1d22);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(2.6, 1.9, 3.4);

// Soft image-based studio environment so the PBR materials read correctly.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ---------------------------------------------------------------------------
// Studio lighting (three-point) + soft ambient fill
// ---------------------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0xffffff, 0x4a4f57, 0.45));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
keyLight.position.set(4, 6, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 25;
keyLight.shadow.camera.left = -4;
keyLight.shadow.camera.right = 4;
keyLight.shadow.camera.top = 4;
keyLight.shadow.camera.bottom = -4;
keyLight.shadow.bias = -0.0001;
keyLight.shadow.normalBias = 0.02;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xcfe0ff, 0.9);
fillLight.position.set(-5, 2.5, 2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 1.4);
rimLight.position.set(-2, 4, -5);
scene.add(rimLight);

// ---------------------------------------------------------------------------
// Plinth (product base)
// ---------------------------------------------------------------------------
const PLINTH_RADIUS = 1.35;
const PLINTH_HEIGHT = 0.35;

const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(PLINTH_RADIUS, PLINTH_RADIUS * 1.04, PLINTH_HEIGHT, 96),
  new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.65, metalness: 0.0 }),
);
plinth.position.y = -PLINTH_HEIGHT / 2; // top face sits at y = 0
plinth.receiveShadow = true;
plinth.castShadow = true;
scene.add(plinth);

// Large catcher floor for a grounded contact shadow under the plinth.
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(20, 64),
  new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 1.0, metalness: 0.0 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -PLINTH_HEIGHT;
floor.receiveShadow = true;
scene.add(floor);

// ---------------------------------------------------------------------------
// Orbit controls
// ---------------------------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.5;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * 0.495; // keep camera above the floor
controls.target.set(0, 0.55, 0);
controls.update();

// ---------------------------------------------------------------------------
// Turntable: the sneaker lives inside a pivot we spin every frame.
// ---------------------------------------------------------------------------
const turntable = new THREE.Group();
scene.add(turntable);

let turntableEnabled = true;
const TURNTABLE_SPEED = 0.45; // radians / second

// ---------------------------------------------------------------------------
// Load the sneaker, then center + auto-scale onto the plinth.
// ---------------------------------------------------------------------------
const overlay = document.getElementById('overlay');

function setStatus(text: string): void {
  if (overlay) overlay.textContent = text;
}

const loader = new GLTFLoader();
loader.load(
  SNEAKER_URL,
  (gltf) => {
    const model = gltf.scene;

    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    // --- Auto-scale: fit the model's largest dimension to a target size. ---
    const TARGET_SIZE = 1.9;
    let box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    model.scale.setScalar(TARGET_SIZE / maxDim);

    // --- Center horizontally and rest the model on top of the plinth. ---
    box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y; // bottom of model -> y = 0 (plinth top)

    turntable.add(model);

    // Frame the controls target on the model's mid-height.
    const finalBox = new THREE.Box3().setFromObject(model);
    const finalCenter = finalBox.getCenter(new THREE.Vector3());
    controls.target.copy(finalCenter);
    controls.update();

    if (overlay) overlay.style.display = 'none';
  },
  (event) => {
    if (event.total) {
      const pct = Math.round((event.loaded / event.total) * 100);
      setStatus(`Loading sneaker… ${pct}%`);
    } else {
      setStatus('Loading sneaker…');
    }
  },
  (error) => {
    console.error('Failed to load sneaker.glb', error);
    setStatus('Failed to load sneaker.glb — see console.');
  },
);

// ---------------------------------------------------------------------------
// UI: turntable toggle
// ---------------------------------------------------------------------------
const toggle = document.getElementById('toggle-turntable') as HTMLButtonElement | null;
toggle?.addEventListener('click', () => {
  turntableEnabled = !turntableEnabled;
  toggle.textContent = turntableEnabled ? 'Pause turntable' : 'Resume turntable';
});

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (turntableEnabled) {
    turntable.rotation.y += TURNTABLE_SPEED * dt;
  }
  controls.update();
  renderer.render(scene, camera);
});
