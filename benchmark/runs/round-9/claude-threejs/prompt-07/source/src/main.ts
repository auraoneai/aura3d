import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

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

const app = document.getElementById('app') ?? document.body;
app.appendChild(renderer.domElement);
renderer.domElement.style.display = 'block';
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';

// ---------------------------------------------------------------------------
// Scene & camera
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202225);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 2.2, 9);

// ---------------------------------------------------------------------------
// Environment map (procedural studio room) for reflections & IBL
// ---------------------------------------------------------------------------
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTexture;

// ---------------------------------------------------------------------------
// Studio lighting: key, fill, rim + soft shadows
// ---------------------------------------------------------------------------
const ambient = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambient);

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

const fillLight = new THREE.DirectionalLight(0x99bbff, 1.0);
fillLight.position.set(-6, 4, 4);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 2.0);
rimLight.position.set(0, 6, -8);
scene.add(rimLight);

// Bright softbox-style panels to produce crisp specular highlights
function addSoftbox(x: number, y: number, z: number, intensity: number) {
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  panel.position.set(x, y, z);
  panel.lookAt(0, 1, 0);
  scene.add(panel);
  const point = new THREE.PointLight(0xffffff, intensity, 30, 2);
  point.position.set(x, y, z);
  scene.add(point);
}
addSoftbox(-5, 5, 6, 40);
addSoftbox(5, 5, 6, 40);

// ---------------------------------------------------------------------------
// Ground / studio floor (receives soft shadows)
// ---------------------------------------------------------------------------
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(20, 64),
  new THREE.MeshStandardMaterial({
    color: 0x4a4d52,
    roughness: 0.85,
    metalness: 0.0,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.05;
floor.receiveShadow = true;
scene.add(floor);

// ---------------------------------------------------------------------------
// Five spheres with visually distinct materials
// ---------------------------------------------------------------------------
const sphereGeo = new THREE.SphereGeometry(0.95, 96, 96);

const materials: { label: string; material: THREE.Material }[] = [
  {
    label: 'Metal',
    material: new THREE.MeshStandardMaterial({
      color: 0xfff0d0,
      metalness: 1.0,
      roughness: 0.12,
      envMapIntensity: 1.4,
    }),
  },
  {
    label: 'Glass',
    material: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.0,
      transmission: 1.0,
      thickness: 1.2,
      ior: 1.5,
      transparent: true,
      envMapIntensity: 1.0,
    }),
  },
  {
    label: 'Rubber',
    material: new THREE.MeshStandardMaterial({
      color: 0x8a1f1f,
      metalness: 0.0,
      roughness: 0.95,
      envMapIntensity: 0.6,
    }),
  },
  {
    label: 'Emissive',
    material: new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: new THREE.Color(0x22ff88),
      emissiveIntensity: 2.5,
      metalness: 0.0,
      roughness: 0.4,
    }),
  },
  {
    label: 'Clearcoat',
    material: new THREE.MeshPhysicalMaterial({
      color: 0x1133aa,
      metalness: 0.0,
      roughness: 0.55,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.0,
    }),
  },
];

const spacing = 2.4;
const startX = -((materials.length - 1) * spacing) / 2;

materials.forEach((entry, i) => {
  const mesh = new THREE.Mesh(sphereGeo, entry.material);
  mesh.position.set(startX + i * spacing, 0, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
});

// ---------------------------------------------------------------------------
// Orbit controls
// ---------------------------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0.2, 0);
controls.minDistance = 3;
controls.maxDistance = 25;
controls.maxPolarAngle = Math.PI / 2 + 0.05;
controls.update();

// ---------------------------------------------------------------------------
// Resize & render loop
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
