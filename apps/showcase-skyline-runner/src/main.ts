// Skyline Runner — rebuilt single-path on the shared platformer kit.
// Every URL boots this module; the former legacy/v2 dispatcher, the Rapier
// solver merge and the generated game-geometry level are deleted. The kit
// (`game.platformer`) is the sole gameplay authority; motion comes from the
// shared `solvePlatformerMotion` solver over the authored rects in
// level.ts. Ghost replay is dropped: the trashed implementation replayed
// inputs through a second kit bound to the deleted level, and only its
// design (input recording, visual-only) was separable — not its code.
import {
  AnimationController,
  camera,
  effects,
  game,
  gameFeel,
  lights,
  looks,
  material,
  model,
  primitives,
  scene,
  sky,
  solvePlatformerMotion,
  type AuraNodeBuilder,
  type AuraSceneNode,
  type GamePlatformerEvent,
  type GamePlatformerSnapshot
} from "@aura3d/engine";
// PRD-09: mounted via the shared runtime — createGame owns mount/lifecycle,
// the tabletop HUD theme, the dpad-2btn touch preset, game-sfx-core cues,
// and the juice event map.
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets, HERO_CLIPS } from "./aura-assets";
import { playerYawForFacing } from "./facing";
import { createSkylineFlow, type SkylineFlowState } from "./flow";
import {
  buildSkylineLevel,
  SKYLINE_MOVING_PLATFORMS,
  SKYLINE_PLATFORMS,
  SKYLINE_PLAYER_HEIGHT,
  SKYLINE_START
} from "./level";

declare global {
  interface Window {
    __aura3dGameSnapshot?: SkylineRunnerEvidence;
  }
}

interface SkylineRunnerEvidence {
  readonly framed: boolean;
  readonly state: string;
  readonly frame: number;
  readonly score: number;
  readonly deaths: number;
  readonly checkpointId: string;
  readonly player: {
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly grounded: boolean;
    readonly airborne: boolean;
    readonly facing: number;
    readonly yaw: number;
  };
  readonly coins: { readonly collected: readonly string[]; readonly count: number };
  readonly flowScore: number;
  readonly flow: SkylineFlowState;
  readonly finished: boolean;
  readonly completion: { readonly completed: boolean; readonly finalTime: number | null };
  readonly level: { readonly act: number };
  readonly character: {
    readonly assetId: string;
    readonly clip: string;
    readonly clipTime: number;
    readonly clips: readonly string[];
    readonly locomotionState: string;
  };
  readonly events: readonly string[];
  readonly look: { readonly id: string; readonly category: string };
  readonly drawCalls: number;
  readonly audio: {
    readonly requestedEvents: readonly string[];
    readonly playedEvents: readonly string[];
    readonly playedCueCount: number;
    readonly suppressedCueCount: number;
    readonly contextState: string;
    readonly unlocked: boolean;
  };
}

// Winter-dusk look (art/direction.ts): polar-night supplies palette, sky,
// fog and grade; the scene adds only the foreground.
const LOOK_ID = "polar-night" as const;

// Shared solver, intent first: a jump of 2.3 character heights with a snappy
// feel, run pace stated per character height. No route-local gravity or
// jump-velocity constants — gravity/jumpVelocity/moveSpeed/coyote/buffer
// all come from this solution.
const motion = solvePlatformerMotion(SKYLINE_PLATFORMS, {
  feel: "snappy",
  characterHeight: SKYLINE_PLAYER_HEIGHT,
  jumpHeight: SKYLINE_PLAYER_HEIGHT * 2.3,
  runSpeedPerHeight: 4.5
});
const level = buildSkylineLevel(motion);
const platformer = game.platformer(level);
const flow = createSkylineFlow();
const routeEvents: string[] = [];

// Completion is never self-authored: this record starts uncompleted and is
// only stamped when the kit itself reports the finish.
const completionProof: { completed: boolean; finalTime: number | null } = {
  completed: false,
  finalTime: null
};

