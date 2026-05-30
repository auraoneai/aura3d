// Procedural Solar System
// - One sun + 6 planets at distinct orbital distances and speeds
// - Readable HTML labels (CSS2DRenderer) for the sun and every planet
// - UnrealBloom glow on the sun
// - Orbit camera (OrbitControls) framed on the whole system
//
// Built only with the provided Three.js context bundle (three 0.165.0).

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
// Label styling (injected so labels are clearly readable over the dark scene)
// ---------------------------------------------------------------------------

const style = document.createElement('style');
style.textContent = `
  html, body { margin: 0; height: 100%; background: #05060c; overflow: hidden; }
  #app { position: fixed; inset: 0; }
  canvas { display: block; }

  .label {
    color: #f4f6ff;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.04em;
    padding: 3px 9px;
    border-radius: 6px;
    background: rgba(8, 12, 28, 0.62);
    border: 1px solid rgba(150, 180, 255, 0.45);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.55);
    white-space: nowrap;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
    pointer-events: none;
    transform: translateY(-4px);
  }
  .label--sun {
    color: #fff6d8;
    font-size: 15px;
    border-color: rgba(255, 210, 120, 0.7);
    background: rgba(40, 22, 4, 0.6);
  }

  .hud {
    position: fixed;
    left: 16px;
    bottom: 14px;
    z-index: 10;
    color: #aeb8da;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 12px;
    line-height: 1.5;
    pointer-events: none;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  }
  .hud b { color: #f4f6ff; }
`;
document.head.appendChild(style);

const app = document.getElementById('app') as HTMLElement;

// ---------------------------------------------------------------------------
// Renderer + scene + camera
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

// CSS2D overlay renderer for crisp, always-readable labels.
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
  4000,
);
// Positioned to frame the entire system (outermost orbit ~ 38 units).
camera.position.set(0, 48, 92);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 12;
controls.maxDistance = 320;
controls.target.set(0, 0, 0);
controls.update();

// ---------------------------------------------------------------------------
// Lighting (the sun is the dominant light source)
// ---------------------------------------------------------------------------

const sunLight = new THREE.PointLight(0xffffff, 4000, 0, 2);
scene.add(sunLight); // sits at the origin, with the sun

// Faint ambient so the dark sides of planets are not pure black.
scene.add(new THREE.AmbientLight(0x223044, 0.6));

// ---------------------------------------------------------------------------
// Procedural texture helpers
// ---------------------------------------------------------------------------

