import * as THREE from "three";

type Status = "playing" | "paused" | "won" | "lost";

const DT = 1 / 60;
const ROUND_FRAMES = 30 * 60;
const WIN_SCORE = 15;
const COIN_COUNT = 10;
const HALF_W = 9;
const HALF_H = 5;
const PLAYER_R = 0.5;
const COIN_R = 0.4;
const SPEED = 7;
const SEED = 12345;

// ---------- HUD (DOM, outside the canvas) ----------
const hud = document.createElement("div");
hud.style.cssText = "padding:4px 8px;font:14px/1.4 system-ui,sans-serif;display:flex;gap:16px";
hud.innerHTML =
  'Score: <span id="score">0</span> Time left: <span id="time">30.0</span> Status: <span id="status">playing</span>';
document.body.appendChild(hud);
const scoreEl = document.getElementById("score") as HTMLElement;
const timeEl = document.getElementById("time") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;

// ---------- seeded RNG ----------
let rngState = SEED;
function rand(): number {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- three.js scene ----------
const canvas = document.getElementById("app") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14181f);
const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 100);
camera.position.set(0, 15, 8);
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(4, 10, 6);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.BoxGeometry(HALF_W * 2 + 1, 0.4, HALF_H * 2 + 1),
  new THREE.MeshStandardMaterial({ color: 0x2c3a4f }),
);
floor.position.y = -0.2 - PLAYER_R;
scene.add(floor);

const player = new THREE.Mesh(
  new THREE.SphereGeometry(PLAYER_R, 24, 16),
  new THREE.MeshStandardMaterial({ color: 0x4fc3f7 }),
);
scene.add(player);

const coinGeo = new THREE.CylinderGeometry(COIN_R, COIN_R, 0.12, 20);
coinGeo.rotateX(Math.PI / 2);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd54a, metalness: 0.5, roughness: 0.3 });
const coins: THREE.Mesh[] = [];
for (let i = 0; i < COIN_COUNT; i++) {
  const m = new THREE.Mesh(coinGeo, coinMat);
  scene.add(m);
  coins.push(m);
}

// ---------- game state ----------
let score = 0;
let frames = 0;
let status: Status = "playing";
let paused = false;
const px = { x: 0, z: 0 };

function placeCoin(coin: THREE.Mesh): void {
  for (let tries = 0; tries < 50; tries++) {
    const x = (rand() * 2 - 1) * (HALF_W - 0.6);
    const z = (rand() * 2 - 1) * (HALF_H - 0.6);
    if (Math.hypot(x - px.x, z - px.z) < 2.5) continue;
    let ok = true;
    for (const c of coins) {
      if (c !== coin && Math.hypot(c.position.x - x, c.position.z - z) < 1.2) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    coin.position.set(x, 0, z);
    return;
  }
  coin.position.set((rand() * 2 - 1) * (HALF_W - 0.6), 0, (rand() * 2 - 1) * (HALF_H - 0.6));
}

function reset(): void {
  rngState = SEED;
  score = 0;
  frames = 0;
  status = "playing";
  paused = false;
  px.x = 0;
  px.z = 0;
  for (const c of coins) c.position.set(1000, 0, 1000);
  for (const c of coins) placeCoin(c);
  updateHud();
}

function currentStatus(): Status {
  return paused && status === "playing" ? "paused" : status;
}

function updateHud(): void {
  const left = Math.max(0, 30 - frames * DT);
  scoreEl.textContent = String(score);
  timeEl.textContent = left.toFixed(1);
  statusEl.textContent = currentStatus();
}

// ---------- input ----------
const keys = new Set<string>();
const MOVE_KEYS = new Set([
  "arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d",
]);

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (MOVE_KEYS.has(k)) {
    keys.add(k);
    e.preventDefault();
  } else if (k === "p" && !e.repeat) {
    if (status === "playing") {
      paused = !paused;
      updateHud();
    }
  } else if (k === "r" && !e.repeat) {
    reset();
  }
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
});
window.addEventListener("blur", () => keys.clear());

// ---------- simulation ----------
function stepOnce(): void {
  if (status !== "playing" || paused) return;
  let dx = 0;
  let dz = 0;
  if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
  if (keys.has("arrowright") || keys.has("d")) dx += 1;
  if (keys.has("arrowup") || keys.has("w")) dz -= 1;
  if (keys.has("arrowdown") || keys.has("s")) dz += 1;
  const len = Math.hypot(dx, dz);
  if (len > 0) {
    px.x += (dx / len) * SPEED * DT;
    px.z += (dz / len) * SPEED * DT;
    px.x = Math.max(-HALF_W, Math.min(HALF_W, px.x));
    px.z = Math.max(-HALF_H, Math.min(HALF_H, px.z));
  }
  frames++;

  for (const c of coins) {
    if (Math.hypot(c.position.x - px.x, c.position.z - px.z) < PLAYER_R + COIN_R) {
      score++;
      placeCoin(c);
      if (score >= WIN_SCORE) {
        status = "won";
        break;
      }
    }
  }
  if (status === "playing" && frames >= ROUND_FRAMES) status = "lost";
}

function step(n: number): void {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  for (let i = 0; i < count; i++) {
    stepOnce();
    if (status !== "playing") break;
  }
  updateHud();
}

declare global {
  interface Window {
    __EVAL__: {
      state: () => { score: number; status: Status; time: number };
      step: (frames: number) => void;
    };
    __EVAL_READY__?: boolean;
  }
}

window.__EVAL__ = {
  state: () => ({ score, status: currentStatus(), time: frames * DT }),
  step,
};

// ---------- loop ----------
reset();
let last = performance.now();
let acc = 0;

function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= DT) {
    stepOnce();
    acc -= DT;
  }
  updateHud();

  player.position.set(px.x, 0, px.z);
  const t = now / 1000;
  for (const c of coins) c.rotation.y = t * 2;
  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
