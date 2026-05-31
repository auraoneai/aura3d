import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import './style.css';

type Body = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  radius: number;
  halfExtent: number;
};

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app container');
}

app.innerHTML = `
  <canvas class="scene"></canvas>
  <div class="hud" aria-live="polite">
    <div class="hud-title">Physics Playground</div>
    <div class="hud-row"><span>Contacts</span><strong id="contact-count">0</strong></div>
    <div class="hud-row"><span>Cubes</span><strong>50</strong></div>
    <button id="reset-button" type="button">Reset</button>
  </div>
`;

const canvas = app.querySelector<HTMLCanvasElement>('canvas.scene');
const contactCount = app.querySelector<HTMLElement>('#contact-count');
const resetButton = app.querySelector<HTMLButtonElement>('#reset-button');

if (!canvas || !contactCount || !resetButton) {
  throw new Error('Missing playground UI');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdce8f0);
scene.fog = new THREE.Fog(0xdce8f0, 20, 58);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(10, 8, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 2.2, 0);
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 8;
controls.maxDistance = 34;

const hemi = new THREE.HemisphereLight(0xffffff, 0x52606b, 2.8);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 3.5);
sun.position.set(-8, 14, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(34, 26),
  new THREE.MeshStandardMaterial({ color: 0x8da0aa, roughness: 0.9, metalness: 0.02 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.04;
ground.receiveShadow = true;
scene.add(ground);

const rampSize = new THREE.Vector3(14, 0.55, 7);
const rampAngle = THREE.MathUtils.degToRad(-18);
const ramp = new THREE.Mesh(
  new THREE.BoxGeometry(rampSize.x, rampSize.y, rampSize.z),
  new THREE.MeshStandardMaterial({ color: 0x334b5c, roughness: 0.55, metalness: 0.08 }),
);
ramp.rotation.z = rampAngle;
ramp.position.set(0, 1.15, 0);
ramp.castShadow = true;
ramp.receiveShadow = true;
scene.add(ramp);

const rampNormal = new THREE.Vector3(0, 1, 0).applyEuler(ramp.rotation).normalize();
const rampRight = new THREE.Vector3(1, 0, 0).applyEuler(ramp.rotation).normalize();
const rampForward = new THREE.Vector3(0, 0, 1).applyEuler(ramp.rotation).normalize();
const rampTopCenter = ramp.position.clone().addScaledVector(rampNormal, rampSize.y / 2);

const railMaterial = new THREE.MeshStandardMaterial({ color: 0xf0c34d, roughness: 0.38 });
for (const z of [-rampSize.z / 2 - 0.12, rampSize.z / 2 + 0.12]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(rampSize.x, 0.16, 0.16), railMaterial);
  rail.rotation.copy(ramp.rotation);
  rail.position.copy(ramp.position)
    .addScaledVector(rampNormal, rampSize.y * 0.74)
    .addScaledVector(rampForward, z);
  rail.castShadow = true;
  scene.add(rail);
}

const cubeGeometry = new THREE.BoxGeometry(0.72, 0.72, 0.72);
const cubeMaterials = [
  new THREE.MeshStandardMaterial({ color: 0xe85046, roughness: 0.45 }),
  new THREE.MeshStandardMaterial({ color: 0x1f8fbf, roughness: 0.5 }),
  new THREE.MeshStandardMaterial({ color: 0xffca4b, roughness: 0.42 }),
  new THREE.MeshStandardMaterial({ color: 0x4eaa68, roughness: 0.5 }),
  new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.4 }),
];

const bodies: Body[] = [];
const gravity = new THREE.Vector3(0, -18, 0);
const scratch = new THREE.Vector3();
const clock = new THREE.Clock();
let activeContacts = 0;

