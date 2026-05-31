// Prompt 02: Particle Fountain
// Gravity-affected particles emitted upward from a point, colored by lifetime,
// colliding against a ground plane, with a controllable emission rate.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const app = document.getElementById('app') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0a0d18, 1);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0d18, 18, 60);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(9, 7, 12);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 3, 0);
controls.maxPolarAngle = Math.PI * 0.49; // stay above the ground
controls.minDistance = 5;
controls.maxDistance = 50;

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------
scene.add(new THREE.AmbientLight(0x4060a0, 0.8));

const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
keyLight.position.set(8, 14, 6);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x3366ff, 0.5);
rimLight.position.set(-8, 4, -10);
scene.add(rimLight);

// ---------------------------------------------------------------------------
// Ground plane (particles collide against this)
// ---------------------------------------------------------------------------
const GROUND_Y = 0;

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({
    color: 0x1b2236,
    roughness: 0.9,
    metalness: 0.1,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = GROUND_Y;
scene.add(ground);

const grid = new THREE.GridHelper(60, 60, 0x33507a, 0x1f2c44);
grid.position.y = GROUND_Y + 0.01;
scene.add(grid);

// ---------------------------------------------------------------------------
// Fountain emitter (identifiable nozzle at the emission point)
// ---------------------------------------------------------------------------
const EMITTER = new THREE.Vector3(0, 0.6, 0);

const emitterGroup = new THREE.Group();
emitterGroup.position.copy(EMITTER);
scene.add(emitterGroup);

// Base plinth
const base = new THREE.Mesh(
  new THREE.CylinderGeometry(0.9, 1.1, 0.5, 32),
  new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 0.6, metalness: 0.4 }),
);
base.position.y = -0.35;
emitterGroup.add(base);

// Nozzle cone pointing up
const nozzle = new THREE.Mesh(
  new THREE.ConeGeometry(0.35, 0.7, 24),
  new THREE.MeshStandardMaterial({ color: 0x5a6b96, roughness: 0.35, metalness: 0.7 }),
);
nozzle.position.y = 0.05;
emitterGroup.add(nozzle);

// Glowing emissive ring at the nozzle mouth so the emission point reads clearly
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(0.32, 0.07, 16, 48),
  new THREE.MeshStandardMaterial({
    color: 0x66ffff,
    emissive: 0x33ffff,
    emissiveIntensity: 2.0,
    roughness: 0.3,
  }),
);
ring.rotation.x = Math.PI / 2;
ring.position.y = 0.42;
emitterGroup.add(ring);

const emitterGlow = new THREE.PointLight(0x33ffff, 6, 6, 2);
emitterGlow.position.copy(EMITTER);
emitterGlow.position.y += 0.5;
scene.add(emitterGlow);

// ---------------------------------------------------------------------------
// Particle system
// ---------------------------------------------------------------------------
const MAX_PARTICLES = 6000;
const GRAVITY = -9.8;
const RESTITUTION = 0.45; // bounce energy retained on ground hit
const FRICTION = 0.7; // horizontal damping on ground hit
const PARTICLE_RADIUS = 0.04;

// Per-particle simulation state
const px = new Float32Array(MAX_PARTICLES);
const py = new Float32Array(MAX_PARTICLES);
const pz = new Float32Array(MAX_PARTICLES);
const vx = new Float32Array(MAX_PARTICLES);
const vy = new Float32Array(MAX_PARTICLES);
const vz = new Float32Array(MAX_PARTICLES);
const age = new Float32Array(MAX_PARTICLES);
const life = new Float32Array(MAX_PARTICLES);
const alive = new Uint8Array(MAX_PARTICLES);

// Free-slot stack for O(1) spawn / recycle
const freeList: number[] = [];
for (let i = MAX_PARTICLES - 1; i >= 0; i--) freeList.push(i);

// GPU attribute buffers
const positions = new Float32Array(MAX_PARTICLES * 3);
const colors = new Float32Array(MAX_PARTICLES * 3);
const alphas = new Float32Array(MAX_PARTICLES); // 0 => dead, discarded in shader

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
geometry.setDrawRange(0, MAX_PARTICLES);

const particleMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uSize: { value: 26.0 },
  },
  vertexShader: /* glsl */ `
    attribute vec3 aColor;
    attribute float aAlpha;
    varying vec3 vColor;
    varying float vAlpha;
    uniform float uSize;
    void main() {
      vColor = aColor;
      vAlpha = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = uSize * (1.0 / max(-mv.z, 0.001));
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      if (vAlpha <= 0.01) discard;            // dead particle
      vec2 c = gl_PointCoord - vec2(0.5);
      float d = length(c);
      if (d > 0.5) discard;                    // round point
      float soft = smoothstep(0.5, 0.15, d);
      gl_FragColor = vec4(vColor, soft * vAlpha);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const points = new THREE.Points(geometry, particleMaterial);
points.frustumCulled = false;
scene.add(points);

// Lifetime color ramp: young = hot cyan/white, old = warm orange/red.
const tmpColor = new THREE.Color();
function lifetimeColor(t: number, out: THREE.Color): void {
  const hue = THREE.MathUtils.lerp(0.5, 0.0, t); // 0.5 cyan -> 0.0 red
  const sat = 0.85;
  const lit = THREE.MathUtils.lerp(0.85, 0.45, t); // fade brightness with age
  out.setHSL(hue, sat, lit);
}

const spawnDir = new THREE.Vector3();
function spawnParticle(): void {
  const i = freeList.pop();
  if (i === undefined) return; // pool exhausted

  alive[i] = 1;
  age[i] = 0;
  life[i] = 2.2 + Math.random() * 1.6;

  // Emit from the nozzle mouth with a small radial jitter
  const r = Math.random() * 0.12;
  const a = Math.random() * Math.PI * 2;
  px[i] = EMITTER.x + Math.cos(a) * r;
  py[i] = EMITTER.y + 0.45;
  pz[i] = EMITTER.z + Math.sin(a) * r;

  // Strong upward velocity with a narrow cone of spread => arc, not random dots
  const speed = 7.5 + Math.random() * 2.5;
  const spread = 1.6; // horizontal spread factor
  spawnDir
    .set((Math.random() - 0.5) * spread, 1.0, (Math.random() - 0.5) * spread)
    .normalize();
  vx[i] = spawnDir.x * speed * 0.45;
  vy[i] = spawnDir.y * speed;
  vz[i] = spawnDir.z * speed * 0.45;
}

// ---------------------------------------------------------------------------
// Emission-rate control (visible UI)
// ---------------------------------------------------------------------------
let emissionRate = 900; // particles per second
let spawnAccumulator = 0;

const ui = document.createElement('div');
ui.style.cssText = [
  'position:fixed',
  'top:16px',
  'left:16px',
  'padding:14px 16px',
  'background:rgba(12,16,28,0.78)',
  'border:1px solid rgba(90,130,200,0.4)',
  'border-radius:10px',
  'color:#dfe8ff',
  'font:13px/1.4 system-ui,Segoe UI,Roboto,sans-serif',
  'backdrop-filter:blur(6px)',
  'user-select:none',
  'min-width:220px',
  'z-index:10',
].join(';');

const title = document.createElement('div');
title.textContent = 'Particle Fountain';
title.style.cssText = 'font-weight:700;font-size:14px;margin-bottom:8px;color:#9fe8ff';
ui.appendChild(title);

const label = document.createElement('label');
label.style.cssText = 'display:block;margin-bottom:6px';
const labelText = document.createElement('span');
const updateLabel = () => {
  labelText.textContent = `Emission rate: ${emissionRate} /s`;
};
updateLabel();
label.appendChild(labelText);
ui.appendChild(label);

const slider = document.createElement('input');
slider.type = 'range';
slider.min = '0';
slider.max = '3000';
slider.step = '50';
slider.value = String(emissionRate);
slider.style.cssText = 'width:100%;cursor:pointer;accent-color:#33ffff';
slider.addEventListener('input', () => {
  emissionRate = Number(slider.value);
  updateLabel();
});
ui.appendChild(slider);

const liveCount = document.createElement('div');
liveCount.style.cssText = 'margin-top:8px;font-size:12px;color:#8fa6d6';
ui.appendChild(liveCount);

const hint = document.createElement('div');
hint.style.cssText = 'margin-top:6px;font-size:11px;color:#5f7099';
hint.textContent = 'Drag to orbit · scroll to zoom';
ui.appendChild(hint);

document.body.appendChild(ui);

// ---------------------------------------------------------------------------
// Simulation + render loop
// ---------------------------------------------------------------------------
const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
const colAttr = geometry.getAttribute('aColor') as THREE.BufferAttribute;
const alphaAttr = geometry.getAttribute('aAlpha') as THREE.BufferAttribute;

const clock = new THREE.Clock();
let liveParticles = 0;

function update(dt: number): void {
  // Emit according to the controllable rate
  spawnAccumulator += emissionRate * dt;
  let toSpawn = Math.floor(spawnAccumulator);
  spawnAccumulator -= toSpawn;
  // Cap spawns per frame to avoid spikes if the tab was backgrounded
  toSpawn = Math.min(toSpawn, 400);
  for (let s = 0; s < toSpawn; s++) spawnParticle();

  liveParticles = 0;

  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (!alive[i]) {
      alphas[i] = 0;
      continue;
    }

    age[i] += dt;
    if (age[i] >= life[i]) {
      alive[i] = 0;
      alphas[i] = 0;
      freeList.push(i);
      continue;
    }

    // Integrate gravity
    vy[i] += GRAVITY * dt;
    px[i] += vx[i] * dt;
    py[i] += vy[i] * dt;
    pz[i] += vz[i] * dt;

    // Collide against the ground plane
    const floor = GROUND_Y + PARTICLE_RADIUS;
    if (py[i] < floor) {
      py[i] = floor;
      if (vy[i] < 0) {
        vy[i] = -vy[i] * RESTITUTION;
        vx[i] *= FRICTION;
        vz[i] *= FRICTION;
        // Kill nearly-stopped particles resting on the floor
        if (vy[i] < 0.6) {
          alive[i] = 0;
          alphas[i] = 0;
          freeList.push(i);
          continue;
        }
      }
    }

    const t = age[i] / life[i];

    // Write GPU buffers
    positions[i * 3] = px[i];
    positions[i * 3 + 1] = py[i];
    positions[i * 3 + 2] = pz[i];

    lifetimeColor(t, tmpColor);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;

    // Fade out near end of life
    alphas[i] = t > 0.8 ? (1.0 - t) / 0.2 : 1.0;

    liveParticles++;
  }

  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
  alphaAttr.needsUpdate = true;
}

function animate(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);

  // Subtle pulse on the emissive ring so the emitter reads as active
  const tNow = clock.elapsedTime;
  ring.scale.setScalar(1 + Math.sin(tNow * 4) * 0.06);

  controls.update();
  renderer.render(scene, camera);

  liveCount.textContent = `Live particles: ${liveParticles}`;
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
