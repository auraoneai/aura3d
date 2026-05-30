import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type Body = {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  halfSize: number;
  contactFlash: number;
};

const CUBE_COUNT = 50;
const FIXED_STEP = 1 / 90;
const SUB_STEPS = 3;
const GRAVITY = new THREE.Vector3(0, -13.5, 0);
const RAMP_WIDTH = 15;
const RAMP_LENGTH = 18;
const RAMP_THICKNESS = 0.45;
const RAMP_ANGLE = THREE.MathUtils.degToRad(-18);

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root element.');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#101820';
document.body.style.fontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

app.style.width = '100vw';
app.style.height = '100vh';

const overlay = document.createElement('div');
overlay.className = 'overlay';
overlay.innerHTML = `
  <div class="readout">
    <div class="label">LIVE CONTACTS</div>
    <div class="value" id="contact-count">0</div>
  </div>
  <button id="reset-button" type="button">Reset</button>
`;
document.body.appendChild(overlay);

const style = document.createElement('style');
style.textContent = `
  .overlay {
    position: fixed;
    top: 18px;
    left: 18px;
    z-index: 10;
    display: flex;
    align-items: stretch;
    gap: 10px;
    color: #f7fbff;
    user-select: none;
  }

  .readout {
    min-width: 158px;
    border: 1px solid rgba(255, 255, 255, 0.26);
    border-radius: 8px;
    background: rgba(12, 18, 25, 0.76);
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(10px);
    padding: 10px 12px;
  }

  .label {
    color: #9fb6c9;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .value {
    margin-top: 2px;
    font-size: 28px;
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  #reset-button {
    min-width: 86px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 8px;
    background: #f1c35d;
    color: #111820;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
    padding: 0 16px;
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.22);
  }

  #reset-button:hover {
    background: #ffd778;
  }

  @media (max-width: 560px) {
    .overlay {
      top: 10px;
      left: 10px;
      right: 10px;
    }

    .readout {
      flex: 1;
      min-width: 0;
    }
  }
`;
document.head.appendChild(style);

const contactCountEl = document.querySelector<HTMLDivElement>('#contact-count');
const resetButton = document.querySelector<HTMLButtonElement>('#reset-button');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101820);
scene.fog = new THREE.Fog(0x101820, 24, 62);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(14, 11.5, 22);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 3, 0);
controls.enableDamping = true;
controls.minDistance = 10;
controls.maxDistance = 38;
controls.maxPolarAngle = Math.PI * 0.48;
controls.update();

