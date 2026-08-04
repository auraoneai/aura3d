import {
  createAuraApp,
  effects,
  game,
  lights,
  material,
  model,
  bindGameTouchControls,
  blendSkyBandColor,
  planLayeredSceneComposition,
  planSkyBackdrop,
  skyBandCountForRamp,
  platformerCompositionSpec,
  primitives,
  scene
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import { gameGeometryContract } from "./generated/game-geometry";
import { SKYLINE_CHARACTER_HEIGHT, createSkylineLevel, skylineMotion } from "./level";
import { createRunnerChallenge } from "./runner-challenge";

const input = game.input({
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    jump: ["KeyW", "ArrowUp", "Space"],
    reset: ["KeyR"]
  },
  axes: { moveX: { negative: "left", positive: "right" } },
  bufferMs: 120
});
const authoredPlayableSeconds = gameGeometryContract.authoredSeconds;
const playableSurfaceMap = gameGeometryContract.surfaceMap;
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

const platformerScene = game.platformerSceneBinding({
  surfaceMap: playableSurfaceMap,
  level,
  worldAsset: "showcaseKenneyVerdantPlatformerWorld",
  targetSceneWidth: 6.4,
  worldModelTargetMaxDimension: 7.056,
  worldY: -0.72,
  worldZ: WORLD_PLANE_DEPTH,
  playerZ: 0.42,
  playerTargetHeight: SKYLINE_CHARACTER_HEIGHT,
  playerYOffset: 0
});
const platforms = level.platforms ?? [];
const checkpoints = level.checkpoints ?? [];
const hazards = level.hazards ?? [];
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
/*
 * Convert the level span into **scene** units before planning.
 *
 * `levelSpan` is in the level's own game units (0 to ~16.75 here) while the planner's depths and scales
 * are consumed as scene units, where the whole level is only `targetSceneWidth` (6.4) across. Feeding the
 * game-unit span straight in derived depth bands from a world 2.6x too large and produced far-background
 * silhouettes larger than the play space, which the engine surfaced as
 * `RenderDeviceError: Renderer matrix inputs must be finite mat4 values`. Reading the binding's own
 * game-to-scene factor keeps this correct if the level or `targetSceneWidth` changes.
 */
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
  foregroundProps: [{ id: "rock", weight: 1, scaleBias: 0.5 }],
  midgroundProps: [
    { id: "tree", weight: 5, scaleBias: 0.5 },
    { id: "rock", weight: 2, scaleBias: 0.6 }
  ],
  backgroundProps: [{ id: "tree", weight: 3, scaleBias: 0.85 }, { id: "rock", weight: 1, scaleBias: 1.0 }],
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
 * Scale is expressed via `targetHeight` so each prop is normalized from its own manifest bounds rather
 * than from a raw multiplier -- `propPineTree` is ~10.9 units tall natively and `propRockB` ~2.2, so a
 * shared numeric scale would size them incoherently.
 */
const compositionNodes = compositionPlan.placements.map((placement, index) => {
  const groundY = platformerScene.toScenePoint({ x: 0, y: 0 })[1];
  const isTree = placement.prop === "tree";
  /*
   * `propConifer` rather than `propPineTree` for the tree vocabulary.
   *
   * Both render correctly in isolation, but `propPineTree` is a 4.6MB photoreal cluster carrying 42 nodes
   * and 5 materials *per instance*: at plan density it drove the route to 840 draw calls and a ~12s load,
   * which timed the showcase-library capture out and produced a blank canvas. `propConifer` is 62KB with
   * one material and 14 nodes, and its flat-shaded silhouette also matches the Kenney world's art style
   * far better than a photoreal tree did. Screened by isolated render, not by file size alone.
   */
  const asset = isTree ? assets.propConifer : assets.propRockB;
  // Atmosphere thins distant layers so depth reads by value, not only by detail.
  const targetHeight = placement.scale * (isTree ? 0.62 : 0.34);
  return model(asset, {
    name: `composition-${placement.prop}-${index}`,
    scaleMode: "fit",
    targetHeight,
    receiveShadow: true
  })
    .position(placement.x, groundY + placement.y, placement.z)
    .rotate(0, placement.rotationY, 0);
});

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
/*
 * Backdrop colour ramps, declared once so the band count and the materials cannot disagree.
 *
 * Band count is derived from these ramps by `skyBandCountForRamp`, not chosen. The first version used a
 * hand-picked 5 bands and sampling the rendered frame down a backdrop-only column measured hard steps of
 * 21 per channel at the horizon -- visible banding, which trades one flat-frame defect for another.
 */
