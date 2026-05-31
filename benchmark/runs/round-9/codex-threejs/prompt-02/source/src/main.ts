import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app element');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#08111f';
document.body.style.fontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

app.style.width = '100vw';
app.style.height = '100vh';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08111f);
scene.fog = new THREE.Fog(0x08111f, 10, 28);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 80);
camera.position.set(6.5, 5.2, 8.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.8, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 5;
controls.maxDistance = 18;

const hemiLight = new THREE.HemisphereLight(0xc8e7ff, 0x263141, 1.8);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(4, 8, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1536, 1536);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 22;
keyLight.shadow.camera.left = -8;
keyLight.shadow.camera.right = 8;
keyLight.shadow.camera.top = 8;
keyLight.shadow.camera.bottom = -8;
scene.add(keyLight);

const groundGeometry = new THREE.PlaneGeometry(18, 18);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x182638,
  roughness: 0.72,
  metalness: 0.04,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(18, 36, 0x5f7fa3, 0x283b55);
grid.position.y = 0.012;
scene.add(grid);

const emitterGroup = new THREE.Group();
scene.add(emitterGroup);

const base = new THREE.Mesh(
  new THREE.CylinderGeometry(0.48, 0.62, 0.18, 36),
  new THREE.MeshStandardMaterial({ color: 0x516274, metalness: 0.2, roughness: 0.45 }),
);
base.position.y = 0.09;
base.castShadow = true;
base.receiveShadow = true;
emitterGroup.add(base);

const nozzle = new THREE.Mesh(
  new THREE.CylinderGeometry(0.17, 0.28, 0.72, 32),
  new THREE.MeshStandardMaterial({ color: 0x93a8b9, metalness: 0.45, roughness: 0.28 }),
);
nozzle.position.y = 0.54;
nozzle.castShadow = true;
emitterGroup.add(nozzle);

const glowRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.24, 0.025, 12, 48),
  new THREE.MeshBasicMaterial({ color: 0xfff1a6 }),
);
glowRing.position.y = 0.93;
glowRing.rotation.x = Math.PI / 2;
emitterGroup.add(glowRing);

const emitterLight = new THREE.PointLight(0xffbc66, 1.5, 5);
emitterLight.position.set(0, 0.95, 0);
scene.add(emitterLight);

const maxParticles = 1800;
const positions = new Float32Array(maxParticles * 3);
const colors = new Float32Array(maxParticles * 3);
const sizes = new Float32Array(maxParticles);
const velocities: THREE.Vector3[] = [];
const ages = new Float32Array(maxParticles);
const lifetimes = new Float32Array(maxParticles);
const active = new Uint8Array(maxParticles);

for (let i = 0; i < maxParticles; i += 1) {
  velocities.push(new THREE.Vector3());
  positions[i * 3 + 1] = -50;
}

const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

const particleMaterial = new THREE.PointsMaterial({
  size: 0.085,
  vertexColors: true,
  transparent: true,
  opacity: 0.92,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const particles = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particles);

const earlyColor = new THREE.Color(0xfff6a6);
const middleColor = new THREE.Color(0x4fd5ff);
const lateColor = new THREE.Color(0x6956ff);
const scratchColor = new THREE.Color();

function colorByLife(normalizedAge: number): THREE.Color {
  if (normalizedAge < 0.45) {
    return scratchColor.copy(earlyColor).lerp(middleColor, normalizedAge / 0.45);
  }

  return scratchColor.copy(middleColor).lerp(lateColor, (normalizedAge - 0.45) / 0.55);
}

function spawnParticle(index: number) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * 0.08;
  positions[index * 3] = Math.cos(angle) * radius;
  positions[index * 3 + 1] = 0.95;
  positions[index * 3 + 2] = Math.sin(angle) * radius;

  const spread = 0.72 + Math.random() * 0.62;
  velocities[index].set(
    Math.cos(angle) * spread + (Math.random() - 0.5) * 0.35,
    5.9 + Math.random() * 2.1,
    Math.sin(angle) * spread + (Math.random() - 0.5) * 0.35,
  );

  ages[index] = 0;
  lifetimes[index] = 2.0 + Math.random() * 1.4;
  active[index] = 1;
}

