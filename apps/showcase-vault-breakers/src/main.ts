/**
 * Vault Breakers - route mount (PRD VB-08/10/11/12).
 *
 * One Aura3D app per route. The physics table lives in table.ts and the game
 * state machine in ball-flow.ts; this file owns the scene graph, per-frame
 * visual sync from body poses, the text3D scoreboard, HUD, audio cue mapping,
 * and the evidence global. DOM is UI only: every gameplay truth is rendered by
 * the Aura3D scene.
 */
import {
  camera,
  createGameApp,
  effects,
  game,
  lights,
  material,
  model,
  primitives,
  scene,
  ui,
  type AuraRuntimeNodeHandle,
  type AuraSceneNode
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import { VaultFlow, type VaultGameEvent } from "./ball-flow";
import { FlipperController } from "./flippers";
import { PlungerController } from "./plunger";
import { createTableSimulation, quatToEuler, type PropVisual } from "./table";
import { createVaultAudio } from "./pinball-audio";
import { createScoreboardNodes, scoreboardVisibility, MISSION_LINES } from "./scoreboard";
import { createVaultBreakersEnvironment } from "./environment";
import "./styles.css";

type VaultWindow = Window & {
  __VAULT_BREAKERS_EVIDENCE__?: unknown;
  __AURA3D_SHOWCASE_VAULT_BREAKERS__?: unknown;
  __VB_SHOT__?: () => string;
  __VB_PUMP__?: (frames: number) => number;
  __VB_SCENARIO__?: (scenario: string) => string;
  __AURA3D_COMPOSITION_PROBE__?: unknown;
};
const vaultWindow = window as VaultWindow;
Object.defineProperty(window, "__AURA3D_SHOWCASE_VAULT_BREAKERS__", {
  configurable: true,
  get: () => vaultWindow.__VAULT_BREAKERS_EVIDENCE__
});
const reducedMotion = typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const APP_ID = "showcase-vault-breakers";

// ---------------------------------------------------------------- HUD markup --
ui.html("#hud", `
  <div class="hole-banner" id="vb-banner" aria-live="polite">VAULT BREAKERS - PRESS AND RELEASE SPACE TO SERVE</div>
  <div class="result-card is-hidden" id="vb-result" data-testid="vault-breakers-result">
    <h2 id="vb-result-title">Game over</h2>
    <p id="vb-result-detail"></p>
    <div class="action-row"><button id="vb-again-button" type="button">Play again</button></div>
  </div>
`);

ui.html("#panel", `
  <section class="vb-brand">
    <p class="eyebrow">Aura3D Prototype</p>
    <h1>Vault Breakers</h1>
    <p class="blurb">Neon pinball. Fire the flippers, bank five target stands, crack the vault, ride the multiball.</p>
  </section>
  <section class="stat-grid" aria-label="Table status">
    <article><span>Score</span><strong id="stat-score">0</strong></article>
    <article><span>Ball</span><strong id="stat-ball">1 OF 3</strong></article>
    <article><span>Multiplier</span><strong id="stat-mult">X1</strong></article>
    <article><span>Banks</span><strong id="stat-banks">0 OF 5</strong></article>
    <article><span>Balls live</span><strong id="stat-live">0</strong></article>
    <article><span>Tilt</span><strong id="stat-tilt">0 OF 3</strong></article>
  </section>
  <div class="power-meter" aria-label="Plunger power"><span id="vb-power-fill"></span></div>
  <div class="power-meta"><span id="vb-power-label">Plunger</span><span>hold Space</span></div>
  <p class="mission-line" id="vb-mission" aria-live="polite">HIT TARGET BANKS  0 DOWN 5 TO GO</p>
  <ul class="controls-list" aria-label="Keyboard controls">
    <li>Flippers <b>A</b>/<b>D</b> or <b>&larr;/&rarr;</b></li>
    <li>Plunger <b>hold Space</b>, release to serve</li>
    <li>Nudge <b>S</b> (3 strikes tilt)</li>
    <li>Reset <b>R</b> - Pause <b>P</b></li>
  </ul>
  <section class="action-row" aria-label="Game actions">
    <button id="vb-left-button" type="button">Left flipper</button>
    <button id="vb-right-button" type="button">Right flipper</button>
    <button id="vb-plunge-button" type="button">Plunge</button>
    <button id="vb-reset-button" type="button">Reset</button>
    <button id="vb-pause-button" type="button">Pause</button>
  </section>
  <section class="evidence-strip" aria-label="Route evidence">
    <span>Backend <code id="vb-ev-backend">booting</code></span>
    <span>Flipper mode <code id="vb-ev-flipper">joint</code></span>
    <span>Sensors <code id="vb-ev-sensors">0</code> - Joints <code id="vb-ev-joints">0</code></span>
  </section>
`);

// ---------------------------------------------------------------- audio ------
const audio = createVaultAudio();
window.addEventListener("pointerdown", () => {
  void audio.unlock().catch(() => undefined);
}, { passive: true });
window.addEventListener("keydown", () => { void audio.unlock(); }, { passive: true });

// ---------------------------------------------------------------- state ------
const tableSim = createTableSimulation();
const flippers = new FlipperController(tableSim.flippers);
const flow = new VaultFlow(flippers, tableSim);
const plunger = new PlungerController();
let paused = false;
let frameCount = 0;
let nudgeFlip = false;
const downTargets = new Set<string>();
const audioCueLog: string[] = [];
const lastCueFrame = new Map<string, number>();
let doorSwing = -1; // -1 closed, 0..1 animating, 1 open
const touchControlEvents: string[] = [];
// Neon palette — vibrant emissive colors against deep dark backgrounds
const liveBallMaterial = material.emissive({ name: "neon chrome ball", color: "#e0f0ff", emissive: "#00d4ff" });
const liveTargetArmedMaterial = material.emissive({ name: "neon target armed", color: "#ffb830", emissive: "#ff6a00" });
const liveTargetHitMaterial = material.emissive({ name: "neon target hit", color: "#00f0ff", emissive: "#00e5ff" });
const liveDoorMaterial = material.emissive({ name: "neon vault door", color: "#c0c0c0", emissive: "#d4a017" });
const bankLampOffMaterial = material.emissive({ name: "neon lamp off", color: "#1a0e00", emissive: "#3d2200" });
const bankLampOnMaterial = material.emissive({ name: "neon lamp on", color: "#00ffcc", emissive: "#00ffaa" });
const mechanismStateMaterials = {
  guarded: material.emissive({ name: "neon guarded", color: "#d4a017", emissive: "#8b6914" }),
  progress: material.emissive({ name: "neon progress", color: "#00ff88", emissive: "#00cc66" }),
  vault: material.emissive({ name: "neon vault open", color: "#ff6a00", emissive: "#ff4500" }),
  multiball: material.emissive({ name: "neon multiball", color: "#00e5ff", emissive: "#00b8d4" }),
  tilt: material.emissive({ name: "neon tilt", color: "#ff0044", emissive: "#cc0033" }),
  gameOver: material.emissive({ name: "neon game over", color: "#333333", emissive: "#1a1a1a" })
} as const;

function pushCue(cue: Parameters<typeof audio.cue>[0]): void {
  void audio.cue(cue).catch(() => undefined);
  audioCueLog.push(cue);
  if (audioCueLog.length > 48) audioCueLog.shift();
}
function cueReady(name: string, gapFrames: number): boolean {
  const last = lastCueFrame.get(name) ?? -999;
  if (frameCount - last < gapFrames) return false;
  lastCueFrame.set(name, frameCount);
  return true;
}

// ---------------------------------------------------------------- scene ------
function primitiveNode(visual: PropVisual): AuraSceneNode {
  const p = visual.primitive!;
  const visualY = visual.name === "felt" ? visual.position[1] : visual.position[1] + 0.28;
  const mat = p.emissive
    ? material.emissive({ name: visual.name + " material", color: p.color, emissive: p.emissive, opacity: p.opacity ?? 1 })
    : material.pbr({ name: visual.name + " material", color: p.color, roughness: 0.8, metallic: 0.1, opacity: p.opacity ?? 1 });
  if (p.shape === "sphere") {
    return primitives.sphere({ name: visual.name, material: mat }).position(visual.position[0], visualY, visual.position[2]).scale(p.size[0]).toJSON();
  }
  if (p.shape === "cylinder") {
    return primitives.cylinder({ name: visual.name, material: mat })
      .position(visual.position[0], visualY, visual.position[2])
      .scale([p.size[0], p.size[1], p.size[2]])
      .toJSON();
  }
  if (p.shape === "torus") {
    return primitives.torus({ name: visual.name, material: mat })
      .position(visual.position[0], visualY, visual.position[2])
      .rotate(visual.rotation.x, visual.rotation.y, visual.rotation.z)
      .scale([p.size[0], p.size[1], Math.max(0.02, p.size[2])])
      .toJSON();
  }
  return primitives.box({ name: visual.name, material: mat })
    .position(visual.position[0], visualY, visual.position[2])
    .rotate(visual.rotation.x, visual.rotation.y, visual.rotation.z)
    .scale([p.size[0], p.size[1], p.size[2]])
    .toJSON();
}

function visualNodes(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  for (const v of flow.sim.visuals) {
    if (v.source === "model") {
      nodes.push(
        model(assets[v.typedAsset!], {
          name: v.name,
          role: v.typedAsset === "vaultBreakersBall" ? "primaryCharacter" : "setDressing",
          scaleMode: "fit",
          targetMaxDimension: v.targetMaxDimension ?? 1
        })
          .position(v.position[0], v.position[1] + 0.28, v.position[2])
          .rotate(v.rotation.x, v.rotation.y, v.rotation.z)
          .runtime(game.runtimeNode(v.name, { tags: ["typed-asset", "physics-synced"] }))
          .toJSON()
      );
    } else if (v.name.startsWith("target:")) {
      nodes.push(
        primitives.box({
          name: v.name,
          material: material.emissive({
            name: v.name + " material",
            color: v.primitive!.color,
            emissive: v.primitive!.emissive,
            opacity: v.primitive!.opacity ?? 1
          })
        })
          .position(v.position[0], v.position[1] + 0.28, v.position[2])
          .scale([...v.primitive!.size])
          .runtime(game.runtimeNode(v.name, { tags: ["standup-target"] }))
          .toJSON()
      );
    } else if (v.name === "vault-door-visual") {
      nodes.push(
        model(assets.vaultBreakersVaultDoor, {
          name: "vault-door-visual",
          role: "setDressing",
          scaleMode: "fit",
          targetMaxDimension: 0.52
        })
          .position(...v.position)
          .runtime(game.runtimeNode("vault-door-visual", { tags: ["vault-door"] }))
          .toJSON()
      );
    } else {
      nodes.push(primitiveNode(v));
    }
  }
  nodes.push(
    model(assets.vaultBreakersMechanisms, {
      name: "typed-vault-breakers-mechanisms",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 5.05
    }).position(0, 0.34, 0)
      .runtime(game.runtimeNode("typed-vault-breakers-mechanisms", { tags: ["typed-asset", "mission-state"] }))
      .toJSON()
  );
  for (const [state, stateMaterial] of Object.entries(mechanismStateMaterials)) {
    nodes.push(
      primitives.box({ name: `mission-state-beacon-${state}`, material: stateMaterial })
        .position(0, 0.72, 1.05).scale([1.35, 0.12, 0.22])
        .runtime(game.runtimeNode(`mission-state-beacon-${state}`, { tags: ["mission-state", "non-color-redundant-with-scoreboard"] }))
        .toJSON()
    );
  }
  for (let index = 0; index < 5; index += 1) {
    nodes.push(
      primitives.box({ name: `bank-status-${index}`, material: bankLampOffMaterial })
        .position(-1.4 + index * 0.7, 1.5, -2.72)
        .scale([0.28, 0.16, 0.28])
        .runtime(game.runtimeNode(`bank-status-${index}`, { tags: ["mission-progress", "bank-lamp"] }))
        .toJSON()
    );
  }
  for (const node of createScoreboardNodes().nodes) {
    nodes.push(node);
  }
  return nodes;
}

function buildScene(): ReturnType<typeof scene> {
  return scene()
    .background("#030308")
    .addMany(createVaultBreakersEnvironment())
    // Submit the playable mechanisms after the bounded cabinet shell so the
    // root safe renderer's stable draw order keeps them legible above it.
    .addMany(visualNodes())
    .addMany([effects.neonBloom({ intensity: reducedMotion ? 0.15 : 0.45 })])
    .camera(camera.perspective({ position: [0, 3.2, 9.2], target: [0, -0.5, 0.0], fov: 52 }));
}

// ---------------------------------------------------------------- mount ------
const gameApp = createGameApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
  input: {
    actions: {
      flipperLeft: ["KeyA", "ArrowLeft"],
      flipperRight: ["KeyD", "ArrowRight"],
      plunger: ["Space"],
      nudge: ["KeyS"],
      pause: ["KeyP", "Escape"],
      reset: ["KeyR"]
    },
    bufferMs: 80,
    gamepad: false,
    touch: true
  },
  loop: { fixedDt: 1 / 60, maxSubSteps: 2 },
  scene: buildScene()
});
const app = gameApp.app;
const input = gameApp.input!;
if (!input) throw new Error("Vault Breakers failed to create Aura3D input.");

