// Neon Corridor Strike — rebuilt single-path pointer-lock FPS.
// Every URL boots this module. Pure run rules live in ./rules (headless
// fire-kill-win sim); this file owns the scene, E5 raw-pointer look,
// pointer lock, HUD, and evidence. There is no game.fps kit: the hitscan
// is the rules module's ray-vs-target-spheres test.
import {
  camera,
  game,
  groundedRenderedAssetPlacement,
  lights,
  looks,
  material,
  model,
  primitives,
  scene,
  type AuraNodeInput,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
// PRD-09 shared runtime (Blockfall pilot pattern): createGame owns
// mount/lifecycle, the arcade-neon HUD theme, game-sfx-core cues, juice.
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "./aura-assets";
import {
  EYE_HEIGHT,
  MAG_SIZE,
  TARGETS,
  applyLook,
  applyMove,
  createRun,
  eyePosition,
  lookDirection,
  resetRun,
  targetsAlive,
  tickRun,
  tryFire,
  type RunState
} from "./rules";

declare global {
  interface Window {
    __aura3dGameSnapshot?: NeonCorridorEvidence;
  }
}

interface NeonCorridorEvidence {
  readonly framed: boolean;
  readonly frame: number;
  readonly status: string;
  readonly claimLabel: "prototype";
  readonly player: { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly pitch: number };
  readonly shotsFired: number;
  readonly hits: number;
  readonly targetsHit: number;
  readonly kills: number;
  readonly targetsAlive: number;
  readonly targetsTotal: number;
  readonly targets: readonly {
    readonly id: string;
    readonly alive: boolean;
    readonly hp: number;
    readonly position: readonly [number, number, number];
  }[];
  readonly ammo: number;
  readonly reloading: boolean;
  readonly score: number;
  readonly won: boolean;
  readonly resets: number;
  readonly pointerLockRequested: number;
  readonly pointerLockActive: boolean;
  readonly objective: string;
  readonly events: readonly string[];
  readonly look: { readonly id: string; readonly category: string };
  readonly typedAssets: readonly string[];
  readonly drawCalls: number;
  readonly audio: {
    readonly requestedEvents: readonly string[];
    readonly playedEvents: readonly string[];
    readonly playedCueCount: number;
    readonly suppressedCueCount: number;
    readonly contextState: string;
    readonly unlocked: boolean;
  };
  readonly evidence: unknown;
}

const LOOK_ID = "neon-arcade" as const;
const run: RunState = createRun();

const wallScale = groundedRenderedAssetPlacement(assets.quaterniusWallModular, { targetHeight: 3, floorY: 0 }).scale;
const crateScale = groundedRenderedAssetPlacement(assets.quaterniusCubeCrate, { targetMaxDimension: 0.9, floorY: 0 }).scale;
const droneScale = groundedRenderedAssetPlacement(assets.kenneyCraftMiner, { targetMaxDimension: 1.1, floorY: 0 }).scale;

const inputOptions = {
  actions: {
    forward: ["KeyW", "ArrowUp"],
    back: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    sprint: ["ShiftLeft", "ShiftRight"],
    // PointerPrimary is emitted by GameRuntime on pointerdown (LMB fire);
    // KeyJ/KeyF keep fire reachable without pointer lock (headless specs).
    fire: ["PointerPrimary", "KeyJ", "KeyF"],
    reset: ["KeyR"]
  },
  bufferMs: 100
} as const;

const routeEvents = game.eventLog({ label: "neon corridor events", maxEvents: 18 });
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "score", id: "hud:score", label: "score", source: "app-state", valuePath: "appState.score", format: "number", a11yLabel: "score" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

let latestSnapshot: NeonCorridorEvidence | undefined;
let objective = "Drop all five sentry drones. Click to lock aim.";
let pointerLockRequested = 0;
let pointerLockActive = false;
// The click that acquires pointer lock must not also fire: suppress fire
// until that press is released.
let suppressFireUntilRelease = false;
let muzzleUntil = 0;
let sparkUntil = 0;
let sparkPoint: readonly [number, number, number] = [0, -50, 0];
let hitMarkerUntil = 0;
let recoil = 0;
let elapsed = 0;
const flashUntil = new Map<string, number>();
const AUDIO_EVENTS = new Set(["fire", "hit", "kill", "win", "corridor-hum"]);
const requestedAudioEvents = new Set<string>(["corridor-hum"]);
const playedAudioEvents = new Set<string>();

const neonGame = createGame({
  id: "neon-corridor-strike",
  target: "#app",
  diagnostics: { overlay: true, performancePanel: true },
  scene: () => buildScene(),
  input: inputOptions,
  hud: {
    theme: "arcade-neon",
    widgets: [
      { id: "score", kind: "score", anchor: "top-left", label: "SCORE" },
      { id: "targets", kind: "score", anchor: "top-right", label: "SENTRIES LEFT" },
      { id: "objective", kind: "objective", anchor: "bottom", label: "OBJECTIVE" }
    ]
  },
  sound: {
    cues: {
      fire: { id: "fire", asset: { url: sfxUrl("explosion.laser.00") }, volume: 0.5 },
      hit: { id: "hit", asset: { url: sfxUrl("impact.energy.light.00") }, volume: 0.55 },
      kill: { id: "kill", asset: { url: sfxUrl("explosion.small.00") }, volume: 0.7 },
      win: { id: "win", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.8 },
      "corridor-hum": { id: "corridor-hum", asset: { url: sfxUrl("ambience.interior-hum") }, volume: 0.22, loop: true }
    }
  },
  juice: {
    hit: { flash: { color: "#4de8ff", peak: 0.14, ms: 160 }, rumble: { weak: 0.35, ms: 90 } },
    kill: { hitStop: 0.02, shake: 0.18, flash: { color: "#ff9d12", peak: 0.2, ms: 220 } },
    win: { flash: { color: "#70f7c0", peak: 0.26, ms: 420 }, punch: { fovDeg: 2, ms: 300 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: { neonCorridor: () => latestSnapshot ?? { status: "unbound" } }
  }
});
const app = neonGame.app;
const input = neonGame.input;
if (!input) throw new Error("neon-corridor-strike failed to create runtime-owned input.");
// Blockfall template lesson: start() drives booting -> loading -> playing;
// without it the session beacon never leaves "booting".
neonGame.start();
void neonGame.sound?.cue("corridor-hum");

const targetNodes = new Map<string, AuraRuntimeNodeHandle>(
  TARGETS.map((def) => [def.id, app.nodes.require(def.id)])
);
const weaponNode = app.nodes.require("weapon-viewmodel");
const muzzleNode = app.nodes.require("muzzle-flash");
const sparkNode = app.nodes.require("hit-spark");
const hudRoot = createHud();
const crosshair = createCrosshair();
const lockOverlay = createLockOverlay();
bindPointerLock();

// First-person eye: fromSpec pins the spawn pose; per-frame setPose below
// tracks the rules-owned player position and look direction.
app.camera?.use(
  camera.rigs.fromSpec({
    position: [run.x, EYE_HEIGHT, run.z],
    target: [run.x, 1.5, 2],
    fov: 60
  })
);

app.onFrame(({ dt }) => {
  const step = Math.min(dt, 0.05);
  elapsed += step;

  // E5 raw-pointer look (never the 96x-dampened pointerDelta axes): the
  // runtime has already updated owned inputs for this frame, so snapshot
  // pointer dx/dy are this frame's raw pixels (movementX/Y under lock,
  // client delta otherwise — drag-look works unlocked too).
  const pointer = input.snapshot().pointer;
  applyLook(run, pointer.dx, pointer.dy);

  applyMove(
    run,
    {
      forward: (input.held("forward") ? 1 : 0) - (input.held("back") ? 1 : 0),
      strafe: (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0),
      sprint: input.held("sprint")
    },
    step
  );
  tickRun(run, step);

  if (input.pressed("reset")) {
    resetRun(run);
    objective = "Drop all five sentry drones. Click to lock aim.";
    routeEvents.push({ type: "reset", label: "reset" });
  }

  if (suppressFireUntilRelease) {
    if (!input.held("fire")) suppressFireUntilRelease = false;
  } else if (input.held("fire")) {
    fireOnce();
  }

  recoil = Math.max(0, recoil - step * 6);
  renderWorld();
  renderHud();
  publishEvidence();
});

renderWorld();
renderHud();
publishEvidence();

function cueAudio(event: "fire" | "hit" | "kill" | "win"): void {
  requestedAudioEvents.add(event);
  void neonGame.sound?.cue(event);
}

function fireOnce(): void {
  const result = tryFire(run);
  if (!result.fired) return;
  const now = performance.now();
  muzzleUntil = now + 60;
  recoil = 1;
  cueAudio("fire");
  routeEvents.push({ type: "fire", label: `fire:${run.shotsFired}` });
  if (result.hitTargetId) {
    sparkPoint = result.hitPoint ?? sparkPoint;
    sparkUntil = now + 150;
    hitMarkerUntil = now + 160;
    flashUntil.set(result.hitTargetId, now + 140);
    cueAudio("hit");
    neonGame.juice.fire("hit");
    routeEvents.push({ type: "hit", label: `hit:${result.hitTargetId}`, severity: "success" });
  }
  if (result.killedTargetId) {
    targetNodes.get(result.killedTargetId)?.setVisible(false);
    cueAudio("kill");
    neonGame.juice.fire("kill");
    objective = `${targetsAlive(run)} sentries left.`;
    routeEvents.push({ type: "kill", label: `kill:${result.killedTargetId}`, severity: "success" });
  }
  if (result.won) {
    objective = "Corridor clear. Press R to run it again.";
    cueAudio("win");
    neonGame.juice.fire("win");
    routeEvents.push({ type: "win", label: "win", severity: "success" });
    document.exitPointerLock?.();
  }
}

function buildScene() {
  const nodes: AuraNodeInput[] = [
    // Corridor shell: dark deck + ceiling slabs, modular wall panels down
    // both sides, emissive guide strips, crate cover along the lane.
    primitives.box({
      name: "corridor deck",
      size: [6.4, 0.1, 27],
      position: [0, -0.05, -2],
      material: material.pbr({ color: "#11182c", roughness: 0.35, metalness: 0.55 }),
      receiveShadow: true
    }),
    primitives.box({
      name: "corridor ceiling",
      size: [6.4, 0.1, 27],
      position: [0, 3.05, -2],
      material: material.pbr({ color: "#0b0e18", roughness: 0.5, metalness: 0.4 })
    }),
    ...wallPanelNodes(),
    primitives.box({
      name: "guide strip west",
      size: [0.08, 0.08, 26],
      position: [-2.55, 2.55, -2],
      material: material.emissive({ color: "#4de8ff", emissive: "#4de8ff", emissiveIntensity: 1.5 })
    }),
    primitives.box({
      name: "guide strip east",
      size: [0.08, 0.08, 26],
      position: [2.55, 2.55, -2],
      material: material.emissive({ color: "#ff5d7d", emissive: "#ff5d7d", emissiveIntensity: 1.3 })
    }),
    ...crateNodes(),
    ...targetSceneNodes(),
    // Primitive pulse-rifle viewmodel + shot feedback (real nodes, not
    // effects-only): parked under the deck until the frame loop poses them.
    primitives.box({
      name: "pulse rifle viewmodel",
      size: [0.09, 0.15, 0.55],
      position: [0, -50, 0],
      material: material.pbr({ color: "#2a3454", roughness: 0.3, metalness: 0.6, emissive: "#4de8ff", emissiveIntensity: 0.35 })
    }).runtime(game.runtimeNode("weapon-viewmodel", { tags: ["weapon", "runtime"] })),
    primitives.box({
      name: "muzzle flash",
      size: [0.16, 0.16, 0.16],
      position: [0, -50, 0],
      material: material.emissive({ color: "#ff9d12", emissive: "#ff9d12", emissiveIntensity: 2.2 })
    }).runtime(game.runtimeNode("muzzle-flash", { tags: ["fx", "runtime"] })),
    primitives.box({
      name: "hit spark",
      size: [0.22, 0.22, 0.22],
      position: [0, -50, 0],
      material: material.emissive({ color: "#4de8ff", emissive: "#4de8ff", emissiveIntensity: 2 })
    }).runtime(game.runtimeNode("hit-spark", { tags: ["fx", "runtime"] }))
  ];

  // The neon-arcade look supplies the night-interior grade, key light and
  // fog (replacing the trashed scene's outdoor-day TODO); three practicals
  // stage spawn / mid / deep bays in cyan, amber and green.
  return scene()
    .add(looks.preset(LOOK_ID))
    .addMany(nodes)
    .add(lights.point({ name: "spawn practical", position: [0, 2.4, 7], color: "#77d8e5", intensity: 1.6 }))
    .add(lights.point({ name: "mid bay practical", position: [0, 2.4, -2], color: "#ffad63", intensity: 2 }))
    .add(lights.point({ name: "deep bay practical", position: [0, 2.4, -11], color: "#70f7c0", intensity: 1.6 }))
    .camera(camera.perspective({ position: [0, EYE_HEIGHT, 9], target: [0, 1.5, 2], fov: 60 }));
}

function wallPanelNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  // Side walls: 3 m panels rotated to face the lane, z from spawn to exit.
  for (let i = 0; i < 9; i += 1) {
    const z = 9.5 - i * 3;
    nodes.push(
      model(assets.quaterniusWallModular, { name: `west wall ${i}`, castShadow: true })
        .position(-2.9, 0, z)
        .rotate(0, Math.PI / 2, 0)
        .scale(wallScale)
    );
    nodes.push(
      model(assets.quaterniusWallModular, { name: `east wall ${i}`, castShadow: true })
        .position(2.9, 0, z)
        .rotate(0, -Math.PI / 2, 0)
        .scale(wallScale)
    );
  }
  // End walls close the lane behind spawn and past the last sentry.
  for (const x of [-2, 0, 2]) {
    nodes.push(
      model(assets.quaterniusWallModular, { name: `exit wall ${x}`, castShadow: true })
        .position(x, 0, -15.2)
        .scale(wallScale)
    );
    nodes.push(
      model(assets.quaterniusWallModular, { name: `spawn wall ${x}`, castShadow: true })
        .position(x, 0, 11.2)
        .rotate(0, Math.PI, 0)
        .scale(wallScale)
    );
  }
  return nodes;
}

function crateNodes(): AuraNodeInput[] {
  const spots: readonly (readonly [number, number])[] = [
    [-1.9, 5], [1.9, 1], [-1.9, -3.5], [1.9, -7], [-1.9, -10.5], [1.9, -13]
  ];
  return spots.map(([x, z], index) =>
    model(assets.quaterniusCubeCrate, { name: `cover crate ${index}`, castShadow: true })
      .position(x, 0, z)
      .scale(crateScale)
  );
}

function targetSceneNodes(): AuraNodeInput[] {
  return TARGETS.map((def) =>
    model(assets.kenneyCraftMiner, { name: `sentry drone ${def.id}`, castShadow: true })
      .position(def.center[0], def.center[1] - 0.15, def.center[2])
      .rotate(0, Math.PI, 0)
      .scale(droneScale)
      .runtime(game.runtimeNode(def.id, { tags: ["target", "runtime"] }))
  );
}

function renderWorld(): void {
  const now = performance.now();
  const eye = eyePosition(run);
  const dir = lookDirection(run.yaw, run.pitch);
  const target: [number, number, number] = [eye[0] + dir[0], eye[1] + dir[1], eye[2] + dir[2]];
  app.camera?.setPose({ position: [eye[0], eye[1], eye[2]], target, fov: 60 }, { cut: true });

  for (const state of run.targets) {
    const node = targetNodes.get(state.id);
    if (!node) continue;
    if (!state.alive) {
      node.setVisible(false);
      continue;
    }
    const bob = Math.sin(elapsed * 1.4 + state.center[2]) * 0.08;
    const flashing = now < (flashUntil.get(state.id) ?? 0);
    node
      .setVisible(true)
      .setPosition(state.center[0], state.center[1] - 0.15 + bob, state.center[2])
      .setScale(droneScale * (flashing ? 1.22 : 1));
  }

  // Viewmodel rides the eye: forward + right + down, kicking back on fire.
  const right: [number, number, number] = [Math.cos(run.yaw), 0, -Math.sin(run.yaw)];
  const reach = 0.55 - recoil * 0.07;
  weaponNode
    .setVisible(true)
    .setPosition(
      eye[0] + dir[0] * reach + right[0] * 0.22,
      eye[1] + dir[1] * reach - 0.18,
      eye[2] + dir[2] * reach + right[2] * 0.22
    )
    .setRotation(-run.pitch, run.yaw, 0);
  const muzzleLive = now < muzzleUntil;
  muzzleNode
    .setVisible(muzzleLive)
    .setPosition(
      eye[0] + dir[0] * 0.85 + right[0] * 0.22,
      eye[1] + dir[1] * 0.85 - 0.13,
      eye[2] + dir[2] * 0.85 + right[2] * 0.22
    );
  const sparkLive = now < sparkUntil;
  sparkNode.setVisible(sparkLive).setPosition(sparkPoint[0], sparkPoint[1], sparkPoint[2]);
}

function bindPointerLock(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#app canvas");
  if (!canvas) return;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    canvas.focus();
    if (document.pointerLockElement === canvas) return;
    pointerLockRequested += 1;
    suppressFireUntilRelease = true;
    routeEvents.push({ type: "pointer-lock", label: "pointer-lock:requested" });
    try {
      canvas.requestPointerLock();
    } catch {
      // Headless runners may refuse lock synchronously; drag-look and
      // KeyJ fire remain live, and evidence reports the request honestly.
    }
  });
  document.addEventListener("pointerlockchange", () => {
    pointerLockActive = document.pointerLockElement === canvas;
  });
  document.addEventListener("pointerlockerror", () => {
    pointerLockActive = false;
  });
}

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "neon-corridor-hud";
  root.style.cssText = [
    "position:absolute",
    "left:16px",
    "top:16px",
    "z-index:5",
    "min-width:300px",
    "font:600 13px/1.35 Inter, system-ui, sans-serif",
    "color:#f5fbff",
    "background:rgba(8,10,22,0.72)",
    "border:1px solid rgba(77,232,255,0.34)",
    "border-radius:8px",
    "padding:12px",
    "pointer-events:none"
  ].join(";");
  document.body.append(root);
  return root;
}

