import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/addons/renderers/CSS2DRenderer.js";

// ---------------------------------------------------------------------------
// Mount points
// ---------------------------------------------------------------------------
const root = document.querySelector<HTMLElement>("#app")!;
root.innerHTML = "";
root.style.cssText =
  "position:fixed;inset:0;margin:0;background:#05060a;overflow:hidden;";

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.style.cssText = "position:absolute;inset:0;";
root.appendChild(renderer.domElement);

// Label renderer (HTML overlay) — gives crisp, always-readable planet labels.
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.cssText =
  "position:absolute;inset:0;pointer-events:none;";
root.appendChild(labelRenderer.domElement);

// ---------------------------------------------------------------------------
// Scene & camera
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  3000,
);
// Framed to take in the whole system (outermost orbit ~68 units).
camera.position.set(0, 70, 150);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);
controls.minDistance = 25;
controls.maxDistance = 800;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;

// ---------------------------------------------------------------------------
// Starfield backdrop
// ---------------------------------------------------------------------------
{
  const count = 2500;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Distribute on a large sphere shell so stars surround the system.
    const r = 600 + Math.random() * 600;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.4,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
  });
  scene.add(new THREE.Points(geo, mat));
}

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------
// The sun is the light source for the planets.
const sunLight = new THREE.PointLight(0xfff2cc, 6000, 0, 2);
scene.add(sunLight);
// Gentle ambient so the night sides aren't pure black.
scene.add(new THREE.AmbientLight(0x223355, 0.6));

// ---------------------------------------------------------------------------
// Sun
// ---------------------------------------------------------------------------
const SUN_RADIUS = 6;
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_RADIUS, 64, 64),
  // Bright base color so the bloom pass picks it up strongly.
  new THREE.MeshBasicMaterial({ color: 0xffcf66 }),
);
scene.add(sun);

// Soft additive halo around the sun to enhance the glow read.
{
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_RADIUS * 1.35, 32, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffaa33,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  sun.add(halo);
}

function makeLabel(text: string, color = "#ffffff"): CSS2DObject {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = [
    "font-family:'Segoe UI',system-ui,sans-serif",
    "font-size:13px",
    "font-weight:600",
    "letter-spacing:0.04em",
    `color:${color}`,
    "padding:2px 8px",
    "border-radius:6px",
    "background:rgba(8,10,18,0.72)",
    "border:1px solid rgba(255,255,255,0.18)",
    "white-space:nowrap",
    "text-shadow:0 1px 3px rgba(0,0,0,0.9)",
    "user-select:none",
  ].join(";");
  return new CSS2DObject(el);
}

// Sun label
{
  const sunLabel = makeLabel("Sun", "#ffd98a");
  sunLabel.position.set(0, SUN_RADIUS + 2.5, 0);
  sun.add(sunLabel);
}

// ---------------------------------------------------------------------------
// Planets
// ---------------------------------------------------------------------------
interface PlanetDef {
  name: string;
  radius: number; // planet size
  distance: number; // orbital radius
  speed: number; // orbital angular speed (rad/s)
  color: number;
  spin: number; // self-rotation speed
  startAngle: number;
}

// Six planets — distances and speeds clearly differ (inner = closer & faster).
const PLANETS: PlanetDef[] = [
  { name: "Mercanis", radius: 1.0, distance: 14, speed: 0.85, color: 0xb7a99a, spin: 0.8, startAngle: 0.3 },
  { name: "Veturia", radius: 1.7, distance: 21, speed: 0.62, color: 0xd9a066, spin: 0.5, startAngle: 1.9 },
  { name: "Terrava", radius: 1.9, distance: 29, speed: 0.48, color: 0x3a82c4, spin: 1.0, startAngle: 3.4 },
  { name: "Rubex", radius: 1.4, distance: 38, speed: 0.36, color: 0xc1502e, spin: 0.9, startAngle: 5.1 },
  { name: "Goliath", radius: 3.6, distance: 52, speed: 0.22, color: 0xcaa472, spin: 1.4, startAngle: 0.9 },
  { name: "Cyanthe", radius: 2.9, distance: 68, speed: 0.14, color: 0x6fd0d8, spin: 1.2, startAngle: 2.6 },
];

interface Planet {
  def: PlanetDef;
  pivot: THREE.Object3D; // rotates to create orbital motion
  mesh: THREE.Mesh;
  angle: number;
}

const planets: Planet[] = [];

function hexToCss(hex: number): string {
  return "#" + hex.toString(16).padStart(6, "0");
}

for (const def of PLANETS) {
  // Orbit ring to make differing distances obvious.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(def.distance - 0.06, def.distance + 0.06, 160),
    new THREE.MeshBasicMaterial({
      color: 0x5566aa,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);

  // Pivot at the system center; planet sits out at `distance`.
  const pivot = new THREE.Object3D();
  scene.add(pivot);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(def.radius, 48, 48),
    new THREE.MeshStandardMaterial({
      color: def.color,
      roughness: 0.85,
      metalness: 0.1,
    }),
  );
  mesh.position.set(def.distance, 0, 0);
  pivot.add(mesh);

  // Give Goliath a ring system for flavor.
  if (def.name === "Goliath") {
    const planetRing = new THREE.Mesh(
      new THREE.RingGeometry(def.radius * 1.5, def.radius * 2.4, 64),
      new THREE.MeshBasicMaterial({
        color: 0xd8c79a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
      }),
    );
    planetRing.rotation.x = -Math.PI / 2.2;
    mesh.add(planetRing);
  }

  // Label floats above each planet.
  const label = makeLabel(def.name, hexToCss(def.color));
  label.position.set(0, def.radius + 2.2, 0);
  mesh.add(label);

  planets.push({ def, pivot, mesh, angle: def.startAngle });
}

// ---------------------------------------------------------------------------
// Post-processing: bloom on the sun
// ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.9, // strength
  0.6, // radius
  0.85, // threshold — only the very bright sun blooms
);
composer.addPass(bloom);

// ---------------------------------------------------------------------------
// Resize handling
// ---------------------------------------------------------------------------
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  labelRenderer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener("resize", onResize);

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();

function animate() {
  const dt = clock.getDelta();

  sun.rotation.y += dt * 0.15;

  for (const p of planets) {
    p.angle += p.def.speed * dt;
    p.pivot.rotation.y = p.angle;
    p.mesh.rotation.y += p.def.spin * dt;
  }

  controls.update();
  composer.render();
  labelRenderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
