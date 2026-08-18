import {
  createAuraApp,
  effects,
  game,
  lights,
  material,
  model,
  bindGameTouchControls,
  planLayeredSceneComposition,
  platformerCompositionSpec,
  primitives,
  scene,
  type RuntimeNodeHandleLike
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import {
  getSkylineActPalette,
  planSkylineActBackdrop,
  resolveSkylineAct,
  resolveSkylineActIndex
} from "./act-palette";
import { SKYLINE_AUDIO_CUE_WISHLIST } from "./audio-cues";
import { applySkylineActPaletteVisibility, createSkylineFeel } from "./feel";
import { createSkylineAudio, type SkylineAudioController, type SkylineAudioProof } from "./skyline-audio";
import { skylineAudioManifest, type SkylineAudioCue } from "./skyline-audio-manifest";
import {
  buildSkylineHudSnapshot,
  isSkylineDebugMode,
  setupSkylineHud,
  updateSkylineHud
} from "./hud";
import { gameGeometryContract } from "./generated/game-geometry";
import {
  SKYLINE_AUTHORED_PLAYABLE_SECONDS,
  SKYLINE_CHARACTER_HEIGHT,
  SKYLINE_CHARACTER_WIDTH,
  SKYLINE_LEVEL_ACTS,
  SKYLINE_MAX_TARGET_PLAYABLE_SECONDS,
  SKYLINE_MIN_PLAYABLE_SECONDS,
  SKYLINE_SECTION_LAYOUTS,
  SKYLINE_SECTION_COUNT,
  SKYLINE_SECTION_STRIDE,
  SKYLINE_SENTRY_ENCOUNTERS,
  SKYLINE_EMBER_PICKUPS,
  createSkylineLevel,
  skylinePlayableSurfaceMap,
  skylineMotion
} from "./level";
import { createRunnerChallenge } from "./runner-challenge";

const reducedMotion = typeof window !== "undefined"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const input = game.input({
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    jump: ["KeyW", "ArrowUp", "Space"],
    dash: ["ShiftLeft", "KeyK"],
    fire: ["KeyJ", "KeyL"],
    pause: ["KeyP"],
    reset: ["KeyR"]
  },
  axes: { moveX: { negative: "left", positive: "right" } },
  bufferMs: 120
});
const authoredPlayableSeconds = SKYLINE_AUTHORED_PLAYABLE_SECONDS;
const playableSurfaceMap = skylinePlayableSurfaceMap;
const solvedMotion = skylineMotion;
const level = createSkylineLevel();

/**
 * Scene depth of the typed world plane, as a design choice.
 *
 * This is the *input* to the scene binding. Downstream consumers read the resolved value back from
 * `platformerScene.worldZ` rather than reusing this constant, so a world-model scene offset cannot make the two
 * disagree.
 */
const WORLD_PLANE_DEPTH = -0.46;
const GAMEPLAY_ACTOR_DEPTH = 0.42;

const platformerScene = game.platformerSceneBinding({
  surfaceMap: playableSurfaceMap,
  level,
  worldAsset: "showcaseKenneyVerdantPlatformerWorld",
  // Preserve the original district's readable on-screen density across one genuinely
  // long world. Both dimensions describe the full 10-district GLB now; neither repeats it.
  targetSceneWidth: 6.4 * SKYLINE_SECTION_COUNT,
  worldModelTargetMaxDimension: 6.4 * SKYLINE_SECTION_COUNT,
  worldY: -0.72,
  worldZ: WORLD_PLANE_DEPTH,
  playerZ: GAMEPLAY_ACTOR_DEPTH,
  playerTargetHeight: SKYLINE_CHARACTER_HEIGHT,
  playerYOffset: 0
});
const skylineWorldNodes = [
  model(assets.showcaseKenneyVerdantPlatformerWorld, {
    name: "platformer-bound-level-one-world",
    role: "primaryWorld",
    scaleMode: "fit",
    targetMaxDimension: platformerScene.worldModel.targetMaxDimension
  }).position(
    platformerScene.worldModel.position[0],
    platformerScene.worldModel.position[1],
    platformerScene.worldModel.position[2]
  ).rotate(
    platformerScene.worldModel.rotation[0],
    platformerScene.worldModel.rotation[1],
    platformerScene.worldModel.rotation[2]
  ).runtime(game.runtimeNode("platformer-bound-level-one-world", {
    tags: ["world", "typed-primary-asset", "single-level-one-world", "asset-surface-bound"]
  }))
];
const skylineSentryNodes = SKYLINE_SENTRY_ENCOUNTERS.map((encounter, index) => {
  const [sceneX, sceneY] = platformerScene.toScenePoint({
    x: encounter.x + encounter.width / 2,
    y: encounter.y
  });
  return model(assets.showcaseExpressiveRobot, {
    name: `relay-sentry-${encounter.id}`,
    scaleMode: "fit",
    targetHeight: SKYLINE_CHARACTER_HEIGHT * 0.92,
    castShadow: true,
    receiveShadow: true
  }).animate({ clip: "Standing", loop: true, captureTime: 0.35 })
    .position(sceneX, sceneY, GAMEPLAY_ACTOR_DEPTH)
    .rotate(0, Math.PI / 2, 0)
    .runtime(game.runtimeNode(`relay-sentry-${encounter.id}`, {
      tags: ["enemy", "typed-character", "hazard-aligned", `act-${SKYLINE_SECTION_LAYOUTS[encounter.section]?.act ?? 0}`]
    }));
});
const finishPoint = platformerScene.toScenePoint({ x: level.finish?.x ?? 0, y: level.finish?.y ?? 0 });
const summitBeaconMaterial = material.pbr({
  name: "aurora summit beacon",
  color: "#e5ad43",
  metallic: 0.42,
  roughness: 0.24
});
const summitCoreMaterial = material.pbr({
  name: "restored summit core",
  color: "#64e8c4",
  metallic: 0.2,
  roughness: 0.18
});
const skylineSummitBeaconNodes = [
  // A compact, grounded summit marker replaces the former full-height square
  // frame and floating side orbs. That frame read as unexplained architecture
  // rather than a goal. The stepped plinth, mast and single core now form one
  // unmistakable beacon silhouette beside the certified finish surface.
  primitives.box({ name: "summit beacon plinth", material: summitBeaconMaterial })
    .position(finishPoint[0], finishPoint[1] + 0.055, platformerScene.worldZ + 0.4)
    .scale([0.48, 0.11, 0.22]),
  primitives.box({ name: "summit beacon pedestal", material: summitBeaconMaterial })
    .position(finishPoint[0], finishPoint[1] + 0.15, platformerScene.worldZ + 0.4)
    .scale([0.3, 0.09, 0.18]),
  primitives.box({ name: "summit beacon mast", material: summitBeaconMaterial })
    .position(finishPoint[0], finishPoint[1] + 0.35, platformerScene.worldZ + 0.4)
    .scale([0.1, 0.38, 0.12]),
  primitives.sphere({ name: "summit beacon core", material: summitCoreMaterial })
    .position(finishPoint[0], finishPoint[1] + 0.62, platformerScene.worldZ + 0.42)
    .scale([0.16, 0.21, 0.14])
];
const platforms = level.platforms ?? [];
const checkpoints = level.checkpoints ?? [];
const hazards = level.hazards ?? [];
const collectibles = level.collectibles ?? [];
const characterScaleRatio = level.assetBinding.characterScaleRatio ?? 1;
const platformerState = game.platformer(level);
let state = platformerState.snapshot();
const runnerChallenge = createRunnerChallenge(level.assetBinding.authoredPlayableSeconds);
let challengeEvidence = runnerChallenge.evidence();
const initialPlayerPose = platformerScene.toScenePlayer(state.player);
let playerFacing = 1;
const playerYawForFacing = (facing: number) => facing >= 0 ? Math.PI / 2 : -Math.PI / 2;
let frameCount = 0;

const completionProof = {
  completed: false,
  stable: false,
  finalTime: 0,
  checkpoints: [] as string[],
  eventCounts: {
    respawn: 0,
    finish: 0
  }
};
/**
 * Public `game.platformer` browser contract proof. Every flag starts false and
 * is only raised by an observed mounted kit event or an observed state delta.
 * Level configuration alone can no longer satisfy any field: a route that never
 * runs reports an all-false contract.
 */
const kitContractProof = {
  kind: "aura-game-platformer-kit-browser-contract" as const,
  source: "game.platformer" as const,
  moveChangesX: false,
  movementChangesPosition: false,
  jumpChangesVerticalState: false,
  checkpointOrProgression: false,
  hazardRespawnOrRetry: false,
  finishProgression: false,
  jumpEvent: false,
  landEvent: false,
  collectEvent: false,
  checkpointEvent: false,
  hazardEvent: false,
  fallEvent: false,
  respawnEvent: false,
  finishEvent: false,
  completedStatus: false,
  resetRestoresStart: false,
  eventTypes: [] as string[]
};