let dynamicHandles = new Map<string, AuraRuntimeNodeHandle>();
const scoreboardHandles = new Map<string, AuraRuntimeNodeHandle>();
const bankLampHandles = new Map<number, AuraRuntimeNodeHandle>();
let targetHandles = new Map<string, AuraRuntimeNodeHandle>();
let doorHandle: AuraRuntimeNodeHandle | undefined;
let mechanismHandle: AuraRuntimeNodeHandle | undefined;
const missionBeaconHandles = new Map<string, AuraRuntimeNodeHandle>();

function resolveHandles(): void {
  dynamicHandles = new Map();
  for (const name of flow.sim.dynamicVisualNames) {
    // Optional by design: parked ball nodes exist from mount, but a rebuilt
    // handle set must never throw for a name the scene has not re-issued.
    const handle = app.nodes.get(name);
    if (handle) {
      const runtimeHandle = handle as AuraRuntimeNodeHandle;
      // Only override ball material; let flipper GLB materials show through
      if (name.startsWith("ball-")) runtimeHandle.setMaterial(liveBallMaterial);
      dynamicHandles.set(name, runtimeHandle);
    }
  }
  targetHandles = new Map();
  for (const id of flow.sim.targetIds) {
    const handle = app.nodes.get(`target:${id}`);
    if (handle) {
      const runtimeHandle = handle as AuraRuntimeNodeHandle;
      runtimeHandle.setMaterial(liveTargetArmedMaterial);
      targetHandles.set(`target:${id}`, runtimeHandle);
    }
  }
  scoreboardHandles.clear();
  bankLampHandles.clear();
  for (let index = 0; index < 5; index += 1) {
    const handle = app.nodes.get(`bank-status-${index}`) as AuraRuntimeNodeHandle | undefined;
    if (handle) bankLampHandles.set(index, handle);
  }
  for (let slot = 0; slot < 6; slot += 1) {
    for (let digit = 0; digit <= 9; digit += 1) {
      const id = `sb-score-${slot}-${digit}`;
      const handle = app.nodes.get(id);
      if (handle) scoreboardHandles.set(id, handle as AuraRuntimeNodeHandle);
    }
  }
  for (const prefix of ["sb-ball", "sb-mult", "sb-banks", "sb-mission"]) {
    for (const handle of app.nodes.all()) {
      if (handle.id.startsWith(prefix) && !scoreboardHandles.has(handle.id)) {
        scoreboardHandles.set(handle.id, handle as AuraRuntimeNodeHandle);
      }
    }
  }
  doorHandle = app.nodes.get("vault-door-visual") as AuraRuntimeNodeHandle | undefined;
  doorHandle?.setMaterial(liveDoorMaterial);
  mechanismHandle = app.nodes.get("typed-vault-breakers-mechanisms") as AuraRuntimeNodeHandle | undefined;
  missionBeaconHandles.clear();
  for (const state of Object.keys(mechanismStateMaterials)) {
    const handle = app.nodes.get(`mission-state-beacon-${state}`) as AuraRuntimeNodeHandle | undefined;
    if (handle) missionBeaconHandles.set(state, handle);
  }
}
resolveHandles();

