import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/*
 * Particle Fountain
 * -----------------
 * - Particles are emitted upward from a single point (the emitter).
 * - Each particle is gravity-affected, so it traces an upward-and-falling arc.
 * - Particle color is driven by its normalized lifetime (young -> old).
 * - A ground plane is rendered and particles collide (bounce) against it.
 * - Emission rate is controllable from a visible slider in the UI.
 */

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0a0d18, 1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0d18, 18, 60);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(8, 7, 12);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 3, 0);

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------
scene.add(new THREE.AmbientLight(0x404a66, 1.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
keyLight.position.set(6, 12, 8);
scene.add(keyLight);

// ---------------------------------------------------------------------------
// Ground plane
// ---------------------------------------------------------------------------
const GROUND_Y = 0;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({
    color: 0x2a3350,
    roughness: 0.95,
    metalness: 0.0,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = GROUND_Y;
scene.add(ground);

const grid = new THREE.GridHelper(60, 60, 0x4f5b85, 0x323a59);
grid.position.y = GROUND_Y + 0.01;
scene.add(grid);

// ---------------------------------------------------------------------------
// Emitter marker (so the emission point is clearly identifiable)
// ---------------------------------------------------------------------------
const EMITTER = new THREE.Vector3(0, GROUND_Y + 0.25, 0);
const emitter = new THREE.Group();
emitter.position.copy(EMITTER);

const nozzle = new THREE.Mesh(
  new THREE.ConeGeometry(0.45, 0.9, 24),
  new THREE.MeshStandardMaterial({
    color: 0x9fc4ff,
    emissive: 0x2266ff,
    emissiveIntensity: 0.8,
    roughness: 0.4,
    metalness: 0.6,
  }),
);
nozzle.position.y = 0.45;
emitter.add(nozzle);

const base = new THREE.Mesh(
  new THREE.CylinderGeometry(0.55, 0.7, 0.25, 24),
  new THREE.MeshStandardMaterial({ color: 0x3a4670, roughness: 0.6 }),
);
emitter.add(base);
scene.add(emitter);

// ---------------------------------------------------------------------------
// Particle system
// ---------------------------------------------------------------------------
const MAX_PARTICLES = 8000;
const GRAVITY = 9.8;
const RESTITUTION = 0.45; // bounciness off the ground
const GROUND_FRICTION = 0.7; // horizontal damping on bounce

const positions = new Float32Array(MAX_PARTICLES * 3);
const colors = new Float32Array(MAX_PARTICLES * 3);

const velocities = new Float32Array(MAX_PARTICLES * 3);
const ages = new Float32Array(MAX_PARTICLES);
const lifespans = new Float32Array(MAX_PARTICLES);
const alive = new Uint8Array(MAX_PARTICLES);

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

// Soft circular sprite so particles read as droplets, not square dots.
function makeSprite(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.85)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const material = new THREE.PointsMaterial({
  size: 0.35,
  map: makeSprite(),
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
});

const points = new THREE.Points(geometry, material);
points.frustumCulled = false;
scene.add(points);

// Lifetime color ramp: young = hot white/yellow -> orange -> deep red (old).
const COLOR_STOPS: { t: number; c: THREE.Color }[] = [
  { t: 0.0, c: new THREE.Color(0xffffff) },
  { t: 0.25, c: new THREE.Color(0xffe27a) },
  { t: 0.55, c: new THREE.Color(0xff8a3d) },
  { t: 0.8, c: new THREE.Color(0xff3b30) },
  { t: 1.0, c: new THREE.Color(0x7a1020) },
];

const _tmpColor = new THREE.Color();
function lifetimeColor(t: number, out: THREE.Color): THREE.Color {
  t = Math.min(0.999, Math.max(0, t));
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const a = COLOR_STOPS[i];
    const b = COLOR_STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / (b.t - a.t);
      return out.copy(a.c).lerp(b.c, k);
    }
  }
  return out.copy(COLOR_STOPS[COLOR_STOPS.length - 1].c);
}

// Hide a dead particle: additive blending renders pure black as invisible.
function hide(i: number): void {
  const o = i * 3;
  colors[o] = 0;
  colors[o + 1] = 0;
  colors[o + 2] = 0;
}

function spawn(i: number): void {
  alive[i] = 1;
  ages[i] = 0;
  lifespans[i] = 2.2 + Math.random() * 1.8;

  const o = i * 3;
  // Start at the emitter nozzle with a little jitter.
  positions[o] = EMITTER.x + (Math.random() - 0.5) * 0.12;
  positions[o + 1] = EMITTER.y + 0.8;
  positions[o + 2] = EMITTER.z + (Math.random() - 0.5) * 0.12;

  // Upward velocity within a narrow cone -> clean fountain arc.
  const speed = 6.5 + Math.random() * 3.0;
  const angle = Math.random() * Math.PI * 2;
  const spread = Math.random() * 0.28; // radians off vertical
  const sinS = Math.sin(spread);
  velocities[o] = Math.cos(angle) * sinS * speed;
  velocities[o + 1] = Math.cos(spread) * speed;
  velocities[o + 2] = Math.sin(angle) * sinS * speed;
}

// Find a free slot (round-robin search keeps emission cheap).
let cursor = 0;
function allocate(): number {
  for (let n = 0; n < MAX_PARTICLES; n++) {
    cursor = (cursor + 1) % MAX_PARTICLES;
    if (!alive[cursor]) return cursor;
  }
  return -1; // pool full
}

// ---------------------------------------------------------------------------
// UI: emission-rate control
// ---------------------------------------------------------------------------
let emissionRate = 900; // particles per second
let liveCount = 0;

const ui = document.createElement('div');
ui.id = 'ui';
ui.innerHTML = `
  <h1>Particle Fountain</h1>
  <label for="rate">Emission rate</label>
  <input id="rate" type="range" min="0" max="3000" step="50" value="${emissionRate}" />
  <div class="readout"><span id="rateVal">${emissionRate}</span> particles / sec</div>
  <div class="readout muted"><span id="liveVal">0</span> live particles</div>
  <p class="hint">Drag to orbit &middot; scroll to zoom</p>
`;
document.body.appendChild(ui);

const rateInput = document.getElementById('rate') as HTMLInputElement;
const rateVal = document.getElementById('rateVal') as HTMLSpanElement;
const liveVal = document.getElementById('liveVal') as HTMLSpanElement;
rateInput.addEventListener('input', () => {
  emissionRate = parseFloat(rateInput.value);
  rateVal.textContent = String(emissionRate);
});

// ---------------------------------------------------------------------------
// Simulation loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let spawnAccumulator = 0;

function update(dt: number): void {
  // Emit new particles according to the current rate.
  spawnAccumulator += emissionRate * dt;
  while (spawnAccumulator >= 1) {
    spawnAccumulator -= 1;
    const idx = allocate();
    if (idx >= 0) spawn(idx);
  }

  liveCount = 0;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (!alive[i]) {
      continue;
    }

    const o = i * 3;
    ages[i] += dt;
    if (ages[i] >= lifespans[i]) {
      alive[i] = 0;
      hide(i);
      continue;
    }

    // Gravity + integrate.
    velocities[o + 1] -= GRAVITY * dt;
    positions[o] += velocities[o] * dt;
    positions[o + 1] += velocities[o + 1] * dt;
    positions[o + 2] += velocities[o + 2] * dt;

    // Collide with the ground plane (bounce with energy loss).
    const floor = GROUND_Y + 0.04;
    if (positions[o + 1] <= floor && velocities[o + 1] < 0) {
      positions[o + 1] = floor;
      velocities[o + 1] = -velocities[o + 1] * RESTITUTION;
      velocities[o] *= GROUND_FRICTION;
      velocities[o + 2] *= GROUND_FRICTION;
    }

    // Color by normalized lifetime.
    lifetimeColor(ages[i] / lifespans[i], _tmpColor);
    colors[o] = _tmpColor.r;
    colors[o + 1] = _tmpColor.g;
    colors[o + 2] = _tmpColor.b;

    liveCount++;
  }

  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;

  liveVal.textContent = String(liveCount);
}

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05); // clamp to avoid huge steps
  update(dt);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
