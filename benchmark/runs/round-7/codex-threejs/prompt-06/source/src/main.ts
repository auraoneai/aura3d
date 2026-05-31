import * as THREE from "three";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app mount point");
}

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.style.fontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
app.style.width = "100vw";
app.style.height = "100vh";

const overlay = document.createElement("div");
overlay.style.position = "fixed";
overlay.style.left = "18px";
overlay.style.top = "18px";
overlay.style.zIndex = "5";
overlay.style.display = "grid";
overlay.style.gap = "8px";
overlay.style.color = "#f8fafc";
overlay.style.textShadow = "0 1px 3px rgba(0,0,0,.45)";
overlay.style.pointerEvents = "none";
overlay.innerHTML = `
  <div style="font-size: 24px; font-weight: 800; letter-spacing: 0;">Mini-Golf Hole</div>
  <div id="score" style="font-size: 18px; font-weight: 700;">Strokes: 0</div>
  <div id="hint" style="font-size: 13px; font-weight: 600; opacity: .9;">Click and drag from the ball to aim. Release to shoot.</div>
`;
app.appendChild(overlay);

const scoreEl = overlay.querySelector<HTMLDivElement>("#score");
const hintEl = overlay.querySelector<HTMLDivElement>("#hint");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x9fc6dc);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc6dc);
scene.fog = new THREE.Fog(0x9fc6dc, 26, 58);

const camera = new THREE.PerspectiveCamera(
  48,
  window.innerWidth / window.innerHeight,
  0.1,
  120,
);
camera.position.set(0, 8.5, 10);

const hemi = new THREE.HemisphereLight(0xdff7ff, 0x35603a, 2.1);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(-8, 14, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
scene.add(sun);

const greenWidth = 10;
const greenLength = 24;
const ballRadius = 0.34;
const holeRadius = 0.56;
const startPosition = new THREE.Vector3(0, ballRadius, 8.3);
const holePosition = new THREE.Vector3(0, 0.025, -8.7);

const greenMaterial = new THREE.MeshStandardMaterial({
  color: 0x3fb755,
  roughness: 0.85,
});
const green = new THREE.Mesh(
  new THREE.BoxGeometry(greenWidth, 0.16, greenLength),
  greenMaterial,
);
green.position.y = -0.08;
green.receiveShadow = true;
scene.add(green);

const fringe = new THREE.Mesh(
  new THREE.BoxGeometry(greenWidth + 2.1, 0.12, greenLength + 2.1),
  new THREE.MeshStandardMaterial({ color: 0x2d8c43, roughness: 0.9 }),
);
fringe.position.y = -0.16;
fringe.receiveShadow = true;
scene.add(fringe);

const railMaterial = new THREE.MeshStandardMaterial({
  color: 0xf2ead0,
  roughness: 0.72,
});
const rails: THREE.Mesh[] = [];
const railSpecs = [
  { x: -greenWidth / 2 - 0.22, z: 0, sx: 0.38, sz: greenLength + 0.55 },
  { x: greenWidth / 2 + 0.22, z: 0, sx: 0.38, sz: greenLength + 0.55 },
  { x: 0, z: -greenLength / 2 - 0.22, sx: greenWidth + 0.82, sz: 0.38 },
  { x: 0, z: greenLength / 2 + 0.22, sx: greenWidth + 0.82, sz: 0.38 },
];

for (const spec of railSpecs) {
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(spec.sx, 0.36, spec.sz),
    railMaterial,
  );
  rail.position.set(spec.x, 0.18, spec.z);
  rail.castShadow = true;
  rail.receiveShadow = true;
  rails.push(rail);
  scene.add(rail);
}

const obstacle = new THREE.Mesh(
  new THREE.BoxGeometry(4.1, 0.68, 0.8),
  new THREE.MeshStandardMaterial({ color: 0xb95636, roughness: 0.68 }),
);
obstacle.position.set(-1.25, 0.34, -1.8);
obstacle.rotation.y = 0.33;
obstacle.castShadow = true;
obstacle.receiveShadow = true;
scene.add(obstacle);

const obstacleEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(obstacle.geometry),
  new THREE.LineBasicMaterial({ color: 0x7b2d1e }),
);
obstacle.add(obstacleEdges);

const cup = new THREE.Mesh(
  new THREE.CylinderGeometry(holeRadius, holeRadius, 0.08, 48),
  new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.96 }),
);
cup.position.copy(holePosition);
cup.receiveShadow = true;
scene.add(cup);

const flagPole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.035, 2.2, 12),
  new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 }),
);
flagPole.position.set(holePosition.x + 0.14, 1.12, holePosition.z);
flagPole.castShadow = true;
scene.add(flagPole);

