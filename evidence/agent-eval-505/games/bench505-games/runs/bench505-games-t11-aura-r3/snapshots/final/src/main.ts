import { camera, createAuraApp, lights, looks, material, primitives, scene } from "@aura3d/engine";

type Status = "ready" | "playing" | "won" | "lost";

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

// ---- Field layout (x right, y up, z toward camera) ----
const FIELD_LEFT = -6;
const FIELD_RIGHT = 6;
const FIELD_TOP = 12;
const PADDLE_Y = 0.6;
const PADDLE_W = 2.4;
const PADDLE_H = 0.4;
const PADDLE_SPEED = 12;
const PADDLE_TOP = PADDLE_Y + PADDLE_H / 2;
const BALL_R = 0.3;
const BALL_SPEED = 9;
const MAX_BOUNCE_RAD = (60 * Math.PI) / 180;
const FALL_Y = -1;
const STEP = 1 / 120;

const COLS = 8;
const ROWS = 5;
const BRICK_W = 1.3;
const BRICK_H = 0.5;
const BRICK_GAP_X = 0.1;
const BRICK_GAP_Y = 0.2;
const BRICK_TOP_Y = 10.6;
const ROW_COLORS = ["#ff3b5c", "#ff9f1c", "#ffe14d", "#3ddc84", "#3db5ff"];
const ROW_POINTS = [50, 40, 30, 20, 10];

interface Brick {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly points: number;
  alive: boolean;
}

const bricks: Brick[] = [];
{
  const stride = BRICK_W + BRICK_GAP_X;
  const x0 = -((COLS - 1) * stride) / 2;
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      bricks.push({
        id: `brick-${r}-${c}`,
        x: x0 + c * stride,
        y: BRICK_TOP_Y - r * (BRICK_H + BRICK_GAP_Y),
        points: ROW_POINTS[r] ?? 10,
        alive: true
      });
    }
  }
}

// ---- Game state ----
const state: TaskState = { status: "ready", score: 0, lives: 3, bricksLeft: bricks.length };
let paddleX = 0;
let ballX = 0;
let ballY = PADDLE_TOP + BALL_R;
let ballVX = 0;
let ballVY = 0;
let serveCount = 0;
const keys = { left: false, right: false };

Object.defineProperty(window, "__TASK_STATE__", {
  configurable: true,
  get: (): TaskState => ({ status: state.status, score: state.score, lives: state.lives, bricksLeft: state.bricksLeft })
});

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function resetBall(): void {
  ballX = paddleX;
  ballY = PADDLE_TOP + BALL_R;
  ballVX = 0;
  ballVY = 0;
}

function restart(): void {
  for (const b of bricks) b.alive = true;
  state.status = "ready";
  state.score = 0;
  state.lives = 3;
  state.bricksLeft = bricks.length;
  paddleX = 0;
  serveCount = 0;
  resetBall();
}

function serve(): void {
  if (state.status !== "ready") return;
  const dir = serveCount % 2 === 0 ? 1 : -1;
  serveCount += 1;
  const angle = (20 * Math.PI) / 180;
  ballVX = dir * BALL_SPEED * Math.sin(angle);
  ballVY = BALL_SPEED * Math.cos(angle);
  state.status = "playing";
}

function loseLife(): void {
  state.lives -= 1;
  if (state.lives <= 0) {
    state.lives = 0;
    state.status = "lost";
    ballVX = 0;
    ballVY = 0;
  } else {
    state.status = "ready";
    resetBall();
  }
}

function stepBrickCollision(): void {
  const hw = BRICK_W / 2;
  const hh = BRICK_H / 2;
  for (const b of bricks) {
    if (!b.alive) continue;
    const cx = clamp(ballX, b.x - hw, b.x + hw);
    const cy = clamp(ballY, b.y - hh, b.y + hh);
    const dx = ballX - cx;
    const dy = ballY - cy;
    if (dx * dx + dy * dy >= BALL_R * BALL_R) continue;
    b.alive = false;
    state.bricksLeft -= 1;
    state.score += b.points;
    if (dx === 0 && dy === 0) {
      ballVY = -ballVY;
    } else if (Math.abs(dx) > Math.abs(dy)) {
      ballVX = Math.abs(ballVX) * (dx > 0 ? 1 : -1);
      ballX = cx + (dx > 0 ? 1 : -1) * BALL_R;
    } else {
      ballVY = Math.abs(ballVY) * (dy > 0 ? 1 : -1);
      ballY = cy + (dy > 0 ? 1 : -1) * BALL_R;
    }
    if (state.bricksLeft <= 0) {
      state.status = "won";
      ballVX = 0;
      ballVY = 0;
    }
    return; // one brick per step
  }
}

