import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

type Body = {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  halfSize: number;
};

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div class="viewport"></div>
  <div class="hud">
    <div class="metric">
      <span>Live contacts</span>
      <strong id="contact-count">0</strong>
    </div>
    <button id="reset-button" type="button">Reset</button>
  </div>
`;

const viewport = app.querySelector<HTMLDivElement>(".viewport")!;
const contactCount = app.querySelector<HTMLElement>("#contact-count")!;
const resetButton = app.querySelector<HTMLButtonElement>("#reset-button")!;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1018);
scene.fog = new THREE.Fog(0x0b1018, 18, 50);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(9, 8, 13);
camera.lookAt(0, 1.5, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.6, 0);
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 7;
controls.maxDistance = 28;

const hemi = new THREE.HemisphereLight(0xd9ecff, 0x263242, 2.1);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffffff, 3.4);
key.position.set(-6, 10, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 26;
key.shadow.camera.left = -13;
key.shadow.camera.right = 13;
key.shadow.camera.top = 13;
key.shadow.camera.bottom = -13;
scene.add(key);

const fill = new THREE.DirectionalLight(0x8fc7ff, 0.8);
fill.position.set(6, 4, -8);
scene.add(fill);

const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x17202c, roughness: 0.72, metalness: 0.05 });
const floor = new THREE.Mesh(new THREE.BoxGeometry(22, 0.25, 18), floorMaterial);
floor.position.y = -0.18;
floor.receiveShadow = true;
scene.add(floor);

const rampAngle = -0.34;
const ramp = new THREE.Mesh(
  new THREE.BoxGeometry(12, 0.42, 6.2),
  new THREE.MeshStandardMaterial({ color: 0x536273, roughness: 0.58, metalness: 0.04 }),
);
ramp.position.set(0, 1.0, 0);
ramp.rotation.z = rampAngle;
ramp.castShadow = true;
ramp.receiveShadow = true;
scene.add(ramp);

const rampEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(ramp.geometry),
  new THREE.LineBasicMaterial({ color: 0xc8d8ea, transparent: true, opacity: 0.5 }),
);
ramp.add(rampEdges);

const arrow = new THREE.ArrowHelper(
  new THREE.Vector3(Math.cos(rampAngle), Math.sin(rampAngle), 0).normalize(),
  new THREE.Vector3(-4.8, 1.95, -3.5),
  4.2,
  0x5eead4,
  0.45,
  0.28,
);
scene.add(arrow);

const contactGroup = new THREE.Group();
scene.add(contactGroup);

const bodies: Body[] = [];
const cubeGeometry = new THREE.BoxGeometry(0.58, 0.58, 0.58);
const cubeColors = [0xf97316, 0x38bdf8, 0xfacc15, 0xa78bfa, 0x4ade80];
const gravity = new THREE.Vector3(0, -9.8, 0);
const rampNormal = new THREE.Vector3(-Math.sin(rampAngle), Math.cos(rampAngle), 0).normalize();
const rampTangent = new THREE.Vector3(Math.cos(rampAngle), Math.sin(rampAngle), 0).normalize();
const rampCenter = ramp.position.clone();
const rampHalfLength = 6;
const rampHalfWidth = 3.1;
let lastTime = performance.now();

function makeBody(index: number): Body {
  const material = new THREE.MeshStandardMaterial({
    color: cubeColors[index % cubeColors.length],
    roughness: 0.42,
    metalness: 0.02,
  });
  const mesh = new THREE.Mesh(cubeGeometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return {
    mesh,
    velocity: new THREE.Vector3(),
    angularVelocity: new THREE.Vector3(),
    halfSize: 0.29,
  };
}

function resetBodies() {
  while (contactGroup.children.length) {
    contactGroup.remove(contactGroup.children[0]);
  }

  for (let i = bodies.length; i < 50; i += 1) {
    bodies.push(makeBody(i));
  }

  for (let i = 0; i < bodies.length; i += 1) {
    const body = bodies[i];
    const column = i % 10;
    const row = Math.floor(i / 10);
    const alreadyNearRamp = i < 14;
    const localX = -4.3 + column * 0.92 + (row % 2) * 0.22;
    const localZ = -2.05 + row * 1.02 + ((column % 2) - 0.5) * 0.18;
    const base = rampCenter.clone().addScaledVector(rampTangent, localX);
    const rampY = base.y;

    body.mesh.position.set(
      base.x,
      alreadyNearRamp ? rampY + 0.55 + (i % 3) * 0.08 : 7.2 + row * 1.15 + (column % 4) * 0.42,
      THREE.MathUtils.clamp(localZ, -2.55, 2.55),
    );
    body.mesh.rotation.set(i * 0.29, i * 0.17, i * 0.11);
    body.velocity.set(
      alreadyNearRamp ? 0.7 + (i % 4) * 0.12 : -0.5 + (column % 4) * 0.34,
      alreadyNearRamp ? -1.2 : -1.9 - (i % 5) * 0.34,
      -0.55 + (row % 4) * 0.35,
    );
    body.angularVelocity.set(0.8 + (i % 5) * 0.16, -0.35 + (i % 7) * 0.12, 0.55 + (i % 3) * 0.2);
  }

  contactCount.textContent = "0";
  lastTime = performance.now();
}

function addContactMarker(position: THREE.Vector3, scale = 1) {
  if (contactGroup.children.length > 42) {
    contactGroup.remove(contactGroup.children[0]);
  }
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.12 * scale, 0.2 * scale, 18),
    new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.86, side: THREE.DoubleSide }),
  );
  marker.position.copy(position);
  marker.position.y += 0.018;
  marker.rotation.x = -Math.PI / 2;
  marker.userData.age = 0;
  contactGroup.add(marker);
}

function solveRampContact(body: Body): number {
  const fromRamp = body.mesh.position.clone().sub(rampCenter);
  const along = fromRamp.dot(rampTangent);
  const across = body.mesh.position.z - rampCenter.z;
  if (Math.abs(along) > rampHalfLength + body.halfSize || Math.abs(across) > rampHalfWidth + body.halfSize) {
    return 0;
  }

  const distance = fromRamp.dot(rampNormal);
  if (distance >= body.halfSize) {
    return 0;
  }

  const penetration = body.halfSize - distance;
  body.mesh.position.addScaledVector(rampNormal, penetration);
  const normalSpeed = body.velocity.dot(rampNormal);
  if (normalSpeed < 0) {
    body.velocity.addScaledVector(rampNormal, -(1.36 * normalSpeed));
    body.velocity.addScaledVector(rampTangent, 1.1);
    body.angularVelocity.add(new THREE.Vector3(0.5, 0.2, -1.8));
  }
  body.velocity.multiplyScalar(0.992);

  if (Math.random() < 0.12) {
    const point = rampCenter.clone().addScaledVector(rampTangent, along);
    point.z = body.mesh.position.z;
    addContactMarker(point, 0.85);
  }
  return 1;
}

function solveFloorAndBounds(body: Body): number {
  let contacts = 0;
  if (body.mesh.position.y - body.halfSize < 0) {
    body.mesh.position.y = body.halfSize;
    if (body.velocity.y < 0) {
      body.velocity.y *= -0.45;
      body.velocity.x *= 0.9;
      body.velocity.z *= 0.9;
    }
    contacts += 1;
  }

  const xLimit = 10.4;
  const zLimit = 8.2;
  if (Math.abs(body.mesh.position.x) > xLimit) {
    body.mesh.position.x = Math.sign(body.mesh.position.x) * xLimit;
    body.velocity.x *= -0.42;
    contacts += 1;
  }
  if (Math.abs(body.mesh.position.z) > zLimit) {
    body.mesh.position.z = Math.sign(body.mesh.position.z) * zLimit;
    body.velocity.z *= -0.42;
    contacts += 1;
  }
  return contacts;
}

function solveCubeContacts(): number {
  let contacts = 0;
  const minDistance = 0.64;
  const minDistanceSq = minDistance * minDistance;

  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      const delta = b.mesh.position.clone().sub(a.mesh.position);
      const distSq = delta.lengthSq();
      if (distSq > minDistanceSq || distSq < 0.0001) {
        continue;
      }

      const dist = Math.sqrt(distSq);
      const normal = delta.multiplyScalar(1 / dist);
      const penetration = (minDistance - dist) * 0.5;
      a.mesh.position.addScaledVector(normal, -penetration);
      b.mesh.position.addScaledVector(normal, penetration);

      const relative = b.velocity.clone().sub(a.velocity);
      const separatingSpeed = relative.dot(normal);
      if (separatingSpeed < 0) {
        const impulse = -(1.05 * separatingSpeed) / 2;
        a.velocity.addScaledVector(normal, -impulse);
        b.velocity.addScaledVector(normal, impulse);
        a.angularVelocity.add(new THREE.Vector3(normal.z, -normal.x, normal.y).multiplyScalar(0.7));
        b.angularVelocity.add(new THREE.Vector3(-normal.z, normal.x, -normal.y).multiplyScalar(0.7));
      }
      contacts += 1;
    }
  }

  return contacts;
}

function stepPhysics(dt: number) {
  let contacts = 0;
  const substeps = 3;
  const h = dt / substeps;

  for (let step = 0; step < substeps; step += 1) {
    for (const body of bodies) {
      body.velocity.addScaledVector(gravity, h);
      body.mesh.position.addScaledVector(body.velocity, h);
      body.mesh.rotation.x += body.angularVelocity.x * h;
      body.mesh.rotation.y += body.angularVelocity.y * h;
      body.mesh.rotation.z += body.angularVelocity.z * h;
      body.angularVelocity.multiplyScalar(0.998);
      contacts += solveRampContact(body);
      contacts += solveFloorAndBounds(body);
    }
    contacts += solveCubeContacts();
  }

  for (const marker of [...contactGroup.children]) {
    marker.userData.age += dt;
    const material = (marker as THREE.Mesh).material as THREE.MeshBasicMaterial;
    material.opacity = Math.max(0, 0.86 * (1 - marker.userData.age / 1.25));
    marker.scale.multiplyScalar(1 + dt * 0.75);
    if (marker.userData.age > 1.25) {
      contactGroup.remove(marker);
    }
  }

  contactCount.textContent = String(contacts);
}

function animate(now: number) {
  const dt = Math.min((now - lastTime) / 1000, 0.035);
  lastTime = now;
  stepPhysics(dt);
  controls.update();
  renderer.render(scene, camera);
}

resetButton.addEventListener("click", resetBodies);
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetBodies();
renderer.setAnimationLoop(animate);
