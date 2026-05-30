import * as THREE from 'three';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#122016';
document.body.style.fontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

app.style.width = '100vw';
app.style.height = '100vh';

const hud = document.createElement('div');
hud.style.position = 'fixed';
hud.style.left = '18px';
hud.style.top = '16px';
hud.style.zIndex = '10';
hud.style.display = 'grid';
hud.style.gap = '8px';
hud.style.color = '#f7fbf2';
hud.style.textShadow = '0 2px 12px rgba(0, 0, 0, 0.35)';
hud.innerHTML = `
  <div style="font-weight: 800; font-size: clamp(20px, 3vw, 32px); letter-spacing: 0;">Mini-Golf Hole</div>
  <div id="score" style="font-weight: 700; font-size: 18px;">Strokes: 0</div>
  <div id="status" style="max-width: 280px; line-height: 1.35; font-size: 14px;">Ready to putt</div>
`;
document.body.appendChild(hud);

const scoreEl = hud.querySelector<HTMLDivElement>('#score');
const statusEl = hud.querySelector<HTMLDivElement>('#status');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bc3d4);
scene.fog = new THREE.Fog(0x9bc3d4, 22, 58);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const ambient = new THREE.HemisphereLight(0xe8fbff, 0x31502d, 2.2);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(-6, 13, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 20;
sun.shadow.camera.bottom = -8;
scene.add(sun);

const green = new THREE.Group();
scene.add(green);

const greenMaterial = new THREE.MeshStandardMaterial({ color: 0x4cad47, roughness: 0.82 });
const fringeMaterial = new THREE.MeshStandardMaterial({ color: 0x2f7d35, roughness: 0.9 });
const railMaterial = new THREE.MeshStandardMaterial({ color: 0xcaa66d, roughness: 0.72 });
const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xe7f6d1, transparent: true, opacity: 0.42 });

const base = new THREE.Mesh(new THREE.BoxGeometry(9, 0.22, 17), greenMaterial);
base.position.y = -0.11;
base.receiveShadow = true;
green.add(base);

const fringe = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.16, 18.6), fringeMaterial);
fringe.position.y = -0.2;
fringe.receiveShadow = true;
green.add(fringe);
fringe.renderOrder = -1;

const createRail = (width: number, depth: number, x: number, z: number) => {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.55, depth), railMaterial);
  rail.position.set(x, 0.18, z);
  rail.castShadow = true;
  rail.receiveShadow = true;
  green.add(rail);
  return rail;
};

createRail(10, 0.38, 0, -8.7);
createRail(10, 0.38, 0, 8.7);
createRail(0.38, 0.65, -4.7, -8.36);
createRail(0.38, 0.65, 4.7, -8.36);
createRail(0.38, 0.65, -4.7, 8.36);
createRail(0.38, 0.65, 4.7, 8.36);
createRail(0.38, 16.1, -4.7, 0);
createRail(0.38, 16.1, 4.7, 0);

for (let z = -5; z <= 5; z += 5) {
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 0.035), lineMaterial);
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(0, 0.014, z);
  green.add(stripe);
}

const obstacle = new THREE.Mesh(
  new THREE.BoxGeometry(1.15, 0.85, 3.4),
  new THREE.MeshStandardMaterial({ color: 0xd94f3d, roughness: 0.62 }),
);
obstacle.position.set(0, 0.43, -0.75);
obstacle.castShadow = true;
obstacle.receiveShadow = true;
green.add(obstacle);

const obstacleCap = new THREE.Mesh(
  new THREE.BoxGeometry(1.35, 0.16, 3.65),
  new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.55 }),
);
obstacleCap.position.set(0, 0.94, -0.75);
obstacleCap.castShadow = true;
green.add(obstacleCap);

const cup = new THREE.Mesh(
  new THREE.CylinderGeometry(0.38, 0.38, 0.035, 48),
  new THREE.MeshStandardMaterial({ color: 0x11150f, roughness: 0.5 }),
);
cup.position.set(0, 0.026, -6.55);
green.add(cup);

const cupRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.42, 0.035, 10, 56),
  new THREE.MeshStandardMaterial({ color: 0xf3f0d2, roughness: 0.35 }),
);
cupRing.rotation.x = Math.PI / 2;
cupRing.position.set(0, 0.048, -6.55);
green.add(cupRing);

