import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app mount point");
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11151d);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
const environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = environment;

const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 3.1, 9.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.1, 0);
controls.minDistance = 5;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.49;
controls.update();

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(16, 9),
  new THREE.MeshStandardMaterial({
    color: 0x29303a,
    roughness: 0.62,
    metalness: 0,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const backWall = new THREE.Mesh(
  new THREE.PlaneGeometry(16, 6),
  new THREE.MeshStandardMaterial({
    color: 0x1c222b,
    roughness: 0.5,
    metalness: 0,
  }),
);
backWall.position.set(0, 3, -3.15);
backWall.receiveShadow = true;
scene.add(backWall);

const lightPanelMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  toneMapped: false,
});

const softboxGeometry = new THREE.PlaneGeometry(1.35, 0.55);
const softboxes = [
  { position: new THREE.Vector3(-4.7, 3.9, -2.9), rotation: 0.12, scale: 1.4 },
  { position: new THREE.Vector3(0, 4.35, -2.9), rotation: 0, scale: 1.15 },
  { position: new THREE.Vector3(4.7, 3.9, -2.9), rotation: -0.12, scale: 1.4 },
];

for (const softbox of softboxes) {
  const panel = new THREE.Mesh(softboxGeometry, lightPanelMaterial);
  panel.position.copy(softbox.position);
  panel.rotation.set(-0.06, softbox.rotation, 0);
  panel.scale.setScalar(softbox.scale);
  scene.add(panel);
}

const keyLight = new THREE.RectAreaLight(0xffffff, 5.2, 5, 2.3);
keyLight.position.set(-3.6, 5.2, 3.2);
keyLight.lookAt(0, 1, 0);
scene.add(keyLight);

const fillLight = new THREE.RectAreaLight(0x9dbfff, 2.2, 5, 3);
fillLight.position.set(4.3, 3.1, 2.7);
fillLight.lookAt(0, 1, 0);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 1.7);
rimLight.position.set(0, 6, -4.5);
rimLight.castShadow = true;
rimLight.shadow.mapSize.set(2048, 2048);
rimLight.shadow.camera.near = 1;
rimLight.shadow.camera.far = 12;
rimLight.shadow.camera.left = -7;
rimLight.shadow.camera.right = 7;
rimLight.shadow.camera.top = 5;
rimLight.shadow.camera.bottom = -5;
scene.add(rimLight);

const ambientLight = new THREE.HemisphereLight(0xbfd7ff, 0x202633, 0.75);
scene.add(ambientLight);

const sphereGeometry = new THREE.SphereGeometry(0.82, 96, 64);

const materials: Array<{
  name: string;
  x: number;
  material: THREE.Material;
  extraLight?: THREE.PointLight;
}> = [
  {
    name: "Metal",
    x: -4,
    material: new THREE.MeshPhysicalMaterial({
      color: 0xd5d8df,
      metalness: 1,
      roughness: 0.18,
      envMapIntensity: 1.6,
    }),
  },
  {
    name: "Glass",
    x: -2,
    material: new THREE.MeshPhysicalMaterial({
      color: 0xd8f6ff,
      metalness: 0,
      roughness: 0.02,
      transmission: 0.92,
      transparent: true,
      opacity: 0.42,
      ior: 1.47,
      thickness: 0.7,
      envMapIntensity: 1.9,
    }),
  },
  {
    name: "Rubber",
    x: 0,
    material: new THREE.MeshStandardMaterial({
      color: 0x17191c,
      metalness: 0,
      roughness: 0.93,
      envMapIntensity: 0.25,
    }),
  },
  {
    name: "Emissive",
    x: 2,
    material: new THREE.MeshStandardMaterial({
      color: 0x1c2430,
      emissive: 0xff6a22,
      emissiveIntensity: 2.9,
      roughness: 0.34,
      metalness: 0,
    }),
    extraLight: new THREE.PointLight(0xff7433, 3.2, 4.6),
  },
  {
    name: "Clearcoat",
    x: 4,
    material: new THREE.MeshPhysicalMaterial({
      color: 0x2d6cdf,
      metalness: 0,
      roughness: 0.38,
      clearcoat: 1,
      clearcoatRoughness: 0.035,
      envMapIntensity: 1.55,
    }),
  },
];

const labelCanvas = document.createElement("canvas");
labelCanvas.width = 512;
labelCanvas.height = 128;
const labelContext = labelCanvas.getContext("2d");

function makeLabelTexture(text: string): THREE.CanvasTexture {
  if (!labelContext) {
    throw new Error("Canvas labels are unavailable");
  }

  labelContext.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
  labelContext.fillStyle = "rgba(11, 14, 20, 0.78)";
  labelContext.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
  labelContext.strokeStyle = "rgba(255, 255, 255, 0.18)";
  labelContext.lineWidth = 5;
  labelContext.strokeRect(2.5, 2.5, labelCanvas.width - 5, labelCanvas.height - 5);
  labelContext.fillStyle = "#eef4ff";
  labelContext.font = "600 54px Inter, Arial, sans-serif";
  labelContext.textAlign = "center";
  labelContext.textBaseline = "middle";
  labelContext.fillText(text, labelCanvas.width / 2, labelCanvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

for (const entry of materials) {
  const sphere = new THREE.Mesh(sphereGeometry, entry.material);
  sphere.position.set(entry.x, 1.02, 0);
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  scene.add(sphere);

  if (entry.extraLight) {
    entry.extraLight.position.set(entry.x, 1.35, 0.7);
    scene.add(entry.extraLight);
  }

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.92, 1.08, 0.25, 64),
    new THREE.MeshStandardMaterial({
      color: 0x404957,
      roughness: 0.58,
      metalness: 0.08,
    }),
  );
  pedestal.position.set(entry.x, 0.125, 0);
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.24, 0.31),
    new THREE.MeshBasicMaterial({
      map: makeLabelTexture(entry.name),
      transparent: true,
    }),
  );
  label.position.set(entry.x, 0.1, 1.02);
  label.rotation.x = -Math.PI * 0.18;
  scene.add(label);
}

const reflectionStripes = new THREE.Group();
for (let i = 0; i < 7; i += 1) {
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 3.8, 0.02),
    new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? 0x6b7f98 : 0xe8eef8,
      transparent: true,
      opacity: i % 2 === 0 ? 0.32 : 0.45,
    }),
  );
  stripe.position.set(-6 + i * 2, 2.3, -3.08);
  reflectionStripes.add(stripe);
}
scene.add(reflectionStripes);

function resize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", resize);

function animate(): void {
  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
