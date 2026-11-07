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

// ---------- Constants (world units; play field is x in [-8, 8], y in [0, 9]) ----------
const FIELD_HALF_W = 8;
const FIELD_TOP = 9;
const COLS = 8;
const ROWS = 5;
const BRICK_W = 1.8;
const BRICK_H = 0.7;
const BRICK_D = 0.8;
const BRICK_TOP_Y = 7.8;
const BRICK_STEP_Y = 0.9;
const ROW_COLORS = [0xff4d4d, 0xff9f43, 0xfeca57, 0x1dd1a1, 0x54a0ff];
const ROW_POINTS = [50, 40, 30, 20, 10];
const PADDLE_Y = 0.8;
const PADDLE_W = 3;
const PADDLE_H = 0.4;
const PADDLE_SPEED = 13;
const BALL_R = 0.25;
const BALL_SPEED = 9.5;
const MAX_BOUNCE_ANGLE = (62 * Math.PI) / 180;
const START_LIVES = 3;

// ---------- Game state ----------
const state: TaskState = { status: 'ready', score: 0, lives: START_LIVES, bricksLeft: ROWS * COLS };
Object.defineProperty(window, '__TASK_STATE__', {
  get: () => state,
  configurable: true,
});

interface Brick {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  row: number;
  alive: boolean;
}

let paddleX = 0;
let ballX = 0;
let ballY = PADDLE_Y + PADDLE_H / 2 + BALL_R;
let ballVX = 0;
let ballVY = 0;

// ---------- DOM ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;

const hud = document.createElement('div');
hud.id = 'hud';
hud.style.cssText =
  'width:640px;box-sizing:border-box;padding:6px 10px;display:flex;justify-content:space-between;' +
  'background:#111;color:#fff;font:14px/1.4 system-ui,sans-serif;';
const scoreEl = document.createElement('span');
const livesEl = document.createElement('span');
const statusEl = document.createElement('span');
scoreEl.id = 'hud-score';
livesEl.id = 'hud-lives';
statusEl.id = 'hud-status';
hud.append(scoreEl, livesEl, statusEl);
canvas.insertAdjacentElement('afterend', hud);

const overlay = document.createElement('div');
overlay.id = 'overlay';
overlay.style.cssText =
  'position:absolute;left:0;top:0;width:640px;height:360px;display:none;flex-direction:column;' +
  'align-items:center;justify-content:center;background:rgba(0,0,0,0.65);color:#fff;' +
  'font:system-ui,sans-serif;text-align:center;pointer-events:none;';
const overlayTitle = document.createElement('div');
overlayTitle.style.cssText = 'font-size:40px;font-weight:700;margin-bottom:8px;';
const overlaySub = document.createElement('div');
overlaySub.style.cssText = 'font-size:16px;';
overlay.append(overlayTitle, overlaySub);
document.body.appendChild(overlay);

function updateHud(): void {
  scoreEl.textContent = `Score: ${state.score}`;
  livesEl.textContent = `Lives: ${state.lives}`;
  statusEl.textContent = `Status: ${state.status}`;
  if (state.status === 'won' || state.status === 'lost') {
    overlay.style.display = 'flex';
    overlayTitle.textContent = state.status === 'won' ? 'YOU WIN!' : 'GAME OVER';
    overlaySub.textContent = `Score ${state.score}. Press R to restart`;
  } else {
    overlay.style.display = 'none';
  }
}

