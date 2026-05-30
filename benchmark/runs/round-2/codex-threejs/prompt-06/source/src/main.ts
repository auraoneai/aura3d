import * as THREE from 'three';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app container');
}

const ui = document.createElement('div');
ui.className = 'hud';
ui.innerHTML = `
  <div class="score">
    <span>Strokes</span>
    <strong id="strokes">0</strong>
  </div>
  <div class="status" id="status">Drag from the ball, then release to shoot</div>
`;
app.appendChild(ui);

const styles = document.createElement('style');
styles.textContent = `
  html, body, #app {
    height: 100%;
    margin: 0;
    overflow: hidden;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #7fb7cf;
  }

  canvas {
    display: block;
  }

  .hud {
    position: fixed;
    left: 18px;
    top: 18px;
    z-index: 2;
    display: flex;
    align-items: stretch;
    gap: 10px;
    color: #102018;
    pointer-events: none;
  }

  .score,
  .status {
    border: 1px solid rgba(16, 32, 24, 0.18);
    border-radius: 8px;
    background: rgba(245, 255, 239, 0.9);
    box-shadow: 0 10px 28px rgba(23, 55, 41, 0.18);
    backdrop-filter: blur(8px);
  }

  .score {
    min-width: 92px;
    padding: 10px 12px;
  }

  .score span {
    display: block;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
    color: #426050;
  }

  .score strong {
    display: block;
    margin-top: 2px;
    font-size: 32px;
    line-height: 1;
  }

  .status {
    max-width: min(300px, calc(100vw - 150px));
    padding: 12px 14px;
    font-size: 14px;
    font-weight: 650;
    line-height: 1.25;
  }
`;
document.head.appendChild(styles);

const strokesEl = document.querySelector<HTMLElement>('#strokes');
const statusEl = document.querySelector<HTMLDivElement>('#status');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x86bed4);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x86bed4);
scene.fog = new THREE.Fog(0x86bed4, 20, 52);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
const cameraOffset = new THREE.Vector3(0, 8, 10.5);

const ambient = new THREE.HemisphereLight(0xdff7ff, 0x51704d, 2.2);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(-6, 12, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 35;
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 16;
sun.shadow.camera.bottom = -16;
scene.add(sun);

const courseGroup = new THREE.Group();
scene.add(courseGroup);

const greenMaterial = new THREE.MeshStandardMaterial({ color: 0x52b85f, roughness: 0.85 });
const fairwayMaterial = new THREE.MeshStandardMaterial({ color: 0x79cf6a, roughness: 0.9 });
const railMaterial = new THREE.MeshStandardMaterial({ color: 0xf2e0b4, roughness: 0.72 });
const darkRailMaterial = new THREE.MeshStandardMaterial({ color: 0xcda867, roughness: 0.75 });

const green = new THREE.Mesh(new THREE.BoxGeometry(12, 0.28, 22), greenMaterial);
green.position.y = -0.14;
green.receiveShadow = true;
courseGroup.add(green);

const fairwayStripe = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.015, 18.5), fairwayMaterial);
fairwayStripe.position.set(0, 0.01, -0.2);
fairwayStripe.receiveShadow = true;
courseGroup.add(fairwayStripe);

const railHeight = 0.46;
type RailSpec = {
  size: [number, number, number];
  pos: [number, number, number];
};

const rails: RailSpec[] = [
  { size: [12.8, railHeight, 0.42], pos: [0, railHeight / 2, -11.22] },
  { size: [12.8, railHeight, 0.42], pos: [0, railHeight / 2, 11.22] },
  { size: [0.42, railHeight, 22], pos: [-6.22, railHeight / 2, 0] },
  { size: [0.42, railHeight, 22], pos: [6.22, railHeight / 2, 0] },
];

for (const rail of rails) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...rail.size), railMaterial);
  mesh.position.set(...rail.pos);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  courseGroup.add(mesh);
}

for (const z of [-6.8, -2.4, 2.0, 6.4]) {
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.018, 0.08), darkRailMaterial);
  stripe.position.set(0, 0.025, z);
  stripe.receiveShadow = true;
  courseGroup.add(stripe);
}

const obstacleRadius = 1.05;
const obstacle = new THREE.Mesh(
  new THREE.CylinderGeometry(obstacleRadius, obstacleRadius, 0.8, 48),
  new THREE.MeshStandardMaterial({ color: 0xd5483f, roughness: 0.58 }),
);
obstacle.position.set(0, 0.4, -1.1);
obstacle.castShadow = true;
obstacle.receiveShadow = true;
courseGroup.add(obstacle);

