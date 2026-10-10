// apps/showcase-bank-shot/src/v2/boot.ts — T2.1–T2.6 v2 shell.
// §6.9.1 "one warm lamp over felt": scene modules carry the authored look
// (no ambient, one shadowed spot, vendored HDRI reflections); gameplay modules
// are unchanged (rules/racks/table/cue/ball-visuals); audio plays through the
// existing route samples until C-25 game-sfx is real (standIn R-14-09).
import { scene } from "@aura3d/engine";
import { createGame, type Game, lookManifest } from "@aura3d/game";
import { CueController, AIM_STEP, SPIN_STEP } from "../gameplay/cue";
import { RulesEngine } from "../gameplay/rules";
import {
  createTableSimulation, CUE_SPOT, BALL_RADIUS, PLAY_HALF_X, PLAY_HALF_Z
} from "../gameplay/table";
import direction from "../../art/direction";
import { ballEulerFromBody } from "../gameplay/ball-visuals";
import { createBilliardsAudio } from "../legacy/billiards-audio";
import { poolHallRoom, playfieldNodes, BALL_VISUAL_SCALE, BALL_VISUAL_LIFT, BALL_SURFACE_Y } from "./scene/world";
import { lightingNodes } from "./scene/lighting";
import { createBankShotRig, fallbackCameraNode } from "./scene/camera";
import { publishBankShotEvidence } from "./evidence";
import { applyBankShotScenario } from "./scenarios";
import { createBankShotFlow } from "./shot-flow";

const ROUTE_FLAG = "A3D_QR_ROUTE_BANK_SHOT" as const;

const target = document.getElementById("app") ?? document.body;

// ------------------------------------------------------------------ scene ----

const sim = createTableSimulation();
const rules = new RulesEngine(1);
const cueController = new CueController();
const rigState = { aimAngle: 0, rolling: false };

function buildScene() {
  return scene()
    .background("#0a0f14")
    .camera(fallbackCameraNode())
    .addMany(poolHallRoom())
    .addMany(playfieldNodes())
    .addMany(lightingNodes());
}

// ----------------------------------------------------------------- audio -----

const audio = createBilliardsAudio();
const audioCueLog: string[] = [];
let audioUnlocked = false;
function pushCue(cue: Parameters<typeof audio.cue>[0]): void {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
  void audio.cue(cue).catch(() => undefined);
}
const unlockAudio = () => {
  if (audioUnlocked) return;
  void audio.unlock().then(() => {
    audioUnlocked = true;
    void audio.cue("ambient-hall").catch(() => undefined);
  }).catch(() => undefined);
};
window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio, { passive: true });

// ------------------------------------------------------------------ game -----

