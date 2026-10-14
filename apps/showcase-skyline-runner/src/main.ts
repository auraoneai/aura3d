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
  instances,
  lights,
  looks,
  material,
  model,
  primitives,
  scene,
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

const ALPINE_MOUNTAIN_PEAKS = [
  { id: "peak-west-02", x: -16.0, baseY: -4.2, side: 13.5, z: -17.6 },
  { id: "peak-west-01", x: -7.5, baseY: -4.2, side: 16.0, z: -16.2 },
  { id: "peak-launch", x: 1.5, baseY: -4.2, side: 18.5, z: -17.4 },
  { id: "peak-step", x: 9.8, baseY: -4.2, side: 15.2, z: -15.6 },
  { id: "peak-mid", x: 17.6, baseY: -4.2, side: 19.4, z: -17.8 },
  { id: "peak-high", x: 26.2, baseY: -4.2, side: 16.8, z: -15.8 },
  { id: "peak-finish", x: 34.8, baseY: -4.2, side: 18.2, z: -17.2 },
  { id: "peak-east-01", x: 43.5, baseY: -4.2, side: 14.6, z: -16.0 }
] as const;

const DISTANT_CITADEL_TOWERS = [
  { id: "west-01", x: -11.5, width: 3.4, height: 11.5, z: -11.8, tone: "slate" as const },
  { id: "west-02", x: -6.2, width: 2.9, height: 14.2, z: -9.4, tone: "indigo" as const },
  { id: "launch-spire", x: -0.8, width: 3.6, height: 16.8, z: -12.4, tone: "slate" as const },
  { id: "launch-east", x: 3.8, width: 2.7, height: 12.6, z: -7.8, tone: "indigo" as const },
  { id: "step-tower", x: 8.2, width: 3.2, height: 15.4, z: -10.6, tone: "slate" as const },
  { id: "mid-plaza-west", x: 13.0, width: 3.8, height: 18.0, z: -12.8, tone: "slate" as const },
  { id: "mid-plaza-east", x: 17.8, width: 2.8, height: 13.8, z: -8.2, tone: "indigo" as const },
  { id: "high-arch", x: 22.6, width: 3.5, height: 17.2, z: -11.4, tone: "slate" as const },
  { id: "drop-citadel", x: 27.8, width: 3.1, height: 14.6, z: -8.8, tone: "indigo" as const },
  { id: "finish-monolith", x: 33.4, width: 4.0, height: 18.6, z: -12.2, tone: "slate" as const },
  { id: "east-01", x: 39.2, width: 3.3, height: 13.2, z: -9.6, tone: "indigo" as const }
] as const;

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
      { id: "timer", kind: "timer", anchor: "top", label: "TIME" },
      { id: "grade", kind: "score", anchor: "top-right", label: "FLOW" },
      { id: "deaths", kind: "score", anchor: "bottom-right", label: "DEATHS" },
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

const hudRoot = styleHudRoot(document.querySelector<HTMLElement>("#panel") ?? createHudFallback());
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

