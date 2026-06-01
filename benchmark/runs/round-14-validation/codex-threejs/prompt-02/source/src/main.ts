import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app element');
}

const styles = document.createElement('style');
styles.textContent = `
  html, body, #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #10151a;
    color: #eef6ff;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  canvas {
    display: block;
  }

  .panel {
    position: fixed;
    left: 18px;
    bottom: 18px;
    width: min(330px, calc(100vw - 36px));
    padding: 14px 16px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    background: rgba(14, 20, 27, 0.78);
    box-shadow: 0 14px 38px rgba(0, 0, 0, 0.34);
    backdrop-filter: blur(10px);
  }

  .panel-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }

  .panel label {
    font-size: 13px;
    font-weight: 680;
    line-height: 1.2;
  }

  .rate-value {
    min-width: 78px;
    text-align: right;
    color: #8fe3ff;
    font-variant-numeric: tabular-nums;
    font-size: 13px;
  }

  input[type="range"] {
    width: 100%;
    accent-color: #33c6ff;
  }
`;
document.head.appendChild(styles);

const panel = document.createElement('div');
panel.className = 'panel';
panel.innerHTML = `
  <div class="panel-row">
    <label for="emission-rate">Emission rate</label>
    <span class="rate-value">120 / sec</span>
  </div>
  <input id="emission-rate" type="range" min="20" max="260" value="120" step="10" />
`;
app.appendChild(panel);

const rateInput = panel.querySelector<HTMLInputElement>('#emission-rate');
const rateValue = panel.querySelector<HTMLSpanElement>('.rate-value');

if (!rateInput || !rateValue) {
  throw new Error('Emission-rate control was not created');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10151a);
