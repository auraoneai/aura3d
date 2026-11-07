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
    __TASK_STATE__: TaskState;
    __TASK_READY__: boolean;
  }
}

// ---------- constants (play field lives in the x/y plane, z is depth) ----------
const FIELD_HALF_W = 6;
const FIELD_TOP = 7.5;
const COLS = 8;
const ROWS = 5;
const BRICK_PITCH_X = (FIELD_HALF_W * 2) / COLS;
const BRICK_PITCH_Y = 0.6;
const BRICK_W = BRICK_PITCH_X - 0.1;
const BRICK_H = BRICK_PITCH_Y - 0.1;
const BRICK_TOP_Y = 6.6;
const ROW_COLORS = [0xff4455, 0xff9933, 0xffdd33, 0x44cc66, 0x4499ff];
const ROW_POINTS = [50, 40, 30, 20, 10];
const PADDLE_Y = 0.6;
const PADDLE_W = 2.2;
const PADDLE_H = 0.35;
const PADDLE_SPEED = 10;
const BALL_R = 0.22;
const BALL_SPEED = 7.5;
const MAX_BOUNCE_ANGLE = (62 * Math.PI) / 180;
const DEPTH = 0.5;

// ---------- game state ----------
const state: TaskState = { status: 'ready', score: 0, lives: 3, bricksLeft: 0 };
Object.defineProperty(window, '__TASK_STATE__', {
  get: () => state,
  configurable: true,
});
window.__TASK_READY__ = false;

interface Brick {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  row: number;
  alive: boolean;
}

let paddleX = 0;
const ball = { x: 0, y: PADDLE_Y + PADDLE_H / 2 + BALL_R, vx: 0, vy: 0 };
const keys = new Set<string>();

// ---------- DOM: canvas, HUD, overlay ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;

const hud = document.createElement('div');
hud.id = 'hud';
hud.style.cssText =
  'width:640px;box-sizing:border-box;padding:6px 12px;display:flex;justify-content:space-between;background:#111;color:#fff;font:14px/1.4 system-ui,sans-serif;';
hud.innerHTML =
  '<span>Score: <b id="hud-score">0</b></span><span>Lives: <b id="hud-lives">3</b></span><span>Status: <b id="hud-status">ready</b></span>';
canvas.insertAdjacentElement('afterend', hud);
const hudScore = hud.querySelector('#hud-score') as HTMLElement;
const hudLives = hud.querySelector('#hud-lives') as HTMLElement;
const hudStatus = hud.querySelector('#hud-status') as HTMLElement;

const overlay = document.createElement('div');
overlay.id = 'overlay';
overlay.style.cssText =
  'position:absolute;left:0;top:0;width:640px;height:360px;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);color:#fff;font:14px system-ui,sans-serif;text-align:center;pointer-events:none;';
const overlayTitle = document.createElement('div');
overlayTitle.style.cssText = 'font-size:40px;font-weight:bold;margin-bottom:8px;';
const overlayHint = document.createElement('div');
overlayHint.textContent = 'Press R to restart';
overlay.append(overlayTitle, overlayHint);
document.body.appendChild(overlay);

const help = document.createElement('div');
help.style.cssText = 'padding:4px 12px;color:#aaa;font:12px system-ui,sans-serif;';
help.textContent = 'Left/Right or A/D: move. Space: serve. R: restart.';
hud.insertAdjacentElement('afterend', help);

// ---------- three.js scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.setClearColor(0x0b0d1a);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 100);
camera.position.set(0, 1.2, 12.5);
camera.lookAt(0, 3.8, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-3, 6, 10);
scene.add(sun);

// floor backdrop
const back = new THREE.Mesh(
  new THREE.BoxGeometry(FIELD_HALF_W * 2, FIELD_TOP + 1, 0.2),
  new THREE.MeshStandardMaterial({ color: 0x161a33, roughness: 0.9 }),
);
back.position.set(0, (FIELD_TOP - 1) / 2, -DEPTH / 2 - 0.1);
scene.add(back);