const SKY_HORIZON = "#4e93b4";
const SKY_EMISSIVE_HORIZON = "#79c2dd";
const SKY_RAMP = [SKY_HORIZON, "#173a5c"] as const;
const SKY_EMISSIVE_RAMP = [SKY_EMISSIVE_HORIZON, "#25507a"] as const;
/*
 * Both ground ramps start from the sky's *horizon* colour, not from a separately chosen one.
 *
 * They previously started at `#41809f` against the sky's `#4e93b4`. Sampling the rendered frame down a
 * backdrop-only column measured a 22-per-channel step at exactly the horizon row: the two ramps met at
 * different colours, so the horizon read as a hard seam. Sharing the endpoint makes the join continuous by
 * construction rather than by matching two literals by eye.
 */
const GROUND_RAMP = [SKY_HORIZON, "#123048"] as const;
const GROUND_EMISSIVE_RAMP = [SKY_EMISSIVE_HORIZON, "#1b3d5a"] as const;

const skyBackdrop = planSkyBackdrop({
  span: sceneSpan,
  // Behind the far-background layer, which the platformer preset places at gameplayDepth - width * 0.34.
  depth: Math.min(...compositionPlan.layers.map((layer) => layer.depth)) - 2.4,
  // Horizon sits on the level's own ground plane rather than at an assumed height.
  horizonY: platformerScene.toScenePoint({ x: 0, y: 0 })[1],
  height: 20,
  // Derived from the ramp so the gradient cannot read as a stair; see SKY_RAMP above.
  bands: skyBandCountForRamp(...SKY_RAMP),
  /*
   * Grade below the horizon too.
   *
   * The first banded sky cut the dominant colour bucket from 43.65% to 26.08%, but the *lower* frame then
   * became the largest remaining flat region: the scene background showed through unmodulated below the
   * play plane. Requesting the ground side grades it from the same plan, rather than adding a second
   * hand-placed plane.
   */
  belowHorizonHeight: 14,
  belowHorizonBands: skyBandCountForRamp(...GROUND_RAMP)
});
const skyBackdropNodes = skyBackdrop.bands.map((band) => primitives.box({
  name: `skyline ${band.side} band ${band.index}`,
  material: material.emissive({
    name: `graded dusk ${band.side} ${band.index}`,
    // Horizon haze outward, interpolated by the plan's own blend factor. The ground ramp shares the
    // horizon colour so the two sides meet without a seam, then descends cooler and darker.
    color: blendSkyBandColor(...(band.side === "sky" ? SKY_RAMP : GROUND_RAMP), band.blend),
    emissive: blendSkyBandColor(...(band.side === "sky" ? SKY_EMISSIVE_RAMP : GROUND_EMISSIVE_RAMP), band.blend),
    emissiveIntensity: band.emissiveIntensity,
    roughness: 0.9
  })
}).position(0, band.centerY, band.z).scale([band.width, band.height, 0.2]));