const game = createGame({
  id: "showcase-bank-shot",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "tabletop",
    maxScreenFraction: 0.15,
    widgets: [
      { id: "turn", kind: "label", anchor: "top-left", label: "BANK SHOT" },
      { id: "tray", kind: "tray", anchor: "top-right", label: "SUNK" },
      { id: "power", kind: "meter", anchor: "bottom", label: "STRIKE" },
      { id: "score", kind: "score", anchor: "top", label: "SCORE" }
    ]
  },
  touch: {
    preset: "aim-drag",
    bindings: { aim: "aim-drag", strike: "strike-button", spinTop: "spin-up", spinDraw: "spin-down", pause: "menu" }
  },
  sound: {
    cues: {
      "ball-impact": { asset: "billiard-clack", variants: 3 },
      "cushion": { asset: "cushion", variants: 2 },
      "pocket": { asset: "pocket", variants: 2 },
      "cue-strike": { asset: "cue-strike", variants: 1 },
      "bed": { asset: "room-tone", variants: 1 }
    }
  },
  juice: {
    break: { trauma: 0.25, hitStopMs: 30 },
    "eight-ball-sunk": { slowMo: { scale: 0.5, ms: 600 } }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_bank_shot` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-bank-shot`).
    flags: ["route_bank_shot", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

// ------------------------------------------------------------- shot state ----

let frame = 0;
const bootedAtMs = performance.now();

const shotFlow = createBankShotFlow({ sim, rules, cueController, game, pushCue });
const { fx, doStrike, applyOutcome, resolveShotNow, advanceRack, resetSession, consumeShotEvents } = shotFlow;
const shotCtx = shotFlow.state;

// ------------------------------------------------------------- input ---------

const held = new Set<string>();
const prev = new Set<string>();
const edge = (code: string): "pressed" | "released" | "held" | "idle" => {
  const now = held.has(code), before = prev.has(code);
  return now && !before ? "pressed" : !now && before ? "released" : now ? "held" : "idle";
};

window.addEventListener("keydown", (e) => {
  if (!e.repeat) held.add(e.code);
  if (e.code === "Space" && !e.repeat) {
    if (rules.phase === "aiming" && !cueController.charging && sim.cueAtRest()) cueController.beginCharge();
    else if (rules.phase === "ball-in-hand") {
      if (sim.canPlaceCue(shotCtx.ghost.x, shotCtx.ghost.z)) {
        if (sim.restoreCueAt(shotCtx.ghost.x, shotCtx.ghost.z) && rules.confirmBallInHand()) pushCue("ball-hit");
      }
    } else if (rules.phase === "rack-won") advanceRack();
  }
  if (e.repeat) return;
  if (e.code === "KeyP" || e.code === "Escape") game.session.paused ? game.session.resume() : game.session.pause();
  else if (e.code === "KeyR") resetSession();
});
window.addEventListener("keyup", (e) => {
  held.delete(e.code);
  if (e.code === "Space" && cueController.charging) doStrike();
});
window.addEventListener("keydown", (e) => {
  if (["Space", "KeyA", "KeyD", "KeyW", "KeyS", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
}, { passive: false });

// T2.6: hidden tab auto-pauses the session (stub wires no listener).
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.session.pause("visibility");
  else game.session.resume();
});

// Touch (§7.2.1 preset "aim-drag"): drag on the canvas aims; a short tap
// arms the charge and the next tap releases the strike. The C-24 stub ships
// no rendered touch controls, so the route binds pointers directly.
const pointer = { downAt: 0, lastX: 0, moved: 0 };
target.addEventListener("pointerdown", (e) => {
  unlockAudio();
  pointer.downAt = performance.now();
  pointer.lastX = e.clientX;
  pointer.moved = 0;
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
});
target.addEventListener("pointermove", (e) => {
  if (pointer.downAt === 0 || rules.phase !== "aiming") return;
  const dx = e.clientX - pointer.lastX;
  pointer.lastX = e.clientX;
  pointer.moved += Math.abs(dx);
  if (Math.abs(dx) > 0.5) cueController.aimBy(dx * 0.005);
});
target.addEventListener("pointerup", () => {
  const tap = pointer.downAt > 0 && performance.now() - pointer.downAt < 350 && pointer.moved < 10;
  pointer.downAt = 0;
  if (!tap || rules.phase !== "aiming" || !sim.cueAtRest()) return;
  if (!cueController.charging) cueController.beginCharge();
  else doStrike();
});

// ------------------------------------------------------------ frame loop -----

const BALL_IN_HAND_STEP = 0.03;
const ballHandles = new Map<string, ReturnType<Game["app"]["nodes"]["get"]>>();

function handle(name: string) {
  if (!ballHandles.has(name)) ballHandles.set(name, game.app.nodes.get(name));
  return ballHandles.get(name);
}

function park(h: { setPosition(x: number, y: number, z: number): unknown; setScale(s: [number, number, number]): unknown } | undefined) {
  h?.setPosition(0, -30, 0);
  h?.setScale([0.0001, 0.0001, 0.0001]);
}

function poseLine(h: ReturnType<typeof handle>, x0: number, z0: number, x1: number, z1: number, y: number): void {
  if (!h) return;
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  if (len < 0.01) { park(h); return; }
  h.setPosition((x0 + x1) / 2, y, (z0 + z1) / 2);
  h.setRotation(0, Math.atan2(-dz, dx), 0);
  h.setScale([len, 0.006, 0.006]);
}

let maxAngularSpeed = 0;
const prevQuat = new Map<string, readonly [number, number, number, number]>();

function syncVisuals(): void {
  for (const pose of sim.poses()) {
    const h = handle(pose.name);
    if (!h) continue;
    const number = Number(pose.name.slice(5));
    if (rules.potted.includes(number)) {
      // §14.4 pocket drop: the ball sinks 6 cm over 120 ms, then parks.
      const t0 = shotCtx.sinkingBalls.get(number);
      if (t0 !== undefined) {
        const t = (performance.now() - t0) / 120;
        if (t < 1) {
          h.setPosition(pose.position[0], pose.position[1] + BALL_VISUAL_LIFT - 0.06 * t, pose.position[2]);
        } else {
          park(h);
          shotCtx.sinkingBalls.delete(number);
        }
      } else park(h);
      prevQuat.delete(pose.name);
      continue;
    }
    h.setScale([BALL_VISUAL_SCALE, BALL_VISUAL_SCALE, BALL_VISUAL_SCALE]);
    h.setPosition(pose.position[0], pose.position[1] + BALL_VISUAL_LIFT, pose.position[2]);
    h.setRotation(...ballEulerFromBody(pose.rotation));
    const prev = prevQuat.get(pose.name);
    if (prev) {
      const dot = Math.abs(prev[0] * pose.rotation[0] + prev[1] * pose.rotation[1] + prev[2] * pose.rotation[2] + prev[3] * pose.rotation[3]);
      const angleDelta = 2 * Math.acos(Math.min(1, dot));
      const speed = angleDelta * 60; // per-second at the fixed 60 Hz step
      if (speed > maxAngularSpeed) maxAngularSpeed = speed;
    }
    prevQuat.set(pose.name, pose.rotation);
  }
  const cueInfo = sim.ballInfos().find((b) => b.number === 0);
  const cueStick = handle("cue-stick");
  const aimLine = handle("aim-line");
  const aimBank = handle("aim-bank");
  const cueGhost = handle("cue-ghost");
  if (!cueInfo || !cueInfo.live || rules.phase === "rack-won" || rules.phase === "rack-lost") {
    park(cueStick); park(aimLine); park(aimBank); park(cueGhost);
    return;
  }
  if (rules.phase === "shooting") {
    park(aimLine); park(aimBank); park(cueGhost);
    const angle = cueController.aimAngle;
    const dirX = Math.cos(angle), dirZ = Math.sin(angle);
    // 80 ms stroke: slide the tip from the charged pull-back to contact.
    const animT = shotCtx.strokeAnim ? Math.min(1, (performance.now() - shotCtx.strokeAnim.t0) / 80) : 1;
    const back = shotCtx.strokeAnim ? shotCtx.strokeAnim.pullback : 0;
    const dist = back + (-0.045 - back) * animT;
    cueStick?.setScale([BALL_VISUAL_SCALE, BALL_VISUAL_SCALE, BALL_VISUAL_SCALE]);
    cueStick?.setPosition(cueInfo.x - dirX * dist, BALL_SURFACE_Y + 0.008, cueInfo.z - dirZ * dist);
    cueStick?.setRotation(0, -angle, 0.035);
    if (animT >= 1) shotCtx.strokeAnim = null;
    return;
  }
  if (rules.phase === "ball-in-hand") {
    park(cueStick); park(aimLine); park(aimBank);
    cueGhost?.setScale([BALL_VISUAL_SCALE, BALL_VISUAL_SCALE, BALL_VISUAL_SCALE]);
    cueGhost?.setPosition(shotCtx.ghost.x, BALL_SURFACE_Y + 0.004, shotCtx.ghost.z);
    return;
  }
  park(cueGhost);
  const angle = cueController.aimAngle;
  const dirX = Math.cos(angle), dirZ = Math.sin(angle);
  const pullback = 0.04 + cueController.state().charge * 0.28;
  cueStick?.setScale([BALL_VISUAL_SCALE, BALL_VISUAL_SCALE, BALL_VISUAL_SCALE]);
  cueStick?.setPosition(cueInfo.x - dirX * pullback, BALL_SURFACE_Y + 0.008, cueInfo.z - dirZ * pullback);
  cueStick?.setRotation(0, -angle, 0.06);
  const sweep = sim.sweepFromCue(angle);
  poseLine(aimLine, cueInfo.x, cueInfo.z, sweep.ghostX, sweep.ghostZ, BALL_SURFACE_Y + 0.002);
  if (sweep.kind === "cushion") {
    const dot = dirX * sweep.normalX + dirZ * sweep.normalZ;
    poseLine(aimBank, sweep.ghostX, sweep.ghostZ, sweep.ghostX + (dirX - 2 * dot * sweep.normalX) * 0.45, sweep.ghostZ + (dirZ - 2 * dot * sweep.normalZ) * 0.45, BALL_SURFACE_Y + 0.002);
  } else {
    park(aimBank);
  }
}

function syncHud(): void {
  const snap = rules.snapshot();
  game.hud.set("turn", `RACK ${snap.rack} · ${snap.phase.toUpperCase()}`);
  game.hud.set("tray", snap.potted.join(" "));
  game.hud.set("power", cueController.state().charge);
  game.hud.set("score", String(snap.score));
}

game.app.onFrame(({ dt }) => {
  const scaled = game.session.scaledDt(dt);
  frame += 1;
  if (game.session.paused) { prev.clear(); for (const c of held) prev.add(c); return; }

  cueController.updateCharge(scaled);
  // Touch tap charge: reach full power in ~0.9 s, then hold (strike on tap).
  if (rules.phase === "aiming") {
    if (held.has("KeyA") || held.has("ArrowLeft")) cueController.aimBy(-AIM_STEP);
    if (held.has("KeyD") || held.has("ArrowRight")) cueController.aimBy(AIM_STEP);
    if (held.has("KeyW") || held.has("ArrowUp")) cueController.spinBy(SPIN_STEP);
    if (held.has("KeyS") || held.has("ArrowDown")) cueController.spinBy(-SPIN_STEP);
  } else if (rules.phase === "ball-in-hand") {
    const m = BALL_RADIUS + 0.02;
    if (held.has("KeyA") || held.has("ArrowLeft")) shotCtx.ghost.x = Math.max(-PLAY_HALF_X + m, shotCtx.ghost.x - BALL_IN_HAND_STEP);
    if (held.has("KeyD") || held.has("ArrowRight")) shotCtx.ghost.x = Math.min(PLAY_HALF_X - m, shotCtx.ghost.x + BALL_IN_HAND_STEP);
    if (held.has("KeyW") || held.has("ArrowUp")) shotCtx.ghost.z = Math.max(-PLAY_HALF_Z + m, shotCtx.ghost.z - BALL_IN_HAND_STEP);
    if (held.has("KeyS") || held.has("ArrowDown")) shotCtx.ghost.z = Math.min(PLAY_HALF_Z - m, shotCtx.ghost.z + BALL_IN_HAND_STEP);
  }

  if (edge("Space") === "released" && cueController.charging) doStrike();

  if (rules.phase === "shooting" && shotCtx.shotInFlight) {
    sim.stepFixed(1);
    consumeShotEvents();
    shotCtx.shootingFrames += 1;
    shotCtx.stalledFrames = sim.allAtRest(0.08) ? shotCtx.stalledFrames + 1 : 0;
    if (shotCtx.stalledFrames >= 18 || shotCtx.shootingFrames >= 300) resolveShotNow();
  }

  if (rules.tickClock(scaled * 1000)) {
    pushCue("rack-fail");
    void game.hud.banner("RACK LOST", { holdMs: 2200 });
  }

  rigState.aimAngle = cueController.aimAngle;
  rigState.rolling = shotCtx.shotInFlight;

  syncVisuals();
  if (frame % 6 === 0) syncHud();
  prev.clear();
  for (const c of held) prev.add(c);
});

// ------------------------------------------------------------------ boot -----

let framePublished = 0;
game.app.onRender?.(() => { framePublished += 1; });
game.start();
void game.ready().then(() => {
  // C-22 camera rig (stand-in: applied when app.camera is real).
  const rig = createBankShotRig(rigState);
  game.app.camera?.use?.(rig, { blend: 0.4 });
  // C-05 output: "cinematic-film" preset + exposureEV 0 → linear 1.
  game.app.setOutput?.({ preset: "cinematic-film", exposure: 1 });

  publishBankShotEvidence({
    game, sim, rules, cue: cueController, rigState,
    // T2.2-post: appliedLook derives from the C-31 runtime manifest.
    appliedLook: { ...lookManifest(game.lookSource()), postPreset: "cinematic-film" },
    fxLiveCount: () => game.fx.liveCount,
    pottedThisShot: () => shotCtx.pottedThisShot,
    maxAngularSpeed: () => maxAngularSpeed,
    bootedAtMs,
    frameCount: () => framePublished,
    audioCueLog: () => audioCueLog,
    lastStrikeAudio: () => shotCtx.lastStrikeAudio
  });

  // `?scenario=<name>` — deterministic state fixtures (T2.1; state only, so
  // appliedLook stays identical to the play URL for the T2.6 parity check).
  const scenario = new URL(location.href).searchParams.get("scenario");
  if (scenario) {
    const applied = applyBankShotScenario(scenario, {
      rules,
      sim,
      applyOutcome,
      sync: () => { syncVisuals(); syncHud(); }
    });
    if (applied) (window as unknown as Record<string, unknown>).__BANK_SHOT_SCENARIO__ = applied;
  }

  // C-24 beacon: live getters so audits/T2.6 read the mounted app + scene
  // (snapshotForAudit expects beacon.app.scene / beacon.app.diagnostics()).
  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: game.id,
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return framePublished; },
    firstFrameAt: performance.now(),
    sessionStartedAt: performance.now()
  };
  syncHud();
});
