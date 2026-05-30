import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

type PlanetConfig = {
  name: string;
  radius: number;
  distance: number;
  speed: number;
  phase: number;
  color: number;
  emissive?: number;
};

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app container');
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
    background: #02040a;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  canvas {
    display: block;
  }

  .planet-label {
    padding: 3px 8px;
    border: 1px solid rgba(255, 255, 255, 0.38);
    border-radius: 4px;
    background: rgba(6, 10, 20, 0.72);
    color: #f8fbff;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
    white-space: nowrap;
    pointer-events: none;
    transform: translateY(-10px);
  }
`;
document.head.appendChild(style);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040a);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 700);
camera.position.set(0, 128, 118);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'fixed';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
app.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 0, 0);
controls.minDistance = 36;
controls.maxDistance = 230;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.22;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.25,
  0.68,
  0.18,
);
composer.addPass(bloomPass);

const starGeometry = new THREE.BufferGeometry();
const starCount = 1100;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i += 1) {
  const radius = 125 + Math.random() * 250;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
  starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = radius * Math.cos(phi) * 0.72;
  starPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
scene.add(
  new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: 0xb9c8ff,
      size: 0.7,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.78,
    }),
  ),
);

const ambient = new THREE.HemisphereLight(0x5f7eff, 0x08050b, 0.35);
scene.add(ambient);

const sun = new THREE.Group();
scene.add(sun);

const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(7.5, 96, 48),
  new THREE.MeshBasicMaterial({ color: 0xffd36a }),
);
sun.add(sunMesh);

const sunCorona = new THREE.Mesh(
  new THREE.SphereGeometry(10.9, 96, 48),
  new THREE.MeshBasicMaterial({
    color: 0xff8f24,
    transparent: true,
    opacity: 0.26,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
sun.add(sunCorona);

const sunLight = new THREE.PointLight(0xffd28a, 5600, 260, 1.25);
sun.add(sunLight);

const sunLabel = createLabel('SUN');
sunLabel.position.set(0, 11.8, 0);
sun.add(sunLabel);

const planetConfigs: PlanetConfig[] = [
  { name: 'Mercury', radius: 1.25, distance: 16, speed: 0.86, phase: 0.4, color: 0xb9a48c },
  { name: 'Venus', radius: 1.85, distance: 25, speed: 0.63, phase: 2.1, color: 0xe6b668, emissive: 0x261402 },
  { name: 'Terra', radius: 2.05, distance: 36, speed: 0.48, phase: 4.8, color: 0x3d8fe0, emissive: 0x03101c },
  { name: 'Ares', radius: 1.65, distance: 49, speed: 0.35, phase: 1.2, color: 0xc85b36, emissive: 0x1b0500 },
  { name: 'Jovia', radius: 3.55, distance: 66, speed: 0.24, phase: 3.2, color: 0xd9a675, emissive: 0x160c05 },
  { name: 'Nereid', radius: 2.85, distance: 86, speed: 0.16, phase: 5.7, color: 0x73d2e7, emissive: 0x03161d },
];

const planetSystem = new THREE.Group();
scene.add(planetSystem);

const planets = planetConfigs.map((config) => {
  const pivot = new THREE.Group();
  pivot.rotation.y = config.phase;
  planetSystem.add(pivot);

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(config.radius, 48, 28),
    new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.58,
      metalness: 0.03,
      emissive: config.emissive ?? 0x000000,
      emissiveIntensity: config.emissive ? 0.18 : 0,
    }),
  );
  planet.position.set(config.distance, 0, 0);
  planet.castShadow = false;
  planet.receiveShadow = false;
  pivot.add(planet);

  const label = createLabel(config.name);
  label.position.set(0, config.radius + 2.0, 0);
  planet.add(label);

  const orbit = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(createOrbitPoints(config.distance)),
    new THREE.LineBasicMaterial({
      color: 0x6f83a8,
      transparent: true,
      opacity: 0.34,
    }),
  );
  orbit.rotation.x = -Math.PI / 2;
  scene.add(orbit);

  if (config.name === 'Jovia') {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(config.radius * 1.45, config.radius * 2.08, 96),
      new THREE.MeshBasicMaterial({
        color: 0xd7c29a,
        transparent: true,
        opacity: 0.48,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = Math.PI / 2.55;
    planet.add(ring);
  }

  return { config, pivot, planet };
});

function createLabel(text: string): CSS2DObject {
  const element = document.createElement('div');
  element.className = 'planet-label';
  element.textContent = text;
  return new CSS2DObject(element);
}

function createOrbitPoints(radius: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 192; i += 1) {
    const angle = (i / 192) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  return points;
}

const clock = new THREE.Clock();

function animate(): void {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;

  sunMesh.rotation.y += delta * 0.08;
  sunCorona.scale.setScalar(1 + Math.sin(elapsed * 1.8) * 0.035);

  for (const { config, pivot, planet } of planets) {
    pivot.rotation.y += delta * config.speed;
    planet.rotation.y += delta * (0.45 + config.speed);
  }

  controls.update();
  composer.render();
  labelRenderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
});
