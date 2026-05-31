// Material Lab — 5 spheres (metal, glass, rubber, emissive, clearcoat)
// under controlled studio lighting with an environment map and orbit controls.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const app = document.getElementById('app') ?? document.body;

// ----------------------------------------------------------------------------
// Renderer
// ----------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
Object.assign(renderer.domElement.style, {
  display: 'block',
  width: '100%',
  height: '100%',
});
app.appendChild(renderer.domElement);

// ----------------------------------------------------------------------------
// Scene & camera
// ----------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202428);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 2.2, 9);

// ----------------------------------------------------------------------------
// Environment map (image-based lighting + reflections)
// ----------------------------------------------------------------------------
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTexture;

// ----------------------------------------------------------------------------
// Studio lighting: key + fill + rim, plus a soft ambient base
// ----------------------------------------------------------------------------
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
keyLight.position.set(5, 8, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 40;
keyLight.shadow.camera.left = -10;
keyLight.shadow.camera.right = 10;
keyLight.shadow.camera.top = 10;
keyLight.shadow.camera.bottom = -10;
keyLight.shadow.bias = -0.0001;
keyLight.shadow.radius = 6;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xa9c4ff, 1.0);
fillLight.position.set(-6, 4, 4);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffe6c4, 1.6);
rimLight.position.set(0, 5, -8);
scene.add(rimLight);

// ----------------------------------------------------------------------------
// Ground plane (receives soft shadows)
// ----------------------------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.9, metalness: 0.0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.25;
ground.receiveShadow = true;
scene.add(ground);

// ----------------------------------------------------------------------------
// Five distinct materials
// ----------------------------------------------------------------------------
const sphereGeo = new THREE.SphereGeometry(1, 64, 64);

const materials: { name: string; material: THREE.Material }[] = [
  {
    name: 'Metal',
    material: new THREE.MeshStandardMaterial({
      color: 0xfff0d0,
      metalness: 1.0,
      roughness: 0.12,
      envMapIntensity: 1.0,
    }),
  },
  {
    name: 'Glass',
    material: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.0,
      transmission: 1.0,
      thickness: 1.5,
      ior: 1.5,
      transparent: true,
      envMapIntensity: 1.0,
    }),
  },
  {
    name: 'Rubber',
    material: new THREE.MeshStandardMaterial({
      color: 0x16181c,
      metalness: 0.0,
      roughness: 0.95,
      envMapIntensity: 0.4,
    }),
  },
  {
    name: 'Emissive',
    material: new THREE.MeshStandardMaterial({
      color: 0x110000,
      emissive: new THREE.Color(0xff3b30),
      emissiveIntensity: 2.5,
      metalness: 0.0,
      roughness: 0.5,
    }),
  },
  {
    name: 'Clearcoat',
    material: new THREE.MeshPhysicalMaterial({
      color: 0xc4161e,
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

// ----------------------------------------------------------------------------
// Orbit controls
// ----------------------------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0.2, 0);
controls.minDistance = 4;
controls.maxDistance = 25;
controls.maxPolarAngle = Math.PI * 0.495;
controls.update();

// ----------------------------------------------------------------------------
// Resize
// ----------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ----------------------------------------------------------------------------
// Render loop
// ----------------------------------------------------------------------------
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
