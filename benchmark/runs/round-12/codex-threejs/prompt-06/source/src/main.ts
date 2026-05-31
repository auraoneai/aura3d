import * as THREE from 'three';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app element');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#7fb56b';
app.style.width = '100vw';
app.style.height = '100vh';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ad7f2);
scene.fog = new THREE.Fog(0x9ad7f2, 35, 85);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, 9, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const hud = document.createElement('div');
hud.style.position = 'fixed';
hud.style.left = '18px';
hud.style.top = '16px';
hud.style.padding = '10px 14px';
hud.style.border = '2px solid rgba(30, 65, 35, 0.75)';
hud.style.borderRadius = '8px';
hud.style.background = 'rgba(246, 255, 238, 0.92)';
hud.style.color = '#143b20';
hud.style.font = '700 18px system-ui, -apple-system, Segoe UI, sans-serif';
hud.style.boxShadow = '0 8px 22px rgba(0, 0, 0, 0.18)';
hud.style.userSelect = 'none';
hud.textContent = 'Strokes: 0';
document.body.appendChild(hud);

const help = document.createElement('div');
help.style.position = 'fixed';
help.style.left = '18px';
help.style.bottom = '16px';
help.style.maxWidth = '330px';
help.style.padding = '10px 12px';
help.style.borderRadius = '8px';
help.style.background = 'rgba(20, 45, 25, 0.72)';
help.style.color = '#f3ffe9';
help.style.font = '500 14px/1.35 system-ui, -apple-system, Segoe UI, sans-serif';
help.style.userSelect = 'none';
help.textContent = 'Click and drag from the ball to aim. Release to shoot.';
document.body.appendChild(help);

const ambient = new THREE.HemisphereLight(0xf1fff5, 0x5a7d4a, 2.0);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 3.0);
sun.position.set(-8, 16, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
scene.add(sun);

const greenMaterial = new THREE.MeshStandardMaterial({ color: 0x2f9b45, roughness: 0.86 });
const fringeMaterial = new THREE.MeshStandardMaterial({ color: 0x24753c, roughness: 0.9 });
const sandMaterial = new THREE.MeshStandardMaterial({ color: 0xc7aa62, roughness: 0.95 });
const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xf8fbff, roughness: 0.35 });
const redMaterial = new THREE.MeshStandardMaterial({ color: 0xd94134, roughness: 0.55 });
const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2b20, roughness: 0.7 });
const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x8a5731, roughness: 0.62 });

const course = new THREE.Group();
scene.add(course);

const green = new THREE.Mesh(new THREE.BoxGeometry(13, 0.22, 24), greenMaterial);
green.receiveShadow = true;
green.position.y = -0.12;
course.add(green);

const fringe = new THREE.Mesh(new THREE.BoxGeometry(15, 0.18, 26), fringeMaterial);
fringe.receiveShadow = true;
fringe.position.y = -0.22;
course.add(fringe);

const backStop = makeRail(13.4, 0.55, 0.38);
backStop.position.set(0, 0.24, -12.2);
course.add(backStop);

const leftRail = makeRail(0.4, 0.55, 24.2);
leftRail.position.set(-6.7, 0.24, 0);
course.add(leftRail);

const rightRail = makeRail(0.4, 0.55, 24.2);
rightRail.position.set(6.7, 0.24, 0);
course.add(rightRail);

const teeMat = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.035, 40), sandMaterial);
teeMat.position.set(0, 0.035, 9.2);
teeMat.receiveShadow = true;
course.add(teeMat);

const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.035, 48), darkMaterial);
hole.position.set(0, 0.055, -9.4);
course.add(hole);

const cupRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.5, 0.04, 8, 48),
  new THREE.MeshStandardMaterial({ color: 0xe9f2ea, roughness: 0.45 }),
);
cupRing.position.set(0, 0.09, -9.4);
cupRing.rotation.x = Math.PI / 2;
course.add(cupRing);

const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 12), whiteMaterial);
flagPole.position.set(0.23, 1.16, -9.4);
flagPole.castShadow = true;
course.add(flagPole);

