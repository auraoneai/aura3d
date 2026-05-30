import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("#app container not found");

// --- Renderer -------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
Object.assign(renderer.domElement.style, { display: "block", width: "100%", height: "100%" });
app.appendChild(renderer.domElement);

// --- Scene & camera -------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202124);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2.2, 9);

// --- Environment map (IBL for reflections + ambient lighting) -------------
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTexture;

// --- Studio lighting ------------------------------------------------------
// Soft fill so shadowed sides never go fully black.
scene.add(new THREE.HemisphereLight(0xffffff, 0x444450, 0.35));

// Key light — casts the soft studio shadows.
const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.6);
keyLight.position.set(5, 8, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 40;
keyLight.shadow.camera.left = -12;
keyLight.shadow.camera.right = 12;
keyLight.shadow.camera.top = 12;
keyLight.shadow.camera.bottom = -12;
keyLight.shadow.bias = -0.0004;
keyLight.shadow.radius = 6;
scene.add(keyLight);

// Cool rim light from behind for separation and extra highlights.
const rimLight = new THREE.DirectionalLight(0xbcd4ff, 1.4);
rimLight.position.set(-7, 5, -6);
scene.add(rimLight);

// Bright fill from the front-left to lift the glass and clearcoat.
const fillLight = new THREE.SpotLight(0xffffff, 120, 30, Math.PI / 5, 0.5, 1.5);
fillLight.position.set(-6, 7, 8);
scene.add(fillLight);

// --- Studio floor (catches soft shadows) ----------------------------------
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.85, metalness: 0.0 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.25;
floor.receiveShadow = true;
scene.add(floor);

// --- Five distinct materials ----------------------------------------------
const sphereGeo = new THREE.SphereGeometry(1, 96, 96);

const materials: { name: string; material: THREE.Material }[] = [
  {
    name: "Metal",
    material: new THREE.MeshStandardMaterial({
      color: 0xfafafa,
      metalness: 1.0,
      roughness: 0.12,
      envMapIntensity: 1.2,
    }),
  },
  {
    name: "Glass",
    material: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.0,
      transmission: 1.0,
      thickness: 1.5,
      ior: 1.5,
      transparent: true,
      envMapIntensity: 1.0,
      specularIntensity: 1.0,
    }),
  },
  {
    name: "Rubber",
    material: new THREE.MeshStandardMaterial({
      color: 0xc0392b,
      metalness: 0.0,
      roughness: 0.95,
      envMapIntensity: 0.4,
    }),
  },
  {
    name: "Emissive",
    material: new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: new THREE.Color(0x33ff88),
      emissiveIntensity: 3.0,
      metalness: 0.0,
      roughness: 0.5,
    }),
  },
  {
    name: "Clearcoat",
    material: new THREE.MeshPhysicalMaterial({
      color: 0x1f5fff,
      metalness: 0.0,
      roughness: 0.55,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.0,
    }),
  },
];

const spacing = 2.6;
const startX = -((materials.length - 1) * spacing) / 2;

materials.forEach((entry, i) => {
  const mesh = new THREE.Mesh(sphereGeo, entry.material);
  mesh.position.set(startX + i * spacing, 0, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = entry.name;
  scene.add(mesh);
});

// --- Orbit controls -------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 4;
controls.maxDistance = 25;
controls.maxPolarAngle = Math.PI / 2 + 0.15;
controls.target.set(0, 0, 0);
controls.update();

// --- Resize ---------------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Render loop ----------------------------------------------------------
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
