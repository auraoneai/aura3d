import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app container');
}

type Body = {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  lastContact: boolean;
};

const cubeCount = 50;
const cubeSize = 0.44;
const cubeRadius = cubeSize * 0.74;
const gravity = new THREE.Vector3(0, -8.2, 0);
const fixedStep = 1 / 90;
const rampAngle = THREE.MathUtils.degToRad(-18);
const rampSize = new THREE.Vector3(8.6, 0.34, 4.8);
const rampPosition = new THREE.Vector3(0, 1.1, 0);
const rampQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rampAngle));
const rampInverse = rampQuaternion.clone().invert();
const rampNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(rampQuaternion).normalize();
const reusableLocal = new THREE.Vector3();
const reusableWorld = new THREE.Vector3();
const clock = new THREE.Clock();

let accumulator = 0;
let contactCount = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8eef4);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(6.8, 5.2, 8.4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0.5, 1.25, 0);
controls.minDistance = 4;
controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI * 0.49;

const ambientLight = new THREE.HemisphereLight(0xffffff, 0x6f7f8f, 2.1);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 3.1);
keyLight.position.set(-4, 8, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -8;
keyLight.shadow.camera.right = 8;
keyLight.shadow.camera.top = 8;
keyLight.shadow.camera.bottom = -8;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x9fc7ff, 1.0);
fillLight.position.set(5, 4, -6);
scene.add(fillLight);

const floor = new THREE.Mesh(
  new THREE.BoxGeometry(12, 0.18, 8),
  new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.82, metalness: 0.02 }),
);
floor.position.y = -0.09;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(12, 12, 0x7f8a96, 0xb5bdc7);
grid.position.y = 0.006;
scene.add(grid);

const ramp = new THREE.Mesh(
  new THREE.BoxGeometry(rampSize.x, rampSize.y, rampSize.z),
  new THREE.MeshStandardMaterial({ color: 0x495765, roughness: 0.48, metalness: 0.05 }),
);
ramp.position.copy(rampPosition);
ramp.quaternion.copy(rampQuaternion);
ramp.castShadow = true;
ramp.receiveShadow = true;
scene.add(ramp);

const rampEdgeMaterial = new THREE.MeshStandardMaterial({ color: 0x2d333b, roughness: 0.6 });
for (const z of [-rampSize.z / 2 - 0.06, rampSize.z / 2 + 0.06]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(rampSize.x, 0.2, 0.1), rampEdgeMaterial);
  rail.position.set(0, rampPosition.y + 0.22, z);
  rail.quaternion.copy(rampQuaternion);
  rail.castShadow = true;
  scene.add(rail);
}

const contactMaterial = new THREE.MeshBasicMaterial({
  color: 0xffd166,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
});
const contactMarkers: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
for (let i = 0; i < 20; i += 1) {
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), contactMaterial);
  marker.visible = false;
  scene.add(marker);
  contactMarkers.push(marker);
}

const palette = [0x1f77b4, 0xff7f0e, 0x2ca02c, 0xd62728, 0x9467bd, 0x17becf, 0xf0b429, 0x0f766e];
const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
const bodies: Body[] = [];

