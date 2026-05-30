// Material Lab — five spheres (metal, glass, rubber, emissive, clearcoat)
// under controlled studio lighting with an environment map and orbit controls.

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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// ---------------------------------------------------------------------------
// Scene + camera
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15171c);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 2.2, 9);

// ---------------------------------------------------------------------------
// Environment map (studio reflections) generated procedurally from RoomEnvironment
// ---------------------------------------------------------------------------
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTexture;

// ---------------------------------------------------------------------------
// Studio lighting: soft ambient + key / fill / rim, key casts soft shadows
// ---------------------------------------------------------------------------
scene.add(new THREE.AmbientLight(0xffffff, 0.15));

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
keyLight.shadow.bias = -0.0005;
keyLight.shadow.radius = 6;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xbcd0ff, 0.8);
fillLight.position.set(-6, 3, 4);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffd9b0, 1.2);
rimLight.position.set(-3, 5, -8);
scene.add(rimLight);

// A bright point light gives crisp specular highlights on the spheres.
const specPoint = new THREE.PointLight(0xffffff, 40, 0, 2);
specPoint.position.set(2, 6, 4);
scene.add(specPoint);

// ---------------------------------------------------------------------------
// Ground that receives the soft studio shadows
// ---------------------------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x202329, roughness: 0.9, metalness: 0.0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.2;
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------------------
// Five distinct materials
// ---------------------------------------------------------------------------
const sphereGeo = new THREE.SphereGeometry(1, 96, 96);

const materials: { name: string; material: THREE.Material }[] = [
  {
    name: 'Metal',
    material: new THREE.MeshStandardMaterial({
      color: 0xf2f2f5,
      metalness: 1.0,
      roughness: 0.12,
      envMapIntensity: 1.4,
    }),
  },
  {
    name: 'Glass',
    material: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.02,
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
      color: 0x1b1d22,
      metalness: 0.0,
      roughness: 0.95,
      envMapIntensity: 0.4,
    }),
  },
  {
    name: 'Emissive',
    material: new THREE.MeshStandardMaterial({
      color: 0x050505,
      emissive: new THREE.Color(0xff5a2d),
      emissiveIntensity: 2.6,
      metalness: 0.0,
      roughness: 0.5,
    }),
  },
  {
    name: 'Clearcoat',
    material: new THREE.MeshPhysicalMaterial({
      color: 0xb71c2b,
      metalness: 0.0,
      roughness: 0.55,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.0,
    }),
  },
];

const spacing = 2.6;
const start = -((materials.length - 1) * spacing) / 2;

materials.forEach((entry, i) => {
  const mesh = new THREE.Mesh(sphereGeo, entry.material);
  mesh.position.set(start + i * spacing, 0, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // Emissive sphere doubles as a small light source for ambiance.
  if (entry.name === 'Emissive') {
    const glow = new THREE.PointLight(0xff5a2d, 8, 12, 2);
    glow.position.copy(mesh.position);
    scene.add(glow);
  }
});

// ---------------------------------------------------------------------------
// Orbit controls
// ---------------------------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 4;
controls.maxDistance = 25;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 0.2, 0);
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