function rand(seed: number): () => number {
  // Small deterministic PRNG so each planet looks consistent.
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Banded, noisy planet surface generated on a canvas. */
function makePlanetTexture(base: THREE.Color, seed: number): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = rand(seed);

  // Base latitudinal bands.
  for (let y = 0; y < size; y++) {
    const t = y / size;
    const shade = 0.7 + 0.3 * Math.sin(t * Math.PI * (4 + r() * 6) + r() * 6.28);
    const c = base.clone().multiplyScalar(0.55 + 0.45 * shade);
    ctx.fillStyle = `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;
    ctx.fillRect(0, y, size, 1);
  }

  // Speckled surface detail.
  for (let i = 0; i < 1400; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 1 + r() * 3;
    const light = r() > 0.5;
    const c = base
      .clone()
      .multiplyScalar(light ? 1.25 + r() * 0.3 : 0.5 + r() * 0.3);
    ctx.fillStyle = `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${
      (c.b * 255) | 0
    },${0.35 + r() * 0.35})`;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Glowing radial sprite used to give the sun a soft corona under bloom. */
function makeGlowTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0.0, 'rgba(255,245,210,0.95)');
  g.addColorStop(0.25, 'rgba(255,200,90,0.65)');
  g.addColorStop(0.6, 'rgba(255,140,40,0.18)');
  g.addColorStop(1.0, 'rgba(255,120,20,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLabel(text: string, modifier = ''): CSS2DObject {
  const div = document.createElement('div');
  div.className = `label ${modifier}`.trim();
  div.textContent = text;
  return new CSS2DObject(div);
}

// ---------------------------------------------------------------------------
// Starfield background
// ---------------------------------------------------------------------------

function makeStars(count: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  const r = rand(99);
  for (let i = 0; i < count; i++) {
    // Distribute on a large sphere shell around the system.
    const radius = 400 + r() * 600;
    const theta = r() * Math.PI * 2;
    const phi = Math.acos(2 * r() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.4,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
  });
  return new THREE.Points(geo, mat);
}

scene.add(makeStars(2200));

// ---------------------------------------------------------------------------
// Sun
// ---------------------------------------------------------------------------

const sunGroup = new THREE.Group();
scene.add(sunGroup);

const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(4.2, 64, 64),
  // Bright, unlit material so the sun reads as a light emitter and blooms.
  new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffdf8a) }),
);
sunGroup.add(sunMesh);

// Soft additive corona sprite (also fed into the bloom pass).
const glowSprite = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color: 0xffcf6a,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
glowSprite.scale.set(22, 22, 1);
sunGroup.add(glowSprite);

const sunLabel = makeLabel('Sol', 'label--sun');
sunLabel.position.set(0, 6.2, 0);
sunGroup.add(sunLabel);

// ---------------------------------------------------------------------------
// Planets
// ---------------------------------------------------------------------------

interface PlanetSpec {
  name: string;
  distance: number; // orbital radius (units)
  radius: number; // planet size
  color: number;
  speed: number; // angular speed (rad/s)
  spin: number; // self-rotation speed
  tilt: number; // orbital-plane tilt
  seed: number;
}

// Six planets at visibly different orbital distances and speeds.
// Inner planets orbit faster (a loose take on Kepler's law).
const PLANETS: PlanetSpec[] = [
  { name: 'Ferro',   distance: 9,  radius: 0.9, color: 0xc97b54, speed: 0.62, spin: 0.8, tilt: 0.02, seed: 11 },
  { name: 'Verdia',  distance: 14, radius: 1.4, color: 0x4fae6d, speed: 0.45, spin: 0.6, tilt: 0.05, seed: 23 },
  { name: 'Azura',   distance: 20, radius: 1.6, color: 0x4f7fd6, speed: 0.34, spin: 0.7, tilt: 0.09, seed: 37 },
  { name: 'Rubex',   distance: 26, radius: 1.2, color: 0xd1553f, speed: 0.27, spin: 0.5, tilt: 0.04, seed: 51 },
  { name: 'Titanus', distance: 32, radius: 2.6, color: 0xd9b070, speed: 0.20, spin: 0.4, tilt: 0.06, seed: 67 },
  { name: 'Cryos',   distance: 38, radius: 2.1, color: 0x8fd0e6, speed: 0.15, spin: 0.3, tilt: 0.11, seed: 83 },
];

interface Planet {
  spec: PlanetSpec;
  pivot: THREE.Group; // tilts the orbital plane
  mesh: THREE.Mesh;
  angle: number;
}

const planets: Planet[] = [];
const r0 = rand(7);

for (const spec of PLANETS) {
  // Pivot defines the (tilted) orbital plane; the planet moves within it.
  const pivot = new THREE.Group();
  pivot.rotation.x = spec.tilt;
  scene.add(pivot);

  // Visible orbit ring so distance differences are obvious.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(spec.distance - 0.04, spec.distance + 0.04, 192),
    new THREE.MeshBasicMaterial({
      color: 0x33406a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  pivot.add(ring);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(spec.radius, 48, 48),
    new THREE.MeshStandardMaterial({
      map: makePlanetTexture(new THREE.Color(spec.color), spec.seed),
      roughness: 0.85,
      metalness: 0.05,
    }),
  );
  mesh.position.x = spec.distance;
  pivot.add(mesh);

  // Saturn-like ring for the largest gas giant.
  if (spec.name === 'Titanus') {
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(spec.radius * 1.5, spec.radius * 2.5, 96),
      new THREE.MeshBasicMaterial({
        color: 0xc7a979,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
      }),
    );
    halo.rotation.x = Math.PI / 2.3;
    mesh.add(halo);
  }

  // Readable label that follows the planet.
  const label = makeLabel(spec.name);
  label.position.set(0, spec.radius + 1.1, 0);
  mesh.add(label);

  planets.push({
    spec,
    pivot,
    mesh,
    angle: r0() * Math.PI * 2, // randomised starting position
  });
}

// ---------------------------------------------------------------------------
// Post-processing: bloom on the sun
// ---------------------------------------------------------------------------

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.2, // strength
  0.6, // radius
  0.85, // threshold — only bright things (the sun) bloom
);
composer.addPass(bloom);

// ---------------------------------------------------------------------------
// HUD hint
// ---------------------------------------------------------------------------

const hud = document.createElement('div');
hud.className = 'hud';
hud.innerHTML =
  '<b>Procedural Solar System</b><br>Drag to orbit · scroll to zoom · 1 sun + 6 planets';
document.body.appendChild(hud);

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

function animate(): void {
  const dt = Math.min(clock.getDelta(), 0.05);

  sunMesh.rotation.y += dt * 0.15;
  glowSprite.material.rotation += dt * 0.05;

  for (const p of planets) {
    p.angle += p.spec.speed * dt;
    // Move the planet along its orbit (in the pivot's local plane).
    p.mesh.position.x = Math.cos(p.angle) * p.spec.distance;
    p.mesh.position.z = Math.sin(p.angle) * p.spec.distance;
    p.mesh.rotation.y += p.spec.spin * dt;
  }

  controls.update();
  composer.render();
  labelRenderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

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
