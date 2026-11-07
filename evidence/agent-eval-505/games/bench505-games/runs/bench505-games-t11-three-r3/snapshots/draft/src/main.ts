import * as THREE from 'three';

type Status = 'ready' | 'playing' | 'won' | 'lost';

interface TaskState {
  status: Status;
  score: number;
  lives: number;
  bricksLeft: number;
}

declare global {
  interface Window {
    __TASK_STATE__?: TaskState;
    __TASK_READY__?: boolean;
  }
}

// ---------- Constants (world units; the play field is 16 x 9, matching 640x360) ----------
const FIELD_W = 16;
const FIELD_H = 9;
const HALF_W = FIELD_W / 2;
const PADDLE_W = 2.6;
const PADDLE_H = 0.4;
const PADDLE_Y = 0.9;
const PADDLE_SPEED = 13;
const BALL_R = 0.25;
const BALL_SPEED = 8.5;
const MAX_BOUNCE = (60 * Math.PI) / 180;
const COLS = 8;
const ROWS = 5;
const BRICK_W = 1.8;
const BRICK_H = 0.6;
const BRICK_GAP_X = (FIELD_W - COLS * BRICK_W) / COLS; // spacing between bricks
const BRICK_TOP = 8.1;
const BRICK_PITCH_Y = 0.75;
const ROW_COLORS = [0xff4d4d, 0xff9f40, 0xffe14d, 0x4dde6a, 0x4da6ff];
const ROW_POINTS = [50, 40, 30, 20, 10];
const START_LIVES = 3;

// ---------- DOM: HUD and overlay ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;

const hud = document.createElement('div');
hud.style.cssText = 'width:640px;box-sizing:border-box;padding:6px 10px;display:flex;justify-content:space-between;background:#111;color:#fff;font:14px system-ui,sans-serif;';
const scoreEl = document.createElement('span');
const livesEl = document.createElement('span');
const statusEl = document.createElement('span');
hud.append(scoreEl, livesEl, statusEl);
hud.id = 'hud';
canvas.insertAdjacentElement('afterend', hud);

const hint = document.createElement('div');
hint.style.cssText = 'width:640px;box-sizing:border-box;padding:2px 10px;color:#aaa;font:12px system-ui,sans-serif;';
hint.textContent = 'Move: Left/Right or A/D. Serve: Space. Restart: R.';
hud.insertAdjacentElement('afterend', hint);

const wrap = document.createElement('div');
wrap.style.cssText = 'position:relative;width:640px;height:360px;';
canvas.parentElement!.insertBefore(wrap, canvas);
wrap.appendChild(canvas);

const overlay = document.createElement('div');
overlay.id = 'overlay';
overlay.style.cssText =
  'position:absolute;left:0;top:0;width:640px;height:360px;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);color:#fff;font-family:system-ui,sans-serif;text-align:center;pointer-events:none;';
const overlayTitle = document.createElement('div');
overlayTitle.style.cssText = 'font-size:40px;font-weight:700;margin-bottom:8px;';
const overlaySub = document.createElement('div');
overlaySub.style.cssText = 'font-size:18px;';
overlay.append(overlayTitle, overlaySub);
wrap.appendChild(overlay);

// ---------- three.js scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.setClearColor(0x0b0d1a);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 100);
camera.position.set(0, -2.2, 21);
camera.lookAt(0, 4.4, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-4, 4, 12);
scene.add(sun);
const rim = new THREE.PointLight(0x88aaff, 60, 40);
rim.position.set(0, 6, 6);
scene.add(rim);

// Floor
const floor = new THREE.Mesh(
  new THREE.BoxGeometry(FIELD_W + 0.6, FIELD_H + 0.3, 0.2),
  new THREE.MeshStandardMaterial({ color: 0x182040, roughness: 0.9 }),
);
floor.position.set(0, FIELD_H / 2 - 0.15, -0.6);
scene.add(floor);

// Walls (left, right, ceiling)
const wallMat = new THREE.MeshStandardMaterial({ color: 0x5566aa, roughness: 0.5, metalness: 0.2 });
const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.3, FIELD_H + 0.3, 1), wallMat);
wallL.position.set(-HALF_W - 0.15, FIELD_H / 2, 0);
const wallR = wallL.clone();
wallR.position.x = HALF_W + 0.15;
const wallT = new THREE.Mesh(new THREE.BoxGeometry(FIELD_W + 0.6, 0.3, 1), wallMat);
wallT.position.set(0, FIELD_H + 0.15, 0);
scene.add(wallL, wallR, wallT);