// ---------------------------------------------------------------- HUD --------
const banner = document.getElementById("vb-banner")!;
const resultCard = document.getElementById("vb-result")!;
const resultTitle = document.getElementById("vb-result-title")!;
const resultDetail = document.getElementById("vb-result-detail")!;
const againButton = document.getElementById("vb-again-button") as HTMLButtonElement;
const powerFill = document.getElementById("vb-power-fill")!;
const powerLabel = document.getElementById("vb-power-label")!;

function hideResultCard(): void {
  resultCard.classList.add("is-hidden");
}

function syncHud(): void {
  const snap = flow.snapshot();
  ui.setText("#stat-score", String(snap.score));
  ui.setText("#stat-ball", `${snap.ball} OF 3`);
  ui.setText("#stat-mult", `X${snap.multiplier}`);
  ui.setText("#stat-banks", `${snap.banksDown} OF 5`);
  ui.setText("#stat-live", String(snap.activeBalls));
  ui.setText("#stat-tilt", snap.tiltLocked ? "TILT" : `${snap.tiltStrikes} OF 3`);
  ui.setText("#vb-mission", snap.missionLine);
  const charge = plunger.state();
  powerFill.style.width = Math.round(charge.charge * 100) + "%";
  powerLabel.textContent = plunger.charging ? `Plunge ${Math.round(charge.charge * 100)}%` : "Plunger";
  ui.setText("#vb-ev-backend", snap.backend);
  ui.setText("#vb-ev-flipper", "joint");
  ui.setText("#vb-ev-sensors", String(snap.sensorEventCount));
  ui.setText("#vb-ev-joints", String(snap.jointCount));
  banner.textContent = paused
    ? "PAUSED - P TO RESUME"
    : snap.phase === "attract"
      ? "VAULT BREAKERS - HOLD SPACE, RELEASE TO SERVE"
      : snap.phase === "await-serve"
        ? `BALL ${snap.ball} - HOLD SPACE, RELEASE TO SERVE`
        : snap.phase === "game-over"
          ? "GAME OVER - R OR PLAY AGAIN"
          : snap.multiball ? "MULTIBALL" : snap.missionLine;
}

