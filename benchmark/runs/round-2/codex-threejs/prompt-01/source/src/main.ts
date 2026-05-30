import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type Body = {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  size: number;
  radius: number;
  contactFrames: number;
};

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root element.');
}

const styles = document.createElement('style');
styles.textContent = `
  :root {
    color-scheme: dark;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #101418;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
  }

  canvas {
    display: block;
  }

  .hud {
    position: fixed;
    top: 18px;
    left: 18px;
    display: flex;
    align-items: stretch;
    gap: 12px;
    z-index: 10;
    pointer-events: none;
  }

  .panel {
    min-width: 178px;
    padding: 12px 14px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    background: rgba(13, 18, 23, 0.82);
    box-shadow: 0 16px 45px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(12px);
  }

  .label {
    color: rgba(236, 244, 249, 0.72);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1;
    text-transform: uppercase;
  }

  .count {
    margin-top: 7px;
    color: #f7fbff;
    font-size: 34px;
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .subline {
    margin-top: 6px;
    color: rgba(236, 244, 249, 0.68);
    font-size: 12px;
    line-height: 1.25;
  }

  .reset {
    width: 104px;
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 8px;
    background: #e9f2f4;
    color: #0f1619;
    cursor: pointer;
    font: inherit;
    font-size: 15px;
    font-weight: 800;
    pointer-events: auto;
  }

  .reset:focus-visible {
    outline: 3px solid rgba(122, 208, 255, 0.85);
    outline-offset: 3px;
  }

  @media (max-width: 640px) {
    .hud {
      top: 12px;
      left: 12px;
      right: 12px;
    }

    .panel {
      min-width: 0;
      flex: 1;
    }

    .reset {
      width: 86px;
    }
  }
`;
document.head.appendChild(styles);

app.innerHTML = `
  <div class="hud">
    <div class="panel" aria-live="polite">
      <div class="label">Live contacts</div>
      <div class="count" id="contact-count">0</div>
      <div class="subline">50 cubes, ramp and cube impacts</div>
    </div>
    <button class="reset" id="reset-button" type="button">Reset</button>
  </div>
`;

