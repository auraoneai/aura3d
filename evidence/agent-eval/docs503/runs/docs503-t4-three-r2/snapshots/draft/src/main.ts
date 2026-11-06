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

const DT = 1 / 60;
const ROUND_FRAMES = 30 * 60;
const WIN_SCORE = 15;
const COIN_COUNT = 10;
const HALF_W = 8;
const HALF_D = 5;
const PLAYER_R = 0.5;
const COIN_R = 0.35;
const SPEED = 6;
const SEED = 12345;

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

// ---------- Simulation state ----------
let rng = mulberry32(SEED);
let frame = 0;
let score = 0;
let ended: "playing" | "won" | "lost" = "playing";
let paused = false;
const player = { x: 0, z: 0 };
const coins: { x: number; z: number }[] = [];
const keys = new Set<string>();

function spawnCoin(): { x: number; z: number } {
  const mx = HALF_W - 0.8;
  const mz = HALF_D - 0.8;
  let x = 0;
  let z = 0;
  for (let attempt = 0; attempt < 30; attempt++) {
    x = (rng() * 2 - 1) * mx;
    z = (rng() * 2 - 1) * mz;
    const minD = PLAYER_R + COIN_R + 1.0;
    if (Math.hypot(x - player.x, z - player.z) < minD) continue;
    if (coins.some((c) => Math.hypot(c.x - x, c.z - z) < 1.0)) continue;
    break;
  }
  return { x, z };
}

function resetRound(): void {
  rng = mulberry32(SEED);
  frame = 0;
  score = 0;
  ended = "playing";
  paused = false;
  player.x = 0;
  player.z = 0;
  coins.length = 0;
  for (let i = 0; i < COIN_COUNT; i++) coins.push(spawnCoin());
}

function stepOne(): void {
  if (paused || ended !== "playing") return;
  frame++;
  let dx = 0;
  let dz = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) dx += 1;
  if (keys.has("ArrowUp") || keys.has("KeyW")) dz -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) dz += 1;
  if (dx !== 0 || dz !== 0) {
    const len = Math.hypot(dx, dz);
    player.x += (dx / len) * SPEED * DT;
    player.z += (dz / len) * SPEED * DT;
    player.x = Math.max(-HALF_W + PLAYER_R, Math.min(HALF_W - PLAYER_R, player.x));
    player.z = Math.max(-HALF_D + PLAYER_R, Math.min(HALF_D - PLAYER_R, player.z));
  }
  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    if (Math.hypot(c.x - player.x, c.z - player.z) < PLAYER_R + COIN_R) {
      score++;
      coins[i] = spawnCoin();
    }
  }
  if (score >= WIN_SCORE) ended = "won";
  else if (frame >= ROUND_FRAMES) ended = "lost";
}

function step(frames: number): void {
  const n = Math.max(0, Math.floor(Number(frames) || 0));
  for (let i = 0; i < n; i++) stepOne();
}

function currentStatus(): Status {
  if (ended !== "playing") return ended;
  return paused ? "paused" : "playing";
}

function state(): { score: number; status: Status; time: number } {
  return { score, status: currentStatus(), time: frame / 60 };
}

// ---------- HUD ----------
function makeHud(): { score: HTMLElement; time: HTMLElement; status: HTMLElement } {
  const hud = document.createElement("div");
  hud.style.cssText = "padding:4px 8px;font:14px/1.4 system-ui,sans-serif;";
  hud.innerHTML =
    'Score: <span id="score">0</span> &nbsp; Time left: <span id="time">30.0</span>s &nbsp; Status: <span id="status">playing</span>' +
    " &nbsp; <small>Move: arrows/WASD, P pause, R restart</small>";
  document.body.appendChild(hud);
  return {
    score: hud.querySelector("#score") as HTMLElement,
    time: hud.querySelector("#time") as HTMLElement,
    status: hud.querySelector("#status") as HTMLElement,
  };
}
const hud = makeHud();

function updateHud(): void {
  const s = state();
  hud.score.textContent = String(s.score);
  hud.time.textContent = Math.max(0, 30 - s.time).toFixed(1);
  hud.status.textContent = s.status;
}

// ---------- Input ----------
const GAME_KEYS = new Set([
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyW", "KeyA", "KeyS", "KeyD",
]);
window.addEventListener("keydown", (e) => {
  if (GAME_KEYS.has(e.code)) {
    keys.add(e.code);
    e.preventDefault();
  } else if (e.code === "KeyP" && !e.repeat) {
    if (ended === "playing") paused = !paused;
  } else if (e.code === "KeyR" && !e.repeat) {
    resetRound();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

// ---------- Rendering ----------
const canvas = document.getElementById("app") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.setClearColor(0x14161c);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 640 / 360, 0.1, 100);
camera.position.set(0, 17, 9);
camera.lookAt(0, 0, 0.5);

scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(4, 10, 6);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.BoxGeometry(HALF_W * 2, 0.4, HALF_D * 2),
  new THREE.MeshStandardMaterial({ color: 0x2f4a66 }),
);
floor.position.y = -0.2;
scene.add(floor);
const grid = new THREE.GridHelper(HALF_W * 2, HALF_W * 2, 0x6688aa, 0x44627f);
grid.scale.z = HALF_D / HALF_W;
grid.position.y = 0.01;
scene.add(grid);

const playerMesh = new THREE.Mesh(
  new THREE.SphereGeometry(PLAYER_R, 24, 16),
  new THREE.MeshStandardMaterial({ color: 0xff5a4f }),
);
scene.add(playerMesh);

const coinGeo = new THREE.CylinderGeometry(COIN_R, COIN_R, 0.1, 20);
coinGeo.rotateX(Math.PI / 2);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.5, roughness: 0.35 });
const coinMeshes: THREE.Mesh[] = [];
for (let i = 0; i < COIN_COUNT; i++) {
  const m = new THREE.Mesh(coinGeo, coinMat);
  scene.add(m);
  coinMeshes.push(m);
}

function syncScene(t: number): void {
  playerMesh.position.set(player.x, PLAYER_R, player.z);
  for (let i = 0; i < coinMeshes.length; i++) {
    const c = coins[i];
    coinMeshes[i].position.set(c.x, 0.6 + Math.sin(t * 3 + i) * 0.05, c.z);
    coinMeshes[i].rotation.y = t * 2 + i;
  }
}

// ---------- Main loop ----------
resetRound();
window.__EVAL__ = { state, step };

let last = performance.now();
let acc = 0;
let readySet = false;
function tick(now: number): void {
  const elapsed = Math.min((now - last) / 1000, 0.25);
  last = now;
  acc += elapsed;
  let guard = 0;
  while (acc >= DT && guard < 15) {
    stepOne();
    acc -= DT;
    guard++;
  }
  if (guard >= 15) acc = 0;
  syncScene(now / 1000);
  updateHud();
  renderer.render(scene, camera);
  if (!readySet) {
    readySet = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
