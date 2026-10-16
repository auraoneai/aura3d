// Bean Brawl Race — Fall Guys / Stumble Guys-style 3D Obstacle Course Race
// Built on @aura3d/engine 4.0.0 with 11 Meshy 3D assets (4 rigged humanoid beans
// with 6 embedded skeletal clips + 7 obstacle course & hazard models).
import "./styles.css";
import {
  camera,
  game,
  gameFeel,
  looks,
  model,
  scene,
  type AuraRuntimeNodeHandle,
  type AuraVec3
} from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { createLocomotionKit } from "@aura3d/animation";
import { assets } from "./aura-assets.js";
import {
  COURSE_BOUNCE_PADS,
  COURSE_PENDULUMS,
  COURSE_SWEEPERS,
  COURSE_TURNTABLES,
  STAGE_LABELS,
  defaultCharacterControllerTuning,
  resolveBeanAnimationClip,
  resolveCheckpointRespawnZ,
  resolveCheckpointStage,
  resolveCourseProgressPct,
  stepCharacterSpeed,
  type BeanClipName,
  type CharacterControllerState
} from "./controller.js";

export const TYPED_ASSET_KEYS = [
  "heroBean",
  "rivalBean",
  "blueBean",
  "yellowBean",
  "obstacleCourse",
  "rotatingSweeper",
  "bouncePad",
  "spinningTurntable",
  "swingingPendulum",
  "finishArch",
  "winnerCrown"
] as const;

export interface RivalBeanTelemetry {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly assetId: "rivalBean" | "blueBean" | "yellowBean";
  readonly clip: BeanClipName;
  readonly position: readonly [number, number, number];
  readonly progressPct: number;
  readonly checkpoint: 1 | 2 | 3 | 4;
  readonly qualified: boolean;
}

export interface CharacterControllerProof {
  speed: number;
  state: string;
  moving: boolean;
  running: boolean;
  jumping: boolean;
  grounded: boolean;
  knockedDown: boolean;
  clipWeights: ReadonlyArray<{ clip: string; weight: number }>;
  hero: {
    readonly assetId: string;
    readonly url: string;
    readonly clip: BeanClipName;
    readonly metres: readonly [number, number, number];
  };
  position: readonly [number, number, number];
  yawDegrees: number;
  look: { readonly id: string; readonly category: string };
  camera: { readonly rig: string; readonly presented: boolean };
  debugDraw: boolean;
  governor: {
    readonly resolutionScale: number;
    readonly particleScale: number;
    readonly lodBias: number;
    readonly shadowSize: number;
  };
  rank: number;
  checkpoint: 1 | 2 | 3 | 4;
  stageName: string;
  progressPct: number;
  qualified: boolean;
  raceTimeSeconds: number;
  hitsTaken: number;
  bouncesTriggered: number;
  rivals: ReadonlyArray<RivalBeanTelemetry>;
  typedAssetsUsed: typeof TYPED_ASSET_KEYS;
}

declare global {
  interface Window {
    __AURA3D_CHARACTER_CONTROLLER_PROOF__?: CharacterControllerProof;
    __AURA3D_BEAN_BRAWL__?: CharacterControllerProof;
  }
}

const LOOK_ID = "outdoor-day" as const;
const tuning = defaultCharacterControllerTuning;
const kit = createLocomotionKit({
  idleClip: "Idle",
  walkClip: "Walk",
  runClip: "Run",
  walkSpeed: tuning.walkSpeed,
  runSpeed: tuning.runSpeed
});

function fitScale(bounds: readonly [number, number, number], target: readonly [number, number, number]): AuraVec3 {
  return [
    Number((target[0] / Math.max(0.001, bounds[0])).toFixed(4)),
    Number((target[1] / Math.max(0.001, bounds[1])).toFixed(4)),
    Number((target[2] / Math.max(0.001, bounds[2])).toFixed(4))
  ];
}

const HERO_SCALE = Number((1.56 / assets.heroBean.bounds[1]).toFixed(4));
const RIVAL_RED_SCALE = Number((1.56 / assets.rivalBean.bounds[1]).toFixed(4));
const RIVAL_BLUE_SCALE = Number((1.56 / assets.blueBean.bounds[1]).toFixed(4));
const RIVAL_YELLOW_SCALE = Number((1.56 / assets.yellowBean.bounds[1]).toFixed(4));

const COURSE_DECK_SCALE = fitScale(assets.obstacleCourse.bounds, [11.5, 1.35, 12.2]);
const SWEEPER_SCALE = fitScale(assets.rotatingSweeper.bounds, [5.8, 1.15, 5.8]);
const TURNTABLE_SCALE = fitScale(assets.spinningTurntable.bounds, [4.6, 0.45, 4.6]);
const BOUNCE_PAD_SCALE = fitScale(assets.bouncePad.bounds, [1.65, 0.48, 1.65]);
const PENDULUM_SCALE = fitScale(assets.swingingPendulum.bounds, [3.1, 2.6, 1.4]);
const FINISH_ARCH_SCALE = fitScale(assets.finishArch.bounds, [6.8, 4.4, 2.6]);
const WINNER_CROWN_SCALE = fitScale(assets.winnerCrown.bounds, [1.55, 1.15, 1.55]);

const COURSE_SEGMENT_ZS = [2, 12, 22, 32, 42, 52, 60] as const;

const moveKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const held = new Set<string>();
let jumpRequested = false;
let resetRequested = false;

