import { camera, createAuraApp, effects, environments, lights, material, primitives, scene } from "@aura3d/engine";

type Status = "ready" | "playing" | "won" | "lost";
interface TaskState { status: Status; score: number; lives: number; bricksLeft: number }

declare global {
  interface Window {
    __TASK_STATE__?: TaskState;
    __TASK_READY__?: boolean;
  }
}

// ---- Field geometry (x right, y up, z toward camera) ----
const HALF_W = 10;
const CEIL = 12;
const BALL_R = 0.35;
const BALL_SPEED = 11;
const PADDLE_Y = 0.8;
const PADDLE_HW = 1.8;
const PADDLE_HH = 0.3;
const PADDLE_SPEED = 17;
const COLS = 8;
const ROWS = 5;
const BRICK_W = 2.2;
const BRICK_H = 0.8;
const BRICK_GAP = 0.2;
const ROW_COLORS = ["#ff4d4d", "#ff9f40", "#ffe14d", "#4dd96a", "#4da6ff"];
const ROW_POINTS = [50, 40, 30, 20, 10];
const START_LIVES = 3;

interface Brick { id: string; x: number; y: number; row: number; alive: boolean }

const bricks: Brick[] = [];
for (let r = 0; r < ROWS; r += 1) {
  for (let c = 0; c < COLS; c += 1) {
    const x = (c - (COLS - 1) / 2) * (BRICK_W + BRICK_GAP);
    const y = 10.4 - r * (BRICK_H + BRICK_GAP);
    bricks.push({ id: `brick-${r}-${c}`, x, y, row: r, alive: true });
  }
}

// ---- Scene ----
let sc = scene({ background: "#0a0d1a" })
  .camera(camera.perspective({ position: [0, 6.2, 21], target: [0, 6.2, 0], fov: 45, near: 1, far: 100 }))
  .add(environments.neutral({ intensity: 0.5, background: false }))
  .add(lights.hemisphere({ skyColor: "#cfe0ff", groundColor: "#303050", intensity: 0.9 }))
  .add(lights.directional({ position: [6, 14, 16], target: [0, 6, 0], intensity: 2.6 }))
  .add(effects.bloom({ intensity: 0.25, threshold: 0.9, radius: 0.4 }))
  .add(primitives.box({ name: "backdrop", size: [HALF_W * 2 + 2, CEIL + 1, 0.2], material: material.pbr({ color: "#161b33", roughness: 1 }) }).position(0, (CEIL - 1) / 2, -0.7))
  .add(primitives.box({ name: "wall-left", size: [0.5, CEIL + 1, 1.2], material: material.pbr({ color: "#8f98c8", roughness: 0.5, metallic: 0.3 }) }).position(-HALF_W - 0.25, (CEIL - 1) / 2, 0))
  .add(primitives.box({ name: "wall-right", size: [0.5, CEIL + 1, 1.2], material: material.pbr({ color: "#8f98c8", roughness: 0.5, metallic: 0.3 }) }).position(HALF_W + 0.25, (CEIL - 1) / 2, 0))
  .add(primitives.box({ name: "ceiling", size: [HALF_W * 2 + 1, 0.5, 1.2], material: material.pbr({ color: "#8f98c8", roughness: 0.5, metallic: 0.3 }) }).position(0, CEIL + 0.25, 0))
  .add(primitives.box({ name: "floor", size: [HALF_W * 2 + 1, 0.2, 1.2], material: material.pbr({ color: "#232846", roughness: 0.8 }) }).position(0, -1.1, 0))
  .add(
    primitives.box({ name: "paddle", size: [PADDLE_HW * 2, PADDLE_HH * 2, 1], material: material.pbr({ color: "#e8eefc", roughness: 0.3, metallic: 0.4 }) })
      .position(0, PADDLE_Y, 0)
      .runtime({ id: "paddle", mutable: true })
  )
  .add(
    primitives.sphere({ name: "ball", size: BALL_R * 2, material: material.pbr({ color: "#ffffff", roughness: 0.2, metallic: 0.1 }) })
      .position(0, PADDLE_Y + PADDLE_HH + BALL_R, 0)
      .runtime({ id: "ball", mutable: true })
  );