const flagPole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.025, 0.025, 2.6, 12),
  new THREE.MeshStandardMaterial({ color: 0xf8f8f2, roughness: 0.25 }),
);
flagPole.position.set(0.18, 1.32, -6.55);
flagPole.castShadow = true;
green.add(flagPole);

const flagShape = new THREE.Shape();
flagShape.moveTo(0, 0);
flagShape.lineTo(1, 0.24);
flagShape.lineTo(0, 0.48);
flagShape.lineTo(0, 0);
const flag = new THREE.Mesh(
  new THREE.ShapeGeometry(flagShape),
  new THREE.MeshStandardMaterial({ color: 0xfff26e, side: THREE.DoubleSide, roughness: 0.5 }),
);
flag.position.set(0.2, 2.26, -6.55);
flag.rotation.y = -0.4;
flag.castShadow = true;
green.add(flag);

const ballRadius = 0.28;
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(ballRadius, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0xf8f8f5, roughness: 0.34, metalness: 0.02 }),
);
ball.position.set(0, ballRadius, 6.2);
ball.castShadow = true;
ball.receiveShadow = true;
scene.add(ball);

const ballVelocity = new THREE.Vector3();
let strokes = 0;
let aiming = false;
let pointerWorld = new THREE.Vector3();
let holed = false;

const idleAimGeometry = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(),
  new THREE.Vector3(),
]);
const idleAim = new THREE.Line(
  idleAimGeometry,
  new THREE.LineBasicMaterial({ color: 0xfff26e, transparent: true, opacity: 0.55 }),
);
scene.add(idleAim);

const aimLineGeometry = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(),
  new THREE.Vector3(),
]);
const aimLine = new THREE.Line(
  aimLineGeometry,
  new THREE.LineBasicMaterial({ color: 0xfff26e, transparent: true, opacity: 0.95 }),
);
aimLine.visible = false;
scene.add(aimLine);

const powerMarker = new THREE.Mesh(
  new THREE.ConeGeometry(0.18, 0.55, 24),
  new THREE.MeshStandardMaterial({ color: 0xfff26e, emissive: 0x332800, roughness: 0.45 }),
);
powerMarker.rotation.x = Math.PI / 2;
powerMarker.visible = false;
scene.add(powerMarker);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function setPointerFromEvent(event: PointerEvent) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectPlane(groundPlane, pointerWorld);
}

function canShoot() {
  return !holed && ballVelocity.lengthSq() < 0.0025;
}

function updateHud(message?: string) {
  if (scoreEl) scoreEl.textContent = `Strokes: ${strokes}`;
  if (statusEl && message) statusEl.textContent = message;
}

function updateIdleAimVisual() {
  const visible = canShoot() && !aiming;
  idleAim.visible = visible;

  if (!visible) {
    if (!aiming) powerMarker.visible = false;
    return;
  }

  const start = ball.position.clone();
  start.y = 0.08;
  const end = start.clone();
  end.z -= 1.8;

  const positions = idleAimGeometry.attributes.position;
  positions.setXYZ(0, start.x, start.y, start.z);
  positions.setXYZ(1, end.x, end.y, end.z);
  positions.needsUpdate = true;

  powerMarker.visible = true;
  powerMarker.position.copy(end);
  powerMarker.position.y = 0.18;
  powerMarker.lookAt(end.x, end.y, end.z - 1);
}

function refreshAimVisual() {
  const drag = ball.position.clone().sub(pointerWorld);
  drag.y = 0;
  const distance = Math.min(drag.length(), 3.1);

  if (distance < 0.08) {
    aimLine.visible = false;
    powerMarker.visible = false;
    return;
  }

  const direction = drag.normalize();
  const start = ball.position.clone();
  start.y = 0.08;
  const end = start.clone().addScaledVector(direction, distance * 1.55);

  const positions = aimLineGeometry.attributes.position;
  positions.setXYZ(0, start.x, start.y, start.z);
  positions.setXYZ(1, end.x, end.y, end.z);
  positions.needsUpdate = true;

  aimLine.visible = true;
  powerMarker.visible = true;
  powerMarker.position.copy(end);
  powerMarker.position.y = 0.18;
  powerMarker.lookAt(end.clone().add(direction));
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  setPointerFromEvent(event);
  const distanceToBall = pointerWorld.distanceTo(new THREE.Vector3(ball.position.x, 0, ball.position.z));

  if (canShoot() && distanceToBall < 2.4) {
    aiming = true;
    renderer.domElement.setPointerCapture(event.pointerId);
    idleAim.visible = false;
    updateHud('Aiming');
    refreshAimVisual();
  }
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (!aiming) return;
  setPointerFromEvent(event);
  refreshAimVisual();
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (!aiming) return;

  setPointerFromEvent(event);
  const shot = ball.position.clone().sub(pointerWorld);
  shot.y = 0;
  const power = Math.min(shot.length(), 3.1);

  if (power > 0.12) {
    ballVelocity.copy(shot.normalize().multiplyScalar(power * 3.45));
    strokes += 1;
    updateHud('Rolling');
  } else {
    updateHud('Ready to putt');
  }

  aiming = false;
  aimLine.visible = false;
  powerMarker.visible = false;
  renderer.domElement.releasePointerCapture(event.pointerId);
});