// Paddle
const paddle = new THREE.Mesh(
  new THREE.BoxGeometry(PADDLE_W, PADDLE_H, 0.6),
  new THREE.MeshStandardMaterial({ color: 0xeeeeff, roughness: 0.3, metalness: 0.4 }),
);
scene.add(paddle);

// Ball
const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 24, 16),
  new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x666666, roughness: 0.2 }),
);
scene.add(ballMesh);

// Bricks
interface Brick {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  row: number;
  alive: boolean;
}
const bricks: Brick[] = [];
const brickGeo = new THREE.BoxGeometry(BRICK_W, BRICK_H, 0.6);
const brickMats = ROW_COLORS.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.1 }),
);
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const mesh = new THREE.Mesh(brickGeo, brickMats[r]);
    const x = -HALF_W + BRICK_GAP_X / 2 + BRICK_W / 2 + c * (BRICK_W + BRICK_GAP_X);
    const y = BRICK_TOP - r * BRICK_PITCH_Y;
    mesh.position.set(x, y, 0);
    scene.add(mesh);
    bricks.push({ mesh, x, y, row: r, alive: true });
  }
}

// ---------- Game state ----------
const state: TaskState = { status: 'ready', score: 0, lives: START_LIVES, bricksLeft: bricks.length };
Object.defineProperty(window, '__TASK_STATE__', {
  configurable: true,
  enumerable: true,
  get: () => ({ ...state }),
});

let paddleX = 0;
let ballX = 0;
let ballY = PADDLE_Y + PADDLE_H / 2 + BALL_R;
let ballVX = 0;
let ballVY = 0;

function stickBall(): void {
  ballX = paddleX;
  ballY = PADDLE_Y + PADDLE_H / 2 + BALL_R;
  ballVX = 0;
  ballVY = 0;
}

function restart(): void {
  state.status = 'ready';
  state.score = 0;
  state.lives = START_LIVES;
  state.bricksLeft = bricks.length;
  for (const b of bricks) {
    b.alive = true;
    b.mesh.visible = true;
  }
  paddleX = 0;
  stickBall();
  updateHud();
}

function serve(): void {
  if (state.status !== 'ready') return;
  state.status = 'playing';
  const angle = (Math.random() * 2 - 1) * (25 * Math.PI) / 180;
  ballVX = BALL_SPEED * Math.sin(angle);
  ballVY = BALL_SPEED * Math.cos(angle);
  updateHud();
}

function updateHud(): void {
  scoreEl.textContent = `Score: ${state.score}`;
  livesEl.textContent = `Lives: ${state.lives}`;
  statusEl.textContent = `Status: ${state.status}`;
  if (state.status === 'won' || state.status === 'lost') {
    overlay.style.display = 'flex';
    overlayTitle.textContent = state.status === 'won' ? 'You win!' : 'Game over';
    overlaySub.textContent = `Score ${state.score}. Press R to restart.`;
  } else {
    overlay.style.display = 'none';
  }
}

// ---------- Input ----------
const keys = new Set<string>();
function keyName(e: KeyboardEvent): string {
  switch (e.code) {
    case 'ArrowLeft':
    case 'KeyA':
      return 'left';
    case 'ArrowRight':
    case 'KeyD':
      return 'right';
    case 'Space':
      return 'space';
    case 'KeyR':
      return 'r';
  }
  switch (e.key) {
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return 'left';
    case 'ArrowRight':
    case 'd':
    case 'D':
      return 'right';
    case ' ':
      return 'space';
    case 'r':
    case 'R':
      return 'r';
  }
  return '';
}
window.addEventListener('keydown', (e) => {
  const k = keyName(e);
  if (!k) return;
  e.preventDefault();
  keys.add(k);
  if (k === 'space' && !e.repeat) serve();
  if (k === 'r' && !e.repeat) restart();
});
window.addEventListener('keyup', (e) => {
  const k = keyName(e);
  if (k) keys.delete(k);
});
window.addEventListener('blur', () => keys.clear());

// ---------- Physics ----------
function loseLife(): void {
  state.lives -= 1;
  if (state.lives <= 0) {
    state.lives = 0;
    state.status = 'lost';
    ballVX = 0;
    ballVY = 0;
  } else {
    state.status = 'ready';
    stickBall();
  }
  updateHud();
}

