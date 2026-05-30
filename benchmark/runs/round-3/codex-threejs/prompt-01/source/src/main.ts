import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("Missing #app root element");
}

root.innerHTML = `
  <div class="viewport">
    <div class="hud">
      <div class="label">Physics Playground</div>
      <div class="metric">Live contacts: <strong id="contact-count">0</strong></div>
      <button id="reset-button" type="button">Reset cubes</button>
    </div>
    <div class="caption">50 procedural cubes falling, colliding, and sliding over a tilted ramp.</div>
  </div>
`;

const style = document.createElement("style");
style.textContent = `
  html, body, #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #171a1f;
  }

  .viewport {
    position: fixed;
    inset: 0;
  }

  canvas {
    display: block;
  }

  .hud {
    position: absolute;
    top: 18px;
    left: 18px;
    z-index: 2;
    display: grid;
    gap: 8px;
    min-width: 214px;
    padding: 14px;
    color: #f7f4ef;
    background: rgba(20, 23, 27, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(10px);
  }

  .label {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
    color: #86d5ff;
  }

  .metric {
    font-size: 16px;
    line-height: 1.3;
  }

  .metric strong {
    color: #ffffff;
    font-variant-numeric: tabular-nums;
  }

  button {
    width: 100%;
    height: 38px;
    color: #101317;
    font: inherit;
    font-weight: 700;
    background: #ffd166;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
  }

  button:hover {
    background: #ffe08d;
  }

  .caption {
    position: absolute;
    right: 18px;
    bottom: 16px;
    z-index: 2;
    max-width: min(420px, calc(100vw - 36px));
    color: rgba(255, 255, 255, 0.8);
    font-size: 13px;
    line-height: 1.45;
    text-align: right;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.65);
  }

  @media (max-width: 620px) {
    .hud {
      top: 10px;
      left: 10px;
      min-width: 184px;
      padding: 12px;
    }

    .caption {
      right: 10px;
      bottom: 10px;
      font-size: 12px;
    }
  }
`;
document.head.appendChild(style);

const contactCountElement = document.querySelector<HTMLElement>("#contact-count");
const resetButton = document.querySelector<HTMLButtonElement>("#reset-button");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2028);
scene.fog = new THREE.Fog(0x1b2028, 16, 36);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(8.8, 6.4, 10.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
root.querySelector(".viewport")?.prepend(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.2, 1.35, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 6;
controls.maxDistance = 22;

const ambient = new THREE.HemisphereLight(0xc7e7ff, 0x252017, 1.5);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 3.4);
sun.position.set(5, 10, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -10;
sun.shadow.camera.right = 10;
sun.shadow.camera.top = 10;
sun.shadow.camera.bottom = -10;
scene.add(sun);

const fill = new THREE.PointLight(0xff9f80, 35, 22);
fill.position.set(-5, 4, -6);
scene.add(fill);

const floorGeometry = new THREE.PlaneGeometry(24, 20);
const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0x272c33,
  roughness: 0.86,
  metalness: 0.05,
});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.65;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(24, 24, 0x6f7f8d, 0x39414a);
grid.position.y = -1.64;
scene.add(grid);

const rampAngle = -0.32;
const rampHeight = 0.48;
const rampGeometry = new THREE.BoxGeometry(11.5, rampHeight, 5.2);
const rampMaterial = new THREE.MeshStandardMaterial({
  color: 0x4f8f9f,
  roughness: 0.58,
  metalness: 0.08,
});
const ramp = new THREE.Mesh(rampGeometry, rampMaterial);
ramp.position.set(0, -0.05, 0);
ramp.rotation.z = rampAngle;
ramp.castShadow = true;
ramp.receiveShadow = true;
scene.add(ramp);

const rampNormal = new THREE.Vector3(-Math.sin(rampAngle), Math.cos(rampAngle), 0).normalize();
const rampTopPoint = new THREE.Vector3().copy(ramp.position).addScaledVector(rampNormal, rampHeight / 2);
const rampTangent = new THREE.Vector3(Math.cos(rampAngle), Math.sin(rampAngle), 0).normalize();
const rampZHalf = 2.6;
const rampXHalf = 5.75;

const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
for (const x of [-5.4, 5.4]) {
  const marker = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 5.35), markerMaterial);
  marker.position.copy(rampTopPoint).addScaledVector(rampTangent, x).addScaledVector(rampNormal, 0.05);
  marker.rotation.z = rampAngle;
  scene.add(marker);
}

type Body = {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  size: number;
  mass: number;
};

const cubeGeometry = new THREE.BoxGeometry(0.58, 0.58, 0.58);
const cubeMaterials = [
  new THREE.MeshStandardMaterial({ color: 0xf25f5c, roughness: 0.48 }),
  new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.5 }),
  new THREE.MeshStandardMaterial({ color: 0x70c1b3, roughness: 0.52 }),
  new THREE.MeshStandardMaterial({ color: 0x9d7cff, roughness: 0.45 }),
  new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.5 }),
];

const bodies: Body[] = [];
const spawnPoints: THREE.Vector3[] = [];
const tmp = new THREE.Vector3();

for (let i = 0; i < 50; i += 1) {
  const layer = Math.floor(i / 10);
  const col = i % 10;
  const x = -3.8 + col * 0.84 + (layer % 2) * 0.22;
  const y = 2.2 + layer * 1.06 + (col % 3) * 0.1;
  const z = -1.9 + (col % 5) * 0.92 + Math.floor(col / 5) * 0.2;
  spawnPoints.push(new THREE.Vector3(x, y, z));
}