const flag = new THREE.Mesh(
  new THREE.PlaneGeometry(0.92, 0.48),
  new THREE.MeshStandardMaterial({
    color: 0xef4444,
    side: THREE.DoubleSide,
    roughness: 0.55,
  }),
);
flag.position.set(holePosition.x + 0.59, 1.82, holePosition.z);
flag.rotation.y = Math.PI / 2;
flag.castShadow = true;
scene.add(flag);

const ball = new THREE.Mesh(
  new THREE.SphereGeometry(ballRadius, 48, 24),
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0.03,
  }),
);
ball.position.copy(startPosition);
ball.castShadow = true;
ball.receiveShadow = true;
scene.add(ball);

const ballStripe = new THREE.Mesh(
  new THREE.TorusGeometry(ballRadius * 0.88, 0.018, 8, 64),
  new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.5 }),
);
ballStripe.rotation.x = Math.PI / 2;
ball.add(ballStripe);

const aimLineMaterial = new THREE.LineBasicMaterial({
  color: 0xfff3a3,
  transparent: true,
  opacity: 0.95,
});
const aimGeometry = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(),
  new THREE.Vector3(),
]);
const aimLine = new THREE.Line(aimGeometry, aimLineMaterial);
aimLine.visible = false;
scene.add(aimLine);

const arrow = new THREE.Mesh(
  new THREE.ConeGeometry(0.22, 0.62, 24),
  new THREE.MeshStandardMaterial({
    color: 0xfff3a3,
    emissive: 0x665000,
    emissiveIntensity: 0.2,
    roughness: 0.45,
  }),
);
arrow.visible = false;
arrow.castShadow = true;
scene.add(arrow);

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ballRadius);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPoint = new THREE.Vector3();
const velocity = new THREE.Vector3();
const previousBallPosition = new THREE.Vector3();
const obstacleBox = new THREE.Box3().setFromObject(obstacle);
const obstacleInverse = new THREE.Matrix4().copy(obstacle.matrixWorld).invert();
const localBallPoint = new THREE.Vector3();

let strokes = 0;
let aiming = false;
let sunk = false;

function setScore(): void {
  if (scoreEl) {
    scoreEl.textContent = `Strokes: ${strokes}`;
  }
}

