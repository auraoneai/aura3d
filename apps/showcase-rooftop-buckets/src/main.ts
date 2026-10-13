// Rooftop Buckets — ported onto the salvaged deterministic core.
// Single code path: every URL (including ?scene=default) boots this module;
// the former legacy/v2 dispatcher is deleted. Gameplay truth lives in the
// salvaged modules under src/gameplay/ (court spots, Rapier hoop-sim, rim
// hoop modes, the pure five-heat scoring loop, and solver-driven shot
// flight); this file is only the fresh scene, input, HUD and evidence shell
// around them. No basketball kit is used or claimed.
import {
  camera,
  game,
  looks,
  model,
  scene,
  type AuraNodeInput,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
// PRD-09: mounted via the shared runtime — createGame owns mount/lifecycle,
// the sports-broadcast HUD theme, the dpad-2btn touch preset, game-sfx-core
// cues, and the juice event map (no route-local hit-stop).
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "./aura-assets";
import { BACKBOARD_POSITION, COURT_SPOTS, HOOP_BASE_POSITION } from "./gameplay/court";
import { initialHoopState, updateHoop, type HoopState } from "./gameplay/rim";
import {
  calculateLaunchVelocity,
  createBallAtSpot,
  predictFirstFlight,
  stepBall,
  type BallState
} from "./gameplay/shot";
import {
  advanceHeat,
  heatConfig,
  initialScoreState,
  recordShotOutcome,
  updateClocks,
  type GameScoreState
} from "./gameplay/scoring";

declare global {
  interface Window {
    __aura3dGameSnapshot?: RooftopBucketsEvidence;
  }
}

interface RooftopBucketsEvidence {
  readonly framed: boolean;
  readonly state: GameScoreState["state"] | "paused-local";
  readonly heat: number;
  readonly heatName: string;
  readonly score: number;
  readonly target: number;
  readonly streak: number;
  readonly onFire: boolean;
  readonly shots: number;
  readonly makes: number;
  readonly misses: number;
  readonly madeSpotIds: readonly number[];
  readonly shotClock: number;
  readonly heatTimer: number;
  readonly spot: { readonly id: number; readonly name: string; readonly points: number };
  readonly charge: { readonly power: number; readonly pitch: number; readonly charging: boolean };
  readonly ball: {
    readonly inFlight: boolean;
    readonly settled: boolean;
    readonly hasScored: boolean;
    readonly result: string | null;
    readonly position: readonly [number, number, number];
  };
  readonly lastResult: string | null;
  readonly events: readonly string[];
  readonly look: { readonly id: string; readonly category: string };
  readonly drawCalls: number;
  // Audio evidence, read from the real GameAudio object every frame (the
  // Blockfall pattern): requested direction events vs the subset the sound
  // object's own evidence reports as actually-played nodes. GameAudio
  // evidence exposes no synth/asset cue split, so none is published.
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

const LOOK_ID = "golden-hour" as const;
// The athlete GLBs report a raw minimum Y of -1.016 at this scale, so the
// floor offset keeps their feet on the court plane (y = 0).
const ATHLETE_SCALE = 1.18;
const ATHLETE_FLOOR_OFFSET = 1.016 * ATHLETE_SCALE;
// rooftopBall is unit-normalized (~1 m bounds); 0.24 renders the regulation
// 0.24 m diameter the solver's BALL_RADIUS (0.12 m) describes.
const BALL_SCALE = 0.24;
const AIM_DOTS = 6;
const CHARGE_RATE = 1.6; // power units per second, ping-pong while held

const inputOptions = {
  actions: {
    spotLeft: ["KeyA", "ArrowLeft"],
    spotRight: ["KeyD", "ArrowRight"],
    aimUp: ["KeyW", "ArrowUp"],
    aimDown: ["KeyS", "ArrowDown"],
    shoot: ["Space"],
    pause: ["KeyP"],
    reset: ["KeyR"]
  },
  bufferMs: 100
} as const;

const routeEvents = game.eventLog({ label: "rooftop buckets events", maxEvents: 18 });
// HUD bindings as descriptor literals (mirrored by the createGame `hud`
// widgets below, which hud.set drives from the same state every frame).
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "score", id: "hud:score", label: "score", source: "app-state", valuePath: "appState.score", format: "number", a11yLabel: "score" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

// Latest published snapshot, read by the createGame evidence section below.
// `window.__aura3dGameSnapshot` stays the sole evidence global.
let latestSnapshot: RooftopBucketsEvidence | undefined;

// ------------------------------------------------------------ game state ----
// Default spot is the free-throw spot (index 1): the deterministic sweet-power
// make the salvaged rapier-hoop suite proves headless starts here.
let scoreState: GameScoreState = initialScoreState(1);
let hoopState: HoopState = initialHoopState(1);
let spotIndex = 1;
let ballState: BallState = createBallAtSpot(COURT_SPOTS[spotIndex]!, false);
let charge = { power: 0, pitch: 0, charging: false, direction: 1 };
let paused = false;
let elapsed = 0;
let objective = heatObjective();
let aimCacheKey = "";
let aimPoints: readonly { readonly x: number; readonly y: number; readonly z: number }[] = [];

function heatObjective(): string {
  const config = heatConfig(scoreState.heat);
  return `Heat ${config.heat} — ${config.name}: ${config.objective}. Hold Space to charge, release to shoot.`;
}

const bucketsGame = createGame({
  id: "rooftop-buckets",
  target: "#app",
  diagnostics: { overlay: true, performancePanel: true },
  scene: () => buildScene(),
  input: inputOptions,
  hud: {
    theme: "sports-broadcast",
    widgets: [
      { id: "score", kind: "score", anchor: "top-left", label: "SCORE" },
      { id: "clock", kind: "timer", anchor: "top-right", label: "SHOT CLOCK" },
      { id: "heat", kind: "prompt", anchor: "top", label: "HEAT" },
      { id: "charge", kind: "meter", anchor: "bottom", label: "CHARGE" },
      { id: "objective", kind: "objective", anchor: "bottom", label: "OBJECTIVE" }
    ]
  },
  touch: {
    preset: "dpad-2btn",
    bindings: { left: "spotLeft", right: "spotRight", dash: "aimDown", jump: "aimUp", attack: "shoot" }
  },
  sound: {
    cues: {
      // art/direction.ts audio[] events (bounce / rim / swish / crowd / bed)
      // on the same sfx-pack asset mechanism Blockfall uses.
      bounce: { id: "bounce", asset: { url: sfxUrl("impact.wood.light.00") }, volume: 0.5 },
      rim: { id: "rim", asset: { url: sfxUrl("impact.wood.medium.00") }, volume: 0.6 },
      swish: { id: "swish", asset: { url: sfxUrl("pickup.coin.00") }, volume: 0.8 },
      crowd: { id: "crowd", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.7 },
      bed: { id: "bed", asset: { url: sfxUrl("ambience.interior-hum") }, volume: 0.25, loop: true }
    }
  },
  juice: {
    swish: { flash: { color: "#ffd24d", peak: 0.18, ms: 220 }, punch: { fovDeg: 1.5, ms: 200 }, rumble: { weak: 0.4, ms: 160 } },
    rim: { shake: 0.12, rumble: { weak: 0.3, ms: 100 } },
    "game-over": { flash: { color: "#d88791", peak: 0.3, ms: 400 }, vignette: { amount: 0.6, ms: 900 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: { rooftopBuckets: () => latestSnapshot ?? { status: "unbound" } }
  }
});
const app = bucketsGame.app;
if (!bucketsGame.input) throw new Error("rooftop-buckets failed to create runtime-owned input.");
const input = bucketsGame.input;
// Drive the createGame lifecycle the way Blockfall does: start() transitions
// the session booting -> loading, starts the runtime, and ready() lands it
// in "playing" after the first presented draw.
bucketsGame.start();
// Direction bed: the looping city-dusk ambience, cued once at start. This
// base predates the GameAudio /probes/ fix, so pre-gesture the cue may be
// suppressed (or 404 in lane captures until the stack merge); the published
// audio evidence reports requested vs played honestly either way.
void bucketsGame.sound?.cue("bed");

const ballNode: AuraRuntimeNodeHandle = app.nodes.require("ball");
const shooterNode: AuraRuntimeNodeHandle = app.nodes.require("shooter");
const defenderNode: AuraRuntimeNodeHandle = app.nodes.require("defender");
const aimNodes: AuraRuntimeNodeHandle[] = Array.from({ length: AIM_DOTS }, (_, i) => app.nodes.require(`aim-dot-${i}`));
const hudRoot = createHud();

// Direction audio[] events this route has cued, and the subset the sound
// object's evidence has reported as actually-played nodes.
const DIRECTION_AUDIO_EVENTS = new Set(["bounce", "rim", "swish", "crowd", "bed"]);
const requestedAudioEvents = new Set<string>(["bed"]);
const playedAudioEvents = new Set<string>();

function cueDirectionEvent(event: "bounce" | "rim" | "swish" | "crowd"): void {
  requestedAudioEvents.add(event);
  void bucketsGame.sound?.cue(event);
}

// Fixed broadcast framing: the whole shooting lane (spots at z 4.2-6.8, rim
// at the origin) stays in frame from one static rig; the scene camera spec
// below carries the same pose as the compiled fallback.
app.camera?.use(
  camera.rigs.static({
    position: [8.5, 5.2, 11.5],
    target: [0, 1.6, 2.2],
    fov: 50
  })
);

app.onFrame(({ dt: rawDt }) => {
  const dt = Math.min(Math.max(rawDt, 0), 0.1);
  if (input.pressed("reset")) fullReset();
  if (input.pressed("pause")) {
    paused = !paused;
    routeEvents.push({ type: paused ? "pause" : "resume", label: paused ? "pause" : "resume" });
  }
  if (!paused && dt > 0) stepGame(dt);
  syncNodes();
  renderHud();
  publishEvidence();
});

syncNodes();
renderHud();
publishEvidence();

// ------------------------------------------------------------- game flow ----

function stepGame(dt: number): void {
  elapsed += dt;
  const spot = COURT_SPOTS[spotIndex]!;

  // Spot + aim adjust only between possessions; the ball is solver-owned in
  // flight and the salvaged launch vector is fixed at release.
  if (!ballState.inFlight && scoreState.state === "playing") {
    if (input.pressed("spotLeft")) changeSpot(-1);
    if (input.pressed("spotRight")) changeSpot(1);
    if (input.held("aimUp")) charge.pitch = Math.min(1, charge.pitch + dt * 1.4);
    if (input.held("aimDown")) charge.pitch = Math.max(-1, charge.pitch - dt * 1.4);

    if (input.pressed("shoot")) {
      charge = { power: 0, pitch: charge.pitch, charging: true, direction: 1 };
    }
    if (charge.charging && input.held("shoot")) {
      charge.power += charge.direction * dt * CHARGE_RATE;
      if (charge.power >= 1) { charge.power = 1; charge.direction = -1; }
      else if (charge.power <= 0) { charge.power = 0; charge.direction = 1; }
    }
    if (charge.charging && input.released("shoot")) {
      releaseShot(charge.power, charge.pitch);
      charge.charging = false;
    }
  }

  // Heat-clear advance: the salvaged loop owns the transition; the shell
  // only re-spots for the three-spot heat and re-parks the ball.
  if (scoreState.state === "heat-cleared") {
    scoreState = advanceHeat(scoreState);
    if (scoreState.heat === 2) spotIndex = 0;
    hoopState = initialHoopState(scoreState.heat);
    routeEvents.push({ type: "heat-advance", label: `heat:${scoreState.heat}`, severity: "success" });
    cueDirectionEvent("crowd");
    objective = heatObjective();
    resetBallToSpot();
  }

  hoopState = updateHoop(hoopState, scoreState.heat, elapsed, COURT_SPOTS[spotIndex]!.x);

  if (ballState.inFlight) {
    const hadScored = ballState.hasScored;
    const { ball: next, events } = stepBall(ballState, hoopState, dt);
    ballState = next;
    if (events.clankedRim) {
      cueDirectionEvent("rim");
      bucketsGame.juice.fire("rim");
      routeEvents.push({ type: "rim", label: "rim" });
    }
    if (events.thuddedBoard) routeEvents.push({ type: "board", label: "board" });
    if (events.swishedNet && !hadScored && ballState.hasScored) {
      cueDirectionEvent("swish");
      bucketsGame.juice.fire("swish");
    }
    if (events.settled) settleShot();
  }

  const { state: clockNext, event: clockEvent } = updateClocks(scoreState, dt, ballState.inFlight);
  scoreState = clockNext;
  if (clockEvent.isClockViolation) {
    routeEvents.push({ type: "violation", label: "shot-clock violation", severity: "warning" });
    objective = "Shot-clock violation. Ball re-spotted — shoot sooner.";
    if (scoreState.state === "playing") resetBallToSpot();
  }
  if (clockEvent.isGameOver) onTerminal(false);
  if (clockEvent.isGoldWin) onTerminal(true);
  if (clockEvent.isHeatCleared) objective = heatObjective();
  void spot;
}

function changeSpot(delta: number): void {
  spotIndex = Math.max(0, Math.min(COURT_SPOTS.length - 1, spotIndex + delta));
  resetBallToSpot();
  routeEvents.push({ type: "spot", label: `spot:${COURT_SPOTS[spotIndex]!.id}` });
}

function releaseShot(power: number, pitch: number): void {
  if (ballState.inFlight || scoreState.state !== "playing") return;
  const spot = COURT_SPOTS[spotIndex]!;
  const vel = calculateLaunchVelocity(spot, power, pitch, hoopState);
  ballState = { ...ballState, vx: vel.vx, vy: vel.vy, vz: vel.vz, inFlight: true, settled: false, flightTimer: 0 };
  routeEvents.push({ type: "release", label: `release:${spot.id}` });
}

function settleShot(): void {
  const spot = COURT_SPOTS[spotIndex]!;
  const { state: next, event } = recordShotOutcome(
    scoreState,
    ballState.result ?? "brick",
    spot.points,
    scoreState.heat === 5,
    spot.id
  );
  scoreState = next;
  routeEvents.push({
    type: ballState.result ?? "brick",
    label: `${ballState.result ?? "brick"}:+${event.pointsEarned}`,
    severity: event.pointsEarned > 0 ? "success" : "info"
  });
  if (event.pointsEarned > 0) {
    objective = `${ballState.result} — +${event.pointsEarned}. ${heatObjective()}`;
    if (event.isFireIgnited) objective = `On fire! Makes pay double. ${heatObjective()}`;
  } else {
    // A settled miss bounced out on the asphalt: the direction bounce cue.
    cueDirectionEvent("bounce");
    objective = `Miss (${ballState.result ?? "brick"}). ${heatObjective()}`;
  }
  if (event.isGoldWin) onTerminal(true);
  else if (event.isGameOver) onTerminal(false);
  else if (scoreState.state === "playing") resetBallToSpot();
  // heat-cleared is advanced at the top of the next stepGame tick.
}

function onTerminal(won: boolean): void {
  objective = won
    ? "Victory — all five heats cleared. Press R to run it back."
    : "Game over. Press R to reset the session.";
  routeEvents.push({ type: won ? "victory" : "game-over", label: won ? "victory" : "game-over", severity: won ? "success" : "warning" });
  if (won) cueDirectionEvent("crowd");
  else bucketsGame.juice.fire("game-over");
}

function resetBallToSpot(): void {
  ballState = createBallAtSpot(COURT_SPOTS[spotIndex]!, scoreState.heat === 5);
  charge = { power: 0, pitch: charge.pitch, charging: false, direction: 1 };
  aimCacheKey = "";
}

function fullReset(): void {
  scoreState = initialScoreState(1);
  hoopState = initialHoopState(1);
  spotIndex = 1;
  elapsed = 0;
  paused = false;
  charge = { power: 0, pitch: 0, charging: false, direction: 1 };
  objective = heatObjective();
  resetBallToSpot();
  routeEvents.push({ type: "reset", label: "reset" });
}

// ------------------------------------------------------------------ scene ----

function buildScene() {
  const spot = COURT_SPOTS[spotIndex]!;
  const nodes: AuraNodeInput[] = [
    model(assets.rooftopCourt, { name: "rooftop court", castShadow: false })
      .position(0, -0.1, 4),
    model(assets.rooftopBackboard, { name: "backboard", castShadow: true })
      .position(BACKBOARD_POSITION.x, BACKBOARD_POSITION.y, BACKBOARD_POSITION.z),
    model(assets.rooftopRim, { name: "rim", castShadow: true })
      .position(HOOP_BASE_POSITION.x, HOOP_BASE_POSITION.y, HOOP_BASE_POSITION.z),
    model(assets.rooftopBall, { name: "basketball", castShadow: true })
      .position(spot.x, 1.8, spot.z)
      .scale(BALL_SCALE)
      .runtime(game.runtimeNode("ball", { tags: ["basketball", "runtime"] })),
    model(assets.rooftopLayupScorer, { name: "shooter", castShadow: true })
      .position(spot.x, ATHLETE_FLOOR_OFFSET, spot.z)
      .scale(ATHLETE_SCALE)
      .animate({ clip: "Ready", loop: true, speed: 1 })
      .runtime(game.runtimeNode("shooter", { tags: ["shooter", "runtime"] })),
    model(assets.rooftopDefender, { name: "defender", castShadow: true })
      .position(0, ATHLETE_FLOOR_OFFSET, 2.2)
      .scale(ATHLETE_SCALE)
      .animate({ clip: "Plant", loop: true, speed: 1 })
      .runtime(game.runtimeNode("defender", { tags: ["defender", "runtime"] })),
    ...Array.from({ length: AIM_DOTS }, (_, i) =>
      model(assets.rooftopBall, { name: `aim guide dot ${i}` })
        .position(0, -50, 0)
        .scale(0.06)
        .runtime(game.runtimeNode(`aim-dot-${i}`, { tags: ["aim-guide", "runtime"] }))
    )
  ];

  // The golden-hour look supplies the dusk sky, warm key light, fog and
  // grade — no ambient fill, background override or debug overlay.
  return scene()
    .add(looks.preset(LOOK_ID))
    .addMany(nodes)
    .camera(camera.perspective({ position: [8.5, 5.2, 11.5], target: [0, 1.6, 2.2], fov: 50 }));
}

function syncNodes(): void {
  ballNode.setPosition(ballState.x, ballState.y, ballState.z);
  const spot = COURT_SPOTS[spotIndex]!;
  const yaw = Math.atan2(-(HOOP_BASE_POSITION.x - spot.x), -(HOOP_BASE_POSITION.z - spot.z));
  shooterNode.setPosition(spot.x, ATHLETE_FLOOR_OFFSET, spot.z).setRotation(0, yaw, 0);
  if (hoopState.defenderActive) {
    defenderNode
      .setVisible(true)
      .setPosition(hoopState.defenderX, ATHLETE_FLOOR_OFFSET + Math.max(0, hoopState.defenderY - 0.9), hoopState.defenderZ);
  } else {
    defenderNode.setVisible(false);
  }
  syncAimGuide();
}

// The guide is the salvaged solver's own first-flight prediction (the same
// predictFirstFlight the heats suite pins to real flight), recomputed only
// when spot, power or pitch materially change.
function syncAimGuide(): void {
  if (ballState.inFlight || scoreState.state !== "playing") {
    aimNodes.forEach((node) => node.setVisible(false));
    return;
  }
  const spot = COURT_SPOTS[spotIndex]!;
  const power = charge.charging ? charge.power : spot.sweetPower;
  const key = `${spotIndex}|${Math.round(power * 50)}|${Math.round(charge.pitch * 20)}|${scoreState.heat}`;
  if (key !== aimCacheKey) {
    aimCacheKey = key;
    aimPoints = predictFirstFlight(spot, power, charge.pitch, hoopState, 48, 8);
  }
  aimNodes.forEach((node, i) => {
    const point = aimPoints[i + 1];
    if (!point) {
      node.setVisible(false);
      return;
    }
    node.setVisible(true).setPosition(point.x, point.y, point.z);
  });
}

// -------------------------------------------------------------------- HUD ----

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "rooftop-buckets-hud";
  root.style.cssText = [
    "position:absolute",
    "left:16px",
    "top:16px",
    "z-index:5",
    "min-width:330px",
    "font:600 13px/1.35 Inter, system-ui, sans-serif",
    "color:#f5fbff",
    "background:rgba(10,14,26,0.72)",
    "border:1px solid rgba(255,210,77,0.34)",
    "border-radius:8px",
    "padding:12px",
    "pointer-events:none"
  ].join(";");
  document.body.append(root);
  return root;
}

function renderHud(): void {
  const spot = COURT_SPOTS[spotIndex]!;
  // The createGame kit widgets (declared in the `hud` option) mirror the
  // same state the route-local panel below renders.
  bucketsGame.hud.set("score", scoreState.score);
  bucketsGame.hud.set("clock", Math.max(0, Math.ceil(scoreState.shotClock)));
  bucketsGame.hud.set("heat", `HEAT ${scoreState.heat}`);
  bucketsGame.hud.set("charge", Math.round(charge.power * 100));
  bucketsGame.hud.set("objective", objective);
  hudRoot.innerHTML = [
    `<strong>Rooftop Buckets</strong>`,
    `<div>Heat ${scoreState.heat} ${heatConfig(scoreState.heat).name} | Score ${scoreState.score}/${scoreState.target} | Streak ${scoreState.streak}${scoreState.onFire ? " ON FIRE" : ""}</div>`,
    `<div>${spot.name} | Makes ${scoreState.makes} Misses ${scoreState.misses} | Clock ${Math.max(0, scoreState.shotClock).toFixed(1)}s | Heat ${Math.max(0, Math.ceil(scoreState.heatTimer))}s</div>`,
    `<div>${paused ? "Paused. " : ""}${objective}</div>`,
    `<div>A/D spot. W/S arc. Hold+release Space shoot. P pause. R reset.</div>`
  ].join("");
}

// --------------------------------------------------------------- evidence ----

function publishEvidence(): void {
  const spot = COURT_SPOTS[spotIndex]!;
  const evidence = app.evidence({
    input,
    events: routeEvents,
    hud: hudBindings,
    appState: {
      score: scoreState.score,
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
  const snapshot: RooftopBucketsEvidence = {
    // Framed once the renderer is submitting draw calls for the court under
    // the fixed broadcast rig.
    framed: diagnostics.drawCalls > 0,
    state: paused ? "paused-local" : scoreState.state,
    heat: scoreState.heat,
    heatName: heatConfig(scoreState.heat).name,
    score: scoreState.score,
    target: scoreState.target,
    streak: scoreState.streak,
    onFire: scoreState.onFire,
    shots: scoreState.makes + scoreState.misses,
    makes: scoreState.makes,
    misses: scoreState.misses,
    madeSpotIds: scoreState.madeSpotIds,
    shotClock: scoreState.shotClock,
    heatTimer: scoreState.heatTimer,
    spot: { id: spot.id, name: spot.name, points: spot.points },
    charge: { power: charge.power, pitch: charge.pitch, charging: charge.charging },
    ball: {
      inFlight: ballState.inFlight,
      settled: ballState.settled,
      hasScored: ballState.hasScored,
      result: ballState.result,
      position: [ballState.x, ballState.y, ballState.z]
    },
    lastResult: scoreState.lastShotResult,
    events: routeEvents.events().map((event: { readonly label: string }) => event.label),
    look: { id: LOOK_ID, category: "outdoor" },
    drawCalls: diagnostics.drawCalls,
    audio: audioEvidence(),
    evidence
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
}

function audioEvidence(): RooftopBucketsEvidence["audio"] {
  const sound = bucketsGame.sound?.evidence;
  // Actually-played nodes only: GameAudio keeps suppressed cues out of
  // playingNodes, so merging its cue ids can never claim a silent play.
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