const obstacleBand = new THREE.Mesh(
  new THREE.TorusGeometry(obstacleRadius + 0.02, 0.045, 12, 48),
  new THREE.MeshStandardMaterial({ color: 0xffd766, roughness: 0.5 }),
);
obstacleBand.position.copy(obstacle.position);
obstacleBand.position.y = 0.82;
obstacleBand.rotation.x = Math.PI / 2;
obstacleBand.castShadow = true;
courseGroup.add(obstacleBand);

const holePosition = new THREE.Vector3(0, 0.02, -8.7);
const hole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.42, 0.42, 0.04, 48),
  new THREE.MeshBasicMaterial({ color: 0x101010 }),
);
hole.position.copy(holePosition);
hole.rotation.x = Math.PI;
courseGroup.add(hole);

const flagPole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.035, 1.75, 12),
  new THREE.MeshStandardMaterial({ color: 0xfaf7ef, roughness: 0.35 }),
);
flagPole.position.set(holePosition.x + 0.33, 0.88, holePosition.z);
flagPole.castShadow = true;
courseGroup.add(flagPole);

const flag = new THREE.Mesh(
  new THREE.BoxGeometry(0.78, 0.44, 0.035),
  new THREE.MeshStandardMaterial({ color: 0xff385c, roughness: 0.6 }),
);
flag.position.set(flagPole.position.x + 0.38, 1.43, flagPole.position.z);
flag.castShadow = true;
courseGroup.add(flag);

const ballRadius = 0.28;
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(ballRadius, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.02 }),
);
ball.castShadow = true;
ball.receiveShadow = true;
scene.add(ball);

const ballRing = new THREE.Mesh(
  new THREE.TorusGeometry(ballRadius * 1.16, 0.018, 10, 42),
  new THREE.MeshBasicMaterial({ color: 0x194c2b }),
);
ballRing.rotation.x = Math.PI / 2;
scene.add(ballRing);

const aimLineMaterial = new THREE.LineBasicMaterial({ color: 0xfff1a8, linewidth: 3 });
const aimLineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const aimLine = new THREE.Line(aimLineGeometry, aimLineMaterial);
aimLine.visible = false;
scene.add(aimLine);

const powerBar = new THREE.Mesh(
  new THREE.BoxGeometry(1, 0.05, 0.12),
  new THREE.MeshBasicMaterial({ color: 0xfff1a8 }),
);
powerBar.visible = false;
scene.add(powerBar);

const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pointerWorld = new THREE.Vector3();
const ballPosition = new THREE.Vector3(0, ballRadius, 7.7);
const velocity = new THREE.Vector3();
const startPosition = ballPosition.clone();
let strokes = 0;
let aiming = false;
let sunk = false;
let lastTime = 0;

const bounds = {
  minX: -5.62 + ballRadius,
  maxX: 5.62 - ballRadius,
  minZ: -10.58 + ballRadius,
  maxZ: 10.58 - ballRadius,
};

function setStatus(text: string) {
  if (statusEl) {
    statusEl.textContent = text;
  }
}

function updateScore() {
  if (strokesEl) {
    strokesEl.textContent = String(strokes);
  }
}

function setPointerFromEvent(event: PointerEvent) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectPlane(ground, pointerWorld);
}

function resetBall() {
  ballPosition.copy(startPosition);
  velocity.set(0, 0, 0);
  ball.scale.setScalar(1);
  sunk = false;
  setStatus('Drag from the ball, then release to shoot');
}

function shootFromPointer() {
  const shot = ballPosition.clone().sub(pointerWorld);
  shot.y = 0;
  const power = THREE.MathUtils.clamp(shot.length(), 0, 3.2);

  if (power < 0.25) {
    setStatus('Pull farther from the ball for more power');
    return;
  }

  shot.normalize();
  velocity.copy(shot.multiplyScalar(power * 4.9));
  strokes += 1;
  updateScore();
  setStatus('Rolling...');
}

function updateAimVisual() {
  if (!aiming || sunk) {
    aimLine.visible = false;
    powerBar.visible = false;
    return;
  }

  const shot = ballPosition.clone().sub(pointerWorld);
  shot.y = 0;
  const power = THREE.MathUtils.clamp(shot.length(), 0, 3.2);
  const direction = shot.lengthSq() > 0.0001 ? shot.normalize() : new THREE.Vector3(0, 0, -1);
  const end = ballPosition.clone().add(direction.multiplyScalar(power * 1.55));
  end.y = 0.08;

  const positions = aimLine.geometry.attributes.position as THREE.BufferAttribute;
  positions.setXYZ(0, ballPosition.x, 0.08, ballPosition.z);
  positions.setXYZ(1, end.x, end.y, end.z);
  positions.needsUpdate = true;
  aimLine.visible = true;

  powerBar.visible = true;
  powerBar.scale.set(power, 1, 1);
  powerBar.position.copy(ballPosition).add(new THREE.Vector3(0, 0.42, 0));
  powerBar.lookAt(camera.position);
}

