import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ------------------------------------------------------------------ *
 * Renderer
 * ------------------------------------------------------------------ */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

/* ------------------------------------------------------------------ *
 * Scene & Camera
 * ------------------------------------------------------------------ */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111317);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 1.4, 7.5);

/* ------------------------------------------------------------------ *
 * Environment map (image-based lighting + reflections)
 * RoomEnvironment + PMREM gives correct PBR reflections without
 * loading any external HDR assets.
 * ------------------------------------------------------------------ */
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTexture;

/* ------------------------------------------------------------------ *
 * Studio lighting
 *  - soft ambient/hemisphere fill
 *  - key spot light (soft shadows)
 *  - fill + rim directional lights
 * ------------------------------------------------------------------ */
const hemi = new THREE.HemisphereLight(0xffffff, 0x20242b, 0.35);
scene.add(hemi);

// Key light — main studio source, casts the soft shadow.
const keyLight = new THREE.SpotLight(0xffffff, 120, 30, Math.PI / 5, 0.5, 1.5);
keyLight.position.set(-4.5, 7, 6);
keyLight.target.position.set(0, 0.4, 0);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.bias = -0.0005;
keyLight.shadow.radius = 6; // softens the PCF shadow edge
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 30;
scene.add(keyLight);
scene.add(keyLight.target);

// Fill light — softens shadows from the opposite side.
const fillLight = new THREE.DirectionalLight(0xbfd4ff, 1.1);
fillLight.position.set(6, 4, 3);
scene.add(fillLight);

// Rim / back light — separates spheres from the background.
const rimLight = new THREE.DirectionalLight(0xffe9c7, 1.6);
rimLight.position.set(0, 5, -7);
scene.add(rimLight);

/* ------------------------------------------------------------------ *
 * Studio backdrop / floor (receives the soft shadow + reflections)
 * ------------------------------------------------------------------ */
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(40, 64),
  new THREE.MeshStandardMaterial({
    color: 0x15171c,
    roughness: 0.55,
    metalness: 0.0,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.05;
floor.receiveShadow = true;
scene.add(floor);

/* ------------------------------------------------------------------ *
 * Spheres — five visually distinct materials
 * ------------------------------------------------------------------ */
const RADIUS = 0.9;
const sphereGeo = new THREE.SphereGeometry(RADIUS, 96, 64);

const materials = [
  {
    name: 'metal',
    material: new THREE.MeshStandardMaterial({
      color: 0xbac4cc,
      metalness: 1.0,
      roughness: 0.12,
      envMapIntensity: 1.4,
    }),
  },
  {
    name: 'glass',
    material: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.02,
      transmission: 1.0,
      thickness: 1.2,
      ior: 1.5,
      attenuationColor: new THREE.Color(0x9ad8ff),
      attenuationDistance: 3.0,
      specularIntensity: 1.0,
      envMapIntensity: 1.0,
    }),
  },
  {
    name: 'rubber',
    material: new THREE.MeshStandardMaterial({
      color: 0x16181d,
      metalness: 0.0,
      roughness: 0.92,
      envMapIntensity: 0.4,
    }),
  },
  {
    name: 'emissive',
    material: new THREE.MeshStandardMaterial({
      color: 0x120402,
      emissive: new THREE.Color(0xff5a2b),
      emissiveIntensity: 4.0,
      metalness: 0.0,
      roughness: 0.5,
    }),
  },
  {
    name: 'clearcoat',
    material: new THREE.MeshPhysicalMaterial({
      color: 0xd61f5b,
      metalness: 0.0,
      roughness: 0.55,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.0,
    }),
  },
];

const spacing = 2.4;
const startX = -((materials.length - 1) / 2) * spacing;

const spheres = materials.map((entry, i) => {
  const mesh = new THREE.Mesh(sphereGeo, entry.material);
  mesh.position.set(startX + i * spacing, 0, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = entry.name;
  scene.add(mesh);
  return mesh;
});

/* ------------------------------------------------------------------ *
 * Orbit controls
 * ------------------------------------------------------------------ */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0.1, 0);
controls.minDistance = 3;
controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI / 1.9;
controls.update();

/* ------------------------------------------------------------------ *
 * Postprocessing — gentle bloom so the emissive sphere glows
 * ------------------------------------------------------------------ */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.45, // strength
  0.6, // radius
  0.85, // threshold — only bright (emissive) areas bloom
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

/* ------------------------------------------------------------------ *
 * Resize
 * ------------------------------------------------------------------ */
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});

/* ------------------------------------------------------------------ *
 * Animation loop
 * ------------------------------------------------------------------ */
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();

  // Slow individual spin so highlights/reflections sweep across each sphere.
  for (const mesh of spheres) {
    mesh.rotation.y = t * 0.25;
  }

  controls.update();
  composer.render();
});