const contactCountEl = document.querySelector<HTMLDivElement>('#contact-count');
const resetButton = document.querySelector<HTMLButtonElement>('#reset-button');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101418);
scene.fog = new THREE.Fog(0x101418, 22, 50);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(10.5, 8, 13.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.1, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 8;
controls.maxDistance = 28;

const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x29321d, 1.25);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2d5, 2.5);
sun.position.set(7, 12, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 32;
scene.add(sun);

const fill = new THREE.DirectionalLight(0x80c7ff, 0.55);
fill.position.set(-8, 6, -10);
scene.add(fill);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(42, 34),
  new THREE.MeshStandardMaterial({ color: 0x20282b, roughness: 0.86, metalness: 0.02 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(42, 42, 0x45636b, 0x2e4147);
grid.position.y = -1.18;
scene.add(grid);

const rampSize = new THREE.Vector3(12.5, 0.42, 7.7);
const ramp = new THREE.Mesh(
  new THREE.BoxGeometry(rampSize.x, rampSize.y, rampSize.z),
  new THREE.MeshStandardMaterial({ color: 0x60706a, roughness: 0.72, metalness: 0.03 }),
);
ramp.position.set(0, 0.05, 0);
ramp.rotation.x = -0.46;
ramp.castShadow = true;
ramp.receiveShadow = true;
scene.add(ramp);

const rampEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(ramp.geometry),
  new THREE.LineBasicMaterial({ color: 0xd9e7db, transparent: true, opacity: 0.42 }),
);
ramp.add(rampEdges);

const rampNormal = new THREE.Vector3();
const rampTopPoint = new THREE.Vector3();
const correction = new THREE.Vector3();
const tempVelocity = new THREE.Vector3();
const collisionAxis = new THREE.Vector3();

const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const cubeMaterials = [
  new THREE.MeshStandardMaterial({ color: 0xffc857, roughness: 0.55 }),
  new THREE.MeshStandardMaterial({ color: 0x53b3cb, roughness: 0.5 }),
  new THREE.MeshStandardMaterial({ color: 0xf06c64, roughness: 0.52 }),
  new THREE.MeshStandardMaterial({ color: 0x88d498, roughness: 0.56 }),
  new THREE.MeshStandardMaterial({ color: 0xb89cff, roughness: 0.5 }),
];

const bodies: Body[] = [];
const gravity = new THREE.Vector3(0, -9.8, 0);
const floorY = -1.2;
const contactMarkers: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];

function createBodies() {
  for (let i = 0; i < 50; i += 1) {
    const size = 0.52 + (i % 5) * 0.035;
    const mesh = new THREE.Mesh(cubeGeometry, cubeMaterials[i % cubeMaterials.length].clone());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.scale.setScalar(size);
    scene.add(mesh);

    bodies.push({
      mesh,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      size,
      radius: size * 0.72,
      contactFrames: 0,
    });
  }
}

function resetBody(body: Body, i: number) {
  const column = i % 10;
  const row = Math.floor(i / 10);
  const x = (column - 4.5) * 0.72 + (row % 2) * 0.18;
  const z = -3.25 + row * 0.8 + ((i * 13) % 9) * 0.025;
  const y = 7.4 + row * 1.25 + (column % 4) * 0.34;

  body.position.set(x, y, z);
  body.velocity.set((column - 4.5) * 0.1, -1.4 - row * 0.06, 0.22 + (column % 3) * 0.05);
  body.angularVelocity.set(0.65 + row * 0.08, -0.45 + column * 0.05, 0.42 - row * 0.04);
  body.mesh.quaternion.setFromEuler(new THREE.Euler(i * 0.17, i * 0.11, i * 0.07));
  body.mesh.material.emissive.setHex(0x000000);
  body.contactFrames = 0;
  syncMesh(body);
}

function resetSimulation() {
  bodies.forEach(resetBody);
  for (const marker of contactMarkers.splice(0)) {
    ramp.remove(marker);
    marker.geometry.dispose();
    marker.material.dispose();
  }

  for (let i = 0; i < 86; i += 1) {
    stepPhysics(1 / 90, i === 85);
  }
}

function syncMesh(body: Body) {
  body.mesh.position.copy(body.position);
}

function updateRampCollision(body: Body): number {
  ramp.updateMatrixWorld();
  ramp.getWorldQuaternion(new THREE.Quaternion()).normalize();
  rampNormal.set(0, 1, 0).applyQuaternion(ramp.quaternion).normalize();
  rampTopPoint.copy(ramp.position).addScaledVector(rampNormal, rampSize.y * 0.5);

  const distance = body.position.clone().sub(rampTopPoint).dot(rampNormal);
  const localPoint = ramp.worldToLocal(body.position.clone());
  const withinRamp =
    Math.abs(localPoint.x) < rampSize.x * 0.5 + body.radius &&
    Math.abs(localPoint.z) < rampSize.z * 0.5 + body.radius;

  if (!withinRamp || distance >= body.radius) {
    return 0;
  }

  correction.copy(rampNormal).multiplyScalar(body.radius - distance + 0.006);
  body.position.add(correction);

  const normalSpeed = body.velocity.dot(rampNormal);
  if (normalSpeed < 0) {
    body.velocity.addScaledVector(rampNormal, -(1.48 * normalSpeed));
    tempVelocity.copy(rampNormal).multiplyScalar(body.velocity.dot(rampNormal));
    body.velocity.addScaledVector(tempVelocity.sub(body.velocity), 0.12);
    body.angularVelocity.add(new THREE.Vector3(0.2, 0.35, -0.18).multiplyScalar(1 + body.size));
  }

  body.contactFrames = 5;
  addContactMarker(localPoint.x, localPoint.z);
  return 1;
}

function updateFloorCollision(body: Body): number {
  const bottom = body.position.y - body.radius;
  if (bottom >= floorY) {
    return 0;
  }

  body.position.y += floorY - bottom + 0.004;
  if (body.velocity.y < 0) {
    body.velocity.y *= -0.36;
    body.velocity.x *= 0.88;
    body.velocity.z *= 0.88;
    body.angularVelocity.multiplyScalar(0.94);
  }
  body.contactFrames = 4;
  return 1;
}

function updateCubeCollisions(): number {
  let contacts = 0;

  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      collisionAxis.copy(b.position).sub(a.position);
      const distance = collisionAxis.length();
      const target = a.radius + b.radius;

      if (distance <= 0.0001 || distance >= target) {
        continue;
      }

      collisionAxis.multiplyScalar(1 / distance);
      const overlap = target - distance;
      a.position.addScaledVector(collisionAxis, -overlap * 0.5);
      b.position.addScaledVector(collisionAxis, overlap * 0.5);

      const relativeSpeed = b.velocity.clone().sub(a.velocity).dot(collisionAxis);
      if (relativeSpeed < 0) {
        const impulse = -(1.22 * relativeSpeed) / 2;
        a.velocity.addScaledVector(collisionAxis, -impulse);
        b.velocity.addScaledVector(collisionAxis, impulse);
        a.angularVelocity.addScaledVector(collisionAxis, -0.75);
        b.angularVelocity.addScaledVector(collisionAxis, 0.75);
      }

      a.contactFrames = 5;
      b.contactFrames = 5;
      contacts += 1;
    }
  }

  return contacts;
}

