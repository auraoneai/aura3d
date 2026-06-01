import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const container = document.getElementById("app") as HTMLDivElement;

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
container.appendChild(renderer.domElement);

// ---------------------------------------------------------------------------
// Scene + camera
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202024);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 1.6, 9);

// ---------------------------------------------------------------------------
// Environment map (image-based lighting + reflections), generated procedurally
// from a studio-like room. No external assets required.
// ---------------------------------------------------------------------------
const pmrem = new THREE.PMREMGenerator(renderer);
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTexture;

// ---------------------------------------------------------------------------
// Studio lighting: soft ambient fill + key / fill / rim, with soft shadows
// ---------------------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0xffffff, 0x404048, 0.35));

const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(5, 8, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 30;
keyLight.shadow.camera.left = -8;
keyLight.shadow.camera.right = 8;
keyLight.shadow.camera.top = 8;
keyLight.shadow.camera.bottom = -8;
keyLight.shadow.bias = -0.0004;
keyLight.shadow.radius = 6;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xbfd4ff, 1.0);
fillLight.position.set(-6, 3, 4);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffe6c0, 1.6);
rimLight.position.set(-2, 5, -6);
scene.add(rimLight);

// Soft overhead "softbox" for extra specular highlights on the spheres.
const softbox = new THREE.PointLight(0xffffff, 60, 60, 2);
softbox.position.set(0, 7, 2);
scene.add(softbox);

// ---------------------------------------------------------------------------
// Ground plane (receives the soft shadows)
// ---------------------------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.9, metalness: 0.0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.25;
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------------------
// Five spheres, each a visually distinct material
// ---------------------------------------------------------------------------
const sphereGeo = new THREE.SphereGeometry(1, 96, 96);

const materials: THREE.Material[] = [
  // 1. Polished metal — full metalness, low roughness, strong reflections.
  new THREE.MeshStandardMaterial({
    color: 0xdfe2e6,
    metalness: 1.0,
    roughness: 0.12,
    envMapIntensity: 1.4,
  }),

  // 2. Glass — physical transmission, refraction, near-zero roughness.
  new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.02,
    transmission: 1.0,
    thickness: 1.2,
    ior: 1.5,
    transparent: true,
    envMapIntensity: 1.4,
  }),

  // 3. Rubber — fully matte, no metalness, deep color.
  new THREE.MeshStandardMaterial({
    color: 0x111317,
    metalness: 0.0,
    roughness: 1.0,
    envMapIntensity: 0.4,
  }),

  // 4. Emissive — self-illuminated, glows independent of lighting.
  new THREE.MeshStandardMaterial({
    color: 0x220900,
    emissive: new THREE.Color(0xff5a1f),
    emissiveIntensity: 2.4,
    metalness: 0.0,
    roughness: 0.5,
  }),

  // 5. Clearcoat — colored diffuse base under a glossy lacquer layer.
  new THREE.MeshPhysicalMaterial({
    color: 0xb01030,
    metalness: 0.0,
    roughness: 0.55,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.0,
  }),
];

const spacing = 2.6;
const startX = -((materials.length - 1) * spacing) / 2;

materials.forEach((mat, i) => {
  const mesh = new THREE.Mesh(sphereGeo, mat);
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
controls.dampingFactor = 0.06;
controls.target.set(0, 0, 0);
controls.minDistance = 4;
controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI * 0.495 + 0.4;
controls.update();

// ---------------------------------------------------------------------------
// Resize + render loop
// ---------------------------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate(): void {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
