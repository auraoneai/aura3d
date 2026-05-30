// Particle Fountain
// ------------------
// Gravity-affected particles emitted upward from a single point, colored by
// their lifetime, bouncing off a ground plane, with a live emission-rate
// control. Built procedurally with three.js (no external assets).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------

const app = document.getElementById('app') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0a0e16, 1);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0e16, 18, 48);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(7, 6, 11);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 2.5, 0);
controls.minDistance = 4;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.495; // keep camera above the ground

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------

scene.add(new THREE.AmbientLight(0x405066, 1.1));

const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
keyLight.position.set(6, 12, 8);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x4488ff, 0.6);
rimLight.position.set(-8, 4, -6);
scene.add(rimLight);

// ---------------------------------------------------------------------------
// Ground plane (particles collide against this)
// ---------------------------------------------------------------------------

const GROUND_Y = 0;

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({
    color: 0x141b26,
    roughness: 0.9,
    metalness: 0.05,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = GROUND_Y;
scene.add(ground);

const grid = new THREE.GridHelper(60, 60, 0x2a3a52, 0x1a2433);
grid.position.y = GROUND_Y + 0.001;
scene.add(grid);

// ---------------------------------------------------------------------------
// Emitter (visible marker at the emission point)
// ---------------------------------------------------------------------------

const EMITTER = new THREE.Vector3(0, 0.15, 0);

const emitterGroup = new THREE.Group();
emitterGroup.position.copy(EMITTER);
scene.add(emitterGroup);

// A small glowing nozzle cone so the emission point is unmistakable.
const nozzle = new THREE.Mesh(
  new THREE.ConeGeometry(0.45, 0.9, 24),
  new THREE.MeshStandardMaterial({
    color: 0x223044,
    emissive: 0x66ccff,
    emissiveIntensity: 0.9,
    roughness: 0.4,
    metalness: 0.6,
  }),
);
nozzle.position.y = 0.45;
emitterGroup.add(nozzle);

// A glowing ring around the base of the emitter.
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(0.7, 0.07, 16, 48),
  new THREE.MeshStandardMaterial({
    color: 0x113355,
    emissive: 0x33aaff,
    emissiveIntensity: 1.2,
  }),
);
ring.rotation.x = Math.PI / 2;
ring.position.y = 0.05;
emitterGroup.add(ring);

const emitterLight = new THREE.PointLight(0x66ccff, 6, 12, 2);
emitterLight.position.set(0, 0.6, 0);
emitterGroup.add(emitterLight);

// ---------------------------------------------------------------------------
// Particle system
// ---------------------------------------------------------------------------

const MAX_PARTICLES = 20000;
const GRAVITY = -9.8;       // world units / s^2
const RESTITUTION = 0.45;   // bounciness on ground impact
const FRICTION = 0.7;       // horizontal velocity kept after a bounce
const MIN_LIFE = 2.2;       // seconds
const MAX_LIFE = 3.6;       // seconds

// Per-particle state stored in flat typed arrays (struct-of-arrays).
const positions = new Float32Array(MAX_PARTICLES * 3);
const colors = new Float32Array(MAX_PARTICLES * 3);
const velX = new Float32Array(MAX_PARTICLES);
const velY = new Float32Array(MAX_PARTICLES);
const velZ = new Float32Array(MAX_PARTICLES);
const age = new Float32Array(MAX_PARTICLES);
const life = new Float32Array(MAX_PARTICLES);
const alive = new Uint8Array(MAX_PARTICLES);

const geometry = new THREE.BufferGeometry();
const positionAttr = new THREE.BufferAttribute(positions, 3);
const colorAttr = new THREE.BufferAttribute(colors, 3);
positionAttr.setUsage(THREE.DynamicDrawUsage);
colorAttr.setUsage(THREE.DynamicDrawUsage);
geometry.setAttribute('position', positionAttr);
geometry.setAttribute('color', colorAttr);
// Start with nothing drawn; grows as particles spawn.
geometry.setDrawRange(0, 0);

// Soft round sprite so particles read as droplets rather than squares.
function makeSprite(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.85)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const material = new THREE.PointsMaterial({
  size: 0.22,
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

// Highest index currently in use (+1). Lets us cap the draw range and the
// per-frame update loop to the live portion of the pool.
let count = 0;
const freeList: number[] = [];

// Color ramp keyed on normalized lifetime t = age / life:
//   young  -> hot white/yellow
//   middle -> orange / magenta
//   old    -> cool blue / violet
const RAMP: Array<[number, THREE.Color]> = [
  [0.0, new THREE.Color(0xffffff)],
  [0.2, new THREE.Color(0xffe066)],
  [0.45, new THREE.Color(0xff7a3c)],
  [0.7, new THREE.Color(0xff3c8c)],
  [1.0, new THREE.Color(0x3c6cff)],
];

const tmpColor = new THREE.Color();
function lifetimeColor(t: number, out: THREE.Color): void {
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1];
      const [t1, c1] = RAMP[i];
      const k = (t - t0) / (t1 - t0);
      out.copy(c0).lerp(c1, k);
      return;
    }
  }
  out.copy(RAMP[RAMP.length - 1][1]);
}

