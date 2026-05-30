import * as THREE from 'three';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root element');
}

const styles = document.createElement('style');
styles.textContent = `
  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #101216;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .hud {
    position: fixed;
    left: 18px;
    top: 18px;
    width: min(330px, calc(100vw - 36px));
    color: #f7fafc;
    background: rgb(13 18 25 / 86%);
    border: 1px solid rgb(255 255 255 / 16%);
    border-radius: 8px;
    box-shadow: 0 18px 42px rgb(0 0 0 / 32%);
    padding: 14px 16px 16px;
    backdrop-filter: blur(10px);
  }

  .hud__row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 10px;
  }

  .hud label {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .hud output {
    min-width: 86px;
    text-align: right;
    color: #9de5ff;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  .hud input[type="range"] {
    width: 100%;
    accent-color: #00b8ff;
  }

  .legend {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-top: 12px;
    font-size: 11px;
    color: #c9d2dc;
  }

  .legend span::before {
    content: "";
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 5px;
    border-radius: 50%;
    vertical-align: -1px;
  }

  .legend span:nth-child(1)::before { background: #fff5a6; }
  .legend span:nth-child(2)::before { background: #20c9ff; }
  .legend span:nth-child(3)::before { background: #7c5cff; }
`;
document.head.appendChild(styles);

const hud = document.createElement('div');
hud.className = 'hud';
hud.innerHTML = `
  <div class="hud__row">
    <label for="emission-rate">Emission rate</label>
    <output id="emission-value">180 particles/s</output>
  </div>
  <input id="emission-rate" type="range" min="30" max="420" step="10" value="180" />
  <div class="legend" aria-hidden="true">
    <span>new</span>
    <span>falling</span>
    <span>fading</span>
  </div>
`;
app.appendChild(hud);

const rateInput = hud.querySelector<HTMLInputElement>('#emission-rate');
const rateOutput = hud.querySelector<HTMLOutputElement>('#emission-value');

if (!rateInput || !rateOutput) {
  throw new Error('Missing emission controls');
}