function stepBall(): void {
  ballX += ballVX * STEP;
  ballY += ballVY * STEP;

  if (ballX < FIELD_LEFT + BALL_R) {
    ballX = FIELD_LEFT + BALL_R;
    ballVX = Math.abs(ballVX);
  } else if (ballX > FIELD_RIGHT - BALL_R) {
    ballX = FIELD_RIGHT - BALL_R;
    ballVX = -Math.abs(ballVX);
  }
  if (ballY > FIELD_TOP - BALL_R) {
    ballY = FIELD_TOP - BALL_R;
    ballVY = -Math.abs(ballVY);
  }

  // Paddle
  if (
    ballVY < 0 &&
    ballY - BALL_R <= PADDLE_TOP &&
    ballY + BALL_R >= PADDLE_Y - PADDLE_H / 2 &&
    Math.abs(ballX - paddleX) <= PADDLE_W / 2 + BALL_R * 0.6
  ) {
    const offset = clamp((ballX - paddleX) / (PADDLE_W / 2), -1, 1);
    const angle = offset * MAX_BOUNCE_RAD;
    ballVX = BALL_SPEED * Math.sin(angle);
    ballVY = BALL_SPEED * Math.cos(angle);
    ballY = PADDLE_TOP + BALL_R;
  }

  stepBrickCollision();
  if (state.status !== "playing") return;

  if (ballY < FALL_Y) loseLife();
}

function update(dt: number): void {
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (state.status === "ready" || state.status === "playing") {
    paddleX = clamp(paddleX + dir * PADDLE_SPEED * dt, FIELD_LEFT + PADDLE_W / 2, FIELD_RIGHT - PADDLE_W / 2);
  }
  if (state.status === "ready") {
    resetBall();
  } else if (state.status === "playing") {
    let remaining = dt;
    while (remaining > 1e-9 && state.status === "playing") {
      stepBall();
      remaining -= STEP;
    }
  }
}

// ---- Scene ----
const wallMaterial = material.pbr({ color: "#5b6b8c", roughness: 0.5, metallic: 0.2 });
const sceneBuilder = scene()
  .add(looks.preset("neon-arcade"))
  .add(lights.directional({ name: "key", position: [4, 10, 14], target: [0, 6, 0], intensity: 2 }))
  .camera(camera.perspective({ position: [0, 3, 19], target: [0, 6, 0], fov: 46 }))
  .add(primitives.box({ name: "back-wall", size: [12.6, 13.2, 0.2], position: [0, 5.7, -0.7], material: material.pbr({ color: "#1b2238", roughness: 0.8 }) }))
  .add(primitives.box({ name: "wall-left", size: [0.3, 13.2, 0.8], position: [FIELD_LEFT - 0.15, 5.7, 0], material: wallMaterial }))
  .add(primitives.box({ name: "wall-right", size: [0.3, 13.2, 0.8], position: [FIELD_RIGHT + 0.15, 5.7, 0], material: wallMaterial }))
  .add(primitives.box({ name: "ceiling", size: [12.6, 0.3, 0.8], position: [0, FIELD_TOP + 0.15, 0], material: wallMaterial }))
  .add(
    primitives
      .box({
        name: "paddle",
        size: [PADDLE_W, PADDLE_H, 0.8],
        position: [0, PADDLE_Y, 0],
        material: material.pbr({ color: "#e8eefc", emissive: "#6a8cff", emissiveIntensity: 0.5, roughness: 0.3, metallic: 0.3 })
      })
      .runtime({ id: "paddle", mutable: true })
  )
  .add(
    primitives
      .sphere({
        name: "ball",
        size: [BALL_R * 2, BALL_R * 2, BALL_R * 2],
        position: [0, PADDLE_TOP + BALL_R, 0],
        material: material.pbr({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.6, roughness: 0.2 })
      })
      .runtime({ id: "ball", mutable: true })
  );