function setPointer(event: PointerEvent): void {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function getGreenPoint(event: PointerEvent, target: THREE.Vector3): boolean {
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(groundPlane, target) !== null;
}

function updateAimVisual(point: THREE.Vector3): void {
  const from = ball.position.clone();
  const shot = from.clone().sub(point);
  shot.y = 0;
  const distance = Math.min(shot.length(), 4.4);

  if (distance < 0.15) {
    aimLine.visible = false;
    arrow.visible = false;
    return;
  }

  const direction = shot.normalize();
  const end = from.clone().addScaledVector(direction, distance);
  from.y = ballRadius + 0.05;
  end.y = ballRadius + 0.05;

  const positions = aimGeometry.attributes.position as THREE.BufferAttribute;
  positions.setXYZ(0, from.x, from.y, from.z);
  positions.setXYZ(1, end.x, end.y, end.z);
  positions.needsUpdate = true;

  arrow.position.copy(end);
  arrow.position.y = ballRadius + 0.08;
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  aimLine.visible = true;
  arrow.visible = true;
}

function shoot(point: THREE.Vector3): void {
  if (sunk || velocity.lengthSq() > 0.012) {
    return;
  }

  const shot = ball.position.clone().sub(point);
  shot.y = 0;
  const power = Math.min(shot.length(), 4.4);

  if (power < 0.28) {
    return;
  }

  velocity.copy(shot.normalize().multiplyScalar(power * 3.25));
  strokes += 1;
  setScore();
  if (hintEl) {
    hintEl.textContent = "Ball in motion. Line up the next shot when it stops.";
  }
}

function resetBall(): void {
  ball.position.copy(startPosition);
  velocity.set(0, 0, 0);
  sunk = false;
  ball.visible = true;
  if (hintEl) {
    hintEl.textContent = "Click and drag from the ball to aim. Release to shoot.";
  }
}

function resolveBounds(): void {
  const minX = -greenWidth / 2 + ballRadius;
  const maxX = greenWidth / 2 - ballRadius;
  const minZ = -greenLength / 2 + ballRadius;
  const maxZ = greenLength / 2 - ballRadius;

  if (ball.position.x < minX || ball.position.x > maxX) {
    ball.position.x = THREE.MathUtils.clamp(ball.position.x, minX, maxX);
    velocity.x *= -0.72;
  }

  if (ball.position.z < minZ || ball.position.z > maxZ) {
    ball.position.z = THREE.MathUtils.clamp(ball.position.z, minZ, maxZ);
    velocity.z *= -0.72;
  }
}

function resolveObstacle(): void {
  localBallPoint.copy(ball.position).applyMatrix4(obstacleInverse);
  const half = new THREE.Vector3(4.1 / 2, 0.68 / 2, 0.8 / 2);

  if (
    Math.abs(localBallPoint.x) > half.x + ballRadius ||
    Math.abs(localBallPoint.z) > half.z + ballRadius
  ) {
    return;
  }

  const overlapX = half.x + ballRadius - Math.abs(localBallPoint.x);
  const overlapZ = half.z + ballRadius - Math.abs(localBallPoint.z);
  const normalLocal = new THREE.Vector3();

  if (overlapX < overlapZ) {
    normalLocal.set(Math.sign(localBallPoint.x) || 1, 0, 0);
    localBallPoint.x += normalLocal.x * overlapX;
  } else {
    normalLocal.set(0, 0, Math.sign(localBallPoint.z) || 1);
    localBallPoint.z += normalLocal.z * overlapZ;
  }

  const corrected = localBallPoint.clone().applyMatrix4(obstacle.matrixWorld);
  ball.position.x = corrected.x;
  ball.position.z = corrected.z;

  const normalWorld = normalLocal
    .transformDirection(obstacle.matrixWorld)
    .normalize();
  const speedIntoSurface = velocity.dot(normalWorld);
  if (speedIntoSurface < 0) {
    velocity.addScaledVector(normalWorld, -1.72 * speedIntoSurface);
  }
  velocity.multiplyScalar(0.9);
}

function updatePhysics(dt: number): void {
  if (sunk) {
    return;
  }

  previousBallPosition.copy(ball.position);
  ball.position.addScaledVector(velocity, dt);
  ball.position.y = ballRadius;

  resolveBounds();
  resolveObstacle();

  const speed = velocity.length();
  if (speed > 0) {
    const friction = Math.max(0, 1 - 1.65 * dt);
    velocity.multiplyScalar(friction);
    if (velocity.lengthSq() < 0.006) {
      velocity.set(0, 0, 0);
      if (hintEl) {
        hintEl.textContent = "Click and drag from the ball to aim. Release to shoot.";
      }
    }
  }

  const travel = ball.position.clone().sub(previousBallPosition);
  const rollAxis = new THREE.Vector3(travel.z, 0, -travel.x);
  if (rollAxis.lengthSq() > 0.000001) {
    ball.rotateOnWorldAxis(rollAxis.normalize(), travel.length() / ballRadius);
  }

  const toCup = new THREE.Vector2(
    ball.position.x - holePosition.x,
    ball.position.z - holePosition.z,
  );
  if (toCup.length() < holeRadius * 0.72 && velocity.length() < 2.25) {
    sunk = true;
    velocity.set(0, 0, 0);
    ball.position.set(holePosition.x, 0.03, holePosition.z);
    ball.scale.setScalar(0.32);
    if (hintEl) {
      hintEl.textContent = "Holed out. Double click to reset for another round.";
    }
  }
}

function updateCamera(dt: number): void {
  const desired = new THREE.Vector3(
    ball.position.x * 0.45,
    7.8,
    ball.position.z + 8.2,
  );
  camera.position.lerp(desired, 1 - Math.exp(-dt * 3.2));
  const target = new THREE.Vector3(ball.position.x, 0.35, ball.position.z - 1.7);
  camera.lookAt(target);
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (sunk || velocity.lengthSq() > 0.012 || !getGreenPoint(event, dragPoint)) {
    return;
  }
  aiming = true;
  renderer.domElement.setPointerCapture(event.pointerId);
  updateAimVisual(dragPoint);
});

renderer.domElement.addEventListener("pointermove", (event) => {
  if (!aiming || !getGreenPoint(event, dragPoint)) {
    return;
  }
  updateAimVisual(dragPoint);
});

renderer.domElement.addEventListener("pointerup", (event) => {
  if (!aiming) {
    return;
  }
  aiming = false;
  aimLine.visible = false;
  arrow.visible = false;
  if (getGreenPoint(event, dragPoint)) {
    shoot(dragPoint);
  }
});

renderer.domElement.addEventListener("dblclick", () => {
  ball.scale.setScalar(1);
  resetBall();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

setScore();
const clock = new THREE.Clock();

function animate(): void {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  updatePhysics(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