// ------------------------------------------------------------- actions -------
function doServe(charge: number): void {
  if (flow.serve(charge)) {
    pushCue("plunger-release");
    syncHud();
  }
}

function togglePause(): void {
  paused = !paused;
  pushCue("bank-clear");
  syncHud();
  publishEvidence();
  if (paused) app.pause();
  else app.resume();
}

function resetGame(): void {
  flow.reset();
  plunger.cancelCharge();
  downTargets.clear();
  doorSwing = -1;
  const door = app.nodes.get("vault-door-visual");
  if (door) {
    door.setPosition(0, 0.52, -3.3);
    door.setRotation(0, 0, 0);
  }
  for (const [id, handle] of targetHandles) {
    void id;
    handle.setMaterial(liveTargetArmedMaterial);
  }
  hideResultCard();
  pushCue("bank-clear");
  syncHud();
  publishEvidence();
}

function consumeEvents(events: readonly VaultGameEvent[]): void {
  for (const event of events) {
    switch (event.type) {
      case "serve":
        pushCue("plunger-release");
        break;
      case "bumper":
        if (cueReady("bumper-hit", 8)) pushCue("bumper-hit");
        break;
      case "sling":
        if (cueReady("sling-pop", 10)) pushCue("sling-pop");
        break;
      case "target-down": {
        if (!downTargets.has(event.id)) {
          downTargets.add(event.id);
          pushCue("target-down");
        }
        const handle = targetHandles.get(`target:${event.id}`);
        if (handle) {
          handle.setMaterial(liveTargetHitMaterial);
        }
        break;
      }
      case "bank-clear":
        pushCue("bank-clear");
        break;
      case "all-banks-clear":
      case "vault-open":
        pushCue("vault-open");
        doorSwing = 0;
        break;
      case "multiball-start":
        pushCue("multiball");
        break;
      case "jackpot":
        if (cueReady("vault-open", 30)) pushCue("vault-open");
        break;
      case "orbit-loop":
      case "orbit-complete":
        if (cueReady("ramp-roll", 20)) pushCue("ramp-roll");
        break;
      case "ball-drain":
        pushCue("ball-drain");
        break;
      case "ball-end":
        resolveHandles();
        break;
      case "tilt-strike":
      case "tilt-lock":
        pushCue("tilt-warn");
        break;
      case "game-over":
        pushCue("ball-drain");
        resultTitle.textContent = "Game over";
        resultDetail.textContent = `Final score ${event.score}. Three balls, one vault.`;
        resultCard.classList.remove("is-hidden");
        break;
      default:
        break;
    }
  }
}

