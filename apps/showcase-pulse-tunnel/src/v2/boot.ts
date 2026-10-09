// apps/showcase-pulse-tunnel/src/v2/boot.ts — T2.1–T2.6 v2 shell.
// §6.9.9 "rhythm flight inside a synthwave tunnel": the authored 120 BPM
// chart drives a real gate stream through the seeded beat clock (audio clock
// in beat mode, deterministic pattern mode when no AudioContext exists —
// PT-01 honest fallback). Gameplay modules (beat-clock/gates/patterns/
// player/style) are unchanged; music + sfx play through the legacy
// stem-bus tunnel audio until C-25 lands (standIn R-14-10).
import { game as engineGame, scene } from "@aura3d/engine";
import { createGame, type Game, lookManifest } from "@aura3d/game";
import { createBeatClock, pulseSectionAtTime, pulseTimeForBeat } from "../gameplay/beat-clock";
import { createGateSystem, PULSE_GATE_SPEED, PULSE_PLAYER_Z, PULSE_SPAWN_Z, pulseGateGeometry } from "../gameplay/gates";
import { createPulseConveyor, PULSE_CONVEYOR_BUDGET } from "../gameplay/conveyor";
import { buildPulseChart, type PulseGateKind } from "../gameplay/patterns";
import { createPulsePlayer, PULSE_INVULN_SECONDS } from "../gameplay/player";
import { createPulseStyleSystem } from "../gameplay/style";
import { createTunnelAudio, type PulseSfxCue } from "../legacy/tunnel-audio";
import direction from "../../art/direction";
import { pulseWorldNodes } from "./scene/world";
import { lightingNodes } from "./scene/lighting";
import { createPulseRig, fallbackCameraNode } from "./scene/camera";
import { wirePulseFx } from "./scene/fx";
import { GATE_MATERIALS, TUNNEL_BG } from "./scene/materials";
import { publishPulseEvidence } from "./evidence";
import { applyPulseScenario } from "./scenarios";

const ROUTE_FLAG = "A3D_QR_ROUTE_PULSE_TUNNEL" as const;
const RUN_SECONDS = 90;
const MAX_SHIELDS = 3;

const target = document.getElementById("app") ?? document.body;

// ---------------------------------------------------------------- sim state --

type RunState = "ready" | "running" | "summary";

const player = createPulsePlayer();
const style = createPulseStyleSystem();
const chart = buildPulseChart();
let runState: RunState = "ready";
let shields = MAX_SHIELDS;
let passed = 0;
let passedOnBeat = 0;
let grazes = 0;
let collisions = 0;
let finishedReason: string | null = null;
let lastSection = "intro";
let lastBeat = -1;
let runAnchorSeconds = 0;
let pendingStart = false;
let frame = 0;
const bootedAtMs = performance.now();

const rigState = { x: 0, y: 0 };
// §14.4 segment conveyor — the hoops stream with the gate field and recycle
// in place; the pool stays at the tier's segment budget N.
const conveyor = createPulseConveyor({
  segmentLength: 1.35,
  liveCount: PULSE_CONVEYOR_BUDGET.high,
  headZ: PULSE_SPAWN_Z - 1.1,
  recycleZ: PULSE_PLAYER_Z + 0.2,
  y: 0.32,
  scale: [1.94, 1.48, 1]
});
const world = pulseWorldNodes(conveyor);

function buildScene() {
  return scene()
    .background(TUNNEL_BG)
    .camera(fallbackCameraNode())
    .addMany(world.nodes)
    .addMany(lightingNodes());
}

// ----------------------------------------------------------------- audio -----

const tunnelAudio = createTunnelAudio();
const audioCueLog: string[] = [];
function pushCue(cue: PulseSfxCue): void {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
  void tunnelAudio.sfx(cue).catch(() => undefined);
}
const unlockAudio = () => void tunnelAudio.unlock().catch(() => undefined);
window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio, { passive: true });

// ------------------------------------------------------------------ game -----