/** Records observed kit event types into the contract proof. */
function recordKitEvents(events: readonly { readonly type: string }[]): void {
  for (const event of events) {
    if (!kitContractProof.eventTypes.includes(event.type)) kitContractProof.eventTypes.push(event.type);
    if (event.type === "jump") kitContractProof.jumpEvent = true;
    if (event.type === "land") kitContractProof.landEvent = true;
    if (event.type === "collect") kitContractProof.collectEvent = true;
    if (event.type === "checkpoint") {
      kitContractProof.checkpointEvent = true;
      kitContractProof.checkpointOrProgression = true;
    }
    // The kit emits "hazard" for hazard contact and "fall" for a missed jump.
    // Both are death causes that lead to a respawn, so both raise the
    // retry contract while staying distinguishable in `eventTypes`.
    if (event.type === "hazard") {
      kitContractProof.hazardEvent = true;
      kitContractProof.hazardRespawnOrRetry = true;
    }
    if (event.type === "fall") {
      kitContractProof.fallEvent = true;
      kitContractProof.hazardRespawnOrRetry = true;
    }
    if (event.type === "respawn") kitContractProof.respawnEvent = true;
    if (event.type === "complete") {
      kitContractProof.finishEvent = true;
      kitContractProof.finishProgression = true;
    }
  }
}
/**
 * Embedded clip names published by assets.showcaseKenneyOobiPlatformerHero. The
 * hero ships real animation clips, so locomotion drives actual clip playback
 * through the public game.locomotion kit instead of a scale-squash stand-in.
 */
const HERO_EMBEDDED_CLIPS = [
  "attack-kick-left", "attack-kick-right", "attack-melee-left", "attack-melee-right",
  "crouch", "die", "drive", "emote-no", "emote-yes", "fall", "holding-both",
  "holding-both-shoot", "holding-left", "holding-left-shoot", "holding-right",
  "holding-right-shoot", "idle", "interact-left", "interact-right", "jump",
  "pick-up", "sit", "sprint", "static", "walk"
] as const;

/**
 * Kit locomotion state -> embedded clip. `land` and `hit` have no dedicated
 * embedded clip, so they map to the nearest real clip the asset does contain.
 */
const HERO_LOCOMOTION_CLIP_MAP = {
  idle: "idle",
  run: "sprint",
  jump: "jump",
  fall: "fall",
  land: "crouch",
  hit: "die"
} as const;

const locomotion = game.locomotion({
  clipMap: HERO_LOCOMOTION_CLIP_MAP,
  availableClips: HERO_EMBEDDED_CLIPS,
  initialState: "idle"
});
/** Effectively-zero scale used to hide a feedback node without removing it. */
const HIDDEN_FEEDBACK_SCALE = [0.0001, 0.0001, 0.0001] as const;
/** Matches the stylesheet's compact breakpoint so camera and CSS agree on "mobile". */
const compactViewport = window.innerWidth <= 620;
const animationStateHistory: { state: string; clip: string }[] = [
  { state: "idle", clip: HERO_LOCOMOTION_CLIP_MAP.idle }
];
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Depth composition for the traversal frame, planned by the reusable layer.
 *
 * ## The measured defect
 *
 * In the previous retained frame a single flat sky bucket covered **44.3%** of the scene viewport, and
 * the level sat in one horizontal band with no middle distance, so every element read at the same
 * apparent depth.
 *
 * ## Why this uses typed assets and not primitives
 *
 * Two earlier attempts wired this layer with primitive silhouettes -- cylinders, then flattened spheres
 * -- and both measured *worse* than the baseline: they read as industrial silos and floating lozenges.
 * I then recorded that the catalog had no suitable props and left this unwired. **That claim was wrong.**
 * Searching the unrestricted catalog returned 10 pullable CC-BY-4.0 candidates for "low poly pine tree"
 * and 10 for rock queries; screening them through the isolated release probe produced
 * `assets.propPineTree` (a textured pine cluster) and `assets.propRockB` (a textured rock formation).
 * A third candidate resolved to a palm-tree grid and was rejected by that same rendered screening, which
 * is the pipeline working rather than failing.
 *
 * So the route now declares *intent* only -- span, gameplay depth, prop vocabulary, protected zones and a
 * mobile density reduction -- and `planLayeredSceneComposition` returns deterministic placements. No
 * coordinate below is authored by hand, and the fixed seed makes the retained screenshots reproducible.
 *
 * These are strictly background set dressing: placed behind the traversal volume, scaled well under the
 * play space, and never standing in for a platform, hazard, checkpoint or collectible.
 */