// --------------------------------------------------------- per-frame sync ----
function syncVisuals(): void {
  // Visual Y offset: matches the offset applied when creating the dynamic visual
  // nodes (physics Y=0 is playfield level; scene nodes sit 0.28 above to appear
  // on the cabinet GLB playfield surface).
  const VISUAL_Y_OFFSET = 0.28;
  for (const pose of flow.sim.poses()) {
    const handle = dynamicHandles.get(pose.name);
    if (!handle) continue;
    const e = quatToEuler(pose.rotation);
    handle.setPosition(pose.position[0], pose.position[1] + VISUAL_Y_OFFSET, pose.position[2]);
    handle.setRotation(e.x, e.y, e.z);
  }
  const banksDown = flow.snapshot().banksDown;
  for (const [index, handle] of bankLampHandles) {
    handle.setMaterial(index < banksDown ? bankLampOnMaterial : bankLampOffMaterial);
  }
  const snap = flow.snapshot();
  const mechanismState = snap.phase === "game-over" ? "gameOver"
    : snap.tiltLocked ? "tilt"
      : snap.multiball ? "multiball"
        : snap.vaultOpen ? "vault"
          : snap.banksDown > 0 ? "progress"
            : "guarded";
  const mechanismMaterial = mechanismStateMaterials[mechanismState];
  mechanismHandle?.setMaterial(mechanismMaterial);
  for (const [state, handle] of missionBeaconHandles) handle.setVisible(state === mechanismState);
}

