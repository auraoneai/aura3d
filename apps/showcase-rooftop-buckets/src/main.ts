/**
 * Rooftop Buckets — sports-ballistic charge–release precision against a composed rim collider.
 */
import {
  createGameApp,
  scene,
  camera,
  lights,
  primitives,
  material,
  model,
  game,
  effects,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import {
  COURT_SPOTS,
  COURT_BOUNDS,
  HOOP_BASE_POSITION,
  BACKBOARD_POSITION,
  type ShotSpot
} from "./court";
import {
  initialHoopState,
  updateHoop,
  type HoopState
} from "./rim";
import {
  createBallAtSpot,
  calculateLaunchVelocity,
  predictFirstFlight,
  stepBall,
  type BallState
} from "./shot";
import {
  initialScoreState,
  advanceHeat,
  heatConfig,
  recordShotOutcome,
  updateClocks,
  type GameScoreState
} from "./scoring";
import { createRooftopDressing } from "./environment";
import { BucketsAudioController } from "./buckets-audio";

export interface RooftopBucketsEvidence {
  status: string;
  mounted: boolean;
  heat: number;
  state: string;
  currentSpotId: number;
  score: number;
  target: number;
  streak: number;
  onFire: boolean;
  possession: number;
  makes: number;
  misses: number;
  shotClockMs: number;
  heatTimerMs: number;
  lastShotResult: string | null;
  goldBall: boolean;
  goldAttempted: boolean;
  goldMade: boolean;
  madeSpotIds: readonly number[];
  fireAchieved: boolean;
  aimPitch: number;
  chargePower: number;
  charging: boolean;
  ballInFlight: boolean;
  reducedMotion: boolean;
  hoopMode: string;
  defenderTelegraph: string;
  contestAimOffset: number;
  sensorEventCount: number;
  physicsBodyCount: number;
  simulationOwner: string;
  predictionPointCount: number;
  primaryAssets: readonly string[];
  systems: Readonly<Record<string, string>>;
  controls: readonly string[];
  claimBoundary: string;
  renderer: { readonly drawCalls: number; readonly renderSize: readonly number[]; readonly backend: string };
  audioCues: readonly string[];
  ballPos?: { x: number; y: number; z: number };
  hoopPos?: { x: number; y: number; z: number };
}

const APP_ID = "showcase-rooftop-buckets";
const ROUTE_SYSTEMS = {
  flight: "route-local deterministic authored ballistic integrator shared by preview and actual first flight",
  scoring: "route-local five-heat objective, sensor-sequence, streak, gold, clock, and shot-lock rules",
  contest: "visible deterministic defender telegraph creates a documented pre-launch aim offset",
  presentation: "typed court, backboard, rim, ball, and defender with renderer-owned trajectory markers",
  audio: "typed synthesized cues driven by charge, contact, score, heat, fire, gold, and buzzer events"
} as const;
const ROUTE_CONTROLS = ["A/D change spot", "W/S aim arc", "hold/release Space shoot", "P pause", "R reset", "touch aim/spot/shoot/pause/reset"] as const;

// ---------------- Game State ----------------
const audio = new BucketsAudioController();

let scoreState: GameScoreState = initialScoreState(1);
let currentSpotIndex = 0;
let hoopState: HoopState = initialHoopState(1);

function isCurrentPossessionGold(possession: number): boolean {
  void possession;
  return scoreState.heat === 5;
}

let ballState: BallState = createBallAtSpot(
  COURT_SPOTS[currentSpotIndex]!,
  isCurrentPossessionGold(scoreState.possession)
);

let aimPitch = 0.0; // [-1.0, 1.0]
let chargePower = 0.0;
let isCharging = false;
let chargeDirection = 1;
let sensorEventCount = 0;
let elapsedPlayTime = 0;
let chargeTickAccumulator = 0;
let touchAimDirection = 0;
let touchShootHeld = false;

// ---------------- DOM Elements ----------------
const elHeatBadge = document.getElementById("rb-heat-badge")!;
const elFireBadge = document.getElementById("rb-fire-badge")!;
const elScoreVal = document.getElementById("rb-score-val")!;
const elTargetVal = document.getElementById("rb-target-val")!;
const elStreakVal = document.getElementById("rb-streak-val")!;
const elHeatTimer = document.getElementById("rb-heat-timer")!;
const elSpotDesc = document.getElementById("rb-spot-desc")!;
const elShotType = document.getElementById("rb-shot-type")!;
const elSweetZone = document.getElementById("rb-sweet-zone")!;
const elMeterFill = document.getElementById("rb-meter-fill")!;
const elLastResult = document.getElementById("rb-last-result")!;
const elShotClock = document.getElementById("rb-shot-clock")!;
const elModal = document.getElementById("rb-modal")!;
const elModalTitle = document.getElementById("rb-modal-title")!;
const elModalDesc = document.getElementById("rb-modal-desc")!;
const elModalBtn = document.getElementById("rb-modal-btn")!;

elModalBtn.addEventListener("click", () => {
  if (scoreState.state === "heat-cleared") {
    scoreState = advanceHeat(scoreState);
    currentSpotIndex = scoreState.heat === 2 ? 0 : currentSpotIndex;
    hoopState = initialHoopState(scoreState.heat);
    audio.playCue("heatAdvance", 0.9);
    resetBallToSpot();
    updateHUD();
  } else if (scoreState.state === "game-over" || scoreState.state === "victory") {
    fullReset();
  }
  elModal.classList.add("hidden");
});

// ---------------- Runtime Nodes & Scene ----------------
const ballHandle = game.runtimeNode("ball-hero", { tags: ["basketball"] });
const rimHandle = game.runtimeNode("rim-assembly", { tags: ["hoop-rim"] });
const backboardHandle = game.runtimeNode("backboard-assembly", { tags: ["backboard"] });
const defenderHandle = game.runtimeNode("defender-cutout", { tags: ["defender"] });
const fireHaloHandle = game.runtimeNode("fire-halo", { tags: ["outcome-feedback", "fire"] });
const outcomeHaloHandle = game.runtimeNode("outcome-halo", { tags: ["outcome-feedback", "result"] });
const AIM_POINT_COUNT = 25;
const aimMaterial = material.emissive({ name: "predicted-first-flight", color: "#38bdf8", emissive: "#0284c7" });
const goldMaterial = material.emissive({ name: "gold-ball-live", color: "#fbbf24", emissive: "#d97706" });
const orangeMaterial = material.pbr({ name: "orange-ball-live", color: "#ea580c", roughness: 0.55, metallic: 0.05 });
const backboardMaterial = material.emissive({ name: "readable-backboard", color: "#e0f2fe", emissive: "#38bdf8" });
const rimMaterial = material.emissive({ name: "readable-rim", color: "#fb923c", emissive: "#ea580c" });
const fireHaloMaterial = material.emissive({ name: "fire-streak-halo", color: "#fbbf24", emissive: "#f97316" });
const victoryHaloMaterial = material.emissive({ name: "gold-victory-halo", color: "#fde68a", emissive: "#f59e0b" });
const failureHaloMaterial = material.emissive({ name: "buzzer-failure-halo", color: "#fb7185", emissive: "#e11d48" });

function buildScene() {
  return scene()
    .background("#0c1222")
    .addMany([
      // Atmospheric & Lighting Setup
      effects.fog({ name: "dusk haze", density: 0.008, color: "#0c1222", intensity: 0.2 }),
      effects.neonBloom({ intensity: 0.12 }),
      lights.ambient({ color: "#334155", intensity: 1.2 }),
      // High-angle Stadium Court Floodlight
      lights.directional({ color: "#fffbeb", intensity: 2.8 }).position(8, 20, 10),
      // Cool Sky & Skyline Fill Light
      lights.directional({ color: "#38bdf8", intensity: 1.5 }).position(-12, 14, -8),
      // Warm Sunset Rim Light
      lights.directional({ color: "#f59e0b", intensity: 1.4 }).position(0, 8, -20),

      // 10/10 Surrounding Skyscraper Skyline, Court Lines & Stanchion
      ...createRooftopDressing(),

      model(assets.rooftopCourt, {
        name: "typed-rooftop-court",
        role: "primaryWorld",
        scaleMode: "world",
        receiveShadow: true
      }).position(0, -0.1, 4),

      // Hoop Backboard
      model(assets.rooftopBackboard, {
        name: "hoop-backboard-mesh",
        role: "primaryWorld",
        scaleMode: "world"
      })
        .position(BACKBOARD_POSITION.x, BACKBOARD_POSITION.y, BACKBOARD_POSITION.z)
        .runtime(backboardHandle),

      // Hoop Rim Ring
      model(assets.rooftopRim, {
        name: "hoop-rim-mesh",
        role: "primaryWorld",
        scaleMode: "world"
      })
        .position(HOOP_BASE_POSITION.x, HOOP_BASE_POSITION.y, HOOP_BASE_POSITION.z)
        .runtime(rimHandle),

      // Cutout Defender Standee
      model(assets.rooftopDefender, {
        name: "cutout-defender-mesh",
        role: "primaryCharacter",
        scaleMode: "world"
      })
        .position(0, -10, 0) // Hidden initially
        .runtime(defenderHandle),

      // Ball
      model(assets.rooftopBall, {
        name: "basketball-hero-mesh",
        role: "primaryCharacter",
        scaleMode: "world"
      })
        .position(ballState.x, ballState.y, ballState.z)
        .scale([0.24, 0.24, 0.24])
        .runtime(ballHandle),

      // Spot Markers on Court
      ...COURT_SPOTS.map((s) =>
        primitives
          .cylinder({
            name: `spot-marker-${s.id}`,
            material: material.emissive({
              name: `spot-mat-${s.id}`,
              color: s.points === 3 ? "#f59e0b" : "#38bdf8",
              emissive: s.points === 3 ? "#b45309" : "#0284c7"
            })
          })
          .position(s.x, 0.05, s.z)
          .scale([0.7, 0.02, 0.7])
      ),
      ...Array.from({ length: AIM_POINT_COUNT }, (_, index) =>
        primitives.sphere({ name: `aim-point-${index}`, material: aimMaterial })
          .position(0, -20, 0)
          .scale([0.035, 0.035, 0.035])
          .runtime(game.runtimeNode(`aim-point-${index}`, { tags: ["aim-guide", "bounded-first-flight"] }))
      ),
      // Renderer-owned outcome language. DOM mirrors the state accessibly, but
      // these live scene nodes keep fire, success, and failure inside Aura3D.
      primitives.torus({ name: "fire streak backboard halo", material: fireHaloMaterial })
        .position(0, -20, 0)
        .scale([0.72, 0.72, 0.055])
        .runtime(fireHaloHandle),
      primitives.torus({ name: "terminal outcome backboard halo", material: victoryHaloMaterial })
        .position(0, -20, 0)
        .scale([1.05, 1.05, 0.075])
        .runtime(outcomeHaloHandle)
    ])
    .camera(
      camera.perspective({
        position: [0, 5.8, 13.5],
        target: [0, 2.35, 0.8],
        fov: 52
      })
    );
}

// ---------------- Game App Mount ----------------
const gameApp = createGameApp("#canvas-host", {
  diagnostics: { overlay: false, performancePanel: false },
  input: {
    actions: {
      spotLeft: ["KeyA", "ArrowLeft"],
      spotRight: ["KeyD", "ArrowRight"],
      aimUp: ["KeyW", "ArrowUp"],
      aimDown: ["KeyS", "ArrowDown"],
      shoot: ["Space"],
      pause: ["KeyP", "Escape"],
      reset: ["KeyR"]
    },
    bufferMs: 50,
    touch: true
  },
  loop: { fixedDt: 1 / 60, maxSubSteps: 2 },
  scene: buildScene()
});

const app = gameApp.app;
const input = gameApp.input!;
audio.startAmbience();

function togglePause(): void {
  if (scoreState.state === "playing") scoreState = { ...scoreState, state: "paused" };
  else if (scoreState.state === "paused") scoreState = { ...scoreState, state: "playing" };
  updateHUD();
  publishEvidence();
}

window.addEventListener("keydown", (event) => {
  if (!event.repeat && (event.code === "KeyP" || event.code === "Escape")) {
    event.preventDefault();
    togglePause();
  } else if (!event.repeat && (event.code === "KeyA" || event.code === "ArrowLeft")) {
    event.preventDefault();
    changeSpot(-1);
  } else if (!event.repeat && (event.code === "KeyD" || event.code === "ArrowRight")) {
    event.preventDefault();
    changeSpot(1);
  } else if (!event.repeat && event.code === "KeyR") {
    event.preventDefault();
    fullReset();
  }
});

function changeSpot(delta: number): void {
  if (ballState.inFlight || scoreState.state !== "playing") return;
  currentSpotIndex = (currentSpotIndex + delta + COURT_SPOTS.length) % COURT_SPOTS.length;
  resetBallToSpot();
  updateHUD();
  syncTransforms();
  publishEvidence();
}

document.getElementById("rb-touch-spot-left")?.addEventListener("click", () => changeSpot(-1));
document.getElementById("rb-touch-spot-right")?.addEventListener("click", () => changeSpot(1));
for (const [id, direction] of [["rb-touch-aim-down", -1], ["rb-touch-aim-up", 1]] as const) {
  const button = document.getElementById(id);
  button?.addEventListener("pointerdown", () => { touchAimDirection = direction; });
  button?.addEventListener("pointerup", () => { touchAimDirection = 0; });
  button?.addEventListener("pointercancel", () => { touchAimDirection = 0; });
}
const touchShoot = document.getElementById("rb-touch-shoot");
touchShoot?.addEventListener("pointerdown", () => { touchShootHeld = true; });
touchShoot?.addEventListener("pointerup", () => { touchShootHeld = false; });
touchShoot?.addEventListener("pointercancel", () => { touchShootHeld = false; });
document.getElementById("rb-touch-pause")?.addEventListener("click", togglePause);
document.getElementById("rb-touch-reset")?.addEventListener("click", fullReset);

function resetBallToSpot(): void {
  const spot = COURT_SPOTS[currentSpotIndex]!;
  const isGold = isCurrentPossessionGold(scoreState.possession);
  ballState = createBallAtSpot(spot, isGold);
  chargePower = 0.0;
  isCharging = false;
  chargeDirection = 1;
}

function fullReset(): void {
  scoreState = initialScoreState(1);
  currentSpotIndex = 0;
  hoopState = initialHoopState(1);
  resetBallToSpot();
  updateHUD();
  publishEvidence();
}

function releaseShot(powerOverride?: number, pitchOverride?: number): void {
  if (ballState.inFlight || scoreState.state !== "playing") return;

  const power = powerOverride !== undefined ? powerOverride : chargePower;
  const pitch = pitchOverride !== undefined ? pitchOverride : aimPitch;
  const spot = COURT_SPOTS[currentSpotIndex]!;

  const vel = calculateLaunchVelocity(spot, power, pitch, hoopState);
  ballState = {
    ...ballState,
    vx: vel.vx,
    vy: vel.vy,
    vz: vel.vz,
    inFlight: true,
    settled: false,
    flightTimer: 0
  };

  if (ballState.isGold) {
    audio.playCue("goldBall", 0.9);
  }
}

function updateHUD(): void {
  const currentSpot = COURT_SPOTS[currentSpotIndex]!;
  const config = heatConfig(scoreState.heat);
  elHeatBadge.textContent = `Heat ${scoreState.heat} · ${config.name}`;
  elScoreVal.textContent = String(scoreState.score);
  elTargetVal.textContent = scoreState.heat === 2
    ? `${scoreState.madeSpotIds.length}/3 SPOTS`
    : scoreState.heat === 4
      ? `${Math.min(3, scoreState.streak)}/3 SWISHES`
      : scoreState.heat === 5 ? "GOLD MAKE" : String(scoreState.target);
  elStreakVal.textContent = String(scoreState.streak);
  elHeatTimer.textContent = `${Math.ceil(scoreState.heatTimer)}s`;
  elShotClock.textContent = scoreState.shotClock.toFixed(1);

  if (scoreState.shotClock < 3.0) {
    elShotClock.classList.add("critical");
  } else {
    elShotClock.classList.remove("critical");
  }

  if (scoreState.onFire) {
    elFireBadge.classList.remove("hidden");
  } else {
    elFireBadge.classList.add("hidden");
  }

  const isGold = isCurrentPossessionGold(scoreState.possession);
  elSpotDesc.textContent = `${currentSpot.name}`;
  elShotType.textContent = isGold ? "GOLD BALL ×2" : "Standard Ball";
  if (isGold) {
    elShotType.style.color = "var(--accent-gold)";
  } else {
    elShotType.style.color = "var(--text-muted)";
  }

  // Update Sweet Zone on meter track
  const sweetLeft = Math.max(0, (currentSpot.sweetPower - 0.08) * 100);
  const sweetWidth = 16;
  elSweetZone.style.left = `${sweetLeft}%`;
  elSweetZone.style.width = `${sweetWidth}%`;

  elMeterFill.style.width = `${chargePower * 100}%`;
  if (ballState.result) {
    elLastResult.textContent = ballState.result.toUpperCase();
  }

  // Modal display for heat-cleared / game-over
  if (scoreState.state === "heat-cleared") {
    elModalTitle.textContent = `Heat ${scoreState.heat} Cleared!`;
    elModalDesc.textContent = `${config.objective} complete. The next heat changes the visible court contract.`;
    elModalBtn.textContent = "Advance to Next Heat";
    elModal.classList.remove("hidden");
  } else if (scoreState.state === "game-over") {
    elModalTitle.textContent = "Buzzer - Game Over";
    elModalDesc.textContent = `Final Score: ${scoreState.score} (Target was ${scoreState.target}). Press [R] to retry Heat 1.`;
    elModalBtn.textContent = "Play Again";
    elModal.classList.remove("hidden");
  } else if (scoreState.state === "victory") {
    elModalTitle.textContent = "Rooftop Legend - Victory!";
    elModalDesc.textContent = `All 5 heats cleared. The gold-ball finish is locked.`;
    elModalBtn.textContent = "Play Again";
    elModal.classList.remove("hidden");
  }
}

// ---------------- Frame Simulation Loop ----------------
function stepGame(dt: number): void {
  input.update(dt);

  if (scoreState.state !== "playing") {
    publishEvidence();
    return;
  }

  elapsedPlayTime += dt;

  // 1. Update Hoop position (sway & defender)
  const currentSpot = COURT_SPOTS[currentSpotIndex]!;
  hoopState = updateHoop(hoopState, scoreState.heat, elapsedPlayTime, currentSpot.x);

  // 2. Handle Inputs
  if (!ballState.inFlight) {
    if (input.held("aimUp") || touchAimDirection > 0) {
      aimPitch = Math.min(1.0, aimPitch + dt * 1.5);
    } else if (input.held("aimDown") || touchAimDirection < 0) {
      aimPitch = Math.max(-1.0, aimPitch - dt * 1.5);
    }

    // Charge & Shoot
    if (input.held("shoot") || touchShootHeld) {
      isCharging = true;
      chargePower += chargeDirection * dt * 1.4;
      if (chargePower >= 1.0) {
        chargePower = 1.0;
        chargeDirection = -1;
      } else if (chargePower <= 0.0) {
        chargePower = 0.0;
        chargeDirection = 1;
      }

      chargeTickAccumulator += dt;
      if (chargeTickAccumulator >= 0.08) {
        chargeTickAccumulator = 0;
        audio.playCue("chargeTick", 0.4);
      }
    } else if (isCharging || input.released("shoot")) {
      // Released Space
      isCharging = false;
      releaseShot();
    }
  }

  // 3. Step Ball Physics
  if (ballState.inFlight) {
    const { ball: nextBall, events } = stepBall(ballState, hoopState, dt);
    ballState = nextBall;

    if (events.clankedRim) {
      audio.playCue("rimClank", 0.85);
      sensorEventCount += 1;
    }
    if (events.thuddedBoard) {
      audio.playCue("boardThud", 0.9);
      sensorEventCount += 1;
    }
    if (events.swishedNet) {
      audio.playCue("swish", 0.95);
      sensorEventCount += 1;
    }

    if (events.settled) {
      sensorEventCount += 1;
      const isGold = isCurrentPossessionGold(scoreState.possession);
      const { state: nextScore, event: scoreEvent } = recordShotOutcome(
        scoreState,
        ballState.result ?? "brick",
        currentSpot.points,
        isGold,
        currentSpot.id
      );
      scoreState = nextScore;

      if (scoreEvent.isFireIgnited) {
        audio.playCue("fireIgnite", 0.9);
      } else if (!ballState.hasScored) {
        audio.playCue("brickMiss", 0.7);
      }

      if (scoreState.state === "playing") {
        resetBallToSpot();
      }
    }
  }

  // 4. Update Clocks
  const { state: clockNextState, event: clockEvent } = updateClocks(scoreState, dt, ballState.inFlight);
  scoreState = clockNextState;

  if (clockEvent.isClockViolation) {
    sensorEventCount += 1;
    audio.playCue("buzzerFail", 0.7);
    resetBallToSpot();
  }

  if (clockEvent.isGameOver) {
    audio.playCue("buzzerFail", 0.95);
  }

  // 5. Sync Visual Node Transforms
  syncTransforms();
  updateHUD();
  publishEvidence();
}

function syncTransforms(): void {
  const ballNode = app.nodes.get("ball-hero") as AuraRuntimeNodeHandle | undefined;
  ballNode?.setPosition(ballState.x, ballState.y, ballState.z);
  ballNode?.setMaterial(ballState.isGold ? goldMaterial : orangeMaterial);

  const rimNode = app.nodes.get("rim-assembly") as AuraRuntimeNodeHandle | undefined;
  rimNode?.setPosition(hoopState.x, hoopState.y, hoopState.z);
  rimNode?.setMaterial(rimMaterial);

  const backboardNode = app.nodes.get("backboard-assembly") as AuraRuntimeNodeHandle | undefined;
  backboardNode?.setPosition(hoopState.x, BACKBOARD_POSITION.y, BACKBOARD_POSITION.z);
  backboardNode?.setMaterial(backboardMaterial);

  const defenderNode = app.nodes.get("defender-cutout") as AuraRuntimeNodeHandle | undefined;
  if (defenderNode) {
    defenderNode.setVisible(hoopState.defenderActive);
    if (hoopState.defenderActive) {
      defenderNode.setPosition(hoopState.defenderX, hoopState.defenderY, hoopState.defenderZ);
    }
  }

  const fireHalo = app.nodes.get("fire-halo") as AuraRuntimeNodeHandle | undefined;
  fireHalo?.setVisible(scoreState.onFire || scoreState.fireAchieved);
  if (scoreState.onFire || scoreState.fireAchieved) {
    fireHalo?.setPosition(hoopState.x, BACKBOARD_POSITION.y, BACKBOARD_POSITION.z + 0.03);
  }

  const outcomeHalo = app.nodes.get("outcome-halo") as AuraRuntimeNodeHandle | undefined;
  const terminal = scoreState.state === "game-over" || scoreState.state === "victory";
  outcomeHalo?.setVisible(terminal);
  if (terminal) {
    outcomeHalo?.setPosition(hoopState.x, BACKBOARD_POSITION.y, BACKBOARD_POSITION.z + 0.02);
    outcomeHalo?.setMaterial(scoreState.state === "victory" ? victoryHaloMaterial : failureHaloMaterial);
  }

  const currentSpot = COURT_SPOTS[currentSpotIndex]!;
  const previewPower = Math.max(0.05, isCharging ? chargePower : currentSpot.sweetPower);
  const preview = predictFirstFlight(currentSpot, previewPower, aimPitch, hoopState, 96, 4);
  for (let index = 0; index < AIM_POINT_COUNT; index += 1) {
    const point = app.nodes.get(`aim-point-${index}`) as AuraRuntimeNodeHandle | undefined;
    const sample = preview[index];
    point?.setVisible(!ballState.inFlight && Boolean(sample));
    if (sample) point?.setPosition(sample.x, sample.y, sample.z);
  }
}

// Attach app frame loop
app.onFrame((frame) => {
  const dt = typeof frame === "number" ? frame : (frame?.dt ?? 1 / 60);
  stepGame(Math.min(dt, 0.05));
  publishEvidence();
});

// ---------------- Evidence & Deterministic Hooks ----------------
function publishEvidence(): RooftopBucketsEvidence {
  const isGold = isCurrentPossessionGold(scoreState.possession);
  const diagnostics = app.diagnostics() as { readonly drawCalls: number; readonly renderSize: readonly number[]; readonly runtimeBackend?: string };
  const ev: RooftopBucketsEvidence = {
    status: "ready",
    mounted: true,
    heat: scoreState.heat,
    state: scoreState.state,
    currentSpotId: COURT_SPOTS[currentSpotIndex]!.id,
    score: scoreState.score,
    target: scoreState.target,
    streak: scoreState.streak,
    onFire: scoreState.onFire,
    possession: scoreState.possession,
    makes: scoreState.makes,
    misses: scoreState.misses,
    shotClockMs: Math.round(scoreState.shotClock * 1000),
    heatTimerMs: Math.round(scoreState.heatTimer * 1000),
    lastShotResult: scoreState.lastShotResult,
    goldBall: isGold,
    goldAttempted: scoreState.goldAttempted,
    goldMade: scoreState.goldMade,
    madeSpotIds: [...scoreState.madeSpotIds],
    fireAchieved: scoreState.fireAchieved,
    aimPitch,
    chargePower,
    charging: isCharging,
    ballInFlight: ballState.inFlight,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    hoopMode: hoopState.mode,
    defenderTelegraph: hoopState.defenderTelegraph,
    contestAimOffset: hoopState.contestAimOffset,
    sensorEventCount,
    physicsBodyCount: 0,
    simulationOwner: "route-local authored deterministic ballistic integrator; composed rim/board/defender regions are not Rapier bodies",
    predictionPointCount: AIM_POINT_COUNT,
    primaryAssets: ["assets.rooftopCourt", "assets.rooftopBackboard", "assets.rooftopRim", "assets.rooftopBall", "assets.rooftopDefender"],
    systems: ROUTE_SYSTEMS,
    controls: ROUTE_CONTROLS,
    claimBoundary: "Root-safe prototype with route-local authored basketball flight, composed sensor/region contacts, and five-heat scoring; no reusable sports, physics, rim, or defender kit claimed.",
    renderer: { drawCalls: diagnostics.drawCalls, renderSize: diagnostics.renderSize, backend: diagnostics.runtimeBackend ?? "unknown" },
    audioCues: [...audio.audioCuesHeard],
    ballPos: { x: ballState.x, y: ballState.y, z: ballState.z },
    hoopPos: { x: hoopState.x, y: hoopState.y, z: hoopState.z }
  };
  (window as unknown as { __ROOFTOP_BUCKETS_EVIDENCE__?: RooftopBucketsEvidence }).__ROOFTOP_BUCKETS_EVIDENCE__ = ev;
  Object.defineProperty(window, "__AURA3D_SHOWCASE_ROOFTOP_BUCKETS__", { value: ev, configurable: true, writable: true });
  return ev;
}

(window as unknown as {
  __RB_PUMP__?: (frames: number) => number;
  __RB_SHOOT__?: (power: number, pitch?: number) => void;
  __RB_SET_SPOT__?: (index: number) => void;
}).__RB_PUMP__ = (frames: number) => {
  for (let i = 0; i < frames; i++) {
    stepGame(1 / 60);
  }
  return frames;
};

(window as unknown as {
  __RB_SHOOT__?: (power: number, pitch?: number) => void;
}).__RB_SHOOT__ = (power: number, pitch = 0) => {
  releaseShot(power, pitch);
};

(window as unknown as {
  __RB_SCENARIO__?: (scenario: "open-clear" | "spot-clear" | "pressure" | "pressure-clear" | "fire" | "miss" | "buzzer" | "gold-miss" | "gold-win") => string;
}).__RB_SCENARIO__ = (scenario) => {
  const apply = (outcome: "swish" | "brick", spotIndex: number, gold = false) => {
    const spot = COURT_SPOTS[spotIndex]!;
    scoreState = recordShotOutcome(scoreState, outcome, spot.points, gold, spot.id).state;
    if (outcome === "swish") audio.playCue("swish", 0.8);
    else audio.playCue("brickMiss", 0.7);
  };
  elModal.classList.add("hidden");
  if (scenario === "open-clear") {
    scoreState = initialScoreState(1);
    apply("swish", 4);
    apply("swish", 4);
  } else if (scenario === "spot-clear") {
    scoreState = initialScoreState(2);
    apply("swish", 0);
    apply("swish", 1);
    apply("swish", 2);
  } else if (scenario === "pressure" || scenario === "pressure-clear") {
    scoreState = initialScoreState(3);
    currentSpotIndex = 2;
    hoopState = updateHoop(initialHoopState(3), 3, 0.85, COURT_SPOTS[currentSpotIndex]!.x);
    if (scenario === "pressure-clear") {
      apply("swish", 4);
      apply("swish", 4);
    } else {
      // Freeze the authored contest beat so the exact review artifact cannot
      // drift into another deterministic telegraph phase before presentation.
      scoreState = { ...scoreState, state: "paused" };
    }
  } else if (scenario === "fire") {
    scoreState = initialScoreState(4);
    apply("swish", 1);
    apply("swish", 1);
    apply("swish", 1);
    audio.playCue("fireIgnite", 0.9);
  } else if (scenario === "miss") {
    scoreState = initialScoreState(1);
    apply("brick", 1);
  } else if (scenario === "buzzer") {
    scoreState = updateClocks(initialScoreState(5), 13, false).state;
    audio.playCue("buzzerFail", 0.9);
  } else if (scenario === "gold-miss") {
    scoreState = initialScoreState(5);
    apply("brick", 1, true);
    audio.playCue("buzzerFail", 0.9);
  } else {
    scoreState = initialScoreState(5);
    apply("swish", 1, true);
    audio.playCue("goldBall", 0.9);
  }
  if (scenario !== "pressure" && scenario !== "pressure-clear") hoopState = initialHoopState(scoreState.heat);
  resetBallToSpot();
  syncTransforms();
  updateHUD();
  publishEvidence();
  return `${scoreState.heat}:${scoreState.state}:${scoreState.lastShotResult ?? "none"}`;
};

(window as unknown as {
  __RB_SET_SPOT__?: (index: number) => void;
}).__RB_SET_SPOT__ = (index: number) => {
  currentSpotIndex = Math.max(0, Math.min(COURT_SPOTS.length - 1, index));
  resetBallToSpot();
  updateHUD();
};

Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  configurable: true,
  value: {
    category: "application",
    subject: {
      position: [BACKBOARD_POSITION.x, BACKBOARD_POSITION.y, BACKBOARD_POSITION.z],
      rotation: [0, 0, 0],
      targetSize: BACKBOARD_POSITION.width
    },
    settleSubjectPose() {
      scoreState = { ...scoreState, state: "paused" };
      elapsedPlayTime = 0;
      hoopState = initialHoopState(scoreState.heat);
      resetBallToSpot();
      syncTransforms();
      publishEvidence();
    },
    setSubjectSuppressed(suppressed: boolean) {
      const node = app.nodes.get("backboard-assembly") as AuraRuntimeNodeHandle | undefined;
      node?.setVisible(!suppressed);
    }
  }
});

publishEvidence();