function collideWithWalls() {
  const minX = -4.22 + ballRadius;
  const maxX = 4.22 - ballRadius;
  const minZ = -8.0 + ballRadius;
  const maxZ = 8.0 - ballRadius;

  if (ball.position.x < minX) {
    ball.position.x = minX;
    ballVelocity.x = Math.abs(ballVelocity.x) * 0.74;
  } else if (ball.position.x > maxX) {
    ball.position.x = maxX;
    ballVelocity.x = -Math.abs(ballVelocity.x) * 0.74;
  }

  if (ball.position.z < minZ) {
    ball.position.z = minZ;
    ballVelocity.z = Math.abs(ballVelocity.z) * 0.74;
  } else if (ball.position.z > maxZ) {
    ball.position.z = maxZ;
    ballVelocity.z = -Math.abs(ballVelocity.z) * 0.74;
  }
}

function collideWithObstacle() {
  const halfX = 0.575 + ballRadius;
  const halfZ = 1.7 + ballRadius;
  const dx = ball.position.x - obstacle.position.x;
  const dz = ball.position.z - obstacle.position.z;

  if (Math.abs(dx) >= halfX || Math.abs(dz) >= halfZ) return;

  const overlapX = halfX - Math.abs(dx);
  const overlapZ = halfZ - Math.abs(dz);

  if (overlapX < overlapZ) {
    ball.position.x = obstacle.position.x + Math.sign(dx || ballVelocity.x || 1) * halfX;
    ballVelocity.x *= -0.64;
    ballVelocity.z *= 0.9;
  } else {
    ball.position.z = obstacle.position.z + Math.sign(dz || ballVelocity.z || 1) * halfZ;
    ballVelocity.z *= -0.64;
    ballVelocity.x *= 0.9;
  }
}

const clock = new THREE.Clock();
const cameraTarget = new THREE.Vector3();
const cameraOffset = new THREE.Vector3(0, 8.6, 10.4);
camera.position.copy(ball.position).add(cameraOffset);

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);

  if (!holed) {
    ball.position.addScaledVector(ballVelocity, dt);
    collideWithWalls();
    collideWithObstacle();

    const speed = ballVelocity.length();
    if (speed > 0) {
      const rollAxis = new THREE.Vector3(ballVelocity.z, 0, -ballVelocity.x).normalize();
      ball.rotateOnWorldAxis(rollAxis, (speed * dt) / ballRadius);
    }

    ballVelocity.multiplyScalar(Math.pow(0.58, dt));
    if (ballVelocity.lengthSq() < 0.0012) {
      ballVelocity.set(0, 0, 0);
      if (!aiming) updateHud('Ready to putt');
    }

    const cupDistance = new THREE.Vector2(ball.position.x, ball.position.z).distanceTo(
      new THREE.Vector2(cup.position.x, cup.position.z),
    );
    if (cupDistance < 0.36 && ballVelocity.length() < 1.6) {
      holed = true;
      ballVelocity.set(0, 0, 0);
      ball.position.set(cup.position.x, 0.07, cup.position.z);
      updateHud(`Holed in ${strokes} ${strokes === 1 ? 'stroke' : 'strokes'}. Refresh to play again.`);
    }
  }

  updateIdleAimVisual();

  const followBehind = ballVelocity.lengthSq() > 0.02
    ? ballVelocity.clone().normalize().multiplyScalar(-3.2)
    : new THREE.Vector3(0, 0, 0);
  const desiredCamera = ball.position.clone().add(cameraOffset).add(followBehind);
  camera.position.lerp(desiredCamera, 0.065);
  cameraTarget.copy(ball.position);
  cameraTarget.y = 0.2;
  camera.lookAt(cameraTarget);

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