function syncScoreboard(): void {
  const snap = flow.snapshot();
  const visibility = scoreboardVisibility({
    score: snap.score,
    ball: snap.ball,
    multiplier: snap.multiplier,
    banksDown: snap.banksDown,
    missionLine: snap.missionLine
  });
  for (const [id, visible] of visibility) {
    const handle = scoreboardHandles.get(id);
    if (handle) handle.setVisible(visible);
  }
  void MISSION_LINES;
}

function syncDoor(dt: number): void {
  if (doorSwing < 0 || doorSwing >= 1 || !doorHandle) return;
  doorSwing = Math.min(1, doorSwing + dt / 0.6);
  const swing = reducedMotion ? 1 : doorSwing;
    // Authored swing: pivot around the left edge by rotating and sliding.
  doorHandle.setRotation(0, -1.35 * swing, 0);
  doorHandle.setPosition(-0.55 * swing, 0.52 + 0.05 * swing, -3.32 - 0.28 * swing);
}

// ------------------------------------------------------------- evidence ------
function publishEvidence(): void {
  const snap = flow.snapshot();
  const flipperSnap = flippers.snapshot();
  const diagnostics = app.diagnostics() as { readonly drawCalls: number; readonly renderSize: readonly number[]; readonly runtimeBackend?: string };
  const evidence = {
    // Contract keys from the PRD evidence section.
    mounted: true,
    status: "ready",
    ball: snap.ball,
    ballsRemaining: snap.ballsRemaining,
    score: snap.score,
    multiplier: snap.multiplier,
    banksDown: snap.banksDown,
    vaultOpen: snap.vaultOpen,
    multiball: snap.multiball,
    tiltStrikes: snap.tiltStrikes,
    state: paused ? "paused" : snap.phase,
    flipperMode: flipperSnap.mode,
    flipperEvents: flipperSnap.activationCount,
    sensorEventCount: snap.sensorEventCount,
    jointCount: snap.jointCount,
    physicsBodyCount: snap.physicsBodyCount,
    text3DScoreboards: scoreboardHandles.size,
    dynamicHandleCount: dynamicHandles.size,
    targetHandleCount: targetHandles.size,
    bankLampCount: bankLampHandles.size,
    mechanismVisualState: snap.phase === "game-over" ? "game-over" : snap.tiltLocked ? "tilt" : snap.multiball ? "multiball" : snap.vaultOpen ? "vault-open" : snap.banksDown > 0 ? "bank-progress" : "guarded",
    renderer: { drawCalls: diagnostics.drawCalls, renderSize: diagnostics.renderSize, backend: diagnostics.runtimeBackend ?? "unknown" },
    lastShotHash: flow.lastShotHash,
    resetHashMatch: flow.resetHashMatch,
    audioCues: audioCueLog.slice(),
    // Route-local extras consumed by specs and route-health.
    appId: APP_ID,
    primaryAssets: [
      "assets.vaultBreakersTable", "assets.vaultBreakersMechanisms", "assets.vaultBreakersBall",
      "assets.vaultBreakersFlipper", "assets.vaultBreakersVaultDoor"
    ],
    backend: snap.backend,
    phase: snap.phase,
    activeBalls: snap.activeBalls,
    tiltLocked: snap.tiltLocked,
    orbitLoops: snap.orbitLoops,
    missionLine: snap.missionLine,
    flipperLeftRaised: flipperSnap.leftRaised,
    flipperRightRaised: flipperSnap.rightRaised,
    plunger: plunger.state(),
    downTargets: [...downTargets],
    frameCount,
    controls: ["A/Left left flipper", "D/Right right flipper", "hold Space plunger", "S nudge", "R reset", "P pause", "touch buttons"],
    systems: ["Rapier ball/contact/sensor world", "two motorised-hinge flippers", "route-local five-bank vault mission", "text3D scoreboard", "typed CC0 audio controller"],
    touchControlEvents: touchControlEvents.slice(-16),
    claimBoundary: "Aura3D prototype: route-local pinball on the public physics surface with motorised flipper joints (same-sign axis-mirror workaround); no reusable pinball kit claimed.",
    mountedAtEpochMs: Date.now()
  };
  vaultWindow.__VAULT_BREAKERS_EVIDENCE__ = evidence;
}

