import * as THREE from "three";

type Status = "playing" | "paused" | "won" | "lost";

declare global {
  interface Window {
    __EVAL__: {
      state: () => { score: number; status: Status; time: number };
      step: (frames: number) => void;
    };
    __EVAL_READY__: boolean;
  }
}

// ---------- constants ----------
const DT = 1 / 60;
const ROUND_FRAMES = 30 * 60; // 30 seconds
const WIN_SCORE = 15;
const COIN_COUNT = 10;
const HALF_W = 8;
const HALF_H = 4.5;
const PLAYER_R = 0.5;
const COIN_R = 0.4;
const SPEED = 7;
const SEED = 1234567;

// ---------- seeded RNG (mulberry32) ----------
let rngState = SEED >>> 0;
function rand(): number {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- HUD ----------
function makeHud(): { score: HTMLElement; time: HTMLElement; status: HTMLElement } {
  const hud = document.createElement("div");
  hud.id = "hud";
  hud.style.cssText = "padding:6px 8px;font:14px/1.4 system-ui,sans-serif;color:#fff;";
  hud.innerHTML =
    'Score: <span id="score">0</span> &nbsp; Time: <span id="time">30.0</span> &nbsp; Status: <span id="status">playing</span>' +
    " &nbsp; <small>WASD/arrows move, P pause, R restart</small>";
  document.body.appendChild(hud);
  return {
    score: hud.querySelector("#score") as HTMLElement,
    time: hud.querySelector("#time") as HTMLElement,
    status: hud.querySelector("#status") as HTMLElement,
  };
}
const hud = makeHud();

// ---------- three.js scene ----------
const canvas = document.getElementById("app") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.setClearColor(0x101820);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 640 / 360, 0.1, 100);
camera.position.set(0, 17, 6);
camera.lookAt(0, 0, 0.3);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(4, 10, 5);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(HALF_W * 2, HALF_H * 2),
  new THREE.MeshStandardMaterial({ color: 0x2b3a4a }),
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
  new THREE.MeshStandardMaterial({ color: 0x40c0ff }),
);
scene.add(playerMesh);

const coinGeo = new THREE.CylinderGeometry(COIN_R, COIN_R, 0.12, 20);
coinGeo.rotateX(Math.PI / 2);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.4, roughness: 0.4 });

// ---------- game state ----------
const player = { x: 0, z: 0 };
const coins: { x: number; z: number; mesh: THREE.Mesh }[] = [];
let score = 0;
let frames = 0; // elapsed simulated fixed steps
let paused = false;
let finished: "won" | "lost" | null = null;
const keys = new Set<string>();

function spawnPos(): { x: number; z: number } {
  const mx = HALF_W - 0.8;
  const mz = HALF_H - 0.8;
  for (let i = 0; i < 50; i++) {
    const x = (rand() * 2 - 1) * mx;
    const z = (rand() * 2 - 1) * mz;
    if (Math.hypot(x - player.x, z - player.z) < PLAYER_R + COIN_R + 0.8) continue;
    if (coins.some((c) => Math.hypot(x - c.x, z - c.z) < COIN_R * 3)) continue;
    return { x, z };
  }
  return { x: (rand() * 2 - 1) * mx, z: (rand() * 2 - 1) * mz };
}

function placeCoin(c: { x: number; z: number; mesh: THREE.Mesh }): void {
  const p = spawnPos();
  c.x = p.x;
  c.z = p.z;
  c.mesh.position.set(p.x, COIN_R + 0.1, p.z);
}

function resetGame(): void {
  rngState = SEED >>> 0;
  player.x = 0;
  player.z = 0;
  score = 0;
  frames = 0;
  paused = false;
  finished = null;
  // keep coin meshes, re-place deterministically
  while (coins.length < COIN_COUNT) {
    const mesh = new THREE.Mesh(coinGeo, coinMat);
    scene.add(mesh);
    coins.push({ x: 0, z: 0, mesh });
  }
  // place sequentially so spacing checks only see already-placed coins
  const placed = coins.splice(0, coins.length);
  for (const c of placed) {
    placeCoin(c);
    coins.push(c);
  }
  syncPlayerMesh();
}

function syncPlayerMesh(): void {
  playerMesh.position.set(player.x, PLAYER_R, player.z);
}

function getStatus(): Status {
  if (finished) return finished;
  return paused ? "paused" : "playing";
}

function tick(): void {
  if (paused || finished) return;

  let dx = 0;
  let dz = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) dx += 1;
  if (keys.has("ArrowUp") || keys.has("KeyW")) dz -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) dz += 1;
  if (dx !== 0 && dz !== 0) {
    dx *= Math.SQRT1_2;
    dz *= Math.SQRT1_2;
  }
  player.x = Math.min(HALF_W - PLAYER_R, Math.max(-HALF_W + PLAYER_R, player.x + dx * SPEED * DT));
  player.z = Math.min(HALF_H - PLAYER_R, Math.max(-HALF_H + PLAYER_R, player.z + dz * SPEED * DT));

  for (const c of coins) {
    if (Math.hypot(c.x - player.x, c.z - player.z) < PLAYER_R + COIN_R) {
      score++;
      placeCoin(c);
    }
  }

  frames++;
  if (score >= WIN_SCORE) finished = "won";
  else if (frames >= ROUND_FRAMES) finished = "lost";
}

function step(n: number): void {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  for (let i = 0; i < count; i++) tick();
  syncPlayerMesh();
  updateHud();
}

function updateHud(): void {
  const t = frames / 60;
  hud.score.textContent = String(score);
  hud.time.textContent = Math.max(0, 30 - t).toFixed(1);
  hud.status.textContent = getStatus();
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
    if (!e.repeat && !finished) paused = !paused;
  } else if (e.code === "KeyR") {
    if (!e.repeat) resetGame();
  }
  updateHud();
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
});
window.addEventListener("blur", () => keys.clear());

// ---------- API ----------
window.__EVAL__ = {
  state: () => ({ score, status: getStatus(), time: frames / 60 }),
  step,
};

// ---------- main loop ----------
resetGame();
updateHud();

let acc = 0;
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= DT) {
    tick();
    acc -= DT;
  }
  const spin = now / 1000;
  for (const c of coins) c.mesh.rotation.y = spin * 2;
  syncPlayerMesh();
  updateHud();
  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
