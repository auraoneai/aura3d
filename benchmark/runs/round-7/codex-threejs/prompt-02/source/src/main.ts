import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root element');
}

app.innerHTML = `
  <div class="viewport">
    <canvas class="scene"></canvas>
    <section class="control-panel" aria-label="Particle fountain controls">
      <div>
        <p class="label">Emission rate</p>
        <p class="value"><span id="rate-value">180</span> particles/s</p>
      </div>
      <input id="rate" type="range" min="25" max="420" value="180" step="5" aria-label="Emission rate" />
      <div class="legend" aria-label="Lifetime color legend">
        <span class="legend-birth">new</span>
        <span class="legend-mid">midlife</span>
        <span class="legend-old">fade</span>
      </div>
    </section>
  </div>
`;

const canvas = app.querySelector<HTMLCanvasElement>('canvas.scene');
const rateSlider = app.querySelector<HTMLInputElement>('#rate');
const rateValue = app.querySelector<HTMLSpanElement>('#rate-value');

if (!canvas || !rateSlider || !rateValue) {
  throw new Error('Missing fountain UI elements');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071018);
scene.fog = new THREE.Fog(0x071018, 10, 28);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 80);
camera.position.set(5.4, 4.2, 7.6);
camera.lookAt(0, 1.9, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.4, 0);
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 5;
controls.maxDistance = 18;

scene.add(new THREE.HemisphereLight(0xb9dcff, 0x27313a, 1.8));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(4, 7, 3);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(6.5, 96),
  new THREE.MeshStandardMaterial({
    color: 0x24333a,
    roughness: 0.74,
    metalness: 0.05,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(13, 26, 0x668891, 0x33484f);
grid.position.y = 0.012;
scene.add(grid);

const emitter = new THREE.Group();
const nozzle = new THREE.Mesh(
  new THREE.CylinderGeometry(0.28, 0.42, 0.5, 40),
  new THREE.MeshStandardMaterial({
    color: 0x18252e,
    emissive: 0x0d3042,
    metalness: 0.45,
    roughness: 0.32,
  }),
);
nozzle.position.y = 0.25;
nozzle.castShadow = true;
emitter.add(nozzle);

const lip = new THREE.Mesh(
  new THREE.TorusGeometry(0.38, 0.055, 12, 48),
  new THREE.MeshStandardMaterial({
    color: 0x74e9ff,
    emissive: 0x1fb8ff,
    emissiveIntensity: 1.7,
    metalness: 0.15,
    roughness: 0.24,
  }),
);
lip.position.y = 0.52;
lip.rotation.x = Math.PI / 2;
emitter.add(lip);

const core = new THREE.PointLight(0x5be7ff, 3, 4);
core.position.y = 0.62;
emitter.add(core);
scene.add(emitter);

const maxParticles = 1800;
const positions = new Float32Array(maxParticles * 3);
const colors = new Float32Array(maxParticles * 3);
const sizes = new Float32Array(maxParticles);
const velocity = Array.from({ length: maxParticles }, () => new THREE.Vector3());
const age = new Float32Array(maxParticles);
const life = new Float32Array(maxParticles);
const active = new Uint8Array(maxParticles);
const color = new THREE.Color();
let cursor = 0;
let emitAccumulator = 0;
let emissionRate = Number(rateSlider.value);

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

const particleMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexColors: true,
  uniforms: {
    pixelRatio: { value: renderer.getPixelRatio() },
  },
  vertexShader: `
    attribute float size;
    varying vec3 vColor;

    void main() {
      vColor = color;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (260.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;

    void main() {
      vec2 uv = gl_PointCoord - vec2(0.5);
      float falloff = smoothstep(0.5, 0.08, length(uv));
      if (falloff <= 0.01) {
        discard;
      }
      gl_FragColor = vec4(vColor, falloff * 0.92);
    }
  `,
});

const particles = new THREE.Points(geometry, particleMaterial);
scene.add(particles);

