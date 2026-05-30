import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

type PlanetSpec = {
  name: string;
  radius: number;
  orbitRadius: number;
  orbitSpeed: number;
  rotationSpeed: number;
  color: number;
  startAngle: number;
};

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root element.");
}

const styles = document.createElement("style");
styles.textContent = `
  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #02030a;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  canvas {
    display: block;
  }

  .labels {
    position: fixed;
    inset: 0;
    pointer-events: none;
  }

  .planet-label {
    min-width: 58px;
    padding: 4px 8px;
    border: 1px solid rgba(255, 255, 255, 0.38);
    border-radius: 4px;
    background: rgba(4, 8, 20, 0.76);
    color: #f7fbff;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.15;
    text-align: center;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    white-space: nowrap;
  }
`;
document.head.appendChild(styles);

const width = root.clientWidth || window.innerWidth;
const height = root.clientHeight || window.innerHeight;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02030a);

const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 320);
camera.position.set(0, 48, 74);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(width, height);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
root.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(width, height);
labelRenderer.domElement.className = "labels";
root.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.22;
controls.minDistance = 34;
controls.maxDistance = 145;
controls.maxPolarAngle = Math.PI * 0.48;
controls.update();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(width, height),
  1.55,
  0.82,
  0.16,
);
composer.addPass(bloomPass);

const ambientLight = new THREE.AmbientLight(0x3f5275, 0.42);
scene.add(ambientLight);

const sunLight = new THREE.PointLight(0xffe0a8, 7200, 190, 1.55);
scene.add(sunLight);

const sunGroup = new THREE.Group();
scene.add(sunGroup);

const sunGeometry = new THREE.SphereGeometry(4.8, 64, 64);
const sunMaterial = new THREE.MeshBasicMaterial({
  color: 0xffb22e,
});
const sun = new THREE.Mesh(sunGeometry, sunMaterial);
sunGroup.add(sun);