// Locomotion clip names are the hero GLB's own embedded clips (typed
// metadata in aura-assets.ts). The rig has no dedicated land clip, so the
// brief land state plays its real "crouch" clip. (The engine root does not
// re-export createGameLocomotionKit, so state selection follows the
// mini-game template's snapshot-driven pattern below.)
type HeroClip = "idle" | "walk" | "sprint" | "jump" | "fall" | "crouch" | "die";
const HERO_LOCOMOTION_CLIPS: readonly HeroClip[] = ["idle", "walk", "sprint", "jump", "fall", "crouch", "die"];
for (const clip of HERO_LOCOMOTION_CLIPS) {
  if (!HERO_CLIPS.includes(clip)) throw new Error(`skyline hero rig is missing embedded clip "${clip}"`);
}
// The GLB owns real clip timing (drive:"clips" applies the named clip on the
// node); controller durations are nominal loop bookkeeping for crossfades.
const heroAnimation = new AnimationController<HeroClip>({
  id: "skyline-hero-animation-controller",
  clips: HERO_LOCOMOTION_CLIPS.map((id) => ({
    id,
    duration: 1,
    frameRate: 60,
    loop: id !== "die" && id !== "crouch",
    suppressRootMotion: true,
    tracks: []
  })),
  requiredClips: HERO_LOCOMOTION_CLIPS,
  suppressRootMotion: true
});

const inputOptions = {
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    jump: ["Space", "KeyW", "ArrowUp"],
    dash: ["ShiftLeft", "ShiftRight"],
    down: ["KeyS", "ArrowDown"],
    reset: ["KeyR"]
  },
  axes: { moveX: { negative: "left", positive: "right" } },
  bufferMs: 140
} as const;

// Latest published snapshot, read by the createGame evidence section below.
// `window.__aura3dGameSnapshot` stays the sole evidence global.
let latestSnapshot: SkylineRunnerEvidence | undefined;

const skylineGame = createGame({
  id: "showcase-skyline-runner",
  target: "#app",
  autoStart: true,
  scene: buildScene,
  input: inputOptions,
  diagnostics: { overlay: false, performancePanel: false },
  hud: {
    theme: "tabletop",
    widgets: [
      { id: "stars", kind: "score", anchor: "top-left", label: "STARS" },
      { id: "timer", kind: "timer", mode: "stopwatch", anchor: "top", label: "TIME" },
      { id: "grade", kind: "score", anchor: "top-right", label: "FLOW" },
      { id: "deaths", kind: "score", anchor: "bottom-left", label: "DEATHS" },
      { id: "objective", kind: "objective", anchor: "bottom", label: "OBJECTIVE" }
    ]
  },
  touch: {
    preset: "dpad-2btn",
    bindings: { left: "left", right: "right", dash: "dash", jump: "jump", attack: "down" }
  },
  sound: {
    cues: {
      // art/direction.ts audio[] events on the shared sfx-pack mechanism.
      jump: { id: "jump", asset: { url: sfxUrl("ui.toggle.00") }, volume: 0.4 },
      land: { id: "land", asset: { url: sfxUrl("impact.rubber-ball.light.00") }, volume: 0.35 },
      pickup: { id: "pickup", asset: { url: sfxUrl("pickup.coin.00") }, volume: 0.7 },
      footstep: { id: "footstep", asset: { url: sfxUrl("impact.wood.light.00") }, volume: 0.25 },
      "act-ambience": { id: "act-ambience", asset: { url: sfxUrl("ambience.interior-hum") }, volume: 0.2, loop: true },
      checkpoint: { id: "checkpoint", asset: { url: sfxUrl("stinger.checkpoint.00") }, volume: 0.7 },
      complete: { id: "complete", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.8 },
      hazard: { id: "hazard", asset: { url: sfxUrl("impact.rubber-ball.heavy.00") }, volume: 0.7 }
    }
  },
  juice: {
    collect: { punch: { fovDeg: 1.2, ms: 140 }, flash: { color: "#ffd54d", peak: 0.12, ms: 160 } },
    checkpoint: { punch: { fovDeg: 1.6, ms: 200 }, flash: { color: "#62f8e7", peak: 0.16, ms: 220 } },
    complete: { hitStop: 0.06, punch: { fovDeg: 2.4, ms: 360 }, rumble: { strong: 0.7, ms: 320 } },
    hazard: { shake: 0.45, hitStop: 0.04, flash: { color: "#f06b7a", peak: 0.28, ms: 240 }, rumble: { strong: 0.5, ms: 200 } },
    land: { shake: 0.12 },
    jump: {}
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: { skylineRunner: () => latestSnapshot ?? { status: "unbound" } }
  }
});
const app = skylineGame.app;
const input = skylineGame.input;
if (!input) throw new Error("skyline-runner failed to create runtime-owned input.");
// Drive the createGame lifecycle: start() transitions booting -> loading ->
// playing after the first presented draw (no route-local renderer options,
// so device pixel ratio follows the shared tier/auto policy).
skylineGame.start();
void skylineGame.sound?.cue("act-ambience");