const levelSpan = platforms.reduce<readonly [number, number]>(
  (span, platform) => [
    Math.min(span[0], platform.x - (platform.width ?? 0) / 2),
    Math.max(span[1], platform.x + (platform.width ?? 0) / 2)
  ],
  [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
);
const initialActPalette = getSkylineActPalette(0);
const sceneSpan = [
  levelSpan[0] * platformerScene.transform.scale + platformerScene.transform.offsetX,
  levelSpan[1] * platformerScene.transform.scale + platformerScene.transform.offsetX
] as const;
const compositionPlan = planLayeredSceneComposition(platformerCompositionSpec({
  // Fixed seed: retained evidence must be reproducible frame-for-frame.
  seed: 20260802,
  span: sceneSpan,
  // Read back from the binding, so a world-model offset is included rather than assumed away.
  gameplayDepth: platformerScene.worldZ,
  // One stylized prop vocabulary keeps this Kenney world coherent. The previous
  // photogrammetry-derived orange rocks were individually valid assets but read
  // as pasted-in photographs beside the flat-shaded trees and platforms.
  foregroundProps: [{ id: "tree", weight: 1, scaleBias: 0.42 }],
  midgroundProps: [{ id: "tree", weight: 1, scaleBias: 0.52 }],
  backgroundProps: [{ id: "tree", weight: 1, scaleBias: 0.82 }],
  /*
   * Keep the hero's start area clear in every layer that can sit near the play plane.
   *
   * Protecting only `foreground` was not enough: a midground rock landed beside the hero and the probe's
   * measured hero foreground width dropped from 86px to 82px. Hero readability is a stated acceptance
   * requirement, so the zone now covers both near layers and is wide enough to bracket the start
   * platform rather than just the spawn point.
   */
  protectedZones: [
    {
      span: [sceneSpan[0] - 0.4, sceneSpan[0] + 1.6],
      roles: ["foreground", "midground"],
      reason: "hero start and first-platform readability"
    }
  ],
  // Mobile shows far less horizontal world, so the same spec thins itself rather than the route
  // restating any per-layer number.
  densityScale: compactViewport ? 0.6 : 1
}));

/**
 * Scene nodes for the planned composition, using typed assets.
 *
 * Scale is expressed via `targetHeight` so each conifer is normalized from its
 * typed manifest bounds rather than from a raw model multiplier.
 */
/*
 * The composition planner remains the source of the backdrop depth, but its former
 * `propConifer` placements are intentionally not rendered. Each prop asset is itself a row
 * of trees; instancing rows across three depth layers created the floating forest bands found
 * during original-resolution review. The certified world already supplies grounded trees,
 * mountains and clouds, so another repeated tree vocabulary only made the scene less credible.
 */

/**
 * Banded sky backdrop, planned rather than authored.
 *
 * ## The defect this replaces
 *
 * This route previously authored its backdrop as one emissive box at
 * `.position(0, 3.4, -9).scale([46, 20, 0.2])` with a single flat colour. Measured on the retained
 * route-primary frame (`showcase-skyline-runner.png`, 1108x900 analysis crop) that produced a dominant
 * colour bucket covering **43.65%** of the scene viewport and flat sky-plus-ground covering **59.77%** --
 * the "excessive empty sky" the brief names as Skyline's core weakness, and six route-local magic
 * numbers besides.
 *
 * A flat plane was the only thing the route *could* author, because the reusable layer supplied no sky
 * capability at all. `planSkyBackdrop` supplies it: horizon placement, band count and horizon-weighted
 * band distribution are genre knowledge now, and this route declares only its own extent.
 *
 * The bands sit behind the far-background composition layer, so they never occlude a prop, a platform or
 * the hero, and every value below is read back from the plan.
 */
const farBackgroundDepth = Math.min(...compositionPlan.layers.map((layer) => layer.depth)) - 2.4;
const horizonY = platformerScene.toScenePoint({ x: 0, y: 0 })[1];

function createActSkyBackdropNodes(actIndex: number) {
  const backdrop = planSkylineActBackdrop({
    actIndex,
    sceneSpan,
    horizonY,
    farBackgroundDepth
  });
  return backdrop.plan.bands.map((band, bandIndex) => {
    const colors = backdrop.bandColors[bandIndex]!;
    return primitives.box({
      name: `skyline act-${actIndex} ${band.side} band ${band.index}`,
      material: material.emissive({
        name: `act-${actIndex} ${band.side} ${band.index}`,
        color: colors.color,
        emissive: colors.emissive,
        emissiveIntensity: colors.emissiveIntensity,
        roughness: 0.9
      })
    }).position(0, band.centerY, band.z).scale([band.width, band.height, 0.2]).runtime(
      game.runtimeNode(`skyline-act-${actIndex}-${band.side}-${band.index}`, {
        tags: ["backdrop", "sky-band", `act-${actIndex}`]
      })
    );
  });
}

function createActFogNode(actIndex: number) {
  const palette = getSkylineActPalette(actIndex);
  return effects.fog({
    name: `skyline act-${actIndex} distance haze`,
    color: palette.fogColor,
    density: palette.fogDensity,
    intensity: palette.fogIntensity
  }).runtime(game.runtimeNode(`skyline-act-${actIndex}-fog`, {
    tags: ["backdrop", "fog", `act-${actIndex}`]
  }));
}

const actSkyBackdropNodeBuilders = [0, 1, 2, 3, 4].flatMap((actIndex) => createActSkyBackdropNodes(actIndex));
const actFogNodeBuilders = [0, 1, 2, 3, 4].map((actIndex) => createActFogNode(actIndex));
const actPaletteLights = [0, 1, 2, 3, 4].map((actIndex) => {
  const palette = getSkylineActPalette(actIndex);
  return {
    ambient: lights.ambient({ name: `skyline act-${actIndex} fill`, color: palette.ambientLightColor, intensity: palette.ambientLightIntensity }),
    key: lights.directional({ name: `skyline act-${actIndex} key`, color: palette.keyLightColor, intensity: palette.keyLightIntensity }).position(-3, 5, 4),
    checkpoint: lights.point({ name: `skyline act-${actIndex} relay`, color: palette.checkpointLightColor, intensity: palette.checkpointLightIntensity }).position(1.7, 1.8, 2.4)
  };
});

const platformerCamera = game.platformerCameraRig({
  sceneBinding: platformerScene,
  player: state.player,
  mode: "follow",
  targetNode: "platformer-player",
  /*
   * Framing serves the side-scroller read, bounded by the gate that actually applies to it.
   *
   * A previous pass zoomed this camera to distance 3.2 to satisfy `readabilityRuleForRole("character")`
   * -- `minHeightPx: 120`, `minHeightRatio: 0.25`, `minAreaRatio: 0.015`. Those floors do **not**
   * apply to this camera. They are checked by `createRoleAwareRenderedProbeWarnings` in the asset CLI
   * against `asset.renderedProbe`, which is a separate isolated 752x600 asset shot
   * (`tests/reports/showcase-release-asset-probes/showcaseKenneyOobiPlatformerHero.png`, foreground
   * 327x370). Zooming the *gameplay* camera cannot change that artifact, so the zoom bought nothing
   * and directly caused the "oversized low-detail mascot" verdict: the hero filled the frame and the
   * typed world stopped reading as the level.
   *
   * The gate that does apply to this frame is `routePrimaryProbeThresholds`:
   * `minForegroundWidth: 96`, `minForegroundHeight: 72`, `minReadabilityScore: 35`. The hero measured
   * 98x107 at distance 5.2, already clearing both size floors, which is why pulling back is safe.
   *
   * 5.6 targets the PRD's "hero at roughly one-eighth of frame height" with the traversal path ahead
   * visible. Mobile keeps its own, further-back setting with a wider vertical fov: a taller, narrower
   * viewport shows far less horizontal world at the same distance, and a single desktop value cropped
   * the hero at the left edge and cut the platform run on the 390px capture.
   *
   * `height` is tuned against measured content bounds, not by eye. The rig places the camera at
   * `target[1] + height` and looks level, so height trades empty sky above the level against empty
   * space below it. Measured by trimming the canvas to its non-sky content: at height 0.86 the level
   * sat high with a large dead band below; at 0.34 the content band was y 352-900, i.e. **39.1% empty
   * sky above and 0% below**, pinning the traversal run against the bottom edge. 0.62 splits the
   * difference so the run sits in the lower-middle third with the ridge line and sky reading above it.
   */
  /*
   * 4.4 desktop, from measurement rather than taste.
   *
   * The gate that governs this frame is `routePrimaryProbeThresholds.minForegroundWidth: 96`. At 5.6 the
   * hero silhouette measured 78px and the probe failed -- a pre-existing shortfall (86px before the
   * composition layer was wired) that the new background props slightly worsened by perturbing the
   * subject-difference measurement. Hero silhouette scales inversely with distance, so 5.6 -> 4.4 lifts
   * ~78px to ~99px, clearing the floor.
   *
   * Pulling in was previously avoided because an earlier pass over-zoomed to 3.2 chasing
   * `readabilityRuleForRole` floors that do not apply to this camera, producing an "oversized mascot"
   * frame. 4.4 is a measured midpoint: it satisfies the gate that does apply while the reusable
   * composition layer now supplies the world density that made the wider shot desirable.
   */
  /*
   * 3.75 desktop, from measurement rather than taste.
   *
   * With the settled pose made genuinely deterministic (see `settleSubjectPose`), the hero measured 96-98px wide
   * across five consecutive probe runs against `routePrimaryProbeThresholds.minForegroundWidth: 96`. Stable, but
   * sitting *on* the floor: a 1px measurement difference decides the gate. The rebuilt 2.0 level measured 91px at
   * 4.1 after its world-composition update. Silhouette width scales inversely with distance, so 4.1 -> 3.75 targets
   * ~100px and buys real margin without returning to the over-zoomed "oversized mascot" framing at 3.2.
   */
  // Portrait needs a closer, nearly centered follow view. The former 1.35-unit
  // look-ahead pushed the hero half outside the left edge while distance 6.0
  // reduced the playable band to a thin strip across the middle of the phone.
  distance: compactViewport ? 4.6 : 3.75,
  height: compactViewport ? 0.58 : 0.62,
  lookAhead: compactViewport ? 0.32 : 1.05,
  fov: compactViewport ? 48 : 42
});
const cameraLookAhead = compactViewport ? 0.32 : 1.05;
const cameraDistance = compactViewport ? 4.6 : 3.75;
const cameraHeight = compactViewport ? 0.58 : 0.62;
const skylineAudio = createSkylineAudio(reducedMotion);
const skylineFeel = createSkylineFeel({
  reducedMotion,
  cameraBaseOffset: [round(cameraLookAhead * 0.42), round(cameraHeight), round(cameraDistance)],
  cameraTargetOffset: [round(cameraLookAhead), 0.34, 0],
  audio: skylineAudio
});
// Unlock the web-audio context on the first real interaction so autoplay policy
// lets synth SFX play (mirrors the Clash gesture-unlock discipline).
const skylineAudioUnlock = (): void => {
  window.removeEventListener("pointerdown", skylineAudioUnlock);
  window.removeEventListener("keydown", skylineAudioUnlock);
  void skylineAudio.unlock();
};
window.addEventListener("pointerdown", skylineAudioUnlock);
window.addEventListener("keydown", skylineAudioUnlock);
let hudElements: ReturnType<typeof setupSkylineHud> | undefined;
let paused = false;
let lastActPaletteIndex = 0;
setupSkylineGameHud();

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  // FS-304: this route is the root renderer integration reference, so it opts
  // explicitly into the typed-GLB production bridge. That makes the bloom, fog,
  // and shadow features it already authors actually render, each of which has its
  // own root-only browser contract. `fallback: "safe-basic"` keeps the route honest
  // if the bridge is ever ineligible.
  //
  // Adopting the bridge originally regressed this scene badly (draw calls
  // 175 -> 26, typed world GLB and most platforms missing). The cause was the
  // bridge sizing typed models from manifest metadata bounds instead of the
  // actually-loaded GLB bounds, which collapsed models toward zero size. That is
  // fixed in the bridge itself; the two paths now agree to within 611 of 1.3M
  // pixels on this route.
  renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
  scene: scene()
    .background(initialActPalette.sceneBackground)
    /*
     * Background depth comes from the typed world, not from primitive stand-ins.
     *
     * This block previously authored a graded "sky wall" plus five rotated boxes named
     * `skyline far peak west/center/east` and `skyline near peak west/east`, a valley-floor
     * occluder, and a foreground shadow shelf. Every one of them duplicated geometry the typed
     * world already contains: `showcaseKenneyVerdantPlatformerWorld` ships
     * **8 `background-mountain-*` nodes, 18 `background-cloud-*` nodes, 22 `cliff-rock-*` nodes,
     * 11 `tree-trunk`/`tree-canopy` pairs**, and its own ground and grass-top platforms.
     *
     * The duplication is why the frame read as "generated surfaces as the apparent primary world":
     * the primitives sat in front of the asset's own ridges at a scale tuned independently of it, so
     * the flat rotated boxes were the mountains a viewer actually saw, and the asset's ridges were
     * hidden behind them. Removing them is what lets the typed world carry the level.
     *
     * A backdrop is still needed, because the asset has no skydome. It is now *planned* rather than
     * authored: `planSkyBackdrop` supplies the bands and `blendSkyBandColor` the per-band colour, so
     * not one position, scale or hex value below is chosen by hand. It remains set dressing only,
     * behind the traversal volume, and never stands in for a platform, hazard, checkpoint or
     * collectible.
     */
    .addMany(actSkyBackdropNodeBuilders)
    .addMany(actFogNodeBuilders)
    .addMany(actPaletteLights.flatMap((palette, actIndex) => [
      palette.ambient.runtime(game.runtimeNode(`skyline-act-${actIndex}-ambient`, { tags: ["light", `act-${actIndex}`] })),
      palette.key.runtime(game.runtimeNode(`skyline-act-${actIndex}-key`, { tags: ["light", `act-${actIndex}`] })),
      palette.checkpoint.runtime(game.runtimeNode(`skyline-act-${actIndex}-checkpoint-light`, { tags: ["light", `act-${actIndex}`] }))
    ]))
    .addMany(skylineWorldNodes)
    .addMany(skylineSentryNodes)
    .addMany(skylineSummitBeaconNodes)
    .addMany(game.platformerPresentationSurfaces({
      sceneBinding: platformerScene,
      level,
      mode: "asset-overlay",
      guideVisibility: "public",
      platformColor: "#5d7a6a",
      platformTrimColor: "#c9f7b8",
      hazardColor: "#ff5a3c",
      checkpointColor: "#8fe3ff",
      collectibleColor: "#fff1a8",
      finishColor: "#a6f7b2"
    }))
    .add(model(assets.showcaseKenneyOobiPlatformerHero, {
      name: "platformer-readable-character",
      role: "primaryCharacter",
      scaleMode: "fit",
      targetHeight: SKYLINE_CHARACTER_HEIGHT,
      castShadow: true,
      receiveShadow: true
    })
      // Declare the hero's embedded idle clip on the node so the runtime binds
      // real GLB animation playback from the first frame. Locomotion then swaps
      // clips through the runtime handle as the mounted state changes.
      .animate({ clip: HERO_LOCOMOTION_CLIP_MAP.idle, loop: true, captureTime: 0.4 })
      .position(...initialPlayerPose.position).rotate(0, playerYawForFacing(playerFacing), 0).runtime(game.runtimeNode("platformer-player", {
      tags: ["player", "character", "typed-primary-asset"]
    })))
    /*
     * Renderer-owned flow/chain feedback.
     *
     * The flow and collection-chain values previously reached the player only through
     * `textContent` on HUD elements, which is DOM text rather than game presentation. These
     * three nodes are driven from `challengeEvidence` every frame so the challenge state is
     * legible in the rendered scene: a ground ribbon under the hero whose length tracks flow,
     * a compact chain orb that grows with banked collectibles, and an objective ring that
     * fires when the chain objective is met. They are feedback only and never stand in for
     * the typed hero or world.
     */
    .add(primitives.box({
      name: "flow charge ribbon",
      material: material.emissive({
        name: "flow charge",
        color: "#7ef0c8",
        emissive: "#a6ffe0",
        emissiveIntensity: 1.15,
        roughness: 0.2,
        opacity: 0.78
      })
    }).position(...initialPlayerPose.position).scale(HIDDEN_FEEDBACK_SCALE).runtime(game.runtimeNode("skyline-flow-ribbon", {
      tags: ["feedback", "flow", "renderer-owned"]
    })))
    .add(primitives.sphere({
      name: "collection chain orb",
      material: material.emissive({
        name: "chain orb",
        color: "#25b995",
        emissive: "#5ee0bd",
        emissiveIntensity: 0.52,
        roughness: 0.28,
        opacity: 0.92
      })
    }).position(...initialPlayerPose.position).scale(HIDDEN_FEEDBACK_SCALE).runtime(game.runtimeNode("skyline-chain-pips", {
      tags: ["feedback", "collection-chain", "renderer-owned"]
    })))
    .add(primitives.torus({
      name: "objective met ring",
      material: material.emissive({
        name: "objective ring",
        color: "#31c7ad",
        emissive: "#70e8d0",
        emissiveIntensity: 0.58,
        roughness: 0.24,
        opacity: 0.82
      })
    }).position(...initialPlayerPose.position).rotate(Math.PI / 2, 0, 0).scale(HIDDEN_FEEDBACK_SCALE).runtime(game.runtimeNode("skyline-objective-pulse", {
      tags: ["feedback", "objective", "renderer-owned"]
    })))
    /*
     * Sky-shard collectibles render in the scene as emissive glitter gems (not just
     * counter increments). Each carries a small catching halo; the feel loop pulses
     * the scale so they visibly sparkle while idle. They are feedback/dressing only
     * and never stand in for the typed hero or world.
     */
    .addMany(collectibles.filter((collectible) => !String(collectible.id).includes("ember-charge")).map((collectible) => {
      const [sx, sy] = platformerScene.toScenePoint({ x: collectible.x, y: collectible.y });
      return primitives.sphere({
        name: "sky shard glitter " + collectible.id,
        material: material.emissive({
          name: "sky shard glow " + collectible.id,
          color: "#fff1a8",
          emissive: "#ffe9a8",
          emissiveIntensity: 1.3,
          roughness: 0.2
        })
      })
        .position(sx, sy + 0.05, GAMEPLAY_ACTOR_DEPTH)
        .scale([0.12, 0.12, 0.12])
        .runtime(game.runtimeNode("skyline-pickup-glitter-" + collectible.id, {
          tags: ["pickup", "sky-shard", "collectible", "renderer-owned"]
        }));
    }))
    .addMany(SKYLINE_EMBER_PICKUPS.map((pickup, index) => {
      const [px, py] = platformerScene.toScenePoint({ x: pickup.x, y: pickup.y });
      const collectible = collectibles.find((item) => item.id === pickup.id);
      return primitives.sphere({
        name: `ember charge ${index + 1}`,
        material: material.emissive({
          name: `ember charge glow ${index + 1}`,
          color: "#ff7a32",
          emissive: "#ffb070",
          emissiveIntensity: 1.25,
          roughness: 0.28
        })
      }).position(px, py, GAMEPLAY_ACTOR_DEPTH).scale([0.13, 0.13, 0.13]).runtime(game.runtimeNode(`skyline-ember-pickup-${pickup.id}`, {
        tags: ["pickup", "ember", "renderer-owned"]
      }));
    }))
    .addMany([0, 1, 2, 3].map((index) => primitives.sphere({
      name: `ember volley ${index + 1}`,
      material: material.emissive({
        name: `ember volley glow ${index + 1}`,
        color: "#ff5a1f",
        emissive: "#ffd08a",
        emissiveIntensity: 1.4,
        roughness: 0.22
      })
    }).position(...initialPlayerPose.position).scale(HIDDEN_FEEDBACK_SCALE).runtime(game.runtimeNode(`skyline-ember-volley-${index}`, {
      tags: ["projectile", "ember", "renderer-owned"]
    }))))
    .add(effects.ambientOcclusion({ intensity: 0.4 }))
    .add(effects.neonBloom({ intensity: 0.1 }))
    .add(lights.studio({ intensity: 0.86 }))
    .camera(platformerCamera)
});

