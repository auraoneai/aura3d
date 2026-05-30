import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// Only permitted asset. Served from source/public/benchmark/assets/sneaker.glb,
// which Vite exposes at the site root as /benchmark/assets/sneaker.glb.
const SNEAKER_URL = "/benchmark/assets/sneaker.glb";

// Target size (in world units) that the sneaker's largest dimension is scaled to.
const TARGET_SIZE = 2.4;

const app = document.querySelector<HTMLElement>("#app")!;
app.innerHTML = "";

// Fill the viewport and drop default body margins.
const globalStyle = document.createElement("style");
globalStyle.textContent =
  "html,body{margin:0;height:100%;overflow:hidden;background:#202327}" +
  "#app{width:100vw;height:100vh}" +
  "canvas{display:block}";
document.head.appendChild(globalStyle);

// --- Renderer -------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// --- Scene & camera -------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202327);

const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(3.2, 2.2, 4.4);

// --- Image-based lighting (studio environment) ----------------------------
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// --- Orbit controls -------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2.5;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * 0.5; // keep above the plinth
controls.target.set(0, TARGET_SIZE * 0.5, 0);
controls.update();

// --- Studio lighting ------------------------------------------------------
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
keyLight.position.set(5, 8, 5);
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

const fillLight = new THREE.DirectionalLight(0xbcd0ff, 1.0);
fillLight.position.set(-6, 3, 2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 2.0);
rimLight.position.set(-2, 4, -6);
scene.add(rimLight);

// --- Plinth (product base) ------------------------------------------------
const plinth = new THREE.Group();

const plinthRadius = TARGET_SIZE * 0.85;
const plinthHeight = 0.4;
const plinthMat = new THREE.MeshStandardMaterial({
  color: 0xf2f2f2,
  roughness: 0.6,
  metalness: 0.0,
});
const plinthTop = new THREE.Mesh(
  new THREE.CylinderGeometry(plinthRadius, plinthRadius * 1.04, plinthHeight, 96),
  plinthMat
);
plinthTop.position.y = -plinthHeight / 2;
plinthTop.castShadow = true;
plinthTop.receiveShadow = true;
plinth.add(plinthTop);

// Large soft ground plane so shadows read.
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(plinthRadius * 6, 64),
  new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 1.0, metalness: 0.0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -plinthHeight;
ground.receiveShadow = true;
plinth.add(ground);

scene.add(plinth);

// --- Turntable holding the model -----------------------------------------
const turntable = new THREE.Group();
scene.add(turntable);

// --- Load the sneaker -----------------------------------------------------
const loader = new GLTFLoader();
loader.load(
  SNEAKER_URL,
  (gltf) => {
    const model = gltf.scene;

    // Center and auto-scale based on the model's bounding box.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = TARGET_SIZE / maxDim;
    model.scale.setScalar(scale);

    // Re-evaluate after scaling and recenter so the model sits on the plinth.
    const scaledBox = new THREE.Box3().setFromObject(model);
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
    model.position.x -= scaledCenter.x;
    model.position.z -= scaledCenter.z;
    model.position.y -= scaledBox.min.y; // rest its base on y = 0 (plinth top)

    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    turntable.add(model);

    // Aim controls at the vertical middle of the placed model.
    const placedBox = new THREE.Box3().setFromObject(model);
    controls.target.copy(placedBox.getCenter(new THREE.Vector3()));
    controls.update();

    const status = document.getElementById("status");
    if (status) status.remove();
  },
  (event) => {
    if (event.total) {
      const pct = Math.round((event.loaded / event.total) * 100);
      const status = document.getElementById("status");
      if (status) status.textContent = `Loading sneaker… ${pct}%`;
    }
  },
  (error) => {
    console.error("Failed to load sneaker.glb", error);
    const status = document.getElementById("status");
    if (status) status.textContent = "Failed to load sneaker.glb";
  }
);

// --- Loading status overlay ----------------------------------------------
const status = document.createElement("div");
status.id = "status";
status.textContent = "Loading sneaker…";
Object.assign(status.style, {
  position: "fixed",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  font: "16px system-ui, sans-serif",
  color: "#e8e8e8",
  pointerEvents: "none",
});
app.appendChild(status);

// --- Resize handling ------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Animation loop (turntable rotation) ----------------------------------
const clock = new THREE.Clock();
const TURNTABLE_SPEED = 0.35; // radians per second

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  turntable.rotation.y += TURNTABLE_SPEED * dt;
  controls.update();
  renderer.render(scene, camera);
});
