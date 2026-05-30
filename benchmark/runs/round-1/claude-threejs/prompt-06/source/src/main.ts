import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Mini-Golf Hole
 * ------------------------------------------------------------------ *
 * - Flat green bordered by bumper walls
 * - One central obstacle (a block) the ball bounces off
 * - A ball driven by simple rolling physics (velocity + friction)
 * - Click-and-drag to aim, release to shoot (power based on pull)
 * - Stroke / score counter in the HUD
 * - Camera smoothly follows the ball
 * ------------------------------------------------------------------ */

// ---------------------------------------------------------------- world
const GREEN_HALF_X = 7;   // green spans x in [-7, 7]
const GREEN_HALF_Z = 12;  // green spans z in [-12, 12]
const WALL_T = 0.6;       // wall thickness
const WALL_H = 0.9;       // wall height
const BALL_R = 0.4;
const HOLE_R = 0.7;
const HOLE_POS = new THREE.Vector3(0, 0, 9);

const STOP_SPEED = 0.35;       // below this the ball is considered stopped
const SINK_SPEED = 9.0;        // must be slow enough to drop in the cup
const MAX_POWER = 26;          // max launch speed
const FRICTION = 4.2;          // rolling deceleration (units/s^2)
const WALL_RESTITUTION = 0.72; // bounce energy retained off bumpers

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const app = document.getElementById('app')!;
app.appendChild(renderer.domElement);

// ---------------------------------------------------------------- scene + camera
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b6e8);
scene.fog = new THREE.Fog(0x87b6e8, 40, 80);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  300,
);
camera.position.set(0, 14, -22);

// ---------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x4a6b3a, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff4e0, 1.5);
sun.position.set(-12, 22, -6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -22;
sun.shadow.camera.right = 22;
sun.shadow.camera.top = 26;
sun.shadow.camera.bottom = -26;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

// ---------------------------------------------------------------- green
const greenMat = new THREE.MeshStandardMaterial({ color: 0x3fae54, roughness: 0.95 });
const green = new THREE.Mesh(
  new THREE.BoxGeometry(GREEN_HALF_X * 2, 1, GREEN_HALF_Z * 2),
  greenMat,
);
green.position.set(0, -0.5, 0);
green.receiveShadow = true;
scene.add(green);

// subtle mowing stripes for visual texture
const stripeMat = new THREE.MeshStandardMaterial({ color: 0x37994a, roughness: 0.95 });
for (let i = 0; i < 12; i++) {
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(GREEN_HALF_X * 2, 0.02, (GREEN_HALF_Z * 2) / 12),
    stripeMat,
  );
  stripe.visible = i % 2 === 0;
  stripe.position.set(0, 0.012, -GREEN_HALF_Z + (i + 0.5) * ((GREEN_HALF_Z * 2) / 12));
  stripe.receiveShadow = true;
  scene.add(stripe);
}

// surrounding ground (decorative)
const apron = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x6b8f3e, roughness: 1 }),
);
apron.rotation.x = -Math.PI / 2;
apron.position.y = -0.02;
apron.receiveShadow = true;
scene.add(apron);

// ---------------------------------------------------------------- walls (bumpers)
type Wall = { minX: number; maxX: number; minZ: number; maxZ: number };
const walls: Wall[] = [];
const wallMat = new THREE.MeshStandardMaterial({ color: 0x9c5a2b, roughness: 0.6 });

function addWall(cx: number, cz: number, sx: number, sz: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, WALL_H, sz), wallMat);
  mesh.position.set(cx, WALL_H / 2, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  walls.push({
    minX: cx - sx / 2,
    maxX: cx + sx / 2,
    minZ: cz - sz / 2,
    maxZ: cz + sz / 2,
  });
}

// perimeter bumpers
const outerX = GREEN_HALF_X + WALL_T / 2;
const outerZ = GREEN_HALF_Z + WALL_T / 2;
addWall(-outerX, 0, WALL_T, GREEN_HALF_Z * 2 + WALL_T * 2); // left
addWall(outerX, 0, WALL_T, GREEN_HALF_Z * 2 + WALL_T * 2);  // right
addWall(0, -outerZ, GREEN_HALF_X * 2, WALL_T);              // back (behind tee)
addWall(0, outerZ, GREEN_HALF_X * 2, WALL_T);               // front (behind hole)