window.addEventListener("keydown", (event) => {
  held.add(event.code);
  if (event.code === "Space") {
    jumpRequested = true;
  }
  if (event.code === "KeyR") {
    resetRequested = true;
  }
});
window.addEventListener("keyup", (event) => {
  held.delete(event.code);
});

let governorSettings = {
  resolutionScale: 1,
  particleScale: 1,
  lodBias: 0,
  shadowSize: 1024
};
let debugDraw = false;

const controllerGame = createGame({
  id: "bean-brawl-race",
  target: "#app",
  autoStart: true,
  input: {
    actions: {
      left: ["KeyA", "ArrowLeft"],
      right: ["KeyD", "ArrowRight"],
      up: ["KeyW", "ArrowUp"],
      down: ["KeyS", "ArrowDown"],
      run: ["ShiftLeft", "ShiftRight"],
      jump: ["Space"],
      reset: ["KeyR"],
      debug: ["KeyT"]
    },
    bufferMs: 120
  },
  hud: { theme: "sci-fi-telemetry", widgets: [] },
  touch: {
    preset: "dpad-2btn",
    bindings: { left: "left", right: "right", up: "up", down: "down", dash: "run", jump: "jump", attack: "reset" }
  },
  sound: {
    cues: {
      step: { id: "step", asset: { url: sfxUrl("footsteps.grass.00") }, volume: 0.35 },
      "run-start": { id: "run-start", asset: { url: sfxUrl("vehicle.boost") }, volume: 0.4 },
      jump: { id: "jump", asset: { url: sfxUrl("whoosh.dash.00") }, volume: 0.48 },
      bounce: { id: "bounce", asset: { url: sfxUrl("sports.bumper.00") }, volume: 0.58 },
      "sweeper-hit": { id: "sweeper-hit", asset: { url: sfxUrl("impact.rubber-ball.heavy.00") }, volume: 0.62 },
      checkpoint: { id: "checkpoint", asset: { url: sfxUrl("stinger.checkpoint.00") }, volume: 0.55 },
      "crown-win": { id: "crown-win", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.72 },
      reset: { id: "reset", asset: { url: sfxUrl("stinger.level-start.00") }, volume: 0.5 },
      "debug-toggle": { id: "debug-toggle", asset: { url: sfxUrl("ui.toggle.00") }, volume: 0.45 }
    }
  },
  juice: {
    "run-start": { punch: { fovDeg: 1.4, ms: 240 }, cue: "run-start" },
    jump: {
      fx: { kind: "dust", count: 8, color: "#f8fafc", speed: 2.2 },
      punch: { fovDeg: 1.2, ms: 180 },
      cue: "jump"
    },
    bounce: {
      fx: { kind: "ring", count: 14, color: "#38bdf8", speed: 3.8 },
      punch: { fovDeg: 2.4, ms: 260 },
      shake: 0.2,
      cue: "bounce"
    },
    "sweeper-hit": {
      fx: { kind: "spark", count: 16, color: "#fb7185", speed: 4.2 },
      shake: 0.38,
      hitStop: 0.04,
      flash: { color: "#fb7185", peak: 0.16, ms: 150 },
      cue: "sweeper-hit"
    },
    checkpoint: {
      fx: { kind: "pickup", count: 12, color: "#34d399", speed: 3.0 },
      flash: { color: "#34d399", peak: 0.1, ms: 140 },
      cue: "checkpoint"
    },
    "crown-win": {
      fx: { kind: "pickup", count: 24, color: "#f59e0b", speed: 4.8 },
      punch: { fovDeg: 3.0, ms: 360 },
      flash: { color: "#f59e0b", peak: 0.2, ms: 240 },
      cue: "crown-win"
    },
    reset: {
      flash: { color: "#38bdf8", peak: 0.12, ms: 140 },
      cue: "reset"
    },
    "debug-toggle": {
      flash: { color: "#9fc7ff", peak: 0.12, ms: 120 },
      cue: "debug-toggle"
    }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: {
      characterController: () => window.__AURA3D_CHARACTER_CONTROLLER_PROOF__ ?? { status: "unbound" },
      beanBrawl: () => window.__AURA3D_BEAN_BRAWL__ ?? { status: "unbound" }
    }
  },
  scene: () => {
    let builder = scene().add(looks.preset(LOOK_ID, { fogDensityScale: 0.18, exposureEv: 0.08 }));

    // Modular Fall Guys obstacle course decks spanning z = -3 to z = 65
    for (let i = 0; i < COURSE_SEGMENT_ZS.length; i += 1) {
      const segZ = COURSE_SEGMENT_ZS[i]!;
      builder = builder.add(
        model(assets.obstacleCourse, {
          name: `obstacle-course-deck-${i + 1}`,
          role: i === 0 ? "primaryWorld" : "setDressing",
          scaleMode: "world",
          receiveShadow: true,
          castShadow: true
        })
          .position(0, 0.16, segZ)
          .scale(COURSE_DECK_SCALE)
          .runtime(game.runtimeNode(`course-deck-${i + 1}`, { tags: ["world", "course"] }))
      );
    }

    // Stage 1: Sweeper Alley (2 rotating sweeper hazards)
    for (const sweeper of COURSE_SWEEPERS) {
      builder = builder.add(
        model(assets.rotatingSweeper, { name: sweeper.id, scaleMode: "world", castShadow: true, receiveShadow: true })
          .position(0, 0.52, sweeper.z)
          .scale(SWEEPER_SCALE)
          .rotate(0, sweeper.initialAngle, 0)
          .runtime(game.runtimeNode(sweeper.id, { tags: ["hazard", "sweeper"] }))
      );
    }

    // Stage 2: Turntable Crossing & Bounce Pads
    for (const turntable of COURSE_TURNTABLES) {
      builder = builder.add(
        model(assets.spinningTurntable, { name: turntable.id, scaleMode: "world", castShadow: true, receiveShadow: true })
          .position(turntable.x, 0.08, turntable.z)
          .scale(TURNTABLE_SCALE)
          .runtime(game.runtimeNode(turntable.id, { tags: ["hazard", "turntable"] }))
      );
    }

    for (const pad of COURSE_BOUNCE_PADS) {
      builder = builder.add(
        model(assets.bouncePad, { name: pad.id, scaleMode: "world", castShadow: true, receiveShadow: true })
          .position(pad.x, 0.14, pad.z)
          .scale(BOUNCE_PAD_SCALE)
          .runtime(game.runtimeNode(pad.id, { tags: ["bumper", "bounce-pad"] }))
      );
    }

    // Stage 3: Pendulum Gauntlet (2 overhead swinging hammers)
    for (const pendulum of COURSE_PENDULUMS) {
      builder = builder.add(
        model(assets.swingingPendulum, { name: pendulum.id, scaleMode: "world", castShadow: true, receiveShadow: true })
          .position(0, 1.85, pendulum.z)
          .scale(PENDULUM_SCALE)
          .runtime(game.runtimeNode(pendulum.id, { tags: ["hazard", "pendulum"] }))
      );
    }

    // Stage 4: Crown Summit (checkered finish arch + floating golden crown)
    builder = builder
      .add(
        model(assets.finishArch, { name: "finish-arch", scaleMode: "world", castShadow: true, receiveShadow: true })
          .position(0, 2.1, 55.0)
          .scale(FINISH_ARCH_SCALE)
          .runtime(game.runtimeNode("finish-arch", { tags: ["finish", "arch"] }))
      )
      .add(
        model(assets.winnerCrown, { name: "winner-crown", scaleMode: "world", castShadow: true, receiveShadow: true })
          .position(0, 1.45, tuning.finishZ)
          .scale(WINNER_CROWN_SCALE)
          .runtime(game.runtimeNode("winner-crown", { tags: ["finish", "crown"] }))
      );

    // 4 Rigged & Animated Bean Competitors
    builder = builder
      .add(
        model(assets.heroBean, { name: "hero-bean", role: "primaryCharacter", scaleMode: "world", castShadow: true })
          .position(0, 0, 0)
          .scale(HERO_SCALE)
          .animate({ clip: "Idle", loop: true, speed: 1 })
          .runtime(game.runtimeNode("hero", { tags: ["player", "bean"] }))
      )
      .add(
        model(assets.rivalBean, { name: "rival-bean-blaze", scaleMode: "world", castShadow: true })
          .position(-1.35, 0, 0.35)
          .scale(RIVAL_RED_SCALE)
          .animate({ clip: "Idle", loop: true, speed: 1 })
          .runtime(game.runtimeNode("rival-red", { tags: ["rival", "bean"] }))
      )
      .add(
        model(assets.blueBean, { name: "rival-bean-frost", scaleMode: "world", castShadow: true })
          .position(1.35, 0, 0.35)
          .scale(RIVAL_BLUE_SCALE)
          .animate({ clip: "Idle", loop: true, speed: 1 })
          .runtime(game.runtimeNode("rival-blue", { tags: ["rival", "bean"] }))
      )
      .add(
        model(assets.yellowBean, { name: "rival-bean-volt", scaleMode: "world", castShadow: true })
          .position(-0.68, 0, 0.85)
          .scale(RIVAL_YELLOW_SCALE)
          .animate({ clip: "Idle", loop: true, speed: 1 })
          .runtime(game.runtimeNode("rival-yellow", { tags: ["rival", "bean"] }))
      );

    return builder.camera(camera.perspective({ position: [0, 2.75, -4.6], target: [0, 1.15, 4.2], fov: 56 }));
  }
});