function spawnParticle(): void {
  let i: number;
  if (freeList.length > 0) {
    i = freeList.pop()!;
  } else if (count < MAX_PARTICLES) {
    i = count++;
  } else {
    return; // pool full
  }

  alive[i] = 1;
  age[i] = 0;
  life[i] = MIN_LIFE + Math.random() * (MAX_LIFE - MIN_LIFE);

  // Emit from the nozzle tip with a tight upward cone.
  positions[i * 3 + 0] = EMITTER.x + (Math.random() - 0.5) * 0.1;
  positions[i * 3 + 1] = EMITTER.y + 0.8;
  positions[i * 3 + 2] = EMITTER.z + (Math.random() - 0.5) * 0.1;

  const speed = 6.5 + Math.random() * 3.0;       // mostly vertical thrust
  const angle = Math.random() * Math.PI * 2;     // azimuth around the cone
  const spread = Math.random() * 1.6;            // horizontal spread velocity
  velX[i] = Math.cos(angle) * spread;
  velY[i] = speed;
  velZ[i] = Math.sin(angle) * spread;

  lifetimeColor(0, tmpColor);
  colors[i * 3 + 0] = tmpColor.r;
  colors[i * 3 + 1] = tmpColor.g;
  colors[i * 3 + 2] = tmpColor.b;
}

// ---------------------------------------------------------------------------
// Emission-rate control (UI)
// ---------------------------------------------------------------------------

let emissionRate = 1200; // particles per second
let emitAccumulator = 0;

const ui = document.createElement('div');
ui.id = 'ui';
ui.innerHTML = `
  <h1>Particle Fountain</h1>
  <label for="rate">Emission rate: <span id="rateValue"></span> /s</label>
  <input id="rate" type="range" min="0" max="5000" step="50" value="${emissionRate}" />
  <div id="liveCount" class="hint"></div>
  <div class="hint">Drag to orbit &bull; scroll to zoom</div>
`;
document.body.appendChild(ui);

const rateInput = ui.querySelector<HTMLInputElement>('#rate')!;
const rateValue = ui.querySelector<HTMLSpanElement>('#rateValue')!;
const liveCount = ui.querySelector<HTMLDivElement>('#liveCount')!;

function syncRateLabel(): void {
  rateValue.textContent = emissionRate.toLocaleString();
}
rateInput.addEventListener('input', () => {
  emissionRate = Number(rateInput.value);
  syncRateLabel();
});
syncRateLabel();

// ---------------------------------------------------------------------------
// Simulation + render loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

function update(dt: number): void {
  // --- emit new particles based on the controllable rate ---
  emitAccumulator += emissionRate * dt;
  let toSpawn = Math.floor(emitAccumulator);
  emitAccumulator -= toSpawn;
  // Guard against huge bursts after a tab regains focus.
  toSpawn = Math.min(toSpawn, 1500);
  for (let s = 0; s < toSpawn; s++) spawnParticle();

  // --- integrate physics for live particles ---
  let liveParticles = 0;
  for (let i = 0; i < count; i++) {
    if (alive[i] === 0) continue;

    age[i] += dt;
    if (age[i] >= life[i]) {
      alive[i] = 0;
      freeList.push(i);
      // Park dead particles far below the ground so stale verts aren't drawn.
      positions[i * 3 + 1] = -9999;
      continue;
    }

    // Gravity.
    velY[i] += GRAVITY * dt;

    const px = i * 3;
    positions[px + 0] += velX[i] * dt;
    positions[px + 1] += velY[i] * dt;
    positions[px + 2] += velZ[i] * dt;

    // Ground collision -> bounce with energy loss + horizontal friction.
    if (positions[px + 1] <= GROUND_Y + 0.02) {
      positions[px + 1] = GROUND_Y + 0.02;
      if (velY[i] < 0) {
        velY[i] = -velY[i] * RESTITUTION;
        velX[i] *= FRICTION;
        velZ[i] *= FRICTION;
        // Kill near-stationary crawlers so they don't smear on the floor.
        if (velY[i] < 0.6) {
          alive[i] = 0;
          freeList.push(i);
          positions[px + 1] = -9999;
          continue;
        }
      }
    }

    // Color by normalized lifetime.
    lifetimeColor(age[i] / life[i], tmpColor);
    colors[px + 0] = tmpColor.r;
    colors[px + 1] = tmpColor.g;
    colors[px + 2] = tmpColor.b;

    liveParticles++;
  }

  geometry.setDrawRange(0, count);
  positionAttr.needsUpdate = true;
  colorAttr.needsUpdate = true;

  // Pulse the emitter so the source reads as active.
  const pulse = 0.9 + Math.sin(clock.elapsedTime * 6) * 0.25;
  emitterLight.intensity = 6 * (0.6 + emissionRate / 5000) * pulse;

  liveCount.textContent = `Live particles: ${liveParticles.toLocaleString()}`;
}

function animate(): void {
  const dt = Math.min(clock.getDelta(), 0.05); // clamp big frame gaps
  update(dt);
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
