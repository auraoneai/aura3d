// Mini-golf hole runtime.
//
// The scene is authored declaratively through the @aura3d/engine public API
// (see scene-plan.ts). The engine's public surface bakes object transforms at
// creation and only re-reads the camera per frame, so it cannot move a physics
// ball, raycast pointer input, follow a moving target, or keep a score on its
// own. We therefore realise the engine's snapshot on the engine's own rendering
// substrate (Three.js, the engine's sole runtime dependency) and add those
// interactive behaviours here. Every position, size, colour and the camera
// framing still come from the engine snapshot -- it is the single source of
// truth.

import * as THREE from "three";
import { SNAPSHOT, LAYOUT, BOUNDS, type AuraVecLike } from "./scene-plan";

// ---------------------------------------------------------------------------
// DOM scaffold: canvas + HUD
// ---------------------------------------------------------------------------

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = "";

const style = document.createElement("style");
style.textContent = `
  html, body, #app { margin: 0; height: 100%; width: 100%; overflow: hidden; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  #golf-canvas { display: block; width: 100vw; height: 100vh; cursor: crosshair; touch-action: none; }
  .hud {
    position: fixed; left: 16px; top: 16px; z-index: 10;
    background: rgba(8, 22, 14, 0.72); color: #eafff0;
    border: 1px solid rgba(180, 240, 200, 0.35); border-radius: 12px;
    padding: 12px 16px; min-width: 190px; backdrop-filter: blur(6px);
    box-shadow: 0 6px 22px rgba(0,0,0,0.35); user-select: none; pointer-events: none;
  }
  .hud h1 { margin: 0 0 6px; font-size: 15px; letter-spacing: 0.3px; }
  .hud .row { display: flex; justify-content: space-between; gap: 18px; font-size: 14px; line-height: 1.7; }
  .hud .row b { font-variant-numeric: tabular-nums; }
  .hud .status { margin-top: 8px; font-size: 13px; color: #b8f5cf; min-height: 18px; }
  .meter { margin-top: 10px; height: 8px; border-radius: 6px; background: rgba(255,255,255,0.15); overflow: hidden; }
  .meter > div { height: 100%; width: 0%; background: linear-gradient(90deg,#7CFFB2,#ffd43b,#ff6b6b); transition: width 0.04s linear; }
  .hint {
    position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 10;
    background: rgba(8, 22, 14, 0.62); color: #dffbe9; font-size: 13px;
    padding: 8px 14px; border-radius: 999px; border: 1px solid rgba(180,240,200,0.28);
    pointer-events: none; user-select: none;
  }
  .reset-btn {
    position: fixed; right: 16px; top: 16px; z-index: 11;
    background: rgba(8,22,14,0.72); color: #eafff0; border: 1px solid rgba(180,240,200,0.35);
    border-radius: 10px; padding: 9px 14px; font-size: 13px; cursor: pointer;
  }
  .reset-btn:hover { background: rgba(20,48,30,0.85); }
`;
document.head.appendChild(style);

const canvas = document.createElement("canvas");
canvas.id = "golf-canvas";
app.appendChild(canvas);

const hud = document.createElement("div");
hud.className = "hud";
hud.innerHTML = `
  <h1>⛳ Mini-Golf — Hole 1</h1>
  <div class="row"><span>Strokes</span><b id="strokes">0</b></div>
  <div class="row"><span>Par</span><b id="par">${LAYOUT.par}</b></div>
  <div class="row"><span>Best</span><b id="best">—</b></div>
  <div class="status" id="status">Click &amp; drag toward the hole, release to putt.</div>
  <div class="meter"><div id="meter-fill"></div></div>
`;
app.appendChild(hud);

const resetBtn = document.createElement("button");
resetBtn.className = "reset-btn";
resetBtn.textContent = "↻ Reset";
app.appendChild(resetBtn);

const hint = document.createElement("div");
hint.className = "hint";
hint.textContent = "Drag from the ball to aim · longer drag = more power · R to reset";
app.appendChild(hint);

const el = {
  strokes: hud.querySelector<HTMLElement>("#strokes")!,
  best: hud.querySelector<HTMLElement>("#best")!,
  status: hud.querySelector<HTMLElement>("#status")!,
  meterFill: hud.querySelector<HTMLElement>("#meter-fill")!,
};

// ---------------------------------------------------------------------------
// Renderer / scene / camera (Three.js — the engine's rendering substrate)
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const threeScene = new THREE.Scene();
threeScene.background = new THREE.Color(SNAPSHOT.background);
threeScene.fog = new THREE.Fog(new THREE.Color(SNAPSHOT.background), 26, 48);