// ---------------------------------------------------------------- obstacle
// A solid block the player must steer around.
const OBS = { sx: 5.5, sy: 1.6, sz: 1.4, x: 0, z: 1.0 };
const obstacle = new THREE.Mesh(
  new THREE.BoxGeometry(OBS.sx, OBS.sy, OBS.sz),
  new THREE.MeshStandardMaterial({ color: 0x2b4f8c, roughness: 0.5, metalness: 0.1 }),
);
obstacle.position.set(OBS.x, OBS.sy / 2, OBS.z);
obstacle.castShadow = true;
obstacle.receiveShadow = true;
scene.add(obstacle);
walls.push({
  minX: OBS.x - OBS.sx / 2,
  maxX: OBS.x + OBS.sx / 2,
  minZ: OBS.z - OBS.sz / 2,
  maxZ: OBS.z + OBS.sz / 2,
});

// ---------------------------------------------------------------- hole + flag
const holeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1 });
const hole = new THREE.Mesh(
  new THREE.CylinderGeometry(HOLE_R, HOLE_R, 0.5, 40),
  holeMat,
);
hole.position.set(HOLE_POS.x, 0.02, HOLE_POS.z);
scene.add(hole);

// thin rim so the cup reads clearly
const rim = new THREE.Mesh(
  new THREE.TorusGeometry(HOLE_R, 0.06, 12, 40),
  new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }),
);
rim.rotation.x = -Math.PI / 2;
rim.position.set(HOLE_POS.x, 0.03, HOLE_POS.z);
scene.add(rim);

const flagPole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.05, 0.05, 4, 12),
  new THREE.MeshStandardMaterial({ color: 0xeeeeee }),
);
flagPole.position.set(HOLE_POS.x, 2, HOLE_POS.z);
flagPole.castShadow = true;
scene.add(flagPole);

const flag = new THREE.Mesh(
  new THREE.PlaneGeometry(1.4, 0.8),
  new THREE.MeshStandardMaterial({ color: 0xe23b3b, side: THREE.DoubleSide }),
);
flag.position.set(HOLE_POS.x + 0.72, 3.5, HOLE_POS.z);
scene.add(flag);

// ---------------------------------------------------------------- ball
const TEE = new THREE.Vector3(0, BALL_R, -9);
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 32, 32),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 }),
);
ball.castShadow = true;
ball.position.copy(TEE);
scene.add(ball);

const vel = new THREE.Vector3(0, 0, 0);
let sunk = false;

// ---------------------------------------------------------------- aim visuals
const aimGroup = new THREE.Group();
aimGroup.visible = false;
scene.add(aimGroup);

const aimLineGeom = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(),
  new THREE.Vector3(),
]);
const aimLine = new THREE.Line(
  aimLineGeom,
  new THREE.LineBasicMaterial({ color: 0xffffff }),
);
aimGroup.add(aimLine);

const aimHead = new THREE.Mesh(
  new THREE.ConeGeometry(0.35, 0.9, 16),
  new THREE.MeshBasicMaterial({ color: 0xffe14d }),
);
aimGroup.add(aimHead);

// ---------------------------------------------------------------- HUD
const hud = document.createElement('div');
hud.id = 'hud';
hud.innerHTML = `
  <div class="panel">
    <div class="title">⛳ Mini-Golf — Hole 1 <span class="par">Par 3</span></div>
    <div class="score">Strokes: <span id="strokes">0</span></div>
    <div class="hint" id="hint">Click &amp; drag from the ball, then release to shoot.</div>
  </div>
  <div id="banner"></div>
  <div id="powerWrap"><div id="powerBar"></div></div>
`;
app.appendChild(hud);

const strokesEl = document.getElementById('strokes')!;
const hintEl = document.getElementById('hint')!;
const bannerEl = document.getElementById('banner')!;
const powerWrap = document.getElementById('powerWrap')!;
const powerBar = document.getElementById('powerBar')!;

let strokes = 0;
function setStrokes(n: number) {
  strokes = n;
  strokesEl.textContent = String(n);
}