const player = app.nodes.require("platformer-player");
const sentryNodes = Object.fromEntries(
  SKYLINE_SENTRY_ENCOUNTERS.map((encounter) => [encounter.id, app.nodes.require(`relay-sentry-${encounter.id}`)])
) as Record<string, RuntimeNodeHandleLike>;
const actSkyBandSets = Object.fromEntries([0, 1, 2, 3, 4].map((actIndex) => [
  actIndex,
  planSkylineActBackdrop({ actIndex, sceneSpan, horizonY, farBackgroundDepth }).plan.bands.map((band) =>
    app.nodes.require(`skyline-act-${actIndex}-${band.side}-${band.index}`)
  )
])) as Record<number, RuntimeNodeHandleLike[]>;
const actFogSets = Object.fromEntries([0, 1, 2, 3, 4].map((actIndex) => [
  actIndex,
  app.nodes.require(`skyline-act-${actIndex}-fog`)
])) as Record<number, RuntimeNodeHandleLike>;
const actLightSets = Object.fromEntries([0, 1, 2, 3, 4].flatMap((actIndex) => ([
  [`${actIndex}-ambient`, app.nodes.require(`skyline-act-${actIndex}-ambient`)],
  [`${actIndex}-key`, app.nodes.require(`skyline-act-${actIndex}-key`)],
  [`${actIndex}-checkpoint`, app.nodes.require(`skyline-act-${actIndex}-checkpoint-light`)]
]))) as Record<string, RuntimeNodeHandleLike>;
lastActPaletteIndex = applySkylineActPaletteVisibility(0, actSkyBandSets, actFogSets);
for (const [key, node] of Object.entries(actLightSets)) {
  const act = Number(key.split("-")[0]);
  node.setVisible(act === lastActPaletteIndex);
}
skylineFeel.bindScorePopHost(hudElements?.score ?? null);
/** Renderer-owned challenge feedback handles, updated from observed challenge state. */
const feedbackNodes = {
  flow: app.nodes.require("skyline-flow-ribbon"),
  chain: app.nodes.require("skyline-chain-pips"),
  objective: app.nodes.require("skyline-objective-pulse")
};
const emberPickupNodes = Object.fromEntries(
  SKYLINE_EMBER_PICKUPS.map((pickup) => [pickup.id, app.nodes.require(`skyline-ember-pickup-${pickup.id}`)])
);
const emberVolleyNodes = [0, 1, 2, 3].map((index) => app.nodes.require(`skyline-ember-volley-${index}`));
// Renderer-owned sky-shard glitter nodes, keyed by collectible id so the frame loop can
// pulse them (idle sparkle) and hide them the moment the shard is collected.
const skyShardGlitterNodes: Record<string, RuntimeNodeHandleLike> = Object.fromEntries(
  collectibles.filter((collectible) => !String(collectible.id).includes("ember-charge")).map(
    (collectible) => [collectible.id, app.nodes.require(`skyline-pickup-glitter-${collectible.id}`)]
  )
);
// Raised only when an idle glitter pulse was actually applied to at least one rendered shard node.
const collectedIdleSparkleProof = { shardSparkleRendered: false, glitterNodeCount: Object.keys(skyShardGlitterNodes).length };
interface EmberVolley {
  x: number;
  y: number;
  vx: number;
  life: number;
  slot: number;
}
const emberVolleys: EmberVolley[] = [];
let spentEmberCharges = 0;
const pendingDefeatedSentries = new Set<string>();
/** Raised only by an observed render of each feedback node, never by configuration. */
const observedFeedbackProof = { flowRibbon: false, chainPips: false, objectivePulse: false };

/**
 * Drives the challenge feedback nodes from the current challenge evidence.
 *
 * Called every frame after `runnerChallenge.step`, so what the player sees in the scene is
 * the same observed state the evidence records. Nothing here writes DOM text.
 */
