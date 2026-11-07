import { camera, createAuraApp, environments, lights, material, primitives, scene } from "@aura3d/engine";

type Status = "ready" | "playing" | "won" | "lost";

declare global {
  interface Window {
    __TASK_READY__?: boolean;
    __TASK_STATE__?: { status: Status; score: number; lives: number; bricksLeft: number };
  }
}

// ---- Field geometry (x right, y up, z toward camera) ----
const HALF_W = 8;
const TOP = 12;
const COLS = 8;
const ROWS = 5;
const BRICK_W = 1.8;
const BRICK_H = 0.7;
const BRICK_PITCH_X = 2;
const BRICK_PITCH_Y = 0.95;
const BRICK_TOP_Y = 10.6;
const ROW_COLORS = ["#ff4d5e", "#ff9a3c", "#f5d630", "#4fd36b", "#3fa7ff"];
const ROW_POINTS = [50, 40, 30, 20, 10];

const PADDLE_Y = 0.9;
const PADDLE_W = 3;
const PADDLE_H = 0.5;
const PADDLE_SPEED = 14;
const BALL_R = 0.3;
const BALL_SPEED = 9;
const MAX_BOUNCE = (60 * Math.PI) / 180;

interface Brick {
  id: string;
  x: number;
  y: number;
  row: number;
  alive: boolean;
}

const bricks: Brick[] = [];
for (let r = 0; r < ROWS; r += 1) {
  for (let c = 0; c < COLS; c += 1) {
    bricks.push({
      id: `brick-${r}-${c}`,
      x: (c - (COLS - 1) / 2) * BRICK_PITCH_X,
      y: BRICK_TOP_Y - r * BRICK_PITCH_Y,
      row: r,
      alive: true
    });
  }
}

// ---- Scene ----
let sc = scene({ background: "#0b0e18" })
  .camera(camera.perspective({ position: [0, 5.5, 17.5], target: [0, 6, 0], fov: 45, near: 1, far: 100 }))
  .add(environments.neutral({ intensity: 0.5, background: false }))
  .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#3a3f55", intensity: 0.9 }))
  .add(lights.directional({ position: [-6, 14, 14], target: [0, 6, 0], intensity: 2.5, shadow: true }))
  .add(primitives.box({ name: "backdrop", size: [HALF_W * 2 + 1, TOP + 1, 0.4], material: material.pbr({ color: "#1b2236", roughness: 0.9 }) }).position(0, TOP / 2, -0.8))
  .add(primitives.box({ name: "wall-l", size: [0.5, TOP + 0.5, 1], material: material.pbr({ color: "#7a86a8", roughness: 0.5 }) }).position(-HALF_W - 0.25, TOP / 2, 0))
  .add(primitives.box({ name: "wall-r", size: [0.5, TOP + 0.5, 1], material: material.pbr({ color: "#7a86a8", roughness: 0.5 }) }).position(HALF_W + 0.25, TOP / 2, 0))
  .add(primitives.box({ name: "wall-t", size: [HALF_W * 2 + 1, 0.5, 1], material: material.pbr({ color: "#7a86a8", roughness: 0.5 }) }).position(0, TOP + 0.25, 0))
  .add(
    primitives
      .box({ name: "paddle", size: [PADDLE_W, PADDLE_H, 0.8], material: material.pbr({ color: "#e8eef8", metallic: 0.3, roughness: 0.35 }) })
      .position(0, PADDLE_Y, 0)
      .runtime({ id: "paddle", mutable: true })
  )
  .add(
    primitives
      .sphere({ name: "ball", size: BALL_R * 2, material: material.pbr({ color: "#ffffff", roughness: 0.2 }) })
      .position(0, PADDLE_Y + PADDLE_H / 2 + BALL_R, 0)
      .runtime({ id: "ball", mutable: true })
  );

for (const b of bricks) {
  sc = sc.add(
    primitives
      .box({ name: b.id, size: [BRICK_W, BRICK_H, 0.8], material: material.pbr({ color: ROW_COLORS[b.row]!, roughness: 0.45 }) })
      .position(b.x, b.y, 0)
      .runtime({ id: b.id, mutable: true })
  );
}

