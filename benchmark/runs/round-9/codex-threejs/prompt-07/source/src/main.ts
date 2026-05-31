import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app mount point');
}

const style = document.createElement('style');
style.textContent = `
  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #111318;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  canvas {
    display: block;
  }

  .title {
    position: fixed;
    top: 18px;
    left: 20px;
    color: rgba(244, 247, 255, 0.92);
    font-size: 14px;
    line-height: 1.45;
    letter-spacing: 0;
    pointer-events: none;
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.55);
  }

  .title strong {
    display: block;
    font-size: 18px;
    font-weight: 700;
  }
`;
document.head.appendChild(style);

const label = document.createElement('div');
label.className = 'title';
label.innerHTML = '<strong>Material Lab</strong>metal / glass / rubber / emissive / clearcoat';
app.appendChild(label);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151820);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 3.2, 8.4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
const environment = pmremGenerator.fromScene(new RoomEnvironment(renderer), 0.05).texture;
scene.environment = environment;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);
controls.minDistance = 5;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.47;
controls.update();

const studio = new THREE.Group();
scene.add(studio);

const hemiLight = new THREE.HemisphereLight(0xdde7ff, 0x2c2f35, 1.25);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 4.2);
keyLight.position.set(-3.8, 7.5, 4.2);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -7;
keyLight.shadow.camera.right = 7;
keyLight.shadow.camera.top = 7;
keyLight.shadow.camera.bottom = -7;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 18;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x8eb8ff, 2.1);
rimLight.position.set(4.5, 4.5, -3.6);
scene.add(rimLight);

const warmFill = new THREE.PointLight(0xffd6a4, 36, 12, 2);
warmFill.position.set(3.5, 2.6, 3.2);
scene.add(warmFill);

function makeSoftbox(width: number, height: number, position: THREE.Vector3, rotation: THREE.Euler, color: number) {
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
      toneMapped: false,
    }),
  );
  plane.position.copy(position);
  plane.rotation.copy(rotation);
  studio.add(plane);
}

makeSoftbox(3.4, 1.15, new THREE.Vector3(-3.9, 4.4, 1.2), new THREE.Euler(-0.45, -0.78, -0.18), 0xffffff);
makeSoftbox(2.7, 0.9, new THREE.Vector3(3.7, 3.3, -1.2), new THREE.Euler(-0.35, 0.72, 0.12), 0xbfd5ff);
makeSoftbox(5.2, 0.42, new THREE.Vector3(0, 5.2, -1.9), new THREE.Euler(-Math.PI / 2.25, 0, 0), 0xffffff);

const floorTexture = createStudioFloorTexture();
floorTexture.colorSpace = THREE.SRGBColorSpace;
floorTexture.wrapS = THREE.RepeatWrapping;
floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(2.5, 2.5);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 9),
  new THREE.MeshStandardMaterial({
    color: 0x3b3d42,
    map: floorTexture,
    roughness: 0.58,
    metalness: 0.02,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const backWall = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 7),
  new THREE.MeshStandardMaterial({
    color: 0x20242d,
    roughness: 0.62,
    metalness: 0.0,
  }),
);
backWall.position.set(0, 3.5, -3.6);
backWall.receiveShadow = true;
scene.add(backWall);

const sphereGeometry = new THREE.SphereGeometry(0.82, 96, 64);
const sphereData: Array<{ name: string; x: number; material: THREE.Material; light?: THREE.PointLight }> = [
  {
    name: 'METAL',
    x: -4.0,
    material: new THREE.MeshStandardMaterial({
      color: 0xc9d1dc,
      metalness: 1.0,
      roughness: 0.16,
      envMapIntensity: 1.5,
    }),
  },
  {
    name: 'GLASS',
    x: -2.0,
    material: new THREE.MeshPhysicalMaterial({
      color: 0xc7f0ff,
      metalness: 0,
      roughness: 0.02,
      transmission: 0.92,
      thickness: 0.55,
      ior: 1.45,
      transparent: true,
      opacity: 0.52,
      envMapIntensity: 1.9,
    }),
  },
  {
    name: 'RUBBER',
    x: 0,
    material: new THREE.MeshStandardMaterial({
      color: 0x17191c,
      metalness: 0,
      roughness: 0.97,
      envMapIntensity: 0.18,
    }),
  },
  {
    name: 'EMISSIVE',
    x: 2.0,
    material: new THREE.MeshStandardMaterial({
      color: 0x092c34,
      emissive: 0x25f4ff,
      emissiveIntensity: 2.9,
      metalness: 0.05,
      roughness: 0.34,
    }),
    light: new THREE.PointLight(0x29eaff, 18, 4.2, 2),
  },
  {
    name: 'CLEARCOAT',
    x: 4.0,
    material: new THREE.MeshPhysicalMaterial({
      color: 0xef334b,
      metalness: 0,
      roughness: 0.33,
      clearcoat: 1,
      clearcoatRoughness: 0.035,
      envMapIntensity: 1.45,
    }),
  },
];

for (const item of sphereData) {
  const sphere = new THREE.Mesh(sphereGeometry, item.material);
  sphere.position.set(item.x, 0.86, 0);
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  sphere.name = item.name;
  scene.add(sphere);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.92, 1.02, 0.12, 64),
    new THREE.MeshStandardMaterial({ color: 0x2a2d34, metalness: 0.15, roughness: 0.5 }),
  );
  base.position.set(item.x, 0.06, 0);
  base.receiveShadow = true;
  base.castShadow = true;
  scene.add(base);

  const plaque = makePlaque(item.name);
  plaque.position.set(item.x, 0.08, 1.18);
  plaque.rotation.x = -Math.PI / 2;
  scene.add(plaque);

  if (item.light) {
    item.light.position.set(item.x, 1.08, 0.18);
    scene.add(item.light);
  }
}

const reflectionRail = new THREE.Mesh(
  new THREE.BoxGeometry(9.3, 0.08, 0.08),
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1.2,
    roughness: 0.2,
    toneMapped: false,
  }),
);
reflectionRail.position.set(0, 2.45, -1.25);
scene.add(reflectionRail);

function createStudioFloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create floor texture');
  }

  context.fillStyle = '#383b42';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  context.lineWidth = 2;

  for (let i = 0; i <= canvas.width; i += 64) {
    context.beginPath();
    context.moveTo(i, 0);
    context.lineTo(i, canvas.height);
    context.stroke();
    context.beginPath();
    context.moveTo(0, i);
    context.lineTo(canvas.width, i);
    context.stroke();
  }

  context.fillStyle = 'rgba(255, 255, 255, 0.045)';
  context.fillRect(0, 0, canvas.width, 18);
  context.fillRect(0, 0, 18, canvas.height);

  return new THREE.CanvasTexture(canvas);
}

function makePlaque(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create plaque texture');
  }

  context.fillStyle = '#16191f';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  context.lineWidth = 5;
  context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  context.fillStyle = '#eef3ff';
  context.font = '700 42px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.3),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
  );
  plaque.name = `${text} plaque`;
  return plaque;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onResize);

renderer.setAnimationLoop((time) => {
  const seconds = time * 0.001;
  studio.rotation.y = Math.sin(seconds * 0.18) * 0.025;
  controls.update();
  renderer.render(scene, camera);
});