function createCrosshair(): HTMLElement {
  const el = document.createElement("div");
  el.id = "neon-crosshair";
  el.textContent = "+";
  el.style.cssText = [
    "position:absolute",
    "left:50%",
    "top:50%",
    "transform:translate(-50%,-50%)",
    "z-index:5",
    "font:300 26px/1 monospace",
    "color:#4de8ff",
    "text-shadow:0 0 6px rgba(77,232,255,0.8)",
    "pointer-events:none"
  ].join(";");
  document.body.append(el);
  return el;
}

function createLockOverlay(): HTMLElement {
  const el = document.createElement("div");
  el.id = "neon-lock-overlay";
  el.style.cssText = [
    "position:absolute",
    "left:50%",
    "bottom:28px",
    "transform:translateX(-50%)",
    "z-index:5",
    "font:600 14px/1.3 Inter, system-ui, sans-serif",
    "color:#f5fbff",
    "background:rgba(8,10,22,0.66)",
    "border:1px solid rgba(77,232,255,0.4)",
    "border-radius:8px",
    "padding:10px 16px",
    "pointer-events:none"
  ].join(";");
  document.body.append(el);
  return el;
}

function renderHud(): void {
  neonGame.hud.set("score", run.score);
  neonGame.hud.set("targets", targetsAlive(run));
  neonGame.hud.set("objective", objective);
  hudRoot.innerHTML = [
    `<strong>Neon Corridor Strike</strong>`,
    `<div>Score ${run.score} | Sentries ${targetsAlive(run)}/${run.targets.length} | Ammo ${run.reloading ? "…" : run.ammo}/${MAG_SIZE}</div>`,
    `<div>Shots ${run.shotsFired} | Hits ${run.hits} | Status ${run.status}</div>`,
    `<div>${objective}</div>`,
    `<div>Click canvas to lock aim. WASD move. Mouse look. LMB/J fire. R reset.</div>`
  ].join("");
  const hitLive = performance.now() < hitMarkerUntil;
  crosshair.textContent = hitLive ? "×" : "+";
  crosshair.style.color = hitLive ? "#ff9d12" : "#4de8ff";
  lockOverlay.textContent =
    run.status === "won"
      ? "Corridor clear — press R to run it again."
      : pointerLockActive
        ? "Aim locked — Esc releases the mouse."
        : "Click the corridor to lock aim (drag-look + J fire work unlocked).";
  lockOverlay.style.display = pointerLockActive && run.status !== "won" ? "none" : "block";
}