function renderChallengeFeedback(): void {
  const pose = platformerScene.toScenePlayer(state.player);
  const [px, py, pz] = pose.position;
  const runCompleted = state.status === "completed";

  /*
   * `toScenePlayer` returns the hero's *grounded origin* -- safe-rendered fit models are
   * normalized with minimum Y at the node origin -- so `py` is at the hero's feet, not its
   * centre. Offsets are therefore measured up from the feet against the 0.52 target height.
   * An earlier version subtracted from `py` for the ground trail, which placed the ribbon
   * below the level entirely and rendered it as a detached white bar floating in the water.
   */
  const heroHeight = platformerScene.evidence.playerTargetHeight;

  // Flow ribbon: a short trail at the hero's feet whose length tracks normalized flow.
  const flowRatio = Math.max(0, Math.min(1, challengeEvidence.flow / Math.max(1, challengeEvidence.maxFlow)));
  if (!runCompleted && flowRatio > 0.04) {
    // Kept to a fraction of hero height. A first attempt ramped to 0.78 units -- 1.5x hero
    // height -- which read as a streak crossing the platforms rather than a trail.
    const length = heroHeight * (0.1 + flowRatio * 0.3);
    feedbackNodes.flow
      .setPosition(px - pose.facing * length * 0.5, py + heroHeight * 0.05, pz)
      .setScale([length, heroHeight * 0.04, heroHeight * 0.1])
      .setVisible(true);
    observedFeedbackProof.flowRibbon = true;
  } else {
    feedbackNodes.flow.setScale([...HIDDEN_FEEDBACK_SCALE]).setVisible(false);
  }

  // Chain orb: a compact, unmistakably intentional pickup indicator above the hero.
  // The previous tall emissive box bloomed into a plain white rectangle and read as stray
  // architecture in retained screenshots. Size, rather than height, now carries the chain.
  const chain = Math.max(0, challengeEvidence.collectionChain);
  if (!runCompleted && chain > 0) {
    const chainScale = 0.1 + Math.min(chain, 6) * 0.012;
    feedbackNodes.chain
      .setPosition(px, py + heroHeight * 1.17, pz)
      .setScale([heroHeight * chainScale, heroHeight * chainScale, heroHeight * chainScale])
      .setVisible(true);
    observedFeedbackProof.chainPips = true;
  } else {
    feedbackNodes.chain.setScale([...HIDDEN_FEEDBACK_SCALE]).setVisible(false);
  }

  // Objective ring: a restrained ground halo once the chain objective is met. A box here
  // still presented edge-on as a detached white slab during jumps, so the feedback now has
  // a game-readable circular silhouette and lower emissive energy.
  if (!runCompleted && challengeEvidence.objectiveMet) {
    feedbackNodes.objective
      .setPosition(px, py + heroHeight * 0.02, pz)
      .setScale([heroHeight * 0.23, heroHeight * 0.23, heroHeight * 0.045])
      .setVisible(true);
    observedFeedbackProof.objectivePulse = true;
  } else {
    feedbackNodes.objective.setScale([...HIDDEN_FEEDBACK_SCALE]).setVisible(false);
  }
}

function renderEmberVolleys(): void {
  for (const pickup of SKYLINE_EMBER_PICKUPS) {
    const node = emberPickupNodes[pickup.id];
    if (!node) continue;
    const taken = state.collected.includes(pickup.id);
    node.setVisible(!taken);
    if (taken) node.setScale([...HIDDEN_FEEDBACK_SCALE]);
  }
  renderSkyShardGlitter();
}

/**
 * Idle collectible glitter: each uncollected sky-shard pulses its emissive scale so
 * shards read as live pickups in the scene, not just counters. The pulse is driven by
 * sim time so it is deterministic; taken shards collapse to the hidden scale. This is
 * renderer feedback via the public runtime node API, not a CSS overlay.
 */
function renderSkyShardGlitter(): void {
  const t = state.time;
  for (const collectible of collectibles) {
    if (String(collectible.id).includes("ember-charge")) continue;
    const node = skyShardGlitterNodes[collectible.id];
    if (!node) continue;
    if (state.collected.includes(collectible.id)) {
      node.setVisible(false);
      node.setScale([...HIDDEN_FEEDBACK_SCALE]);
      continue;
    }
    // Gentle 1.6 Hz pulse with a small phase offset per shard so neighbours do not flicker in lockstep.
    const phase = collectible.id.length * 0.7;
    const pulse = 1 + Math.sin(t * 10 + phase) * 0.18;
    node.setVisible(true);
    node.setScale([0.12 * pulse, 0.12 * pulse, 0.12 * pulse]);
    collectedIdleSparkleProof.shardSparkleRendered = true;
  }
}
let compositionSubjectSuppressed = false;
/*
 * When true, both route-local scale and the imported locomotion clip are pinned
 * to the neutral pose declared by the composition contract.
 *
 * Set by `settleSubjectPose`. Resetting scale from outside the update loop was not enough: the loop rewrites scale
 * every frame from `visualState`, and the hero is often `fall` at capture time (it spawns above the platform), which
 * applies `[0.96, 1.05, 0.96]` -- a *different aspect ratio* from idle. That is why the measured silhouette flipped
 * between 109x118 and 86x152 across runs and straddled the gate's 96px width floor. The flag has to be read inside
 * the loop, where the scale is actually decided.
 */
let compositionPoseSettled = false;
Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "platformer",
    camera: platformerCamera,
    subject: { position: initialPlayerPose.position, rotation: [0, 0, 0], targetSize: 0.52 },
    playSpacePoints: platforms.flatMap((surface) => [
      platformerScene.toScenePoint({ x: surface.x, y: surface.y + surface.height }),
      platformerScene.toScenePoint({ x: surface.x + surface.width, y: surface.y + surface.height })
    ]),
    contactPoint: platformerScene.contactPointForPlayer(state.player),
    setSubjectSuppressed: (suppressed: boolean) => {
      compositionSubjectSuppressed = suppressed;
      app.pause();
      // Visibility is exact; an effectively-zero skinned mesh can still cover
      // a subpixel and make the diagnostic screenshot depend on raster rounding.
      player.setVisible(!suppressed);
      player.setScale(1);
      app.step(0);
    },
    /*
     * Freeze the hero into the neutral pose `targetSize` actually describes.
     *
     * Earlier route-local scale animation produced a 28% peak-to-peak height
     * swing. The scale-contract check compares measured pixel height against
     * the neutral `targetSize: 0.52`, so that old motion made the gate measure
     * animation phase rather than authored scale. The scale pulse is gone, but
     * the imported clip must still be pinned because arm motion changes the
     * measured silhouette.
     *
     * Pausing and setting unit scale puts the hero at bob = 0, which is exactly the pose `targetSize`
     * declares. The node position is untouched: it was already authoritative for camera and contact and
     * must stay so.
     */
    settleSubjectPose: () => {
      app.pause();
      player.setScale(1);
      /*
       * Pin the idle clip to a fixed frame as well as resetting the scale bob.
       *
       * Resetting scale alone was **not enough**, and the retained probe proved it: with the bob neutralised the
       * hero's measured silhouette width still varied 95-109px across four runs against the gate's 96px floor, and
       * one run failed at 95. The remaining variance is the skinned GLB idle clip, which keeps advancing and swings
       * the arms in and out of the silhouette.
       *
       * `captureTime: 0.4` is the same frame the node declares at construction, so the settled pose is the pose the
       * route was authored and reviewed against rather than a second arbitrary choice.
       */
      player.play(HERO_LOCOMOTION_CLIP_MAP.idle, { loop: false, captureTime: 0.4 });
      // Pin the loop's own scale decision, or the next frame overwrites the reset above from `visualState`.
      compositionPoseSettled = true;
      app.step(0);
    }
  },
  configurable: true
});
/** Current locomotion snapshot, advanced from mounted player state each frame. */
let locomotionSnapshot = locomotion.snapshot();

function advanceLocomotion(dt: number): void {
  locomotionSnapshot = locomotion.step(Math.max(0, dt), {
    speed: Math.abs(state.player.vx),
    vx: state.player.vx,
    vy: state.player.vy,
    grounded: state.player.grounded,
    hit: state.events.some((event) => event.type === "hazard")
  });
}

function readAnimationState(): string {
  return locomotionSnapshot.state;
}


function rememberAnimationState(): void {
  const nextState = locomotionSnapshot.state;
  const nextClip = locomotionSnapshot.clip;
  const last = animationStateHistory[animationStateHistory.length - 1];
  if (last?.state !== nextState || last?.clip !== nextClip) {
    animationStateHistory.push({ state: nextState, clip: nextClip });
  }
}
function playerSurfaceAlignment() {
  const standingSurface = platforms.find((surface) => {
    // Match game.platformer's horizontal-overlap contact rule. Testing only
    // the player's centre made a visibly supported edge landing read
    // "Airborne" in the HUD while the gameplay solver correctly reported it
    // grounded.
    const halfPlayerWidth = SKYLINE_CHARACTER_WIDTH / 2;
    const minX = surface.x - halfPlayerWidth - 0.04;
    const maxX = surface.x + surface.width + halfPlayerWidth + 0.04;
    const surfaceTop = surface.y + surface.height;
    return state.player.x >= minX && state.player.x <= maxX && Math.abs(state.player.y - surfaceTop) <= 0.12;
  });
  const verticalGap = standingSurface ? round(state.player.y - (standingSurface.y + standingSurface.height)) : 999;
  const scenePlayer = platformerScene.toScenePlayer(state.player);
  return {
    feetOnSurface: Boolean(standingSurface && Math.abs(verticalGap) <= 0.12),
    surfaceId: standingSurface?.id ?? "",
    verticalGap,
    sceneContact: platformerScene.contactPointForPlayer(state.player),
    scenePlayer: scenePlayer.position,
    playerTargetHeight: platformerScene.evidence.playerTargetHeight
  };
}
/**
 * FS-304 root renderer integration evidence.
 *
 * This route is the designated root integration reference: it imports only
 * `@aura3d/engine` plus its generated typed asset map, and it authors a bounded
 * set of renderer features whose root behaviour is separately proven by
 * `tests/browser/createAuraApp-shadow-contract.spec.ts` and
 * `tests/browser/createAuraApp-postprocess-contract.spec.ts`.
 *
 * Every field is read back from mounted diagnostics rather than declared, so the
 * route cannot report a feature the runtime did not actually run. `claimedFeatures`
 * deliberately lists only the features those contracts prove; SSAO is authored in
 * this scene but is reported as executed-only because its visible contribution is
 * not proven at root, and no field here generalizes to arbitrary-scene parity.
 */