// ---------- three.js scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.setClearColor(0x0b0d1a);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 640 / 360, 0.1, 100);
camera.position.set(0, 1.5, 16);
camera.lookAt(0, 4.6, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dir = new THREE.DirectionalLight(0xffffff, 2.2);
dir.position.set(-4, 10, 12);
scene.add(dir);
const point = new THREE.PointLight(0xffffff, 60, 40);
scene.add(point);

// Back plate and walls
const back = new THREE.Mesh(
  new THREE.BoxGeometry(FIELD_HALF_W * 2, FIELD_TOP, 0.2),
  new THREE.MeshStandardMaterial({ color: 0x151a33, roughness: 0.9 }),
);
back.position.set(0, FIELD_TOP / 2, -0.7);
scene.add(back);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x6c7ae0, roughness: 0.4, metalness: 0.3 });
const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.3, FIELD_TOP + 0.3, 1), wallMat);
wallL.position.set(-FIELD_HALF_W - 0.15, FIELD_TOP / 2, 0);
const wallR = wallL.clone();
wallR.position.x = FIELD_HALF_W + 0.15;
const wallT = new THREE.Mesh(new THREE.BoxGeometry(FIELD_HALF_W * 2 + 0.6, 0.3, 1), wallMat);
wallT.position.set(0, FIELD_TOP + 0.15, 0);
scene.add(wallL, wallR, wallT);

// Paddle
const paddle = new THREE.Mesh(
  new THREE.BoxGeometry(PADDLE_W, PADDLE_H, 0.8),
  new THREE.MeshStandardMaterial({ color: 0xe8e8f0, roughness: 0.3, metalness: 0.5 }),
);
paddle.position.set(0, PADDLE_Y, 0);
scene.add(paddle);

// Ball
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 24, 16),
  new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x888888, roughness: 0.2 }),
);
scene.add(ball);

// Bricks
const bricks: Brick[] = [];
for (let r = 0; r < ROWS; r++) {
  const mat = new THREE.MeshStandardMaterial({ color: ROW_COLORS[r], roughness: 0.5, metalness: 0.1 });
  for (let c = 0; c < COLS; c++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(BRICK_W, BRICK_H, BRICK_D), mat);
    const x = -FIELD_HALF_W + (c + 0.5) * ((FIELD_HALF_W * 2) / COLS);
    const y = BRICK_TOP_Y - r * BRICK_STEP_Y;
    mesh.position.set(x, y, 0);
    scene.add(mesh);
    bricks.push({ mesh, x, y, row: r, alive: true });
  }
}

// ---------- Game logic ----------
function resetBall(): void {
  ballX = paddleX;
  ballY = PADDLE_Y + PADDLE_H / 2 + BALL_R;
  ballVX = 0;
  ballVY = 0;
}

function restart(): void {
  state.status = 'ready';
  state.score = 0;
  state.lives = START_LIVES;
  state.bricksLeft = ROWS * COLS;
  for (const b of bricks) {
    b.alive = true;
    b.mesh.visible = true;
  }
  paddleX = 0;
  resetBall();
  updateHud();
}

function serve(): void {
  if (state.status !== 'ready') return;
  const angle = (Math.random() * 2 - 1) * (15 * Math.PI) / 180;
  ballVX = BALL_SPEED * Math.sin(angle);
  ballVY = BALL_SPEED * Math.cos(angle);
  state.status = 'playing';
  updateHud();
}

function loseLife(): void {
  state.lives = Math.max(0, state.lives - 1);
  resetBall();
  state.status = state.lives <= 0 ? 'lost' : 'ready';
  updateHud();
}

function hitBrick(b: Brick): void {
  b.alive = false;
  b.mesh.visible = false;
  state.score += ROW_POINTS[b.row];
  state.bricksLeft -= 1;
  if (state.bricksLeft <= 0) {
    state.status = 'won';
    ballVX = 0;
    ballVY = 0;
  }
  updateHud();
}

