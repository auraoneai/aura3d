import { camera, createAuraApp, environments, lights, material, primitives, scene } from "@aura3d/engine";

type Status = "ready" | "playing" | "won" | "lost";

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

// Play field: x in [-HALF_W, HALF_W], y in [0, FIELD_H]
const HALF_W = 6;
const FIELD_H = 8;
const COLS = 8;
const ROWS = 4;
const BRICK_W = 1.35;
const BRICK_H = 0.5;
const BRICK_PITCH = 1.5;
const BRICK_TOP_Y = 6.9;
const ROW_PITCH = 0.7;
const ROW_COLORS = ["#ff4d5e", "#ff9d3c", "#ffe14a", "#4fd36b"];
const ROW_POINTS = [40, 30, 20, 10];
const PADDLE_W = 2.2;
const PADDLE_H = 0.3;
const PADDLE_Y = 0.6;
const PADDLE_SPEED = 11;
const BALL_R = 0.2;
const BALL_SPEED = 7.5;
const MAX_BOUNCE = (60 * Math.PI) / 180;
const STEP = 1 / 120;
const LIVES = 3;

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
      x: -((COLS - 1) * BRICK_PITCH) / 2 + c * BRICK_PITCH,
      y: BRICK_TOP_Y - r * ROW_PITCH,
      row: r,
      alive: true
    });
  }
}

const sim = {
  status: "ready" as Status,
  score: 0,
  lives: LIVES,
  paddleX: 0,
  ballX: 0,
  ballY: PADDLE_Y + PADDLE_H / 2 + BALL_R,
  vx: 0,
  vy: 0,
  serveDir: 1
};

const taskState: TaskState = { status: "ready", score: 0, lives: LIVES, bricksLeft: bricks.length };
window.__TASK_STATE__ = taskState;
window.__TASK_READY__ = false;

function syncTaskState(): void {
  taskState.status = sim.status;
  taskState.score = sim.score;
  taskState.lives = sim.lives;
  taskState.bricksLeft = bricks.reduce((n, b) => n + (b.alive ? 1 : 0), 0);
}

function stickBall(): void {
  sim.ballX = sim.paddleX;
  sim.ballY = PADDLE_Y + PADDLE_H / 2 + BALL_R;
  sim.vx = 0;
  sim.vy = 0;
}

function restart(): void {
  for (const b of bricks) b.alive = true;
  sim.status = "ready";
  sim.score = 0;
  sim.lives = LIVES;
  sim.paddleX = 0;
  sim.serveDir = 1;
  stickBall();
  syncTaskState();
}

function serve(): void {
  if (sim.status !== "ready") return;
  sim.status = "playing";
  sim.vx = BALL_SPEED * 0.3 * sim.serveDir;
  sim.vy = Math.sqrt(BALL_SPEED * BALL_SPEED - sim.vx * sim.vx);
  sim.serveDir = -sim.serveDir;
  syncTaskState();
}

// Input
const held = new Set<string>();
const LEFT_KEYS = ["ArrowLeft", "KeyA"];
const RIGHT_KEYS = ["ArrowRight", "KeyD"];
const HANDLED = [...LEFT_KEYS, ...RIGHT_KEYS, "Space", "KeyR"];

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (!HANDLED.includes(e.code)) return;
  e.preventDefault();
  if (e.repeat) return;
  held.add(e.code);
  if (e.code === "Space") serve();
  else if (e.code === "KeyR") restart();
});
window.addEventListener("keyup", (e: KeyboardEvent) => {
  held.delete(e.code);
});
window.addEventListener("blur", () => held.clear());

function isHeld(codes: string[]): boolean {
  return codes.some((c) => held.has(c));
}

// Simulation step
function loseLife(): void {
  sim.lives -= 1;
  if (sim.lives <= 0) {
    sim.lives = 0;
    sim.status = "lost";
    sim.vx = 0;
    sim.vy = 0;
    sim.ballY = -2;
  } else {
    sim.status = "ready";
    stickBall();
  }
}

