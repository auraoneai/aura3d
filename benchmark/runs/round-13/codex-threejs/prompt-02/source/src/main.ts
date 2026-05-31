import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app container');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#111720';
document.body.style.fontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

app.style.width = '100vw';
app.style.height = '100vh';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111720);
scene.fog = new THREE.Fog(0x111720, 8, 26);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 80);
camera.position.set(5.6, 4.1, 7.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.5, 0);
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 4;
controls.maxDistance = 18;

const hemiLight = new THREE.HemisphereLight(0xaecaff, 0x1e2424, 1.4);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(4, 7, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 22;
keyLight.shadow.camera.left = -8;
keyLight.shadow.camera.right = 8;
keyLight.shadow.camera.top = 8;
keyLight.shadow.camera.bottom = -8;
scene.add(keyLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 18, 36, 36),
  new THREE.MeshStandardMaterial({
    color: 0x28333c,
    roughness: 0.74,
    metalness: 0.02,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(18, 36, 0x6e8795, 0x384753);
grid.position.y = 0.012;
grid.material.transparent = true;
grid.material.opacity = 0.36;
scene.add(grid);

const fountainBase = new THREE.Group();

const basin = new THREE.Mesh(
  new THREE.CylinderGeometry(1.08, 1.24, 0.22, 64),
  new THREE.MeshStandardMaterial({ color: 0x52616c, roughness: 0.44, metalness: 0.25 }),
);
basin.position.y = 0.11;
basin.castShadow = true;
basin.receiveShadow = true;
fountainBase.add(basin);

const emitterNozzle = new THREE.Mesh(
  new THREE.CylinderGeometry(0.12, 0.18, 0.64, 32),
  new THREE.MeshStandardMaterial({ color: 0xe5edf4, roughness: 0.24, metalness: 0.62 }),
);
emitterNozzle.position.y = 0.43;
emitterNozzle.castShadow = true;
emitterNozzle.receiveShadow = true;
fountainBase.add(emitterNozzle);

const emitterGlow = new THREE.Mesh(
  new THREE.SphereGeometry(0.18, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0x66f1ff, transparent: true, opacity: 0.82 }),
);
emitterGlow.position.y = 0.79;
fountainBase.add(emitterGlow);

scene.add(fountainBase);

const maxParticles = 1400;
const positions = new Float32Array(maxParticles * 3);
const colors = new Float32Array(maxParticles * 3);
const sizes = new Float32Array(maxParticles);
const velocities: THREE.Vector3[] = Array.from({ length: maxParticles }, () => new THREE.Vector3());
const ages = new Float32Array(maxParticles);
const lifetimes = new Float32Array(maxParticles);
const alive = new Uint8Array(maxParticles);

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
    uniform float pixelRatio;
    varying vec3 vColor;

    void main() {
      vColor = color;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * pixelRatio * (300.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;

    void main() {
      vec2 centered = gl_PointCoord - vec2(0.5);
      float radius = length(centered);
      float alpha = smoothstep(0.5, 0.18, radius);
      if (alpha <= 0.01) {
        discard;
      }
      gl_FragColor = vec4(vColor, alpha);
    }
  `,
});

const particles = new THREE.Points(particleGeometry, particleMaterial);
particles.frustumCulled = false;
scene.add(particles);

const trailCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.2, 0.8, 0),
  new THREE.Vector3(-0.65, 3.25, 0.18),
  new THREE.Vector3(-1.2, 4.3, 0.04),
  new THREE.Vector3(-1.85, 2.2, -0.15),
  new THREE.Vector3(-2.15, 0.16, -0.06),
]);
const arcGuide = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(trailCurve.getPoints(60)),
  new THREE.LineDashedMaterial({ color: 0x4ad4ff, transparent: true, opacity: 0.38, dashSize: 0.18, gapSize: 0.14 }),
);
arcGuide.computeLineDistances();
scene.add(arcGuide);

let emissionRate = 260;
let spawnAccumulator = 0;
let nextParticle = 0;

const hot = new THREE.Color(0xfff06a);
const mid = new THREE.Color(0x33ddff);
const old = new THREE.Color(0x7b62ff);
const tempColor = new THREE.Color();
const emitterPosition = new THREE.Vector3(0, 0.82, 0);
const gravity = new THREE.Vector3(0, -5.9, 0);
const clock = new THREE.Clock();

function spawnParticle(): void {
  const i = nextParticle;
  nextParticle = (nextParticle + 1) % maxParticles;

  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * 0.08;
  const sideLean = new THREE.Vector3(Math.cos(angle) * 0.95, 0, Math.sin(angle) * 0.95);
  const positionIndex = i * 3;

  positions[positionIndex] = emitterPosition.x + Math.cos(angle) * radius;
  positions[positionIndex + 1] = emitterPosition.y;
  positions[positionIndex + 2] = emitterPosition.z + Math.sin(angle) * radius;

  velocities[i].set(
    sideLean.x * (0.95 + Math.random() * 0.9),
    5.9 + Math.random() * 2.2,
    sideLean.z * (0.95 + Math.random() * 0.9),
  );
  ages[i] = 0;
  lifetimes[i] = 2.4 + Math.random() * 1.4;
  sizes[i] = 0.07 + Math.random() * 0.055;
  alive[i] = 1;
}

function updateParticles(deltaTime: number): void {
  spawnAccumulator += emissionRate * deltaTime;
  const spawnCount = Math.min(80, Math.floor(spawnAccumulator));
  spawnAccumulator -= spawnCount;

  for (let i = 0; i < spawnCount; i += 1) {
    spawnParticle();
  }

  for (let i = 0; i < maxParticles; i += 1) {
    const positionIndex = i * 3;

    if (!alive[i]) {
      positions[positionIndex + 1] = -1000;
      continue;
    }

    ages[i] += deltaTime;
    if (ages[i] >= lifetimes[i]) {
      alive[i] = 0;
      positions[positionIndex + 1] = -1000;
      continue;
    }

    velocities[i].addScaledVector(gravity, deltaTime);

    positions[positionIndex] += velocities[i].x * deltaTime;
    positions[positionIndex + 1] += velocities[i].y * deltaTime;
    positions[positionIndex + 2] += velocities[i].z * deltaTime;

    if (positions[positionIndex + 1] <= 0.08) {
      positions[positionIndex + 1] = 0.08;
      if (velocities[i].y < 0) {
        velocities[i].y *= -0.32;
        velocities[i].x *= 0.72;
        velocities[i].z *= 0.72;
        ages[i] += lifetimes[i] * 0.16;
      }
    }

    const lifeT = ages[i] / lifetimes[i];
    if (lifeT < 0.45) {
      tempColor.copy(hot).lerp(mid, lifeT / 0.45);
    } else {
      tempColor.copy(mid).lerp(old, (lifeT - 0.45) / 0.55);
    }

    const fade = 1 - Math.max(0, lifeT - 0.78) / 0.22;
    colors[positionIndex] = tempColor.r * fade;
    colors[positionIndex + 1] = tempColor.g * fade;
    colors[positionIndex + 2] = tempColor.b * fade;
    sizes[i] = (0.055 + 0.055 * (1 - lifeT)) * (0.75 + fade * 0.35);
  }

  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.color.needsUpdate = true;
  particleGeometry.attributes.size.needsUpdate = true;
}

const panel = document.createElement('section');
panel.style.position = 'fixed';
panel.style.left = '20px';
panel.style.bottom = '20px';
panel.style.width = 'min(320px, calc(100vw - 40px))';
panel.style.padding = '16px 18px';
panel.style.boxSizing = 'border-box';
panel.style.color = '#eaf7ff';
panel.style.background = 'rgba(15, 22, 31, 0.82)';
panel.style.border = '1px solid rgba(188, 229, 255, 0.28)';
panel.style.borderRadius = '8px';
panel.style.boxShadow = '0 18px 48px rgba(0, 0, 0, 0.36)';
panel.style.backdropFilter = 'blur(10px)';

const title = document.createElement('div');
title.textContent = 'Particle fountain';
title.style.fontWeight = '700';
title.style.fontSize = '16px';
title.style.marginBottom = '12px';
panel.appendChild(title);

const labelRow = document.createElement('label');
labelRow.htmlFor = 'emission-rate';
labelRow.style.display = 'flex';
labelRow.style.alignItems = 'center';
labelRow.style.justifyContent = 'space-between';
labelRow.style.gap = '16px';
labelRow.style.fontSize = '13px';
labelRow.style.color = '#b9d3df';
labelRow.textContent = 'Emission rate';

const value = document.createElement('span');
value.textContent = `${emissionRate} / sec`;
value.style.color = '#ffffff';
value.style.fontVariantNumeric = 'tabular-nums';
labelRow.appendChild(value);
panel.appendChild(labelRow);

const slider = document.createElement('input');
slider.id = 'emission-rate';
slider.type = 'range';
slider.min = '40';
slider.max = '720';
slider.step = '10';
slider.value = String(emissionRate);
slider.style.width = '100%';
slider.style.marginTop = '10px';
slider.style.accentColor = '#31d8ff';
slider.addEventListener('input', () => {
  emissionRate = Number(slider.value);
  value.textContent = `${emissionRate} / sec`;
});
panel.appendChild(slider);
document.body.appendChild(panel);

function animate(): void {
  const deltaTime = Math.min(clock.getDelta(), 0.033);
  updateParticles(deltaTime);
  emitterGlow.scale.setScalar(1 + Math.sin(clock.elapsedTime * 8) * 0.11);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  particleMaterial.uniforms.pixelRatio.value = renderer.getPixelRatio();
});

for (let i = 0; i < 220; i += 1) {
  spawnParticle();
  ages[i] = Math.random() * lifetimes[i] * 0.9;
}

animate();
