import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

type PlanetConfig = {
  name: string;
  radius: number;
  orbitRadius: number;
  speed: number;
  phase: number;
  color: THREE.ColorRepresentation;
  roughness: number;
  metalness?: number;
};

type Planet = {
  config: PlanetConfig;
  pivot: THREE.Group;
  mesh: THREE.Mesh;
  label: HTMLDivElement;
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app container");
}

const styles = document.createElement("style");
styles.textContent = `
  * {
    box-sizing: border-box;
  }

  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #02040b;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .scene {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .label-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .planet-label {
    position: absolute;
    min-width: 56px;
    padding: 3px 7px;
    border: 1px solid rgba(214, 226, 255, 0.42);
    border-radius: 6px;
    background: rgba(7, 12, 25, 0.74);
    color: #f4f8ff;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: 0;
    text-align: center;
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9);
    transform: translate(-50%, -130%);
    white-space: nowrap;
  }

  .title {
    position: absolute;
    left: 18px;
    top: 16px;
    z-index: 2;
    color: rgba(244, 248, 255, 0.92);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0;
    text-shadow: 0 1px 10px rgba(0, 0, 0, 0.85);
  }
`;
document.head.appendChild(styles);

const shell = document.createElement("div");
shell.className = "scene";
app.appendChild(shell);

const title = document.createElement("div");
title.className = "title";
title.textContent = "Procedural Solar System";
shell.appendChild(title);

const labelLayer = document.createElement("div");
labelLayer.className = "label-layer";
shell.appendChild(labelLayer);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040b);
scene.fog = new THREE.Fog(0x02040b, 70, 170);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 80, 92);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
shell.prepend(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 40;
controls.maxDistance = 155;
controls.target.set(0, 0, 0);
controls.update();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.25,
  0.72,
  0.18,
);
composer.addPass(bloomPass);

const ambientLight = new THREE.AmbientLight(0x26314f, 1.2);
scene.add(ambientLight);

const sunLight = new THREE.PointLight(0xffdf8f, 5200, 230, 1.25);
sunLight.position.set(0, 0, 0);
scene.add(sunLight);

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(4.4, 96, 64),
  new THREE.MeshBasicMaterial({ color: 0xffc44d }),
);
scene.add(sun);

const sunHalo = new THREE.Mesh(
  new THREE.SphereGeometry(7.1, 96, 64),
  new THREE.MeshBasicMaterial({
    color: 0xff8a24,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
scene.add(sunHalo);

const planetsConfig: PlanetConfig[] = [
  { name: "Aster", radius: 0.86, orbitRadius: 10.5, speed: 0.74, phase: 5.0, color: 0x9ec7ff, roughness: 0.48 },
  { name: "Vesta", radius: 1.2, orbitRadius: 16.2, speed: 0.52, phase: 2.5, color: 0xd9a066, roughness: 0.74 },
  { name: "Maris", radius: 1.42, orbitRadius: 23.4, speed: 0.38, phase: 0.75, color: 0x5eb67b, roughness: 0.56 },
  { name: "Cinder", radius: 1.05, orbitRadius: 31.5, speed: 0.29, phase: 4.4, color: 0xc45c43, roughness: 0.82 },
  { name: "Orion", radius: 2.1, orbitRadius: 41.8, speed: 0.19, phase: 0.0, color: 0xd7bd78, roughness: 0.62 },
  { name: "Nereid", radius: 1.65, orbitRadius: 54.0, speed: 0.13, phase: 3.15, color: 0x65c5dc, roughness: 0.44, metalness: 0.08 },
];

const planets: Planet[] = planetsConfig.map((config) => {
  const pivot = new THREE.Group();
  scene.add(pivot);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(config.radius, 48, 32),
    new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: config.roughness,
      metalness: config.metalness ?? 0,
    }),
  );
  mesh.position.x = config.orbitRadius;
  pivot.add(mesh);

  const label = document.createElement("div");
  label.className = "planet-label";
  label.textContent = config.name;
  labelLayer.appendChild(label);

  return { config, pivot, mesh, label };
});

const orbitMaterial = new THREE.LineBasicMaterial({
  color: 0x7893c4,
  transparent: true,
  opacity: 0.34,
});

for (const { orbitRadius } of planetsConfig) {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index <= 192; index += 1) {
    const angle = (index / 192) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius));
  }

  const orbit = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), orbitMaterial);
  scene.add(orbit);
}

const starsGeometry = new THREE.BufferGeometry();
const starPositions: number[] = [];
for (let index = 0; index < 900; index += 1) {
  const radius = 95 + Math.random() * 90;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
  starPositions.push(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}
starsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
const stars = new THREE.Points(
  starsGeometry,
  new THREE.PointsMaterial({
    color: 0xd7e4ff,
    size: 0.34,
    transparent: true,
    opacity: 0.78,
    sizeAttenuation: true,
  }),
);
scene.add(stars);

const labelPosition = new THREE.Vector3();
const clock = new THREE.Clock();

function updateLabels() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  for (const planet of planets) {
    planet.mesh.getWorldPosition(labelPosition);
    labelPosition.y += planet.config.radius + 1.1;
    labelPosition.project(camera);

    const visible = labelPosition.z < 1;
    planet.label.style.display = visible ? "block" : "none";
    planet.label.style.left = `${((labelPosition.x + 1) / 2) * width}px`;
    planet.label.style.top = `${((-labelPosition.y + 1) / 2) * height}px`;
  }
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
  bloomPass.setSize(width, height);
}

window.addEventListener("resize", resize);

function animate() {
  const elapsed = clock.getElapsedTime();

  sun.rotation.y = elapsed * 0.12;
  sunHalo.rotation.y = -elapsed * 0.06;
  sunHalo.scale.setScalar(1 + Math.sin(elapsed * 2.2) * 0.035);
  stars.rotation.y = elapsed * 0.008;

  for (const planet of planets) {
    planet.pivot.rotation.y = planet.config.phase + elapsed * planet.config.speed;
    planet.mesh.rotation.y = elapsed * (0.45 + planet.config.speed);
  }

  controls.update();
  composer.render();
  updateLabels();
}

renderer.setAnimationLoop(animate);