const sunHalo = new THREE.Mesh(
  new THREE.SphereGeometry(7.1, 48, 48),
  new THREE.MeshBasicMaterial({
    color: 0xff8a1d,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
sunHalo.scale.set(1.18, 1.18, 1.18);
sunGroup.add(sunHalo);

const coronaTexture = createCoronaTexture();
const corona = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: coronaTexture,
    color: 0xffc35a,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
corona.scale.set(23, 23, 1);
sunGroup.add(corona);

const planets: PlanetSpec[] = [
  { name: "Aster", radius: 0.85, orbitRadius: 10, orbitSpeed: 0.76, rotationSpeed: 1.6, color: 0x9bc7ff, startAngle: 0.15 },
  { name: "Vela", radius: 1.12, orbitRadius: 15.2, orbitSpeed: 0.52, rotationSpeed: 1.3, color: 0xf0a35e, startAngle: 1.35 },
  { name: "Orion", radius: 1.28, orbitRadius: 21.5, orbitSpeed: 0.37, rotationSpeed: 1.1, color: 0x5bd08a, startAngle: 2.25 },
  { name: "Lyra", radius: 0.95, orbitRadius: 28.5, orbitSpeed: 0.27, rotationSpeed: 1.8, color: 0xdc6659, startAngle: 3.1 },
  { name: "Nereid", radius: 1.78, orbitRadius: 37.2, orbitSpeed: 0.19, rotationSpeed: 0.8, color: 0x8aa1ff, startAngle: 4.25 },
  { name: "Umbra", radius: 1.45, orbitRadius: 48, orbitSpeed: 0.13, rotationSpeed: 0.68, color: 0xd3d6b7, startAngle: 5.15 },
];

const planetPivots: Array<{
  pivot: THREE.Group;
  mesh: THREE.Mesh;
  spec: PlanetSpec;
}> = [];

const orbitMaterial = new THREE.LineBasicMaterial({
  color: 0x456b90,
  transparent: true,
  opacity: 0.42,
});

for (const spec of planets) {
  const orbit = createOrbit(spec.orbitRadius, orbitMaterial);
  scene.add(orbit);

  const pivot = new THREE.Group();
  pivot.rotation.y = spec.startAngle;
  scene.add(pivot);

  const planet = createPlanet(spec);
  planet.position.x = spec.orbitRadius;
  pivot.add(planet);

  if (spec.name === "Nereid") {
    const ring = createPlanetRing(spec.radius);
    planet.add(ring);
  }

  const labelElement = document.createElement("div");
  labelElement.className = "planet-label";
  labelElement.textContent = spec.name;
  const label = new CSS2DObject(labelElement);
  label.position.set(0, spec.radius + 1.25, 0);
  planet.add(label);

  planetPivots.push({ pivot, mesh: planet, spec });
}

scene.add(createStarField());

const clock = new THREE.Clock();

function animate(): void {
  const elapsed = clock.getElapsedTime();

  sun.rotation.y += 0.004;
  sunHalo.scale.setScalar(1.14 + Math.sin(elapsed * 1.7) * 0.035);
  corona.material.rotation = elapsed * 0.04;

  for (const item of planetPivots) {
    item.pivot.rotation.y += item.spec.orbitSpeed * 0.0038;
    item.mesh.rotation.y += item.spec.rotationSpeed * 0.01;
  }

  controls.update();
  composer.render();
  labelRenderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
  const nextWidth = root.clientWidth || window.innerWidth;
  const nextHeight = root.clientHeight || window.innerHeight;

  camera.aspect = nextWidth / nextHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(nextWidth, nextHeight);
  composer.setSize(nextWidth, nextHeight);
  labelRenderer.setSize(nextWidth, nextHeight);
});

function createPlanet(spec: PlanetSpec): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(spec.radius, 40, 40);
  const material = new THREE.MeshStandardMaterial({
    color: spec.color,
    roughness: 0.62,
    metalness: 0.04,
    emissive: new THREE.Color(spec.color).multiplyScalar(0.08),
  });
  const planet = new THREE.Mesh(geometry, material);
  planet.castShadow = false;
  planet.receiveShadow = false;
  return planet;
}

function createOrbit(radius: number, material: THREE.LineBasicMaterial): THREE.LineLoop {
  const points: THREE.Vector3[] = [];
  const segments = 192;

  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }

  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material);
}

function createPlanetRing(radius: number): THREE.Mesh {
  const geometry = new THREE.RingGeometry(radius * 1.55, radius * 2.25, 96);
  const material = new THREE.MeshBasicMaterial({
    color: 0xb9c3ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.55,
  });
  const ring = new THREE.Mesh(geometry, material);
  ring.rotation.x = Math.PI * 0.55;
  return ring;
}

function createStarField(): THREE.Points {
  const starCount = 850;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);

  for (let index = 0; index < starCount; index += 1) {
    const radius = THREE.MathUtils.randFloat(82, 150);
    const theta = THREE.MathUtils.randFloat(0, Math.PI * 2);
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    const offset = index * 3;

    positions[offset] = radius * Math.sin(phi) * Math.cos(theta);
    positions[offset + 1] = radius * Math.cos(phi) * 0.62;
    positions[offset + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const tint = THREE.MathUtils.randFloat(0.72, 1);
    colors[offset] = tint;
    colors[offset + 1] = tint * THREE.MathUtils.randFloat(0.82, 0.95);
    colors[offset + 2] = 1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    }),
  );
}

function createCoronaTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to create corona texture.");
  }

  const gradient = context.createRadialGradient(128, 128, 18, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255, 248, 190, 1)");
  gradient.addColorStop(0.24, "rgba(255, 178, 54, 0.72)");
  gradient.addColorStop(0.48, "rgba(255, 96, 18, 0.24)");
  gradient.addColorStop(1, "rgba(255, 96, 18, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
