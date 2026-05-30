import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app element');
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
    background: #111317;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  canvas {
    display: block;
  }
`;
document.head.appendChild(style);

const scene = new THREE.Scene();
scene.background = createStudioBackground();
scene.environment = createEnvironmentMap();

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 3.1, 8.7);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.75, 0);
controls.minDistance = 4.5;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.48;
controls.update();

buildStudio();
buildMaterialSpheres();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop((time) => {
  const seconds = time * 0.001;
  scene.traverse((object) => {
    if (object.userData.rotateSphere) {
      object.rotation.y = seconds * 0.22;
    }
  });

  controls.update();
  renderer.render(scene, camera);
});

function buildStudio() {
  scene.add(new THREE.HemisphereLight(0xddeeff, 0x1c1712, 1.2));

  const key = new THREE.DirectionalLight(0xffffff, 4.2);
  key.position.set(-3.5, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 18;
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  scene.add(key);

  const rim = new THREE.SpotLight(0xbfd6ff, 42, 16, Math.PI * 0.22, 0.45, 1);
  rim.position.set(4.6, 4.7, -3.8);
  rim.target.position.set(0, 0.7, 0);
  scene.add(rim, rim.target);

  const warmFill = new THREE.PointLight(0xffc18a, 18, 10, 2);
  warmFill.position.set(-4.6, 2.1, -1.8);
  scene.add(warmFill);

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x77716a,
    roughness: 0.55,
    metalness: 0,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(15, 9), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.03;
  floor.receiveShadow = true;
  scene.add(floor);

  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(15, 7),
    new THREE.MeshStandardMaterial({ color: 0x4b5159, roughness: 0.62 }),
  );
  backWall.position.set(0, 3.45, -4.2);
  backWall.receiveShadow = true;
  scene.add(backWall);

  addSoftbox('left softbox', [-5.3, 3.7, 0.2], [0, 1.08, 0], 0xffffff, 2.6, 1.25);
  addSoftbox('top softbox', [0, 5.15, 0.8], [Math.PI / 2, 0, 0], 0xf1f7ff, 4.4, 1.1);
  addSoftbox('right strip softbox', [5.1, 2.4, -1.25], [0, -1.12, 0], 0xffdfbc, 0.85, 2.7);
}

function buildMaterialSpheres() {
  const sphereGeometry = new THREE.SphereGeometry(0.72, 96, 64);
  const positions = [-3.7, -1.85, 0, 1.85, 3.7];

  const materials: Array<{ name: string; material: THREE.Material }> = [
    {
      name: 'Metal',
      material: new THREE.MeshPhysicalMaterial({
        color: 0xc8ced6,
        metalness: 1,
        roughness: 0.16,
        envMapIntensity: 1.8,
      }),
    },
    {
      name: 'Glass',
      material: new THREE.MeshPhysicalMaterial({
        color: 0xc4f1ff,
        metalness: 0,
        roughness: 0.02,
        transmission: 0.88,
        transparent: true,
        opacity: 0.42,
        ior: 1.45,
        thickness: 0.75,
        envMapIntensity: 2.2,
      }),
    },
    {
      name: 'Rubber',
      material: new THREE.MeshStandardMaterial({
        color: 0x151716,
        roughness: 0.94,
        metalness: 0,
      }),
    },
    {
      name: 'Emissive',
      material: new THREE.MeshStandardMaterial({
        color: 0x241119,
        emissive: 0xff386a,
        emissiveIntensity: 2.85,
        roughness: 0.38,
      }),
    },
    {
      name: 'Clearcoat',
      material: new THREE.MeshPhysicalMaterial({
        color: 0x155d56,
        metalness: 0,
        roughness: 0.34,
        clearcoat: 1,
        clearcoatRoughness: 0.035,
        envMapIntensity: 1.65,
      }),
    },
  ];

  materials.forEach(({ name, material }, index) => {
    const sphere = new THREE.Mesh(sphereGeometry, material);
    sphere.position.set(positions[index], 0.72, 0);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    sphere.userData.rotateSphere = true;
    scene.add(sphere);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.83, 0.94, 0.2, 64),
      new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.42, metalness: 0.05 }),
    );
    plinth.position.set(positions[index], 0.08, 0);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    scene.add(plinth);

    const label = createLabel(name);
    label.position.set(positions[index], 0.12, 0.94);
    scene.add(label);
  });

  const glow = new THREE.PointLight(0xff386a, 5.5, 4, 2);
  glow.position.set(1.85, 1.02, 0.25);
  scene.add(glow);
}

function addSoftbox(
  name: string,
  position: [number, number, number],
  rotation: [number, number, number],
  color: THREE.ColorRepresentation,
  width: number,
  height: number,
) {
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      color,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  panel.name = name;
  panel.position.set(...position);
  panel.rotation.set(...rotation);
  scene.add(panel);
}

function createLabel(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create label canvas');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(10, 12, 14, 0.78)';
  roundRect(context, 72, 28, 368, 72, 20);
  context.fill();
  context.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  context.lineWidth = 4;
  context.stroke();
  context.fillStyle = '#f4f2ec';
  context.font = '600 42px Inter, Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  sprite.scale.set(1.1, 0.28, 1);
  return sprite;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function createEnvironmentMap() {
  const sides = [
    ['#ffffff', '#6c7b8c', '#1e242c'],
    ['#ffe0b5', '#49515a', '#14171b'],
    ['#f8fbff', '#bac8d8', '#5b6672'],
    ['#1a1d21', '#3b3a34', '#746b5f'],
    ['#cfe8ff', '#5e6c7c', '#15191e'],
    ['#ffd9a8', '#4e565c', '#181a1d'],
  ];

  const canvases = sides.map((colors, index) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Could not create environment canvas');
    }

    const gradient = context.createLinearGradient(0, 0, 256, 256);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(0.48, colors[1]);
    gradient.addColorStop(1, colors[2]);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);

    context.fillStyle = index % 2 === 0 ? 'rgba(255, 255, 255, 0.78)' : 'rgba(255, 219, 171, 0.7)';
    context.fillRect(36, 38, 54, 178);
    context.fillStyle = 'rgba(255, 255, 255, 0.42)';
    context.fillRect(142, 32, 78, 36);
    context.fillStyle = 'rgba(0, 0, 0, 0.22)';
    context.fillRect(0, 206, 256, 50);
    return canvas;
  });

  const environment = new THREE.CubeTexture(canvases);
  environment.colorSpace = THREE.SRGBColorSpace;
  environment.needsUpdate = true;
  return environment;
}

function createStudioBackground() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 512;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create background canvas');
  }

  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#1e252d');
  gradient.addColorStop(0.52, '#363d43');
  gradient.addColorStop(1, '#141518');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}
