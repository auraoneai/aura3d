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

// ---- constants ----
const DT = 1 / 60;
const ROUND_SECONDS = 30;
const WIN_SCORE = 15;
const COIN_COUNT = 10;
const HALF = 8; // arena half-size
const PLAYER_R = 0.5;
const COIN_R = 0.4;
const SPEED = 8;
const SEED = 12345;

// ---- seeded random (mulberry32) ----
let rngState = SEED >>> 0;
function rand(): number {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---- game state ----
let score = 0;
let frames = 0; // simulated frames elapsed in the round
let ended: "won" | "lost" | null = null;
let paused = false;
const player = { x: 0, z: 0 };
const coins: { x: number; z: number }[] = [];

function status(): Status {
  if (ended) return ended;
  return paused ? "paused" : "playing";
}

function spawnPoint(): { x: number; z: number } {
  const m = HALF - 0.8;
  for (let i = 0; i < 50; i++) {
    const x = (rand() * 2 - 1) * m;
    const z = (rand() * 2 - 1) * m;
    const far = Math.hypot(x - player.x, z - player.z) > 2.5;
    const clear = coins.every((c) => Math.hypot(c.x - x, c.z - z) > 1.2);
    if (far && clear) return { x, z };
  }
  return { x: (rand() * 2 - 1) * m, z: (rand() * 2 - 1) * m };
}

function resetGame(): void {
  rngState = SEED >>> 0;
  score = 0;
  frames = 0;
  ended = null;
  paused = false;
  player.x = 0;
  player.z = 0;
  coins.length = 0;
  for (let i = 0; i < COIN_COUNT; i++) coins.push(spawnPoint());
}

// ---- input ----
const keys = new Set<string>();
function normKey(e: KeyboardEvent): string {
  switch (e.code) {
    case "ArrowUp": case "KeyW": return "up";
    case "ArrowDown": case "KeyS": return "down";
    case "ArrowLeft": case "KeyA": return "left";
    case "ArrowRight": case "KeyD": return "right";
    case "KeyP": return "pause";
    case "KeyR": return "restart";
  }
  switch (e.key.toLowerCase()) {
    case "arrowup": case "w": return "up";
    case "arrowdown": case "s": return "down";
    case "arrowleft": case "a": return "left";
    case "arrowright": case "d": return "right";
    case "p": return "pause";
    case "r": return "restart";
  }
  return "";
}
window.addEventListener("keydown", (e) => {
  const k = normKey(e);
  if (!k) return;
  e.preventDefault();
  if (k === "pause") {
    if (!e.repeat && !ended) paused = !paused;
    return;
  }
  if (k === "restart") {
    resetGame();
    return;
  }
  keys.add(k);
});
window.addEventListener("keyup", (e) => {
  const k = normKey(e);
  if (k) keys.delete(k);
});
window.addEventListener("blur", () => keys.clear());

// ---- simulation ----
function stepOnce(): void {
  if (ended || paused) return;
  let dx = 0;
  let dz = 0;
  if (keys.has("left")) dx -= 1;
  if (keys.has("right")) dx += 1;
  if (keys.has("up")) dz -= 1;
  if (keys.has("down")) dz += 1;
  if (dx !== 0 || dz !== 0) {
    const len = Math.hypot(dx, dz);
    const lim = HALF - PLAYER_R;
    player.x = Math.max(-lim, Math.min(lim, player.x + (dx / len) * SPEED * DT));
    player.z = Math.max(-lim, Math.min(lim, player.z + (dz / len) * SPEED * DT));
  }
  frames++;

  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    if (Math.hypot(c.x - player.x, c.z - player.z) < PLAYER_R + COIN_R) {
      score++;
      coins.splice(i, 1);
      coins.splice(i, 0, spawnPoint());
      if (score >= WIN_SCORE) {
        ended = "won";
        return;
      }
    }
  }
  if (frames >= ROUND_SECONDS / DT) ended = "lost";
}

function stepFrames(n: number): void {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  for (let i = 0; i < count; i++) stepOnce();
  updateHud();
}

function getState(): { score: number; status: Status; time: number } {
  return { score, status: status(), time: frames * DT };
}

// ---- HUD (DOM) ----
const hud = document.createElement("div");
hud.style.cssText = "padding:6px 10px;font:14px system-ui,sans-serif;display:flex;gap:16px;";
hud.innerHTML =
  'Score: <span id="score">0</span> Time: <span id="time">30.0</span> Status: <span id="status">playing</span>';
document.body.appendChild(hud);
const elScore = document.getElementById("score") as HTMLElement;
const elTime = document.getElementById("time") as HTMLElement;
const elStatus = document.getElementById("status") as HTMLElement;
function updateHud(): void {
  const s = getState();
  elScore.textContent = String(s.score);
  elTime.textContent = Math.max(0, ROUND_SECONDS - s.time).toFixed(1);
  elStatus.textContent = s.status;
}

// ---- rendering ----
const canvas = document.getElementById("app") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.setClearColor(0x14181f);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 100);
camera.position.set(0, 16, 9);
camera.lookAt(0, 0, 0.5);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(5, 12, 6);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(HALF * 2, HALF * 2),
  new THREE.MeshStandardMaterial({ color: 0x2b3a4a }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
scene.add(new THREE.GridHelper(HALF * 2, 16, 0x556677, 0x3a4a5a));

const playerMesh = new THREE.Mesh(
  new THREE.SphereGeometry(PLAYER_R, 24, 16),
  new THREE.MeshStandardMaterial({ color: 0x4fc3f7 }),
);
scene.add(playerMesh);

const coinGeo = new THREE.CylinderGeometry(COIN_R, COIN_R, 0.12, 20);
coinGeo.rotateX(Math.PI / 2);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd54f, metalness: 0.4, roughness: 0.4 });
const coinMeshes: THREE.Mesh[] = [];
for (let i = 0; i < COIN_COUNT; i++) {
  const m = new THREE.Mesh(coinGeo, coinMat);
  coinMeshes.push(m);
  scene.add(m);
}

function syncScene(t: number): void {
  playerMesh.position.set(player.x, PLAYER_R, player.z);
  for (let i = 0; i < coinMeshes.length; i++) {
    const c = coins[i];
    coinMeshes[i].position.set(c.x, 0.6, c.z);
    coinMeshes[i].rotation.y = t * 2 + i;
  }
}

// ---- main loop ----
resetGame();
updateHud();
window.__EVAL__ = { state: getState, step: stepFrames };

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  const elapsed = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!paused && !ended) {
    acc += elapsed;
    while (acc >= DT) {
      stepOnce();
      acc -= DT;
    }
  } else {
    acc = 0;
  }
  updateHud();
  syncScene(now / 1000);
  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
