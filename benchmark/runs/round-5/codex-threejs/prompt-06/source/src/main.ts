import "./style.css";
import * as THREE from "three";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app root");
}

app.innerHTML = `
  <div class="hud">
    <div class="score">
      <span>Strokes</span>
      <strong id="stroke-count">0</strong>
    </div>
    <div id="status">Drag from the ball, release to putt</div>
  </div>
  <div class="power-meter" aria-hidden="true"><div id="power-fill"></div></div>
`;

const strokeCount = document.querySelector<HTMLStrongElement>("#stroke-count")!;
const statusText = document.querySelector<HTMLDivElement>("#status")!;
const powerFill = document.querySelector<HTMLDivElement>("#power-fill")!;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb8d8ff);
scene.fog = new THREE.Fog(0xb8d8ff, 26, 62);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, 10, 13);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xf7fbff, 0x27522f, 2.1);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(-8, 14, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
scene.add(sun);

const greenGroup = new THREE.Group();
scene.add(greenGroup);

const greenMaterial = new THREE.MeshStandardMaterial({
  color: 0x42ad4a,
  roughness: 0.82,
  metalness: 0.02,
});
const fairway = new THREE.Mesh(new THREE.BoxGeometry(11, 0.32, 24), greenMaterial);
fairway.position.y = -0.18;
fairway.receiveShadow = true;
greenGroup.add(fairway);

const borderMaterial = new THREE.MeshStandardMaterial({ color: 0xd8c17b, roughness: 0.75 });
const railGeometry = new THREE.BoxGeometry(0.55, 0.55, 24.8);
for (const x of [-5.8, 5.8]) {
  const rail = new THREE.Mesh(railGeometry, borderMaterial);
  rail.position.set(x, 0.12, 0);
  rail.castShadow = true;
  rail.receiveShadow = true;
  greenGroup.add(rail);
}
const endRailGeometry = new THREE.BoxGeometry(12.2, 0.55, 0.55);
for (const z of [-12.4, 12.4]) {
  const rail = new THREE.Mesh(endRailGeometry, borderMaterial);
  rail.position.set(0, 0.12, z);
  rail.castShadow = true;
  rail.receiveShadow = true;
  greenGroup.add(rail);
}

const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0x65c86a, roughness: 0.9 });
for (let z = -9; z <= 9; z += 4) {
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(10.2, 1.25), stripeMaterial);
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(0, 0.006, z);
  greenGroup.add(stripe);
}

const obstacle = new THREE.Mesh(
  new THREE.BoxGeometry(3.2, 1.15, 0.8),
  new THREE.MeshStandardMaterial({ color: 0xe04f35, roughness: 0.55 }),
);
obstacle.position.set(0.3, 0.58, -1.8);
obstacle.rotation.y = -0.42;
obstacle.castShadow = true;
obstacle.receiveShadow = true;
scene.add(obstacle);

const cupPosition = new THREE.Vector3(0, 0.025, -9.4);
const cup = new THREE.Mesh(
  new THREE.CylinderGeometry(0.5, 0.5, 0.08, 48),
  new THREE.MeshStandardMaterial({ color: 0x101514, roughness: 0.7 }),
);
cup.position.copy(cupPosition);
cup.receiveShadow = true;
scene.add(cup);

const flagPole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.035, 2.2, 16),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
);
flagPole.position.set(cupPosition.x + 0.32, 1.12, cupPosition.z);
flagPole.castShadow = true;
scene.add(flagPole);

const flag = new THREE.Mesh(
  new THREE.PlaneGeometry(0.9, 0.48),
  new THREE.MeshStandardMaterial({ color: 0xffd245, side: THREE.DoubleSide, roughness: 0.5 }),
);
flag.position.set(cupPosition.x + 0.78, 1.78, cupPosition.z);
flag.rotation.y = -0.35;
flag.castShadow = true;
scene.add(flag);

const ballRadius = 0.32;
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(ballRadius, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.02 }),
);
ball.position.set(0, ballRadius, 8.6);
ball.castShadow = true;
ball.receiveShadow = true;
scene.add(ball);

const ballMark = new THREE.Mesh(
  new THREE.TorusGeometry(0.34, 0.018, 8, 40),
  new THREE.MeshBasicMaterial({ color: 0x222831 }),
);
ballMark.rotation.x = Math.PI / 2;
ball.add(ballMark);

const aimLineMaterial = new THREE.LineBasicMaterial({ color: 0xfff2a6, linewidth: 3 });
const aimGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const aimLine = new THREE.Line(aimGeometry, aimLineMaterial);
aimLine.visible = false;
scene.add(aimLine);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const dragPoint = new THREE.Vector3();
const velocity = new THREE.Vector3();
const lastPosition = new THREE.Vector3().copy(ball.position);
const obstacleBox = new THREE.Box3().setFromObject(obstacle).expandByScalar(ballRadius);
const ballBox = new THREE.Box3();
const clock = new THREE.Clock();