const app = controllerGame.app;
controllerGame.start();

const heroNode: AuraRuntimeNodeHandle = app.nodes.require("hero");
const rivalRedNode: AuraRuntimeNodeHandle = app.nodes.require("rival-red");
const rivalBlueNode: AuraRuntimeNodeHandle = app.nodes.require("rival-blue");
const rivalYellowNode: AuraRuntimeNodeHandle = app.nodes.require("rival-yellow");

const sweeperNodes = COURSE_SWEEPERS.map((s) => app.nodes.require(s.id));
const turntableNodes = COURSE_TURNTABLES.map((t) => app.nodes.require(t.id));
const pendulumNodes = COURSE_PENDULUMS.map((p) => app.nodes.require(p.id));
const crownNode: AuraRuntimeNodeHandle = app.nodes.require("winner-crown");

app.camera?.use(
  camera.rigs.shoulder({
    target: "hero",
    sideOffset: 0.25,
    height: 2.35,
    distance: 4.6,
    lookHeight: 1.15,
    lookAhead: 3.6,
    fov: 56,
    collision: false
  })
);
const orbit = camera.rigs.orbit({ target: "hero" });
const lookPad = document.createElement("div");
lookPad.id = "look-pad";
lookPad.setAttribute("style", "position:fixed;right:0;top:0;width:50%;height:100%;touch-action:none;");
document.body.appendChild(lookPad);
const orbitPointer = (orbit as { bindPointer?: (el: HTMLElement) => void }).bindPointer;
if (orbitPointer) orbitPointer.call(orbit, lookPad);