const game = createGame({
  id: "showcase-pulse-tunnel",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "sci-fi-telemetry",
    maxScreenFraction: 0.15,
    widgets: [
      { id: "score", kind: "score", anchor: "top-left", label: "SCORE" },
      { id: "multiplier", kind: "label", anchor: "top-right", label: "MULT" },
      { id: "section", kind: "label", anchor: "top", label: "SECTION" },
      { id: "shields", kind: "label", anchor: "bottom-left", label: "SHIELDS" },
      { id: "message", kind: "label", anchor: "bottom", label: "RUN" }
    ]
  },
  touch: {
    preset: "lane-swipe",
    bindings: {
      left: "swipe-left", right: "swipe-right",
      jump: "swipe-up", slide: "swipe-down",
      confirm: "tap", pause: "menu"
    }
  },
  sound: {
    cues: {
      "lane-switch": { asset: "pulseLaneSwitchSfx" },
      "jump": { asset: "pulseJumpSfx" },
      "slide": { asset: "pulseSlideSfx" },
      "graze": { asset: "pulseGrazeSfx" },
      "shield-hit": { asset: "pulseShieldHitSfx" },
      "shield-break": { asset: "pulseShieldBreakSfx" },
      "section-rise": { asset: "pulseSectionRiseSfx" },
      "run-over": { asset: "pulseRunOverSfx" },
      "ui-confirm": { asset: "pulseUiConfirmSfx" },
      "stem-drums": { asset: "pulseDrumsStem" },
      "stem-bass": { asset: "pulseBassStem" },
      "stem-lead": { asset: "pulseLeadStem" },
      "stem-air": { asset: "pulseAirStem" }
    }
  },
  juice: {
    "shield-hit": { hitStopMs: 50, trauma: 0.3 },
    "shield-break": { hitStopMs: 80, trauma: 0.5 },
    "section-rise": { hitStopMs: 40, trauma: 0.22 },
    "run-clear": { trauma: 0.25 },
    "run-fail": { hitStopMs: 90, trauma: 0.55 }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_pulse_tunnel` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-pulse-tunnel`).
    flags: ["route_pulse_tunnel", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

const fx = wirePulseFx(game);

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;
const handles = new Map<string, NodeHandle>();
function handle(name: string): NodeHandle {
  if (!handles.has(name)) handles.set(name, game.app.nodes.get(name));
  return handles.get(name);
}

// ------------------------------------------------------------------ clock ----

const clock = createBeatClock({
  getAudioTime: () => tunnelAudio.nowSeconds(),
  getFrameTime: () => performance.now() / 1000,
  onBeat: (beat) => fx.beat(beat),
  onDriftCheck: () => undefined
});

const gateSystem = createGateSystem({
  chart,
  getSchedulerTime: () => clock.time(),
  getAudioElapsed: () => Math.max(0, tunnelAudio.nowSeconds() - runAnchorSeconds),
  getPlayer: () => player.snapshot(),
  onPass: (event) => {
    if (event.type === "collision") {
      collisions += 1;
      applyShieldHit();
    } else {
      passed += 1;
      passedOnBeat += 1;
      if (event.type === "graze") {
        grazes += 1;
        style.graze();
        fx.graze(player.snapshot().x, player.snapshot().y, PULSE_PLAYER_Z);
        pushCue("graze");
      } else {
        fx.gatePassed(player.snapshot().x, PULSE_PLAYER_Z);
      }
    }
  }
});

// -------------------------------------------------------------- run state ----

function startRun(): void {
  if (runState === "running") return;
  player.reset();
  style.reset();
  gateSystem.reset();
  clock.reset();
  shields = MAX_SHIELDS;
  passed = 0;
  passedOnBeat = 0;
  grazes = 0;
  collisions = 0;
  finishedReason = null;
  lastSection = "intro";
  lastBeat = -1;
  runState = "running";
  pendingStart = false;
  pushCue("uiConfirm");
  void tunnelAudio.unlock()
    .then(() => tunnelAudio.startRun())
    .then((anchor) => {
      runAnchorSeconds = anchor ?? 0;
      clock.start(anchor);
    })
    .catch(() => clock.start(null));
}

function endRun(reason: string): void {
  runState = "summary";
  finishedReason = reason;
  tunnelAudio.stopStems();
  tunnelAudio.duckForSummary();
  pushCue("runOver");
  fx.runOver(reason === "completed");
}

function applyShieldHit(): void {
  shields = Math.max(0, shields - 1);
  player.applyInvuln(PULSE_INVULN_SECONDS);
  const p = player.snapshot();
  fx.shieldHit(p.x, p.y, PULSE_PLAYER_Z, shields <= 0);
  pushCue(shields <= 0 ? "shieldBreak" : "shieldHit");
  if (shields <= 0) endRun("shields-exhausted");
}

// ------------------------------------------------------------- input ---------

const input = engineGame.input({
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    jump: ["KeyW", "ArrowUp", "Space"],
    slide: ["KeyS", "ArrowDown"],
    pause: ["KeyP", "Escape"],
    reset: ["KeyR"],
    confirm: ["Enter", "KeyJ"]
  },
  bufferMs: 90
});

window.addEventListener("keydown", (e) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
}, { passive: false });