function stepPhysics(dt: number): void {
  // Paddle
  let dir = 0;
  if (keys.has('left')) dir -= 1;
  if (keys.has('right')) dir += 1;
  if (state.status === 'ready' || state.status === 'playing') {
    const limit = HALF_W - PADDLE_W / 2;
    paddleX = Math.max(-limit, Math.min(limit, paddleX + dir * PADDLE_SPEED * dt));
  }

  if (state.status === 'ready') {
    stickBall();
    return;
  }
  if (state.status !== 'playing') return;

  ballX += ballVX * dt;
  ballY += ballVY * dt;

  // Walls and ceiling
  if (ballX < -HALF_W + BALL_R) {
    ballX = -HALF_W + BALL_R;
    ballVX = Math.abs(ballVX);
  } else if (ballX > HALF_W - BALL_R) {
    ballX = HALF_W - BALL_R;
    ballVX = -Math.abs(ballVX);
  }
  if (ballY > FIELD_H - BALL_R) {
    ballY = FIELD_H - BALL_R;
    ballVY = -Math.abs(ballVY);
  }

  // Paddle
  const pTop = PADDLE_Y + PADDLE_H / 2;
  if (
    ballVY < 0 &&
    ballY - BALL_R <= pTop &&
    ballY + BALL_R >= PADDLE_Y - PADDLE_H / 2 &&
    ballX >= paddleX - PADDLE_W / 2 - BALL_R &&
    ballX <= paddleX + PADDLE_W / 2 + BALL_R
  ) {
    const off = Math.max(-1, Math.min(1, (ballX - paddleX) / (PADDLE_W / 2)));
    const angle = off * MAX_BOUNCE;
    ballVX = BALL_SPEED * Math.sin(angle);
    ballVY = BALL_SPEED * Math.cos(angle);
    ballY = pTop + BALL_R;
  }

  // Bricks (one per substep)
  for (const b of bricks) {
    if (!b.alive) continue;
    const cx = Math.max(b.x - BRICK_W / 2, Math.min(b.x + BRICK_W / 2, ballX));
    const cy = Math.max(b.y - BRICK_H / 2, Math.min(b.y + BRICK_H / 2, ballY));
    const dx = ballX - cx;
    const dy = ballY - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= BALL_R * BALL_R) continue;

    b.alive = false;
    b.mesh.visible = false;
    state.bricksLeft -= 1;
    state.score += ROW_POINTS[b.row];

    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      ballX += nx * (BALL_R - d);
      ballY += ny * (BALL_R - d);
      const dot = ballVX * nx + ballVY * ny;
      if (dot < 0) {
        ballVX -= 2 * dot * nx;
        ballVY -= 2 * dot * ny;
      }
    } else {
      ballVY = -ballVY;
    }
    // Keep speed constant and avoid near-horizontal travel
    const sp = Math.hypot(ballVX, ballVY) || 1;
    ballVX = (ballVX / sp) * BALL_SPEED;
    ballVY = (ballVY / sp) * BALL_SPEED;
    const minVY = BALL_SPEED * 0.25;
    if (Math.abs(ballVY) < minVY) {
      ballVY = Math.sign(ballVY || 1) * minVY;
      ballVX = Math.sign(ballVX || 1) * Math.sqrt(BALL_SPEED * BALL_SPEED - minVY * minVY);
    }

    if (state.bricksLeft <= 0) {
      state.status = 'won';
      ballVX = 0;
      ballVY = 0;
    }
    updateHud();
    break;
  }

  // Fell below paddle
  if (state.status === 'playing' && ballY < PADDLE_Y - PADDLE_H / 2 - BALL_R * 2) {
    loseLife();
  }
}

// ---------- Main loop ----------
let last = performance.now();
let acc = 0;
const STEP = 1 / 120;
let firstFrame = true;

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= STEP) {
    stepPhysics(STEP);
    acc -= STEP;
  }

  paddle.position.set(paddleX, PADDLE_Y, 0);
  ballMesh.position.set(ballX, ballY, 0);
  renderer.render(scene, camera);

  if (firstFrame) {
    firstFrame = false;
    window.__TASK_READY__ = true;
  }
  requestAnimationFrame(frame);
}

restart();
requestAnimationFrame(frame);
