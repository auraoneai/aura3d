// Prompt 07: Material Lab
// Five spheres (metal, glass, rubber, emissive, clearcoat) under studio
// lighting with a procedural environment map and orbit controls.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const app = document.getElementById('app') as HTMLDivElement;

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

// ---------------------------------------------------------------------------
// Scene + camera
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202428);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 2.2, 9);

// ---------------------------------------------------------------------------
// Environment map (procedural studio room, no external asset)
// ---------------------------------------------------------------------------
const pmrem = new THREE.PMREMGenerator(renderer);
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTexture;

// ---------------------------------------------------------------------------
// Studio lighting
// ---------------------------------------------------------------------------
const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);

// Key light — casts the soft shadows.
const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
keyLight.position.set(5, 8, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 40;
keyLight.shadow.camera.left = -10;
keyLight.shadow.camera.right = 10;
keyLight.shadow.camera.top = 10;
keyLight.shadow.camera.bottom = -10;
keyLight.shadow.bias = -0.0001;
keyLight.shadow.radius = 6;
scene.add(keyLight);

// Fill light — softens the shadowed side.
const fillLight = new THREE.DirectionalLight(0xbcd2ff, 1.0);
fillLight.position.set(-6, 4, 2);
scene.add(fillLight);

// Rim / back light — separates spheres from background, adds highlights.
const rimLight = new THREE.SpotLight(0xffffff, 60, 30, Math.PI / 6, 0.4, 1.5);
rimLight.position.set(-3, 7, -8);
scene.add(rimLight);

// ---------------------------------------------------------------------------
// Ground (receives soft shadows)
// ---------------------------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(20, 64),
  new THREE.MeshStandardMaterial({
    color: 0x33373c,
    roughness: 0.6,
    metalness: 0.1,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.25;
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------------------
// Five visually distinct materials
// ---------------------------------------------------------------------------
const sphereGeo = new THREE.SphereGeometry(1, 64, 32);

const metal = new THREE.MeshStandardMaterial({
  color: 0xfff4e0,
  metalness: 1.0,
  roughness: 0.08,
  envMapIntensity: 1.5,
});

const glass = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0.0,
  roughness: 0.0,
  transmission: 1.0,
  thickness: 1.2,
  ior: 1.5,
  transparent: true,
  envMapIntensity: 1.0,
});

const rubber = new THREE.MeshStandardMaterial({
  color: 0x8a1f1f,
  metalness: 0.0,
  roughness: 1.0,
  envMapIntensity: 0.3,
});

const emissive = new THREE.MeshStandardMaterial({
  color: 0x000000,
  emissive: new THREE.Color(0x00ff9c),
  emissiveIntensity: 2.5,
  metalness: 0.0,
  roughness: 0.4,
});

const clearcoat = new THREE.MeshPhysicalMaterial({
  color: 0x0a47a0,
  metalness: 0.0,
  roughness: 0.5,
  clearcoat: 1.0,
  clearcoatRoughness: 0.03,
  envMapIntensity: 1.0,
});

const specs: { label: string; material: THREE.Material }[] = [
  { label: 'metal', material: metal },
  { label: 'glass', material: glass },
  { label: 'rubber', material: rubber },
  { label: 'emissive', material: emissive },
  { label: 'clearcoat', material: clearcoat },
];

const spacing = 2.6;
const start = -((specs.length - 1) * spacing) / 2;

specs.forEach((spec, i) => {
  const mesh = new THREE.Mesh(sphereGeo, spec.material);
  mesh.position.set(start + i * spacing, 0, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = spec.label;
  scene.add(mesh);
});

// ---------------------------------------------------------------------------
// Orbit controls
// ---------------------------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 4;
controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI / 1.9;
controls.target.set(0, 0, 0);
controls.update();

// ---------------------------------------------------------------------------
// Resize + render loop
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