bricks.forEach((b, i) => {
  const row = Math.floor(i / COLS);
  const color = ROW_COLORS[row] ?? "#ffffff";
  sceneBuilder.add(
    primitives
      .box({
        name: b.id,
        size: [BRICK_W, BRICK_H, 0.7],
        position: [b.x, b.y, 0],
        material: material.pbr({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4, metallic: 0.1 })
      })
      .runtime({ id: b.id, mutable: true })
  );
});

const app = createAuraApp("#app", {
  scene: sceneBuilder,
  ...looks.appOptions("neon-arcade")
});

// ---- DOM HUD (outside the canvas) ----
const canvasEl = document.getElementById("app");
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "display:flex;gap:24px;width:640px;box-sizing:border-box;padding:6px 10px;background:#10131c;color:#e8eefc;font:600 14px/1.4 system-ui,sans-serif;";
const scoreEl = document.createElement("span");
const livesEl = document.createElement("span");
const statusEl = document.createElement("span");
const helpEl = document.createElement("span");
helpEl.style.cssText = "margin-left:auto;opacity:0.7;font-weight:400;";
helpEl.textContent = "A/D or \u2190/\u2192 move, Space serve, R restart";
hud.append(scoreEl, livesEl, statusEl, helpEl);
canvasEl?.insertAdjacentElement("afterend", hud);

const overlay = document.createElement("div");
overlay.id = "overlay";
overlay.style.cssText =
  "position:absolute;left:0;top:0;width:640px;height:360px;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(5,8,16,0.72);color:#fff;font-family:system-ui,sans-serif;text-align:center;";
const overlayTitle = document.createElement("div");
overlayTitle.style.cssText = "font-size:44px;font-weight:800;letter-spacing:2px;";
const overlaySub = document.createElement("div");
overlaySub.style.cssText = "font-size:18px;margin-top:10px;";
overlay.append(overlayTitle, overlaySub);
document.body.append(overlay);

let hudKey = "";
function renderHud(): void {
  const key = `${state.status}|${state.score}|${state.lives}|${state.bricksLeft}`;
  if (key === hudKey) return;
  hudKey = key;
  scoreEl.textContent = `Score: ${state.score}`;
  livesEl.textContent = `Lives: ${state.lives}`;
  statusEl.textContent = `Status: ${state.status}`;
  if (state.status === "won" || state.status === "lost") {
    overlay.style.display = "flex";
    overlayTitle.textContent = state.status === "won" ? "YOU WIN!" : "GAME OVER";
    overlayTitle.style.color = state.status === "won" ? "#3ddc84" : "#ff3b5c";
    overlaySub.textContent = `Score ${state.score}. Press R to restart`;
  } else {
    overlay.style.display = "none";
  }
}

// ---- Input ----
function setKey(e: KeyboardEvent, down: boolean): void {
  switch (e.code) {
    case "ArrowLeft":
    case "KeyA":
      keys.left = down;
      e.preventDefault();
      break;
    case "ArrowRight":
    case "KeyD":
      keys.right = down;
      e.preventDefault();
      break;
    case "Space":
      if (down && !e.repeat) serve();
      e.preventDefault();
      break;
    case "KeyR":
      if (down) restart();
      break;
    default:
      break;
  }
}
window.addEventListener("keydown", (e) => setKey(e, true));
window.addEventListener("keyup", (e) => setKey(e, false));
window.addEventListener("blur", () => {
  keys.left = false;
  keys.right = false;
});

// ---- Presentation ----
const shown = new Map<string, boolean>(bricks.map((b) => [b.id, true]));
function present(): void {
  app.nodes.require("paddle").setPosition(paddleX, PADDLE_Y, 0);
  app.nodes.require("ball").setPosition(ballX, ballY, 0);
  for (const b of bricks) {
    if (shown.get(b.id) !== b.alive) {
      app.nodes.require(b.id).setVisible(b.alive);
      shown.set(b.id, b.alive);
    }
  }
  renderHud();
}

let last = performance.now();
let firstFrameDone = false;
function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  update(dt);
  present();
  if (!firstFrameDone) {
    firstFrameDone = true;
    // The engine renders on its own rAF; flag readiness one frame after our first update.
    requestAnimationFrame(() => {
      window.__TASK_READY__ = true;
    });
  }
  requestAnimationFrame(frame);
}

renderHud();
void app.ready().then(() => {
  last = performance.now();
  requestAnimationFrame(frame);
});