const trailMaterial = new THREE.LineBasicMaterial({
  color: 0x6bb7ff,
  transparent: true,
  opacity: 0.24,
});
const trailGeometry = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, 0.55, 0),
  new THREE.Vector3(-1.15, 2.9, -0.25),
  new THREE.Vector3(-2.0, 0.55, -0.48),
  new THREE.Vector3(0, 0.55, 0),
  new THREE.Vector3(1.22, 2.75, 0.25),
  new THREE.Vector3(2.05, 0.55, 0.46),
]);
scene.add(new THREE.Line(trailGeometry, trailMaterial));

function spawnParticle(): void {
  const index = cursor;
  cursor = (cursor + 1) % maxParticles;

  const angle = Math.random() * Math.PI * 2;
  const spread = 0.34 + Math.random() * 0.64;
  const speed = 4.9 + Math.random() * 2.1;
  const drift = new THREE.Vector3(Math.cos(angle) * spread, 1, Math.sin(angle) * spread * 0.72).normalize();

  positions[index * 3] = (Math.random() - 0.5) * 0.18;
  positions[index * 3 + 1] = 0.62;
  positions[index * 3 + 2] = (Math.random() - 0.5) * 0.18;
  velocity[index].copy(drift.multiplyScalar(speed));
  age[index] = 0;
  life[index] = 2.1 + Math.random() * 1.1;
  sizes[index] = 0.045 + Math.random() * 0.035;
  active[index] = 1;
}

function colorForLifetime(t: number): THREE.Color {
  if (t < 0.45) {
    color.setHSL(0.55 + t * 0.14, 0.96, 0.6);
  } else if (t < 0.78) {
    color.setHSL(0.1, 0.95, 0.58);
  } else {
    color.setHSL(0.95, 0.88, 0.52 - (t - 0.78) * 0.7);
  }

  return color;
}

function updateParticles(delta: number): void {
  emitAccumulator += emissionRate * delta;

  while (emitAccumulator >= 1) {
    spawnParticle();
    emitAccumulator -= 1;
  }

  for (let i = 0; i < maxParticles; i += 1) {
    if (!active[i]) {
      continue;
    }

    age[i] += delta;
    const normalizedAge = age[i] / life[i];

    if (normalizedAge >= 1) {
      active[i] = 0;
      positions[i * 3 + 1] = -20;
      continue;
    }

    velocity[i].y -= 5.9 * delta;
    velocity[i].x += Math.sin(age[i] * 5 + i) * 0.18 * delta;
    velocity[i].z += Math.cos(age[i] * 4 + i * 0.7) * 0.16 * delta;

    positions[i * 3] += velocity[i].x * delta;
    positions[i * 3 + 1] += velocity[i].y * delta;
    positions[i * 3 + 2] += velocity[i].z * delta;

    if (positions[i * 3 + 1] < 0.055) {
      positions[i * 3 + 1] = 0.055;
      velocity[i].y = Math.abs(velocity[i].y) * 0.28;
      velocity[i].x *= 0.72;
      velocity[i].z *= 0.72;
    }

    const c = colorForLifetime(normalizedAge);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    sizes[i] = (0.07 - normalizedAge * 0.033) * (1 + Math.sin(age[i] * 13) * 0.1);
  }

  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
  geometry.attributes.size.needsUpdate = true;
}

rateSlider.addEventListener('input', () => {
  emissionRate = Number(rateSlider.value);
  rateValue.textContent = rateSlider.value;
});

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  particleMaterial.uniforms.pixelRatio.value = renderer.getPixelRatio();
}

window.addEventListener('resize', resize);

const clock = new THREE.Clock();

function animate(): void {
  const delta = Math.min(clock.getDelta(), 0.033);
  updateParticles(delta);
  lip.rotation.z += delta * 0.9;
  core.intensity = 2.4 + Math.sin(clock.elapsedTime * 7) * 0.6;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

for (let i = 0; i < 180; i += 1) {
  spawnParticle();
  age[i] = Math.random() * life[i] * 0.9;
}

animate();