const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.5), redMaterial);
flag.position.set(0.67, 1.85, -9.4);
flag.rotation.y = -0.2;
flag.castShadow = true;
course.add(flag);

const obstacle = new THREE.Group();
const obstacleBody = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.72, 0.72), woodMaterial);
obstacleBody.castShadow = true;
obstacleBody.receiveShadow = true;
obstacle.add(obstacleBody);

for (const x of [-2.45, 2.45]) {
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.82, 24), woodMaterial);
  cap.rotation.x = Math.PI / 2;
  cap.position.x = x;
  cap.castShadow = true;
  cap.receiveShadow = true;
  obstacle.add(cap);
}

obstacle.position.set(0, 0.43, -1.3);
obstacle.rotation.y = 0.42;
course.add(obstacle);

const ballRadius = 0.34;
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(ballRadius, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0.02 }),
);
ball.position.set(0, ballRadius, 8.8);
ball.castShadow = true;
scene.add(ball);

const ballStripe = new THREE.Mesh(
  new THREE.TorusGeometry(ballRadius * 1.01, 0.015, 8, 40),
  new THREE.MeshStandardMaterial({ color: 0x2e7ce8, roughness: 0.35 }),
);
ballStripe.rotation.x = Math.PI / 2;
ball.add(ballStripe);

const aimLineMaterial = new THREE.LineBasicMaterial({ color: 0xfff4a0 });
const aimLineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const aimLine = new THREE.Line(aimLineGeometry, aimLineMaterial);
aimLine.visible = false;
scene.add(aimLine);

const powerCone = new THREE.Mesh(
  new THREE.ConeGeometry(0.18, 0.7, 24),
  new THREE.MeshBasicMaterial({ color: 0xfff4a0 }),
);
powerCone.visible = false;
scene.add(powerCone);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const dragPoint = new THREE.Vector3();
const ballVelocity = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();
const cameraOffset = new THREE.Vector3(0, 7.4, 10.5);
let isAiming = false;
let strokes = 0;
let didHoleOut = false;
let lastTime = performance.now();

function makeRail(width: number, height: number, depth: number): THREE.Mesh {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), woodMaterial);
  rail.castShadow = true;
  rail.receiveShadow = true;
  return rail;
}