function publishEvidence(): void {
  const evidence = app.evidence({
    input,
    events: routeEvents,
    hud: hudBindings,
    appState: {
      score: run.score,
      objective,
      events: routeEvents.events().map((event: { readonly label: string }) => event.label)
    },
    assets: {
      typedAssets: Object.keys(assets).length,
      missingAssets: []
    },
    source: { expectsGame: true }
  });
  const diagnostics = app.diagnostics();
  const snapshot: NeonCorridorEvidence = {
    // Framed once the renderer submits draw calls for the corridor scene.
    framed: diagnostics.drawCalls > 0,
    frame: run.frame,
    status: run.status,
    claimLabel: "prototype",
    player: { x: run.x, y: EYE_HEIGHT, z: run.z, yaw: run.yaw, pitch: run.pitch },
    shotsFired: run.shotsFired,
    hits: run.hits,
    targetsHit: run.hits,
    kills: run.kills,
    targetsAlive: targetsAlive(run),
    targetsTotal: run.targets.length,
    targets: run.targets.map((state) => ({
      id: state.id,
      alive: state.alive,
      hp: state.hp,
      position: state.center
    })),
    ammo: run.ammo,
    reloading: run.reloading,
    score: run.score,
    won: run.status === "won",
    resets: run.resets,
    pointerLockRequested,
    pointerLockActive,
    objective,
    events: routeEvents.events().map((event: { readonly label: string }) => event.label),
    look: { id: LOOK_ID, category: "studio" },
    typedAssets: Object.keys(assets),
    drawCalls: diagnostics.drawCalls,
    audio: audioEvidence(),
    evidence
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
}

function audioEvidence(): NeonCorridorEvidence["audio"] {
  const sound = neonGame.sound?.evidence;
  for (const node of sound?.playingNodes ?? []) {
    if (AUDIO_EVENTS.has(node.cue)) playedAudioEvents.add(node.cue);
  }
  return {
    requestedEvents: [...requestedAudioEvents].sort(),
    playedEvents: [...playedAudioEvents].sort(),
    playedCueCount: sound?.playedCueCount ?? 0,
    suppressedCueCount: sound?.suppressedCueCount ?? 0,
    contextState: sound?.contextState ?? "none",
    unlocked: sound?.unlocked ?? false
  };
}

