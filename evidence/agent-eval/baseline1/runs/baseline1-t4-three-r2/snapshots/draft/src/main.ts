import * as THREE from "three";

type Status = "playing" | "paused" | "won" | "lost";

declare global {
  interface Window {
    __EVAL__?: {
      state: () => { score: number; status: Status; time: number };
      step: (frames: number) => void;
    };
    __EVAL_READY__?: boolean;
  }
}

// ---------- constants ----------
const DT = 1 / 60;
const ROUND_FRAMES = 30 * 60; // 30 seconds
const WIN_SCORE = 15;
const COIN_COUNT = 10;
const HALF_W = 10;
const HALF_H = 6;
const PLAYER_R = 0.5;
const COIN_R = 0.4;
const SPEED = 9;
const SEED = 12345;

// ---------- seeded random ----------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- DOM ----------
const canvas = document.getElementById("app") as HTMLCanvasElement;

const hud = document.createElement("div");
hud.style.cssText =
  "position:absolute;left:8px;top:8px;padding:4px 8px;background:rgba(0,0,0,0.5);" +
  "font:14px/1.4 system-ui,sans-serif;color:#fff;pointer-events:none;";
hud.innerHTML =
  'Score: <span id="score">0</span> | Time: <span id="time">30.0</span> | ' +
  'Status: <span id="status">playing</span>';
document.body.appendChild(hud);
const scoreEl = document.getElementById("score") as HTMLElement;
const timeEl = document.getElementById("time") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;

// ---------- three.js scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.setClearColor(0x101820);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 100);
camera.position.set(0, 16, 7);
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(4, 10, 6);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(HALF_W * 2, HALF_H * 2),
  new THREE.MeshStandardMaterial({ color: 0x2d3e50 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const border = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(HALF_W * 2, 0.4, HALF_H * 2)),
  new THREE.LineBasicMaterial({ color: 0x88aacc }),
);
scene.add(border);

const playerMesh = new THREE.Mesh(
  new THREE.SphereGeometry(PLAYER_R, 24, 16),
  new THREE.MeshStandardMaterial({ color: 0x3fa7ff }),
);
scene.add(playerMesh);

const coinGeo = new THREE.CylinderGeometry(COIN_R, COIN_R, 0.12, 20);
coinGeo.rotateX(Math.PI / 2);
const coinMat = new THREE.MeshStandardMaterial({
  color: 0xffd23f,
  emissive: 0x554400,
  metalness: 0.5,
  roughness: 0.4,
});
const coinMeshes: THREE.Mesh[] = [];
for (let i = 0; i < COIN_COUNT; i++) {
  const m = new THREE.Mesh(coinGeo, coinMat);
  scene.add(m);
  coinMeshes.push(m);
}

// ---------- game state ----------
let rand = mulberry32(SEED);
let px = 0;
let pz = 0;
let score = 0;
let frames = 0; // simulated frames elapsed this round
let status: Status = "playing";
let resumeStatus: Status = "playing"; // status to return to when unpausing
const coins: { x: number; z: number }[] = [];

const keys = new Set<string>();

function randomCoinPos(): { x: number; z: number } {
  for (let tries = 0; tries < 50; tries++) {
    const x = (rand() * 2 - 1) * (HALF_W - 1);
    const z = (rand() * 2 - 1) * (HALF_H - 1);
    if (Math.hypot(x - px, z - pz) > PLAYER_R + COIN_R + 1) return { x, z };
  }
  return { x: (rand() * 2 - 1) * (HALF_W - 1), z: (rand() * 2 - 1) * (HALF_H - 1) };
}

function resetGame(): void {
  rand = mulberry32(SEED);
  px = 0;
  pz = 0;
  score = 0;
  frames = 0;
  status = "playing";
  resumeStatus = "playing";
  coins.length = 0;
  for (let i = 0; i < COIN_COUNT; i++) coins.push(randomCoinPos());
}

function inputAxis(): { x: number; z: number } {
  let x = 0;
  let z = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) x -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) x += 1;
  if (keys.has("ArrowUp") || keys.has("KeyW")) z -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) z += 1;
  if (x !== 0 && z !== 0) {
    x *= Math.SQRT1_2;
    z *= Math.SQRT1_2;
  }
  return { x, z };
}

function simStep(): void {
  if (status !== "playing") return;

  const a = inputAxis();
  px = Math.min(HALF_W - PLAYER_R, Math.max(-(HALF_W - PLAYER_R), px + a.x * SPEED * DT));
  pz = Math.min(HALF_H - PLAYER_R, Math.max(-(HALF_H - PLAYER_R), pz + a.z * SPEED * DT));

  const reach = PLAYER_R + COIN_R;
  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    if (Math.hypot(c.x - px, c.z - pz) <= reach) {
      score++;
      coins[i] = randomCoinPos();
    }
  }

  frames++;
  if (score >= WIN_SCORE) {
    status = "won";
  } else if (frames >= ROUND_FRAMES) {
    status = "lost";
  }
}

function step(n: number): void {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  for (let i = 0; i < count; i++) simStep();
  updateHud();
}

function state(): { score: number; status: Status; time: number } {
  return { score, status, time: frames * DT };
}

function togglePause(): void {
  if (status === "paused") {
    status = resumeStatus;
  } else if (status === "playing") {
    resumeStatus = status;
    status = "paused";
  }
  updateHud();
}

function restart(): void {
  resetGame();
  updateHud();
}

function updateHud(): void {
  scoreEl.textContent = String(score);
  timeEl.textContent = Math.max(0, 30 - frames * DT).toFixed(1);
  statusEl.textContent = status;
}

// ---------- input ----------
const GAME_KEYS = new Set([
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyW", "KeyA", "KeyS", "KeyD",
]);

window.addEventListener("keydown", (e) => {
  if (GAME_KEYS.has(e.code)) {
    keys.add(e.code);
    e.preventDefault();
  } else if (e.code === "KeyP") {
    if (!e.repeat) togglePause();
  } else if (e.code === "KeyR") {
    if (!e.repeat) restart();
  }
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
});
window.addEventListener("blur", () => keys.clear());

// ---------- render ----------
function render(): void {
  playerMesh.position.set(px, PLAYER_R, pz);
  const t = performance.now() / 1000;
  for (let i = 0; i < coinMeshes.length; i++) {
    const c = coins[i];
    coinMeshes[i].position.set(c.x, COIN_R + 0.05 + Math.sin(t * 3 + i) * 0.05, c.z);
    coinMeshes[i].rotation.y = t * 2 + i;
  }
  renderer.render(scene, camera);
}

// ---------- main loop ----------
resetGame();
updateHud();
window.__EVAL__ = { state, step };

let last = performance.now();
let acc = 0;
let ready = false;

function frame(now: number): void {
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  acc += dt;
  let ran = false;
  while (acc >= DT) {
    simStep();
    acc -= DT;
    ran = true;
  }
  if (ran) updateHud();
  render();
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