// Side-scroller framing target: the hero reads at roughly one-eighth of frame
// height with the immediate traversal path visible ahead, so the world carries
// the level rather than the mascot filling the frame.
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
   * 4.1 desktop, from measurement rather than taste.
   *
   * With the settled pose made genuinely deterministic (see `settleSubjectPose`), the hero measured 96-98px wide
   * across five consecutive probe runs against `routePrimaryProbeThresholds.minForegroundWidth: 96`. Stable, but
   * sitting *on* the floor: a 1px measurement difference decides the gate, and one run at 4.4 had already failed at
   * 95px. Silhouette width scales inversely with distance, so 4.4 -> 4.1 lifts ~97px to ~104px and buys real margin
   * without returning to the over-zoomed "oversized mascot" framing an earlier pass produced at 3.2.
   */
  distance: compactViewport ? 6.0 : 4.1,
  height: compactViewport ? 0.72 : 0.62,
  lookAhead: compactViewport ? 1.35 : 1.05,
  fov: compactViewport ? 52 : 42
});
setupPlatformerPanel();

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
    .background("#1b3a52")
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
    .addMany(skyBackdropNodes)
    // Reusable layered composition, planned above; added before the typed world so the depth layers sit
    // behind it in submission order as well as in Z.
    .addMany(compositionNodes)
    .add(model(assets.showcaseKenneyVerdantPlatformerWorld, {
      name: "platformer-bound-world-asset",
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: platformerScene.worldModel.targetMaxDimension
    }).position(...platformerScene.worldModel.position).rotate(...platformerScene.worldModel.rotation).runtime(game.runtimeNode("platformer-bound-world-asset", {
      tags: ["world", "typed-secondary-primary-asset", "certified-visible-geometry"]
    })))
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
      targetHeight: 0.52,
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
     * a chain pip stack that grows with banked collectibles, and an objective pulse that
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
    .add(primitives.box({
      name: "collection chain pips",
      material: material.emissive({
        name: "chain pip",
        color: "#ffe98a",
        emissive: "#fff6c2",
        emissiveIntensity: 1.35,
        roughness: 0.18,
        opacity: 0.85
      })
    }).position(...initialPlayerPose.position).scale(HIDDEN_FEEDBACK_SCALE).runtime(game.runtimeNode("skyline-chain-pips", {
      tags: ["feedback", "collection-chain", "renderer-owned"]
    })))
    .add(primitives.box({
      name: "objective met pulse",
      material: material.emissive({
        name: "objective pulse",
        color: "#b7f7ff",
        emissive: "#e6ffff",
        emissiveIntensity: 1.6,
        roughness: 0.12,
        opacity: 0.7
      })
    }).position(...initialPlayerPose.position).scale(HIDDEN_FEEDBACK_SCALE).runtime(game.runtimeNode("skyline-objective-pulse", {
      tags: ["feedback", "objective", "renderer-owned"]
    })))
    .add(effects.ambientOcclusion({ intensity: 0.4 }))
    .add(effects.neonBloom({ intensity: 0.1 }))
    .add(effects.fog({ name: "skyline layered distance haze", color: "#2a6182", density: 0.05, intensity: 0.5 }))
    .add(lights.ambient({ name: "skyline sky fill", color: "#9fd0e4", intensity: 0.62 }))
    .add(lights.directional({ name: "skyline warm traversal key", color: "#ffd59c", intensity: 1.12 }).position(-3, 5, 4))
    .add(lights.point({ name: "checkpoint cyan lift", color: "#62f2df", intensity: 0.54 }).position(1.7, 1.8, 2.4))
    .add(lights.studio({ intensity: 0.86 }))
    .camera(platformerCamera)
});