// Renderer-owned capture used by specs and probes (no compositor dependency).
vaultWindow.__VB_SHOT__ = () => app.screenshot().dataUrl;

/**
 * Deterministic time pump for specs: headless tabs can throttle rAF to ~1fps,
 * so long passive waits never advance the sim. Uses the public app.pause() +
 * app.step() path (docs/api/game-runtime.md "Deterministic stepping") to run
 * `frames` fixed steps, then resumes the browser loop.
 */
vaultWindow.__VB_PUMP__ = (frames: number): number => {
  app.pause();
  for (let index = 0; index < frames; index += 1) app.step(1 / 60);
  app.resume();
  return app.runtime.frame;
};

vaultWindow.__VB_SCENARIO__ = (scenario: string): string => {
  resetGame();
  let events: readonly VaultGameEvent[] = [];
  if (scenario === "bank-near-complete") events = flow.evidenceClearBanks(4);
  else if (scenario === "vault-opening") events = flow.evidenceClearBanks(5);
  else if (scenario === "multiball") events = flow.evidenceStartMultiball();
  else if (scenario === "tilt") {
    doServe(0.72);
    flow.nudge(-1);
    flow.nudge(1);
    flow.nudge(-1);
    events = flow.drainEvents();
  } else if (scenario === "game-over") events = flow.evidenceEndGame();
  else if (scenario !== "attract") throw new Error(`Unknown Vault Breakers scenario: ${scenario}`);
  consumeEvents(events);
  if (scenario === "vault-opening") syncDoor(0.3);
  if (scenario === "multiball") syncDoor(0.7);
  syncVisuals();
  syncScoreboard();
  syncHud();
  publishEvidence();
  return `${scenario}:${flow.snapshot().phase}:${flow.snapshot().banksDown}:${flow.snapshot().activeBalls}`;
};

// ---------------------------------------------------------------- input -------
/*
 * Keyboard is read through a route-owned window mirror with explicit edge
 * detection (the sibling showcase routes' discipline): engine game-input stays
 * configured for touch parity, but keyboard edges must not depend on focus.
 */
const manualHeld = new Set<string>();
const manualPrev = new Map<string, boolean>();
let spaceTapArmed = false;

function manualEdge(code: string): "pressed" | "released" | "held" | "idle" {
  const now = manualHeld.has(code);
  const before = manualPrev.get(code) ?? false;
  if (now && !before) return "pressed";
  if (!now && before) return "released";
  return now ? "held" : "idle";
}

function manualAdvanceFrame(): void {
  for (const code of ["Space", "KeyA", "KeyD", "ArrowLeft", "ArrowRight", "KeyS", "KeyP", "Escape", "KeyR"]) {
    manualPrev.set(code, manualHeld.has(code));
  }
}