// Touch lane-swipe: horizontal swipe = lane move, up = jump, down = slide,
// tap = start/confirm. The preset drives the shell chrome; the gestures map
// onto the same buffered intents as keys.
let swipeStartX = 0;
let swipeStartY = 0;
let swipeAt = 0;
const touchActions = { left: false, right: false, jump: false, slide: false, confirm: false };
target.addEventListener("pointerdown", (e) => {
  unlockAudio();
  swipeStartX = e.clientX;
  swipeStartY = e.clientY;
  swipeAt = performance.now();
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
});
const endTouch = (e: PointerEvent) => {
  if (swipeAt <= 0) return;
  const dx = e.clientX - swipeStartX;
  const dy = e.clientY - swipeStartY;
  const dist = Math.hypot(dx, dy);
  if (performance.now() - swipeAt < 240 && dist < 16) {
    touchActions.confirm = true;
  } else if (dist >= 24) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx < 0) touchActions.left = true; else touchActions.right = true;
    } else if (dy < 0) {
      touchActions.jump = true;
    } else {
      touchActions.slide = true;
    }
  }
  swipeAt = 0;
};
target.addEventListener("pointerup", endTouch);
target.addEventListener("pointercancel", () => { swipeAt = 0; });

// T2.6: hidden tab auto-pauses the session.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    game.session.pause("visibility");
    void tunnelAudio.suspend();
  } else {
    game.session.resume();
    void tunnelAudio.resume();
  }
});

// ------------------------------------------------------------- frame loop ----

function consumeTouchActions(): { left: boolean; right: boolean; jump: boolean; slide: boolean; confirm: boolean } {
  const out = { ...touchActions };
  touchActions.left = false;
  touchActions.right = false;
  touchActions.jump = false;
  touchActions.slide = false;
  touchActions.confirm = false;
  return out;
}

const gateSlots = new Map<string, number>();
let lastHudSignature = "";
let lastHudWrite = 0;

function syncHud(): void {
  const snapshot = style.snapshot();
  const signature = [
    runState, lastSection, Math.round(snapshot.score), snapshot.multiplier.toFixed(1),
    shields, Math.ceil(Math.max(0, RUN_SECONDS - clock.elapsed()))
  ].join("|");
  if (signature === lastHudSignature && frame - lastHudWrite < 300) return;
  lastHudSignature = signature;
  lastHudWrite = frame;
  game.hud.set("score", `${Math.round(snapshot.score)}`);
  game.hud.set("multiplier", `x${snapshot.multiplier.toFixed(1)}`);
  game.hud.set("section", lastSection.toUpperCase());
  game.hud.set("shields", `SHIELDS ${"▮".repeat(shields)}${"▯".repeat(MAX_SHIELDS - shields)}`);
  const remaining = Math.max(0, RUN_SECONDS - clock.elapsed());
  game.hud.set("message", runState === "ready"
    ? "PRESS ANY KEY / SWIPE TO START"
    : runState === "summary"
      ? `${finishedReason === "completed" ? "RUN COMPLETE" : "SHIELDS EXHAUSTED"} — R TO RUN AGAIN`
      : `${Math.ceil(remaining)}s`);
}

