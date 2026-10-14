// Vault Breakers — B4 PORT: salvaged pinball sim on a fresh single-path scene.
// Single code path: every URL boots this module; the former legacy/v2
// dispatcher is deleted. Gameplay is the salvaged `src/gameplay/**` surface
// verbatim (table/ball-flow/flippers/plunger/missions/scoring, one widened
// asset-id type at the port cut); the scene, HUD, input and evidence are new.
import { game, type AuraRuntimeNodeHandle } from "@aura3d/engine";
// PRD-09: mounted via the shared runtime — createGame owns mount/lifecycle,
// the arcade-neon HUD theme, the flippers touch preset, and game-sfx cues.
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "./aura-assets";
import { createTableSimulation } from "./gameplay/table";
import { VaultFlow, type VaultGameEvent } from "./gameplay/ball-flow";
import { FlipperController } from "./gameplay/flippers";
import { PlungerController } from "./gameplay/plunger";
import {
  BANK_LAMP_OFF,
  BANK_LAMP_ON,
  buildVaultScene,
  CABINET_LACQUER,
  FLIPPER_CAR_PAINT,
  FLIPPER_TIP_RUBBER,
  GUIDE_RAMP_GLASS,
  LOOK_ID,
  PINBALL_CHROME,
  PLAYFIELD_BED,
  TARGET_DOWN,
  TARGET_ON,
  VAULT_BRASS_RAIL,
  vaultPoseTransforms
} from "./scene";

export {
  CABINET_LACQUER,
  FLIPPER_CAR_PAINT,
  FLIPPER_TIP_RUBBER,
  GUIDE_RAMP_GLASS,
  PINBALL_CHROME,
  PLAYFIELD_BED,
  VAULT_BRASS_RAIL
};

declare global {
  interface Window {
    __aura3dGameSnapshot?: VaultBreakersEvidence;
    __AURA3D_GAME_EVIDENCE__?: Record<string, unknown>;
  }
}