function resolveObstacleCollision() {
  const center = new THREE.Vector3(obstacle.position.x, 0, obstacle.position.z);
  const flatBall = new THREE.Vector3(ballPosition.x, 0, ballPosition.z);
  const delta = flatBall.sub(center);
  const minDistance = obstacleRadius + ballRadius;
  const distance = delta.length();

  if (distance > 0 && distance < minDistance) {
    const normal = delta.divideScalar(distance);
    ballPosition.x = center.x + normal.x * minDistance;
    ballPosition.z = center.z + normal.z * minDistance;
    const reflected = velocity.clone().reflect(normal).multiplyScalar(0.68);
    velocity.set(reflected.x, 0, reflected.z);
  }
}

function updatePhysics(dt: number) {
  if (sunk) {
    ball.scale.multiplyScalar(Math.max(0.96, 1 - dt * 2.2));
    ballPosition.y = THREE.MathUtils.lerp(ballPosition.y, 0.05, 1 - Math.exp(-dt * 8));
    if (ball.scale.x < 0.08) {
      resetBall();
    }
    return;
  }

  ballPosition.addScaledVector(velocity, dt);

  if (ballPosition.x < bounds.minX || ballPosition.x > bounds.maxX) {
    ballPosition.x = THREE.MathUtils.clamp(ballPosition.x, bounds.minX, bounds.maxX);
    velocity.x *= -0.72;
  }

  if (ballPosition.z < bounds.minZ || ballPosition.z > bounds.maxZ) {
    ballPosition.z = THREE.MathUtils.clamp(ballPosition.z, bounds.minZ, bounds.maxZ);
    velocity.z *= -0.72;
  }

  resolveObstacleCollision();

  const friction = Math.pow(0.08, dt);
  velocity.multiplyScalar(friction);

  if (velocity.length() < 0.045) {
    velocity.set(0, 0, 0);
    if (!aiming) {
      setStatus('Drag from the ball, then release to shoot');
    }
  }

  const holeDistance = new THREE.Vector2(ballPosition.x - holePosition.x, ballPosition.z - holePosition.z).length();
  if (holeDistance < 0.4 && velocity.length() < 2.6) {
    sunk = true;
    aiming = false;
    aimLine.visible = false;
    powerBar.visible = false;
    velocity.set(0, 0, 0);
    ballPosition.x = holePosition.x;
    ballPosition.z = holePosition.z;
    setStatus('Holed out. Resetting ball...');
  }
}

function syncMeshes(dt: number) {
  ball.position.copy(ballPosition);
  ballRing.position.set(ballPosition.x, 0.035, ballPosition.z);

  const move = velocity.clone();
  move.y = 0;
  if (move.lengthSq() > 0.0001) {
    const axis = new THREE.Vector3(move.z, 0, -move.x).normalize();
    ball.rotateOnWorldAxis(axis, move.length() * dt / ballRadius);
  }

  const desiredCamera = ballPosition.clone().add(cameraOffset);
  camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 4.5));
  camera.lookAt(ballPosition.x, 0.2, ballPosition.z - 1.2);
}

function animate(time: number) {
  const dt = Math.min((time - lastTime) / 1000 || 0, 0.033);
  lastTime = time;

  updatePhysics(dt);
  updateAimVisual();
  syncMeshes(dt);
  renderer.render(scene, camera);
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (sunk || velocity.lengthSq() > 0.02) {
    return;
  }

  setPointerFromEvent(event);
  const distanceToBall = new THREE.Vector2(pointerWorld.x - ballPosition.x, pointerWorld.z - ballPosition.z).length();
  if (distanceToBall <= 1.45) {
    aiming = true;
    renderer.domElement.setPointerCapture(event.pointerId);
    setStatus('Release to shoot');
    updateAimVisual();
  }
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (!aiming) {
    return;
  }

  setPointerFromEvent(event);
  updateAimVisual();
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (!aiming) {
    return;
  }

  setPointerFromEvent(event);
  aiming = false;
  aimLine.visible = false;
  powerBar.visible = false;
  renderer.domElement.releasePointerCapture(event.pointerId);
  shootFromPointer();
});

renderer.domElement.addEventListener('pointercancel', () => {
  aiming = false;
  aimLine.visible = false;
  powerBar.visible = false;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

updateScore();
syncMeshes(1);
renderer.setAnimationLoop(animate);