function updatePointer(event: PointerEvent): void {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function pointerOnGround(event: PointerEvent): THREE.Vector3 | null {
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(groundPlane, dragPoint);
}

function canShoot(): boolean {
  return ballVelocity.lengthSq() < 0.015 && !didHoleOut;
}

function setAimVisual(target: THREE.Vector3): void {
  const from = new THREE.Vector3(ball.position.x, 0.08, ball.position.z);
  const pull = from.clone().sub(new THREE.Vector3(target.x, 0.08, target.z));
  const clamped = pull.clampLength(0, 4.2);
  const to = from.clone().add(clamped);
  aimLineGeometry.setFromPoints([from, to]);
  aimLineGeometry.attributes.position.needsUpdate = true;
  aimLine.visible = true;

  powerCone.visible = true;
  powerCone.position.copy(to);
  powerCone.position.y = 0.18;
  powerCone.lookAt(from);
  powerCone.rotateX(Math.PI / 2);
}

function shoot(target: THREE.Vector3): void {
  const ballGround = new THREE.Vector3(ball.position.x, 0, ball.position.z);
  const pullVector = ballGround.sub(new THREE.Vector3(target.x, 0, target.z));
  if (pullVector.length() < 0.2) {
    return;
  }
  ballVelocity.copy(pullVector.clampLength(0, 4.2).multiplyScalar(2.75));
  strokes += 1;
  hud.textContent = `Strokes: ${strokes}`;
}

function resetBall(): void {
  ball.position.set(0, ballRadius, 8.8);
  ballVelocity.set(0, 0, 0);
  didHoleOut = false;
  hud.textContent = `Strokes: ${strokes}`;
}

function resolveBoxCollision(center: THREE.Vector3, halfX: number, halfZ: number): void {
  const local = obstacle.worldToLocal(center.clone());
  const expandedX = halfX + ballRadius;
  const expandedZ = halfZ + ballRadius;

  if (Math.abs(local.x) > expandedX || Math.abs(local.z) > expandedZ) {
    return;
  }

  const overlapX = expandedX - Math.abs(local.x);
  const overlapZ = expandedZ - Math.abs(local.z);
  const normalLocal = new THREE.Vector3();

  if (overlapX < overlapZ) {
    normalLocal.set(Math.sign(local.x) || 1, 0, 0);
    local.x += normalLocal.x * overlapX;
  } else {
    normalLocal.set(0, 0, Math.sign(local.z) || 1);
    local.z += normalLocal.z * overlapZ;
  }

  const corrected = obstacle.localToWorld(local);
  ball.position.x = corrected.x;
  ball.position.z = corrected.z;

  const normalWorld = normalLocal.transformDirection(obstacle.matrixWorld);
  const impact = ballVelocity.dot(normalWorld);
  if (impact < 0) {
    ballVelocity.addScaledVector(normalWorld, -1.75 * impact);
    ballVelocity.multiplyScalar(0.82);
  }
}

function stepPhysics(delta: number): void {
  if (didHoleOut) {
    return;
  }

  ball.position.addScaledVector(ballVelocity, delta);

  const speed = ballVelocity.length();
  if (speed > 0) {
    const drag = Math.max(0, 1 - 1.45 * delta);
    ballVelocity.multiplyScalar(drag);
    if (ballVelocity.lengthSq() < 0.004) {
      ballVelocity.set(0, 0, 0);
    }
    const spinAxis = new THREE.Vector3(ballVelocity.z, 0, -ballVelocity.x);
    if (spinAxis.lengthSq() > 0) {
      ball.rotateOnWorldAxis(spinAxis.normalize(), (speed * delta) / ballRadius);
    }
  }

  const limitX = 6.16 - ballRadius;
  const limitFront = 11.56 - ballRadius;
  const limitBack = -11.56 + ballRadius;

  if (ball.position.x < -limitX || ball.position.x > limitX) {
    ball.position.x = THREE.MathUtils.clamp(ball.position.x, -limitX, limitX);
    ballVelocity.x *= -0.72;
  }
  if (ball.position.z > limitFront || ball.position.z < limitBack) {
    ball.position.z = THREE.MathUtils.clamp(ball.position.z, limitBack, limitFront);
    ballVelocity.z *= -0.72;
  }

  resolveBoxCollision(ball.position, 2.35, 0.36);

  const distanceToCup = Math.hypot(ball.position.x, ball.position.z + 9.4);
  if (distanceToCup < 0.44 && ballVelocity.length() < 2.4) {
    didHoleOut = true;
    ballVelocity.set(0, 0, 0);
    ball.position.set(0, 0.12, -9.4);
    hud.textContent = `Holed in ${strokes} stroke${strokes === 1 ? '' : 's'}`;
    window.setTimeout(resetBall, 1600);
  }
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  const point = pointerOnGround(event);
  if (!point || !canShoot()) {
    return;
  }

  const nearBall = Math.hypot(point.x - ball.position.x, point.z - ball.position.z) < 1.5;
  if (!nearBall) {
    return;
  }

  isAiming = true;
  renderer.domElement.setPointerCapture(event.pointerId);
  setAimVisual(point);
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (!isAiming) {
    return;
  }
  const point = pointerOnGround(event);
  if (point) {
    setAimVisual(point);
  }
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (!isAiming) {
    return;
  }
  const point = pointerOnGround(event);
  isAiming = false;
  aimLine.visible = false;
  powerCone.visible = false;
  renderer.domElement.releasePointerCapture(event.pointerId);
  if (point) {
    shoot(point);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate(now: number): void {
  const delta = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;

  stepPhysics(delta);

  const desiredCamera = ball.position.clone().add(cameraOffset);
  camera.position.lerp(desiredCamera, 0.075);
  cameraTarget.lerp(ball.position, 0.12);
  camera.lookAt(cameraTarget.x, cameraTarget.y + 0.2, cameraTarget.z);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