const cameraObj = new THREE.PerspectiveCamera(
  SNAPSHOT.camera.fov ?? 50,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);

// ---------------------------------------------------------------------------
// Realise the engine snapshot into Three.js meshes
// ---------------------------------------------------------------------------

function toVec3(v: AuraVecLike | undefined, fallback: [number, number, number]) {
  if (!v) return fallback;
  return [v[0] ?? fallback[0], v[1] ?? fallback[1], v[2] ?? fallback[2]] as const;
}

let ballMesh!: THREE.Mesh;

// A subtle mowing-stripe texture for the green, generated procedurally.
function makeGreenTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  const base = new THREE.Color(LAYOUT.green.color);
  const dark = base.clone().multiplyScalar(0.82);
  const stripes = 14;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = (i % 2 === 0 ? base : dark).getStyle();
    ctx.fillRect(0, (i * c.height) / stripes, c.width, c.height / stripes + 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function buildFromSnapshot() {
  for (const node of SNAPSHOT.nodes) {
    if (node.kind === "light") {
      const color = new THREE.Color((node.color as string) ?? "#ffffff");
      if (node.light === "ambient") {
        threeScene.add(
          new THREE.HemisphereLight(color, new THREE.Color("#22331f"), node.intensity * 1.6),
        );
      } else if (node.light === "directional") {
        const dir = new THREE.DirectionalLight(color, node.intensity * 2.2);
        const p = toVec3(node.position, [6, 12, 8]);
        dir.position.set(p[0], p[1], p[2]);
        dir.castShadow = true;
        dir.shadow.mapSize.set(2048, 2048);
        const d = 16;
        dir.shadow.camera.left = -d;
        dir.shadow.camera.right = d;
        dir.shadow.camera.top = d;
        dir.shadow.camera.bottom = -d;
        dir.shadow.camera.near = 1;
        dir.shadow.camera.far = 60;
        dir.shadow.bias = -0.0005;
        threeScene.add(dir);
      } else if (node.light === "point") {
        const pl = new THREE.PointLight(color, node.intensity * 12, 40);
        const p = toVec3(node.position, [0, 6, 0]);
        pl.position.set(p[0], p[1], p[2]);
        threeScene.add(pl);
      }
      continue;
    }

    if (node.kind !== "primitive") continue;

    const spec = node.material ?? {};
    const matColor = new THREE.Color((spec.color as string) ?? "#cccccc");
    const material = new THREE.MeshStandardMaterial({
      color: matColor,
      roughness: spec.roughness ?? 0.7,
      metalness: spec.metallic ?? 0,
    });

    const pos = toVec3(node.position, [0, 0, 0]);
    const size = node.size as AuraVecLike | number | undefined;
    let mesh: THREE.Mesh;

    if (node.primitive === "plane") {
      const s = size as AuraVecLike | undefined;
      const w = (s?.[0] as number) ?? LAYOUT.green.width;
      const d = (s?.[2] as number) ?? LAYOUT.green.depth;
      const geo = new THREE.PlaneGeometry(w, d);
      material.map = makeGreenTexture();
      material.color = new THREE.Color("#ffffff");
      mesh = new THREE.Mesh(geo, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.receiveShadow = true;
    } else if (node.primitive === "box") {
      const s = size as AuraVecLike | undefined;
      const geo = new THREE.BoxGeometry(
        (s?.[0] as number) ?? 1,
        (s?.[1] as number) ?? 1,
        (s?.[2] as number) ?? 1,
      );
      mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else {
      // sphere — size is a numeric diameter
      const diameter = typeof size === "number" ? size : LAYOUT.ball.radius * 2;
      const geo = new THREE.SphereGeometry(diameter / 2, 48, 32);
      mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
    }

    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.name = node.name ?? node.primitive;
    threeScene.add(mesh);

    if (node.name === "ball") ballMesh = mesh;
  }
}

buildFromSnapshot();

// ---------------------------------------------------------------------------
// The cup (hole) + flag — decorative target, added on the engine substrate.
// ---------------------------------------------------------------------------

const holePos = new THREE.Vector3(...LAYOUT.hole.position);

const cupGroup = new THREE.Group();
const cupRim = new THREE.Mesh(
  new THREE.RingGeometry(LAYOUT.hole.radius * 0.78, LAYOUT.hole.radius, 48),
  new THREE.MeshBasicMaterial({ color: "#f1f3f5", side: THREE.DoubleSide }),
);
cupRim.rotation.x = -Math.PI / 2;
cupRim.position.set(holePos.x, 0.012, holePos.z);
cupGroup.add(cupRim);

const cupHole = new THREE.Mesh(
  new THREE.CircleGeometry(LAYOUT.hole.radius * 0.78, 48),
  new THREE.MeshStandardMaterial({ color: "#05140a", roughness: 1 }),
);
cupHole.rotation.x = -Math.PI / 2;
cupHole.position.set(holePos.x, 0.01, holePos.z);
cupGroup.add(cupHole);

// Flag.
const pole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.035, 2.2, 12),
  new THREE.MeshStandardMaterial({ color: "#dee2e6", metalness: 0.4, roughness: 0.5 }),
);
pole.position.set(holePos.x, 1.1, holePos.z);
pole.castShadow = true;
cupGroup.add(pole);

const flag = new THREE.Mesh(
  new THREE.PlaneGeometry(0.8, 0.45),
  new THREE.MeshStandardMaterial({ color: "#ff5252", side: THREE.DoubleSide, roughness: 0.7 }),
);
flag.position.set(holePos.x + 0.4, 1.95, holePos.z);
flag.castShadow = true;
cupGroup.add(flag);

threeScene.add(cupGroup);

// ---------------------------------------------------------------------------
// Aim indicator (arrow on the ground)
// ---------------------------------------------------------------------------

const aimGroup = new THREE.Group();
aimGroup.visible = false;

const aimLine = new THREE.Mesh(
  new THREE.PlaneGeometry(0.12, 1),
  new THREE.MeshBasicMaterial({ color: "#ffe066", transparent: true, opacity: 0.9 }),
);
aimLine.rotation.x = -Math.PI / 2;
aimGroup.add(aimLine);

const aimHead = new THREE.Mesh(
  new THREE.ConeGeometry(0.26, 0.5, 16),
  new THREE.MeshBasicMaterial({ color: "#ffd43b" }),
);
aimHead.rotation.x = Math.PI / 2; // cone points along +local-Z
aimGroup.add(aimHead);

threeScene.add(aimGroup);

// ---------------------------------------------------------------------------
// Game state + physics
// ---------------------------------------------------------------------------

const MAX_POWER = 17; // units/sec launch speed at full drag
const MAX_DRAG = 5.5; // world units of drag for full power
const FRICTION = 1.9; // rolling deceleration coefficient (per second)
const STOP_SPEED = 0.22; // below this the ball is considered at rest
const WALL_RESTITUTION = 0.72;

type Phase = "ready" | "aiming" | "rolling" | "sunk";

const state = {
  phase: "ready" as Phase,
  pos: new THREE.Vector2(LAYOUT.ball.start[0], LAYOUT.ball.start[2]),
  vel: new THREE.Vector2(0, 0),
  strokes: 0,
  best: null as number | null,
  aimDir: new THREE.Vector2(0, -1),
  aimPower: 0, // 0..1
};

function resetBall(full: boolean) {
  state.pos.set(LAYOUT.ball.start[0], LAYOUT.ball.start[2]);
  state.vel.set(0, 0);
  state.aimPower = 0;
  state.phase = "ready";
  ballMesh.position.set(LAYOUT.ball.start[0], LAYOUT.ball.radius, LAYOUT.ball.start[2]);
  ballMesh.quaternion.identity();
  ballMesh.visible = true;
  aimGroup.visible = false;
  if (full) {
    state.strokes = 0;
    setStatus("Click & drag toward the hole, release to putt.");
  }
  updateHud();
}

function setStatus(text: string) {
  el.status.textContent = text;
}

function updateHud() {
  el.strokes.textContent = String(state.strokes);
  el.best.textContent = state.best === null ? "—" : String(state.best);
  el.meterFill.style.width = `${Math.round(state.aimPower * 100)}%`;
}

// ---------------------------------------------------------------------------
// Pointer aiming + shooting
// ---------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function pointerToGround(clientX: number, clientY: number): THREE.Vector3 | null {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, cameraObj);
  const hit = new THREE.Vector3();
  return raycaster.ray.intersectPlane(groundPlane, hit) ? hit : null;
}