function stepBall(dt: number): void {
  ballX += ballVX * dt;
  ballY += ballVY * dt;

  // Walls and ceiling
  if (ballX < -FIELD_HALF_W + BALL_R) {
    ballX = -FIELD_HALF_W + BALL_R;
    ballVX = Math.abs(ballVX);
  } else if (ballX > FIELD_HALF_W - BALL_R) {
    ballX = FIELD_HALF_W - BALL_R;
    ballVX = -Math.abs(ballVX);
  }
  if (ballY > FIELD_TOP - BALL_R) {
    ballY = FIELD_TOP - BALL_R;
    ballVY = -Math.abs(ballVY);
  }

  // Paddle
  const padTop = PADDLE_Y + PADDLE_H / 2;
  if (
    ballVY < 0 &&
    ballY - BALL_R <= padTop &&
    ballY > PADDLE_Y - 0.1 &&
    Math.abs(ballX - paddleX) <= PADDLE_W / 2 + BALL_R * 0.6
  ) {
    const off = Math.max(-1, Math.min(1, (ballX - paddleX) / (PADDLE_W / 2)));
    const ang = off * MAX_BOUNCE_ANGLE;
    ballVX = BALL_SPEED * Math.sin(ang);
    ballVY = BALL_SPEED * Math.cos(ang);
    ballY = padTop + BALL_R;
  }

  // Bricks (circle vs AABB), one brick per sub-step
  for (const b of bricks) {
    if (!b.alive) continue;
    const hw = BRICK_W / 2;
    const hh = BRICK_H / 2;
    const cx = Math.max(b.x - hw, Math.min(ballX, b.x + hw));
    const cy = Math.max(b.y - hh, Math.min(ballY, b.y + hh));
    const dx = ballX - cx;
    const dy = ballY - cy;
    if (dx * dx + dy * dy > BALL_R * BALL_R) continue;

    if (dx === 0 && dy === 0) {
      // Centre inside the brick: pick the shallower axis from the brick centre.
      const px = hw - Math.abs(ballX - b.x);
      const py = hh - Math.abs(ballY - b.y);
      if (px < py) ballVX = -ballVX;
      else ballVY = -ballVY;
    } else if (Math.abs(dx) > Math.abs(dy)) {
      ballVX = dx > 0 ? Math.abs(ballVX) : -Math.abs(ballVX);
      ballX = cx + Math.sign(dx) * BALL_R;
    } else {
      ballVY = dy > 0 ? Math.abs(ballVY) : -Math.abs(ballVY);
      ballY = cy + Math.sign(dy) * BALL_R;
    }
    hitBrick(b);
    return;
  }

  if (ballY < -BALL_R) loseLife();
}

// ---------- Input ----------
const keys = new Set<string>();

function normKey(e: KeyboardEvent): string {
  if (e.code === 'Space' || e.key === ' ') return 'space';
  if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') return 'left';
  if (e.code === 'ArrowRight' || e.key === 'ArrowRight') return 'right';
  const k = e.key.toLowerCase();
  if (k === 'a') return 'left';
  if (k === 'd') return 'right';
  if (k === 'r') return 'restart';
  return '';
}

window.addEventListener('keydown', (e) => {
  const k = normKey(e);
  if (!k) return;
  e.preventDefault();
  if (k === 'space') serve();
  else if (k === 'restart') restart();
  else keys.add(k);
});
window.addEventListener('keyup', (e) => {
  const k = normKey(e);
  if (k) keys.delete(k);
});
window.addEventListener('blur', () => keys.clear());

// ---------- Loop ----------
let last = performance.now();

function update(dt: number): void {
  if (state.status === 'won' || state.status === 'lost') return;

  let dirX = 0;
  if (keys.has('left')) dirX -= 1;
  if (keys.has('right')) dirX += 1;
  const half = PADDLE_W / 2;
  paddleX = Math.max(-FIELD_HALF_W + half, Math.min(FIELD_HALF_W - half, paddleX + dirX * PADDLE_SPEED * dt));

  if (state.status === 'ready') {
    resetBall();
    return;
  }

  const steps = Math.max(1, Math.ceil((BALL_SPEED * dt) / 0.08));
  const h = dt / steps;
  for (let i = 0; i < steps && state.status === 'playing'; i++) stepBall(h);
}

function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  update(dt);

  paddle.position.x = paddleX;
  ball.position.set(ballX, ballY, 0);
  point.position.set(ballX, ballY, 3);
  renderer.render(scene, camera);

  if (!window.__TASK_READY__) window.__TASK_READY__ = true;
  requestAnimationFrame(frame);
}

restart();
requestAnimationFrame(frame);