function syncGates(): void {
  const active = gateSystem.activeGates();
  const liveIds = new Set(active.map((g) => g.id));
  for (const [id, slot] of gateSlots) {
    if (!liveIds.has(id)) {
      gateSlots.delete(id);
      handle(world.gateNodeNames[slot]!)?.setPosition(0, -30, -30).setVisible(false);
    }
  }
  for (const gate of active) {
    let slot = gateSlots.get(gate.id);
    if (slot === undefined) {
      const used = new Set(gateSlots.values());
      slot = [0, 1, 2, 3].find((i) => !used.has(i));
      if (slot === undefined) continue;
      gateSlots.set(gate.id, slot);
      const mat = GATE_MATERIALS[gate.entry.kind as PulseGateKind] ?? GATE_MATERIALS.wall;
      handle(world.gateNodeNames[slot]!)?.setMaterial(mat).setVisible(true);
    }
    const geometry = pulseGateGeometry(gate.entry, clock.time());
    const centerY = (geometry.bottomY + geometry.topY) / 2;
    handle(world.gateNodeNames[slot]!)?.setPosition(geometry.centerX, centerY, gate.z)
      .setScale([geometry.halfWidth * 2, Math.max(0.08, geometry.topY - geometry.bottomY), 0.12]);
  }
}

game.app.onFrame?.(({ dt: rawDt }) => {
  const stepSeconds = Math.min(0.05, Math.max(1 / 240, game.session.scaledDt(rawDt) || 1 / 60));
  frame += 1;
  input.update(stepSeconds);
  if (game.session.paused || stepSeconds <= 0) return;

  const pressedNow = consumeTouchActions();
  const wantsStart =
    input.pressed("left") || input.pressed("right") || input.pressed("jump") ||
    input.pressed("slide") || input.pressed("confirm") ||
    pressedNow.left || pressedNow.right || pressedNow.jump || pressedNow.slide || pressedNow.confirm;

  if (runState === "ready" || runState === "summary") {
    if (input.pressed("reset") || wantsStart || pendingStart) startRun();
    rigState.x = 0;
    rigState.y = 0;
    if (frame % 6 === 0) syncHud();
    return;
  }

  if (input.pressed("pause")) {
    game.session.paused ? game.session.resume() : game.session.pause();
  }
  if (input.pressed("reset")) {
    tunnelAudio.stopStems();
    runState = "ready";
    return;
  }

  // ---- sim ------------------------------------------------------------------
  clock.update();
  const pressed = {
    left: input.pressed("left") || pressedNow.left,
    right: input.pressed("right") || pressedNow.right,
    jump: input.pressed("jump") || pressedNow.jump,
    slide: input.pressed("slide") || pressedNow.slide
  };
  const nowMs = performance.now();
  const playerState = player.step(stepSeconds, nowMs, pressed);
  for (const eventName of playerState.events) {
    if (eventName === "lane-left" || eventName === "lane-right") {
      pushCue("laneSwitch");
      fx.laneSwitch(playerState.x, playerState.y, PULSE_PLAYER_Z);
    } else if (eventName === "jump") {
      pushCue("jump");
      fx.jump(playerState.x, playerState.y, PULSE_PLAYER_Z);
    } else if (eventName === "slide") {
      pushCue("slide");
      fx.slide(playerState.x, playerState.y, PULSE_PLAYER_Z);
    }
  }
  gateSystem.update(stepSeconds);
  conveyor.advance(PULSE_GATE_SPEED * stepSeconds);
  style.step(stepSeconds);

  lastBeat = Math.floor(clock.elapsed() / 0.5);

  const section = pulseSectionAtTime(clock.elapsed());
  if (section.id !== lastSection) {
    lastSection = section.id;
    tunnelAudio.applySection(section.id);
    pushCue("sectionRise");
    fx.sectionRise();
  }

  if (clock.elapsed() >= RUN_SECONDS && runState === "running") {
    endRun("completed");
  }

  // ---- presentation ----------------------------------------------------------
  rigState.x = playerState.x;
  rigState.y = playerState.y;
  handle("pulse-runner-craft")?.setPosition(playerState.x, 0.08 + playerState.y, PULSE_PLAYER_Z)
    .setRotation(0, 0, playerState.sliding ? 0.18 : 0);
  handle("pulse-craft-glow")?.setPosition(playerState.x, 0.2 + playerState.y, PULSE_PLAYER_Z + 0.32)
    .setScale([0.2 * (1 + playerState.vy * 0.4), 0.2 * (1 + playerState.vy * 0.4), 0.2]);
  handle("pulse-shield-plane")?.setPosition(playerState.x, 0.35 + playerState.y, PULSE_PLAYER_Z + 0.15);
  handle("pulse-beat-ring")?.setPosition(playerState.x, 0.35 + playerState.y, PULSE_PLAYER_Z + 0.15);

  syncGates();
  fx.step(stepSeconds);
  if (frame % 6 === 0) syncHud();
});

