import { camera, createAuraApp, environments, lights, material, primitives, scene } from "@aura3d/engine";

type Status = "ready" | "playing" | "won" | "lost";

declare global {
  interface Window {
    __TASK_STATE__?: { status: Status; score: number; lives: number; bricksLeft: number };
    __TASK_READY__?: boolean;
  }
}

// ---- field constants (world units; play field is the XY plane facing the camera) ----
const HALF_W = 8;
const CEIL = 10;
const PADDLE_Y = 0.8;
const PADDLE_HALF = 1.5;
const PADDLE_H = 0.5;
const PADDLE_SPEED = 14;
const BALL_R = 0.3;
const BALL_SPEED0 = 9;
const BALL_SPEED_MAX = 14;
const COLS = 8;
const ROWS = 5;
const BRICK_W = 1.8;
const BRICK_H = 0.65;
const BRICK_DX = 2;
const BRICK_DY = 0.85;
const TOP_ROW_Y = 8.6;
const ROW_COLORS = ["#ff4d4d", "#ff9f40", "#ffe14d", "#4dd67a", "#4da6ff"];
const ROW_POINTS = [50, 40, 30, 20, 10];

interface Brick {
  id: string;
  x: number;
  y: number;
  points: number;
  alive: boolean;
}

// ---- scene ----
const sc = scene({ background: "#0b0e1a" })
  .camera(camera.perspective({ position: [0, 3, 15.5], target: [0, 4.6, 0], fov: 45, near: 1, far: 100 }))
  .add(environments.neutral({ intensity: 0.5, background: false }))
  .add(lights.hemisphere({ skyColor: "#cfe0ff", groundColor: "#332244", intensity: 0.8 }))
  .add(lights.directional({ position: [5, 12, 14], target: [0, 4, 0], intensity: 2.5 }))
  .add(primitives.box({ name: "backdrop", size: [HALF_W * 2 + 1, CEIL + 1, 0.2], material: material.pbr({ color: "#161b33", roughness: 0.9 }) }).position(0, CEIL / 2 - 0.5, -0.6))
  .add(primitives.box({ name: "wall-l", size: [0.4, CEIL + 1, 0.8], material: material.pbr({ color: "#8a93b8", roughness: 0.5 }) }).position(-HALF_W - 0.2, CEIL / 2 - 0.5, 0))
  .add(primitives.box({ name: "wall-r", size: [0.4, CEIL + 1, 0.8], material: material.pbr({ color: "#8a93b8", roughness: 0.5 }) }).position(HALF_W + 0.2, CEIL / 2 - 0.5, 0))
  .add(primitives.box({ name: "wall-t", size: [HALF_W * 2 + 0.8, 0.4, 0.8], material: material.pbr({ color: "#8a93b8", roughness: 0.5 }) }).position(0, CEIL + 0.2, 0))
  .add(primitives.box({ name: "paddle", size: [PADDLE_HALF * 2, PADDLE_H, 0.8], material: material.pbr({ color: "#e8ecff", metallic: 0.3, roughness: 0.35 }) }).position(0, PADDLE_Y, 0).runtime({ id: "paddle", mutable: true }))
  .add(primitives.sphere({ name: "ball", size: BALL_R * 2, material: material.pbr({ color: "#ffffff", roughness: 0.2 }) }).position(0, PADDLE_Y + PADDLE_H / 2 + BALL_R, 0).runtime({ id: "ball", mutable: true }));

const bricks: Brick[] = [];
let withBricks = sc;
for (let r = 0; r < ROWS; r += 1) {
  const mat = material.pbr({ color: ROW_COLORS[r]!, roughness: 0.45 });
  for (let c = 0; c < COLS; c += 1) {
    const x = (c - (COLS - 1) / 2) * BRICK_DX;
    const y = TOP_ROW_Y - r * BRICK_DY;
    const id = `brick-${r}-${c}`;
    bricks.push({ id, x, y, points: ROW_POINTS[r]!, alive: true });
    withBricks = withBricks.add(primitives.box({ name: id, size: [BRICK_W, BRICK_H, 0.7], material: mat }).position(x, y, 0).runtime({ id, mutable: true }));
  }
}

const app = createAuraApp("#app", { scene: withBricks });

// ---- DOM HUD + overlay ----
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "width:640px;box-sizing:border-box;padding:6px 10px;display:flex;justify-content:space-between;font:14px/1.4 system-ui,sans-serif;background:#111;color:#fff";
const scoreEl = document.createElement("span");
const livesEl = document.createElement("span");
const statusEl = document.createElement("span");
scoreEl.id = "hud-score";
livesEl.id = "hud-lives";
statusEl.id = "hud-status";
hud.append(scoreEl, livesEl, statusEl);
document.body.appendChild(hud);

const overlay = document.createElement("div");
overlay.id = "overlay";
overlay.style.cssText =
  "position:absolute;left:0;top:0;width:640px;height:360px;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);color:#fff;font:bold 36px system-ui,sans-serif;text-align:center;pointer-events:none";
const overlayTitle = document.createElement("div");
const overlayHint = document.createElement("div");
overlayHint.style.cssText = "font:16px system-ui,sans-serif;margin-top:10px";
overlay.append(overlayTitle, overlayHint);
document.body.appendChild(overlay);

// ---- game state ----
let status: Status = "ready";
let score = 0;
let lives = 3;
let bricksLeft = bricks.length;
let paddleX = 0;
let ballX = 0;
let ballY = PADDLE_Y + PADDLE_H / 2 + BALL_R;
let vx = 0;
let vy = 0;
let speed = BALL_SPEED0;