function addContactMarker(x: number, z: number) {
  if (contactMarkers.length > 120) {
    const oldest = contactMarkers.shift();
    if (oldest) {
      ramp.remove(oldest);
      oldest.geometry.dispose();
      oldest.material.dispose();
    }
  }

  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.23, 20),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  marker.position.set(x, rampSize.y * 0.54, z);
  marker.rotation.x = -Math.PI / 2;
  marker.userData.life = 0.28;
  ramp.add(marker);
  contactMarkers.push(marker);
}

function updateContactMarkers(dt: number) {
  for (let i = contactMarkers.length - 1; i >= 0; i -= 1) {
    const marker = contactMarkers[i];
    marker.userData.life -= dt;
    const life = Math.max(marker.userData.life / 0.28, 0);
    marker.scale.setScalar(1.8 - life * 0.8);
    marker.material.opacity = life * 0.82;

    if (life <= 0) {
      contactMarkers.splice(i, 1);
      ramp.remove(marker);
      marker.geometry.dispose();
      marker.material.dispose();
    }
  }
}

function stepPhysics(dt: number, updateOverlay = true) {
  let contacts = 0;

  for (const body of bodies) {
    body.velocity.addScaledVector(gravity, dt);
    body.velocity.multiplyScalar(0.998);
    body.position.addScaledVector(body.velocity, dt);

    const spin = body.angularVelocity.length();
    if (spin > 0.0001) {
      const deltaRotation = new THREE.Quaternion().setFromAxisAngle(
        body.angularVelocity.clone().normalize(),
        spin * dt,
      );
      body.mesh.quaternion.premultiply(deltaRotation).normalize();
      body.angularVelocity.multiplyScalar(0.995);
    }

    contacts += updateRampCollision(body);
    contacts += updateFloorCollision(body);
  }

  contacts += updateCubeCollisions();

  for (const body of bodies) {
    if (Math.abs(body.position.x) > 18 || Math.abs(body.position.z) > 16 || body.position.y < -8) {
      resetBody(body, bodies.indexOf(body));
    }

    body.mesh.material.emissive.setHex(body.contactFrames > 0 ? 0x2b2210 : 0x000000);
    body.contactFrames = Math.max(0, body.contactFrames - 1);
    syncMesh(body);
  }

  if (contactCountEl && updateOverlay) {
    contactCountEl.textContent = contacts.toString();
  }
}

createBodies();
resetSimulation();

resetButton?.addEventListener('click', resetSimulation);

const clock = new THREE.Clock();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);
  const fixedStep = 1 / 90;
  const steps = Math.max(1, Math.ceil(dt / fixedStep));

  for (let i = 0; i < steps; i += 1) {
    stepPhysics(dt / steps);
  }

  updateContactMarkers(dt);
  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