let emissionRate = Number(rateInput.value);
rateInput.addEventListener('input', () => {
  emissionRate = Number(rateInput.value);
  rateOutput.value = `${emissionRate} particles/s`;
});
rateOutput.value = `${emissionRate} particles/s`;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101216);
scene.fog = new THREE.Fog(0x101216, 8, 24);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 80);
camera.position.set(5.6, 4.1, 7.4);
camera.lookAt(0, 1.5, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xdcecff, 0x1b222a, 2.1);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(4, 7, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 18, 36, 36),
  new THREE.MeshStandardMaterial({
    color: 0x252b31,
    roughness: 0.82,
    metalness: 0.05,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(18, 18, 0x50606e, 0x323a42);
grid.position.y = 0.004;
scene.add(grid);

const emitterGroup = new THREE.Group();
scene.add(emitterGroup);

const emitterBase = new THREE.Mesh(
  new THREE.CylinderGeometry(0.34, 0.48, 0.18, 48),
  new THREE.MeshStandardMaterial({ color: 0x0c8fb3, metalness: 0.45, roughness: 0.28 }),
);
emitterBase.position.y = 0.09;
emitterBase.castShadow = true;
emitterGroup.add(emitterBase);

const nozzle = new THREE.Mesh(
  new THREE.CylinderGeometry(0.13, 0.22, 0.46, 32),
  new THREE.MeshStandardMaterial({ color: 0xd7eef4, metalness: 0.7, roughness: 0.22 }),
);
nozzle.position.y = 0.38;
nozzle.castShadow = true;
emitterGroup.add(nozzle);

const glow = new THREE.Mesh(
  new THREE.TorusGeometry(0.3, 0.018, 12, 64),
  new THREE.MeshBasicMaterial({ color: 0x38dfff }),
);
glow.position.y = 0.62;
glow.rotation.x = Math.PI / 2;
emitterGroup.add(glow);

const maxParticles = 1400;
const positions = new Float32Array(maxParticles * 3);
const colors = new Float32Array(maxParticles * 3);
const sizes = new Float32Array(maxParticles);
const velocities = Array.from({ length: maxParticles }, () => new THREE.Vector3());
const ages = new Float32Array(maxParticles);
const lifetimes = new Float32Array(maxParticles);
const active = new Uint8Array(maxParticles);

const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

const particleMaterial = new THREE.PointsMaterial({
  size: 0.085,
  vertexColors: true,
  transparent: true,
  opacity: 0.94,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const particleCloud = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particleCloud);

const warm = new THREE.Color(0xfff1a3);
const cyan = new THREE.Color(0x20c9ff);
const violet = new THREE.Color(0x745cff);
const splash = new THREE.Color(0x9de5ff);
const workingColor = new THREE.Color();

let cursor = 0;
let emissionCarry = 0;

function spawnParticle(): void {
  const i = cursor;
  cursor = (cursor + 1) % maxParticles;

  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * 0.12;
  positions[i * 3] = Math.cos(angle) * radius;
  positions[i * 3 + 1] = 0.64;
  positions[i * 3 + 2] = Math.sin(angle) * radius;

  const spread = 1.05;
  velocities[i].set(
    (Math.random() - 0.5) * spread,
    5.0 + Math.random() * 2.4,
    (Math.random() - 0.5) * spread,
  );
  ages[i] = 0;
  lifetimes[i] = 2.2 + Math.random() * 1.2;
  active[i] = 1;
  sizes[i] = 1;
}

function updateColor(i: number, normalizedAge: number, isSplashing: boolean): void {
  if (isSplashing) {
    workingColor.copy(splash);
  } else if (normalizedAge < 0.42) {
    workingColor.copy(warm).lerp(cyan, normalizedAge / 0.42);
  } else {
    workingColor.copy(cyan).lerp(violet, (normalizedAge - 0.42) / 0.58);
  }

  const fade = Math.max(0.12, 1 - normalizedAge * 0.72);
  colors[i * 3] = workingColor.r * fade;
  colors[i * 3 + 1] = workingColor.g * fade;
  colors[i * 3 + 2] = workingColor.b * fade;
}

function updateParticles(delta: number): void {
  emissionCarry += emissionRate * delta;
  const spawnCount = Math.floor(emissionCarry);
  emissionCarry -= spawnCount;

  for (let i = 0; i < spawnCount; i += 1) {
    spawnParticle();
  }

  for (let i = 0; i < maxParticles; i += 1) {
    if (!active[i]) {
      positions[i * 3 + 1] = -1000;
      continue;
    }

    ages[i] += delta;
    if (ages[i] >= lifetimes[i]) {
      active[i] = 0;
      positions[i * 3 + 1] = -1000;
      continue;
    }

    velocities[i].y -= 6.6 * delta;
    positions[i * 3] += velocities[i].x * delta;
    positions[i * 3 + 1] += velocities[i].y * delta;
    positions[i * 3 + 2] += velocities[i].z * delta;

    let isSplashing = false;
    if (positions[i * 3 + 1] <= 0.055) {
      positions[i * 3 + 1] = 0.055;
      velocities[i].y = Math.abs(velocities[i].y) * 0.28;
      velocities[i].x *= 1.55;
      velocities[i].z *= 1.55;
      isSplashing = true;
      ages[i] = Math.max(ages[i], lifetimes[i] * 0.76);
    }

    const t = ages[i] / lifetimes[i];
    sizes[i] = 1.12 - t * 0.55;
    updateColor(i, t, isSplashing);
  }

  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.color.needsUpdate = true;
  particleGeometry.attributes.size.needsUpdate = true;
}

const clock = new THREE.Clock();

function animate(): void {
  const delta = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.elapsedTime;

  glow.scale.setScalar(1 + Math.sin(elapsed * 7) * 0.06);
  emitterGroup.rotation.y = Math.sin(elapsed * 0.7) * 0.08;
  updateParticles(delta);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