const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("platformer");

interface RivalRuntimeState {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly assetId: "rivalBean" | "blueBean" | "yellowBean";
  readonly node: AuraRuntimeNodeHandle;
  readonly startX: number;
  readonly startZ: number;
  readonly cruiseSpeed: number;
  readonly weaveFreq: number;
  readonly weaveAmp: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  yaw: number;
  grounded: boolean;
  knockdownTimer: number;
  hitCooldown: number;
  bounceCooldown: number;
  qualified: boolean;
  finishOrder: number | null;
  clip: BeanClipName;
}

const rivals: RivalRuntimeState[] = [
  {
    id: "rival-red",
    name: "Blaze Bean",
    color: "#fb7185",
    assetId: "rivalBean",
    node: rivalRedNode,
    startX: -1.35,
    startZ: 0.35,
    cruiseSpeed: 4.55,
    weaveFreq: 1.4,
    weaveAmp: 1.15,
    x: -1.35,
    y: 0,
    z: 0.35,
    vy: 0,
    yaw: 0,
    grounded: true,
    knockdownTimer: 0,
    hitCooldown: 0,
    bounceCooldown: 0,
    qualified: false,
    finishOrder: null,
    clip: "Idle"
  },
  {
    id: "rival-blue",
    name: "Frost Bean",
    color: "#38bdf8",
    assetId: "blueBean",
    node: rivalBlueNode,
    startX: 1.35,
    startZ: 0.35,
    cruiseSpeed: 4.35,
    weaveFreq: 1.75,
    weaveAmp: 1.25,
    x: 1.35,
    y: 0,
    z: 0.35,
    vy: 0,
    yaw: 0,
    grounded: true,
    knockdownTimer: 0,
    hitCooldown: 0,
    bounceCooldown: 0,
    qualified: false,
    finishOrder: null,
    clip: "Idle"
  },
  {
    id: "rival-yellow",
    name: "Volt Bean",
    color: "#f59e0b",
    assetId: "yellowBean",
    node: rivalYellowNode,
    startX: -0.68,
    startZ: 0.85,
    cruiseSpeed: 4.15,
    weaveFreq: 1.2,
    weaveAmp: 1.35,
    x: -0.68,
    y: 0,
    z: 0.85,
    vy: 0,
    yaw: 0,
    grounded: true,
    knockdownTimer: 0,
    hitCooldown: 0,
    bounceCooldown: 0,
    qualified: false,
    finishOrder: null,
    clip: "Idle"
  }
];

const hudRoot = createHud();

let state: CharacterControllerState = { speed: 0 };
let position = { x: 0, y: 0, z: 0 };
let vy = 0;
let yaw = 0;
let grounded = true;
let knockdownTimer = 0;
let hitCooldown = 0;
let bounceCooldown = 0;
let checkpoint: 1 | 2 | 3 | 4 = 1;
let qualified = false;
let playerFinishOrder: number | null = null;
let nextFinishOrder = 1;
let raceTimeSeconds = 0;
let hitsTaken = 0;
let bouncesTriggered = 0;
let currentHeroClip: BeanClipName = "Idle";

function resetRace(): void {
  state = { speed: 0 };
  position = { x: 0, y: 0, z: 0 };
  vy = 0;
  yaw = 0;
  grounded = true;
  knockdownTimer = 0;
  hitCooldown = 0;
  bounceCooldown = 0;
  checkpoint = 1;
  qualified = false;
  playerFinishOrder = null;
  nextFinishOrder = 1;
  raceTimeSeconds = 0;
  hitsTaken = 0;
  bouncesTriggered = 0;
  currentHeroClip = "Idle";
  heroNode.setPosition(0, 0, 0).setRotation(0, 0, 0);
  heroNode.setAnimation({ clip: "Idle", loop: true, speed: 1 });

  for (const rival of rivals) {
    rival.x = rival.startX;
    rival.y = 0;
    rival.z = rival.startZ;
    rival.vy = 0;
    rival.yaw = 0;
    rival.grounded = true;
    rival.knockdownTimer = 0;
    rival.hitCooldown = 0;
    rival.bounceCooldown = 0;
    rival.qualified = false;
    rival.finishOrder = null;
    rival.clip = "Idle";
    rival.node.setPosition(rival.startX, 0, rival.startZ).setRotation(0, 0, 0);
    rival.node.setAnimation({ clip: "Idle", loop: true, speed: 1 });
  }
}

function setBeanClip(
  node: AuraRuntimeNodeHandle,
  current: BeanClipName,
  next: BeanClipName,
  runSpeedRatio: number
): BeanClipName {
  if (current === next) return current;
  const speed = next === "Run" ? runSpeedRatio : 1;
  const loop = next !== "Jump" && next !== "Fall";
  node.setAnimation({ clip: next, loop, speed });
  return next;
}