const player = app.nodes.require("skyline-player");
const lift = app.nodes.require("platform-bonus-lift");
const coins = (level.collectibles ?? []).map((coin) => [coin.id, app.nodes.require(`coin-${coin.id}`)] as const);
const checkpointNode = app.nodes.require("checkpoint-mid");
const goal = app.nodes.require("goal");
heroAnimation.bindRuntimeNode(player, { defaultClipId: "idle", fallbackClipId: "idle", drive: "clips" });
heroAnimation.play("idle", { restart: true, loop: "loop" });
let activeClip: HeroClip = "idle";

const hudRoot = document.querySelector<HTMLElement>("#panel") ?? createHudFallback();
let objective = "Collect stars, reach the finish gate";
// Direction audio[] events this route has cued, and the subset the sound
// object's evidence reports as actually-played nodes.
const DIRECTION_AUDIO_EVENTS = new Set(["footstep", "jump", "land", "pickup", "act-ambience"]);
const requestedAudioEvents = new Set<string>(["act-ambience"]);
const playedAudioEvents = new Set<string>();
let footstepTimer = 0;
let previousState = platformer.snapshot();

function cueDirectionEvent(event: "footstep" | "jump" | "land" | "pickup"): void {
  requestedAudioEvents.add(event);
  void skylineGame.sound?.cue(event);
}

// F-08-1: the follow2d rig owns the presented camera (flag-off mounts the
// no-op stub controller, so the scene's camera.follow spec stays fallback).
app.camera?.use(
  camera.rigs.follow2d({ target: "skyline-player", framing: { subjectHeightFraction: 0.18 } })
);
const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("platformer");

app.onFrame(({ dt }) => {
  if (input.pressed("reset")) {
    platformer.reset();
    flow.reset();
    completionProof.completed = false;
    completionProof.finalTime = null;
    routeEvents.push("reset:Route reset");
    objective = "Collect stars, reach the finish gate";
    previousState = platformer.snapshot();
  }
  const moveX = input.axis("moveX");
  const jumpPressed = input.buffered("jump");
  const dashPressed = input.pressed("dash");
  let remaining = Math.min(0.25, Math.max(0, dt));
  let firstSubstep = true;
  let state = platformer.snapshot();
  do {
    const substep = Math.min(0.05, remaining || 1 / 60);
    state = platformer.step(substep, {
      moveX,
      jumpPressed: firstSubstep && jumpPressed,
      jumpHeld: input.held("jump"),
      dashPressed: firstSubstep && dashPressed,
      fastFall: input.held("down")
    });
    for (const event of state.events) updateObjective(event);
    flow.step(substep, previousState, state);
    previousState = state;
    remaining -= substep;
    firstSubstep = false;
  } while (remaining > 0.000_001);

  // Stamp completion only from the kit's own finished status, with the flow
  // clock as the final time. Until then completionProof stays uncompleted.
  if (!completionProof.completed && state.status === "completed") {
    completionProof.completed = true;
    completionProof.finalTime = flow.snapshot().elapsedSeconds;
  }

  // Face travel: facing follows the sign of horizontal velocity while
  // moving, and the rig yaws into the play plane via the shared helper.
  const playerFacing: 1 | -1 = Math.abs(state.player.vx) > 0.05
    ? (state.player.vx >= 0 ? 1 : -1)
    : state.player.facing;
  player.setPosition(state.player.x, state.player.y + 0.01, 0);
  player.setRotation(0, playerYawForFacing(playerFacing), 0);

  const nextClip = locomotionClipFor(state, dt);
  if (nextClip !== activeClip) {
    activeClip = nextClip;
    heroAnimation.crossFade(nextClip, 0.12, { loop: "loop" });
  }
  heroAnimation.update(dt);

  if (state.player.grounded && Math.abs(state.player.vx) > 0.4) {
    footstepTimer -= dt;
    if (footstepTimer <= 0) {
      cueDirectionEvent("footstep");
      footstepTimer = 0.35;
    }
  }

  const mover = SKYLINE_MOVING_PLATFORMS[0];
  lift.setPosition(movingPlatformCenterX(state.time), mover.y + mover.height / 2, 0);
  for (const [id, node] of coins) node.setVisible(!state.collected.includes(id));
  checkpointNode.setVisible(!state.activatedCheckpoints.includes("mid"));
  goal.setScale(state.status === "completed" ? [4.6, 4.6, 4.6] : 3.4);
  feel.update(dt * 1000);
  renderHud(state);
  publishEvidence(state);
});