let strokes = 0;
let aiming = false;
let holed = false;

function setPointer(event: PointerEvent) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectPlane(groundPlane, dragPoint);
}

function canShoot() {
  return !holed && velocity.lengthSq() < 0.012;
}

function updateAim() {
  const shot = ball.position.clone().sub(dragPoint);
  shot.y = 0;
  const power = Math.min(shot.length(), 4.2);
  const direction = shot.lengthSq() > 0 ? shot.normalize() : new THREE.Vector3(0, 0, -1);
  const end = ball.position.clone().add(direction.multiplyScalar(power * 1.15));
  end.y = 0.08;
  const start = ball.position.clone();
  start.y = 0.08;
  aimGeometry.setFromPoints([start, end]);
  powerFill.style.width = `${Math.round((power / 4.2) * 100)}%`;
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (!canShoot()) return;
  setPointer(event);
  aiming = true;
  aimLine.visible = true;
  updateAim();
  renderer.domElement.setPointerCapture(event.pointerId);
});

renderer.domElement.addEventListener("pointermove", (event) => {
  if (!aiming) return;
  setPointer(event);
  updateAim();
});

renderer.domElement.addEventListener("pointerup", (event) => {
  if (!aiming) return;
  setPointer(event);
  const shot = ball.position.clone().sub(dragPoint);
  shot.y = 0;
  const power = Math.min(shot.length(), 4.2);
  if (power > 0.18) {
    velocity.copy(shot.normalize().multiplyScalar(power * 3.2));
    strokes += 1;
    strokeCount.textContent = String(strokes);
    statusText.textContent = "Ball rolling...";
  }
  aiming = false;
  aimLine.visible = false;
  powerFill.style.width = "0%";
  renderer.domElement.releasePointerCapture(event.pointerId);
});

function resetBall() {
  ball.position.set(0, ballRadius, 8.6);
  velocity.set(0, 0, 0);
  holed = false;
  statusText.textContent = "Drag from the ball, release to putt";
}

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "r") {
    resetBall();
  }
});

function collideWithRails() {
  if (ball.position.x < -5.15 || ball.position.x > 5.15) {
    ball.position.x = THREE.MathUtils.clamp(ball.position.x, -5.15, 5.15);
    velocity.x *= -0.66;
  }
  if (ball.position.z < -11.75 || ball.position.z > 11.75) {
    ball.position.z = THREE.MathUtils.clamp(ball.position.z, -11.75, 11.75);
    velocity.z *= -0.66;
  }
}

function collideWithObstacle() {
  ballBox.setFromCenterAndSize(ball.position, new THREE.Vector3(ballRadius * 2, ballRadius * 2, ballRadius * 2));
  if (!ballBox.intersectsBox(obstacleBox)) return;

  const before = lastPosition.clone();
  const dx = Math.min(Math.abs(before.x - obstacleBox.min.x), Math.abs(before.x - obstacleBox.max.x));
  const dz = Math.min(Math.abs(before.z - obstacleBox.min.z), Math.abs(before.z - obstacleBox.max.z));
  ball.position.copy(before);
  if (dx < dz) {
    velocity.x *= -0.72;
  } else {
    velocity.z *= -0.72;
  }
}

function updateBall(delta: number) {
  if (holed) return;
  lastPosition.copy(ball.position);
  ball.position.addScaledVector(velocity, delta);
  collideWithRails();
  collideWithObstacle();

  const distance = Math.hypot(ball.position.x - cupPosition.x, ball.position.z - cupPosition.z);
  if (distance < 0.46 && velocity.length() < 2.6) {
    holed = true;
    velocity.set(0, 0, 0);
    ball.position.set(cupPosition.x, 0.08, cupPosition.z);
    statusText.textContent = `Holed in ${strokes} stroke${strokes === 1 ? "" : "s"} - press R to reset`;
    return;
  }

  const speed = velocity.length();
  if (speed > 0) {
    const rollAxis = new THREE.Vector3(velocity.z, 0, -velocity.x).normalize();
    ball.rotateOnWorldAxis(rollAxis, speed * delta / ballRadius);
  }
  velocity.multiplyScalar(Math.pow(0.58, delta));
  if (velocity.lengthSq() < 0.01) {
    velocity.set(0, 0, 0);
    if (!aiming) statusText.textContent = "Drag from the ball, release to putt";
  }
}

function updateCamera() {
  const followOffset = new THREE.Vector3(0, 8.2, 10.8);
  if (velocity.lengthSq() > 0.04) {
    const travel = velocity.clone().setY(0).normalize();
    followOffset.set(-travel.x * 2.4, 7.4, -travel.z * 2.4 + 8.4);
  }
  const targetPosition = ball.position.clone().add(followOffset);
  camera.position.lerp(targetPosition, 0.075);
  camera.lookAt(ball.position.x, ball.position.y + 0.2, ball.position.z - 1.2);
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.033);
  updateBall(delta);
  updateCamera();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