app.onFrame(({ dt }: { readonly dt: number }) => {
  const seconds = Math.min(0.05, Math.max(0, dt));
  raceTimeSeconds += seconds;

  if (resetRequested) {
    resetRequested = false;
    resetRace();
    controllerGame.juice.fire("reset");
    void controllerGame.sound?.cue("reset");
  }

  if (held.has("KeyT")) {
    debugDraw = !debugDraw;
    held.delete("KeyT");
    controllerGame.juice.fire("debug-toggle");
    void controllerGame.sound?.cue("debug-toggle");
  }

  // 1. Animate dynamic course hazards & crown
  for (let i = 0; i < COURSE_SWEEPERS.length; i += 1) {
    const spec = COURSE_SWEEPERS[i]!;
    const angle = spec.initialAngle + raceTimeSeconds * spec.angularVelocity;
    sweeperNodes[i]?.setRotation(0, angle, 0);
  }

  for (let i = 0; i < COURSE_TURNTABLES.length; i += 1) {
    const spec = COURSE_TURNTABLES[i]!;
    const angle = raceTimeSeconds * spec.angularVelocity;
    turntableNodes[i]?.setRotation(0, angle, 0);
  }

  for (let i = 0; i < COURSE_PENDULUMS.length; i += 1) {
    const spec = COURSE_PENDULUMS[i]!;
    const phaseAngle = raceTimeSeconds * spec.frequency + spec.phase;
    const swingX = Math.sin(phaseAngle) * spec.swingAmplitudeX;
    const swingRoll = Math.sin(phaseAngle) * 0.65;
    pendulumNodes[i]?.setPosition(swingX, 1.85, spec.z).setRotation(0, 0, swingRoll);
  }

  const crownY = 1.45 + Math.sin(raceTimeSeconds * 2.8) * 0.18;
  const crownYaw = raceTimeSeconds * 1.65;
  crownNode.setPosition(0, crownY, tuning.finishZ).setRotation(0, crownYaw, 0);

  // 2. Step Player Bean
  if (knockdownTimer > 0) {
    knockdownTimer = Math.max(0, knockdownTimer - seconds);
  }
  if (hitCooldown > 0) {
    hitCooldown = Math.max(0, hitCooldown - seconds);
  }
  if (bounceCooldown > 0) {
    bounceCooldown = Math.max(0, bounceCooldown - seconds);
  }

  const manualDx = (held.has("KeyD") || held.has("ArrowRight") ? 1 : 0) - (held.has("KeyA") || held.has("ArrowLeft") ? 1 : 0);
  const manualDz = (held.has("KeyW") || held.has("ArrowUp") ? 1 : 0) - (held.has("KeyS") || held.has("ArrowDown") ? 1 : 0);
  const canControl = !qualified && knockdownTimer <= 0;
  const manualMoving = canControl && [...held].some((code) => moveKeys.has(code));
  const autoPilotActive = canControl && !manualMoving && raceTimeSeconds >= 0.45;

  const autoWeaveX = autoPilotActive ? Math.sin(raceTimeSeconds * 1.55) * 0.28 : 0;
  const dx = manualMoving ? manualDx : autoWeaveX;
  const dz = manualMoving ? manualDz : autoPilotActive ? 1 : 0;
  const moving = manualMoving || autoPilotActive;
  const running = canControl && (held.has("ShiftLeft") || held.has("ShiftRight") || autoPilotActive);

  // Auto-jump over rotating sweepers during idle autopilot
  if (autoPilotActive && grounded) {
    for (const sweeper of COURSE_SWEEPERS) {
      const distToSweeper = sweeper.z - position.z;
      if (distToSweeper > 0.25 && distToSweeper < 1.55) {
        jumpRequested = true;
        break;
      }
    }
  }

  const wasRunning = state.speed >= tuning.runSpeed - 0.05;
  state = stepCharacterSpeed(state, { move: moving, run: running }, seconds, tuning);
  const isRunning = state.speed >= tuning.runSpeed - 0.05;
  if (isRunning && !wasRunning) {
    controllerGame.juice.fire("run-start");
    void controllerGame.sound?.cue("run-start");
  }

  if (jumpRequested) {
    jumpRequested = false;
    if (canControl && grounded) {
      vy = tuning.jumpVelocity;
      grounded = false;
      controllerGame.juice.fire("jump", { position: [position.x, position.y, position.z] });
      void controllerGame.sound?.cue("jump");
    }
  }

  if (canControl && (dx !== 0 || dz !== 0)) {
    const length = Math.hypot(dx, dz);
    const dirX = dx / length;
    const dirZ = dz / length;
    position.x += dirX * state.speed * seconds;
    position.z += dirZ * state.speed * seconds;
    yaw = Math.atan2(dirX, dirZ);
  }

  // Turntable tangential drift on player
  if (grounded && !qualified) {
    for (const turntable of COURSE_TURNTABLES) {
      const dist = Math.hypot(position.x - turntable.x, position.z - turntable.z);
      if (dist <= turntable.radius) {
        position.x += turntable.driftStrength * seconds;
      }
    }
  }

  // Bounce pads on player
  if (!qualified && bounceCooldown <= 0) {
    for (const pad of COURSE_BOUNCE_PADS) {
      const dist = Math.hypot(position.x - pad.x, position.z - pad.z);
      if (dist <= pad.radius && position.y <= 0.75) {
        vy = tuning.bounceVelocity;
        position.z += 1.4 * seconds;
        grounded = false;
        bounceCooldown = 0.45;
        bouncesTriggered += 1;
        controllerGame.juice.fire("bounce", { position: [position.x, position.y, position.z] });
        void controllerGame.sound?.cue("bounce");
        break;
      }
    }
  }

  // Sweeper beam collisions on player
  if (!qualified && hitCooldown <= 0) {
    for (const sweeper of COURSE_SWEEPERS) {
      const dzSweeper = Math.abs(position.z - sweeper.z);
      const radialDist = Math.hypot(position.x, position.z - sweeper.z);
      if (dzSweeper < 0.85 && radialDist <= sweeper.radius && position.y < sweeper.barHeight) {
        const beamAngle = sweeper.initialAngle + raceTimeSeconds * sweeper.angularVelocity;
        const beanAngle = Math.atan2(position.x, position.z - sweeper.z);
        const angleDiff = Math.abs(Math.sin(beamAngle - beanAngle));
        if (angleDiff < 0.36 || radialDist < 0.65) {
          knockdownTimer = 0.75;
          hitCooldown = 1.25;
          hitsTaken += 1;
          vy = 3.4;
          grounded = false;
          position.z = Math.max(0, position.z - 1.35);
          state = { speed: 0 };
          controllerGame.juice.fire("sweeper-hit", { position: [position.x, position.y, position.z] });
          void controllerGame.sound?.cue("sweeper-hit");
          break;
        }
      }
    }
  }

  // Pendulum collisions on player
  if (!qualified && hitCooldown <= 0) {
    for (const pendulum of COURSE_PENDULUMS) {
      const hammerX = Math.sin(raceTimeSeconds * pendulum.frequency + pendulum.phase) * pendulum.swingAmplitudeX;
      const dist = Math.hypot(position.x - hammerX, position.z - pendulum.z);
      if (dist < 0.95 && position.y < 1.35) {
        knockdownTimer = 0.8;
        hitCooldown = 1.3;
        hitsTaken += 1;
        vy = 3.6;
        grounded = false;
        position.z = Math.max(0, position.z - 1.5);
        state = { speed: 0 };
        controllerGame.juice.fire("sweeper-hit", { position: [position.x, position.y, position.z] });
        void controllerGame.sound?.cue("sweeper-hit");
        break;
      }
    }
  }

  // Vertical gravity & ground clamp / fall recovery
  if (!grounded || vy !== 0) {
    position.y += vy * seconds;
    vy -= tuning.gravity * seconds;
    if (position.y <= 0) {
      position.y = 0;
      vy = 0;
      grounded = true;
    }
  }

  // Keep within course boundaries or respawn at active checkpoint if knocked off deck
  if (Math.abs(position.x) > tuning.laneHalfWidth + 0.65) {
    position.x = 0;
    position.y = 0;
    position.z = resolveCheckpointRespawnZ(checkpoint);
    vy = 0;
    grounded = true;
    knockdownTimer = 0.55;
    controllerGame.juice.fire("sweeper-hit", { position: [position.x, position.y, position.z] });
  } else {
    position.x = Math.max(-tuning.laneHalfWidth, Math.min(tuning.laneHalfWidth, position.x));
  }
  position.z = Math.max(-2, Math.min(tuning.finishZ + 2, position.z));

  // Checkpoint progression
  const nextStage = resolveCheckpointStage(position.z);
  if (nextStage > checkpoint) {
    checkpoint = nextStage;
    controllerGame.juice.fire("checkpoint", { position: [position.x, position.y, position.z] });
    void controllerGame.sound?.cue("checkpoint");
  }

  // Crown Victory check
  const crownDist = Math.hypot(position.x, position.z - tuning.finishZ);
  if (!qualified && (position.z >= tuning.finishZ - 0.5 || crownDist <= 1.45)) {
    qualified = true;
    playerFinishOrder = nextFinishOrder++;
    position.y = 0;
    vy = 0;
    grounded = true;
    state = { speed: 0 };
    controllerGame.juice.fire("crown-win", { position: [position.x, position.y, position.z] });
    void controllerGame.sound?.cue("crown-win");
  }

  const sample = kit.sample(state.speed, seconds);
  const locomotionState: "idle" | "walk" | "run" =
    sample.state === "run" ? "run" : sample.state === "walk" ? "walk" : "idle";
  const nextHeroClip = resolveBeanAnimationClip({
    qualified,
    knockdownTimer,
    grounded,
    locomotionState
  });
  const runSpeedRatio = Number((tuning.runSpeed / tuning.walkSpeed).toFixed(2));
  currentHeroClip = setBeanClip(heroNode, currentHeroClip, nextHeroClip, runSpeedRatio);
  heroNode.setPosition(position.x, position.y, position.z).setRotation(0, yaw, 0);

  app.camera?.setPose({
    position: [position.x * 0.65, position.y + 2.65, position.z - 4.8],
    target: [position.x * 0.45, position.y + 1.15, position.z + 4.5],
    fov: 56
  });

  // 3. Step AI Rival Beans along the Obstacle Gauntlet
  for (const rival of rivals) {
    if (rival.knockdownTimer > 0) rival.knockdownTimer = Math.max(0, rival.knockdownTimer - seconds);
    if (rival.hitCooldown > 0) rival.hitCooldown = Math.max(0, rival.hitCooldown - seconds);
    if (rival.bounceCooldown > 0) rival.bounceCooldown = Math.max(0, rival.bounceCooldown - seconds);

    // Wait 0.45s on the starting grid so initial frame captures all 4 beans in formation
    const raceActive = raceTimeSeconds >= 0.45;
    if (!rival.qualified && raceActive && rival.knockdownTimer <= 0) {
      const targetX =
        rival.startX * 0.45 + Math.sin(raceTimeSeconds * rival.weaveFreq + rival.startX) * rival.weaveAmp;
      const steerX = Math.max(-1.8, Math.min(1.8, (targetX - rival.x) * 2.2));
      rival.x = Math.max(-tuning.laneHalfWidth + 0.3, Math.min(tuning.laneHalfWidth - 0.3, rival.x + steerX * seconds));
      rival.z += rival.cruiseSpeed * seconds;
      rival.yaw = Math.atan2(steerX, rival.cruiseSpeed);

      // AI jumps proactively when approaching rotating sweepers
      for (const sweeper of COURSE_SWEEPERS) {
        const distToSweeper = sweeper.z - rival.z;
        if (distToSweeper > 0.2 && distToSweeper < 1.65 && rival.grounded) {
          rival.vy = tuning.jumpVelocity * 0.96;
          rival.grounded = false;
        } else if (
          Math.abs(rival.z - sweeper.z) < 0.55 &&
          rival.y < sweeper.barHeight &&
          rival.hitCooldown <= 0
        ) {
          const beamAngle = sweeper.initialAngle + raceTimeSeconds * sweeper.angularVelocity;
          const beanAngle = Math.atan2(rival.x, rival.z - sweeper.z);
          if (Math.abs(Math.sin(beamAngle - beanAngle)) < 0.25) {
            rival.knockdownTimer = 0.65;
            rival.hitCooldown = 1.4;
            rival.vy = 2.8;
            rival.grounded = false;
            rival.z = Math.max(0, rival.z - 0.9);
          }
        }
      }

      // Bounce pad interaction for AI
      if (rival.bounceCooldown <= 0) {
        for (const pad of COURSE_BOUNCE_PADS) {
          if (Math.hypot(rival.x - pad.x, rival.z - pad.z) <= pad.radius && rival.y <= 0.7) {
            rival.vy = tuning.bounceVelocity * 0.92;
            rival.grounded = false;
            rival.bounceCooldown = 0.5;
            break;
          }
        }
      }

      // Pendulum collision for AI
      if (rival.hitCooldown <= 0) {
        for (const pendulum of COURSE_PENDULUMS) {
          const hammerX = Math.sin(raceTimeSeconds * pendulum.frequency + pendulum.phase) * pendulum.swingAmplitudeX;
          if (Math.hypot(rival.x - hammerX, rival.z - pendulum.z) < 0.85 && rival.y < 1.25) {
            rival.knockdownTimer = 0.7;
            rival.hitCooldown = 1.4;
            rival.vy = 3.0;
            rival.grounded = false;
            rival.z = Math.max(0, rival.z - 1.1);
            break;
          }
        }
      }

      if (rival.z >= tuning.finishZ) {
        rival.z = tuning.finishZ;
        rival.qualified = true;
        rival.finishOrder = nextFinishOrder++;
        rival.y = 0;
        rival.vy = 0;
        rival.grounded = true;
      }
    }

    if (!rival.grounded || rival.vy !== 0) {
      rival.y += rival.vy * seconds;
      rival.vy -= tuning.gravity * seconds;
      if (rival.y <= 0) {
        rival.y = 0;
        rival.vy = 0;
        rival.grounded = true;
      }
    }

    const rivalLocomotion: "idle" | "walk" | "run" = !raceActive ? "idle" : "run";
    const nextRivalClip = resolveBeanAnimationClip({
      qualified: rival.qualified,
      knockdownTimer: rival.knockdownTimer,
      grounded: rival.grounded,
      locomotionState: rivalLocomotion
    });
    rival.clip = setBeanClip(rival.node, rival.clip, nextRivalClip, 1.15);
    rival.node.setPosition(rival.x, rival.y, rival.z).setRotation(0, rival.yaw, 0);
  }

  // 4. Compute Live Standings (1st to 4th)
  const allProgress = [
    { id: "hero", finishOrder: playerFinishOrder, z: position.z },
    ...rivals.map((r) => ({ id: r.id, finishOrder: r.finishOrder, z: r.z }))
  ].sort((a, b) => {
    if (a.finishOrder !== null && b.finishOrder !== null) return a.finishOrder - b.finishOrder;
    if (a.finishOrder !== null) return -1;
    if (b.finishOrder !== null) return 1;
    return b.z - a.z;
  });
  const rank = Math.max(1, allProgress.findIndex((entry) => entry.id === "hero") + 1);

  feel.update(dt * 1000);

  const frameTimeMs = seconds * 1000;
  governorSettings = {
    resolutionScale: frameTimeMs > 24 ? 0.85 : 1,
    particleScale: frameTimeMs > 28 ? 0.75 : 1,
    lodBias: frameTimeMs > 28 ? 1 : 0,
    shadowSize: frameTimeMs > 24 ? 512 : 1024
  };

  const presented = Boolean(app.camera?.presented());
  const effectiveState = qualified
    ? "celebrate"
    : knockdownTimer > 0
      ? "fall"
      : !grounded
        ? "jump"
        : sample.state;

  const rivalTelemetry: RivalBeanTelemetry[] = rivals.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    assetId: r.assetId,
    clip: r.clip,
    position: [Number(r.x.toFixed(3)), Number(r.y.toFixed(3)), Number(r.z.toFixed(3))],
    progressPct: resolveCourseProgressPct(r.z, tuning.finishZ),
    checkpoint: resolveCheckpointStage(r.z),
    qualified: r.qualified
  }));

  const proof: CharacterControllerProof = {
    speed: Number(state.speed.toFixed(3)),
    state: effectiveState,
    moving: sample.moving || !grounded,
    running: sample.running,
    jumping: !grounded,
    grounded,
    knockedDown: knockdownTimer > 0,
    clipWeights: sample.clipWeights.map((w) => ({ clip: w.clip, weight: Number(w.weight.toFixed(3)) })),
    hero: {
      assetId: assets.heroBean.id,
      url: assets.heroBean.url,
      clip: currentHeroClip,
      metres: assets.heroBean.bounds
    },
    position: [Number(position.x.toFixed(3)), Number(position.y.toFixed(3)), Number(position.z.toFixed(3))],
    yawDegrees: Number(((yaw * 180) / Math.PI).toFixed(1)),
    look: { id: LOOK_ID, category: "environment" },
    camera: { rig: heroNode ? "shoulder:hero" : "", presented },
    debugDraw,
    governor: { ...governorSettings },
    rank,
    checkpoint,
    stageName: STAGE_LABELS[checkpoint],
    progressPct: resolveCourseProgressPct(position.z, tuning.finishZ),
    qualified,
    raceTimeSeconds: Number(raceTimeSeconds.toFixed(2)),
    hitsTaken,
    bouncesTriggered,
    rivals: rivalTelemetry,
    typedAssetsUsed: TYPED_ASSET_KEYS
  };

  window.__AURA3D_CHARACTER_CONTROLLER_PROOF__ = proof;
  window.__AURA3D_BEAN_BRAWL__ = proof;
  renderHud(proof);
});

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "character-controller-hud";
  document.body.append(root);
  return root;
}

