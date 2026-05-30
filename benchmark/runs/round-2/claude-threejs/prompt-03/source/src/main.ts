import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import {
  CSS2DRenderer,
  CSS2DObject,
} from 'three/addons/renderers/CSS2DRenderer.js';

// ---------------------------------------------------------------------------
// Renderer + scene + camera
// ---------------------------------------------------------------------------

const app = document.getElementById('app') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

// Separate, transparent overlay for HTML planet labels so they stay crisp and
// are never washed out by the bloom pass.
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'fixed';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060c);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  2000,
);
// Framed so the whole system (out to the furthest orbit) is visible.
camera.position.set(0, 42, 90);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 20;
controls.maxDistance = 320;
controls.target.set(0, 0, 0);

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

// The sun is the light source for the planets.
const sunLight = new THREE.PointLight(0xfff2d6, 4500, 0, 2);
scene.add(sunLight);
// Soft ambient so the night sides aren't pure black.
scene.add(new THREE.AmbientLight(0x223044, 0.6));

// ---------------------------------------------------------------------------
// Starfield backdrop
// ---------------------------------------------------------------------------

function makeStarfield(count: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Random point on a large sphere shell.
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
    size: 1.4,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
  });
  return new THREE.Points(geom, mat);
}
scene.add(makeStarfield(2400));

// ---------------------------------------------------------------------------
// Sun
// ---------------------------------------------------------------------------

const SUN_RADIUS = 5;
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_RADIUS, 64, 64),
  // Bright, unlit material so the bloom pass picks it up strongly.
  new THREE.MeshBasicMaterial({ color: 0xffcf57 }),
);
scene.add(sun);

// A faint additive halo billboard to fatten up the glow around the sun.
const haloTexture = (() => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0.0, 'rgba(255, 230, 150, 1.0)');
  grad.addColorStop(0.25, 'rgba(255, 190, 90, 0.6)');
  grad.addColorStop(1.0, 'rgba(255, 150, 40, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();
const sunGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: haloTexture,
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
sunGlow.scale.set(SUN_RADIUS * 6, SUN_RADIUS * 6, 1);
sun.add(sunGlow);

// Sun label.
sun.add(makeLabel('Sun', SUN_RADIUS + 2, 'sun'));

// ---------------------------------------------------------------------------
// Planets
// ---------------------------------------------------------------------------

interface PlanetSpec {
  name: string;
  radius: number;
  distance: number;
  color: number;
  speed: number; // radians per second
  tilt: number; // axial spin flavour
}

// Six planets at clearly different orbital distances and speeds.
const PLANET_SPECS: PlanetSpec[] = [
  { name: 'Mercura', radius: 0.9, distance: 12, color: 0xa9a3a0, speed: 0.62, tilt: 0.2 },
  { name: 'Venora', radius: 1.5, distance: 18, color: 0xd9a066, speed: 0.45, tilt: 0.1 },
  { name: 'Terran', radius: 1.7, distance: 25, color: 0x4f8fe0, speed: 0.34, tilt: 0.41 },
  { name: 'Marnis', radius: 1.2, distance: 33, color: 0xc1502e, speed: 0.27, tilt: 0.44 },
  { name: 'Jovian', radius: 3.4, distance: 46, color: 0xd8b48a, speed: 0.16, tilt: 0.05 },
  { name: 'Saturnis', radius: 2.9, distance: 60, color: 0xe3d2a0, speed: 0.11, tilt: 0.47 },
];

interface Planet {
  pivot: THREE.Object3D; // rotates about the sun
  mesh: THREE.Mesh; // the planet body (spins on its axis)
  spec: PlanetSpec;
  phase: number;
}

const planets: Planet[] = [];

for (const spec of PLANET_SPECS) {
  // Orbit ring so the differing distances read clearly even when a planet is
  // on the far side of the sun.
  scene.add(makeOrbitRing(spec.distance));

  const pivot = new THREE.Object3D();
  scene.add(pivot);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(spec.radius, 48, 48),
    new THREE.MeshStandardMaterial({
      color: spec.color,
      roughness: 0.85,
      metalness: 0.1,
    }),
  );
  mesh.position.x = spec.distance;
  mesh.rotation.z = spec.tilt;
  pivot.add(mesh);

  // A ring for the gas-giant-ish "Saturnis" to add variety.
  if (spec.name === 'Saturnis') {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(spec.radius * 1.4, spec.radius * 2.2, 64),
      new THREE.MeshBasicMaterial({
        color: 0xc9b87f,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
      }),
    );
    ring.rotation.x = Math.PI / 2.2;
    mesh.add(ring);
  }

  // Planet label floats just above the body.
  mesh.add(makeLabel(spec.name, spec.radius + 1.6, 'planet'));

  // Stagger the starting angle so planets aren't all in a line.
  const phase = (PLANET_SPECS.indexOf(spec) / PLANET_SPECS.length) * Math.PI * 2;
  pivot.rotation.y = phase;

  planets.push({ pivot, mesh, spec, phase });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLabel(
  text: string,
  yOffset: number,
  kind: 'sun' | 'planet',
): CSS2DObject {
  const el = document.createElement('div');
  el.className = `label label--${kind}`;
  el.textContent = text;
  const obj = new CSS2DObject(el);
  obj.position.set(0, yOffset, 0);
  obj.center.set(0.5, 1);
  return obj;
}

function makeOrbitRing(radius: number): THREE.Line {
  const segments = 160;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: 0x3a4a66,
    transparent: true,
    opacity: 0.5,
  });
  return new THREE.Line(geom, mat);
}

// ---------------------------------------------------------------------------
// Post-processing: bloom focused on the bright sun
// ---------------------------------------------------------------------------

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.4, // strength
  0.7, // radius
  0.35, // threshold — only the bright sun blooms, planets stay sharp
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
  composer.setSize(w, h);
  labelRenderer.setSize(w, h);
});

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

function animate(): void {
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  // Sun slow spin + gentle halo pulse.
  sun.rotation.y += dt * 0.05;
  const pulse = 1 + Math.sin(t * 1.5) * 0.04;
  sunGlow.scale.set(SUN_RADIUS * 6 * pulse, SUN_RADIUS * 6 * pulse, 1);

  // Each planet orbits at its own speed and spins on its axis.
  for (const p of planets) {
    p.pivot.rotation.y += dt * p.spec.speed;
    p.mesh.rotation.y += dt * 0.8;
  }

  controls.update();
  composer.render();
  labelRenderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
