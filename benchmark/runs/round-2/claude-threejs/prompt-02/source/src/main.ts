import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ---------------------------------------------------------------------------
// Particle Fountain
// Gravity-affected particles emitted upward from a single point, colored by
// their normalized lifetime, colliding (bouncing) against a ground plane, with
// a live emission-rate control.
// ---------------------------------------------------------------------------

const app = document.getElementById('app')!;

// --- Renderer --------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0a0e16, 1);
app.appendChild(renderer.domElement);

// --- Scene & Camera --------------------------------------------------------
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0e16, 0.012);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);
camera.position.set(14, 11, 20);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 4, 0);

// --- Lights ----------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0x88aaff, 0x202028, 0.9));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(8, 18, 10);
scene.add(keyLight);

// --- Ground plane ----------------------------------------------------------
const GROUND_Y = 0;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({
    color: 0x1c2433,
    roughness: 0.9,
    metalness: 0.0,
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = GROUND_Y;
scene.add(ground);

const grid = new THREE.GridHelper(80, 40, 0x3a4a66, 0x222c3c);
grid.position.y = GROUND_Y + 0.01;
scene.add(grid);

// --- Emitter (visible marker at the fountain origin) -----------------------
const EMITTER_POS = new THREE.Vector3(0, GROUND_Y + 0.4, 0);
const emitterGroup = new THREE.Group();
emitterGroup.position.copy(EMITTER_POS);
scene.add(emitterGroup);

// A glowing nozzle cone marks where particles are emitted.
const nozzle = new THREE.Mesh(
  new THREE.ConeGeometry(0.6, 1.0, 24, 1, true),
  new THREE.MeshStandardMaterial({
    color: 0x33ddff,
    emissive: 0x114455,
    roughness: 0.4,
    metalness: 0.6,
    side: THREE.DoubleSide,
  })
);
nozzle.position.y = -0.2;
emitterGroup.add(nozzle);

const emitterRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.55, 0.08, 12, 32),
  new THREE.MeshStandardMaterial({ color: 0x66f0ff, emissive: 0x2299aa })
);
emitterRing.rotation.x = Math.PI / 2;
emitterRing.position.y = 0.35;
emitterGroup.add(emitterRing);

const emitterGlow = new THREE.PointLight(0x44e0ff, 6, 14, 2);
emitterGlow.position.y = 0.5;
emitterGroup.add(emitterGlow);

// --- Particle system -------------------------------------------------------
const MAX_PARTICLES = 6000;
const GRAVITY = -18; // m/s^2
const LIFETIME = 3.0; // seconds
const RESTITUTION = 0.45; // bounciness on ground impact
const GROUND_FRICTION = 0.7; // horizontal damping on bounce

const positions = new Float32Array(MAX_PARTICLES * 3);
const colors = new Float32Array(MAX_PARTICLES * 3);
const velocities = new Float32Array(MAX_PARTICLES * 3);
const ages = new Float32Array(MAX_PARTICLES); // seconds lived
const alive = new Uint8Array(MAX_PARTICLES); // 0 = dead, 1 = alive

const geometry = new THREE.BufferGeometry();
const posAttr = new THREE.BufferAttribute(positions, 3).setUsage(
  THREE.DynamicDrawUsage
);
const colAttr = new THREE.BufferAttribute(colors, 3).setUsage(
  THREE.DynamicDrawUsage
);
geometry.setAttribute('position', posAttr);
geometry.setAttribute('color', colAttr);

// Soft round sprite so particles read as droplets rather than squares.
function makeSprite(): THREE.Texture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.85)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const particleMaterial = new THREE.PointsMaterial({
  size: 0.55,
  map: makeSprite(),
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
});

const points = new THREE.Points(geometry, particleMaterial);
points.frustumCulled = false;
scene.add(points);

// Lifetime color ramp: young = cyan, mid = yellow/orange, old = deep red.
const COLD = new THREE.Color(0x66f8ff); // freshly emitted
const WARM = new THREE.Color(0xffe14d);
const HOT = new THREE.Color(0xff7a1a);
const OLD = new THREE.Color(0xc81e3a);
const tmpColor = new THREE.Color();

function colorForLife(t: number, out: THREE.Color): void {
  // t in [0,1] : fraction of lifetime elapsed
  if (t < 0.33) {
    out.copy(COLD).lerp(WARM, t / 0.33);
  } else if (t < 0.66) {
    out.copy(WARM).lerp(HOT, (t - 0.33) / 0.33);
  } else {
    out.copy(HOT).lerp(OLD, (t - 0.66) / 0.34);
  }
}

let cursor = 0; // round-robin write head into the particle pools

function spawnParticle(): void {
  const i = cursor;
  cursor = (cursor + 1) % MAX_PARTICLES;

  const i3 = i * 3;

  // Emit from the nozzle tip with a little jitter.
  positions[i3 + 0] = EMITTER_POS.x + (Math.random() - 0.5) * 0.2;
  positions[i3 + 1] = EMITTER_POS.y + 0.5;
  positions[i3 + 2] = EMITTER_POS.z + (Math.random() - 0.5) * 0.2;

  // Mostly-upward velocity inside a narrow cone for the fountain arc.
  const speed = 10 + Math.random() * 4;
  const theta = Math.random() * Math.PI * 2;
  const spread = Math.random() * 0.32; // radians off vertical
  const sinS = Math.sin(spread);
  velocities[i3 + 0] = Math.cos(theta) * sinS * speed;
  velocities[i3 + 1] = Math.cos(spread) * speed;
  velocities[i3 + 2] = Math.sin(theta) * sinS * speed;

  ages[i] = 0;
  alive[i] = 1;
}