const state = {
  get status(): Status { return status; },
  get score(): number { return score; },
  get lives(): number { return lives; },
  get bricksLeft(): number { return bricksLeft; }
};
Object.defineProperty(window, "__TASK_STATE__", { get: () => state, configurable: true });

const held = new Set<string>();
const keyName = (e: KeyboardEvent): string => {
  if (e.code === "ArrowLeft" || e.key === "ArrowLeft") return "left";
  if (e.code === "ArrowRight" || e.key === "ArrowRight") return "right";
  if (e.code === "KeyA" || e.key === "a" || e.key === "A") return "left";
  if (e.code === "KeyD" || e.key === "d" || e.key === "D") return "right";
  if (e.code === "Space" || e.key === " ") return "space";
  if (e.code === "KeyR" || e.key === "r" || e.key === "R") return "restart";
  return "";
};

const place = (id: string, x: number, y: number, z = 0): void => {
  app.nodes.require(id).setPosition(x, y, z);
};

const resetBall = (): void => {
  ballX = paddleX;
  ballY = PADDLE_Y + PADDLE_H / 2 + BALL_R;
  vx = 0;
  vy = 0;
  speed = BALL_SPEED0;
};

const restart = (): void => {
  score = 0;
  lives = 3;
  bricksLeft = bricks.length;
  status = "ready";
  paddleX = 0;
  for (const b of bricks) {
    b.alive = true;
    place(b.id, b.x, b.y);
  }
  resetBall();
};

const serve = (): void => {
  if (status !== "ready") return;
  status = "playing";
  const a = ((Math.random() - 0.5) * 30 * Math.PI) / 180;
  vx = speed * Math.sin(a);
  vy = speed * Math.cos(a);
};

window.addEventListener("keydown", (e) => {
  const k = keyName(e);
  if (!k) return;
  e.preventDefault();
  if (k === "restart") restart();
  else if (k === "space") serve();
  else held.add(k);
});
window.addEventListener("keyup", (e) => {
  const k = keyName(e);
  if (k) held.delete(k);
});
window.addEventListener("blur", () => held.clear());

const loseLife = (): void => {
  lives -= 1;
  if (lives <= 0) {
    lives = 0;
    status = "lost";
  } else {
    status = "ready";
  }
  resetBall();
};

const step = (dt: number): void => {
  // ball motion
  ballX += vx * dt;
  ballY += vy * dt;

  if (ballX < -HALF_W + BALL_R) { ballX = -HALF_W + BALL_R; vx = Math.abs(vx); }
  if (ballX > HALF_W - BALL_R) { ballX = HALF_W - BALL_R; vx = -Math.abs(vx); }
  if (ballY > CEIL - BALL_R) { ballY = CEIL - BALL_R; vy = -Math.abs(vy); }

  // paddle
  const top = PADDLE_Y + PADDLE_H / 2;
  if (vy < 0 && ballY - BALL_R <= top && ballY > PADDLE_Y - PADDLE_H / 2 - BALL_R && Math.abs(ballX - paddleX) <= PADDLE_HALF + BALL_R) {
    const off = Math.max(-1, Math.min(1, (ballX - paddleX) / PADDLE_HALF));
    speed = Math.min(BALL_SPEED_MAX, speed + 0.15);
    const a = off * (62 * Math.PI) / 180;
    vx = speed * Math.sin(a);
    vy = speed * Math.cos(a);
    ballY = top + BALL_R;
  }

  // bricks (one per step)
  for (const b of bricks) {
    if (!b.alive) continue;
    const dx = ballX - b.x;
    const dy = ballY - b.y;
    const ox = BRICK_W / 2 + BALL_R - Math.abs(dx);
    const oy = BRICK_H / 2 + BALL_R - Math.abs(dy);
    if (ox > 0 && oy > 0) {
      b.alive = false;
      bricksLeft -= 1;
      score += b.points;
      place(b.id, 0, -50);
      if (ox < oy) {
        vx = dx < 0 ? -Math.abs(vx) : Math.abs(vx);
      } else {
        vy = dy < 0 ? -Math.abs(vy) : Math.abs(vy);
      }
      if (bricksLeft === 0) {
        status = "won";
        vx = 0;
        vy = 0;
      }
      break;
    }
  }

  // fell below the paddle
  if (status === "playing" && ballY < PADDLE_Y - PADDLE_H / 2 - BALL_R * 2) loseLife();
};

const updateDom = (): void => {
  scoreEl.textContent = `Score: ${score}`;
  livesEl.textContent = `Lives: ${lives}`;
  statusEl.textContent = `Status: ${status}`;
  if (status === "won" || status === "lost") {
    overlay.style.display = "flex";
    overlayTitle.textContent = status === "won" ? "You win!" : "Game over";
    overlayHint.textContent = `Score ${score} - press R to restart`;
  } else {
    overlay.style.display = "none";
  }
};

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);
  const dir = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
  if (status !== "won" && status !== "lost") {
    paddleX = Math.max(-HALF_W + PADDLE_HALF, Math.min(HALF_W - PADDLE_HALF, paddleX + dir * PADDLE_SPEED * dt));
  }
  if (status === "ready") {
    ballX = paddleX;
    ballY = PADDLE_Y + PADDLE_H / 2 + BALL_R;
  } else if (status === "playing") {
    const n = Math.max(1, Math.ceil((speed * dt) / 0.1));
    for (let i = 0; i < n && status === "playing"; i += 1) step(dt / n);
  }
  place("paddle", paddleX, PADDLE_Y);
  place("ball", ballX, ballY);
  updateDom();
});

updateDom();
await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__TASK_READY__ = true;
  });
});