for (let i = 0; i < cubeCount; i += 1) {
  const material = new THREE.MeshStandardMaterial({
    color: palette[i % palette.length],
    roughness: 0.55,
    metalness: 0.04,
  });
  const mesh = new THREE.Mesh(cubeGeometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  bodies.push({
    mesh,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    angularVelocity: new THREE.Vector3(),
    lastContact: false,
  });
}

const overlay = document.createElement('div');
overlay.className = 'overlay';
overlay.innerHTML = `
  <div class="title">Physics Playground</div>
  <div class="metric"><span>Live contacts</span><strong id="contact-count">0</strong></div>
  <button id="reset-button" type="button">Reset cubes</button>
`;
document.body.appendChild(overlay);

const contactCountElement = document.querySelector<HTMLSpanElement>('#contact-count');
const resetButton = document.querySelector<HTMLButtonElement>('#reset-button');

resetButton?.addEventListener('click', () => {
  resetSimulation();
});

function seededNoise(index: number, salt: number): number {
  const value = Math.sin(index * 91.13 + salt * 37.77) * 43758.5453;
  return value - Math.floor(value);
}

function resetSimulation(): void {
  bodies.forEach((body, index) => {
    const column = index % 10;
    const row = Math.floor(index / 10);
    const layer = Math.floor(index / 20);
    const x = -3.15 + column * 0.7 + (seededNoise(index, 1) - 0.5) * 0.16;
    const y = 5.0 + row * 0.62 + layer * 0.42;
    const z = -1.85 + (row % 5) * 0.92 + (seededNoise(index, 2) - 0.5) * 0.14;

    body.position.set(x, y, z);
    body.velocity.set(1.25 + seededNoise(index, 3) * 0.85, -0.2 * seededNoise(index, 4), (seededNoise(index, 5) - 0.5) * 0.38);
    body.angularVelocity.set(
      (seededNoise(index, 6) - 0.5) * 5,
      (seededNoise(index, 7) - 0.5) * 5,
      (seededNoise(index, 8) - 0.5) * 5,
    );
    body.mesh.position.copy(body.position);
    body.mesh.rotation.set(
      seededNoise(index, 9) * Math.PI,
      seededNoise(index, 10) * Math.PI,
      seededNoise(index, 11) * Math.PI,
    );
    body.lastContact = false;
  });
  accumulator = 0;
}

function pushContactMarker(point: THREE.Vector3): void {
  const marker = contactMarkers[contactCount % contactMarkers.length];
  marker.position.copy(point);
  marker.visible = true;
  marker.scale.setScalar(1);
}

function collideWithFloor(body: Body): void {
  const floorLimit = cubeSize * 0.5;
  if (body.position.y < floorLimit) {
    body.position.y = floorLimit;
    if (body.velocity.y < 0) {
      body.velocity.y *= -0.38;
      body.velocity.x *= 0.82;
      body.velocity.z *= 0.82;
    }
    contactCount += 1;
    body.lastContact = true;
    reusableWorld.set(body.position.x, 0.06, body.position.z);
    pushContactMarker(reusableWorld);
  }
}

function collideWithRamp(body: Body): void {
  reusableLocal.copy(body.position).sub(rampPosition).applyQuaternion(rampInverse);
  const insideRamp =
    Math.abs(reusableLocal.x) < rampSize.x * 0.5 &&
    Math.abs(reusableLocal.z) < rampSize.z * 0.5 &&
    reusableLocal.y > 0 &&
    reusableLocal.y < cubeRadius + rampSize.y * 0.5 + 0.35;

  if (!insideRamp) {
    return;
  }

  const topPenetration = cubeRadius + rampSize.y * 0.5 - reusableLocal.y;
  if (topPenetration <= 0) {
    return;
  }

  body.position.addScaledVector(rampNormal, topPenetration + 0.002);
  const normalSpeed = body.velocity.dot(rampNormal);
  if (normalSpeed < 0.2) {
    body.velocity.addScaledVector(rampNormal, -(1.42 * normalSpeed));
    body.velocity.multiplyScalar(0.985);
    body.angularVelocity.add(new THREE.Vector3(0.35, 0.12, -0.18));
  }

  contactCount += 1;
  body.lastContact = true;
  reusableWorld
    .copy(reusableLocal)
    .setY(rampSize.y * 0.5 + 0.035)
    .applyQuaternion(rampQuaternion)
    .add(rampPosition);
  pushContactMarker(reusableWorld);
}

function collideBodies(): void {
  for (let i = 0; i < bodies.length; i += 1) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; j += 1) {
      const b = bodies[j];
      reusableWorld.copy(b.position).sub(a.position);
      const distance = reusableWorld.length();
      const minimum = cubeRadius * 1.65;

      if (distance <= 0.0001 || distance >= minimum) {
        continue;
      }

      const normal = reusableWorld.multiplyScalar(1 / distance);
      const depth = minimum - distance;
      a.position.addScaledVector(normal, -depth * 0.5);
      b.position.addScaledVector(normal, depth * 0.5);

      const relativeSpeed = b.velocity.clone().sub(a.velocity).dot(normal);
      if (relativeSpeed < 0) {
        const impulse = -(1.18 * relativeSpeed) * 0.5;
        a.velocity.addScaledVector(normal, -impulse);
        b.velocity.addScaledVector(normal, impulse);
      }

      a.velocity.multiplyScalar(0.996);
      b.velocity.multiplyScalar(0.996);
      a.lastContact = true;
      b.lastContact = true;
      contactCount += 1;

      if (contactCount % 3 === 0) {
        pushContactMarker(reusableWorld.copy(a.position).lerp(b.position, 0.5));
      }
    }
  }
}

function stepSimulation(delta: number): void {
  contactCount = 0;
  for (const marker of contactMarkers) {
    marker.visible = false;
  }

  for (const body of bodies) {
    body.lastContact = false;
    body.velocity.addScaledVector(gravity, delta);
    body.velocity.multiplyScalar(0.999);
    body.position.addScaledVector(body.velocity, delta);
  }

  for (let iteration = 0; iteration < 2; iteration += 1) {
    for (const body of bodies) {
      collideWithRamp(body);
      collideWithFloor(body);
    }
    collideBodies();
  }

  for (const body of bodies) {
    body.mesh.position.copy(body.position);
    body.mesh.rotation.x += body.angularVelocity.x * delta + body.velocity.z * delta * 0.18;
    body.mesh.rotation.y += body.angularVelocity.y * delta;
    body.mesh.rotation.z += body.angularVelocity.z * delta - body.velocity.x * delta * 0.16;
    body.mesh.material.emissive.setHex(body.lastContact ? 0x2b1f06 : 0x000000);
  }

  if (contactCountElement) {
    contactCountElement.textContent = String(contactCount);
  }
}

function animate(): void {
  const delta = Math.min(clock.getDelta(), 0.05);
  accumulator += delta;
  while (accumulator >= fixedStep) {
    stepSimulation(fixedStep);
    accumulator -= fixedStep;
  }

  for (const marker of contactMarkers) {
    if (marker.visible) {
      marker.scale.multiplyScalar(0.92);
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetSimulation();
renderer.setAnimationLoop(animate);
