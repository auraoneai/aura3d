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
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// ---------------------------------------------------------------------------
// Scene & Camera
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202024);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 2.2, 9);

// ---------------------------------------------------------------------------
// Environment map (image-based lighting + reflections)
// ---------------------------------------------------------------------------
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTexture;

// ---------------------------------------------------------------------------
// Studio lighting (3-point + ambient) with soft shadows
// ---------------------------------------------------------------------------
scene.add(new THREE.AmbientLight(0xffffff, 0.15));

// Key light
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
keyLight.shadow.bias = -0.0003;
keyLight.shadow.radius = 6;
scene.add(keyLight);

// Fill light (softer, opposite side, cooler)
const fillLight = new THREE.DirectionalLight(0xbcd0ff, 0.8);
fillLight.position.set(-6, 3, 4);
scene.add(fillLight);

// Rim / back light for highlight separation
const rimLight = new THREE.SpotLight(0xffffff, 120, 0, Math.PI / 6, 0.4, 1.5);
rimLight.position.set(-3, 6, -7);
scene.add(rimLight);

// ---------------------------------------------------------------------------
// Studio floor (receives soft shadows)
// ---------------------------------------------------------------------------
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x35353a, roughness: 0.85, metalness: 0.0 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.25;
floor.receiveShadow = true;
scene.add(floor);

// ---------------------------------------------------------------------------
// Five material spheres
// ---------------------------------------------------------------------------
const sphereGeo = new THREE.SphereGeometry(1, 64, 64);
const radius = 1;
const spacing = 2.6;
const startX = -2 * spacing;

type Entry = { name: string; material: THREE.Material };

const entries: Entry[] = [
  {
    name: 'Metal',
    material: new THREE.MeshStandardMaterial({
      color: 0xdfe2e6,
      metalness: 1.0,
      roughness: 0.12,
    }),
  },
  {
    name: 'Glass',
    material: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.02,
      transmission: 1.0,
      thickness: 1.4,
      ior: 1.5,
      transparent: true,
    }),
  },
  {
    name: 'Rubber',
    material: new THREE.MeshStandardMaterial({
      color: 0xb22222,
      metalness: 0.0,
      roughness: 0.95,
    }),
  },
  {
    name: 'Emissive',
    material: new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xff7b29,
      emissiveIntensity: 2.4,
      roughness: 0.5,
    }),
  },
  {
    name: 'Clearcoat',
    material: new THREE.MeshPhysicalMaterial({
      color: 0xc81e3a,
      metalness: 0.0,
      roughness: 0.55,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
    }),
  },
];

entries.forEach((entry, i) => {
  const mesh = new THREE.Mesh(sphereGeo, entry.material);
  mesh.position.set(startX + i * spacing, radius - 0.25, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = entry.name;
  scene.add(mesh);
});

// ---------------------------------------------------------------------------
// Orbit controls
// ---------------------------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0.6, 0);
controls.minDistance = 4;
controls.maxDistance = 25;
controls.maxPolarAngle = Math.PI / 1.95;
controls.update();

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
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