function onPointerDown(ev: PointerEvent) {
  if (state.phase !== "ready") return;
  const g = pointerToGround(ev.clientX, ev.clientY);
  if (!g) return;
  state.phase = "aiming";
  canvas.setPointerCapture(ev.pointerId);
  updateAim(g);
}

function updateAim(ground: THREE.Vector3) {
  const dx = ground.x - state.pos.x;
  const dz = ground.z - state.pos.y;
  const drag = Math.hypot(dx, dz);
  if (drag < 1e-3) {
    state.aimPower = 0;
    aimGroup.visible = false;
    updateHud();
    return;
  }
  state.aimDir.set(dx / drag, dz / drag);
  state.aimPower = Math.min(drag / MAX_DRAG, 1);

  // Orient & size the ground arrow from the ball toward the aim direction.
  const len = 1 + state.aimPower * 4;
  const angle = Math.atan2(state.aimDir.x, state.aimDir.y); // rotate +Z onto dir
  aimGroup.position.set(state.pos.x, 0.02, state.pos.y);
  aimGroup.rotation.y = angle;
  aimLine.scale.set(1, len, 1);
  aimLine.position.set(0, 0, len / 2);
  aimHead.position.set(0, 0, len + 0.05);
  aimGroup.visible = true;
  setStatus(`Power ${Math.round(state.aimPower * 100)}%`);
  updateHud();
}

