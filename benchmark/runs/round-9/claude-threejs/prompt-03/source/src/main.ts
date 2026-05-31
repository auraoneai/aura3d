import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const app = document.getElementById('app') as HTMLDivElement;
app.style.cssText = 'position:fixed;inset:0;margin:0;overflow:hidden;background:#000;';
document.body.style.margin = '0';

// --- Renderer -------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

// Label renderer (overlaid, non-interactive) so planet names stay readable.
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
app.appendChild(labelRenderer.domElement);

// --- Scene & camera -------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  2000,
);
// Framed so the whole system (outermost orbit ~ 78) fits in view.
camera.position.set(0, 70, 150);

const controls = new OrbitControls(camera, labelRenderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 25;
controls.maxDistance = 600;
controls.target.set(0, 0, 0);

// --- Starfield backdrop ---------------------------------------------------
{
  const starCount = 2500;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 500 + Math.random() * 600;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: true }),
  );
  scene.add(stars);
}

// --- Helper: build a readable HTML label ----------------------------------
function makeLabel(text: string): CSS2DObject {
  const div = document.createElement('div');
  div.textContent = text;
  div.style.cssText = [
    'color:#ffffff',
    'font-family:Arial, Helvetica, sans-serif',
    'font-size:13px',
    'font-weight:600',
    'letter-spacing:0.5px',
    'padding:2px 7px',
    'border-radius:6px',
    'background:rgba(10,14,28,0.72)',
    'border:1px solid rgba(255,255,255,0.25)',
    'white-space:nowrap',
    'text-shadow:0 1px 3px rgba(0,0,0,0.9)',
  ].join(';');
  const label = new CSS2DObject(div);
  return label;
}

// --- Sun ------------------------------------------------------------------
const sunRadius = 8;
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(sunRadius, 64, 64),
  // MeshBasicMaterial stays bright regardless of lighting, so it blooms.
  new THREE.MeshBasicMaterial({ color: 0xffd24a }),
);
scene.add(sun);

// Light radiating from the sun illuminates the planets.
const sunLight = new THREE.PointLight(0xfff2cc, 4.0, 0, 0.0);
sun.add(sunLight);
scene.add(new THREE.AmbientLight(0x334466, 0.25));

const sunLabel = makeLabel('Sun');
sunLabel.position.set(0, sunRadius + 4, 0);
sun.add(sunLabel);

// --- Planets --------------------------------------------------------------
interface PlanetDef {
  name: string;
  radius: number;
  distance: number;
  color: number;
  speed: number; // radians per second
}

// Visibly different orbital distances and speeds (inner = faster).
const planetDefs: PlanetDef[] = [
  { name: 'Mercury', radius: 1.4, distance: 18, color: 0xb1a08a, speed: 0.90 },
  { name: 'Venus',   radius: 2.4, distance: 27, color: 0xe6b873, speed: 0.66 },
  { name: 'Earth',   radius: 2.6, distance: 37, color: 0x3f7fd6, speed: 0.50 },
  { name: 'Mars',    radius: 1.9, distance: 48, color: 0xc1502e, speed: 0.40 },
  { name: 'Jupiter', radius: 5.2, distance: 62, color: 0xd2a679, speed: 0.26 },
  { name: 'Saturn',  radius: 4.4, distance: 78, color: 0xe3d2a0, speed: 0.18 },
];

interface Planet {
  pivot: THREE.Object3D;
  mesh: THREE.Mesh;
  def: PlanetDef;
  angle: number;
}

const planets: Planet[] = [];

planetDefs.forEach((def, i) => {
  // Orbit pivot at the sun's center; rotating it carries the planet around.
  const pivot = new THREE.Object3D();
  scene.add(pivot);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(def.radius, 48, 48),
    new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.85, metalness: 0.1 }),
  );
  mesh.position.x = def.distance;
  pivot.add(mesh);

  // Saturn gets a ring for character.
  if (def.name === 'Saturn') {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(def.radius + 1.4, def.radius + 3.4, 64),
      new THREE.MeshBasicMaterial({
        color: 0xcdbb8a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
      }),
    );
    ring.rotation.x = -Math.PI / 2.2;
    mesh.add(ring);
  }

  // Visible orbit ring on the ecliptic plane.
  const orbit = new THREE.Mesh(
    new THREE.RingGeometry(def.distance - 0.08, def.distance + 0.08, 256),
    new THREE.MeshBasicMaterial({
      color: 0x4a5a7a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
    }),
  );
  orbit.rotation.x = -Math.PI / 2;
  scene.add(orbit);

  const label = makeLabel(def.name);
  label.position.set(0, def.radius + 2.5, 0);
  mesh.add(label);

  planets.push({ pivot, mesh, def, angle: (i / planetDefs.length) * Math.PI * 2 });
});

// --- Post-processing: bloom on the bright sun -----------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.4, // strength
  0.7, // radius
  0.6, // threshold — only the very bright sun blooms
);
composer.addPass(bloom);

// --- Resize ---------------------------------------------------------------
function onResize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  composer.setSize(w, h);
}
window.addEventListener('resize', onResize);

// --- Animation loop -------------------------------------------------------
const clock = new THREE.Clock();
function animate(): void {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  sun.rotation.y += dt * 0.1;

  for (const p of planets) {
    p.angle += p.def.speed * dt;
    p.pivot.rotation.y = p.angle;
    p.mesh.rotation.y += dt * 0.6;
  }

  controls.update();
  composer.render();
  labelRenderer.render(scene, camera);
}
animate();
