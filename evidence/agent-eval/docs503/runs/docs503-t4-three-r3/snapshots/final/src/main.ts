import * as THREE from "three";

type Status = "playing" | "paused" | "won" | "lost";

const DT = 1 / 60;
const ROUND_FRAMES = 30 * 60;
const WIN_SCORE = 15;
const COIN_COUNT = 10;
const HALF = 9; // arena half size
const PLAYER_R = 0.5;
const COIN_R = 0.4;
const SPEED = 7;
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

// ---------- DOM HUD ----------
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "display:flex;gap:24px;padding:6px 8px;font:14px system-ui,sans-serif;";
function hudItem(label: string, id: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.append(label + ": ");
  const span = document.createElement("span");
  span.id = id;
  wrap.append(span);
  hud.append(wrap);
  return span;
}
const scoreEl = hudItem("Score", "score");
const timeEl = hudItem("Time left", "time");
const statusEl = hudItem("Status", "status");
const help = document.createElement("div");
help.style.cssText = "padding:0 8px;opacity:.7";
help.textContent = "Move: arrows / WASD. P: pause. R: restart. Collect 15 coins in 30 s.";
document.body.append(hud, help);

// ---------- game state ----------
let rand = mulberry32(SEED);
let score = 0;
let frames = 0;
let paused = false;
let ended: "won" | "lost" | null = null;
const player = { x: 0, z: 0 };
const coins: { x: number; z: number }[] = [];

function spawnCoin(): { x: number; z: number } {
  const m = 1;
  for (let i = 0; i < 50; i++) {
    const x = (rand() * 2 - 1) * (HALF - m);
    const z = (rand() * 2 - 1) * (HALF - m);
    if (Math.hypot(x - player.x, z - player.z) < 3) continue;
    if (coins.some((c) => Math.hypot(x - c.x, z - c.z) < 1.5)) continue;
    return { x, z };
  }
  return { x: (rand() * 2 - 1) * (HALF - m), z: (rand() * 2 - 1) * (HALF - m) };
}

function reset(): void {
  rand = mulberry32(SEED);
  score = 0;
  frames = 0;
  paused = false;
  ended = null;
  player.x = 0;
  player.z = 0;
  coins.length = 0;
  for (let i = 0; i < COIN_COUNT; i++) coins.push(spawnCoin());
}

function status(): Status {
  if (ended) return ended;
  return paused ? "paused" : "playing";
}

// ---------- input ----------
const keys = new Set<string>();
const MOVE_KEYS: Record<string, string> = {
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
};
function keyName(e: KeyboardEvent): string {
  if (e.code in MOVE_KEYS) return e.code;
  switch (e.key) {
    case "ArrowUp": case "ArrowDown": case "ArrowLeft": case "ArrowRight": return e.key;
    case "w": case "W": return "KeyW";
    case "a": case "A": return "KeyA";
    case "s": case "S": return "KeyS";
    case "d": case "D": return "KeyD";
    case "p": case "P": return "KeyP";
    case "r": case "R": return "KeyR";
  }
  return e.code;
}
window.addEventListener("keydown", (e) => {
  const k = keyName(e);
  if (k in MOVE_KEYS) {
    keys.add(MOVE_KEYS[k]);
    e.preventDefault();
  } else if (k === "KeyP") {
    if (!e.repeat && !ended) paused = !paused;
  } else if (k === "KeyR") {
    if (!e.repeat) reset();
  }
});
window.addEventListener("keyup", (e) => {
  const k = keyName(e);
  if (k in MOVE_KEYS) keys.delete(MOVE_KEYS[k]);
});
window.addEventListener("blur", () => keys.clear());

// ---------- simulation ----------
function stepOnce(): void {
  if (ended || paused) return;
  let dx = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0);
  let dz = (keys.has("down") ? 1 : 0) - (keys.has("up") ? 1 : 0);
  const len = Math.hypot(dx, dz);
  if (len > 0) {
    dx /= len;
    dz /= len;
    const lim = HALF - PLAYER_R;
    player.x = Math.max(-lim, Math.min(lim, player.x + dx * SPEED * DT));
    player.z = Math.max(-lim, Math.min(lim, player.z + dz * SPEED * DT));
  }
  frames++;
  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    if (Math.hypot(c.x - player.x, c.z - player.z) < PLAYER_R + COIN_R) {
      score++;
      coins[i] = spawnCoin();
    }
  }
  if (score >= WIN_SCORE) ended = "won";
  else if (frames >= ROUND_FRAMES) ended = "lost";
}

function step(n: number): void {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  for (let i = 0; i < count; i++) stepOnce();
}

function state(): { score: number; status: Status; time: number } {
  return { score, status: status(), time: frames * DT };
}

window.__EVAL__ = { state, step };

// ---------- rendering ----------
const canvas = document.getElementById("app") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10131a);
const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 100);
camera.position.set(0, 20, 9);
camera.lookAt(0, 0, 0.5);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(5, 12, 6);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.BoxGeometry(HALF * 2, 0.4, HALF * 2),
  new THREE.MeshStandardMaterial({ color: 0x2c3a52 }),
);
floor.position.y = -0.2;
scene.add(floor);
scene.add(new THREE.GridHelper(HALF * 2, HALF * 2, 0x56688a, 0x3d4d6b));

const playerMesh = new THREE.Mesh(
  new THREE.SphereGeometry(PLAYER_R, 24, 16),
  new THREE.MeshStandardMaterial({ color: 0x4fc3f7 }),
);
scene.add(playerMesh);

const coinGeo = new THREE.CylinderGeometry(COIN_R, COIN_R, 0.12, 20);
coinGeo.rotateX(Math.PI / 2);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.4, roughness: 0.4 });
const coinMeshes: THREE.Mesh[] = [];
for (let i = 0; i < COIN_COUNT; i++) {
  const m = new THREE.Mesh(coinGeo, coinMat);
  scene.add(m);
  coinMeshes.push(m);
}

function syncHud(): void {
  const s = state();
  scoreEl.textContent = String(s.score);
  timeEl.textContent = Math.max(0, 30 - s.time).toFixed(1);
  statusEl.textContent = s.status;
}

let last = performance.now();
let acc = 0;
let ready = false;

function frame(now: number): void {
  requestAnimationFrame(frame);
  acc += Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  while (acc >= DT) {
    stepOnce();
    acc -= DT;
  }
  playerMesh.position.set(player.x, PLAYER_R, player.z);
  for (let i = 0; i < coinMeshes.length; i++) {
    const m = coinMeshes[i];
    m.position.set(coins[i].x, 0.6, coins[i].z);
    m.rotation.y = now / 400 + i;
  }
  syncHud();
  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
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

reset();
syncHud();
requestAnimationFrame(frame);