publishEvidence(platformer.snapshot());
renderHud(platformer.snapshot());
void skylineGame.ready().then(() => {
  const diagnostics = app.diagnostics();
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.aura3dRuntimeBackend = diagnostics.backend;
  document.body.dataset.aura3dDrawCalls = String(diagnostics.drawCalls);
  (window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__ = { ready: true, diagnostics };
}).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});

const DISTANT_CITADEL_TOWERS = [
  { id: "west-01", x: -12.0, width: 5.4, height: 22.0, z: -26.0, tone: "slate" as const },
  { id: "west-02", x: -5.5, width: 4.6, height: 27.5, z: -22.0, tone: "indigo" as const },
  { id: "launch-spire", x: 1.0, width: 5.8, height: 32.0, z: -29.0, tone: "slate" as const },
  { id: "step-tower", x: 7.4, width: 4.8, height: 25.0, z: -19.5, tone: "indigo" as const },
  { id: "mid-plaza-west", x: 13.5, width: 6.2, height: 35.0, z: -31.5, tone: "slate" as const },
  { id: "mid-plaza-east", x: 19.2, width: 4.5, height: 26.5, z: -21.0, tone: "indigo" as const },
  { id: "high-arch", x: 25.0, width: 5.6, height: 33.5, z: -27.5, tone: "slate" as const },
  { id: "drop-citadel", x: 31.2, width: 5.0, height: 28.0, z: -20.0, tone: "indigo" as const },
  { id: "finish-monolith", x: 37.5, width: 6.4, height: 36.0, z: -33.0, tone: "slate" as const },
  { id: "east-01", x: 44.0, width: 5.2, height: 24.5, z: -24.0, tone: "indigo" as const }
] as const;

