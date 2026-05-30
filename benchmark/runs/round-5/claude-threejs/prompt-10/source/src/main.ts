import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// Only allowed asset. Served from source/public (canonical benchmark path).
const SNEAKER_URL = "/benchmark/assets/sneaker.glb";

const app = document.querySelector<HTMLDivElement>("#app")!;

// --- Renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// --- Scene & camera ---------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1119);

const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(3.2, 2.0, 4.4);

// --- Studio environment (image-based lighting for readable materials) -------
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// --- Studio key / fill / rim lights -----------------------------------------
const ambient = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
keyLight.position.set(4, 6, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 30;
keyLight.shadow.camera.left = -5;
keyLight.shadow.camera.right = 5;
keyLight.shadow.camera.top = 5;
keyLight.shadow.camera.bottom = -5;
keyLight.shadow.bias = -0.0002;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xdbe6ff, 0.9);
fillLight.position.set(-5, 3, 2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 1.4);
rimLight.position.set(-2, 4, -6);
scene.add(rimLight);

// --- Plinth (product base) --------------------------------------------------
const PLINTH_HEIGHT = 0.25;
const PLINTH_RADIUS = 1.5;

const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(PLINTH_RADIUS, PLINTH_RADIUS * 1.05, PLINTH_HEIGHT, 64),
  new THREE.MeshStandardMaterial({
    color: 0x2a2f3a,
    roughness: 0.45,
    metalness: 0.1,
  })
);
plinth.position.y = -PLINTH_HEIGHT / 2; // top face sits at y = 0
plinth.receiveShadow = true;
scene.add(plinth);

// Soft ground catch plane for the contact shadow
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(8, 64),
  new THREE.ShadowMaterial({ opacity: 0.25 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -PLINTH_HEIGHT;
ground.receiveShadow = true;
scene.add(ground);

// --- Turntable holding the product ------------------------------------------
const turntable = new THREE.Group();
scene.add(turntable);

// --- Orbit controls ---------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.495; // don't dip under the plinth
controls.target.set(0, 0.6, 0);
controls.update();

// --- Load, center and auto-scale the sneaker --------------------------------
const TARGET_SIZE = 2.0; // largest model dimension after scaling (world units)

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

    // Auto-scale so the longest axis equals TARGET_SIZE.
    const preBox = new THREE.Box3().setFromObject(model);
    const preSize = preBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(preSize.x, preSize.y, preSize.z) || 1;
    const scale = TARGET_SIZE / maxDim;
    model.scale.setScalar(scale);

    // Recenter horizontally and rest the model on the plinth top (y = 0).
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;

    turntable.add(model);

    // Frame the camera target on the model's mid-height.
    const finalBox = new THREE.Box3().setFromObject(model);
    const finalSize = finalBox.getSize(new THREE.Vector3());
    controls.target.set(0, finalSize.y * 0.5, 0);
    controls.update();

    const status = document.getElementById("status");
    if (status) status.remove();
  },
  undefined,
  (err) => {
    console.error("Failed to load sneaker.glb", err);
    const status = document.getElementById("status");
    if (status) status.textContent = "Failed to load sneaker model.";
  }
);

// --- HUD --------------------------------------------------------------------
const status = document.createElement("div");
status.id = "status";
status.className = "hud";
status.textContent = "Loading sneaker…";
app.appendChild(status);

const hint = document.createElement("div");
hint.className = "hud hint";
hint.textContent = "Drag to orbit · Scroll to zoom";
app.appendChild(hint);

// --- Animation loop (turntable rotation) ------------------------------------
const TURNTABLE_SPEED = 0.35; // radians / second
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  turntable.rotation.y += TURNTABLE_SPEED * dt;
  controls.update();
  renderer.render(scene, camera);
});

// --- Resize -----------------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