function buildScene() {
  // Cargo crates seated on platforms + moving lift + hazard block use world-metre scaling.
  const block = assets.quaterniusCubeCrate.bounds;
  const blockScale = (width: number, height: number, depth: number): [number, number, number] =>
    [width / block[0], height / block[1], depth / block[2]];

  const wetDeckMaterial = material.reflectiveFloor({
    color: "#1e293b",
    roughness: 0.14,
    metallic: 0.48,
    clearcoat: 0.85,
    clearcoatRoughness: 0.05,
    emissive: "#283548",
    emissiveIntensity: 0.08
  });
  const runningDeckMaterial = material.ceramic({
    color: "#dbeafe",
    roughness: 0.18,
    clearcoat: 0.88,
    clearcoatRoughness: 0.04,
    emissive: "#38bdf8",
    emissiveIntensity: 0.09
  });
  const safetyRailMaterial = material.brushedMetal({
    color: "#94a3b8",
    roughness: 0.22,
    metallic: 0.88,
    emissive: "#38bdf8",
    emissiveIntensity: 0.08
  });
  const runnerTrimMaterial = material.clearcoatPaint({
    color: "#f08a4b",
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    emissive: "#f08a4b",
    emissiveIntensity: 0.09
  });
  const neonEdgeCyanMaterial = material.neon({
    color: "#38bdf8",
    emissive: "#38bdf8",
    emissiveIntensity: 1.65,
    practical: true
  });
  const neonEdgeAmberMaterial = material.neon({
    color: "#f59e0b",
    emissive: "#f59e0b",
    emissiveIntensity: 1.45,
    practical: true
  });
  const curtainWallSlateMaterial = material.frostedGlass({
    color: "#1e293b",
    roughness: 0.24,
    opacity: 0.95,
    transmission: 0.18,
    emissive: "#38bdf8",
    emissiveIntensity: 0.09
  });
  const curtainWallIndigoMaterial = material.frostedGlass({
    color: "#283548",
    roughness: 0.22,
    opacity: 0.94,
    transmission: 0.2,
    emissive: "#f08a4b",
    emissiveIntensity: 0.09
  });
  const alpineSlopeMaterial = material.ceramic({
    color: "#1e293b",
    roughness: 0.32,
    clearcoat: 0.65,
    clearcoatRoughness: 0.08,
    emissive: "#1e3a5f",
    emissiveIntensity: 0.09
  });
  const alpineSnowCapMaterial = material.ceramic({
    color: "#e2e8f0",
    roughness: 0.16,
    clearcoat: 0.9,
    clearcoatRoughness: 0.04,
    emissive: "#bae6fd",
    emissiveIntensity: 0.1
  });

  const platforms = level.platforms ?? [];

  // Multi-layer architectural deck detail batched into instanced box layers:
  // bright running deck surface + dark structural slab + cyan/amber practical
  // neon edge trims + brushed-metal girder underside + curtain-wall risers.
  const rooftopDeckNodes: AuraNodeBuilder<AuraSceneNode>[] = [
    instances.box({
      name: "rooftop-running-deck-surfaces",
      material: runningDeckMaterial,
      transforms: platforms.map((p) => ({
        position: [p.x + p.width / 2, p.y + p.height - 0.04, 0],
        scale: [p.width + 0.12, 0.08, 1.48]
      }))
    }),
    instances.box({
      name: "rooftop-structural-deck-slabs",
      material: wetDeckMaterial,
      transforms: platforms.map((p) => ({
        position: [p.x + p.width / 2, p.y + p.height * 0.45, -0.05],
        scale: [p.width + 0.36, Math.max(0.28, p.height * 0.9), 1.86]
      }))
    }),
    instances.box({
      name: "rooftop-neon-edge-trim-cyan",
      material: neonEdgeCyanMaterial,
      castShadow: false,
      receiveShadow: false,
      transforms: platforms.map((p) => ({
        position: [p.x + p.width / 2, p.y + p.height - 0.05, 0.78],
        scale: [p.width + 0.2, 0.06, 0.06]
      }))
    }),
    instances.box({
      name: "rooftop-neon-edge-trim-amber",
      material: neonEdgeAmberMaterial,
      castShadow: false,
      receiveShadow: false,
      transforms: platforms.map((p) => ({
        position: [p.x + p.width / 2, p.y + 0.04, 0.82],
        scale: [p.width + 0.28, 0.05, 0.06]
      }))
    }),
    instances.box({
      name: "rooftop-brushed-metal-girders",
      material: safetyRailMaterial,
      transforms: platforms.flatMap((p) => {
        const cx = p.x + p.width / 2;
        const topY = p.y + p.height;
        return [
          { position: [cx, p.y - 0.16, -0.08] as [number, number, number], scale: [p.width + 0.52, 0.24, 1.98] as [number, number, number] },
          { position: [cx, p.y - 0.38, -0.12] as [number, number, number], scale: [p.width + 0.24, 0.16, 1.62] as [number, number, number] },
          { position: [cx, topY + 0.44, -0.74] as [number, number, number], scale: [p.width + 0.16, 0.06, 0.06] as [number, number, number] }
        ];
      })
    }),
    instances.box({
      name: "rooftop-curtain-wall-risers",
      material: curtainWallSlateMaterial,
      transforms: platforms.map((p) => ({
        position: [p.x + p.width / 2, p.y - 2.35, -0.36],
        scale: [Math.max(1.2, p.width - 0.16), 4.1, 1.42]
      }))
    })
  ];

  // Industrial cargo crate stacks cleanly seated ON the platforms (rear deck lane z = -0.44)
  // so quaterniusCubeCrate never floats in mid-air and reads as grounded rooftop cargo.
  const seatedCargoCrateNodes: AuraNodeBuilder<AuraSceneNode>[] = platforms.flatMap((platform, index) => {
    const topY = platform.y + platform.height;
    const baseSize = 0.44;
    const topSize = 0.32;
    const stackX = platform.x + Math.min(platform.width - 0.65, Math.max(0.65, platform.width * 0.24));
    const secondX = platform.x + platform.width - Math.min(platform.width - 0.65, Math.max(0.65, platform.width * 0.22));
    return [
      model(assets.quaterniusCubeCrate, {
        name: `${platform.id}-cargo-crate-base`,
        scaleMode: "world",
        material: index % 2 === 0 ? safetyRailMaterial : runnerTrimMaterial
      })
        .position(stackX, topY + baseSize / 2, -0.44)
        .scale(blockScale(baseSize, baseSize, baseSize)),
      model(assets.quaterniusCubeCrate, {
        name: `${platform.id}-cargo-crate-top`,
        scaleMode: "world",
        material: index % 2 === 0 ? runnerTrimMaterial : safetyRailMaterial
      })
        .position(stackX + 0.03, topY + baseSize + topSize / 2, -0.44)
        .scale(blockScale(topSize, topSize, topSize)),
      model(assets.quaterniusCubeCrate, {
        name: `${platform.id}-cargo-crate-side`,
        scaleMode: "world",
        material: safetyRailMaterial
      })
        .position(secondX, topY + 0.38 / 2, -0.46)
        .scale(blockScale(0.46, 0.38, 0.42))
    ];
  });

  // Layered distant alpine mountain peaks (slate blue #1e293b) + snow-cap crowns (#e2e8f0)
  // in z = -18 to -15, plus mid-ground city skyline silhouettes in z = -13 to -7.
  const SQRT1_2 = Math.SQRT1_2;
  const distantMountainAndSkylineNodes: AuraNodeBuilder<AuraSceneNode>[] = [
    instances.box({
      name: "alpine-distant-mountain-peaks",
      material: alpineSlopeMaterial,
      castShadow: false,
      receiveShadow: false,
      transforms: ALPINE_MOUNTAIN_PEAKS.map((peak) => ({
        position: [peak.x, peak.baseY, peak.z],
        rotation: [0, 0, Math.PI / 4],
        scale: [peak.side, peak.side, 1.4]
      }))
    }),
    instances.box({
      name: "alpine-mountain-snow-caps",
      material: alpineSnowCapMaterial,
      castShadow: false,
      receiveShadow: false,
      transforms: ALPINE_MOUNTAIN_PEAKS.map((peak) => {
        const capSide = peak.side * 0.36;
        const capY = peak.baseY + (peak.side - capSide) * SQRT1_2;
        return {
          position: [peak.x, capY, peak.z + 0.16],
          rotation: [0, 0, Math.PI / 4],
          scale: [capSide, capSide, 1.55]
        };
      })
    }),
    instances.box({
      name: "citadel-skyline-towers-slate",
      material: curtainWallSlateMaterial,
      castShadow: false,
      receiveShadow: false,
      transforms: DISTANT_CITADEL_TOWERS.filter((t) => t.tone === "slate").map((tower) => ({
        position: [tower.x, -4.0 + tower.height / 2, tower.z],
        scale: [tower.width, tower.height, 2.4]
      }))
    }),
    instances.box({
      name: "citadel-skyline-towers-indigo",
      material: curtainWallIndigoMaterial,
      castShadow: false,
      receiveShadow: false,
      transforms: DISTANT_CITADEL_TOWERS.filter((t) => t.tone === "indigo").map((tower) => ({
        position: [tower.x, -4.0 + tower.height / 2, tower.z],
        scale: [tower.width, tower.height, 2.2]
      }))
    }),
    instances.box({
      name: "citadel-skyline-neon-crowns",
      material: neonEdgeCyanMaterial,
      castShadow: false,
      receiveShadow: false,
      transforms: DISTANT_CITADEL_TOWERS.map((tower) => ({
        position: [tower.x, -4.0 + tower.height + 0.14, tower.z + 0.2],
        scale: [tower.width + 0.22, 0.22, 2.5]
      }))
    })
  ];

  // Large sunlit sky backdrop panel at z = -22, horizon glow bands, and reflective
  // below-course cloud/water floor plane so the camera never sees a black void.
  const horizonBackdropNodes: AuraNodeBuilder<AuraSceneNode>[] = [
    primitives.box({
      name: "alpine-sunlit-sky-backdrop",
      position: [14, 6.5, -22.0],
      size: [130, 44, 0.8],
      material: material.ceramic({
        color: "#1e3a5f",
        roughness: 0.2,
        clearcoat: 0.88,
        clearcoatRoughness: 0.05,
        emissive: "#38bdf8",
        emissiveIntensity: 0.1
      }),
      castShadow: false,
      receiveShadow: false
    }),
    primitives.box({
      name: "horizon-dusk-band-twilight",
      position: [14, 1.6, -21.1],
      size: [130, 11.5, 0.5],
      material: material.ceramic({
        color: "#38bdf8",
        roughness: 0.18,
        clearcoat: 0.9,
        clearcoatRoughness: 0.04,
        emissive: "#38bdf8",
        emissiveIntensity: 0.1
      }),
      castShadow: false,
      receiveShadow: false
    }),
    primitives.box({
      name: "horizon-dusk-band-amber",
      position: [14, -2.2, -20.4],
      size: [130, 4.2, 0.4],
      material: material.clearcoatPaint({
        color: "#f08a4b",
        roughness: 0.16,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        emissive: "#f08a4b",
        emissiveIntensity: 0.1
      }),
      castShadow: false,
      receiveShadow: false
    }),
    primitives.box({
      name: "below-course-reflective-water-floor",
      position: [14, -3.85, -9.0],
      size: [130, 0.5, 36.0],
      material: material.reflectiveFloor({
        color: "#1e3a5f",
        roughness: 0.08,
        metallic: 0.54,
        clearcoat: 0.94,
        clearcoatRoughness: 0.03,
        emissive: "#38bdf8",
        emissiveIntensity: 0.09
      }),
      castShadow: false,
      receiveShadow: true
    })
  ];

  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [
    ...horizonBackdropNodes,
    ...distantMountainAndSkylineNodes,
    ...rooftopDeckNodes,
    ...seatedCargoCrateNodes,
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
        material: material.emissive({ color: "#ffd54d", emissive: "#ffd54d", emissiveIntensity: 4, roughness: 0.3, practical: true })
      })
        .position(coin.x, coin.y, 0.02)
        .scale(1.15)
        .runtime(game.runtimeNode(`coin-${coin.id}`, { tags: ["collectible"] }))),
    ...(level.hazards ?? []).map((hazard) =>
      model(assets.quaterniusCubeCrate, {
        name: `${hazard.id} hazard`,
        scaleMode: "world",
        material: material.emissive({ color: "#e5484d", emissive: "#e5484d", emissiveIntensity: 0.9, roughness: 0.4, practical: true })
      })
        .position(hazard.x + hazard.width / 2, hazard.y + hazard.height / 2, 0.05)
        .scale(blockScale(hazard.width, hazard.height, 0.5))),
    model(assets.kenneyPlatformerKitKey, { name: "checkpoint key" })
      .position(level.checkpoints![0]!.x, level.checkpoints![0]!.y + 0.2, 0.08)
      .scale(2)
      .runtime(game.runtimeNode("checkpoint-mid", { tags: ["checkpoint"] })),
    model(assets.kenneyPlatformerKitStar, {
      name: "finish gate",
      material: material.emissive({ color: "#62f8e7", emissive: "#62f8e7", emissiveIntensity: 3, roughness: 0.3, practical: true })
    })
      .position(level.finish!.x, level.finish!.y + 0.5, 0.08)
      .scale(3.4)
      .runtime(game.runtimeNode("goal", { tags: ["finish"] }))
  ];
  return scene()
    .background("#2b4570", { toneMapped: false })
    .add(looks.preset(LOOK_ID, { background: "#2b4570", sun: { elevationDeg: 34, azimuthDeg: 330 }, exposureEv: 0.35, fogDensityScale: 0 }))
    .add(effects.fog({ name: "winter-dusk-atmosphere", color: "#2b4570", density: 0.008, intensity: 0.32 }))
    .add(
      lights.directional({
        name: "sunset-horizon-fill",
        position: [-10, 8.5, 16],
        target: [12, 2.0, -10],
        color: "#ffb478",
        intensity: 1.85,
        shadow: false
      })
    )
    .add(
      lights.directional({
        name: "alpine-sky-wash",
        position: [14, 11.5, 20],
        target: [14, 3.0, -18],
        color: "#7dd3fc",
        intensity: 2.1,
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

function styleHudRoot(root: HTMLElement): HTMLElement {
  root.style.cssText = [
    "position:fixed",
    "left:14px",
    "bottom:14px",
    "top:auto",
    "min-width:0",
    "max-width:280px",
    "z-index:5",
    "font:500 11px/1.35 system-ui, sans-serif",
    "color:#f5fbff",
    "background:rgba(6,18,26,0.78)",
    "border:1px solid rgba(160,210,240,0.34)",
    "border-radius:8px",
    "padding:8px 10px",
    "pointer-events:none"
  ].join(";");
  return root;
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
  hudRoot.innerHTML = `<div id="skyline-hud"><div id="hud"><strong>Skyline Runner</strong><div>Score ${state.score} | Flow ${Math.round(flowState.flowScore)} | Chain ${flowState.collectionChain}</div><div>Lives ${state.lives} | Deaths ${state.deaths} | Checkpoint ${state.checkpointId}</div><div>${objective}</div><div>Move A/D or arrows. Jump Space. Dash Shift. Reset R.</div></div></div>`;
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
