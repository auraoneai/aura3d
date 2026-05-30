import * as THREE from "three";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root element");
}

root.innerHTML = `
  <div class="hud">
    <div class="score">
      <span>Strokes</span>
      <strong id="stroke-count">0</strong>
    </div>
    <div class="status" id="status">Click the green to aim, release to shoot</div>
  </div>
  <canvas id="scene"></canvas>
`;

const style = document.createElement("style");
style.textContent = `
  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #8fb7c9;
  }

  #scene {
    display: block;
    width: 100%;
    height: 100%;
  }

  .hud {
    position: fixed;
    inset: 18px auto auto 18px;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 12px;
    color: #142019;
    pointer-events: none;
  }

  .score,
  .status {
    border: 1px solid rgba(24, 42, 27, 0.18);
    background: rgba(250, 255, 242, 0.88);
    box-shadow: 0 12px 28px rgba(13, 30, 20, 0.18);
    backdrop-filter: blur(10px);
  }

  .score {
    display: grid;
    grid-template-columns: auto auto;
    align-items: baseline;
    gap: 10px;
    min-width: 118px;
    padding: 10px 12px;
    border-radius: 8px;
  }

  .score span {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .score strong {
    font-size: 24px;
    line-height: 1;
  }

  .status {
    max-width: min(52vw, 380px);
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 650;
    line-height: 1.25;
  }

  @media (max-width: 620px) {
    .hud {
      inset: 12px 12px auto 12px;
      align-items: stretch;
      flex-direction: column;
    }

    .status {
      max-width: none;
    }
  }
`;
document.head.appendChild(style);

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
const strokeCountLookup = document.querySelector<HTMLElement>("#stroke-count");
const statusLookup = document.querySelector<HTMLElement>("#status");

if (!canvas || !strokeCountLookup || !statusLookup) {
  throw new Error("Missing UI elements");
}

const strokeCountElement: HTMLElement = strokeCountLookup;
const statusElement: HTMLElement = statusLookup;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x98c3d6);
scene.fog = new THREE.Fog(0x98c3d6, 26, 58);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 120);
const cameraTarget = new THREE.Vector3();

const ambient = new THREE.HemisphereLight(0xeaffdf, 0x536b77, 2.3);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 3.2);
sun.position.set(-9, 16, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
scene.add(sun);

const greenGroup = new THREE.Group();
scene.add(greenGroup);

const courseLength = 26;
const courseWidth = 10;
const ballRadius = 0.34;
const startPosition = new THREE.Vector3(0, ballRadius, 8.8);
const holePosition = new THREE.Vector3(0, 0.018, -9.4);
const ballVelocity = new THREE.Vector3();
const pointerGround = new THREE.Vector3();
const aimStart = new THREE.Vector3();
const aimEnd = new THREE.Vector3();

let strokes = 0;
let isAiming = false;
let isHoled = false;
let lastTime = performance.now();

const greenMaterial = new THREE.MeshStandardMaterial({
  color: 0x42a844,
  roughness: 0.88,
  metalness: 0,
});
const fringeMaterial = new THREE.MeshStandardMaterial({
  color: 0x2d7438,
  roughness: 0.95,
});
const sandMaterial = new THREE.MeshStandardMaterial({
  color: 0xd6bb79,
  roughness: 1,
});

const base = new THREE.Mesh(new THREE.BoxGeometry(courseWidth + 1.2, 0.38, courseLength + 1.2), fringeMaterial);
base.position.y = -0.23;
base.receiveShadow = true;
greenGroup.add(base);

const green = new THREE.Mesh(new THREE.BoxGeometry(courseWidth, 0.18, courseLength), greenMaterial);
green.receiveShadow = true;
greenGroup.add(green);

const stripeMaterial = new THREE.MeshStandardMaterial({
  color: 0x55bd55,
  roughness: 0.9,
});
for (let i = 0; i < 6; i += 1) {
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(courseWidth - 0.25, 1.45), stripeMaterial);
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(0, 0.094, -10.7 + i * 4);
  stripe.receiveShadow = true;
  greenGroup.add(stripe);
}

const railMaterial = new THREE.MeshStandardMaterial({
  color: 0xf2f3df,
  roughness: 0.72,
});
for (const x of [-courseWidth / 2 - 0.26, courseWidth / 2 + 0.26]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.58, courseLength + 0.72), railMaterial);
  rail.position.set(x, 0.24, 0);
  rail.castShadow = true;
  rail.receiveShadow = true;
  greenGroup.add(rail);
}
for (const z of [-courseLength / 2 - 0.26, courseLength / 2 + 0.26]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(courseWidth + 0.82, 0.58, 0.32), railMaterial);
  rail.position.set(0, 0.24, z);
  rail.castShadow = true;
  rail.receiveShadow = true;
  greenGroup.add(rail);
}