window.addEventListener("keydown", (event) => {
  if (!event.repeat) manualHeld.add(event.code);
  if (event.code === "Space" && !plunger.charging && (flow.phase === "attract" || flow.phase === "await-serve")) {
    plunger.beginCharge();
    spaceTapArmed = true;
  }
  if (event.repeat) return;
  if (event.code === "KeyP" || event.code === "Escape") togglePause();
  else if (event.code === "KeyR") resetGame();
  else if (event.code === "KeyS") {
    nudgeFlip = !nudgeFlip;
    flow.nudge(nudgeFlip ? -1 : 1);
  }
}, { passive: true });
window.addEventListener("keyup", (event) => {
  manualHeld.delete(event.code);
  if (event.code === "Space" && spaceTapArmed) {
    spaceTapArmed = false;
    const charge = plunger.release();
    if (charge !== null) doServe(charge);
  }
}, { passive: true });
window.addEventListener("keydown", (event) => {
  if (["Space", "KeyA", "KeyD", "ArrowLeft", "ArrowRight", "KeyS"].includes(event.code)) {
    event.preventDefault();
  }
}, { passive: false });

function bindHoldButton(selector: string, onDown: () => void, onUp: () => void): void {
  let held = false;
  const begin = (event: Event): void => {
    event.preventDefault();
    if (held) return;
    held = true;
    onDown();
    touchControlEvents.push(`${selector}:down`);
    publishEvidence();
  };
  const end = (): void => {
    if (!held) return;
    held = false;
    onUp();
    touchControlEvents.push(`${selector}:up`);
    publishEvidence();
  };
  const attach = (): void => {
    const button = document.querySelector(selector) as HTMLButtonElement | null;
    if (!button) {
      window.requestAnimationFrame(attach);
      return;
    }
    button.addEventListener("pointerdown", begin, { passive: false });
    button.addEventListener("pointerup", end);
    button.addEventListener("pointercancel", end);
    button.addEventListener("pointerleave", end);
    button.addEventListener("touchstart", begin, { passive: false });
    button.addEventListener("touchend", end, { passive: false });
    button.addEventListener("touchcancel", end, { passive: false });
  };
  attach();
}
bindHoldButton("#vb-left-button", () => manualHeld.add("KeyA"), () => manualHeld.delete("KeyA"));
bindHoldButton("#vb-right-button", () => manualHeld.add("KeyD"), () => manualHeld.delete("KeyD"));
bindHoldButton("#vb-plunge-button", () => {
  if (!plunger.charging && (flow.phase === "attract" || flow.phase === "await-serve")) plunger.beginCharge();
}, () => {
  const charge = plunger.release();
  if (charge !== null) doServe(charge);
});
ui.onClick("#vb-reset-button", () => resetGame());
ui.onClick("#vb-pause-button", () => togglePause());
againButton.addEventListener("click", () => resetGame());

// ------------------------------------------------------------- frame loop ----
gameApp.onFrame(({ dt }) => {
  input.update(dt);
  frameCount += 1;

  if (dynamicHandles.size < flow.sim.dynamicVisualNames.length || targetHandles.size < flow.sim.targetIds.length || !doorHandle || !mechanismHandle || missionBeaconHandles.size < Object.keys(mechanismStateMaterials).length) {
    resolveHandles();
  }

  if (paused) {
    manualAdvanceFrame();
    return;
  }

  plunger.update(dt);
  const activationsBefore = flippers.snapshot().activationCount;
  flippers.update({
    leftHeld: manualHeld.has("KeyA") || manualHeld.has("ArrowLeft"),
    rightHeld: manualHeld.has("KeyD") || manualHeld.has("ArrowRight")
  });
  if (flippers.snapshot().activationCount > activationsBefore) {
    if (cueReady("flipper-snap", 6)) pushCue("flipper-snap");
  }
  if (manualEdge("Space") === "released" && plunger.charging) {
    const charge = plunger.release();
    if (charge !== null) doServe(charge);
  }
  manualAdvanceFrame();

  const events = flow.update(1);
  consumeEvents(events);

  syncVisuals();
  syncScoreboard();
  syncDoor(dt);

  if (frameCount % 6 === 0 || events.length > 0) syncHud();
  publishEvidence();
});

Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  configurable: true,
  value: {
    category: "application",
    subject: { position: [0, 0.34, -1.55], rotation: [0, 0, 0], targetSize: 5.05 },
    settleSubjectPose() {
      resolveHandles();
      syncVisuals();
      publishEvidence();
    },
    setSubjectSuppressed(suppressed: boolean) {
      const node = app.nodes.get("typed-vault-breakers-mechanisms") as AuraRuntimeNodeHandle | undefined;
      node?.setVisible(!suppressed);
    }
  }
});

syncHud();
publishEvidence();