function onPointerMove(ev: PointerEvent) {
  if (state.phase !== "aiming") return;
  const g = pointerToGround(ev.clientX, ev.clientY);
  if (g) updateAim(g);
}

function onPointerUp(ev: PointerEvent) {
  if (state.phase !== "aiming") return;
  canvas.releasePointerCapture?.(ev.pointerId);
  aimGroup.visible = false;
  if (state.aimPower < 0.04) {
    state.phase = "ready";
    setStatus("Too soft — drag farther to add power.");
    return;
  }
  const speed = state.aimPower * MAX_POWER;
  state.vel.set(state.aimDir.x * speed, state.aimDir.y * speed);
  state.phase = "rolling";
  state.strokes += 1;
  state.aimPower = 0;
  setStatus("Rolling…");
  updateHud();
}

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);

resetBtn.addEventListener("click", () => resetBall(true));
window.addEventListener("keydown", (e) => {
  if (e.key === "r" || e.key === "R") resetBall(true);
});

// ---------------------------------------------------------------------------
// Collision: reflect the ball off rails (bounds) and the obstacle AABB.
// ---------------------------------------------------------------------------

function collideBounds() {
  if (state.pos.x < BOUNDS.minX) {
    state.pos.x = BOUNDS.minX;
    state.vel.x = Math.abs(state.vel.x) * WALL_RESTITUTION;
  } else if (state.pos.x > BOUNDS.maxX) {
    state.pos.x = BOUNDS.maxX;
    state.vel.x = -Math.abs(state.vel.x) * WALL_RESTITUTION;
  }
  if (state.pos.y < BOUNDS.minZ) {
    state.pos.y = BOUNDS.minZ;
    state.vel.y = Math.abs(state.vel.y) * WALL_RESTITUTION;
  } else if (state.pos.y > BOUNDS.maxZ) {
    state.pos.y = BOUNDS.maxZ;
    state.vel.y = -Math.abs(state.vel.y) * WALL_RESTITUTION;
  }
}

// Obstacle as an axis-aligned box on the XZ plane (it does not rotate),
// inflated by the ball radius.
const obSize = LAYOUT.obstacle.size;
const obPos = LAYOUT.obstacle.position;
const obstacle = {
  minX: obPos[0] - obSize[0] / 2 - LAYOUT.ball.radius,
  maxX: obPos[0] + obSize[0] / 2 + LAYOUT.ball.radius,
  minZ: obPos[2] - obSize[2] / 2 - LAYOUT.ball.radius,
  maxZ: obPos[2] + obSize[2] / 2 + LAYOUT.ball.radius,
};

function collideObstacle() {
  const x = state.pos.x;
  const z = state.pos.y;
  if (x < obstacle.minX || x > obstacle.maxX || z < obstacle.minZ || z > obstacle.maxZ) {
    return; // outside the inflated box
  }
  // Inside: push out along the axis of least penetration and reflect.
  const penLeft = x - obstacle.minX;
  const penRight = obstacle.maxX - x;
  const penNear = obstacle.maxZ - z; // toward +Z (tee side)
  const penFar = z - obstacle.minZ; // toward -Z (hole side)
  const minPen = Math.min(penLeft, penRight, penNear, penFar);
  if (minPen === penLeft) {
    state.pos.x = obstacle.minX;
    state.vel.x = -Math.abs(state.vel.x) * WALL_RESTITUTION;
  } else if (minPen === penRight) {
    state.pos.x = obstacle.maxX;
    state.vel.x = Math.abs(state.vel.x) * WALL_RESTITUTION;
  } else if (minPen === penNear) {
    state.pos.y = obstacle.maxZ;
    state.vel.y = Math.abs(state.vel.y) * WALL_RESTITUTION;
  } else {
    state.pos.y = obstacle.minZ;
    state.vel.y = -Math.abs(state.vel.y) * WALL_RESTITUTION;
  }
}