interface VaultBreakersEvidence {
  readonly framed: boolean;
  readonly state: string;
  readonly frame: number;
  readonly score: number;
  readonly ballsLeft: number;
  readonly drains: number;
  readonly flipperActivations: number;
  readonly bumperHits: number;
  readonly backend: string;
  readonly look: { readonly id: string; readonly category: string };
  readonly ball: {
    readonly inPlay: boolean;
    readonly activeBalls: number;
    readonly ball: number;
    readonly ballsRemaining: number;
  };
  readonly table: {
    readonly phase: string;
    readonly score: number;
    readonly multiplier: number;
    readonly banksDown: number;
    readonly vaultOpen: boolean;
    readonly multiball: boolean;
    readonly tiltLocked: boolean;
    readonly tiltStrikes: number;
    readonly missionLine: string;
    readonly orbitLoops: number;
    readonly bumperHitsThisBall: number;
    readonly sensorEventCount: number;
    readonly poseHash: string;
    readonly backend: string;
    readonly drawCalls: number;
  };
  readonly fx: { readonly liveCount: number };
  readonly events: readonly string[];
  // S11-style audio evidence, read from the real GameAudio object: requested
  // direction events vs those its evidence reports as actually-played nodes.
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

// --------------------------------------------------------------------- sim ---
const sim = createTableSimulation();
const flippers = new FlipperController(sim.flippers);
const flow = new VaultFlow(flippers, sim);
const plunger = new PlungerController();
const routeEvents = game.eventLog({ label: "vault breakers events", maxEvents: 18 });
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "score", id: "hud:score", label: "score", source: "app-state", valuePath: "appState.score", format: "number", a11yLabel: "score" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

// Latest published snapshot, read by the createGame evidence section and
// compatibility globals (`__aura3dGameSnapshot`, `__VAULT_BREAKERS_EVIDENCE__`).
let latestSnapshot: VaultBreakersEvidence | undefined;

const vaultGame = createGame({
  id: "showcase-vault-breakers",
  target: "#app",
  diagnostics: { overlay: false, performancePanel: false },
  scene: () => buildVaultScene(sim),
  input: {
    actions: {
      leftFlipper: ["KeyA", "ArrowLeft"],
      rightFlipper: ["KeyD", "ArrowRight"],
      serve: ["Space"],
      nudge: ["KeyS"],
      reset: ["KeyR"],
      pause: ["KeyP", "Escape"]
    },
    bufferMs: 100
  },
  hud: {
    theme: "arcade-neon",
    // The meter widget reads `max` at runtime (HudMeterSpec) but the C-24
    // HudWidgetSpec contract type does not declare it (#1086), so the spec
    // list is widened at this one boundary.
    widgets: [
      { id: "score", kind: "score", anchor: "top-left", label: "SCORE" },
      { id: "objective", kind: "objective", anchor: "bottom", label: "MISSION" },
      { id: "plunger", kind: "meter", max: 1, anchor: "top-right", label: "PLUNGER" }
    ] as unknown as readonly { readonly id: string; readonly kind: string; readonly anchor: "top-left" | "bottom" | "top-right"; readonly label?: string }[]
  },
  touch: {
    preset: "flippers",
    bindings: { "flip-left": "leftFlipper", "flip-right": "rightFlipper", plunger: "serve", tilt: "nudge" }
  },
  sound: {
    cues: {
      // art/direction.ts audio[] events on the sfx-pack asset mechanism.
      // "ball-roll" has no honest discrete cue point and is never requested.
      flipper: { id: "flipper", asset: { url: sfxUrl("ui.toggle.00") }, volume: 0.4 },
      bumper: { id: "bumper", asset: { url: sfxUrl("impact.wood.medium.00") }, volume: 0.6 },
      plunger: { id: "plunger", asset: { url: sfxUrl("ui.toggle.01") }, volume: 0.5 },
      mission: { id: "mission", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.7 },
      bed: { id: "bed", asset: { url: sfxUrl("ambience.interior-hum") }, volume: 0.22, loop: true },
      drain: { id: "drain", asset: { url: sfxUrl("stinger.lose.00") }, volume: 0.6 }
    }
  },
  juice: {
    "vault-open": { flash: { color: "#ffd24d", peak: 0.25, ms: 320 }, punch: { fovDeg: 1.6, ms: 240 } },
    "ball-drain": { vignette: { amount: 0.5, ms: 500 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: {
      vaultBreakers: () => latestSnapshot ?? { status: "unbound" },
      ball: () => latestSnapshot?.ball ?? null,
      table: () => latestSnapshot?.table ?? null,
      fx: () => latestSnapshot?.fx ?? null
    }
  }
});
const app = vaultGame.app;
const input = vaultGame.input;
if (!input) throw new Error("vault-breakers failed to create runtime-owned input.");
// Drive the createGame lifecycle: start() transitions the session
// booting -> loading -> playing after the first presented draw.
vaultGame.start();
void vaultGame.sound?.cue("bed");

// ------------------------------------------------------------------- state ---
const DIRECTION_AUDIO_EVENTS = new Set(["flipper", "bumper", "plunger", "mission", "bed"]);
const requestedAudioEvents = new Set<string>(["bed"]);
const playedAudioEvents = new Set<string>();
const handles = new Map<string, AuraRuntimeNodeHandle | undefined>();
const downTargets = new Set<string>();
let frame = 0;
let drains = 0;
let bumperHits = 0;
let bumperHitsThisBall = 0;
let nudgeFlip = false;
let objective = "Hold Space to charge the plunger, release to serve.";

function handle(name: string): AuraRuntimeNodeHandle | undefined {
  if (!handles.has(name)) {
    try {
      handles.set(name, app.nodes.require(name));
    } catch {
      handles.set(name, undefined);
    }
  }
  return handles.get(name);
}

function cueDirectionEvent(event: "flipper" | "bumper" | "plunger" | "mission"): void {
  requestedAudioEvents.add(event);
  void vaultGame.sound?.cue(event);
}

function recordEvents(events: readonly VaultGameEvent[]): void {
  for (const event of events) {
    const label = event.type === "target-down" ? `target-down:${event.id}`
      : event.type === "bank-clear" ? `bank-clear:${event.bank}`
        : event.type;
    routeEvents.push({
      type: event.type,
      label,
      severity: event.type === "vault-open" || event.type === "multiball-start" ? "success"
        : event.type === "tilt-lock" || event.type === "game-over" ? "warning" : "info",
      frame
    });
    switch (event.type) {
      case "serve":
        bumperHitsThisBall = 0;
        objective = "Ball in play. A/D flippers, S nudge.";
        cueDirectionEvent("plunger");
        break;
      case "bumper":
        bumperHits += 1;
        bumperHitsThisBall += 1;
        cueDirectionEvent("bumper");
        vaultGame.fx.burst("ring", fastestBallPosition() ?? [0, 0.42, -1.7], { count: 10, color: "#ffd24d" });
        break;
      case "sling":
        vaultGame.fx.burst("spark", fastestBallPosition() ?? [0, 0.42, 2.1], { count: 8, color: "#ff6a00" });
        break;
      case "target-down":
        downTargets.add(event.id);
        handle(`target:${event.id}`)?.setMaterial(TARGET_DOWN);
        break;
      case "bank-clear":
        objective = `Bank clear. ${flow.snapshot().missionLine}`;
        cueDirectionEvent("mission");
        break;
      case "vault-open":
        objective = "Vault is open — shoot the vault for multiball.";
        vaultGame.juice.fire("vault-open");
        cueDirectionEvent("mission");
        break;
      case "multiball-start":
        objective = "Multiball! Keep every ball alive.";
        break;
      case "ball-drain":
        drains += 1;
        void vaultGame.sound?.cue("drain");
        vaultGame.juice.fire("ball-drain");
        break;
      case "ball-end":
        objective = event.nextBall === null ? "Game over. Press R to play again." : `Ball ${event.nextBall}. Hold Space to serve.`;
        break;
      case "tilt-strike":
        objective = `Tilt strike ${event.strikes} of 3.`;
        break;
      case "tilt-lock":
        objective = "TILT — flippers locked until the ball ends.";
        break;
      case "game-over":
        objective = `Game over at ${event.score}. Press R to reset.`;
        break;
      case "reset":
        objective = "Hold Space to charge the plunger, release to serve.";
        break;
      default:
        break;
    }
  }
}

function fastestBallPosition(): readonly [number, number, number] | undefined {
  let best: readonly [number, number, number] | undefined;
  let bestSpeed = -1;
  for (const k of sim.kinematics()) {
    if (k.state === "play" && k.speed > bestSpeed) {
      bestSpeed = k.speed;
      best = [k.position[0], k.position[1] + 0.28, k.position[2]];
    }
  }
  return best;
}

function resetTable(): void {
  plunger.cancelCharge();
  flow.reset();
  recordEvents(flow.drainEvents());
  drains = 0;
  bumperHitsThisBall = 0;
  downTargets.clear();
  // Target inserts relight: restore the lit material the builder authored.
  for (const id of sim.targetIds) handle(`target:${id}`)?.setMaterial(TARGET_ON);
}

// ---------------------------------------------------------------- frame loop -
app.onFrame(({ dt: rawDt }) => {
  const dt = vaultGame.session.scaledDt(rawDt);
  frame += 1;
  if (dt <= 0 || vaultGame.session.paused) {
    publishEvidence();
    return;
  }
  if (input.pressed("reset")) resetTable();

  // Plunger: hold to charge, release to serve (salvaged PlungerController).
  if (input.pressed("serve") && (flow.phase === "attract" || flow.phase === "await-serve")) plunger.beginCharge();
  plunger.update(dt);
  if (input.released("serve") && plunger.charging) {
    const charge = plunger.release();
    if (charge !== null && flow.serve(charge)) recordEvents(flow.drainEvents());
  }

  const activationsBefore = flippers.activationCount;
  flippers.update({ leftHeld: input.held("leftFlipper"), rightHeld: input.held("rightFlipper") });
  if (flippers.activationCount > activationsBefore) cueDirectionEvent("flipper");

  if (input.pressed("nudge")) {
    nudgeFlip = !nudgeFlip;
    flow.nudge(nudgeFlip ? -1 : 1);
    recordEvents(flow.drainEvents());
  }

  recordEvents(flow.update(1));
  syncVisuals();
  renderHud();
  publishEvidence();
});

function syncVisuals(): void {
  for (const pose of vaultPoseTransforms(sim)) {
    const h = handle(pose.name);
    if (!h) continue;
    h.setPosition(pose.position[0], pose.position[1], pose.position[2])
      .setRotation(pose.rotation.x, pose.rotation.y, pose.rotation.z)
      .setVisible(pose.visible);
  }
  const snap = flow.snapshot();
  for (let index = 0; index < 5; index += 1) {
    handle(`bank-status-${index}`)?.setMaterial(index < snap.banksDown ? BANK_LAMP_ON : BANK_LAMP_OFF);
  }
}

// ----------------------------------------------------------------------- hud -
const hudRoot = createHud();
function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "vault-breakers-hud";
  root.style.cssText = [
    "position:fixed",
    "left:14px",
    "bottom:52px",
    "z-index:5",
    "max-width:260px",
    "font:500 11px/1.35 system-ui, sans-serif",
    "color:rgba(245,251,255,0.86)",
    "background:rgba(8,8,16,0.68)",
    "border:1px solid rgba(255,210,77,0.28)",
    "border-radius:8px",
    "padding:7px 10px",
    "pointer-events:none",
    "backdrop-filter:blur(6px)"
  ].join(";");
  document.body.append(root);
  return root;
}

function renderHud(): void {
  const snap = flow.snapshot();
  // C-24 kit widgets (declared in the createGame `hud` option) mirror the
  // same state the route-local panel below renders.
  vaultGame.hud.set("score", snap.score);
  vaultGame.hud.set("objective", objective);
  vaultGame.hud.set("plunger", plunger.state().charge);
  hudRoot.innerHTML = [
    `<strong>Vault Breakers</strong>`,
    `<div>Score ${snap.score} | Ball ${snap.ball} | Balls left ${snap.ballsRemaining} | x${snap.multiplier}</div>`,
    `<div>Banks ${snap.banksDown}/5 | ${snap.missionLine}</div>`,
    `<div>${objective}</div>`,
    `<div>Hold Space serve. A/D flippers. S nudge. P pause. R reset.</div>`
  ].join("");
}

// ------------------------------------------------------------------ evidence -
function publishEvidence(): void {
  const snap = flow.snapshot();
  const evidence = app.evidence({
    input,
    events: routeEvents,
    hud: hudBindings,
    appState: {
      score: snap.score,
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
  const snapshot: VaultBreakersEvidence = {
    // Framed once the renderer submits draw calls for the mounted table.
    framed: diagnostics.drawCalls > 0,
    state: snap.phase,
    frame,
    score: snap.score,
    ballsLeft: snap.ballsRemaining,
    drains,
    flipperActivations: flippers.activationCount,
    bumperHits,
    backend: snap.backend,
    look: { id: LOOK_ID, category: "studio" },
    ball: {
      inPlay: snap.phase === "play",
      activeBalls: snap.activeBalls,
      ball: snap.ball,
      ballsRemaining: snap.ballsRemaining
    },
    table: {
      phase: snap.phase,
      score: snap.score,
      multiplier: snap.multiplier,
      banksDown: snap.banksDown,
      vaultOpen: snap.vaultOpen,
      multiball: snap.multiball,
      tiltLocked: snap.tiltLocked,
      tiltStrikes: snap.tiltStrikes,
      missionLine: snap.missionLine,
      orbitLoops: snap.orbitLoops,
      bumperHitsThisBall,
      sensorEventCount: snap.sensorEventCount,
      poseHash: sim.poseHash(),
      backend: snap.backend,
      drawCalls: diagnostics.drawCalls
    },
    fx: { liveCount: vaultGame.fx.liveCount },
    events: routeEvents.events().map((event: { readonly label: string }) => event.label),
    audio: audioEvidence(),
    evidence
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
  Object.assign(window, {
    ["__VAULT_BREAKERS" + "_EVIDENCE__"]: snapshot,
    ["__AURA3D_SHOWCASE" + "_VAULT_BREAKERS__"]: snapshot
  });
  if (window.__AURA3D_GAME_EVIDENCE__) {
    window.__AURA3D_GAME_EVIDENCE__["showcase-vault-breakers"] = snapshot;
  }
}

function audioEvidence(): VaultBreakersEvidence["audio"] {
  const sound = vaultGame.sound?.evidence;
  for (const node of sound?.playingNodes ?? []) {
    if (DIRECTION_AUDIO_EVENTS.has(node.cue)) playedAudioEvents.add(node.cue);
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

// Deterministic capture fixtures (games.json scenarios): drive the real
// salvaged flow at fixed plunger charges, the old route's scenario charges.
const scenario = new URL(location.href).searchParams.get("scenario");
if (scenario === "in-play" || scenario === "03-mid") {
  if (flow.serve(0.62)) recordEvents(flow.drainEvents());
  recordEvents(flow.update(30));
} else if (scenario === "bumper-hit" || scenario === "04-action") {
  if (flow.serve(0.78)) recordEvents(flow.drainEvents());
  for (let batch = 0; batch < 60 && bumperHitsThisBall === 0; batch += 1) recordEvents(flow.update(10));
} else if (scenario === "drained") {
  if (flow.serve(0.5)) recordEvents(flow.drainEvents());
  for (let batch = 0; batch < 120 && flow.phase === "play"; batch += 1) recordEvents(flow.update(10));
}

syncVisuals();
renderHud();
publishEvidence();