const obstacle = new THREE.Mesh(
  new THREE.BoxGeometry(1.25, 1.25, 4.35),
  new THREE.MeshStandardMaterial({ color: 0xb94f3a, roughness: 0.66 }),
);
obstacle.position.set(0, 0.72, -1.25);
obstacle.rotation.y = Math.PI / 9;
obstacle.castShadow = true;
obstacle.receiveShadow = true;
scene.add(obstacle);

const obstacleCap = new THREE.Mesh(
  new THREE.BoxGeometry(1.45, 0.18, 4.55),
  new THREE.MeshStandardMaterial({ color: 0xf5d769, roughness: 0.6 }),
);
obstacleCap.position.set(0, 1.44, -1.25);
obstacleCap.rotation.y = obstacle.rotation.y;
obstacleCap.castShadow = true;
scene.add(obstacleCap);

const sandTrap = new THREE.Mesh(new THREE.CircleGeometry(1.55, 48), sandMaterial);
sandTrap.rotation.x = -Math.PI / 2;
sandTrap.scale.set(1.45, 0.7, 1);
sandTrap.position.set(3.1, 0.102, 2.25);
scene.add(sandTrap);

const cup = new THREE.Mesh(
  new THREE.CylinderGeometry(0.46, 0.46, 0.035, 64),
  new THREE.MeshStandardMaterial({ color: 0x111512, roughness: 0.96 }),
);
cup.position.copy(holePosition);
scene.add(cup);

const cupRim = new THREE.Mesh(
  new THREE.TorusGeometry(0.49, 0.035, 10, 64),
  new THREE.MeshStandardMaterial({ color: 0xf7f4df, roughness: 0.45 }),
);
cupRim.rotation.x = Math.PI / 2;
cupRim.position.set(holePosition.x, 0.125, holePosition.z);
cupRim.castShadow = true;
scene.add(cupRim);

const flagPole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.035, 2.8, 18),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
);
flagPole.position.set(holePosition.x + 0.33, 1.46, holePosition.z);
flagPole.castShadow = true;
scene.add(flagPole);

const flag = new THREE.Mesh(
  new THREE.PlaneGeometry(0.95, 0.55),
  new THREE.MeshStandardMaterial({ color: 0xf04c43, side: THREE.DoubleSide, roughness: 0.52 }),
);
flag.position.set(holePosition.x + 0.8, 2.44, holePosition.z);
flag.rotation.y = -0.28;
flag.castShadow = true;
scene.add(flag);

const ball = new THREE.Mesh(
  new THREE.SphereGeometry(ballRadius, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28 }),
);
ball.position.copy(startPosition);
ball.castShadow = true;
ball.receiveShadow = true;
scene.add(ball);

const ballMark = new THREE.Mesh(
  new THREE.TorusGeometry(ballRadius * 0.62, 0.013, 8, 36),
  new THREE.MeshStandardMaterial({ color: 0x2f4d74, roughness: 0.35 }),
);
ball.add(ballMark);
ballMark.rotation.x = Math.PI / 2;

const aimLineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 3 });
const aimLineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const aimLine = new THREE.Line(aimLineGeometry, aimLineMaterial);
aimLine.visible = false;
scene.add(aimLine);

const aimArrow = new THREE.Mesh(
  new THREE.ConeGeometry(0.18, 0.48, 24),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
);
aimArrow.visible = false;
aimArrow.castShadow = true;
scene.add(aimArrow);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const obstacleBox = new THREE.Box3().setFromObject(obstacle);

function setStatus(text: string) {
  statusElement.textContent = text;
}

function screenToGround(event: PointerEvent, target: THREE.Vector3) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectPlane(groundPlane, target);
  return target;
}

function updateAimVisual() {
  const pull = aimStart.clone().sub(aimEnd);
  pull.y = 0;
  const power = Math.min(pull.length(), 4.2);

  if (power < 0.08) {
    aimLine.visible = false;
    aimArrow.visible = false;
    return;
  }

  const direction = pull.normalize();
  const visualEnd = ball.position.clone().addScaledVector(direction, power * 1.2);
  visualEnd.y = 0.58;

  const start = ball.position.clone();
  start.y = 0.58;
  aimLineGeometry.setFromPoints([start, visualEnd]);
  aimLine.visible = true;

  aimArrow.position.copy(visualEnd);
  aimArrow.position.y = 0.58;
  aimArrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  aimArrow.visible = true;
}

function canShoot() {
  return !isHoled && ballVelocity.lengthSq() < 0.012;
}

function beginAim(event: PointerEvent) {
  if (!canShoot()) return;
  renderer.domElement.setPointerCapture(event.pointerId);
  isAiming = true;
  aimStart.copy(ball.position);
  screenToGround(event, aimEnd);
  setStatus("Drag away from the ball, release to shoot");
  updateAimVisual();
}

