import "./style.css";

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = "";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030611);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 58, 78);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.className = "labels";
app.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, labelRenderer.domElement);
controls.enableDamping = true;
controls.minDistance = 24;
controls.maxDistance = 170;
controls.target.set(0, 0, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.35,
  0.72,
  0.18,
);
composer.addPass(bloomPass);

scene.add(new THREE.AmbientLight(0x5d6f98, 0.45));

const sunLight = new THREE.PointLight(0xffd38a, 5.5, 240, 1.3);
sunLight.position.set(0, 0, 0);
scene.add(sunLight);

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(5.2, 96, 64),
  new THREE.MeshBasicMaterial({ color: 0xffb32c }),
);
scene.add(sun);

const sunHalo = new THREE.Mesh(
  new THREE.SphereGeometry(7.2, 96, 64),
  new THREE.MeshBasicMaterial({
    color: 0xff7a18,
    transparent: true,
    opacity: 0.24,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
scene.add(sunHalo);

const sunLabel = createLabel("SUN");
sunLabel.position.set(0, 7.8, 0);
sun.add(sunLabel);

const planetData = [
  { name: "Mercuria", radius: 0.72, orbit: 11, speed: 0.9, color: 0xa7a194, start: 0.4 },
  { name: "Aurelia", radius: 1.05, orbit: 17, speed: 0.64, color: 0xd8aa66, start: 1.7 },
  { name: "Tellus", radius: 1.22, orbit: 25, speed: 0.48, color: 0x3e82d9, start: 2.9 },
  { name: "Vermis", radius: 0.92, orbit: 34, speed: 0.35, color: 0xc65a46, start: 4.2 },
  { name: "Jovia", radius: 2.45, orbit: 46, speed: 0.22, color: 0xd6b281, start: 5.1 },
  { name: "Caelus", radius: 1.85, orbit: 61, speed: 0.15, color: 0x78c8d9, start: 0.9 },
];

type Planet = {
  mesh: THREE.Mesh;
  pivot: THREE.Group;
  orbit: number;
  speed: number;
  start: number;
};

const planets: Planet[] = [];
const orbitMaterial = new THREE.LineBasicMaterial({ color: 0x48607c, transparent: true, opacity: 0.42 });

for (const planet of planetData) {
  const orbitPath = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      new THREE.EllipseCurve(0, 0, planet.orbit, planet.orbit, 0, Math.PI * 2, false, 0)
        .getPoints(192)
        .map((point) => new THREE.Vector3(point.x, 0, point.y)),
    ),
    orbitMaterial,
  );
  scene.add(orbitPath);

  const pivot = new THREE.Group();
  scene.add(pivot);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(planet.radius, 48, 32),
    new THREE.MeshStandardMaterial({
      color: planet.color,
      roughness: 0.58,
      metalness: 0.05,
      emissive: new THREE.Color(planet.color).multiplyScalar(0.08),
    }),
  );
  mesh.position.set(planet.orbit, 0, 0);
  pivot.add(mesh);

  const label = createLabel(planet.name);
  label.position.set(0, planet.radius + 1.35, 0);
  mesh.add(label);

  if (planet.name === "Jovia") {
    const rings = new THREE.Mesh(
      new THREE.RingGeometry(planet.radius * 1.45, planet.radius * 2.2, 96),
      new THREE.MeshBasicMaterial({
        color: 0xe8d0a0,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
      }),
    );
    rings.rotation.x = Math.PI * 0.5;
    mesh.add(rings);
  }

  planets.push({ mesh, pivot, orbit: planet.orbit, speed: planet.speed, start: planet.start });
}

const stars = createStarField();
scene.add(stars);

const clock = new THREE.Clock();

function animate() {
  const elapsed = clock.getElapsedTime();

  sun.rotation.y = elapsed * 0.12;
  sunHalo.scale.setScalar(1 + Math.sin(elapsed * 2.1) * 0.035);

  for (const planet of planets) {
    planet.pivot.rotation.y = planet.start + elapsed * planet.speed;
    planet.mesh.rotation.y = elapsed * (0.5 + planet.speed);
  }

  controls.update();
  composer.render();
  labelRenderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

function createLabel(text: string) {
  const element = document.createElement("div");
  element.className = "planet-label";
  element.textContent = text;
  return new CSS2DObject(element);
}

function createStarField() {
  const positions: number[] = [];
  for (let i = 0; i < 720; i += 1) {
    const radius = 95 + Math.random() * 170;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    positions.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi) * 0.65,
      radius * Math.sin(phi) * Math.sin(theta),
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xdde8ff,
      size: 0.42,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.72,
    }),
  );
}
