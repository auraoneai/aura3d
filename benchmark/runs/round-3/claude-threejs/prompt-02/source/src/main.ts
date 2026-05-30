import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const root = document.querySelector<HTMLElement>("#app")!;
root.textContent = "";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0b0e1a, 1);
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0e1a, 30, 90);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);
camera.position.set(14, 11, 18);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 4, 0);

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0x9fb8ff, 0x202030, 0.8));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(10, 18, 8);
scene.add(key);

// ---------------------------------------------------------------------------
// Ground plane (particles collide against this; y = 0)
// ---------------------------------------------------------------------------
const GROUND_Y = 0;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({
    color: 0x2a3350,
    roughness: 0.95,
    metalness: 0.0,
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = GROUND_Y;
scene.add(ground);

const grid = new THREE.GridHelper(60, 30, 0x44507a, 0x2c3354);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.5;
grid.position.y = GROUND_Y + 0.01;
scene.add(grid);

// ---------------------------------------------------------------------------
// Emitter marker (so the fountain origin is identifiable)
// ---------------------------------------------------------------------------
const EMITTER = new THREE.Vector3(0, 0.5, 0);
const emitterGroup = new THREE.Group();
emitterGroup.position.copy(EMITTER);
scene.add(emitterGroup);

const nozzle = new THREE.Mesh(
  new THREE.CylinderGeometry(0.55, 0.95, 1.0, 24),
  new THREE.MeshStandardMaterial({
    color: 0x9aa6c8,
    roughness: 0.4,
    metalness: 0.7,
  })
);
nozzle.position.y = -0.5;
emitterGroup.add(nozzle);

const ring = new THREE.Mesh(
  new THREE.TorusGeometry(0.62, 0.09, 12, 32),
  new THREE.MeshStandardMaterial({
    color: 0x53e0ff,
    emissive: 0x1f8fb0,
    emissiveIntensity: 1.6,
    roughness: 0.3,
  })
);
ring.rotation.x = Math.PI / 2;
ring.position.y = 0.08;
emitterGroup.add(ring);

const emitterGlow = new THREE.PointLight(0x53e0ff, 10, 14, 2);
emitterGlow.position.set(0, 0.4, 0);
emitterGroup.add(emitterGlow);

// ---------------------------------------------------------------------------
// Particle system
// ---------------------------------------------------------------------------
const MAX_PARTICLES = 20000;
const GRAVITY = -16.0; // units / s^2
const RESTITUTION = 0.45; // vertical energy kept on a ground bounce
const FRICTION = 0.78; // horizontal damping on a ground bounce
const HIDDEN_Y = -9999; // park dead particles outside the frustum

// Per-particle CPU state
const px = new Float32Array(MAX_PARTICLES);
const py = new Float32Array(MAX_PARTICLES);
const pz = new Float32Array(MAX_PARTICLES);
const vx = new Float32Array(MAX_PARTICLES);
const vy = new Float32Array(MAX_PARTICLES);
const vz = new Float32Array(MAX_PARTICLES);
const age = new Float32Array(MAX_PARTICLES);
const life = new Float32Array(MAX_PARTICLES);
const alive = new Uint8Array(MAX_PARTICLES);

// GPU buffers
const positions = new Float32Array(MAX_PARTICLES * 3);
const colors = new Float32Array(MAX_PARTICLES * 3);

const geometry = new THREE.BufferGeometry();
const posAttr = new THREE.BufferAttribute(positions, 3);
const colAttr = new THREE.BufferAttribute(colors, 3);
posAttr.setUsage(THREE.DynamicDrawUsage);
colAttr.setUsage(THREE.DynamicDrawUsage);
geometry.setAttribute("position", posAttr);
geometry.setAttribute("color", colAttr);
geometry.setDrawRange(0, 0);

// Soft round sprite so particles look like droplets, not squares.
function makeSprite(): THREE.Texture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.85)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const material = new THREE.PointsMaterial({
  size: 0.5,
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

// Lifetime color ramp: young = hot white/cyan, mid = blue, old = magenta/red.
const COLOR_YOUNG = new THREE.Color(0xeafcff);
const COLOR_MID = new THREE.Color(0x2f7bff);
const COLOR_OLD = new THREE.Color(0xff2b6b);
const tmpColor = new THREE.Color();

function lifetimeColor(t: number, out: THREE.Color): void {
  // t in [0,1] across the particle's life
  if (t < 0.5) out.copy(COLOR_YOUNG).lerp(COLOR_MID, t / 0.5);
  else out.copy(COLOR_MID).lerp(COLOR_OLD, (t - 0.5) / 0.5);
}

let highWater = 0; // one past the highest slot ever used (draw range)
let searchCursor = 0; // round-robin start for free-slot search

function spawnParticle(): void {
  let idx = -1;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const j = (searchCursor + i) % MAX_PARTICLES;
    if (!alive[j]) {
      idx = j;
      searchCursor = (j + 1) % MAX_PARTICLES;
      break;
    }
  }
  if (idx < 0) return; // pool full

  // Launch upward in a tight cone -> a fountain arc.
  const speed = 8.5 + Math.random() * 4.0;
  const spread = 0.32; // max radians from vertical
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.random() * spread;
  const sinPhi = Math.sin(phi);

  vx[idx] = Math.cos(theta) * sinPhi * speed;
  vz[idx] = Math.sin(theta) * sinPhi * speed;
  vy[idx] = Math.cos(phi) * speed;

  // small nozzle radius so particles originate from the emitter point
  const r = Math.random() * 0.22;
  const a = Math.random() * Math.PI * 2;
  px[idx] = EMITTER.x + Math.cos(a) * r;
  pz[idx] = EMITTER.z + Math.sin(a) * r;
  py[idx] = EMITTER.y;

  age[idx] = 0;
  life[idx] = 2.6 + Math.random() * 1.6;
  alive[idx] = 1;
  if (idx + 1 > highWater) highWater = idx + 1;
}

// ---------------------------------------------------------------------------
// Emission control (UI)
// ---------------------------------------------------------------------------
let emissionRate = 1200; // particles per second
let spawnAccumulator = 0;
let liveCount = 0;

const liveValEl = buildUI();

function buildUI(): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.innerHTML = `
    <div class="title">Particle Fountain</div>
    <label for="rate">Emission rate
      <span id="rateVal">${emissionRate}</span> /s
    </label>
    <input id="rate" type="range" min="0" max="6000" step="50" value="${emissionRate}" />
    <div class="hint">Drag to change how many particles erupt per second.</div>
    <div class="count">Live particles: <span id="liveVal">0</span></div>
  `;
  document.body.appendChild(panel);

  const slider = panel.querySelector<HTMLInputElement>("#rate")!;
  const rateVal = panel.querySelector<HTMLSpanElement>("#rateVal")!;
  slider.addEventListener("input", () => {
    emissionRate = parseInt(slider.value, 10);
    rateVal.textContent = String(emissionRate);
  });

  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; overflow: hidden;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    #app { position: fixed; inset: 0; }
    canvas { display: block; }
    .panel {
      position: fixed; top: 16px; left: 16px; width: 270px;
      padding: 16px 18px; border-radius: 12px;
      background: rgba(16, 20, 38, 0.82);
      border: 1px solid rgba(120, 160, 255, 0.25);
      color: #dfe6ff; backdrop-filter: blur(8px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.45);
      user-select: none;
    }
    .panel .title { font-size: 16px; font-weight: 700; margin-bottom: 12px;
      letter-spacing: 0.3px; }
    .panel label { display: flex; justify-content: space-between;
      font-size: 13px; opacity: 0.9; margin-bottom: 8px; }
    .panel label span { color: #6fd0ff; font-weight: 700; }
    .panel input[type=range] { width: 100%; accent-color: #53e0ff;
      cursor: pointer; }
    .panel .hint { font-size: 11px; opacity: 0.55; margin-top: 8px; }
    .panel .count { font-size: 12px; margin-top: 12px;
      padding-top: 10px; border-top: 1px solid rgba(120,160,255,0.18); }
    .panel .count span { color: #6fd0ff; font-weight: 700; }
  `;
  document.head.appendChild(style);

  return panel.querySelector<HTMLElement>("#liveVal")!;
}

// ---------------------------------------------------------------------------
// Simulation loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();

function update(dt: number): void {
  // Emit, accumulating fractional spawns across frames.
  spawnAccumulator += emissionRate * dt;
  let toSpawn = Math.floor(spawnAccumulator);
  spawnAccumulator -= toSpawn;
  if (toSpawn > 1500) toSpawn = 1500; // clamp post-stall bursts
  for (let s = 0; s < toSpawn; s++) spawnParticle();

  // Integrate every slot inside the draw range.
  liveCount = 0;
  for (let i = 0; i < highWater; i++) {
    const o = i * 3;

    if (!alive[i]) {
      positions[o + 1] = HIDDEN_Y; // keep dead points out of view
      continue;
    }

    age[i] += dt;
    if (age[i] >= life[i]) {
      alive[i] = 0;
      positions[o + 1] = HIDDEN_Y;
      continue;
    }

    vy[i] += GRAVITY * dt;
    px[i] += vx[i] * dt;
    py[i] += vy[i] * dt;
    pz[i] += vz[i] * dt;

    // Ground collision -> bounce with energy loss.
    if (py[i] <= GROUND_Y) {
      py[i] = GROUND_Y;
      if (vy[i] < 0) vy[i] = -vy[i] * RESTITUTION;
      vx[i] *= FRICTION;
      vz[i] *= FRICTION;
      // retire particles that have settled so they don't pile up forever
      if (vy[i] < 1.2 && Math.abs(vx[i]) < 0.3 && Math.abs(vz[i]) < 0.3) {
        alive[i] = 0;
        positions[o + 1] = HIDDEN_Y;
        continue;
      }
    }

    positions[o] = px[i];
    positions[o + 1] = py[i];
    positions[o + 2] = pz[i];

    lifetimeColor(age[i] / life[i], tmpColor);
    colors[o] = tmpColor.r;
    colors[o + 1] = tmpColor.g;
    colors[o + 2] = tmpColor.b;

    liveCount++;
  }

  geometry.setDrawRange(0, highWater);
  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;

  ring.rotation.z += dt * 1.5; // gentle emitter pulse
  liveValEl.textContent = String(liveCount);
}

function animate(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