scene.fog = new THREE.Fog(0x10151a, 12, 34);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 80);
camera.position.set(5.2, 4.4, 7.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.8, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 4.5;
controls.maxDistance = 16;

const hemiLight = new THREE.HemisphereLight(0xbddcff, 0x2b332c, 2.4);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(3.5, 7, 4.5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -8;
keyLight.shadow.camera.right = 8;
keyLight.shadow.camera.top = 8;
keyLight.shadow.camera.bottom = -8;
scene.add(keyLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 18),
  new THREE.MeshStandardMaterial({
    color: 0x202923,
    roughness: 0.76,
    metalness: 0.04,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(18, 36, 0x6f8d78, 0x334338);
grid.position.y = 0.006;
scene.add(grid);

const emitterGroup = new THREE.Group();
scene.add(emitterGroup);

const base = new THREE.Mesh(
  new THREE.CylinderGeometry(0.5, 0.68, 0.2, 40),
  new THREE.MeshStandardMaterial({ color: 0x2f3d46, roughness: 0.48, metalness: 0.55 }),
);
base.position.y = 0.1;
base.castShadow = true;
base.receiveShadow = true;
emitterGroup.add(base);

const nozzle = new THREE.Mesh(
  new THREE.CylinderGeometry(0.16, 0.28, 0.5, 32),
  new THREE.MeshStandardMaterial({ color: 0x8bb7c8, roughness: 0.32, metalness: 0.72 }),
);
nozzle.position.y = 0.45;
nozzle.castShadow = true;
emitterGroup.add(nozzle);

const emitterGlow = new THREE.Mesh(
  new THREE.TorusGeometry(0.3, 0.025, 10, 42),
  new THREE.MeshBasicMaterial({ color: 0x46d7ff }),
);
emitterGlow.position.y = 0.72;
emitterGlow.rotation.x = Math.PI / 2;
emitterGroup.add(emitterGlow);

const emitterLight = new THREE.PointLight(0x42ccff, 2.5, 4);
emitterLight.position.set(0, 0.78, 0);
scene.add(emitterLight);

const splashRing = new THREE.Mesh(
  new THREE.RingGeometry(1.35, 1.4, 80),
  new THREE.MeshBasicMaterial({ color: 0x2c7590, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
);
splashRing.rotation.x = -Math.PI / 2;
splashRing.position.y = 0.012;
scene.add(splashRing);

const maxParticles = 2400;
const positions = new Float32Array(maxParticles * 3);
const colors = new Float32Array(maxParticles * 3);
const sizes = new Float32Array(maxParticles);
const velocities: THREE.Vector3[] = Array.from({ length: maxParticles }, () => new THREE.Vector3());
const ages = new Float32Array(maxParticles);
const lifetimes = new Float32Array(maxParticles);
const active = new Uint8Array(maxParticles);
let cursor = 0;
let emissionCarry = 0;
let emissionRate = Number(rateInput.value);

const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

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
      gl_PointSize = size * (300.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;

    void main() {
      vec2 pointUv = gl_PointCoord - vec2(0.5);
      float strength = 1.0 - smoothstep(0.18, 0.5, length(pointUv));
      if (strength <= 0.01) {
        discard;
      }
      gl_FragColor = vec4(vColor, strength * 0.88);
    }
  `,
});

const particlePoints = new THREE.Points(particleGeometry, particleMaterial);
particlePoints.frustumCulled = false;
scene.add(particlePoints);

const startColor = new THREE.Color(0x62e9ff);
const middleColor = new THREE.Color(0xffe36d);
const endColor = new THREE.Color(0xff6f45);
const tempColor = new THREE.Color();
const gravity = new THREE.Vector3(0, -7.8, 0);

function randomSigned(scale: number): number {
  return (Math.random() - 0.5) * scale;
}

function spawnParticle(): void {
  const index = cursor;
  cursor = (cursor + 1) % maxParticles;

  active[index] = 1;
  ages[index] = 0;
  lifetimes[index] = 2.15 + Math.random() * 0.75;

  const i3 = index * 3;
  positions[i3] = randomSigned(0.08);
  positions[i3 + 1] = 0.76;
  positions[i3 + 2] = randomSigned(0.08);

  const angle = Math.random() * Math.PI * 2;
  const radial = 0.75 + Math.random() * 1.15;
  velocities[index].set(Math.cos(angle) * radial, 6.8 + Math.random() * 1.55, Math.sin(angle) * radial);

  sizes[index] = 0.075 + Math.random() * 0.05;
}

function updateParticleColor(index: number): void {
  const lifeProgress = THREE.MathUtils.clamp(ages[index] / lifetimes[index], 0, 1);

  if (lifeProgress < 0.48) {
    tempColor.copy(startColor).lerp(middleColor, lifeProgress / 0.48);
  } else {
    tempColor.copy(middleColor).lerp(endColor, (lifeProgress - 0.48) / 0.52);
  }

  const fade = 1 - Math.max(0, lifeProgress - 0.78) / 0.22;
  const i3 = index * 3;
  colors[i3] = tempColor.r * fade;
  colors[i3 + 1] = tempColor.g * fade;
  colors[i3 + 2] = tempColor.b * fade;
}

function updateParticles(deltaTime: number): void {
  emissionCarry += emissionRate * deltaTime;

  while (emissionCarry >= 1) {
    spawnParticle();
    emissionCarry -= 1;
  }

  for (let i = 0; i < maxParticles; i += 1) {
    if (active[i] === 0) {
      continue;
    }

    ages[i] += deltaTime;

    if (ages[i] >= lifetimes[i]) {
      active[i] = 0;
      sizes[i] = 0;
      continue;
    }

    velocities[i].addScaledVector(gravity, deltaTime);

    const i3 = i * 3;
    positions[i3] += velocities[i].x * deltaTime;
    positions[i3 + 1] += velocities[i].y * deltaTime;
    positions[i3 + 2] += velocities[i].z * deltaTime;

    if (positions[i3 + 1] < 0.055) {
      positions[i3 + 1] = 0.055;
      velocities[i].y = Math.abs(velocities[i].y) * 0.34;
      velocities[i].x *= 0.72;
      velocities[i].z *= 0.72;
      ages[i] = Math.max(ages[i], lifetimes[i] * 0.72);
    }

    updateParticleColor(i);
  }

  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.color.needsUpdate = true;
  particleGeometry.attributes.size.needsUpdate = true;
}

rateInput.addEventListener('input', () => {
  emissionRate = Number(rateInput.value);
  rateValue.textContent = `${emissionRate} / sec`;
});

function resize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  particleMaterial.uniforms.pixelRatio.value = renderer.getPixelRatio();
}

window.addEventListener('resize', resize);

const clock = new THREE.Clock();

function animate(): void {
  const deltaTime = Math.min(clock.getDelta(), 0.033);

  updateParticles(deltaTime);
  emitterGlow.rotation.z += deltaTime * 1.3;
  emitterLight.intensity = 2.1 + Math.sin(clock.elapsedTime * 6) * 0.35;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

for (let i = 0; i < 180; i += 1) {
  spawnParticle();
  ages[i] = Math.random() * lifetimes[i] * 0.82;
  updateParticleColor(i);
}

animate();