function moveAim(event: PointerEvent) {
  if (!isAiming) return;
  screenToGround(event, pointerGround);
  aimEnd.copy(pointerGround);
  updateAimVisual();
}

function shoot(event: PointerEvent) {
  if (!isAiming) return;
  isAiming = false;
  renderer.domElement.releasePointerCapture(event.pointerId);

  const shot = aimStart.clone().sub(aimEnd);
  shot.y = 0;
  const power = Math.min(shot.length(), 4.2);
  aimLine.visible = false;
  aimArrow.visible = false;

  if (power < 0.22) {
    setStatus("Click the green to aim, release to shoot");
    return;
  }

  ballVelocity.copy(shot.normalize().multiplyScalar(power * 4.35));
  strokes += 1;
  strokeCountElement.textContent = String(strokes);
  setStatus("Ball rolling");
}

renderer.domElement.addEventListener("pointerdown", beginAim);
renderer.domElement.addEventListener("pointermove", moveAim);
renderer.domElement.addEventListener("pointerup", shoot);
renderer.domElement.addEventListener("pointercancel", shoot);

function clampToCourse() {
  const minX = -courseWidth / 2 + ballRadius;
  const maxX = courseWidth / 2 - ballRadius;
  const minZ = -courseLength / 2 + ballRadius;
  const maxZ = courseLength / 2 - ballRadius;

  if (ball.position.x < minX || ball.position.x > maxX) {
    ball.position.x = THREE.MathUtils.clamp(ball.position.x, minX, maxX);
    ballVelocity.x *= -0.64;
  }
  if (ball.position.z < minZ || ball.position.z > maxZ) {
    ball.position.z = THREE.MathUtils.clamp(ball.position.z, minZ, maxZ);
    ballVelocity.z *= -0.64;
  }
}

function collideObstacle() {
  const closest = new THREE.Vector3(
    THREE.MathUtils.clamp(ball.position.x, obstacleBox.min.x, obstacleBox.max.x),
    ball.position.y,
    THREE.MathUtils.clamp(ball.position.z, obstacleBox.min.z, obstacleBox.max.z),
  );
  const delta = ball.position.clone().sub(closest);
  delta.y = 0;
  const distance = delta.length();

  if (distance > ballRadius || distance === 0) return;

  const normal = delta.normalize();
  ball.position.copy(closest.addScaledVector(normal, ballRadius + 0.01));
  ball.position.y = ballRadius;
  const reflected = ballVelocity.clone().reflect(normal).multiplyScalar(0.72);
  ballVelocity.copy(reflected);
}

function updatePhysics(dt: number) {
  if (isHoled) return;

  ball.position.addScaledVector(ballVelocity, dt);
  ball.position.y = ballRadius;

  clampToCourse();
  collideObstacle();

  const drag = Math.pow(0.72, dt);
  ballVelocity.multiplyScalar(drag);

  if (ballVelocity.lengthSq() < 0.008) {
    ballVelocity.set(0, 0, 0);
    if (!isAiming) setStatus("Click the green to aim, release to shoot");
  }

  const rollAxis = new THREE.Vector3(ballVelocity.z, 0, -ballVelocity.x);
  const rollSpeed = rollAxis.length();
  if (rollSpeed > 0.001) {
    ball.rotateOnWorldAxis(rollAxis.normalize(), (rollSpeed * dt) / ballRadius);
  }

  const holeDistance = new THREE.Vector2(ball.position.x - holePosition.x, ball.position.z - holePosition.z).length();
  if (holeDistance < 0.45 && ballVelocity.length() < 3.2) {
    isHoled = true;
    ballVelocity.set(0, 0, 0);
    ball.position.set(holePosition.x, 0.08, holePosition.z);
    ball.scale.setScalar(0.55);
    setStatus(`Holed in ${strokes} ${strokes === 1 ? "stroke" : "strokes"}`);
  }
}

function updateCamera(dt: number) {
  const behind = new THREE.Vector3(0, 6.5, 8.5);
  const speedOffset = ballVelocity.clone().multiplyScalar(-0.18);
  speedOffset.y = 0;
  const desired = ball.position.clone().add(behind).add(speedOffset);
  desired.x = THREE.MathUtils.clamp(desired.x, -3.9, 3.9);
  desired.z = THREE.MathUtils.clamp(desired.z, -2, 16.5);

  camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
  cameraTarget.lerp(ball.position, 1 - Math.pow(0.0005, dt));
  camera.lookAt(cameraTarget.x, cameraTarget.y + 0.25, cameraTarget.z);
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", resize);

camera.position.set(0, 7, 16);
cameraTarget.copy(ball.position);
camera.lookAt(ball.position);

function animate(now: number) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;

  updatePhysics(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