let nextParticle = 0;
function emit(count: number) {
  for (let i = 0; i < count; i += 1) {
    spawnParticle(nextParticle);
    nextParticle = (nextParticle + 1) % maxParticles;
  }
}

const hud = document.createElement('section');
hud.style.position = 'fixed';
hud.style.left = '20px';
hud.style.top = '20px';
hud.style.width = 'min(340px, calc(100vw - 40px))';
hud.style.padding = '14px 16px';
hud.style.border = '1px solid rgba(180, 214, 255, 0.28)';
hud.style.borderRadius = '8px';
hud.style.background = 'rgba(8, 17, 31, 0.76)';
hud.style.backdropFilter = 'blur(10px)';
hud.style.color = '#f4f8ff';
hud.style.boxSizing = 'border-box';
hud.style.boxShadow = '0 16px 40px rgba(0, 0, 0, 0.28)';
hud.innerHTML = `
  <div style="font-size: 12px; letter-spacing: 0; color: #a9bdd4;">Particle fountain</div>
  <label for="rate" style="display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-top: 8px; font-size: 14px;">
    <span>Emission rate</span>
    <strong id="rateValue" style="font-variant-numeric: tabular-nums;">360 / sec</strong>
  </label>
  <input id="rate" type="range" min="60" max="760" step="20" value="360" style="width: 100%; accent-color: #4fd5ff; margin-top: 10px;" />
`;
document.body.appendChild(hud);

const rateInput = document.querySelector<HTMLInputElement>('#rate');
const rateValue = document.querySelector<HTMLElement>('#rateValue');

if (!rateInput || !rateValue) {
  throw new Error('Missing emission rate control');
}

let emissionRate = Number(rateInput.value);
let emissionCarry = 0;

rateInput.addEventListener('input', () => {
  emissionRate = Number(rateInput.value);
  rateValue.textContent = `${emissionRate} / sec`;
});

const collisionFlash = new THREE.Mesh(
  new THREE.RingGeometry(0.52, 0.58, 64),
  new THREE.MeshBasicMaterial({
    color: 0x74d8ff,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
  }),
);
collisionFlash.rotation.x = -Math.PI / 2;
collisionFlash.position.y = 0.02;
scene.add(collisionFlash);

const clock = new THREE.Clock();

function animate() {
  const delta = Math.min(clock.getDelta(), 0.033);
  const time = clock.elapsedTime;

  emissionCarry += emissionRate * delta;
  const spawnCount = Math.floor(emissionCarry);
  if (spawnCount > 0) {
    emit(spawnCount);
    emissionCarry -= spawnCount;
  }

  let collisionEnergy = 0;

  for (let i = 0; i < maxParticles; i += 1) {
    if (!active[i]) {
      continue;
    }

    ages[i] += delta;
    if (ages[i] > lifetimes[i]) {
      active[i] = 0;
      positions[i * 3 + 1] = -50;
      continue;
    }

    velocities[i].y -= 7.7 * delta;
    positions[i * 3] += velocities[i].x * delta;
    positions[i * 3 + 1] += velocities[i].y * delta;
    positions[i * 3 + 2] += velocities[i].z * delta;

    if (positions[i * 3 + 1] <= 0.045 && velocities[i].y < 0) {
      positions[i * 3 + 1] = 0.045;
      velocities[i].y *= -0.34;
      velocities[i].x *= 0.78;
      velocities[i].z *= 0.78;
      collisionEnergy += 1;
    }

    const normalizedAge = ages[i] / lifetimes[i];
    const color = colorByLife(normalizedAge);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    sizes[i] = 1 - normalizedAge * 0.55;
  }

  glowRing.scale.setScalar(1 + Math.sin(time * 8) * 0.04);
  emitterLight.intensity = 1.3 + Math.sin(time * 9) * 0.25;
  collisionFlash.material.opacity = Math.min(0.42, collisionEnergy * 0.012);
  collisionFlash.scale.setScalar(1 + Math.min(1.4, collisionEnergy * 0.018));

  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.color.needsUpdate = true;
  particleGeometry.attributes.size.needsUpdate = true;

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

emit(180);
animate();
