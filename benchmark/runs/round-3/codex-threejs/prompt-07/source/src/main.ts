import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root element");
}

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
root.style.width = "100vw";
root.style.height = "100vh";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111317);

const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 3.15, 9.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
root.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnvironment = new RoomEnvironment(renderer);
const environmentMap = pmrem.fromScene(roomEnvironment, 0.04).texture;
scene.environment = environmentMap;
roomEnvironment.dispose();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.78, 0);
controls.minDistance = 4.5;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.48;
controls.update();

const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0x777b80,
  metalness: 0,
  roughness: 0.56,
});

const floor = new THREE.Mesh(new THREE.PlaneGeometry(15, 9), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const backWall = new THREE.Mesh(
  new THREE.PlaneGeometry(15, 5.4),
  new THREE.MeshStandardMaterial({
    color: 0x2d3137,
    metalness: 0,
    roughness: 0.48,
  }),
);
backWall.position.set(0, 2.7, -3.4);
backWall.receiveShadow = true;
scene.add(backWall);

const seam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.32, 0.32, 15, 32, 1, true, 0, Math.PI / 2),
  floorMaterial,
);
seam.rotation.z = Math.PI / 2;
seam.position.set(0, 0.32, -3.4);
seam.receiveShadow = true;
scene.add(seam);

const ambient = new THREE.HemisphereLight(0xdde8ff, 0x33373c, 0.6);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 3.4);
keyLight.position.set(-4.5, 5.8, 5.3);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -7;
keyLight.shadow.camera.right = 7;
keyLight.shadow.camera.top = 6;
keyLight.shadow.camera.bottom = -5;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xbfd7ff, 1.4);
rimLight.position.set(5.2, 4, -3.4);
scene.add(rimLight);

const fillLight = new THREE.PointLight(0xffffff, 58, 13, 2);
fillLight.position.set(0.5, 4.3, 3.7);
scene.add(fillLight);

function addSoftbox(
  name: string,
  position: THREE.Vector3,
  rotation: THREE.Euler,
  scale: THREE.Vector3,
  color: number,
) {
  const softbox = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  softbox.name = name;
  softbox.position.copy(position);
  softbox.rotation.copy(rotation);
  softbox.scale.copy(scale);
  scene.add(softbox);
}

addSoftbox(
  "visible-key-softbox",
  new THREE.Vector3(-3.7, 4.1, 1.6),
  new THREE.Euler(-0.72, -0.46, -0.16),
  new THREE.Vector3(2.7, 1.05, 1),
  0xffffff,
);
addSoftbox(
  "visible-rim-softbox",
  new THREE.Vector3(4.3, 3.3, -1.9),
  new THREE.Euler(-0.45, 0.66, 0.12),
  new THREE.Vector3(1.8, 0.85, 1),
  0xbdd7ff,
);

const sphereGeometry = new THREE.SphereGeometry(0.72, 96, 64);
const sampleData = [
  {
    label: "METAL",
    x: -4,
    material: new THREE.MeshStandardMaterial({
      color: 0xc9ced4,
      metalness: 1,
      roughness: 0.16,
      envMapIntensity: 1.45,
    }),
  },
  {
    label: "GLASS",
    x: -2,
    material: new THREE.MeshPhysicalMaterial({
      color: 0xc7efff,
      metalness: 0,
      roughness: 0.01,
      transmission: 0.88,
      thickness: 0.9,
      ior: 1.48,
      transparent: true,
      opacity: 0.42,
      envMapIntensity: 1.7,
    }),
  },
  {
    label: "RUBBER",
    x: 0,
    material: new THREE.MeshStandardMaterial({
      color: 0x151719,
      metalness: 0,
      roughness: 0.94,
      envMapIntensity: 0.25,
    }),
  },
  {
    label: "EMISSIVE",
    x: 2,
    material: new THREE.MeshStandardMaterial({
      color: 0x210c05,
      emissive: 0xff6a19,
      emissiveIntensity: 2.8,
      metalness: 0,
      roughness: 0.32,
    }),
  },
  {
    label: "CLEARCOAT",
    x: 4,
    material: new THREE.MeshPhysicalMaterial({
      color: 0x9b1832,
      metalness: 0,
      roughness: 0.34,
      clearcoat: 1,
      clearcoatRoughness: 0.045,
      envMapIntensity: 1.55,
    }),
  },
];

function makeLabelTexture(label: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Unable to create label canvas");
  }

  ctx.fillStyle = "#15181d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#d7d9dc";
  ctx.lineWidth = 5;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.fillStyle = "#f1f2f3";
  ctx.font = "700 54px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 3);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

for (const sample of sampleData) {
  const sphere = new THREE.Mesh(sphereGeometry, sample.material);
  sphere.position.set(sample.x, 0.92, 0);
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  scene.add(sphere);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.86, 0.96, 0.18, 48),
    new THREE.MeshStandardMaterial({
      color: 0x24282e,
      metalness: 0.2,
      roughness: 0.52,
      envMapIntensity: 0.8,
    }),
  );
  base.position.set(sample.x, 0.09, 0);
  base.castShadow = true;
  base.receiveShadow = true;
  scene.add(base);

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.34, 0.42),
    new THREE.MeshBasicMaterial({
      map: makeLabelTexture(sample.label),
      toneMapped: false,
    }),
  );
  label.position.set(sample.x, 0.28, 1.0);
  label.rotation.x = -0.18;
  scene.add(label);

  if (sample.label === "EMISSIVE") {
    const glow = new THREE.PointLight(0xff6a19, 5.5, 3.8, 2);
    glow.position.set(sample.x, 1.05, 0.2);
    scene.add(glow);
  }
}

const reflectionStrip = new THREE.Mesh(
  new THREE.PlaneGeometry(9.8, 0.06),
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
  }),
);
reflectionStrip.position.set(0, 2.45, -3.38);
scene.add(reflectionStrip);

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", onResize);

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