const app = createAuraApp("#app", { scene: sc });

// ---- HUD (DOM, outside the canvas) ----
const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
const wrap = document.createElement("div");
wrap.style.cssText = "position:relative;width:640px;";
canvas.insertAdjacentElement("afterend", wrap);

const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "display:flex;gap:24px;padding:6px 10px;width:620px;background:#111827;color:#fff;font:14px system-ui,sans-serif;";
const scoreEl = document.createElement("span");
const livesEl = document.createElement("span");
const statusEl = document.createElement("span");
scoreEl.id = "hud-score";
livesEl.id = "hud-lives";
statusEl.id = "hud-status";
hud.append(scoreEl, livesEl, statusEl);
wrap.appendChild(hud);

const overlay = document.createElement("div");
overlay.id = "overlay";
overlay.style.cssText =
  "position:absolute;left:0;top:-360px;width:640px;height:360px;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);color:#fff;font-family:system-ui,sans-serif;text-align:center;";
const overlayTitle = document.createElement("div");
overlayTitle.style.cssText = "font-size:40px;font-weight:700;margin-bottom:8px;";
const overlayHint = document.createElement("div");
overlayHint.style.cssText = "font-size:18px;";
overlay.append(overlayTitle, overlayHint);
wrap.appendChild(overlay);

const help = document.createElement("div");
help.style.cssText = "padding:4px 10px;color:#9aa4b8;font:12px system-ui,sans-serif;";
help.textContent = "Left/Right or A/D: move. Space: serve. R: restart.";
wrap.appendChild(help);

// ---- Game state ----
const state = { status: "ready" as Status, score: 0, lives: 3, bricksLeft: bricks.length };
const game = { paddleX: 0, ballX: 0, ballY: PADDLE_Y + PADDLE_H / 2 + BALL_R, vx: 0, vy: 0 };

Object.defineProperty(window, "__TASK_STATE__", {
  configurable: true,
  get: () => ({ status: state.status, score: state.score, lives: state.lives, bricksLeft: state.bricksLeft })
});

const keys = { left: false, right: false };

function placeBallOnPaddle(): void {
  game.ballX = game.paddleX;
  game.ballY = PADDLE_Y + PADDLE_H / 2 + BALL_R;
  game.vx = 0;
  game.vy = 0;
}

function restart(): void {
  state.status = "ready";
  state.score = 0;
  state.lives = 3;
  state.bricksLeft = bricks.length;
  for (const b of bricks) {
    b.alive = true;
    app.nodes.require(b.id).setVisible(true);
  }
  game.paddleX = 0;
  placeBallOnPaddle();
}

function serve(): void {
  if (state.status !== "ready") return;
  state.status = "playing";
  const angle = ((Math.random() - 0.5) * 30 * Math.PI) / 180;
  game.vx = BALL_SPEED * Math.sin(angle);
  game.vy = BALL_SPEED * Math.cos(angle);
}

function keyName(e: KeyboardEvent): string {
  if (e.code === "Space" || e.key === " ") return "space";
  if (e.code === "ArrowLeft" || e.key === "ArrowLeft") return "left";
  if (e.code === "ArrowRight" || e.key === "ArrowRight") return "right";
  const k = e.key.toLowerCase();
  if (k === "a") return "left";
  if (k === "d") return "right";
  if (k === "r") return "restart";
  return "";
}

window.addEventListener("keydown", (e) => {
  const k = keyName(e);
  if (!k) return;
  e.preventDefault();
  if (k === "left") keys.left = true;
  else if (k === "right") keys.right = true;
  else if (k === "space") {
    if (!e.repeat) serve();
  } else if (k === "restart") restart();
});
window.addEventListener("keyup", (e) => {
  const k = keyName(e);
  if (k === "left") keys.left = false;
  else if (k === "right") keys.right = false;
});
window.addEventListener("blur", () => {
  keys.left = false;
  keys.right = false;
});

function loseLife(): void {
  state.lives -= 1;
  if (state.lives <= 0) {
    state.lives = 0;
    state.status = "lost";
    game.vx = 0;
    game.vy = 0;
  } else {
    state.status = "ready";
    placeBallOnPaddle();
  }
}