function collideBricks(): void {
  for (const b of bricks) {
    if (!b.alive) continue;
    const hw = BRICK_W / 2;
    const hh = BRICK_H / 2;
    const nx = Math.max(b.x - hw, Math.min(sim.ballX, b.x + hw));
    const ny = Math.max(b.y - hh, Math.min(sim.ballY, b.y + hh));
    const dx = sim.ballX - nx;
    const dy = sim.ballY - ny;
    if (dx * dx + dy * dy > BALL_R * BALL_R) continue;

    b.alive = false;
    sim.score += ROW_POINTS[b.row] ?? 10;

    if (dx === 0 && dy === 0) {
      // centre inside the brick: reflect vertically
      sim.vy = -sim.vy;
    } else if (Math.abs(dx) > Math.abs(dy)) {
      sim.vx = dx > 0 ? Math.abs(sim.vx) : -Math.abs(sim.vx);
      sim.ballX = nx + Math.sign(dx) * BALL_R;
    } else {
      sim.vy = dy > 0 ? Math.abs(sim.vy) : -Math.abs(sim.vy);
      sim.ballY = ny + Math.sign(dy) * BALL_R;
    }
    return; // one brick per step
  }
}

function step(dt: number): void {
  const dir = (isHeld(RIGHT_KEYS) ? 1 : 0) - (isHeld(LEFT_KEYS) ? 1 : 0);
  const maxX = HALF_W - PADDLE_W / 2;
  sim.paddleX = Math.max(-maxX, Math.min(maxX, sim.paddleX + dir * PADDLE_SPEED * dt));

  if (sim.status === "ready") {
    stickBall();
    return;
  }
  if (sim.status !== "playing") return;

  sim.ballX += sim.vx * dt;
  sim.ballY += sim.vy * dt;

  if (sim.ballX < -HALF_W + BALL_R) {
    sim.ballX = -HALF_W + BALL_R;
    sim.vx = Math.abs(sim.vx);
  } else if (sim.ballX > HALF_W - BALL_R) {
    sim.ballX = HALF_W - BALL_R;
    sim.vx = -Math.abs(sim.vx);
  }
  if (sim.ballY > FIELD_H - BALL_R) {
    sim.ballY = FIELD_H - BALL_R;
    sim.vy = -Math.abs(sim.vy);
  }

  // Paddle
  const top = PADDLE_Y + PADDLE_H / 2;
  if (
    sim.vy < 0 &&
    sim.ballY - BALL_R <= top &&
    sim.ballY - BALL_R >= PADDLE_Y - PADDLE_H &&
    Math.abs(sim.ballX - sim.paddleX) <= PADDLE_W / 2 + BALL_R
  ) {
    const off = Math.max(-1, Math.min(1, (sim.ballX - sim.paddleX) / (PADDLE_W / 2)));
    const angle = off * MAX_BOUNCE;
    sim.vx = BALL_SPEED * Math.sin(angle);
    sim.vy = BALL_SPEED * Math.cos(angle);
    sim.ballY = top + BALL_R;
  }

  collideBricks();

  if (!bricks.some((b) => b.alive)) {
    sim.status = "won";
    sim.vx = 0;
    sim.vy = 0;
  } else if (sim.ballY < -BALL_R * 2) {
    loseLife();
  }
  syncTaskState();
}

// Scene
const root = scene({ background: "#0d1220" })
  .add(environments.neutral({ intensity: 0.9, background: false }))
  .add(lights.ambient({ intensity: 0.35 }))
  .add(lights.directional({ position: [-4, 8, 10], target: [0, 4, 0], intensity: 2.2 }))
  .add(lights.point({ position: [0, 4, 6], intensity: 20 }))
  .camera(camera.perspective({ position: [0, 4, 12.5], target: [0, 4, 0], fov: 45 }))
  .add(
    primitives
      .box({ name: "backdrop", size: [HALF_W * 2 + 0.6, FIELD_H + 0.6, 0.2], material: material.pbr({ color: "#1b2438", roughness: 0.9 }) })
      .position(0, FIELD_H / 2, -0.6)
  )
  .add(
    primitives
      .box({ name: "wall-left", size: [0.3, FIELD_H + 0.3, 0.8], material: material.pbr({ color: "#7d8aa8", roughness: 0.5 }) })
      .position(-HALF_W - 0.15, FIELD_H / 2, 0)
  )
  .add(
    primitives
      .box({ name: "wall-right", size: [0.3, FIELD_H + 0.3, 0.8], material: material.pbr({ color: "#7d8aa8", roughness: 0.5 }) })
      .position(HALF_W + 0.15, FIELD_H / 2, 0)
  )
  .add(
    primitives
      .box({ name: "wall-top", size: [HALF_W * 2 + 0.6, 0.3, 0.8], material: material.pbr({ color: "#7d8aa8", roughness: 0.5 }) })
      .position(0, FIELD_H + 0.15, 0)
  )
  .add(
    primitives
      .box({ name: "paddle", size: [PADDLE_W, PADDLE_H, 0.6], material: material.pbr({ color: "#e8eefc", roughness: 0.35, metallic: 0.3 }) })
      .position(0, PADDLE_Y, 0)
      .runtime({ id: "paddle", mutable: true })
  )
  .add(
    primitives
      .sphere({ name: "ball", size: BALL_R * 2, material: material.pbr({ color: "#ffffff", roughness: 0.25 }) })
      .position(0, PADDLE_Y + PADDLE_H / 2 + BALL_R, 0)
      .runtime({ id: "ball", mutable: true })
  );