// walls and ceiling
const wallMat = new THREE.MeshStandardMaterial({ color: 0x8890b0, metalness: 0.3, roughness: 0.5 });
const wallH = FIELD_TOP + 0.5;
for (const side of [-1, 1]) {
  const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallH, DEPTH), wallMat);
  w.position.set(side * (FIELD_HALF_W + 0.15), wallH / 2 - 0.5, 0);
  scene.add(w);
}
const ceiling = new THREE.Mesh(new THREE.BoxGeometry(FIELD_HALF_W * 2 + 0.6, 0.3, DEPTH), wallMat);
ceiling.position.set(0, FIELD_TOP + 0.15, 0);
scene.add(ceiling);

const paddle = new THREE.Mesh(
  new THREE.BoxGeometry(PADDLE_W, PADDLE_H, DEPTH),
  new THREE.MeshStandardMaterial({ color: 0xe8ecff, metalness: 0.4, roughness: 0.3 }),
);
paddle.position.set(0, PADDLE_Y, 0);
scene.add(paddle);

const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 24, 16),
  new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x444444, roughness: 0.2 }),
);
scene.add(ballMesh);

const bricks: Brick[] = [];
for (let r = 0; r < ROWS; r++) {
  const mat = new THREE.MeshStandardMaterial({ color: ROW_COLORS[r], roughness: 0.4, metalness: 0.1 });
  for (let c = 0; c < COLS; c++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(BRICK_W, BRICK_H, DEPTH), mat);
    const x = -FIELD_HALF_W + BRICK_PITCH_X * (c + 0.5);
    const y = BRICK_TOP_Y - r * BRICK_PITCH_Y;
    mesh.position.set(x, y, 0);
    scene.add(mesh);
    bricks.push({ mesh, x, y, row: r, alive: true });
  }
}

// ---------- game logic ----------
function resetBallToPaddle(): void {
  ball.x = paddleX;
  ball.y = PADDLE_Y + PADDLE_H / 2 + BALL_R;
  ball.vx = 0;
  ball.vy = 0;
}

function restart(): void {
  state.status = 'ready';
  state.score = 0;
  state.lives = 3;
  for (const b of bricks) {
    b.alive = true;
    b.mesh.visible = true;
  }
  state.bricksLeft = bricks.length;
  paddleX = 0;
  resetBallToPaddle();
}

function serve(): void {
  if (state.status !== 'ready') return;
  state.status = 'playing';
  const angle = (Math.random() * 2 - 1) * 0.35;
  ball.vx = BALL_SPEED * Math.sin(angle);
  ball.vy = BALL_SPEED * Math.cos(angle);
}

/** Circle vs axis-aligned box. Returns true on hit and reflects the ball. */
function collideBox(cx: number, cy: number, hw: number, hh: number): boolean {
  const nx = Math.max(cx - hw, Math.min(ball.x, cx + hw));
  const ny = Math.max(cy - hh, Math.min(ball.y, cy + hh));
  const dx = ball.x - nx;
  const dy = ball.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 > BALL_R * BALL_R) return false;

  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    const px = dx / d;
    const py = dy / d;
    ball.x = nx + px * BALL_R;
    ball.y = ny + py * BALL_R;
    const dot = ball.vx * px + ball.vy * py;
    if (dot < 0) {
      if (Math.abs(px) > Math.abs(py)) ball.vx = -ball.vx;
      else ball.vy = -ball.vy;
    }
  } else {
    // center inside box: push out along the shallowest axis
    const ox = hw - Math.abs(ball.x - cx);
    const oy = hh - Math.abs(ball.y - cy);
    if (ox < oy) ball.vx = -ball.vx;
    else ball.vy = -ball.vy;
  }
  return true;
}

function loseLife(): void {
  state.lives -= 1;
  if (state.lives <= 0) {
    state.lives = 0;
    state.status = 'lost';
    ball.vx = 0;
    ball.vy = 0;
  } else {
    state.status = 'ready';
    resetBallToPaddle();
  }
}