function formatOrdinal(rank: number): string {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}

function renderHud(proof: CharacterControllerProof): void {
  const statusLabel = proof.qualified
    ? `Qualified ${formatOrdinal(proof.rank)}`
    : proof.knockedDown
      ? "Wipeout recovery"
      : !proof.grounded
        ? "Airborne"
        : proof.running
          ? "Sprinting"
          : proof.moving
            ? "Running course"
            : "Starting grid";

  const standingsRows = [
    {
      name: "Hero Bean (You)",
      color: "#f472b6",
      clip: proof.hero.clip,
      progressPct: proof.progressPct,
      stage: proof.checkpoint,
      isPlayer: true
    },
    ...proof.rivals.map((r) => ({
      name: r.name,
      color: r.color,
      clip: r.clip,
      progressPct: r.progressPct,
      stage: r.checkpoint,
      isPlayer: false
    }))
  ].sort((a, b) => b.progressPct - a.progressPct);

  hudRoot.innerHTML = [
    `<header class="brawl-header">`,
    `  <h1 class="brawl-title">Bean Brawl Race</h1>`,
    `  <span class="brawl-status-chip" data-qualified="${proof.qualified}" data-knocked="${proof.knockedDown}">${statusLabel}</span>`,
    `</header>`,
    `<section class="brawl-kpi-strip">`,
    `  <div class="brawl-kpi-cell"><span class="brawl-kpi-label">rank</span><span class="brawl-kpi-value">${formatOrdinal(proof.rank)}/4</span></div>`,
    `  <div class="brawl-kpi-cell"><span class="brawl-kpi-label">stage</span><span class="brawl-kpi-value">${proof.checkpoint}/4</span></div>`,
    `  <div class="brawl-kpi-cell"><span class="brawl-kpi-label">course</span><span class="brawl-kpi-value">${proof.progressPct.toFixed(0)}%</span></div>`,
    `  <div class="brawl-kpi-cell"><span class="brawl-kpi-label">timer</span><span class="brawl-kpi-value-time">${proof.raceTimeSeconds.toFixed(1)}s</span></div>`,
    `</section>`,
    `<div class="brawl-stage-row">`,
    `  <span class="brawl-stage-name">${proof.stageName}</span>`,
    `  <span class="brawl-stage-clip">${proof.hero.clip} · ${proof.speed.toFixed(1)} m/s</span>`,
    `</div>`,
    `<div class="brawl-progress-track"><div class="brawl-progress-fill" style="width:${Math.min(100, Math.max(2, proof.progressPct))}%"></div></div>`,
    `<table class="brawl-standings">`,
    `  <thead><tr><th>racer</th><th>clip</th><th class="num">stage</th><th class="num">progress</th></tr></thead>`,
    `  <tbody>`,
    ...standingsRows.map(
      (row) =>
        `<tr data-player="${row.isPlayer}">` +
        `<td><span class="brawl-bean-dot" style="background:${row.color}"></span>${row.name}</td>` +
        `<td><span class="brawl-code-badge">${row.clip}</span></td>` +
        `<td class="num">${row.stage}/4</td>` +
        `<td class="num">${row.progressPct.toFixed(0)}%</td>` +
        `</tr>`
    ),
    `  </tbody>`,
    `</table>`,
    `<footer class="brawl-footer">`,
    `  <div class="brawl-controls-line">`,
    `    <span><kbd class="brawl-key">WASD</kbd> Move</span>`,
    `    <span><kbd class="brawl-key">Shift</kbd> Sprint</span>`,
    `    <span><kbd class="brawl-key">Space</kbd> Jump</span>`,
    `    <span><kbd class="brawl-key">R</kbd> Reset</span>`,
    `  </div>`,
    ...(proof.debugDraw
      ? [
          `<div class="brawl-code-badge">pos: ${proof.position[0]}, ${proof.position[1]}, ${proof.position[2]} | look: ${proof.look.id} | gov: res ${proof.governor.resolutionScale}</div>`
        ]
      : []),
    `</footer>`
  ].join("");
}