const player = app.nodes.require("platformer-player");
/** Renderer-owned challenge feedback handles, updated from observed challenge state. */
const feedbackNodes = {
  flow: app.nodes.require("skyline-flow-ribbon"),
  chain: app.nodes.require("skyline-chain-pips"),
  objective: app.nodes.require("skyline-objective-pulse")
};
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
  if (flowRatio > 0.04) {
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

  // Chain pips: a slim column just above the hero that grows per banked collectible.
  const chain = Math.max(0, challengeEvidence.collectionChain);
  if (chain > 0) {
    const height = heroHeight * (0.06 + Math.min(chain, 6) * 0.06);
    feedbackNodes.chain
      .setPosition(px, py + heroHeight * 1.08 + height * 0.5, pz)
      .setScale([heroHeight * 0.09, height, heroHeight * 0.09])
      .setVisible(true);
    observedFeedbackProof.chainPips = true;
  } else {
    feedbackNodes.chain.setScale([...HIDDEN_FEEDBACK_SCALE]).setVisible(false);
  }

  // Objective band: a thin lit bar at the hero's feet once the chain objective is met.
  // Deliberately not a hero-sized quad: at 0.46 x 0.46 against a 0.52-tall hero it
  // rendered as an opaque white panel behind the character rather than as feedback.
  if (challengeEvidence.objectiveMet) {
    feedbackNodes.objective
      .setPosition(px, py + heroHeight * 0.02, pz)
      .setScale([heroHeight * 0.55, heroHeight * 0.028, heroHeight * 0.14])
      .setVisible(true);
    observedFeedbackProof.objectivePulse = true;
  } else {
    feedbackNodes.objective.setScale([...HIDDEN_FEEDBACK_SCALE]).setVisible(false);
  }
}
let compositionSubjectSuppressed = false;
/*
 * When true, the locomotion scale cycle is pinned to its neutral pose.
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
      player.setScale(suppressed ? 0.0001 : 1);
      app.step(0);
    },
    /*
     * Freeze the hero into the neutral pose `targetSize` actually describes.
     *
     * Locomotion is expressed as a scale cycle (`1 +/- 0.14` at idle -- see `advanceLocomotion`), a 28%
     * peak-to-peak height swing. The scale-contract check compares measured pixel height against the height
     * projected from `targetSize: 0.52`, which is the *un-bobbed* size, so the two quantities described
     * different things and the measured hero varied 119-154px across four consecutive captures. `scaleDelta`
     * straddled its 0.18 threshold and one run failed composition at 0.1892 with nothing about the route
     * changed -- the gate was measuring animation phase, not scale correctness.
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
const hud = {
  x: requireElement("x-value"),
  score: requireElement("score-value"),
  deaths: requireElement("death-value"),
  checkpoint: requireElement("checkpoint-value"),
  surface: requireElement("surface-value"),
  challenge: requireElement("challenge-value")
};
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
    const minX = surface.x - 0.04;
    const maxX = surface.x + surface.width + 0.04;
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
    /*
     * Session length is bounded by gap clearance, not by the target.
     *
     * The solver takes the *larger* of the speed needed to clear the widest gap and the
     * speed implied by the target session, so a level cannot be made unplayable in
     * service of a slower pace. On this course the 0.30-unit gap requires 0.87
     * units/second, which crosses the 16.6-unit course in about 48 seconds of session
     * rather than the 180 requested.
     *
     * That is a level-design limit, not a tuning bug: a genuinely multi-minute session
     * needs more course, more vertical routing, or repeatable objectives, none of which a
     * motion solver can invent. Recorded here rather than papered over, and reflected in
     * the route's honest prototype status.
     */
    sessionLengthLimitedBy: solvedMotion.moveSpeed > 0 && solvedMotion.geometry.maxGap > 0
      ? "gap-clearance"
      : "target-session",
    sessionLengthShortfall: {
      requestedSeconds: 180,
      achievedSeconds: solvedMotion.estimatedSessionSeconds,
      reason: "course length and gap spacing bound traversal time; extending the session needs more level, not different motion"
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
    minimumMeaningfulPlaySeconds: 30,
      surfaceCount: platforms.length,
      styleCompatible: true,
      scaleCompatible: characterScaleRatio > 0 && characterScaleRatio <= 1,
      surfaceContactProven: initialSurfaceAlignment.feetOnSurface,
      visibleGameGeometrySource: "surface-map-bound-game-level",
      worldAssetUsedForSurfaceEvidence: "showcaseKenneyVerdantPlatformerWorld",
      noDebugSurfaceGuides: true,
      independentVisualReviewStatus: "pending"
    },
  primaryAssets: ["showcaseKenneyOobiPlatformerHero", "showcaseKenneyVerdantPlatformerWorld"],
  platformer: {
    cameraIntent: "side-scroller",
    characterAsset: "showcaseKenneyOobiPlatformerHero",
    worldAssets: ["showcaseKenneyVerdantPlatformerWorld"],
    gameplayRequirements: ["movement", "jump", "checkpoint", "progression"],
    levelDesign: gameGeometryContract.design,
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
    surfaceContactProven: initialSurfaceAlignment.feetOnSurface,
    authoredPlayableSeconds
  }
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
    player.play(locomotionSnapshot.clip, {
      loop: locomotionSnapshot.loop,
      ...(locomotionSnapshot.restart ? { restart: true } : {})
    });
  }
  // Locomotion is expressed through a bounded non-uniform scale cycle. This is
  // deliberately visible at the corrected (smaller) subject scale and does not
  // move the node position, which stays authoritative for camera and contact.
  const cycle = locomotionSnapshot.frame * 0.42;
  const bob = Math.sin(cycle) * 0.14;
  player.setScale(compositionSubjectSuppressed
    ? 0.0001
    : compositionPoseSettled ? 1
    : visualState === "jump" ? [0.93, 1.09, 0.93]
      : visualState === "fall" ? [0.96, 1.05, 0.96]
        : visualState === "hit" ? [1.11, 0.89, 1.11]
          : visualState === "land" ? [1.07, 0.93, 1.07]
            : visualState === "run" ? [1.04 - bob, 0.97 + bob, 1.04 - bob]
              : [1 - bob, 1 + bob, 1 - bob]);
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
    visibleMotionSource: "bounded-procedural-pose",
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
  if (input.pressed("reset")) {
    state = platformerState.reset();
    challengeEvidence = runnerChallenge.reset();
    playerFacing = 1;
    frameCount += 1;
    mountedEvidence.gameplay.resetWorks = true;
    kitContractProof.resetRestoresStart = state.checkpointId === "start"
      && state.collected.length === 0
      && state.deaths === 0
      && state.score === 0;
    recordKitEvents(state.events);
    completionProof.completed = false;
    completionProof.stable = false;
    completionProof.finalTime = 0;
    completionProof.checkpoints = [];
    completionProof.eventCounts.respawn = 0;
    completionProof.eventCounts.finish = 0;
    locomotionSnapshot = locomotion.reset("idle");
    publishPlatformerEvidence();
    return;
  }
  const previous = state;
  state = platformerState.step(step, {
    moveX: input.axis("moveX"),
    jumpPressed: input.pressed("jump"),
    jumpHeld: input.held("jump")
  });
  challengeEvidence = runnerChallenge.step(step, previous, state);
  // Flow, chain and objective state must be visible in the rendered scene, not only in
  // HUD text, so the feedback nodes are driven from the evidence that was just observed.
  renderChallengeFeedback();
  frameCount += 1;
  mountedEvidence.gameplay.moveChangesX ||= Math.abs(state.player.x - previous.player.x) > 0.001;
  mountedEvidence.gameplay.jumpChangesY ||= Math.abs(state.player.y - previous.player.y) > 0.001;
  mountedEvidence.gameplay.checkpointProgression ||= state.activatedCheckpoints.length > previous.activatedCheckpoints.length;
  mountedEvidence.gameplay.hazardRespawn ||= state.deaths > previous.deaths;
  mountedEvidence.gameplay.finishProgression ||= state.status === "completed";
  if (state.deaths > previous.deaths) completionProof.eventCounts.respawn += state.deaths - previous.deaths;
  // The gameplay state reaches the physical finish first. Publish the retained
  // completion proof only after the mounted session has also satisfied the
  // route's minimum meaningful-play duration; this keeps the proof both
  // event-derived and honest about the advertised 30-second level slice.
  if (
    state.status === "completed"
    && !completionProof.completed
    && challengeEvidence.elapsedSeconds >= level.assetBinding.authoredPlayableSeconds
  ) {
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

function setupPlatformerPanel(): void {
  const panel = document.getElementById("panel");
  if (!panel) return;
  panel.innerHTML = "<span class=\"label\">Certified surface route</span>\n<h1>Skyline Runner</h1>\n<p class=\"claim\">Build flow through jumps and collection chains, bank checkpoint split bonuses, and finish the mesh-derived course.</p>\n<section class=\"panel-metrics\" aria-label=\"Live runner metrics\"><div class=\"metrics-row\"><article><span>X</span><strong id=\"x-value\">0.00</strong></article><article><span>Score</span><strong id=\"score-value\">0</strong></article><article><span>Flow</span><strong id=\"challenge-value\">0</strong></article><article><span>Deaths</span><strong id=\"death-value\">0</strong></article><article><span>Checkpoint</span><strong id=\"checkpoint-value\">start</strong></article></div><div class=\"objective\" id=\"surface-value\">Finding surface…</div></section>\n<section aria-label=\"Runner controls\"><h2>Run the route</h2><div class=\"button-grid\"><button id=\"left-control\" type=\"button\">Move left</button><button id=\"right-control\" type=\"button\">Move right</button><button id=\"jump-control\" type=\"button\">Jump</button><button id=\"reset-control\" type=\"button\">Reset</button></div><ul class=\"controls-list\"><li>Use A / D or arrow keys to move.</li><li>Press W, Up, or Space to jump.</li><li>Chain collectibles before the finish for the challenge objective.</li><li>Press R to restart from the beginning.</li></ul></section>\n<section aria-label=\"Geometry contract\"><h2>Surface contract</h2><p class=\"claim\">The visible world and player contacts share the same hash-bound mesh extraction transform.</p></section>";
  /*
   * On-screen controls come from the reusable binding layer.
   *
   * This route and Turbo had independently authored a byte-identical `bindHoldControl` + `pulseKey` pair --
   * found by the replicability metric's repeated-cluster detector, not by reading the files. Both now declare
   * which element maps to which key and `bindGameTouchControls` performs the wiring.
   */
  bindGameTouchControls({
    hold: [
      { elementId: "left-control", code: "KeyA" },
      { elementId: "right-control", code: "KeyD" }
    ],
    pulse: [
      { elementId: "jump-control", code: "Space" },
      { elementId: "reset-control", code: "KeyR" }
    ]
  });
}
function updatePlatformerHud(): void {
  hud.x.textContent = round(state.player.x).toFixed(2);
  hud.score.textContent = String(challengeEvidence.challengeScore);
  hud.deaths.textContent = String(state.deaths);
  hud.checkpoint.textContent = state.checkpointId;
  hud.challenge.textContent = `${Math.round(challengeEvidence.flow)} · x${Math.max(1, challengeEvidence.collectionChain)}`;
  const alignment = playerSurfaceAlignment();
  const objective = challengeEvidence.objectiveMet ? "Flow objective complete" : "Chain 3 collectibles, then finish";
  hud.surface.textContent = `${alignment.feetOnSurface ? "Grounded on " + alignment.surfaceId : "Airborne"} · ${objective}`;
}
function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing element #" + id);
  return element;
}