// --- Emission rate control -------------------------------------------------
let emissionRate = 900; // particles per second
let spawnAccumulator = 0;

// --- Simulation step -------------------------------------------------------
function updateParticles(dt: number): void {
  // Emit
  spawnAccumulator += emissionRate * dt;
  let toSpawn = Math.floor(spawnAccumulator);
  spawnAccumulator -= toSpawn;
  // Cap per-frame spawns so a long frame can't stall the loop.
  toSpawn = Math.min(toSpawn, 400);
  for (let s = 0; s < toSpawn; s++) spawnParticle();

  // Integrate
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (!alive[i]) continue;

    const i3 = i * 3;
    ages[i] += dt;
    if (ages[i] >= LIFETIME) {
      alive[i] = 0;
      // Park dead particles far away so stale buffer data isn't drawn.
      positions[i3 + 1] = -9999;
      continue;
    }

    // Gravity
    velocities[i3 + 1] += GRAVITY * dt;

    // Integrate position
    positions[i3 + 0] += velocities[i3 + 0] * dt;
    positions[i3 + 1] += velocities[i3 + 1] * dt;
    positions[i3 + 2] += velocities[i3 + 2] * dt;

    // Ground collision -> bounce
    if (positions[i3 + 1] <= GROUND_Y + 0.05) {
      positions[i3 + 1] = GROUND_Y + 0.05;
      if (velocities[i3 + 1] < 0) {
        velocities[i3 + 1] = -velocities[i3 + 1] * RESTITUTION;
        velocities[i3 + 0] *= GROUND_FRICTION;
        velocities[i3 + 2] *= GROUND_FRICTION;
      }
    }

    // Color by normalized lifetime
    colorForLife(ages[i] / LIFETIME, tmpColor);
    colors[i3 + 0] = tmpColor.r;
    colors[i3 + 1] = tmpColor.g;
    colors[i3 + 2] = tmpColor.b;
  }

  geometry.setDrawRange(0, MAX_PARTICLES);
  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;

  // Pulse the emitter ring for liveliness.
  emitterRing.scale.setScalar(1 + Math.sin(performance.now() * 0.006) * 0.06);
}

// --- HUD: emission-rate control + color legend -----------------------------
function buildUI(): void {
  const panel = document.createElement('div');
  panel.style.cssText = `
    position: fixed; top: 16px; left: 16px; z-index: 10;
    font-family: system-ui, sans-serif; color: #e8f0ff;
    background: rgba(10,16,28,0.78); border: 1px solid #2a3a55;
    border-radius: 10px; padding: 14px 16px; width: 250px;
    backdrop-filter: blur(6px); box-shadow: 0 6px 24px rgba(0,0,0,0.4);
  `;

  const title = document.createElement('div');
  title.textContent = 'Particle Fountain';
  title.style.cssText =
    'font-weight:700; font-size:15px; margin-bottom:10px; letter-spacing:0.3px;';
  panel.appendChild(title);

  // Emission-rate slider
  const label = document.createElement('label');
  label.style.cssText = 'font-size:12px; display:block; margin-bottom:6px;';
  label.textContent = 'Emission rate';
  panel.appendChild(label);

  const valueText = document.createElement('span');
  valueText.style.cssText = 'float:right; color:#66f0ff; font-weight:600;';
  valueText.textContent = `${emissionRate}/s`;
  label.appendChild(valueText);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '3000';
  slider.step = '50';
  slider.value = String(emissionRate);
  slider.style.cssText = 'width:100%; accent-color:#33ddff; cursor:pointer;';
  slider.addEventListener('input', () => {
    emissionRate = Number(slider.value);
    valueText.textContent = `${emissionRate}/s`;
  });
  panel.appendChild(slider);

  // Lifetime color legend
  const legendTitle = document.createElement('div');
  legendTitle.textContent = 'Color = particle lifetime';
  legendTitle.style.cssText = 'font-size:11px; margin:14px 0 6px; opacity:0.85;';
  panel.appendChild(legendTitle);

  const bar = document.createElement('div');
  bar.style.cssText = `
    height: 12px; border-radius: 6px;
    background: linear-gradient(90deg, #66f8ff, #ffe14d, #ff7a1a, #c81e3a);
  `;
  panel.appendChild(bar);

  const ends = document.createElement('div');
  ends.style.cssText =
    'display:flex; justify-content:space-between; font-size:10px; opacity:0.7; margin-top:3px;';
  ends.innerHTML = '<span>new</span><span>old</span>';
  panel.appendChild(ends);

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:10px; opacity:0.55; margin-top:12px;';
  hint.textContent = 'Drag to orbit • scroll to zoom';
  panel.appendChild(hint);

  document.body.appendChild(panel);
}
buildUI();

// --- Resize ----------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Main loop -------------------------------------------------------------
const clock = new THREE.Clock();
function animate(): void {
  const dt = Math.min(clock.getDelta(), 0.05); // clamp big frame gaps
  updateParticles(dt);
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