function buildScene() {
  // Platform geometry comes from the library crate scaled to each authored
  // collision rect (mini-game pattern); the crate bounds drive the scale.
  const block = assets.quaterniusCubeCrate.bounds;
  const blockScale = (width: number, height: number, depth: number) =>
    [width / block[0], height / block[1], depth / block[2]] as const;

  const wetDeckMaterial = material.reflectiveFloor({
    color: "#1e293b",
    roughness: 0.14,
    metallic: 0.42,
    clearcoat: 0.82,
    clearcoatRoughness: 0.06,
    emissive: "#283548",
    emissiveIntensity: 0.06,
    texture: material.proceduralTextures.plastic()
  });
  const runningPadMaterial = material.blackRubber({
    color: "#141c2b",
    roughness: 0.84,
    emissive: "#1e293b",
    emissiveIntensity: 0.03,
    texture: material.proceduralTextures.rubber()
  });
  const safetyRailMaterial = material.brushedMetal({
    color: "#94a3b8",
    roughness: 0.24,
    emissive: "#38bdf8",
    emissiveIntensity: 0.05,
    texture: material.proceduralTextures.brushedMetal()
  });
  const runnerTrimMaterial = material.clearcoatPaint({
    color: "#f08a4b",
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    emissive: "#f08a4b",
    emissiveIntensity: 0.08,
    texture: material.proceduralTextures.plastic()
  });
  const curtainWallSlateMaterial = material.frostedGlass({
    color: "#1e293b",
    roughness: 0.28,
    opacity: 0.92,
    transmission: 0.24,
    emissive: "#38bdf8",
    emissiveIntensity: 0.07,
    texture: material.proceduralTextures.plastic()
  });
  const curtainWallIndigoMaterial = material.frostedGlass({
    color: "#283548",
    roughness: 0.24,
    opacity: 0.9,
    transmission: 0.28,
    emissive: "#f08a4b",
    emissiveIntensity: 0.08,
    texture: material.proceduralTextures.plastic()
  });

  const rooftopDeckNodes: AuraNodeBuilder<AuraSceneNode>[] = (level.platforms ?? []).flatMap((platform) => {
    const centerX = platform.x + platform.width / 2;
    const topY = platform.y + platform.height;
    const deckWidth = platform.width + 0.64;
    return [
      primitives.box({
        name: `${platform.id}-running-pad`,
        position: [centerX, topY - 0.03, -0.02],
        size: [platform.width + 0.14, 0.08, 1.38],
        material: runningPadMaterial
      }),
      primitives.box({
        name: `${platform.id}-rooftop-deck-slab`,
        position: [centerX, platform.y - 0.18, -0.08],
        size: [deckWidth, 0.38, 2.15],
        material: wetDeckMaterial
      }),
      primitives.box({
        name: `${platform.id}-runner-edge-trim`,
        position: [centerX, topY - 0.06, 0.66],
        size: [platform.width + 0.24, 0.1, 0.12],
        material: runnerTrimMaterial
      }),
      primitives.box({
        name: `${platform.id}-safety-rail-bar`,
        position: [centerX, topY + 0.56, -0.78],
        size: [platform.width + 0.28, 0.08, 0.08],
        material: safetyRailMaterial
      }),
      primitives.box({
        name: `${platform.id}-girder-beam`,
        position: [centerX, platform.y - 0.46, -0.12],
        size: [deckWidth + 0.2, 0.2, 2.28],
        material: safetyRailMaterial
      }),
      primitives.box({
        name: `${platform.id}-curtain-riser`,
        position: [centerX, platform.y - 5.2, -0.42],
        size: [platform.width + 0.36, 9.2, 1.85],
        material: curtainWallSlateMaterial
      })
    ];
  });

  const distantTowerNodes: AuraNodeBuilder<AuraSceneNode>[] = DISTANT_CITADEL_TOWERS.flatMap((tower) => {
    const baseY = -12.0;
    const centerY = baseY + tower.height / 2;
    const topY = baseY + tower.height;
    return [
      primitives.box({
        name: `citadel-tower-${tower.id}`,
        position: [tower.x, centerY, tower.z],
        size: [tower.width, tower.height, 4.2],
        material: tower.tone === "slate" ? curtainWallSlateMaterial : curtainWallIndigoMaterial,
        castShadow: false,
        receiveShadow: false
      }),
      primitives.box({
        name: `citadel-crown-${tower.id}`,
        position: [tower.x, topY + 0.24, tower.z + 0.2],
        size: [tower.width + 0.36, 0.45, 4.4],
        material: tower.tone === "slate" ? runnerTrimMaterial : safetyRailMaterial,
        castShadow: false,
        receiveShadow: false
      })
    ];
  });

  const horizonBackdropNodes: AuraNodeBuilder<AuraSceneNode>[] = [
    primitives.box({
      name: "horizon-dusk-band-amber",
      position: [16, -2.2, -34.5],
      size: [140, 9.5, 0.6],
      material: material.reflectiveFloor({
        color: "#f08a4b",
        roughness: 0.32,
        metallic: 0.12,
        emissive: "#f08a4b",
        emissiveIntensity: 0.08,
        texture: material.proceduralTextures.plastic()
      }),
      castShadow: false,
      receiveShadow: false
    }),
    primitives.box({
      name: "horizon-dusk-band-twilight",
      position: [16, 6.8, -34.8],
      size: [140, 10.5, 0.6],
      material: material.reflectiveFloor({
        color: "#283548",
        roughness: 0.36,
        metallic: 0.15,
        emissive: "#3b5bdb",
        emissiveIntensity: 0.08,
        texture: material.proceduralTextures.plastic()
      }),
      castShadow: false,
      receiveShadow: false
    }),
    primitives.box({
      name: "horizon-dusk-band-zenith",
      position: [16, 17.5, -35.0],
      size: [140, 14.0, 0.6],
      material: material.reflectiveFloor({
        color: "#1a2f5a",
        roughness: 0.4,
        metallic: 0.12,
        emissive: "#1a2f5a",
        emissiveIntensity: 0.08,
        texture: material.proceduralTextures.plastic()
      }),
      castShadow: false,
      receiveShadow: false
    })
  ];

  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [
    ...horizonBackdropNodes,
    ...distantTowerNodes,
    ...rooftopDeckNodes,
    ...(level.platforms ?? []).map((platform) =>
      model(assets.quaterniusCubeCrate, {
        name: `${platform.id} platform`,
        scaleMode: "world",
        material: wetDeckMaterial
      })
        .position(platform.x + platform.width / 2, platform.y + platform.height / 2, -0.05)
        .scale(blockScale(platform.width, platform.height, 1.24))),
    ...(level.movingPlatforms ?? []).map((platform) =>
      model(assets.quaterniusCubeCrate, {
        name: `${platform.id} moving platform`,
        scaleMode: "world",
        material: runnerTrimMaterial
      })
        .position(movingPlatformCenterX(0), platform.y + platform.height / 2, 0)
        .scale(blockScale(platform.width, platform.height, 0.92))
        .runtime(game.runtimeNode(`platform-${platform.id}`, { tags: ["platform", "moving"] }))),
    ...(level.collectibles ?? []).map((coin) =>
      model(assets.kenneyPlatformerKitStar, {
        name: `${coin.id} collectible`,
        material: material.emissive({ color: "#ffd54d", emissive: "#ffd54d", emissiveIntensity: 4, roughness: 0.3 })
      })
        .position(coin.x, coin.y, 0.02)
        .scale(1.15)
        .runtime(game.runtimeNode(`coin-${coin.id}`, { tags: ["collectible"] }))),
    ...(level.hazards ?? []).map((hazard) =>
      model(assets.quaterniusCubeCrate, {
        name: `${hazard.id} hazard`,
        scaleMode: "world",
        material: material.emissive({ color: "#e5484d", emissive: "#e5484d", emissiveIntensity: 0.9, roughness: 0.4 })
      })
        .position(hazard.x + hazard.width / 2, hazard.y + hazard.height / 2, 0.05)
        .scale(blockScale(hazard.width, hazard.height, 0.5))),
    model(assets.kenneyPlatformerKitKey, { name: "checkpoint key" })
      .position(level.checkpoints![0]!.x, level.checkpoints![0]!.y + 0.2, 0.08)
      .scale(2)
      .runtime(game.runtimeNode("checkpoint-mid", { tags: ["checkpoint"] })),
    model(assets.kenneyPlatformerKitStar, {
      name: "finish gate",
      material: material.emissive({ color: "#62f8e7", emissive: "#62f8e7", emissiveIntensity: 3, roughness: 0.3 })
    })
      .position(level.finish!.x, level.finish!.y + 0.5, 0.08)
      .scale(3.4)
      .runtime(game.runtimeNode("goal", { tags: ["finish"] }))
  ];
  const winterDuskSky = {
    name: "winter-dusk-backdrop",
    zenith: "#1a2f5a",
    horizon: "#f08a4b",
    ground: "#141d33",
    zenithColor: "#1a2f5a",
    horizonColor: "#f08a4b",
    groundColor: "#141d33",
    horizonGlow: 0.42,
    sun: { elevationDeg: 18, azimuthDeg: 324, intensity: 1.9, color: "#ffd59e" }
  };
  return scene()
    .background("#1a2f5a", { toneMapped: false })
    .add(looks.preset(LOOK_ID, { background: "#1a2f5a", sun: { elevationDeg: 34, azimuthDeg: 330 }, exposureEv: 0.28 }))
    .add(sky.gradient(winterDuskSky))
    .add(effects.fog({ name: "winter-dusk-atmosphere", color: "#2b4570", density: 0.016, intensity: 0.48 }))
    .add(
      lights.directional({
        name: "sunset-horizon-fill",
        position: [-14, 7.5, 9],
        target: [12, 1.5, 0],
        color: "#ffb478",
        intensity: 1.15,
        shadow: false
      })
    )
    .add(
      model(assets.showcaseKenneyOobiPlatformerHero, {
        name: "skyline hero",
        material: material.clearcoatPaint({
          color: "#38bdf8",
          roughness: 0.16,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
          emissive: "#0284c7",
          emissiveIntensity: 0.06
        })
      })
        .position(SKYLINE_START.x, SKYLINE_START.y + 0.01, 0)
        .scale(SKYLINE_PLAYER_HEIGHT / assets.showcaseKenneyOobiPlatformerHero.bounds[1])
        .runtime(game.runtimeNode("skyline-player", { tags: ["player"] }))
    )
    .addMany(nodes)
    .camera(
      camera.follow({
        targetNode: "skyline-player",
        position: [SKYLINE_START.x, SKYLINE_START.y + 3.2, 10.4],
        target: [SKYLINE_START.x, SKYLINE_START.y + 0.5, 0],
        fov: 46
      })
    );
}