function resetWorld() {
  for (const body of bodies) {
    scene.remove(body.mesh);
  }
  bodies.length = 0;

  for (let i = 0; i < 50; i += 1) {
    const mesh = new THREE.Mesh(cubeGeometry, cubeMaterials[i % cubeMaterials.length]);
    const column = i % 10;
    const row = Math.floor(i / 10);
    const stagger = row % 2 === 0 ? 0 : 0.34;
    const alongRamp = -4.5 + column * 0.92 + stagger;
    const acrossRamp = -2.7 + row * 1.25;
    const height = 2.2 + row * 0.95 + (column % 3) * 0.55;

    mesh.position.copy(rampTopCenter)
      .addScaledVector(rampRight, alongRamp)
      .addScaledVector(rampForward, acrossRamp)
      .addScaledVector(rampNormal, height);
    mesh.rotation.set(i * 0.22, i * 0.37, i * 0.19);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    bodies.push({
      mesh,
      velocity: new THREE.Vector3((column - 4.5) * 0.18, -0.4 - row * 0.08, (row - 2) * 0.12),
      angularVelocity: new THREE.Vector3(1.2 + row * 0.05, 0.8 + column * 0.04, -0.6),
      radius: 0.62,
      halfExtent: 0.36,
    });
  }

  activeContacts = 0;
  contactCount.textContent = '0';
}

function resolvePlaneContact(body: Body, dt: number) {
  const toBody = scratch.copy(body.mesh.position).sub(rampTopCenter);
  const along = toBody.dot(rampRight);
  const across = toBody.dot(rampForward);
  const signedDistance = toBody.dot(rampNormal);
  const onRamp = Math.abs(along) < rampSize.x / 2 + body.radius && Math.abs(across) < rampSize.z / 2 + body.radius;

  if (onRamp && signedDistance < body.radius) {
    activeContacts += 1;
    body.mesh.position.addScaledVector(rampNormal, body.radius - signedDistance);

    const normalSpeed = body.velocity.dot(rampNormal);
    if (normalSpeed < 0) {
      body.velocity.addScaledVector(rampNormal, -(1.42 * normalSpeed));
    }

    body.velocity.addScaledVector(body.velocity.clone().projectOnPlane(rampNormal), -1.9 * dt);
    body.angularVelocity.multiplyScalar(0.985);
  }
}

function resolveGroundContact(body: Body) {
  if (body.mesh.position.y < body.radius) {
    activeContacts += 1;
    body.mesh.position.y = body.radius;
    if (body.velocity.y < 0) {
      body.velocity.y *= -0.38;
      body.velocity.x *= 0.82;
      body.velocity.z *= 0.82;
    }
  }
}

function resolveCubeContacts() {
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      const delta = scratch.copy(b.mesh.position).sub(a.mesh.position);
      const distance = delta.length();
      const minimum = a.radius + b.radius;

      if (distance > 0.0001 && distance < minimum) {
        activeContacts += 1;
        const normal = delta.multiplyScalar(1 / distance);
        const depth = minimum - distance;
        a.mesh.position.addScaledVector(normal, -depth * 0.5);
        b.mesh.position.addScaledVector(normal, depth * 0.5);

        const relativeSpeed = b.velocity.clone().sub(a.velocity).dot(normal);
        if (relativeSpeed < 0) {
          const impulse = -(1.18 * relativeSpeed) / 2;
          a.velocity.addScaledVector(normal, -impulse);
          b.velocity.addScaledVector(normal, impulse);
        }
      }
    }
  }
}

function step(dt: number) {
  activeContacts = 0;

  for (const body of bodies) {
    body.velocity.addScaledVector(gravity, dt);
    body.velocity.multiplyScalar(0.998);
    body.mesh.position.addScaledVector(body.velocity, dt);
    body.mesh.rotation.x += body.angularVelocity.x * dt;
    body.mesh.rotation.y += body.angularVelocity.y * dt;
    body.mesh.rotation.z += body.angularVelocity.z * dt;
    resolvePlaneContact(body, dt);
    resolveGroundContact(body);
  }

  resolveCubeContacts();
  contactCount.textContent = activeContacts.toString();
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);
  for (let i = 0; i < 3; i += 1) {
    step(dt / 3);
  }
  controls.update();
  renderer.render(scene, camera);
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

resetButton.addEventListener('click', resetWorld);
window.addEventListener('resize', resize);

resetWorld();
renderer.setAnimationLoop(animate);