function step(dt: number): void {
  game.ballX += game.vx * dt;
  game.ballY += game.vy * dt;

  // Walls and ceiling
  if (game.ballX < -HALF_W + BALL_R) {
    game.ballX = -HALF_W + BALL_R;
    game.vx = Math.abs(game.vx);
  } else if (game.ballX > HALF_W - BALL_R) {
    game.ballX = HALF_W - BALL_R;
    game.vx = -Math.abs(game.vx);
  }
  if (game.ballY > TOP - BALL_R) {
    game.ballY = TOP - BALL_R;
    game.vy = -Math.abs(game.vy);
  }

  // Paddle
  const padTop = PADDLE_Y + PADDLE_H / 2;
  if (
    game.vy < 0 &&
    game.ballY - BALL_R <= padTop &&
    game.ballY - BALL_R >= PADDLE_Y - PADDLE_H / 2 - 0.3 &&
    Math.abs(game.ballX - game.paddleX) <= PADDLE_W / 2 + BALL_R
  ) {
    const off = Math.max(-1, Math.min(1, (game.ballX - game.paddleX) / (PADDLE_W / 2)));
    const angle = off * MAX_BOUNCE;
    game.ballY = padTop + BALL_R;
    game.vx = BALL_SPEED * Math.sin(angle);
    game.vy = BALL_SPEED * Math.cos(angle);
  }

  // Bricks (one per sub-step)
  for (const b of bricks) {
    if (!b.alive) continue;
    const cx = Math.max(b.x - BRICK_W / 2, Math.min(game.ballX, b.x + BRICK_W / 2));
    const cy = Math.max(b.y - BRICK_H / 2, Math.min(game.ballY, b.y + BRICK_H / 2));
    const dx = game.ballX - cx;
    const dy = game.ballY - cy;
    if (dx * dx + dy * dy > BALL_R * BALL_R) continue;
    b.alive = false;
    app.nodes.require(b.id).setVisible(false);
    state.score += ROW_POINTS[b.row]!;
    state.bricksLeft -= 1;
    if (Math.abs(dx) > Math.abs(dy)) {
      game.vx = dx > 0 ? Math.abs(game.vx) : -Math.abs(game.vx);
    } else if (Math.abs(dy) > Math.abs(dx)) {
      game.vy = dy > 0 ? Math.abs(game.vy) : -Math.abs(game.vy);
    } else {
      // Ball centre inside the brick: bounce back along the incoming direction.
      game.vy = -game.vy;
    }
    if (state.bricksLeft <= 0) {
      state.status = "won";
      game.vx = 0;
      game.vy = 0;
    }
    break;
  }

  if (state.status === "playing" && game.ballY < PADDLE_Y - PADDLE_H / 2 - BALL_R * 2) loseLife();
}

function updateHud(): void {
  scoreEl.textContent = `Score: ${state.score}`;
  livesEl.textContent = `Lives: ${state.lives}`;
  statusEl.textContent = `Status: ${state.status}`;
  if (state.status === "won" || state.status === "lost") {
    overlay.style.display = "flex";
    overlayTitle.textContent = state.status === "won" ? "You win!" : "Game over";
    overlayHint.textContent = `Score ${state.score}. Press R to restart.`;
  } else {
    overlay.style.display = "none";
  }
}

let frames = 0;
app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (state.status !== "won" && state.status !== "lost") {
    const lim = HALF_W - PADDLE_W / 2;
    game.paddleX = Math.max(-lim, Math.min(lim, game.paddleX + dir * PADDLE_SPEED * dt));
    if (state.status === "ready") {
      placeBallOnPaddle();
    } else if (state.status === "playing") {
      const n = 4;
      for (let i = 0; i < n && state.status === "playing"; i += 1) step(dt / n);
    }
  }
  app.nodes.require("paddle").setPosition(game.paddleX, PADDLE_Y, 0);
  app.nodes.require("ball").setPosition(game.ballX, game.ballY, 0);
  updateHud();
  frames += 1;
  if (frames === 2) window.__TASK_READY__ = true;
});

restart();
updateHud();
await app.ready();