let landTimer = 0;
function locomotionClipFor(state: GamePlatformerSnapshot, dt: number): HeroClip {
  if (state.events.some((event) => event.type === "land")) landTimer = 0.16;
  landTimer = Math.max(0, landTimer - dt);
  if (!state.player.grounded) return state.player.vy > 0 ? "jump" : "fall";
  if (landTimer > 0) return "crouch";
  const speed = Math.abs(state.player.vx);
  if (speed > motion.moveSpeed * 0.7) return "sprint";
  if (speed > 0.4) return "walk";
  return "idle";
}

function movingPlatformCenterX(time: number): number {
  const platform = SKYLINE_MOVING_PLATFORMS[0];
  const offset = Math.sin((time / platform.period) * Math.PI * 2) * platform.amplitude;
  return platform.x + platform.width / 2 + (platform.axis === "x" ? offset : 0);
}

function updateObjective(event: GamePlatformerEvent): void {
  routeEvents.push(event.id ? `${event.type}:${event.id}` : event.type);
  if (routeEvents.length > 16) routeEvents.shift();
  if (event.type === "collect") {
    skylineGame.juice.fire("collect");
    cueDirectionEvent("pickup");
  }
  if (event.type === "checkpoint") {
    objective = "Checkpoint reached. Finish the route.";
    skylineGame.juice.fire("checkpoint");
    void skylineGame.sound?.cue("checkpoint");
  }
  if (event.type === "complete") {
    objective = "Finished. Press R to replay.";
    skylineGame.juice.fire("complete");
    void skylineGame.sound?.cue("complete");
  }
  if (event.type === "hazard") {
    skylineGame.juice.fire("hazard");
    void skylineGame.sound?.cue("hazard");
  }
  if (event.type === "land") {
    skylineGame.juice.fire("land");
    cueDirectionEvent("land");
  }
  if (event.type === "jump") cueDirectionEvent("jump");
  if (event.type === "respawn") objective = "Respawned. Take the safer route.";
}

