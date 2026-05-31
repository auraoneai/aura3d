import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

type PlanetConfig = {
  name: string;
  radius: number;
  size: number;
  speed: number;
  color: number;
  tilt: number;
  initialAngle: number;
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.style.background = "#02040b";
app.style.width = "100vw";
app.style.height = "100vh";

const style = document.createElement("style");
style.textContent = `
  .planet-label {
    color: #f7fbff;
    font: 700 13px/1.1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 4px 7px;
    border: 1px solid rgba(176, 213, 255, 0.58);
    border-radius: 6px;
    background: rgba(5, 11, 24, 0.72);
    box-shadow: 0 0 12px rgba(102, 177, 255, 0.35);
    text-shadow: 0 1px 2px #000;
    white-space: nowrap;
    pointer-events: none;
  }

  .sun-label {
    color: #fff7d2;
    border-color: rgba(255, 218, 95, 0.7);
    background: rgba(44, 20, 0, 0.62);
    box-shadow: 0 0 16px rgba(255, 174, 0, 0.62);
  }
`;
document.head.append(style);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040b);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 700);
camera.position.set(0, 58, 112);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.append(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = "fixed";
labelRenderer.domElement.style.inset = "0";
labelRenderer.domElement.style.pointerEvents = "none";
app.append(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 32;
controls.maxDistance = 190;
controls.target.set(0, 0, 0);

scene.add(new THREE.AmbientLight(0x344466, 0.55));

const sunLight = new THREE.PointLight(0xffd77a, 5400, 230, 1.45);
sunLight.position.set(0, 0, 0);
scene.add(sunLight);

function makeLabel(text: string, extraClass = "") {
  const label = document.createElement("div");
  label.className = `planet-label ${extraClass}`.trim();
  label.textContent = text;
  return new CSS2DObject(label);
}

function makeGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not create glow texture");
  }

  const gradient = ctx.createRadialGradient(128, 128, 12, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255, 247, 180, 0.92)");
  gradient.addColorStop(0.22, "rgba(255, 187, 45, 0.55)");
  gradient.addColorStop(0.55, "rgba(255, 103, 0, 0.20)");
  gradient.addColorStop(1, "rgba(255, 103, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(6.2, 96, 64),
  new THREE.MeshBasicMaterial({ color: 0xffc13b })
);
scene.add(sun);

const innerSun = new THREE.Mesh(
  new THREE.SphereGeometry(5.7, 96, 64),
  new THREE.MeshBasicMaterial({ color: 0xfff0a8 })
);
scene.add(innerSun);

const sunGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color: 0xffb13b,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
);
sunGlow.scale.set(28, 28, 1);
scene.add(sunGlow);

const sunLabel = makeLabel("SUN", "sun-label");
sunLabel.position.set(0, 8.8, 0);
sun.add(sunLabel);

const orbitMaterial = new THREE.LineBasicMaterial({
  color: 0x6c819e,
  transparent: true,
  opacity: 0.44,
});

const planetConfigs: PlanetConfig[] = [
  { name: "Mercury", radius: 13, size: 1.35, speed: 0.72, color: 0xb8aaa0, tilt: 0.04, initialAngle: 0.35 },
  { name: "Venus", radius: 20, size: 2.15, speed: 0.48, color: 0xdca85b, tilt: -0.03, initialAngle: 2.1 },
  { name: "Terra", radius: 29, size: 2.35, speed: 0.34, color: 0x3f8dde, tilt: 0.18, initialAngle: 4.15 },
  { name: "Ares", radius: 39, size: 1.85, speed: 0.25, color: 0xc65b32, tilt: -0.09, initialAngle: 1.25 },
  { name: "Jovia", radius: 52, size: 4.6, speed: 0.16, color: 0xd7b38a, tilt: 0.1, initialAngle: 3.5 },
  { name: "Cyane", radius: 68, size: 3.55, speed: 0.11, color: 0x62c7df, tilt: -0.16, initialAngle: 5.2 },
];

const planets = planetConfigs.map((config) => {
  const pivot = new THREE.Object3D();
  pivot.rotation.y = config.initialAngle;
  pivot.rotation.x = config.tilt;
  scene.add(pivot);

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(config.size, 48, 32),
    new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.62,
      metalness: 0.05,
      emissive: new THREE.Color(config.color).multiplyScalar(0.035),
    })
  );
  planet.position.set(config.radius, 0, 0);
  pivot.add(planet);

  const label = makeLabel(config.name);
  label.position.set(0, config.size + 2.2, 0);
  planet.add(label);

  const orbitPoints = new THREE.Path().absarc(0, 0, config.radius, 0, Math.PI * 2).getPoints(192);
  const orbitGeometry = new THREE.BufferGeometry().setFromPoints(
    orbitPoints.map((point) => new THREE.Vector3(point.x, 0, point.y))
  );
  const orbit = new THREE.LineLoop(orbitGeometry, orbitMaterial);
  orbit.rotation.x = config.tilt;
  scene.add(orbit);

  return { config, pivot, planet };
});

const ringPlanet = planets[4].planet;
const ring = new THREE.Mesh(
  new THREE.RingGeometry(5.7, 7.7, 96),
  new THREE.MeshBasicMaterial({
    color: 0xf0d8b2,
    transparent: true,
    opacity: 0.52,
    side: THREE.DoubleSide,
  })
);
ring.rotation.x = Math.PI * 0.5;
ring.rotation.y = 0.22;
ringPlanet.add(ring);

const starGeometry = new THREE.BufferGeometry();
const starCount = 1200;
const starPositions = new Float32Array(starCount * 3);

for (let i = 0; i < starCount; i += 1) {
  const radius = 170 + Math.random() * 260;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
  starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = radius * Math.cos(phi);
  starPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
}

starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
scene.add(
  new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: 0xcad9ff,
      size: 0.72,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.86,
    })
  )
);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.35, 0.72, 0.08);
composer.addPass(bloomPass);

const clock = new THREE.Clock();

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
  labelRenderer.setSize(width, height);
}

window.addEventListener("resize", resize);

function animate() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;

  sun.rotation.y += delta * 0.12;
  innerSun.scale.setScalar(1 + Math.sin(elapsed * 2.1) * 0.035);
  sunGlow.material.opacity = 0.74 + Math.sin(elapsed * 1.8) * 0.11;

  for (const { config, pivot, planet } of planets) {
    pivot.rotation.y += delta * config.speed;
    planet.rotation.y += delta * (0.7 + config.speed);
  }

  controls.update();
  composer.render();
  labelRenderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