function rootRendererIntegrationEvidence() {
  const diagnostics = app.diagnostics();
  const renderer = diagnostics.renderer;
  const postprocess = renderer?.postprocess;
  const shadows = renderer?.shadows;
  const actualPasses = postprocess?.actualPasses ?? [];
  return {
    schema: "aura3d-root-renderer-integration/1.0",
    role: "root-integration-reference-route",
    imports: ["@aura3d/engine", "generated typed asset map"],
    runtimeBackend: renderer?.runtime.backend,
    backend: diagnostics.backend,
    // Observed, not authored.
    observed: {
      postprocessPixelBacked: postprocess?.pixelBacked === true,
      actualPasses: [...actualPasses],
      toneMappingPass: actualPasses.includes("tone-mapping"),
      colorGradePass: actualPasses.includes("color-grade"),
      fxaaPass: actualPasses.includes("fxaa"),
      bloomPass: postprocess?.bloomPass === true,
      ssaoPassExecuted: postprocess?.ambientOcclusionPass === true,
      fogEnabled: renderer?.fog.enabled === true,
      shadowMapRendered: shadows?.mapRendered === true,
      shadowMapSampled: shadows?.mapSampled === true,
      shadowMapSize: shadows?.mapSize
    },
    // Claims are derived from what the mounted runtime reported, never from what
    // the scene authored. On the safe-basic agent runtime this list is empty by
    // construction, which is the honest result: the route authors bloom, fog, and
    // shadow-receiving geometry, but the safe path does not render those passes.
    claimedFeatures: [
      ...(renderer?.runtime.backend === "production-runtime" ? ["root-typed-glb-production-bridge"] : []),
      ...(postprocess?.pixelBacked === true && ["tone-mapping", "color-grade", "fxaa"].every((pass) => actualPasses.includes(pass))
        ? ["root-pixel-backed-tone-mapping-color-grade-fxaa-chain"]
        : []),
      ...(postprocess?.bloomPass === true ? ["root-bloom-pass"] : []),
      ...(renderer?.fog.enabled === true && renderer?.runtime.backend === "production-runtime" ? ["root-environment-fog"] : []),
      ...(shadows?.mapRendered === true && shadows?.mapSampled === true ? ["root-single-directional-pcf-shadow-map"] : [])
    ],
    executedButNotClaimed: [
      ...(postprocess?.ambientOcclusionPass === true
        ? ["root-ssao-pass: the pass runs, but its visible contribution is not proven by the root postprocess contract"]
        : [])
    ],
    // Why this route is not currently on the production bridge. Recorded here so the
    // gap is visible in route evidence rather than only in a plan document.
    productionBridgeStatus: renderer?.runtime.backend === "production-runtime"
      ? "active"
      : "deliberately-not-adopted: opting this route into the typed-GLB production bridge rendered a materially different scene (typed world GLB and most authored platforms missing, hero scaled differently because the bridge sizes models from manifest metadata bounds rather than loaded GLB bounds). Tracked as an FS-304 blocker.",
    claimBoundary: "Bounded root integration reference. Claims only the renderer features the mounted runtime actually reported, each of which is separately proven by a root-only browser contract, through public @aura3d/engine imports only. Does not claim arbitrary-scene renderer parity, cascaded shadows, point/spot shadow maps, HDR-dependent postprocess, outline/SSR/DOF/motion-blur/TAA, or Three.js parity.",
    provenBy: [
      "tests/browser/createAuraApp-shadow-contract.spec.ts",
      "tests/browser/createAuraApp-postprocess-contract.spec.ts",
      "tests/browser/createAuraApp-material-pbr-contract.spec.ts"
    ]
  };
}