function createHudFallback(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "panel";
  document.body.append(root);
  return root;
}

function renderHud(state: GamePlatformerSnapshot): void {
  const flowState = flow.snapshot();
  skylineGame.hud.set("stars", state.collected.length);
  skylineGame.hud.set("timer", flowState.elapsedSeconds);
  skylineGame.hud.set("grade", Math.round(flowState.flowScore));
  skylineGame.hud.set("deaths", state.deaths);
  skylineGame.hud.set("objective", objective);
  hudRoot.innerHTML = `<strong>Skyline Runner</strong><div>Score ${state.score} | Flow ${Math.round(flowState.flowScore)} | Chain ${flowState.collectionChain}</div><div>Lives ${state.lives} | Deaths ${state.deaths} | Checkpoint ${state.checkpointId}</div><div>${objective}</div><div>Move A/D or arrows. Jump Space. Dash Shift. Reset R.</div>`;
}

function publishEvidence(state: GamePlatformerSnapshot): void {
  const diagnostics = app.diagnostics();
  const animation = heroAnimation.snapshot();
  const activePlayback = animation.clips.find((clip) => clip.clipId === animation.activeClipId);
  const flowState = flow.snapshot();
  const snapshot: SkylineRunnerEvidence = {
    // Framed once the renderer is submitting draw calls for the mounted
    // follow2d scene.
    framed: diagnostics.drawCalls > 0,
    state: state.status,
    frame: state.frame,
    score: state.score,
    deaths: state.deaths,
    checkpointId: state.checkpointId,
    player: {
      x: state.player.x,
      y: state.player.y,
      vx: state.player.vx,
      vy: state.player.vy,
      grounded: state.player.grounded,
      airborne: !state.player.grounded,
      facing: state.player.facing,
      yaw: playerYawForFacing(state.player.facing)
    },
    coins: { collected: state.collected, count: state.collected.length },
    flowScore: Math.round(flowState.flowScore * 10) / 10,
    flow: flowState,
    finished: state.status === "completed",
    completion: { completed: completionProof.completed, finalTime: completionProof.finalTime },
    level: { act: state.activatedCheckpoints.length + 1 },
    character: {
      assetId: assets.showcaseKenneyOobiPlatformerHero.id,
      clip: animation.activeClipId ?? activeClip,
      clipTime: activePlayback?.localTime ?? 0,
      clips: HERO_CLIPS,
      locomotionState: activeClip
    },
    events: [...routeEvents],
    look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
    drawCalls: diagnostics.drawCalls,
    audio: audioEvidence()
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
}

function audioEvidence(): SkylineRunnerEvidence["audio"] {
  const sound = skylineGame.sound?.evidence;
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