for (const b of bricks) {
  sc = sc.add(
    primitives.box({ name: b.id, size: [BRICK_W, BRICK_H, 1], material: material.pbr({ color: ROW_COLORS[b.row]!, roughness: 0.4, metallic: 0.2 }) })
      .position(b.x, b.y, 0)
      .runtime({ id: b.id, mutable: true })
  );
}

const app = createAuraApp("#app", { scene: sc });

// ---- HUD (DOM, outside the canvas) ----
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "display:flex;gap:24px;width:640px;padding:6px 10px;box-sizing:border-box;background:#11142a;color:#fff;font:600 14px system-ui,sans-serif";
const hudScore = document.createElement("span");
const hudLives = document.createElement("span");
const hudStatus = document.createElement("span");
hud.append(hudScore, hudLives, hudStatus);
document.body.appendChild(hud);

const help = document.createElement("div");
help.style.cssText = "width:640px;padding:2px 10px;box-sizing:border-box;color:#9aa3c7;font:12px system-ui,sans-serif";
help.textContent = "A/D or Left/Right: move. Space: serve. R: restart.";
document.body.appendChild(help);

const overlay = document.createElement("div");
overlay.id = "overlay";
overlay.style.cssText =
  "position:absolute;left:0;top:0;width:640px;height:360px;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(5,7,16,0.7);color:#fff;font-family:system-ui,sans-serif;text-align:center;pointer-events:none";
const overlayTitle = document.createElement("div");
overlayTitle.style.cssText = "font-size:44px;font-weight:800;margin-bottom:8px";
const overlaySub = document.createElement("div");
overlaySub.style.cssText = "font-size:18px";
overlay.append(overlayTitle, overlaySub);
document.body.appendChild(overlay);

// ---- Game state ----
const state: TaskState = { status: "ready", score: 0, lives: START_LIVES, bricksLeft: bricks.length };
Object.defineProperty(window, "__TASK_STATE__", {
  configurable: true,
  get: (): TaskState => ({ ...state })
});

let paddleX = 0;
let ballX = 0;
let ballY = PADDLE_Y + PADDLE_HH + BALL_R;
let ballVX = 0;
let ballVY = 0;
const keys = new Set<string>();

const node = (id: string) => app.nodes.require(id);

function resetBall(): void {
  ballVX = 0;
  ballVY = 0;
  ballX = paddleX;
  ballY = PADDLE_Y + PADDLE_HH + BALL_R;
}

function restart(): void {
  state.status = "ready";
  state.score = 0;
  state.lives = START_LIVES;
  state.bricksLeft = bricks.length;
  paddleX = 0;
  for (const b of bricks) {
    b.alive = true;
    node(b.id).setVisible?.(true);
    node(b.id).setPosition(b.x, b.y, 0);
  }
  resetBall();
}

function serve(): void {
  if (state.status !== "ready") return;
  const angle = (paddleX / HALF_W) * 0.4 + 0.25; // radians from vertical
  ballVX = Math.sin(angle) * BALL_SPEED;
  ballVY = Math.cos(angle) * BALL_SPEED;
  state.status = "playing";
}