function createCubes() {
  bodies.length = 0;
  for (let i = 0; i < spawnPoints.length; i += 1) {
    const mesh = new THREE.Mesh(cubeGeometry, cubeMaterials[i % cubeMaterials.length]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    bodies.push({
      mesh,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      size: 0.58,
      mass: 1,
    });
  }
}

function resetSimulation() {
  for (let i = 0; i < bodies.length; i += 1) {
    const body = bodies[i];
    body.position.copy(spawnPoints[i]);
    body.velocity.set((i % 5 - 2) * 0.12, -0.25 - (i % 4) * 0.03, (Math.floor(i / 5) % 4 - 1.5) * 0.1);
    body.angularVelocity.set(0.4 + (i % 3) * 0.15, 0.25 + (i % 5) * 0.09, 0.3 + (i % 7) * 0.05);
    body.mesh.position.copy(body.position);
    body.mesh.rotation.set((i % 6) * 0.2, (i % 9) * 0.16, (i % 4) * 0.26);
  }
}

createCubes();
resetSimulation();

resetButton?.addEventListener("click", resetSimulation);

const gravity = new THREE.Vector3(0, -9.8, 0);
const cubeRadius = 0.44;
const restitution = 0.34;
const pairRestitution = 0.2;
const fixedStep = 1 / 60;
let accumulator = 0;
let lastTime = performance.now();
let contacts = 0;

function signedRampDistance(point: THREE.Vector3) {
  return tmp.copy(point).sub(rampTopPoint).dot(rampNormal);
}

function isInsideRampFace(point: THREE.Vector3) {
  const localX = tmp.copy(point).sub(ramp.position).dot(rampTangent);
  return Math.abs(localX) < rampXHalf + 0.8 && Math.abs(point.z - ramp.position.z) < rampZHalf + 0.8;
}

function resolveRamp(body: Body) {
  const distance = signedRampDistance(body.position);
  if (distance < cubeRadius && isInsideRampFace(body.position)) {
    const penetration = cubeRadius - distance;
    body.position.addScaledVector(rampNormal, penetration);

    const normalSpeed = body.velocity.dot(rampNormal);
    if (normalSpeed < 0) {
      body.velocity.addScaledVector(rampNormal, -(1 + restitution) * normalSpeed);
    }

    const slideSpeed = body.velocity.dot(rampTangent);
    body.velocity.addScaledVector(rampTangent, -slideSpeed * 0.045);
    body.velocity.z *= 0.985;
    body.angularVelocity.addScaledVector(new THREE.Vector3(body.velocity.z, 0, -body.velocity.x), 0.035);
    contacts += 1;
  }
}

function resolveFloor(body: Body) {
  const floorY = -1.65 + cubeRadius;
  if (body.position.y < floorY) {
    body.position.y = floorY;
    if (body.velocity.y < 0) {
      body.velocity.y *= -0.22;
    }
    body.velocity.x *= 0.9;
    body.velocity.z *= 0.9;
    contacts += 1;
  }
}

function resolveCubePairs() {
  for (let i = 0; i < bodies.length - 1; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      const delta = tmp.copy(b.position).sub(a.position);
      const distanceSq = delta.lengthSq();
      const minDistance = cubeRadius * 1.72;
      if (distanceSq > 0.0001 && distanceSq < minDistance * minDistance) {
        const distance = Math.sqrt(distanceSq);
        const normal = delta.multiplyScalar(1 / distance);
        const penetration = minDistance - distance;
        a.position.addScaledVector(normal, -penetration * 0.5);
        b.position.addScaledVector(normal, penetration * 0.5);

        const relativeVelocity = tmp.copy(b.velocity).sub(a.velocity);
        const separatingSpeed = relativeVelocity.dot(normal);
        if (separatingSpeed < 0) {
          const impulse = (-(1 + pairRestitution) * separatingSpeed) / (a.mass + b.mass);
          a.velocity.addScaledVector(normal, -impulse * b.mass);
          b.velocity.addScaledVector(normal, impulse * a.mass);
        }

        a.angularVelocity.addScaledVector(normal, -0.04);
        b.angularVelocity.addScaledVector(normal, 0.04);
        contacts += 1;
      }
    }
  }
}

function stepPhysics(dt: number) {
  contacts = 0;

  for (const body of bodies) {
    body.velocity.addScaledVector(gravity, dt);
    body.velocity.multiplyScalar(0.998);
    body.position.addScaledVector(body.velocity, dt);
    resolveRamp(body);
    resolveFloor(body);
  }

  for (let pass = 0; pass < 2; pass += 1) {
    resolveCubePairs();
  }

  for (const body of bodies) {
    body.mesh.position.copy(body.position);
    body.mesh.rotation.x += body.angularVelocity.x * dt;
    body.mesh.rotation.y += body.angularVelocity.y * dt;
    body.mesh.rotation.z += body.angularVelocity.z * dt;
    body.angularVelocity.multiplyScalar(0.992);
  }
}

function animate(now: number) {
  const frameSeconds = Math.min((now - lastTime) / 1000, 0.08);
  lastTime = now;
  accumulator += frameSeconds;

  while (accumulator >= fixedStep) {
    stepPhysics(fixedStep);
    accumulator -= fixedStep;
  }

  controls.update();
  if (contactCountElement) {
    contactCountElement.textContent = contacts.toString();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", handleResize);
requestAnimationFrame(animate);