// ------------------------------------------------------------- evidence ------

// T2.2-post: appliedLook derives from the C-31 runtime manifest.
const appliedLook: Record<string, unknown> = Object.freeze({
  ...lookManifest(game.lookSource()),
  postPreset: "neon-night",
  exposureEV: direction.lighting.exposureEV,
  hdri: direction.lighting.environment.hdri,
  rig: "pulse-tunnel.chase"
});

publishPulseEvidence({
  game,
  run: () => ({
    state: runState,
    sectionId: lastSection,
    beat: lastBeat,
    elapsed: clock.elapsed(),
    shields,
    passed,
    passedOnBeat,
    grazes,
    collisions,
    finishedReason
  }),
  player: () => player.snapshot(),
  style: () => style.snapshot(),
  gates: () => ({
    active: gateSystem.activeGates().length,
    pending: gateSystem.pendingCount()
  }),
  clockSample: () => clock.sample(),
  appliedLook,
  frameCount: () => frame,
  bootedAtMs,
  audioCueLog: () => audioCueLog
});

const params = new URL(location.href).searchParams;
const scenario = params.get("scenario");
if (params.get("autorun") === "1") pendingStart = true;
if (scenario) {
  applyPulseScenario(scenario, {
    seekToBeat: (beat) => {
      clock.advanceScheduler(pulseTimeForBeat(beat) - clock.time());
      gateSystem.respace();
    },
    startRun: () => {
      // Scenarios run headless (no gesture): honest pattern-mode clock.
      if (runState !== "running") {
        runState = "running";
        pendingStart = false;
        player.reset();
        style.reset();
        gateSystem.reset();
        clock.reset();
        clock.start(null);
      }
    },
    applyShieldDamage: (count) => {
      for (let i = 0; i < count; i += 1) {
        if (shields > 0) {
          shields = Math.max(0, shields - 1);
          player.applyInvuln(PULSE_INVULN_SECONDS);
        }
      }
    }
  });
}

// ------------------------------------------------------------------- boot ----

game.start();
void game.ready().then(() => {
  game.app.camera?.use?.(createPulseRig(rigState), { blend: 0.4 });
  // C-05 output: neon-night preset; post presets stub {} until the registry
  // ships real output profiles.
    game.app.setOutput?.({ preset: "neon-night",  exposure: Math.pow(2, direction.lighting.exposureEV) });
  const firstFrameAt = performance.now();
  const w = window as unknown as Record<string, unknown>;
  w.__AURA3D_GAME__ = {
    route: "showcase-pulse-tunnel",
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return frame; },
    firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
});
