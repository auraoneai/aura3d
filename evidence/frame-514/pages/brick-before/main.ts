import { camera, createAuraApp, looks, material, primitives, scene } from "@aura3d/engine";
import { record } from "../../hook";

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

// ---- Play field (world units, x right, y up, z toward camera) ----
const FIELD_HALF_W = 6;
const FIELD_H = 10;
const COLS = 8;
const ROWS = 5;
const BRICK_W = 1.3;
const BRICK_H = 0.5;
const PITCH_X = 1.4;
const PITCH_Y = 0.6;
const TOP_ROW_Y = 8.6;
const ROW_COLORS = ["#ff3b5c", "#ff9a2e", "#ffe14a", "#3ddc84", "#3a9bff"];
const ROW_POINTS = [50, 40, 30, 20, 10];

const PADDLE_W = 2.4;
const PADDLE_H = 0.4;
const PADDLE_Y = 0.7;
const PADDLE_SPEED = 11;
const PADDLE_LIMIT = FIELD_HALF_W - PADDLE_W / 2;

const BALL_R = 0.25;
const BASE_SPEED = 8;
const MAX_SPEED = 12;
const MAX_BOUNCE_ANGLE = (60 * Math.PI) / 180;

interface Brick {
  id: string;
  x: number;
  y: number;
  row: number;
  alive: boolean;
}

const bricks: Brick[] = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    bricks.push({
      id: `brick-${r}-${c}`,
      x: (c - (COLS - 1) / 2) * PITCH_X,
      y: TOP_ROW_Y - r * PITCH_Y,
      row: r,
      alive: true
    });
  }
}

// ---- Game state ----
const state: TaskState = { status: "ready", score: 0, lives: 3, bricksLeft: bricks.length };
let paddleX = 0;
let ballX = 0;
let ballY = PADDLE_Y + PADDLE_H / 2 + BALL_R;
let ballVX = 0;
let ballVY = 0;
let ballSpeed = BASE_SPEED;
const keys = { left: false, right: false };

Object.defineProperty(window, "__TASK_STATE__", {
  configurable: true,
  enumerable: true,
  get: () => state
});

function placeBallOnPaddle(): void {
  ballX = paddleX;
  ballY = PADDLE_Y + PADDLE_H / 2 + BALL_R;
  ballVX = 0;
  ballVY = 0;
  ballSpeed = BASE_SPEED;
}

function restart(): void {
  for (const b of bricks) b.alive = true;
  state.status = "ready";
  state.score = 0;
  state.lives = 3;
  state.bricksLeft = bricks.length;
  paddleX = 0;
  placeBallOnPaddle();
  syncBricks();
  updateHud();
}

function serve(): void {
  if (state.status !== "ready") return;
  state.status = "playing";
  // Slight random-free deterministic angle that alternates with lives so serves differ.
  const angle = ((state.lives % 2 === 0 ? -1 : 1) * 15 * Math.PI) / 180;
  ballSpeed = BASE_SPEED;
  ballVX = ballSpeed * Math.sin(angle);
  ballVY = ballSpeed * Math.cos(angle);
  updateHud();
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
    placeBallOnPaddle();
  }
  updateHud();
}