// ---------------------------------------------------------------------------
// Follow camera
// ---------------------------------------------------------------------------

const camTarget = new THREE.Vector3(...LAYOUT.ball.start);
const camPos = new THREE.Vector3(
  ...toVec3(SNAPSHOT.camera.position as AuraVecLike, [0, 6.5, 15]),
);
const toHole = new THREE.Vector2(
  holePos.x - LAYOUT.ball.start[0],
  holePos.z - LAYOUT.ball.start[2],
).normalize();

function updateCamera(dt: number) {
  // Behind-the-ball direction: prefer aim while aiming, motion while rolling,
  // otherwise look down the line toward the hole.
  let dir: THREE.Vector2;
  if (state.phase === "aiming" && state.aimPower > 0.01) {
    dir = state.aimDir.clone();
  } else if (state.phase === "rolling" && state.vel.length() > 0.4) {
    dir = state.vel.clone().normalize();
  } else {
    dir = toHole.clone();
  }

  const dist = 8.5;
  const height = 5.0;
  const desired = new THREE.Vector3(
    state.pos.x - dir.x * dist,
    height,
    state.pos.y - dir.y * dist,
  );
  const lookAt = new THREE.Vector3(state.pos.x, LAYOUT.ball.radius + 0.3, state.pos.y);

  const k = 1 - Math.exp(-6 * dt); // frame-rate independent smoothing
  camPos.lerp(desired, k);
  camTarget.lerp(lookAt, k);
  cameraObj.position.copy(camPos);
  cameraObj.lookAt(camTarget);
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const rollAxis = new THREE.Vector3();
let last = performance.now();

function sink() {
  state.phase = "sunk";
  state.vel.set(0, 0);
  aimGroup.visible = false;
  // Drop the ball into the cup.
  ballMesh.position.set(holePos.x, -LAYOUT.ball.radius * 0.6, holePos.z);
  if (state.best === null || state.strokes < state.best) state.best = state.strokes;
  const verdict =
    state.strokes === 1
      ? "Hole in one! 🏆"
      : state.strokes <= LAYOUT.par
        ? `In the hole in ${state.strokes} — ${state.strokes < LAYOUT.par ? "under par!" : "par!"}`
        : `Sunk in ${state.strokes}. Press R to try again.`;
  setStatus(verdict);
  updateHud();
  // Auto-tee up a fresh ball after a short celebration.
  window.setTimeout(() => {
    if (state.phase === "sunk") resetBall(false);
  }, 2200);
}

function tick(now: number) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;

  if (state.phase === "rolling") {
    // Integrate.
    state.pos.x += state.vel.x * dt;
    state.pos.y += state.vel.y * dt;

    collideObstacle();
    collideBounds();

    // Rolling friction (exponential decay toward zero).
    state.vel.multiplyScalar(Math.exp(-FRICTION * dt));

    // Hole capture: near the cup and slow enough → sink.
    const distToHole = Math.hypot(state.pos.x - holePos.x, state.pos.y - holePos.z);
    const speed = state.vel.length();
    if (distToHole < LAYOUT.hole.captureRadius && speed < MAX_POWER * 0.5) {
      sink();
    } else if (speed < STOP_SPEED) {
      state.vel.set(0, 0);
      state.phase = "ready";
      setStatus(distToHole < 1.4 ? "So close! Tap it in." : "Line up your next putt.");
    }

    // Roll the ball visually based on travel.
    const travel = speed * dt;
    if (travel > 1e-5) {
      const move = new THREE.Vector3(state.vel.x, 0, state.vel.y).normalize();
      rollAxis.set(move.z, 0, -move.x); // perpendicular, horizontal
      ballMesh.rotateOnWorldAxis(rollAxis, travel / LAYOUT.ball.radius);
    }
  }

  // Sync ball mesh position from physics state (unless it has been sunk).
  if (state.phase !== "sunk") {
    ballMesh.position.set(state.pos.x, LAYOUT.ball.radius, state.pos.y);
  }

  updateCamera(dt);

  // Idle flag flutter.
  flag.rotation.z = Math.sin(now * 0.004) * 0.12;

  renderer.render(threeScene, cameraObj);
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Resize + start
// ---------------------------------------------------------------------------

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  cameraObj.aspect = w / h;
  cameraObj.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

resetBall(true);
requestAnimationFrame(tick);

// Tiny debug handle (useful for headless health checks).
(window as unknown as { __golf?: unknown }).__golf = { state, snapshot: SNAPSHOT };
