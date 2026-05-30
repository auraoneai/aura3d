import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const app = document.querySelector<HTMLDivElement>("#app")!;

// --- Renderer (controlled studio exposure) ---------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// --- Scene & camera --------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15171c);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 1.6, 8.5);

// --- Environment map (image-based lighting + reflections) ------------------
const pmrem = new THREE.PMREMGenerator(renderer);
const envTexture = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
scene.environment = envTexture;

// --- Studio lighting -------------------------------------------------------
const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);

// Key light (soft shadows)
const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
keyLight.position.set(5, 8, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 30;
keyLight.shadow.camera.left = -8;
keyLight.shadow.camera.right = 8;
keyLight.shadow.camera.top = 8;
keyLight.shadow.camera.bottom = -8;
keyLight.shadow.bias = -0.0002;
keyLight.shadow.radius = 6;
scene.add(keyLight);

// Fill light (cool, softer, opposite side)
const fillLight = new THREE.DirectionalLight(0xaecbff, 1.0);
fillLight.position.set(-6, 4, 2);
scene.add(fillLight);

// Rim / back light for highlight separation
const rimLight = new THREE.SpotLight(0xfff2d8, 200, 30, Math.PI / 6, 0.4, 1.2);
rimLight.position.set(-3, 9, -8);
scene.add(rimLight);

// --- Studio floor (receives soft shadows) ----------------------------------
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.85, metalness: 0.0 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.25;
floor.receiveShadow = true;
scene.add(floor);

// --- Five distinct materials -----------------------------------------------
const geometry = new THREE.SphereGeometry(1, 96, 96);

const metal = new THREE.MeshStandardMaterial({
  color: 0xcfd3d8,
  metalness: 1.0,
  roughness: 0.12,
  envMapIntensity: 1.4,
});

const glass = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0.0,
  roughness: 0.02,
  transmission: 1.0,
  thickness: 1.2,
  ior: 1.5,
  transparent: true,
  envMapIntensity: 1.0,
});

const rubber = new THREE.MeshStandardMaterial({
  color: 0x1d6f4c,
  metalness: 0.0,
  roughness: 0.95,
  envMapIntensity: 0.4,
});

const emissive = new THREE.MeshStandardMaterial({
  color: 0x110000,
  emissive: new THREE.Color(0xff5a2c),
  emissiveIntensity: 2.4,
  metalness: 0.0,
  roughness: 0.6,
});

const clearcoat = new THREE.MeshPhysicalMaterial({
  color: 0xb01515,
  metalness: 0.0,
  roughness: 0.5,
  clearcoat: 1.0,
  clearcoatRoughness: 0.03,
  envMapIntensity: 1.0,
});

const materials: THREE.Material[] = [metal, glass, rubber, emissive, clearcoat];

const spacing = 2.6;
const start = -((materials.length - 1) * spacing) / 2;
materials.forEach((material, i) => {
  const sphere = new THREE.Mesh(geometry, material);
  sphere.position.set(start + i * spacing, 0, 0);
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  scene.add(sphere);
});

// --- Orbit controls --------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);
controls.minDistance = 4;
controls.maxDistance = 25;
controls.maxPolarAngle = Math.PI / 1.9;
controls.update();

// --- Resize ----------------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Render loop -----------------------------------------------------------
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