const style = document.createElement('style');
style.textContent = `
  * { margin: 0; box-sizing: border-box; }
  html, body, #app { width: 100%; height: 100%; overflow: hidden; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  canvas { display: block; }
  #hud { position: fixed; inset: 0; pointer-events: none; }
  #hud .panel {
    position: absolute; top: 16px; left: 16px;
    background: rgba(15, 35, 25, 0.72); color: #fff;
    padding: 14px 18px; border-radius: 12px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.35);
    backdrop-filter: blur(6px); min-width: 240px;
  }
  #hud .title { font-size: 17px; font-weight: 700; margin-bottom: 6px; }
  #hud .title .par { font-size: 12px; opacity: 0.7; font-weight: 600; margin-left: 6px; }
  #hud .score { font-size: 22px; font-weight: 800; letter-spacing: 0.5px; }
  #hud .score span { color: #ffe14d; }
  #hud .hint { font-size: 12px; opacity: 0.85; margin-top: 6px; max-width: 220px; }
  #banner {
    position: absolute; top: 38%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(20, 120, 60, 0.92); color: #fff; padding: 22px 34px;
    border-radius: 16px; font-size: 30px; font-weight: 800; text-align: center;
    box-shadow: 0 10px 40px rgba(0,0,0,0.45); display: none;
  }
  #banner .sub { font-size: 15px; font-weight: 600; opacity: 0.9; margin-top: 8px; }
  #powerWrap {
    position: absolute; bottom: 28px; left: 50%; transform: translateX(-50%);
    width: 280px; height: 16px; background: rgba(0,0,0,0.4);
    border-radius: 10px; overflow: hidden; display: none;
    border: 2px solid rgba(255,255,255,0.4);
  }
  #powerBar {
    height: 100%; width: 0%;
    background: linear-gradient(90deg, #6fe06f, #ffe14d, #ff5a3c);
    transition: width 0.03s linear;
  }
`;
document.head.appendChild(style);

// ---------------------------------------------------------------- input / aiming
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BALL_R);

let aiming = false;
const aimDir = new THREE.Vector3();
let aimPower = 0; // 0..1

function pointerToGround(ev: PointerEvent, out: THREE.Vector3): boolean {
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(groundPlane, out) !== null;
}

function ballMoving(): boolean {
  return vel.lengthSq() > STOP_SPEED * STOP_SPEED;
}

const hitPoint = new THREE.Vector3();

renderer.domElement.addEventListener('pointerdown', (ev) => {
  if (sunk || ballMoving()) return;
  if (!pointerToGround(ev, hitPoint)) return;
  aiming = true;
  updateAim(hitPoint);
});

renderer.domElement.addEventListener('pointermove', (ev) => {
  if (!aiming) return;
  if (pointerToGround(ev, hitPoint)) updateAim(hitPoint);
});

function endAim(shoot: boolean) {
  if (!aiming) return;
  aiming = false;
  aimGroup.visible = false;
  powerWrap.style.display = 'none';
  if (shoot && aimPower > 0.02) {
    vel.copy(aimDir).multiplyScalar(aimPower * MAX_POWER);
    setStrokes(strokes + 1);
    bannerEl.style.display = 'none';
  }
}

renderer.domElement.addEventListener('pointerup', () => endAim(true));
renderer.domElement.addEventListener('pointerleave', () => endAim(false));

// "Click to aim and shoot": dragging away from the ball points the aim arrow
// toward the cursor and builds power with pull distance; releasing fires the
// ball in that direction.
function updateAim(target: THREE.Vector3) {
  const dx = target.x - ball.position.x;
  const dz = target.z - ball.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-3) {
    aimPower = 0;
    aimGroup.visible = false;
    return;
  }
  aimDir.set(dx / dist, 0, dz / dist);
  aimPower = Math.min(dist / 9, 1); // ~9 world units of pull = full power

  // visuals
  aimGroup.visible = true;
  const len = 1.2 + aimPower * 5.5;
  const start = ball.position.clone();
  start.y = BALL_R;
  const end = start.clone().addScaledVector(aimDir, len);
  aimLineGeom.setFromPoints([start, end]);

  aimHead.position.copy(end);
  aimHead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aimDir);

  const t = aimPower;
  (aimLine.material as THREE.LineBasicMaterial).color.setRGB(
    0.4 + 0.6 * t,
    1.0 - 0.4 * t,
    0.3 - 0.3 * t,
  );

  powerWrap.style.display = 'block';
  powerBar.style.width = `${aimPower * 100}%`;
}

// ---------------------------------------------------------------- physics
function circleVsWall(w: Wall): boolean {
  const cx = Math.max(w.minX, Math.min(ball.position.x, w.maxX));
  const cz = Math.max(w.minZ, Math.min(ball.position.z, w.maxZ));
  let nx = ball.position.x - cx;
  let nz = ball.position.z - cz;
  const d2 = nx * nx + nz * nz;
  if (d2 >= BALL_R * BALL_R) return false;

  let d = Math.sqrt(d2);
  if (d < 1e-5) {
    // center inside the box: push out along the axis of least overlap
    const overlapX = Math.min(ball.position.x - w.minX, w.maxX - ball.position.x);
    const overlapZ = Math.min(ball.position.z - w.minZ, w.maxZ - ball.position.z);
    if (overlapX < overlapZ) {
      nx = ball.position.x < (w.minX + w.maxX) / 2 ? -1 : 1;
      nz = 0;
    } else {
      nx = 0;
      nz = ball.position.z < (w.minZ + w.maxZ) / 2 ? -1 : 1;
    }
    d = 0;
  } else {
    nx /= d;
    nz /= d;
  }

  // resolve penetration
  const push = BALL_R - d;
  ball.position.x += nx * push;
  ball.position.z += nz * push;

  // reflect velocity across the contact normal, with restitution
  const vn = vel.x * nx + vel.z * nz;
  if (vn < 0) {
    vel.x -= (1 + WALL_RESTITUTION) * vn * nx;
    vel.z -= (1 + WALL_RESTITUTION) * vn * nz;
  }
  return true;
}