const hemiLight = new THREE.HemisphereLight(0xc7e9ff, 0x29301f, 1.25);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(7, 15, 9);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -18;
keyLight.shadow.camera.right = 18;
keyLight.shadow.camera.top = 18;
keyLight.shadow.camera.bottom = -18;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x79b7ff, 0.55);
fillLight.position.set(-10, 8, -6);
scene.add(fillLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(44, 34),
  new THREE.MeshStandardMaterial({ color: 0x26333c, roughness: 0.92, metalness: 0.02 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.25;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(44, 44, 0x587483, 0x344650);
grid.position.y = -1.235;
scene.add(grid);

const ramp = new THREE.Mesh(
  new THREE.BoxGeometry(RAMP_WIDTH, RAMP_THICKNESS, RAMP_LENGTH),
  new THREE.MeshStandardMaterial({ color: 0x71808a, roughness: 0.68, metalness: 0.05 }),
);
ramp.rotation.x = RAMP_ANGLE;
ramp.position.set(0, 0.25, 0);
ramp.castShadow = true;
ramp.receiveShadow = true;
scene.add(ramp);

const rampEdgeMaterial = new THREE.MeshStandardMaterial({
  color: 0xf1c35d,
  roughness: 0.6,
  emissive: 0x1a1000,
});
for (const x of [-RAMP_WIDTH / 2, RAMP_WIDTH / 2]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, RAMP_LENGTH), rampEdgeMaterial);
  rail.position.set(x, RAMP_THICKNESS / 2 + 0.18, 0);
  ramp.add(rail);
}

const spawnMarker = new THREE.Mesh(
  new THREE.RingGeometry(1.1, 1.35, 36),
  new THREE.MeshBasicMaterial({ color: 0x65d5ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
);
spawnMarker.rotation.x = -Math.PI / 2;
spawnMarker.position.set(0, 8.2, -3.4);
scene.add(spawnMarker);

const rampMatrixInverse = new THREE.Matrix4();
const rampLocalSpawn = new THREE.Vector3();
const localPoint = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();
const rampNormal = new THREE.Vector3();
const tangentVelocity = new THREE.Vector3();
const separation = new THREE.Vector3();

const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const cubePalette = [0x4cc9f0, 0xf72585, 0x80ed99, 0xffd166, 0xb8f2e6, 0xf8961e, 0xc77dff];
const bodies: Body[] = [];

function seededNoise(index: number): number {
  return (Math.sin(index * 47.173 + 1.91) * 43758.5453) % 1;
}

function resetBodies(): void {
  ramp.updateMatrixWorld();

  for (let i = 0; i < CUBE_COUNT; i += 1) {
    const body = bodies[i] ?? createBody(i);
    const column = i % 10;
    const row = Math.floor(i / 10);
    const jitterX = (seededNoise(i + 5) - 0.5) * 0.56;
    const jitterZ = (seededNoise(i + 17) - 0.5) * 0.72;

    if (i < 18) {
      rampLocalSpawn.set(
        ((i % 6) - 2.5) * 1.15 + jitterX * 0.35,
        RAMP_THICKNESS / 2 + body.halfSize * 0.94,
        -2.2 + Math.floor(i / 6) * 1.05 + jitterZ * 0.35,
      );
      body.mesh.position.copy(rampLocalSpawn.applyMatrix4(ramp.matrixWorld));
      body.velocity.set((seededNoise(i + 3) - 0.5) * 0.9, -1.2, 1.35 + seededNoise(i + 11) * 0.85);
      body.contactFlash = 1;
    } else {
      body.mesh.position.set((column - 4.5) * 1.12 + jitterX, 5.8 + row * 1.05, -5.9 + row * 0.72 + jitterZ);
      body.velocity.set((seededNoise(i + 3) - 0.5) * 1.2, -1.6 - row * 0.26, 1.7 + seededNoise(i + 11) * 1.1);
      body.contactFlash = 0;
    }

    body.mesh.rotation.set(seededNoise(i + 9) * Math.PI, seededNoise(i + 21) * Math.PI, seededNoise(i + 31) * Math.PI);
    body.angularVelocity.set(seededNoise(i + 4) - 0.5, seededNoise(i + 8) - 0.5, seededNoise(i + 12) - 0.5).multiplyScalar(2.2);
    body.mesh.material.emissive.setRGB(body.contactFlash * 0.45, body.contactFlash * 0.32, body.contactFlash * 0.05);
  }

  latestContacts = 18;
  displayedContacts = 18;
  updateContactLabel();
  controls.update();
  renderer.render(scene, camera);
}

function createBody(index: number): Body {
  const material = new THREE.MeshStandardMaterial({
    color: cubePalette[index % cubePalette.length],
    roughness: 0.52,
    metalness: 0.06,
    emissive: 0x000000,
  });
  const mesh = new THREE.Mesh(cubeGeometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const body: Body = {
    mesh,
    velocity: new THREE.Vector3(),
    angularVelocity: new THREE.Vector3(),
    halfSize: 0.5,
    contactFlash: 0,
  };
  bodies.push(body);
  return body;
}

let latestContacts = 0;
let displayedContacts = 0;
let accumulator = 0;
let lastTime = performance.now();

function updateContactLabel(): void {
  if (contactCountEl) {
    contactCountEl.textContent = String(Math.round(displayedContacts));
  }
}

function integrateBody(body: Body, step: number): void {
  body.velocity.addScaledVector(GRAVITY, step);
  body.velocity.multiplyScalar(0.998);
  body.mesh.position.addScaledVector(body.velocity, step);
  body.mesh.rotation.x += body.angularVelocity.x * step;
  body.mesh.rotation.y += body.angularVelocity.y * step;
  body.mesh.rotation.z += body.angularVelocity.z * step;
}

function solveRampContact(body: Body): number {
  ramp.updateMatrixWorld();
  rampMatrixInverse.copy(ramp.matrixWorld).invert();
  normalMatrix.getNormalMatrix(ramp.matrixWorld);
  rampNormal.set(0, 1, 0).applyMatrix3(normalMatrix).normalize();

  localPoint.copy(body.mesh.position).applyMatrix4(rampMatrixInverse);
  const topY = RAMP_THICKNESS / 2;
  const margin = body.halfSize * 1.45;
  const insideRamp =
    Math.abs(localPoint.x) < RAMP_WIDTH / 2 + margin && Math.abs(localPoint.z) < RAMP_LENGTH / 2 + margin;

  if (!insideRamp || localPoint.y - body.halfSize > topY) {
    return 0;
  }

  const penetration = topY - (localPoint.y - body.halfSize);
  body.mesh.position.addScaledVector(rampNormal, penetration + 0.006);

  const normalSpeed = body.velocity.dot(rampNormal);
  if (normalSpeed < 0) {
    body.velocity.addScaledVector(rampNormal, -(1.38 * normalSpeed));
  }

  tangentVelocity.copy(body.velocity).addScaledVector(rampNormal, -body.velocity.dot(rampNormal));
  body.velocity.addScaledVector(tangentVelocity, -0.028);
  body.angularVelocity.add(new THREE.Vector3(rampNormal.z, 0.25, -rampNormal.x).multiplyScalar(0.35));
  body.contactFlash = 1;
  return 1;
}

function solveFloorContact(body: Body): number {
  const floorY = floor.position.y + body.halfSize;
  if (body.mesh.position.y >= floorY) {
    return 0;
  }

  body.mesh.position.y = floorY;
  if (body.velocity.y < 0) {
    body.velocity.y *= -0.36;
    body.velocity.x *= 0.9;
    body.velocity.z *= 0.9;
  }
  body.contactFlash = Math.max(body.contactFlash, 0.45);
  return 1;
}

function solveCubeContacts(): number {
  let contacts = 0;
  const minDistance = 0.96;

  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      separation.subVectors(b.mesh.position, a.mesh.position);
      const distance = separation.length();

      if (distance <= 0.0001 || distance >= minDistance) {
        continue;
      }

      const normal = separation.multiplyScalar(1 / distance);
      const penetration = minDistance - distance;
      a.mesh.position.addScaledVector(normal, -penetration * 0.5);
      b.mesh.position.addScaledVector(normal, penetration * 0.5);

      const relativeSpeed = b.velocity.clone().sub(a.velocity).dot(normal);
      if (relativeSpeed < 0) {
        const impulse = -(1.18 * relativeSpeed) / 2;
        a.velocity.addScaledVector(normal, -impulse);
        b.velocity.addScaledVector(normal, impulse);
      }

      a.angularVelocity.addScaledVector(normal, -0.18);
      b.angularVelocity.addScaledVector(normal, 0.18);
      a.contactFlash = 1;
      b.contactFlash = 1;
      contacts += 1;
    }
  }

  return contacts;
}

function physicsStep(step: number): void {
  let contactsThisStep = 0;

  for (const body of bodies) {
    integrateBody(body, step);
    contactsThisStep += solveRampContact(body);
    contactsThisStep += solveFloorContact(body);

    if (body.mesh.position.length() > 45 || body.mesh.position.y < -8) {
      body.mesh.position.set((seededNoise(bodies.indexOf(body) + 40) - 0.5) * 7, 9.5, -6);
      body.velocity.set(0, -2, 2.2);
    }
  }

  contactsThisStep += solveCubeContacts();
  latestContacts = Math.max(latestContacts * 0.86, contactsThisStep);
}

function animate(now: number): void {
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  accumulator += delta;

  while (accumulator >= FIXED_STEP) {
    for (let i = 0; i < SUB_STEPS; i += 1) {
      physicsStep(FIXED_STEP / SUB_STEPS);
    }
    accumulator -= FIXED_STEP;
  }

  for (const body of bodies) {
    body.contactFlash = Math.max(0, body.contactFlash - delta * 3.2);
    body.mesh.material.emissive.setRGB(body.contactFlash * 0.45, body.contactFlash * 0.32, body.contactFlash * 0.05);
  }

  displayedContacts += (latestContacts - displayedContacts) * Math.min(1, delta * 11);
  updateContactLabel();
  controls.update();
  renderer.render(scene, camera);
}

resetButton?.addEventListener('click', resetBodies);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetBodies();
renderer.setAnimationLoop(animate);