function routeDiagnostics() {
  return {
    ...app.diagnostics(),
    snapshot: {
      x: state.player.x,
      y: state.player.y,
      vy: state.player.vy,
      grounded: state.player.grounded,
      facing: playerFacing,
      facingYaw: playerYawForFacing(playerFacing)
    },
    sceneBinding: platformerScene.evidence,
    surfaceContact: platformerScene.contactPointForPlayer(state.player),
    surfaceContactAlignment: playerSurfaceAlignment(),
    completionProof
  };
}
const initialSurfaceAlignment = playerSurfaceAlignment();
const mountedEvidence = {
  schema: "aura3d-showcase-compiled-platformer-route/1.1",
  appId: "showcase-skyline-runner",
  status: "ready",
  controls: { keyboard: ["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "Space", "ArrowUp", "KeyW", "KeyR"] },
  systems: {
    input: "game.input",
    simulation: "game.platformer",
    geometry: "certified-platformer-surfaces",
    camera: "game.platformerCameraRig",
    // Motion is derived from the level's own geometry rather than hand-tuned.
    motion: "engine.solvePlatformerMotion"
  },
  /**
   * Jump tuning against the level's own platform geometry.
   *
   * Published because the reported floating was invisible to every existing gate: the
   * level was solvable and the screenshots were correct, and no metric compared apex
   * height to step height. `motionReport.passes` is the check that was missing.
   */
  motion: {
    system: "engine.solvePlatformerMotion",
    routeHandTunesJump: false,
    gravity: solvedMotion.gravity,
    jumpVelocity: solvedMotion.jumpVelocity,
    moveSpeed: solvedMotion.moveSpeed,
    apex: solvedMotion.apex,
    airtime: solvedMotion.airtime,
    jumpReach: solvedMotion.jumpReach,
    coyoteMs: solvedMotion.coyoteMs,
    jumpBufferMs: solvedMotion.jumpBufferMs,
    geometry: solvedMotion.geometry,
    estimatedSessionSeconds: solvedMotion.estimatedSessionSeconds,
    invariants: level.assetBinding.motionReport,
    // Physical course length now owns duration. The deterministic public-kit proof
    // must reach the real finish between 70 and 115 seconds; no post-finish timer can
    // satisfy this field or `completionProof`.
    sessionLengthProof: {
      targetSeconds: SKYLINE_AUTHORED_PLAYABLE_SECONDS,
      acceptanceWindowSeconds: [SKYLINE_MIN_PLAYABLE_SECONDS, SKYLINE_MAX_TARGET_PLAYABLE_SECONDS],
      achievedEstimateSeconds: solvedMotion.estimatedSessionSeconds,
      source: "physical-start-to-finish-traversal"
    },
    /*
     * How the apex is chosen, stated as data so evidence records the mechanism.
     *
     * The comparison against the tuning this replaced used to live here as a literal
     * `previousTuning: { gravity: -22, jumpVelocity: 7.4, ... }` object. Naming those
     * numbers in the route is exactly what rule 1 forbids, and a stale copy of a superseded
     * tuning is the kind of thing that silently becomes wrong. The comparison now lives in
     * `tests/unit/physics/skyline-real-level-motion.test.ts`, which re-derives the previous
     * apex from the solver rather than remembering it.
     */
    apexSource: "declared-intent",
    apexReference: "character-height",
    characterHeight: SKYLINE_CHARACTER_HEIGHT
  },
  claimBoundary: "Bounded certified-surface platformer presentation; no physics-engine, automatic GLB-to-game, or unsupported skinned-animation claim.",
  platformerStateStatus: state.status,
  /**
   * Player kinematic state, including grounded.
   *
   * Published so landing reliability is measurable. Without `grounded` in evidence, "the
   * jump does not land reliably" can only be judged by watching.
   */
  player: {
    x: state.player.x,
    y: state.player.y,
    vx: state.player.vx,
    vy: state.player.vy,
    grounded: state.player.grounded
  },
  frameCount,
  score: state.score,
  coins: state.collected.length,
  deaths: state.deaths,
  checkpointId: state.checkpointId,
  challenge: challengeEvidence,
  /**
   * Which challenge feedback nodes have actually rendered this session. Every field starts
   * false and is raised only when the node was made visible from observed challenge state,
   * so this cannot report renderer-owned feedback that never appeared.
   */
  challengeFeedback: observedFeedbackProof,
  animation: animationEvidence(),
  diagnostics: routeDiagnostics(),
  rootRendererIntegration: rootRendererIntegrationEvidence(),
  kitContractProof,
  levelDesign: {
    authoredPlayableSeconds: level.assetBinding.authoredPlayableSeconds,
    minimumMeaningfulPlaySeconds: SKYLINE_MIN_PLAYABLE_SECONDS,
    districtCount: SKYLINE_SECTION_COUNT,
    actCount: SKYLINE_LEVEL_ACTS.length,
    acts: SKYLINE_LEVEL_ACTS.map((act) => ({ ...act, sections: [...act.sections] })),
    targetCompletionWindowSeconds: [SKYLINE_MIN_PLAYABLE_SECONDS, SKYLINE_MAX_TARGET_PLAYABLE_SECONDS],
    sentryEncounterCount: SKYLINE_SENTRY_ENCOUNTERS.length,
    checkpointCount: checkpoints.length,
    surfaceCount: platforms.length,
    styleCompatible: true,
    scaleCompatible: characterScaleRatio > 0 && characterScaleRatio <= 1,
    surfaceContactProven: initialSurfaceAlignment.feetOnSurface,
    visibleGameGeometrySource: "surface-map-bound-game-level",
    worldAssetUsedForSurfaceEvidence: "showcaseKenneyVerdantPlatformerWorld",
    noDebugSurfaceGuides: true,
    independentVisualReviewStatus: "pending"
  },
  /**
   * Player-facing feel state published every frame so tests can assert the new
   * ceremony without reading DOM. actIndex is resolved from traversal (not mounted
   * guesswork); telegraph/sentryDefeat/pause are the live feel-loop booleans.
   */
  feel: {
    actIndex: 0,
    actTitle: "Home Grove",
    telegraphActive: false,
    sentryDefeated: false,
    emberVolleySeen: false,
    paused: false,
    landDipApplied: false,
    dashPunchApplied: false
  },
  primaryAssets: ["showcaseKenneyOobiPlatformerHero", "showcaseKenneyVerdantPlatformerWorld"],
  platformer: {
    cameraIntent: "side-scroller",
    characterAsset: "showcaseKenneyOobiPlatformerHero",
    worldAssets: ["showcaseKenneyVerdantPlatformerWorld"],
    gameplayRequirements: ["movement", "jump", "checkpoint", "progression"],
    levelDesign: {
      ...gameGeometryContract.design,
      minPlayableSeconds: SKYLINE_MIN_PLAYABLE_SECONDS,
      minCheckpoints: checkpoints.length,
      transformedAssetBackedDistricts: SKYLINE_SECTION_COUNT,
      storyActs: SKYLINE_LEVEL_ACTS.map((act) => ({ ...act, sections: [...act.sections] })),
      districtLayouts: SKYLINE_SECTION_LAYOUTS.map((layout) => ({ ...layout }))
    },
    playableSurfaceMap,
    assetBinding: level.assetBinding,
    sceneBinding: platformerScene.evidence
  },
  gameplay: {
    moveChangesX: false,
    jumpChangesY: false,
    checkpointProgression: false,
    hazardRespawn: false,
    finishProgression: false,
    resetWorks: false,
    emberVolleyFired: false,
    emberDefeatedSentry: false,
    surfaceContactProven: initialSurfaceAlignment.feetOnSurface,
    authoredPlayableSeconds,
    pauseFreezesSimulation: false,
    audioCueWishlist: SKYLINE_AUDIO_CUE_WISHLIST
  },
  audio: skylineAudio.proof(),
  // Renderer-owned idle sparkle pulses on sky-shards and ember pickups in the scene.
  collectibleGlitter: collectedIdleSparkleProof
};
Object.defineProperty(window, "__AURA3D_SHOWCASE_SKYLINE_RUNNER__", { value: mountedEvidence, configurable: true, writable: true });
updatePlatformerHud();

function publishPlatformerEvidence(): void {
  rememberAnimationState();
  const scenePlayer = platformerScene.toScenePlayer(state.player);
  if (Math.abs(state.player.vx) > 0.01) playerFacing = state.player.vx >= 0 ? 1 : -1;
  player.setPosition(...scenePlayer.position);
  player.setRotation(0, playerYawForFacing(playerFacing), 0);
  const visualState = readAnimationState();
  // Request the hero's embedded clip for the current locomotion state. Root
  // `createAuraApp` binds the clip request but does not yet drive skinned GLB
  // playback, so the route also applies a bounded procedural pose so the state
  // change is actually visible. The distinction is published in the evidence.
  if (typeof player.play === "function") {
    if (compositionPoseSettled) {
      // The composition hook calls app.step(0), which runs this update callback
      // before presenting. Keep the settled clip authoritative here; otherwise
      // the live `fall`/`run` state immediately overwrites the fixed idle frame.
      player.play(HERO_LOCOMOTION_CLIP_MAP.idle, { loop: false, captureTime: 0.4 });
    } else {
      player.play(locomotionSnapshot.clip, {
        loop: locomotionSnapshot.loop,
        ...(locomotionSnapshot.restart ? { restart: true } : {})
      });
    }
  }
  // The imported clip owns locomotion. The former 14% scale pulse made the character breathe and
  // squash on every frame independently of foot contact, which read as slow, rubbery motion. Keep
  // scale neutral during idle/run and use only restrained one-shot silhouettes for air/impact states.
  player.setScale(compositionSubjectSuppressed
    ? 0.0001
    : compositionPoseSettled ? 1
    : visualState === "jump" ? [0.98, 1.035, 0.98]
      : visualState === "fall" ? [1.015, 0.985, 1.015]
        : visualState === "hit" ? [1.045, 0.955, 1.045]
          : visualState === "land" ? [1.025, 0.975, 1.025]
            : 1);
  mountedEvidence.status = "running";
  mountedEvidence.platformerStateStatus = state.status;
  mountedEvidence.player = {
    x: state.player.x,
    y: state.player.y,
    vx: state.player.vx,
    vy: state.player.vy,
    grounded: state.player.grounded
  };
  mountedEvidence.frameCount = frameCount;
  mountedEvidence.score = state.score;
  mountedEvidence.coins = state.collected.length;
  mountedEvidence.deaths = state.deaths;
  mountedEvidence.checkpointId = state.checkpointId;
  mountedEvidence.challenge = challengeEvidence;
  mountedEvidence.challengeFeedback = observedFeedbackProof;
  mountedEvidence.animation = animationEvidence();
  mountedEvidence.diagnostics = routeDiagnostics();
  // Recomputed per frame rather than only at mount. The mount-time snapshot is taken
  // before the renderer's first draw, so pass and shadow state are not yet observable
  // and every claim would read as absent.
  mountedEvidence.rootRendererIntegration = rootRendererIntegrationEvidence();
  mountedEvidence.audio = skylineAudio.proof();
  mountedEvidence.collectibleGlitter = collectedIdleSparkleProof;
  mountedEvidence.feel = {
    actIndex: resolveSkylineActIndex(state.player.x),
    actTitle: resolveSkylineAct(state.player.x).title,
    telegraphActive: skylineFeel.snapshot().actIndex >= 0 && skylineFeel.telegraphActive(),
    sentryDefeated: skylineFeel.sentryDefeatSeen(),
    emberVolleySeen: mountedEvidence.gameplay.emberVolleyFired,
    paused,
    landDipApplied: skylineFeel.landDipSeen(),
    dashPunchApplied: skylineFeel.dashPunchSeen()
  };
  updatePlatformerHud();
}

/**
 * Mounted animation evidence. `activeClip`/`runtimeClip` come from the kit's
 * resolved clip for the observed locomotion state, and `availableClips` is the
 * asset's real embedded clip list, so the route cannot claim a clip the asset
 * does not ship.
 */
function animationEvidence() {
  return {
    state: locomotionSnapshot.state,
    previousState: locomotionSnapshot.previousState,
    activeClip: locomotionSnapshot.clip,
    runtimeClip: locomotionSnapshot.clip,
    /**
     * Honest boundary: the locomotion state machine and clip selection are real
     * and asset-validated, but root `createAuraApp` does not yet drive skinned
     * GLB clip playback. Visible state change comes from a bounded procedural
     * pose. Skinned playback is a root-integration gap, not a route claim.
     */
    skinnedClipPlaybackProvenAtRoot: false,
    visibleMotionSource: "imported-clip-request-with-restrained-air-impact-pose",
    loop: locomotionSnapshot.loop,
    oneShot: locomotionSnapshot.oneShot,
    clipMap: { ...HERO_LOCOMOTION_CLIP_MAP },
    availableClips: [...HERO_EMBEDDED_CLIPS],
    importedClipCount: HERO_EMBEDDED_CLIPS.length,
    missingClips: [...locomotionSnapshot.missingClips],
    stateHistory: animationStateHistory.slice(),
    sampleFrame: frameCount,
    sampleTick: locomotionSnapshot.frame,
    stateTime: locomotionSnapshot.stateTime,
    source: "game.locomotion"
  };
}

app.onFrame(({ dt }) => {
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  input.update(step);
  if (input.pressed("pause")) {
    paused = skylineFeel.togglePause();
    mountedEvidence.gameplay.pauseFreezesSimulation = paused;
    publishPlatformerEvidence();
    return;
  }
  if (input.pressed("reset")) {
    state = platformerState.reset();
    challengeEvidence = runnerChallenge.reset();
    emberVolleys.length = 0;
    spentEmberCharges = 0;
    pendingDefeatedSentries.clear();
    playerFacing = 1;
    paused = false;
    skylineFeel.resetRuntime();
    lastActPaletteIndex = applySkylineActPaletteVisibility(0, actSkyBandSets, actFogSets);
    for (const [key, node] of Object.entries(actLightSets)) {
      node.setVisible(Number(key.split("-")[0]) === lastActPaletteIndex);
    }
    frameCount += 1;
    mountedEvidence.gameplay.resetWorks = true;
    kitContractProof.resetRestoresStart = state.checkpointId === "start"
      && state.collected.length === 0
      && state.deaths === 0
      && state.score === 0
      && state.defeatedHazards.length === 0;
    recordKitEvents(state.events);
    completionProof.completed = false;
    completionProof.stable = false;
    completionProof.finalTime = 0;
    completionProof.checkpoints = [];
    completionProof.eventCounts.respawn = 0;
    completionProof.eventCounts.finish = 0;
    locomotionSnapshot = locomotion.reset("idle");
    renderEmberVolleys();
    publishPlatformerEvidence();
    return;
  }
  if (paused) {
    publishPlatformerEvidence();
    return;
  }
  const previous = state;
  const collectedEmbers = state.collected.filter((id) => id.includes("ember-charge")).length;
  const emberCharges = Math.max(0, collectedEmbers - spentEmberCharges);
  const dashPressed = input.pressed("dash");
  if (dashPressed) {
    const pose = platformerScene.toScenePlayer(state.player);
    skylineFeel.onDash(pose.position);
  }
  if (input.pressed("fire") && emberCharges > 0 && emberVolleys.length < emberVolleyNodes.length) {
    const slot = emberVolleyNodes.findIndex((_, index) => !emberVolleys.some((volley) => volley.slot === index));
    if (slot >= 0) {
      spentEmberCharges += 1;
      const spawnX = state.player.x + playerFacing * 0.22;
      const spawnY = state.player.y + SKYLINE_CHARACTER_HEIGHT * 0.55;
      emberVolleys.push({
        x: spawnX,
        y: spawnY,
        vx: playerFacing * 6.4,
        life: 1.15,
        slot
      });
      const [sx, sy] = platformerScene.toScenePoint({ x: spawnX, y: spawnY });
      skylineFeel.onEmberFire([sx, sy, GAMEPLAY_ACTOR_DEPTH]);
      mountedEvidence.gameplay.emberVolleyFired = true;
    }
  } else if (input.pressed("fire") && emberCharges <= 0) {
    const [sx, sy] = platformerScene.toScenePoint({ x: state.player.x, y: state.player.y });
    skylineFeel.onEmberDeny([sx, sy, GAMEPLAY_ACTOR_DEPTH]);
  }
  const clearedThisFrame: string[] = [...pendingDefeatedSentries];
  for (const volley of emberVolleys) {
    volley.x += volley.vx * step;
    volley.life -= step;
    for (const sentry of SKYLINE_SENTRY_ENCOUNTERS) {
      if (pendingDefeatedSentries.has(sentry.id) || state.defeatedHazards.includes(sentry.id)) continue;
      const phase = ((state.time / Math.max(0.001, sentry.period)) + sentry.phase) * Math.PI * 2;
      const sentryX = sentry.x + Math.sin(phase) * sentry.amplitude;
      if (
        volley.x >= sentryX - 0.08
        && volley.x <= sentryX + sentry.width + 0.08
        && volley.y >= sentry.y - 0.08
        && volley.y <= sentry.y + sentry.height + 0.18
      ) {
        pendingDefeatedSentries.add(sentry.id);
        clearedThisFrame.push(sentry.id);
        volley.life = 0;
        const [sx, sy] = platformerScene.toScenePoint({ x: volley.x, y: volley.y });
        skylineFeel.onEmberImpact([sx, sy, GAMEPLAY_ACTOR_DEPTH]);
        skylineFeel.onSentryDefeat([sx, sy, GAMEPLAY_ACTOR_DEPTH], 150);
        mountedEvidence.gameplay.emberDefeatedSentry = true;
      }
    }
  }
  for (let index = emberVolleys.length - 1; index >= 0; index -= 1) {
    if ((emberVolleys[index]?.life ?? 0) <= 0) emberVolleys.splice(index, 1);
  }
  state = platformerState.step(step, {
    moveX: input.axis("moveX"),
    jumpPressed: input.pressed("jump"),
    jumpHeld: input.held("jump"),
    dashPressed,
    clearHazardIds: clearedThisFrame
  });
  for (const event of state.events) {
    if (event.type === "jump") {
      skylineFeel.onJump();
    }
    if (event.type === "land") {
      const pose = platformerScene.toScenePlayer(state.player);
      skylineFeel.onLand(pose.position);
    }
    if (event.type === "collect") {
      const collectible = level.collectibles?.find((item) => item.id === event.id);
      if (collectible) {
        const [sx, sy] = platformerScene.toScenePoint({ x: collectible.x, y: collectible.y });
        // Ember charges carry their own pickup feel + cue; sky-shards get the coin chime.
        if (String(event.id).includes("ember-charge")) {
          skylineFeel.onEmberPickup([sx, sy, GAMEPLAY_ACTOR_DEPTH]);
        } else {
          skylineFeel.onCollect([sx, sy, GAMEPLAY_ACTOR_DEPTH]);
        }
      }
    }
    if (event.type === "checkpoint") {
      const act = resolveSkylineAct(state.player.x);
      skylineFeel.onCheckpoint(act.title);
    }
    if (event.type === "hazard" || event.type === "fall") {
      skylineFeel.onDeath();
    }
    if (event.type === "defeat" || event.type === "stomp") {
      const encounter = SKYLINE_SENTRY_ENCOUNTERS.find((entry) => entry.id === event.id);
      if (encounter) {
        const [sx, sy] = platformerScene.toScenePoint({ x: encounter.x, y: encounter.y });
        skylineFeel.onSentryDefeat([sx, sy, GAMEPLAY_ACTOR_DEPTH], event.type === "stomp" ? 100 : 150);
      }
    }
    if (event.type === "complete") {
      skylineFeel.onSummit();
    }
  }
  challengeEvidence = runnerChallenge.step(step, previous, state);
  // Flow, chain and objective state must be visible in the rendered scene, not only in
  // HUD text, so the feedback nodes are driven from the evidence that was just observed.
  renderChallengeFeedback();
  renderEmberVolleys();
  const nextActIndex = resolveSkylineActIndex(state.player.x);
  if (nextActIndex !== lastActPaletteIndex) {
    lastActPaletteIndex = applySkylineActPaletteVisibility(nextActIndex, actSkyBandSets, actFogSets);
    for (const [key, node] of Object.entries(actLightSets)) {
      node.setVisible(Number(key.split("-")[0]) === lastActPaletteIndex);
    }
  }
  skylineFeel.applyCameraShake(platformerCamera);
  skylineFeel.updatePresentation(step, {
    simTime: state.time,
    playerX: state.player.x,
    playerY: state.player.y,
    playerFacing,
    sceneBinding: platformerScene,
    defeatedHazardIds: state.defeatedHazards,
    sentryNodes,
    emberVolleys,
    emberVolleyNodes,
    emberPickupNodes,
    collectedIds: state.collected,
    firePressed: input.pressed("fire"),
    emberStock: emberCharges,
    scoreElement: hudElements?.score ?? null
  });
  frameCount += 1;
  mountedEvidence.gameplay.moveChangesX ||= Math.abs(state.player.x - previous.player.x) > 0.001;
  mountedEvidence.gameplay.jumpChangesY ||= Math.abs(state.player.y - previous.player.y) > 0.001;
  mountedEvidence.gameplay.checkpointProgression ||= state.activatedCheckpoints.length > previous.activatedCheckpoints.length;
  mountedEvidence.gameplay.hazardRespawn ||= state.deaths > previous.deaths;
  mountedEvidence.gameplay.finishProgression ||= state.status === "completed";
  if (state.deaths > previous.deaths) completionProof.eventCounts.respawn += state.deaths - previous.deaths;
  // Completion is published at the exact physical finish event. The previous route
  // reached the goal early and held this flag until a timer reached 120 seconds; that
  // proved a clock, not a level. Course distance and encounter pacing now own duration.
  if (state.status === "completed" && !completionProof.completed) {
    completionProof.completed = true;
    completionProof.stable = true;
    completionProof.finalTime = challengeEvidence.elapsedSeconds;
    completionProof.checkpoints = [...state.activatedCheckpoints];
    completionProof.eventCounts.finish += 1;
  }
  mountedEvidence.gameplay.surfaceContactProven ||= routeDiagnostics().surfaceContactAlignment.feetOnSurface;
  recordKitEvents(state.events);
  kitContractProof.moveChangesX ||= mountedEvidence.gameplay.moveChangesX;
  kitContractProof.movementChangesPosition ||= mountedEvidence.gameplay.moveChangesX;
  kitContractProof.jumpChangesVerticalState ||= mountedEvidence.gameplay.jumpChangesY || Math.abs(state.player.vy) > 0.05;
  kitContractProof.completedStatus ||= state.status === "completed";
  advanceLocomotion(step);
  publishPlatformerEvidence();
});

function setupSkylineGameHud(): void {
  const panel = document.getElementById("panel");
  if (!panel) return;
  hudElements = setupSkylineHud(panel, checkpoints.length);
  bindGameTouchControls({
    hold: [
      { elementId: "left-control", code: "KeyA" },
      { elementId: "right-control", code: "KeyD" },
      { elementId: "jump-control", code: "Space" }
    ],
    pulse: [
      { elementId: "dash-control", code: "ShiftLeft" },
      { elementId: "fire-control", code: "KeyJ" },
      { elementId: "reset-control", code: "KeyR" }
    ]
  });
}
function updatePlatformerHud(): void {
  if (!hudElements) return;
  const coinCount = state.collected.filter((id) => id.includes("sky-shard")).length;
  const emberStock = Math.max(0, state.collected.filter((id) => id.includes("ember-charge")).length - spentEmberCharges);
  const snapshot = buildSkylineHudSnapshot({
    score: challengeEvidence.challengeScore,
    coinCount,
    emberStock,
    deaths: state.deaths,
    lives: 3,
    checkpointCount: checkpoints.length,
    activatedCheckpointCount: state.activatedCheckpoints.length,
    playerX: state.player.x,
    objectiveMet: challengeEvidence.objectiveMet,
    paused
  });
  const alignment = playerSurfaceAlignment();
  const act = resolveSkylineAct(state.player.x);
  updateSkylineHud(hudElements, snapshot, isSkylineDebugMode() ? {
    surfaceLabel: `${act.title} · ${snapshot.objective} · ${alignment.feetOnSurface ? "Grounded" : "Airborne"}`,
    flowLabel: `${Math.round(challengeEvidence.flow)} · x${Math.max(1, challengeEvidence.collectionChain)}`
  } : undefined);
}