window.addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "Space", "KeyA", "KeyD", "KeyR"].includes(e.code)) e.preventDefault();
  if (e.code === "Space") {
    if (!e.repeat) serve();
  } else if (e.code === "KeyR") {
    restart();
  } else {
    keys.add(e.code);
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

function hitBricks(): void {
  for (const b of bricks) {
    if (!b.alive) continue;
    const dx = ballX - b.x;
    const dy = ballY - b.y;
    const px = BRICK_W / 2 + BALL_R - Math.abs(dx);
    const py = BRICK_H / 2 + BALL_R - Math.abs(dy);
    if (px <= 0 || py <= 0) continue;
    // Rounded-corner check: ignore diagonal corner overlaps outside the circle.
    const cx = Math.max(-BRICK_W / 2, Math.min(BRICK_W / 2, dx));
    const cy = Math.max(-BRICK_H / 2, Math.min(BRICK_H / 2, dy));
    if ((dx - cx) ** 2 + (dy - cy) ** 2 >= BALL_R * BALL_R) continue;

    b.alive = false;
    node(b.id).setVisible?.(false);
    node(b.id).setPosition(b.x, b.y, -50);
    state.bricksLeft -= 1;
    state.score += ROW_POINTS[b.row] ?? 10;
    if (px < py) {
      ballVX = dx > 0 ? Math.abs(ballVX) : -Math.abs(ballVX);
      ballX += dx > 0 ? px : -px;
    } else {
      ballVY = dy > 0 ? Math.abs(ballVY) : -Math.abs(ballVY);
      ballY += dy > 0 ? py : -py;
    }
    if (state.bricksLeft <= 0) {
      state.status = "won";
      ballVX = 0;
      ballVY = 0;
    }
    return;
  }
}

function stepBall(dt: number): void {
  ballX += ballVX * dt;
  ballY += ballVY * dt;

  if (ballX < -HALF_W + BALL_R) { ballX = -HALF_W + BALL_R; ballVX = Math.abs(ballVX); }
  if (ballX > HALF_W - BALL_R) { ballX = HALF_W - BALL_R; ballVX = -Math.abs(ballVX); }
  if (ballY > CEIL - BALL_R) { ballY = CEIL - BALL_R; ballVY = -Math.abs(ballVY); }

  // Paddle: only when moving down and the ball is crossing the top face.
  const top = PADDLE_Y + PADDLE_HH;
  if (ballVY < 0 && ballY - BALL_R <= top && ballY > PADDLE_Y - PADDLE_HH && Math.abs(ballX - paddleX) <= PADDLE_HW + BALL_R) {
    const off = Math.max(-1, Math.min(1, (ballX - paddleX) / PADDLE_HW));
    const angle = off * (Math.PI / 3); // up to 60 degrees from vertical
    ballVX = Math.sin(angle) * BALL_SPEED;
    ballVY = Math.cos(angle) * BALL_SPEED;
    ballY = top + BALL_R;
  }

  hitBricks();

  if (state.status === "playing" && ballY < PADDLE_Y - 1) {
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
}

function updateHud(): void {
  hudScore.textContent = `Score: ${state.score}`;
  hudLives.textContent = `Lives: ${state.lives}`;
  hudStatus.textContent = `Status: ${state.status}`;
  if (state.status === "won" || state.status === "lost") {
    overlay.style.display = "flex";
    overlayTitle.textContent = state.status === "won" ? "You win!" : "Game over";
    overlaySub.textContent = `Score ${state.score}. Press R to restart.`;
  } else {
    overlay.style.display = "none";
  }
}

app.onFrame((f) => {
  const dt = Math.min(f.dt, 1 / 20);
  const dir = (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
  if (state.status === "ready" || state.status === "playing") {
    paddleX = Math.max(-HALF_W + PADDLE_HW, Math.min(HALF_W - PADDLE_HW, paddleX + dir * PADDLE_SPEED * dt));
  }

  if (state.status === "ready") {
    resetBall();
  } else if (state.status === "playing") {
    const steps = Math.max(1, Math.ceil((BALL_SPEED * dt) / 0.1));
    for (let i = 0; i < steps && state.status === "playing"; i += 1) stepBall(dt / steps);
  }

  node("paddle").setPosition(paddleX, PADDLE_Y, 0);
  node("ball").setPosition(ballX, ballY, 0);
  updateHud();
});

updateHud();
await app.ready();
requestAnimationFrame(() => {
  window.__TASK_READY__ = true;
});
