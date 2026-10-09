// apps/showcase-pulse-tunnel/src/v2/boot.ts — T2.1–T2.6 v2 shell.
// §6.9.9 "rhythm flight inside a synthwave tunnel": the authored 120 BPM
// chart drives a real gate stream through the seeded beat clock (audio clock
// in beat mode, deterministic pattern mode when no AudioContext exists —
// PT-01 honest fallback). Gameplay modules (beat-clock/gates/patterns/
// player/style) are unchanged; music + sfx play through the legacy
// stem-bus tunnel audio until C-25 lands (standIn R-14-10).
import { game as engineGame, scene } from "@aura3d/engine";
import { createGame, type Game, lookManifest } from "@aura3d/game";
import { pulseSectionAtTime, pulseTimeForBeat } from "../gameplay/beat-clock";
import { createGateSystem, PULSE_PLAYER_Z } from "../gameplay/gates";
import { buildPulseChart } from "../gameplay/patterns";
import { createPulsePlayer, PULSE_INVULN_SECONDS } from "../gameplay/player";
import { createPulseStyleSystem } from "../gameplay/style";
import { createTunnelAudio, type PulseSfxCue } from "../legacy/tunnel-audio";
import direction from "../../art/direction";
import { pulseWorldNodes } from "./scene/world";
import { lightingNodes } from "./scene/lighting";
import { createPulseRig, fallbackCameraNode } from "./scene/camera";
import { wirePulseFx } from "./scene/fx";
import { TUNNEL_BG } from "./scene/materials";
import { publishPulseEvidence } from "./evidence";
import { applyPulseScenario } from "./scenarios";
import { createPulseRunCtx, createPulseSystems, wirePulseRunState, MAX_SHIELDS } from "./run-state";
import { createGateVisuals } from "./gate-visuals";
import { wirePulseTouch, consumePulseTouch } from "./touch";

const ROUTE_FLAG = "A3D_QR_ROUTE_PULSE_TUNNEL" as const;
const RUN_SECONDS = 90;

const target = document.getElementById("app") ?? document.body;

// ---------------------------------------------------------------- sim state --


const player = createPulsePlayer();
const style = createPulseStyleSystem();
const chart = buildPulseChart();
const rs = createPulseRunCtx();
let frame = 0;
const bootedAtMs = performance.now();

const rigState = { x: 0, y: 0 };
const world = pulseWorldNodes();

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
      { id: "rs.shields", kind: "label", anchor: "bottom-left", label: "SHIELDS" },
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

const { clock, gateSystem } = createPulseSystems(rs, {
  chart, tunnelAudio, player, style, fx, pushCue, onShieldHit: () => applyShieldHit(),
});

// -------------------------------------------------------------- run state ----

const { startRun, endRun, applyShieldHit } = wirePulseRunState(rs, {
  player, style, gateSystem, clock, tunnelAudio, fx, pushCue,
});

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

const swipe = wirePulseTouch(target, unlockAudio);

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

let lastHudSignature = "";
let lastHudWrite = 0;

function syncHud(): void {
  const snapshot = style.snapshot();
  const signature = [
    rs.runState, rs.lastSection, Math.round(snapshot.score), snapshot.multiplier.toFixed(1),
    rs.shields, Math.ceil(Math.max(0, RUN_SECONDS - clock.elapsed()))
  ].join("|");
  if (signature === lastHudSignature && frame - lastHudWrite < 300) return;
  lastHudSignature = signature;
  lastHudWrite = frame;
  game.hud.set("score", `${Math.round(snapshot.score)}`);
  game.hud.set("multiplier", `x${snapshot.multiplier.toFixed(1)}`);
  game.hud.set("section", rs.lastSection.toUpperCase());
  game.hud.set("shields", `SHIELDS ${"▮".repeat(rs.shields)}${"▯".repeat(MAX_SHIELDS - rs.shields)}`);
  const remaining = Math.max(0, RUN_SECONDS - clock.elapsed());
  game.hud.set("message", rs.runState === "ready"
    ? "PRESS ANY KEY / SWIPE TO START"
    : rs.runState === "summary"
      ? `${rs.finishedReason === "completed" ? "RUN COMPLETE" : "SHIELDS EXHAUSTED"} — R TO RUN AGAIN`
      : `${Math.ceil(remaining)}s`);
}

const { syncGates } = createGateVisuals({ world, handle, gateSystem, clock });

game.app.onFrame?.(({ dt: rawDt }) => {
  const stepSeconds = Math.min(0.05, Math.max(1 / 240, game.session.scaledDt(rawDt) || 1 / 60));
  frame += 1;
  input.update(stepSeconds);
  if (game.session.paused || stepSeconds <= 0) return;

  const pressedNow = consumePulseTouch(swipe);
  const wantsStart =
    input.pressed("left") || input.pressed("right") || input.pressed("jump") ||
    input.pressed("slide") || input.pressed("confirm") ||
    pressedNow.left || pressedNow.right || pressedNow.jump || pressedNow.slide || pressedNow.confirm;

  if (rs.runState === "ready" || rs.runState === "summary") {
    if (input.pressed("reset") || wantsStart || rs.pendingStart) startRun();
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
    rs.runState = "ready";
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
  style.step(stepSeconds);

  rs.lastBeat = Math.floor(clock.elapsed() / 0.5);

  const section = pulseSectionAtTime(clock.elapsed());
  if (section.id !== rs.lastSection) {
    rs.lastSection = section.id;
    tunnelAudio.applySection(section.id);
    pushCue("sectionRise");
    fx.sectionRise();
  }

  if (clock.elapsed() >= RUN_SECONDS && rs.runState === "running") {
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
    state: rs.runState,
    sectionId: rs.lastSection,
    beat: rs.lastBeat,
    elapsed: clock.elapsed(),
    shields: rs.shields,
    passed: rs.passed,
    passedOnBeat: rs.passedOnBeat,
    grazes: rs.grazes,
    collisions: rs.collisions,
    finishedReason: rs.finishedReason
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
if (params.get("autorun") === "1") rs.pendingStart = true;
if (scenario) {
  applyPulseScenario(scenario, {
    seekToBeat: (beat) => {
      clock.advanceScheduler(pulseTimeForBeat(beat) - clock.time());
      gateSystem.respace();
    },
    startRun: () => {
      // Scenarios run headless (no gesture): honest pattern-mode clock.
      if (rs.runState !== "running") {
        rs.runState = "running";
        rs.pendingStart = false;
        player.reset();
        style.reset();
        gateSystem.reset();
        clock.reset();
        clock.start(null);
      }
    },
    applyShieldDamage: (count) => {
      for (let i = 0; i < count; i += 1) {
        if (rs.shields > 0) {
          rs.shields = Math.max(0, rs.shields - 1);
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