function stepBall(dt: number): void {
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.x < -FIELD_HALF_W + BALL_R) {
    ball.x = -FIELD_HALF_W + BALL_R;
    ball.vx = Math.abs(ball.vx);
  } else if (ball.x > FIELD_HALF_W - BALL_R) {
    ball.x = FIELD_HALF_W - BALL_R;
    ball.vx = -Math.abs(ball.vx);
  }
  if (ball.y > FIELD_TOP - BALL_R) {
    ball.y = FIELD_TOP - BALL_R;
    ball.vy = -Math.abs(ball.vy);
  }

  // paddle
  if (ball.vy < 0 && collideBox(paddleX, PADDLE_Y, PADDLE_W / 2, PADDLE_H / 2)) {
    const off = Math.max(-1, Math.min(1, (ball.x - paddleX) / (PADDLE_W / 2)));
    const a = off * MAX_BOUNCE_ANGLE;
    ball.vx = BALL_SPEED * Math.sin(a);
    ball.vy = BALL_SPEED * Math.cos(a);
    if (ball.y < PADDLE_Y + PADDLE_H / 2) ball.y = PADDLE_Y + PADDLE_H / 2 + BALL_R;
  }

  // bricks (one per substep)
  for (const b of bricks) {
    if (!b.alive) continue;
    if (collideBox(b.x, b.y, BRICK_W / 2, BRICK_H / 2)) {
      b.alive = false;
      b.mesh.visible = false;
      state.score += ROW_POINTS[b.row];
      state.bricksLeft -= 1;
      if (state.bricksLeft <= 0) {
        state.bricksLeft = 0;
        state.status = 'won';
        ball.vx = 0;
        ball.vy = 0;
      }
      break;
    }
  }

  if (state.status === 'playing' && ball.y < PADDLE_Y - PADDLE_H / 2 - BALL_R * 2) {
    loseLife();
  }
}

function update(dt: number): void {
  let dir = 0;
  if (keys.has('left')) dir -= 1;
  if (keys.has('right')) dir += 1;
  if (state.status === 'ready' || state.status === 'playing') {
    const lim = FIELD_HALF_W - PADDLE_W / 2;
    paddleX = Math.max(-lim, Math.min(lim, paddleX + dir * PADDLE_SPEED * dt));
  }

  if (state.status === 'ready') {
    ball.x = paddleX;
    ball.y = PADDLE_Y + PADDLE_H / 2 + BALL_R;
  } else if (state.status === 'playing') {
    const sub = 4;
    for (let i = 0; i < sub && state.status === 'playing'; i++) stepBall(dt / sub);
  }
}

function syncVisuals(): void {
  paddle.position.x = paddleX;
  ballMesh.position.set(ball.x, ball.y, 0);
  hudScore.textContent = String(state.score);
  hudLives.textContent = String(state.lives);
  hudStatus.textContent = state.status;
  if (state.status === 'won' || state.status === 'lost') {
    overlay.style.display = 'flex';
    overlayTitle.textContent = state.status === 'won' ? 'You win!' : 'Game over';
  } else {
    overlay.style.display = 'none';
  }
}

// ---------- input ----------
function mapKey(e: KeyboardEvent): string | null {
  switch (e.code || e.key) {
    case 'ArrowLeft':
    case 'KeyA':
      return 'left';
    case 'ArrowRight':
    case 'KeyD':
      return 'right';
    case 'Space':
      return 'space';
    case 'KeyR':
      return 'restart';
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
      return 'restart';
  }
  return null;
}

window.addEventListener('keydown', (e) => {
  const k = mapKey(e);
  if (!k) return;
  e.preventDefault();
  if (k === 'left' || k === 'right') keys.add(k);
  else if (k === 'space') serve();
  else if (k === 'restart') restart();
});
window.addEventListener('keyup', (e) => {
  const k = mapKey(e);
  if (k) keys.delete(k);
});
window.addEventListener('blur', () => keys.clear());

// ---------- main loop ----------
restart();
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  update(dt);
  syncVisuals();
  renderer.render(scene, camera);
  if (!window.__TASK_READY__) window.__TASK_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