const rollAxis = new THREE.Vector3();

function stepPhysics(dt: number) {
  if (sunk || vel.lengthSq() === 0) return;

  // integrate position
  ball.position.x += vel.x * dt;
  ball.position.z += vel.z * dt;

  // rolling friction (constant deceleration)
  const speed = Math.hypot(vel.x, vel.z);
  const drop = FRICTION * dt;
  if (speed <= drop) {
    vel.set(0, 0, 0);
  } else {
    const f = (speed - drop) / speed;
    vel.x *= f;
    vel.z *= f;
  }

  // wall + obstacle collisions
  for (const w of walls) circleVsWall(w);

  // rolling rotation for visual feedback
  const moved = Math.hypot(vel.x, vel.z) * dt;
  if (moved > 1e-6) {
    rollAxis.set(vel.z, 0, -vel.x).normalize();
    ball.rotateOnWorldAxis(rollAxis, moved / BALL_R);
  }

  // hole detection
  const hdx = ball.position.x - HOLE_POS.x;
  const hdz = ball.position.z - HOLE_POS.z;
  const hd = Math.hypot(hdx, hdz);
  const sp = Math.hypot(vel.x, vel.z);
  if (hd < HOLE_R - BALL_R * 0.4 && sp < SINK_SPEED) {
    sinkBall();
  } else if (hd < HOLE_R + 0.1 && sp < SINK_SPEED * 0.5) {
    // graze the cup: bend toward the hole (lip-in)
    vel.x -= (hdx / (hd || 1)) * 18 * dt;
    vel.z -= (hdz / (hd || 1)) * 18 * dt;
  }
}

function sinkBall() {
  sunk = true;
  vel.set(0, 0, 0);
  ball.position.set(HOLE_POS.x, -BALL_R * 0.6, HOLE_POS.z);
  powerWrap.style.display = 'none';
  aimGroup.visible = false;
  const par = 3;
  const diff = strokes - par;
  let label = 'Hole in one!';
  if (strokes > 1) {
    if (diff < 0) label = `${Math.abs(diff)} under par!`;
    else if (diff === 0) label = 'Par!';
    else label = `${diff} over par`;
  }
  bannerEl.innerHTML = `🏆 Holed in ${strokes}!<div class="sub">${label} — click to play again</div>`;
  bannerEl.style.display = 'block';
  hintEl.textContent = 'Click anywhere to reset and play again.';
  window.addEventListener('pointerdown', resetOnce, { once: true });
}

function resetOnce() {
  ball.position.copy(TEE);
  ball.quaternion.identity();
  vel.set(0, 0, 0);
  sunk = false;
  setStrokes(0);
  bannerEl.style.display = 'none';
  hintEl.textContent = 'Click & drag from the ball, then release to shoot.';
}

// ---------------------------------------------------------------- camera follow
const camOffset = new THREE.Vector3(0, 11, -16); // behind & above the ball
const desiredCamPos = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

function updateCamera(dt: number) {
  desiredCamPos.copy(ball.position).add(camOffset);
  const lerp = 1 - Math.pow(0.0015, dt); // smooth, framerate independent
  camera.position.lerp(desiredCamPos, lerp);

  // aim a touch ahead of the ball toward the hole
  lookTarget.set(ball.position.x, ball.position.y, ball.position.z + 3);
  camera.lookAt(lookTarget);
}

// ---------------------------------------------------------------- loop
let last = performance.now();
const FIXED = 1 / 120;
let acc = 0;

function animate(now: number) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1; // clamp after a tab-out

  acc += dt;
  while (acc >= FIXED) {
    stepPhysics(FIXED);
    acc -= FIXED;
  }

  updateCamera(dt);
  flag.rotation.y = Math.sin(now * 0.002) * 0.25;

  if (!sunk) {
    hintEl.textContent = ballMoving()
      ? 'Ball rolling…'
      : 'Click & drag from the ball, then release to shoot.';
  }

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

// ---------------------------------------------------------------- resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