for (const b of bricks) {
  root.add(
    primitives
      .box({
        name: b.id,
        size: [BRICK_W, BRICK_H, 0.6],
        material: material.pbr({ color: ROW_COLORS[b.row] ?? "#ffffff", roughness: 0.45 })
      })
      .position(b.x, b.y, 0)
      .runtime({ id: b.id, mutable: true })
  );
}

// DOM HUD (outside the canvas) and overlay (positioned over the canvas)
const canvas = document.getElementById("app") as HTMLCanvasElement;

const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "width:640px;display:flex;justify-content:space-between;padding:6px 10px;box-sizing:border-box;font:600 14px system-ui,sans-serif;background:#111827;color:#fff;";
const scoreEl = document.createElement("span");
const livesEl = document.createElement("span");
const statusEl = document.createElement("span");
hud.append(scoreEl, livesEl, statusEl);
canvas.insertAdjacentElement("afterend", hud);

const hint = document.createElement("div");
hint.style.cssText = "width:640px;padding:2px 10px;box-sizing:border-box;font:12px system-ui,sans-serif;color:#9aa4b8;";
hint.textContent = "Left/Right or A/D: move   Space: serve   R: restart";
hud.insertAdjacentElement("afterend", hint);

const overlay = document.createElement("div");
overlay.id = "overlay";
overlay.style.cssText =
  "position:absolute;left:0;top:0;width:640px;height:360px;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);color:#fff;font:700 36px system-ui,sans-serif;pointer-events:none;text-align:center;";
const overlayTitle = document.createElement("div");
const overlaySub = document.createElement("div");
overlaySub.style.cssText = "font:500 16px system-ui,sans-serif;margin-top:10px;";
overlay.append(overlayTitle, overlaySub);
document.body.appendChild(overlay);

function updateDom(): void {
  scoreEl.textContent = `Score: ${sim.score}`;
  livesEl.textContent = `Lives: ${sim.lives}`;
  statusEl.textContent = `Status: ${sim.status}`;
  if (sim.status === "won" || sim.status === "lost") {
    overlay.style.display = "flex";
    overlayTitle.textContent = sim.status === "won" ? "You win!" : "Game over";
    overlaySub.textContent = `Score ${sim.score}. Press R to restart`;
  } else {
    overlay.style.display = "none";
  }
}

async function main(): Promise<void> {
  const app = createAuraApp("#app", { scene: root });
  await app.ready();

  const paddleNode = app.nodes.require("paddle");
  const ballNode = app.nodes.require("ball");
  const brickNodes = bricks.map((b) => ({ brick: b, node: app.nodes.require(b.id), shown: true }));

  function present(): void {
    paddleNode.setPosition(sim.paddleX, PADDLE_Y, 0);
    ballNode.setPosition(sim.ballX, sim.ballY, 0);
    for (const entry of brickNodes) {
      if (entry.shown !== entry.brick.alive) {
        entry.shown = entry.brick.alive;
        entry.node.setVisible(entry.brick.alive);
      }
    }
    updateDom();
  }

  let last = performance.now();
  let acc = 0;
  function frame(now: number): void {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= STEP) {
      step(STEP);
      acc -= STEP;
    }
    present();
    if (!window.__TASK_READY__) window.__TASK_READY__ = true;
    requestAnimationFrame(frame);
  }
  restart();
  requestAnimationFrame(frame);
}

void main();
