import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  CSS2DRenderer,
  CSS2DObject,
} from 'three/examples/jsm/renderers/CSS2DRenderer.js';

// ---------------------------------------------------------------------------
// Renderer setup
// ---------------------------------------------------------------------------
const app = document.getElementById('app') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

// Label renderer (HTML overlay) so planet labels stay crisp and readable.
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
app.appendChild(labelRenderer.domElement);

// ---------------------------------------------------------------------------
// Scene & camera
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05050a);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  2000,
);
// Frame the whole system from an elevated 3/4 angle.
camera.position.set(0, 70, 150);

const controls = new OrbitControls(camera, labelRenderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 30;
controls.maxDistance = 600;
controls.target.set(0, 0, 0);

// ---------------------------------------------------------------------------
// Starfield backdrop
// ---------------------------------------------------------------------------
function createStarfield(count: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 600 + Math.random() * 600;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
  });
  return new THREE.Points(geom, mat);
}
scene.add(createStarfield(2500));

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------
// The sun is the primary light source; a faint ambient keeps night sides visible.
const sunLight = new THREE.PointLight(0xffffff, 4.0, 0, 0.6);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x404060, 0.6));

// ---------------------------------------------------------------------------
// Sun (bright emissive sphere that drives the bloom)
// ---------------------------------------------------------------------------
const SUN_RADIUS = 12;
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_RADIUS, 64, 64),
  new THREE.MeshBasicMaterial({ color: 0xffdd66 }),
);
scene.add(sun);

// Soft additive glow halo around the sun.
const glow = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_RADIUS * 1.4, 64, 64),
  new THREE.MeshBasicMaterial({
    color: 0xffaa33,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  }),
);
sun.add(glow);

function makeLabel(text: string, className: string): CSS2DObject {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  return new CSS2DObject(div);
}

const sunLabel = makeLabel('Sun', 'label label-sun');
sunLabel.position.set(0, SUN_RADIUS + 4, 0);
sun.add(sunLabel);

// ---------------------------------------------------------------------------
// Planets
// ---------------------------------------------------------------------------
interface PlanetSpec {
  name: string;
  radius: number;
  distance: number;
  color: number;
  speed: number; // angular velocity (radians / second)
}

// Six planets with clearly different orbital radii and speeds (inner = faster).
const PLANET_SPECS: PlanetSpec[] = [
  { name: 'Mercury', radius: 1.6, distance: 24, color: 0xb0a08c, speed: 0.95 },
  { name: 'Venus', radius: 2.6, distance: 36, color: 0xe6b873, speed: 0.72 },
  { name: 'Earth', radius: 2.8, distance: 50, color: 0x3a78d0, speed: 0.55 },
  { name: 'Mars', radius: 2.2, distance: 64, color: 0xc1502e, speed: 0.42 },
  { name: 'Jupiter', radius: 6.5, distance: 86, color: 0xd9a066, speed: 0.27 },
  { name: 'Saturn', radius: 5.6, distance: 110, color: 0xe0cd9a, speed: 0.19 },
];

interface Planet {
  spec: PlanetSpec;
  pivot: THREE.Object3D; // rotates to drive the orbit
  mesh: THREE.Mesh;
  angle: number;
}

const planets: Planet[] = [];

function createOrbitRing(distance: number): THREE.LineLoop {
  const segments = 128;
  const positions = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions[i * 3 + 0] = Math.cos(a) * distance;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = Math.sin(a) * distance;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0x335577,
    transparent: true,
    opacity: 0.45,
  });
  return new THREE.LineLoop(geom, mat);
}

for (const spec of PLANET_SPECS) {
  // Faint orbit guide ring makes the differing distances obvious.
  scene.add(createOrbitRing(spec.distance));

  const pivot = new THREE.Object3D();
  scene.add(pivot);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(spec.radius, 48, 48),
    new THREE.MeshStandardMaterial({
      color: spec.color,
      roughness: 0.85,
      metalness: 0.05,
    }),
  );
  mesh.position.set(spec.distance, 0, 0);
  pivot.add(mesh);

  // Saturn gets a simple ring for flavor.
  if (spec.name === 'Saturn') {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(spec.radius * 1.4, spec.radius * 2.3, 64),
      new THREE.MeshBasicMaterial({
        color: 0xcbb888,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
      }),
    );
    ring.rotation.x = Math.PI / 2.2;
    mesh.add(ring);
  }

  const label = makeLabel(spec.name, 'label');
  label.position.set(0, spec.radius + 3, 0);
  mesh.add(label);

  const startAngle = Math.random() * Math.PI * 2;
  pivot.rotation.y = startAngle;

  planets.push({ spec, pivot, mesh, angle: startAngle });
}

// ---------------------------------------------------------------------------
// Post-processing: bloom focused on the bright sun
// ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.4, // strength
  0.6, // radius
  0.85, // threshold – only very bright pixels (the sun) bloom
);
composer.addPass(bloomPass);

// ---------------------------------------------------------------------------
// Resize handling
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  composer.setSize(w, h);
});

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();

function animate(): void {
  const dt = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // Orbit each planet at its own speed.
  for (const p of planets) {
    p.angle += p.spec.speed * dt;
    p.pivot.rotation.y = p.angle;
    p.mesh.rotation.y += dt * 0.5; // gentle self-spin
  }

  // Slow sun rotation and subtle glow pulse.
  sun.rotation.y += dt * 0.05;
  const pulse = 0.25 + Math.sin(elapsed * 1.5) * 0.04;
  (glow.material as THREE.MeshBasicMaterial).opacity = pulse;

  controls.update();
  composer.render();
  labelRenderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