function hitBrick(b: Brick): void {
  b.alive = false;
  state.bricksLeft -= 1;
  state.score += ROW_POINTS[b.row] ?? 10;
  ballSpeed = Math.min(MAX_SPEED, ballSpeed + 0.12);
  const mag = Math.hypot(ballVX, ballVY) || 1;
  ballVX = (ballVX / mag) * ballSpeed;
  ballVY = (ballVY / mag) * ballSpeed;
  setBrickVisible(b);
  if (state.bricksLeft <= 0) {
    state.status = "won";
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
  if (ballY > FIELD_H - BALL_R) {
    ballY = FIELD_H - BALL_R;
    ballVY = -Math.abs(ballVY);
  }

  // Paddle
  const pTop = PADDLE_Y + PADDLE_H / 2;
  const pBottom = PADDLE_Y - PADDLE_H / 2;
  if (
    ballVY < 0 &&
    ballY - BALL_R <= pTop &&
    ballY > pBottom &&
    Math.abs(ballX - paddleX) <= PADDLE_W / 2 + BALL_R
  ) {
    ballY = pTop + BALL_R;
    const hit = Math.max(-1, Math.min(1, (ballX - paddleX) / (PADDLE_W / 2)));
    const angle = hit * MAX_BOUNCE_ANGLE;
    ballVX = ballSpeed * Math.sin(angle);
    ballVY = ballSpeed * Math.cos(angle);
  }

  // Bricks
  for (const b of bricks) {
    if (!b.alive) continue;
    const dx = ballX - b.x;
    const dy = ballY - b.y;
    const ox = BRICK_W / 2 + BALL_R - Math.abs(dx);
    const oy = BRICK_H / 2 + BALL_R - Math.abs(dy);
    if (ox <= 0 || oy <= 0) continue;
    // Rounded-corner test so the ball does not hit invisible corners.
    const cx = Math.max(-BRICK_W / 2, Math.min(BRICK_W / 2, dx));
    const cy = Math.max(-BRICK_H / 2, Math.min(BRICK_H / 2, dy));
    if ((dx - cx) ** 2 + (dy - cy) ** 2 > BALL_R * BALL_R) continue;
    if (ox < oy) {
      ballVX = Math.abs(ballVX) * (dx >= 0 ? 1 : -1);
      ballX += dx >= 0 ? ox : -ox;
    } else {
      ballVY = Math.abs(ballVY) * (dy >= 0 ? 1 : -1);
      ballY += dy >= 0 ? oy : -oy;
    }
    hitBrick(b);
    break;
  }

  // Fell below the paddle
  if (state.status === "playing" && ballY < -BALL_R) loseLife();
}

function update(dt: number): void {
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (state.status === "ready" || state.status === "playing") {
    paddleX = Math.max(-PADDLE_LIMIT, Math.min(PADDLE_LIMIT, paddleX + dir * PADDLE_SPEED * dt));
  }
  if (state.status === "ready") {
    placeBallOnPaddle();
  } else if (state.status === "playing") {
    const dist = Math.hypot(ballVX, ballVY) * dt;
    const steps = Math.max(1, Math.ceil(dist / 0.1));
    const sub = dt / steps;
    for (let i = 0; i < steps && state.status === "playing"; i++) stepBall(sub);
  }
}

// ---- DOM HUD (outside the canvas) ----
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText =
  "width:640px;box-sizing:border-box;padding:6px 10px;display:flex;justify-content:space-between;" +
  "font:14px/1.4 system-ui,sans-serif;background:#111;color:#fff;";
hud.innerHTML =
  '<span>Score: <b id="hud-score">0</b></span>' +
  '<span>Lives: <b id="hud-lives">3</b></span>' +
  '<span>Status: <b id="hud-status">ready</b></span>';
const help = document.createElement("div");
help.style.cssText = "width:640px;box-sizing:border-box;padding:2px 10px;font:12px system-ui,sans-serif;color:#aaa;";
help.textContent = "Left/Right or A/D: move. Space: serve. R: restart.";

const canvasEl = document.getElementById("app");
if (canvasEl) {
  canvasEl.insertAdjacentElement("afterend", help);
  canvasEl.insertAdjacentElement("afterend", hud);
} else {
  document.body.append(hud, help);
}

const overlay = document.createElement("div");
overlay.id = "overlay";
overlay.style.cssText =
  "position:absolute;left:0;top:0;width:640px;height:360px;display:none;flex-direction:column;" +
  "align-items:center;justify-content:center;background:rgba(0,0,0,0.65);color:#fff;" +
  "font:bold 36px system-ui,sans-serif;text-align:center;pointer-events:none;";
document.body.append(overlay);

const elScore = document.getElementById("hud-score");
const elLives = document.getElementById("hud-lives");
const elStatus = document.getElementById("hud-status");

function updateHud(): void {
  if (elScore) elScore.textContent = String(state.score);
  if (elLives) elLives.textContent = String(state.lives);
  if (elStatus) elStatus.textContent = state.status;
  if (state.status === "won" || state.status === "lost") {
    const title = state.status === "won" ? "YOU WIN!" : "GAME OVER";
    overlay.innerHTML = `<div>${title}</div><div style="font-size:18px;margin-top:10px">Score ${state.score}. Press R to restart</div>`;
    overlay.style.display = "flex";
  } else {
    overlay.style.display = "none";
  }
}

// ---- Input ----
window.addEventListener("keydown", (e) => {
  switch (e.code) {
    case "ArrowLeft":
    case "KeyA":
      keys.left = true;
      e.preventDefault();
      break;
    case "ArrowRight":
    case "KeyD":
      keys.right = true;
      e.preventDefault();
      break;
    case "Space":
      e.preventDefault();
      if (!e.repeat) serve();
      break;
    case "KeyR":
      restart();
      break;
    default:
      break;
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
});
window.addEventListener("blur", () => {
  keys.left = false;
  keys.right = false;
});

// ---- Scene ----
const LOOK = "neon-arcade" as const;

const stage = scene()
  .add(looks.preset(LOOK))
  .add(
    primitives.box({
      name: "backdrop",
      size: [FIELD_HALF_W * 2, FIELD_H, 0.2],
      position: [0, FIELD_H / 2, -0.6],
      material: material.pbr({ color: "#10142a", roughness: 0.9, metallic: 0 })
    })
  )
  .add(
    primitives.box({
      name: "wall-left",
      size: [0.3, FIELD_H + 0.3, 0.8],
      position: [-FIELD_HALF_W - 0.15, FIELD_H / 2, 0],
      material: material.pbr({ color: "#8a94c8", roughness: 0.5, metallic: 0.2 })
    })
  )
  .add(
    primitives.box({
      name: "wall-right",
      size: [0.3, FIELD_H + 0.3, 0.8],
      position: [FIELD_HALF_W + 0.15, FIELD_H / 2, 0],
      material: material.pbr({ color: "#8a94c8", roughness: 0.5, metallic: 0.2 })
    })
  )
  .add(
    primitives.box({
      name: "wall-top",
      size: [FIELD_HALF_W * 2 + 0.6, 0.3, 0.8],
      position: [0, FIELD_H + 0.15, 0],
      material: material.pbr({ color: "#8a94c8", roughness: 0.5, metallic: 0.2 })
    })
  )
  .add(
    primitives.box({
      name: "paddle",
      size: [PADDLE_W, PADDLE_H, 0.6],
      position: [0, PADDLE_Y, 0],
      material: material.pbr({ color: "#e8ecff", roughness: 0.3, metallic: 0.4 })
    }).runtime({ id: "paddle", mutable: true })
  )
  .add(
    primitives.sphere({
      name: "ball",
      size: BALL_R * 2,
      position: [0, PADDLE_Y + PADDLE_H / 2 + BALL_R, 0],
      material: material.emissive({ color: "#ffffff", emissive: "#9fe8ff", emissiveIntensity: 2, roughness: 0.3 })
    }).runtime({ id: "ball", mutable: true })
  )
  .camera(camera.perspective({ position: [0, 5, 15.5], target: [0, 5, 0], fov: 50, near: 0.5, far: 100 }));

for (const b of bricks) {
  stage.add(
    primitives.box({
      name: b.id,
      size: [BRICK_W, BRICK_H, 0.6],
      position: [b.x, b.y, 0],
      material: material.pbr({ color: ROW_COLORS[b.row] ?? "#ffffff", roughness: 0.4, metallic: 0.1 })
    }).runtime({ id: b.id, mutable: true })
  );
}

const app = createAuraApp("#app", { scene: stage, ...looks.appOptions(LOOK) });
const cam514 = stage.toJSON().camera;
record(() => camera.worldBounds(stage, { exclude: (n) => (n as { name?: string }).name === "backdrop" }), () => ({ position: cam514.position!, target: cam514.target!, fov: cam514.fov! }));

function setBrickVisible(b: Brick): void {
  try {
    app.nodes.require(b.id).setVisible(b.alive);
  } catch {
    /* handle not mounted yet; syncBricks runs after ready */
  }
}

function syncBricks(): void {
  for (const b of bricks) setBrickVisible(b);
}

function present(): void {
  try {
    app.nodes.require("paddle").setPosition(paddleX, PADDLE_Y, 0);
    app.nodes.require("ball").setPosition(ballX, ballY, 0);
  } catch {
    /* not mounted yet */
  }
}

updateHud();

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  update(dt);
  present();
  requestAnimationFrame(frame);
}

void app.ready().then(() => {
  syncBricks();
  present();
  last = performance.now();
  requestAnimationFrame((t) => {
    frame(t);
    window.__TASK_READY__ = true;
  });
});
