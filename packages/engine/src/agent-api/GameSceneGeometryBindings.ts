import type {
  GameAssetBoundPlatformerLevel,
  GameAssetBoundRacingRoute,
  GameKitRect,
  GameKitVec2,
  GamePlatformerSurfaceModelAnchor,
  GamePlatformerPlayableSurfaceMap,
  GamePlatformerPlayerState,
  GameRacingTopologyModelAnchor,
  GameRacingSnapshot,
  GameRacingTrackTopology
} from "./GameGenreKits";
import {
  assertOverlayValidatedSource,
  averageRouteTopologyError,
  averageSurfaceBindingError,
  boundsFromLeftEdgeRects,
  boundsFromPoints,
  normalizedModelLocalOffset,
  positiveOrDefault,
  roundScene,
  sampleRoutePoint,
  transformFromBounds
} from "./GameSceneGeometryMath";

type Vec3 = readonly [number, number, number];
type Euler3 = readonly [number, number, number];

export interface GameRacingCameraSelectionEvidence {
  readonly source: "asset-pair-composition";
  readonly report: string;
  readonly check: "camera-readability";
  readonly verdict: "pass";
  readonly selectedMode: "chase" | "top-down";
}

export interface GameScenePresentationCameraSpec {
  readonly mode: "perspective" | "follow";
  readonly selectionEvidence?: GameRacingCameraSelectionEvidence;
  readonly position?: Vec3;
  readonly target: Vec3;
  readonly offset?: Vec3;
  readonly targetOffset?: Vec3;
  readonly offsetMode?: "scene" | "target-yaw";
  readonly fov: number;
  readonly targetNode?: string;
  readonly distance?: number;
  readonly smoothing?: number;
  readonly subjectEmphasis?: number;
}

export interface GameSceneModelOffset {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
}

export interface GameSceneTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetZ: number;
  readonly elevation: number;
}

export interface GameSceneModelAnchorFit {
  readonly mode: "single-anchor" | "multi-anchor-yaw-fit" | "multi-anchor-plane-fit";
  readonly anchorCount: number;
  readonly averageError: number | null;
  readonly maxError: number | null;
  readonly rotation: Euler3;
}

export interface GameRacingSceneBindingOptions {
  readonly topology: GameRacingTrackTopology;
  readonly route: GameAssetBoundRacingRoute;
  readonly trackAsset: string;
  readonly targetSceneSize?: number;
  readonly trackModelTargetMaxDimension?: number;
  readonly trackModelSceneOffset?: GameSceneModelOffset;
  readonly trackModelPresentationOffset?: GameSceneModelOffset;
  readonly trackY?: number;
  readonly carY?: number;
  readonly ghostY?: number;
  readonly requireOverlayEvidence?: boolean;
}

export interface GameRacingScenePose {
  readonly position: Vec3;
  readonly rotation: Euler3;
  readonly heading: number;
}

export interface GameRacingSceneSpeedModel {
  readonly kind: "certified-route-to-scene-speed";
  readonly routeLength: number;
  readonly authoredLapSeconds: number;
  readonly gameUnitsPerSecond: number;
  readonly sceneUnitsPerGameUnit: number;
  readonly sceneUnitsPerSecond: number;
}

export interface GameRacingSceneBinding {
  readonly kind: "aura-game-racing-scene-binding";
  readonly sceneContractVersion: "1.0";
  readonly topologyAssetHash: string;
  readonly transform: GameSceneTransform;
  readonly speedModel: GameRacingSceneSpeedModel;
  readonly trackModel: {
    readonly position: Vec3;
    readonly rotation: Euler3;
    readonly targetMaxDimension: number;
    readonly anchorFit: GameSceneModelAnchorFit;
  };
  readonly checkpointScenePoints: readonly Vec3[];
  readonly evidence: {
    readonly sourceAsset: string;
    readonly routeOverlay: string;
    readonly geometryBinding: "track-topology-to-scene-transform";
    readonly assetHash: string;
    readonly topologySource: string;
    readonly routePointCount: number;
    readonly checkpointCount: number;
    readonly averageRouteTopologyError: number;
    readonly modelSceneOffset: Required<GameSceneModelOffset>;
    readonly modelPresentationOffset: Required<GameSceneModelOffset>;
    readonly modelAlignment: {
      readonly source: string;
      readonly modelPoint: Vec3;
      readonly gamePoint: {
        readonly x: number;
        readonly z: number;
      };
      readonly anchorCount: number;
      readonly averageAnchorError: number | null;
      readonly maxAnchorError: number | null;
      readonly rotation: Euler3;
    };
    readonly notes: string;
  };
  toScenePoint(point: GameKitVec2, y?: number): Vec3;
  toScenePose(snapshot: Pick<GameRacingSnapshot, "position" | "heading">, y?: number): GameRacingScenePose;
  /**
   * Inverse of {@link toScenePoint}: scene XZ back to the game plane.
   *
   * Needed by anything that samples the track under a world-space point -- a vehicle
   * chassis asking for the surface height under each wheel, for example. Without it a
   * route has to reconstruct the transform itself from `transform` plus an offset the
   * binding does not expose, which is how a route ends up with its own slightly
   * different copy of the engine's coordinate mapping.
   */
  toGamePoint(x: number, z: number): GameKitVec2;
}

export interface GameRacingPresentationCameraOptions {
  readonly sceneBinding: GameRacingSceneBinding;
  readonly focus: Pick<GameRacingSnapshot, "position" | "heading">;
  readonly mode?: "follow" | "overview";
  readonly targetNode?: string;
  readonly distance?: number;
  readonly height?: number;
  readonly sideOffset?: number;
  readonly lookAhead?: number;
  readonly target?: Vec3;
  readonly fov?: number;
}

export interface GameRacingCameraRigOptions extends Omit<GameRacingPresentationCameraOptions, "mode"> {
  readonly mode: "chase" | "top-down";
  readonly composition: {
    readonly report: string;
    readonly verdict: "pass" | "fail";
    readonly cameraReadabilityVerdict: "pass" | "fail";
    readonly selectedMode: "chase" | "top-down";
  };
}

export interface GamePlatformerSceneBindingOptions {
  readonly surfaceMap: GamePlatformerPlayableSurfaceMap;
  readonly level: GameAssetBoundPlatformerLevel;
  readonly worldAsset: string;
  readonly targetSceneWidth?: number;
  readonly worldModelTargetMaxDimension?: number;
  readonly worldModelSceneOffset?: GameSceneModelOffset;
  readonly worldModelPresentationOffset?: GameSceneModelOffset;
  readonly worldY?: number;
  readonly worldZ?: number;
  readonly playerZ?: number;
  readonly playerTargetHeight?: number;
  readonly playerYOffset?: number;
  readonly requireOverlayEvidence?: boolean;
}

export interface GamePlatformerSceneBinding {
  readonly kind: "aura-game-platformer-scene-binding";
  readonly sceneContractVersion: "1.0";
  readonly surfaceAssetHash: string;
  readonly transform: GameSceneTransform;
  /**
   * Scene depth of the world plane, including any world-model scene offset.
   *
   * Surfaced because `worldZ` is an *input* option and was not readable back from the binding, so any second
   * consumer had to keep its own copy of the same number. Skyline Runner did exactly that: a route-local
   * `WORLD_DEPTH_Z = -0.46` duplicating what it had just passed in, which two values could then drift apart.
   * That is a public API gap rather than a route defect -- the binding knows the answer and was not telling.
   *
   * Depth-layered set dressing needs this to place layers relative to the play plane, which is precisely the
   * second consumer that made the duplication necessary.
   */
  readonly worldZ: number;
  readonly worldModel: {
    readonly position: Vec3;
    readonly rotation: Euler3;
    readonly targetMaxDimension: number;
    readonly anchorFit: GameSceneModelAnchorFit;
  };
  readonly evidence: {
    readonly sourceAsset: string;
    readonly surfaceOverlay: string;
    readonly geometryBinding: "playable-surface-to-scene-transform";
    readonly assetHash: string;
    readonly surfaceSource: string;
    readonly surfaceCount: number;
    readonly levelSurfaceCount: number;
    readonly characterScaleRatio: number;
    readonly averageSurfaceBindingError: number;
    readonly modelSceneOffset: Required<GameSceneModelOffset>;
    readonly modelPresentationOffset: Required<GameSceneModelOffset>;
    readonly playerTargetHeight: number;
    readonly modelAlignment: {
      readonly source: string;
      readonly modelPoint: Vec3;
      readonly gamePoint: GameKitVec2;
      readonly anchorCount: number;
      readonly averageAnchorError: number | null;
      readonly maxAnchorError: number | null;
      readonly rotation: Euler3;
    };
    readonly notes: string;
  };
  toScenePoint(point: GameKitVec2, yOffset?: number): Vec3;
  toScenePlayer(player: GamePlatformerPlayerState): {
    readonly position: Vec3;
    readonly facing: 1 | -1;
    readonly grounded: boolean;
  };
  surfaceToSceneRect(surface: GameKitRect): {
    readonly center: Vec3;
    readonly size: Vec3;
  };
  contactPointForPlayer(player: GamePlatformerPlayerState): Vec3;
}

export interface GamePlatformerPresentationCameraOptions {
  readonly sceneBinding: GamePlatformerSceneBinding;
  readonly player: GamePlatformerPlayerState;
  readonly mode?: "follow" | "establishing";
  readonly targetNode?: string;
  readonly lookAhead?: number;
  readonly distance?: number;
  readonly height?: number;
  readonly fov?: number;
}

export function createGameRacingSceneBinding(options: GameRacingSceneBindingOptions): GameRacingSceneBinding {
  const targetSceneSize = positiveOrDefault(options.targetSceneSize, 3.25);
  const trackModelTargetMaxDimension = positiveOrDefault(options.trackModelTargetMaxDimension, targetSceneSize);
  const trackModelSceneOffset = normalizeSceneOffset(options.trackModelSceneOffset);
  const trackModelPresentationOffset = normalizeSceneOffset(options.trackModelPresentationOffset);
  const trackY = options.trackY ?? -0.12;
  const carY = options.carY ?? 0.28;
  const topology = options.topology;
  assertOverlayValidatedSource(topology.source, "game.racingSceneBinding topology");
  assertNoPresentationOffset("game.racingSceneBinding trackModelPresentationOffset", trackModelPresentationOffset);
  if (topology.assetId !== options.trackAsset) {
    throw new Error(`game.racingSceneBinding topology asset ${topology.assetId} does not match track asset ${options.trackAsset}.`);
  }
  if (options.route.assetBinding.trackAssetHash !== topology.assetHash) {
    throw new Error("game.racingSceneBinding requires route and topology to share the same track asset hash.");
  }
  const overlay = topology.evidence.routeOverlay;
  const requiresOverlayEvidence = (options.requireOverlayEvidence ?? true) && topology.source !== "asset-mesh-extracted";
  if (requiresOverlayEvidence && !overlay) {
    throw new Error("game.racingSceneBinding requires retained route overlay evidence.");
  }
  if (requiresOverlayEvidence && hasSceneOffset(trackModelSceneOffset)) {
    throw new Error(
      "game.racingSceneBinding does not allow trackModelSceneOffset with retained overlay evidence; bind the track model and racing route through the same topology transform."
    );
  }
  const bounds = boundsFromPoints(topology.roadCenterline.map((point) => ({ x: point.x, y: point.z })));
  const transform = transformFromBounds(bounds, targetSceneSize, trackY);
  const routeError = averageRouteTopologyError(options.route.points, topology.roadCenterline);
  if (routeError > 0.06) {
    throw new Error(`game.racingSceneBinding route points are not bound to topology centerline (${routeError.toFixed(3)} average error).`);
  }
  const toScenePoint = (point: GameKitVec2, y = carY): Vec3 => [
    roundScene(point.x * transform.scale + transform.offsetX + trackModelSceneOffset.x),
    roundScene(y + trackModelSceneOffset.y),
    roundScene(point.y * transform.scale + transform.offsetZ + trackModelSceneOffset.z)
  ];
  const trackModelFit = fitRacingModelToTopology({
    anchors: topology.modelAlignment.anchorPairs,
    fallbackAnchor: {
      id: "model-alignment",
      modelPoint: topology.modelAlignment.modelPoint,
      gamePoint: topology.modelAlignment.gamePoint
    },
    modelBounds: topology.modelAlignment.modelBounds,
    targetMaxDimension: trackModelTargetMaxDimension,
    toScenePoint: (anchor) => toScenePoint({ x: anchor.gamePoint.x, y: anchor.gamePoint.z }, trackY)
  });
  assertModelAnchorFitQuality({
    label: "game.racingSceneBinding track model alignment",
    fit: trackModelFit.anchorFit,
    targetMaxDimension: trackModelTargetMaxDimension,
    maxAverageErrorRatio: 0.12,
    maxErrorRatio: 0.28
  });
  const trackModelPosition = addVec3(trackModelFit.position, offsetToVec3(trackModelPresentationOffset));
  return {
    kind: "aura-game-racing-scene-binding",
    sceneContractVersion: "1.0",
    topologyAssetHash: topology.assetHash,
    transform,
    speedModel: {
      kind: "certified-route-to-scene-speed",
      routeLength: options.route.assetBinding.speedModel.routeLength,
      authoredLapSeconds: options.route.assetBinding.speedModel.authoredLapSeconds,
      gameUnitsPerSecond: options.route.assetBinding.speedModel.certifiedSpeed,
      sceneUnitsPerGameUnit: transform.scale,
      sceneUnitsPerSecond: Number((options.route.assetBinding.speedModel.certifiedSpeed * transform.scale).toFixed(6))
    },
    trackModel: {
      position: trackModelPosition,
      rotation: trackModelFit.anchorFit.rotation,
      targetMaxDimension: trackModelTargetMaxDimension,
      anchorFit: trackModelFit.anchorFit
    },
    checkpointScenePoints: options.route.checkpoints?.map((progress) => toScenePoint(sampleRoutePoint(options.route.points, progress), carY)) ?? [],
    evidence: {
      sourceAsset: topology.evidence.sourceAsset,
      routeOverlay: overlay ?? "",
      geometryBinding: "track-topology-to-scene-transform",
      assetHash: topology.assetHash,
      topologySource: topology.source,
      routePointCount: options.route.points.length,
      checkpointCount: options.route.checkpoints?.length ?? 0,
      averageRouteTopologyError: routeError,
      modelSceneOffset: trackModelSceneOffset,
      modelPresentationOffset: trackModelPresentationOffset,
      modelAlignment: {
        source: topology.modelAlignment.source,
        modelPoint: topology.modelAlignment.modelPoint,
        gamePoint: topology.modelAlignment.gamePoint,
        anchorCount: trackModelFit.anchorFit.anchorCount,
        averageAnchorError: trackModelFit.anchorFit.averageError,
        maxAnchorError: trackModelFit.anchorFit.maxError,
        rotation: trackModelFit.anchorFit.rotation
      },
      notes: topology.evidence.notes
    },
    toScenePoint,
    toGamePoint(x, z) {
      const scale = transform.scale === 0 ? 1 : transform.scale;
      return {
        x: (x - transform.offsetX - trackModelSceneOffset.x) / scale,
        y: (z - transform.offsetZ - trackModelSceneOffset.z) / scale
      };
    },
    toScenePose(snapshot, y = carY) {
      return {
        position: toScenePoint(snapshot.position, y),
        rotation: [0, roundScene(-snapshot.heading + Math.PI / 2), 0],
        heading: roundScene(snapshot.heading)
      };
    }
  };
}

export function createGameRacingPresentationCamera(options: GameRacingPresentationCameraOptions): GameScenePresentationCameraSpec {
  if (options.mode === "overview") {
    const track = options.target ?? options.sceneBinding.trackModel.position;
    const distance = positiveOrDefault(options.distance, 5.9);
    const height = positiveOrDefault(options.height, 3.75);
    const target: Vec3 = [
      roundScene(track[0] + 0.08),
      roundScene(track[1] + 0.18),
      roundScene(track[2] - 0.04)
    ];
    return {
      mode: "perspective",
      position: [
        roundScene(target[0] + 0.18),
        roundScene(target[1] + height),
        roundScene(target[2] + distance)
      ],
      target,
      fov: options.fov ?? 42,
      smoothing: 0.05,
      subjectEmphasis: 0.68
    };
  }
  const pose = options.sceneBinding.toScenePose(options.focus);
  const distance = positiveOrDefault(options.distance, 3.6);
  const height = positiveOrDefault(options.height, 1.85);
  const sideOffset = options.sideOffset ?? 0.2;
  const lookAhead = positiveOrDefault(options.lookAhead, 0.46);
  const forwardX = Math.cos(pose.heading);
  const forwardZ = Math.sin(pose.heading);
  const sideX = -forwardZ;
  const sideZ = forwardX;
  const target: Vec3 = [
    roundScene(pose.position[0] + forwardX * lookAhead),
    roundScene(pose.position[1] + 0.16),
    roundScene(pose.position[2] + forwardZ * lookAhead)
  ];
  if (options.targetNode) {
    return {
      mode: "follow",
      targetNode: options.targetNode,
      offset: [roundScene(sideOffset), roundScene(height), roundScene(-distance)],
      targetOffset: [0, 0.18, 0],
      offsetMode: "target-yaw",
      target: [0, 0.2, 0],
      distance,
      fov: options.fov ?? 44,
      smoothing: 0.06,
      subjectEmphasis: 0.78
    };
  }
  return {
    mode: "perspective",
    position: [
      roundScene(pose.position[0] - forwardX * distance + sideX * sideOffset),
      roundScene(pose.position[1] + height),
      roundScene(pose.position[2] - forwardZ * distance + sideZ * sideOffset)
    ],
    target,
    fov: options.fov ?? 44,
    smoothing: 0.08,
    subjectEmphasis: 0.72
  };
}

export function createGamePlatformerSceneBinding(options: GamePlatformerSceneBindingOptions): GamePlatformerSceneBinding {
  const targetSceneWidth = positiveOrDefault(options.targetSceneWidth, 5.2);
  const worldModelTargetMaxDimension = positiveOrDefault(options.worldModelTargetMaxDimension, targetSceneWidth);
  const worldModelSceneOffset = normalizeSceneOffset(options.worldModelSceneOffset);
  const worldModelPresentationOffset = normalizeSceneOffset(options.worldModelPresentationOffset);
  const worldY = options.worldY ?? -0.86;
  const worldZ = options.worldZ ?? -0.35;
  const playerZ = options.playerZ ?? 0.42;
  const playerTargetHeight = positiveOrDefault(options.playerTargetHeight, 0.62);
  const playerYOffset = options.playerYOffset ?? 0.06;
  const surfaceMap = options.surfaceMap;
  assertOverlayValidatedSource(surfaceMap.source, "game.platformerSceneBinding surface map");
  assertNoPresentationOffset("game.platformerSceneBinding worldModelPresentationOffset", worldModelPresentationOffset);
  if (surfaceMap.assetId !== options.worldAsset) {
    throw new Error(`game.platformerSceneBinding surface asset ${surfaceMap.assetId} does not match world asset ${options.worldAsset}.`);
  }
  if (options.level.assetBinding.worldAssetHashes?.[options.worldAsset] !== surfaceMap.assetHash) {
    throw new Error("game.platformerSceneBinding requires level and surface map to share the same world asset hash.");
  }
  const overlay = surfaceMap.evidence.routeOverlay;
  const requiresOverlayEvidence = (options.requireOverlayEvidence ?? true) && surfaceMap.source !== "asset-mesh-extracted";
  if (requiresOverlayEvidence && !overlay) {
    throw new Error("game.platformerSceneBinding requires retained surface overlay evidence.");
  }
  if (requiresOverlayEvidence && hasSceneOffset(worldModelSceneOffset)) {
    throw new Error(
      "game.platformerSceneBinding does not allow worldModelSceneOffset with retained overlay evidence; bind the world model and playable surfaces through the same surface transform."
    );
  }
  const gameplaySurfaces =
    options.level.platforms ??
    surfaceMap.surfaces.map((surface) => ({
      id: surface.id,
      x: surface.x - surface.width / 2,
      y: surface.y,
      width: surface.width,
      height: surface.height
    }));
  const bounds = boundsFromLeftEdgeRects(gameplaySurfaces);
  const transform = transformFromBounds(bounds, targetSceneWidth, worldY);
  const bindingError = averageSurfaceBindingError(options.level.platforms ?? [], surfaceMap);
  if (bindingError > 0.06) {
    throw new Error(`game.platformerSceneBinding level platforms are not bound to playable surfaces (${bindingError.toFixed(3)} average error).`);
  }
  const toScenePoint = (point: GameKitVec2, yOffset = 0): Vec3 => [
    roundScene(point.x * transform.scale + transform.offsetX + worldModelSceneOffset.x),
    roundScene((point.y + yOffset) * transform.scale + transform.elevation + worldModelSceneOffset.y),
    roundScene(playerZ + worldModelSceneOffset.z)
  ];
  const toScenePlayerPosition = (player: GamePlatformerPlayerState): Vec3 => {
    const contact = toScenePoint({ x: player.x, y: player.y }, 0);
    return [
      contact[0],
      // Safe-rendered fit models are normalized with their minimum Y at the node origin.
      // Keep that grounded origin on the certified surface instead of adding half-height twice.
      roundScene(contact[1] + playerYOffset),
      contact[2]
    ];
  };
  const worldModelFit = fitPlatformerModelToSurfaces({
    anchors: surfaceMap.modelAlignment.anchorPairs,
    fallbackAnchor: {
      id: "model-alignment",
      modelPoint: surfaceMap.modelAlignment.modelPoint,
      gamePoint: surfaceMap.modelAlignment.gamePoint
    },
    modelBounds: surfaceMap.modelAlignment.modelBounds,
    targetMaxDimension: worldModelTargetMaxDimension,
    worldZ: worldZ + worldModelSceneOffset.z,
    toScenePoint
  });
  assertModelAnchorFitQuality({
    label: "game.platformerSceneBinding world model alignment",
    fit: worldModelFit.anchorFit,
    targetMaxDimension: worldModelTargetMaxDimension,
    maxAverageErrorRatio: 0.12,
    maxErrorRatio: 0.28
  });
  const worldModelPosition = addVec3(worldModelFit.position, offsetToVec3(worldModelPresentationOffset));
  return {
    kind: "aura-game-platformer-scene-binding",
    sceneContractVersion: "1.0",
    surfaceAssetHash: surfaceMap.assetHash,
    transform,
    // Same value handed to the world-model fit, so a second consumer reads it instead of copying it.
    worldZ: roundScene(worldZ + worldModelSceneOffset.z),
    worldModel: {
      position: worldModelPosition,
      rotation: worldModelFit.anchorFit.rotation,
      targetMaxDimension: worldModelTargetMaxDimension,
      anchorFit: worldModelFit.anchorFit
    },
    evidence: {
      sourceAsset: surfaceMap.evidence.sourceAsset,
      surfaceOverlay: overlay ?? "",
      geometryBinding: "playable-surface-to-scene-transform",
      assetHash: surfaceMap.assetHash,
      surfaceSource: surfaceMap.source,
      surfaceCount: surfaceMap.surfaces.length,
      levelSurfaceCount: options.level.platforms?.length ?? 0,
      characterScaleRatio: surfaceMap.characterScaleRatio,
      averageSurfaceBindingError: bindingError,
      modelSceneOffset: worldModelSceneOffset,
      modelPresentationOffset: worldModelPresentationOffset,
      playerTargetHeight,
      modelAlignment: {
        source: surfaceMap.modelAlignment.source,
        modelPoint: surfaceMap.modelAlignment.modelPoint,
        gamePoint: surfaceMap.modelAlignment.gamePoint,
        anchorCount: worldModelFit.anchorFit.anchorCount,
        averageAnchorError: worldModelFit.anchorFit.averageError,
        maxAnchorError: worldModelFit.anchorFit.maxError,
        rotation: worldModelFit.anchorFit.rotation
      },
      notes: surfaceMap.evidence.notes
    },
    toScenePoint,
    toScenePlayer(player) {
      return {
        position: toScenePlayerPosition(player),
        facing: player.facing,
        grounded: player.grounded
      };
    },
    surfaceToSceneRect(surface) {
      return {
        center: toScenePoint({ x: surface.x + surface.width / 2, y: surface.y + surface.height / 2 }),
        size: [roundScene(surface.width * transform.scale), roundScene(surface.height * transform.scale), 0.04]
      };
    },
    contactPointForPlayer(player) {
      return toScenePoint({ x: player.x, y: player.y }, 0);
    }
  };
}

export function createGamePlatformerPresentationCamera(options: GamePlatformerPresentationCameraOptions): GameScenePresentationCameraSpec {
  const player = options.sceneBinding.toScenePlayer(options.player);
  if (options.mode === "establishing") {
    const world = options.sceneBinding.worldModel.position;
    const distance = positiveOrDefault(options.distance, 6.2);
    const height = positiveOrDefault(options.height, 1.12);
    const target: Vec3 = [
      roundScene((player.position[0] * 0.38) + (world[0] * 0.62) + 0.22),
      roundScene(Math.max(player.position[1] * 0.52, world[1] + 0.42)),
      roundScene((player.position[2] * 0.34) + (world[2] * 0.66))
    ];
    return {
      mode: "perspective",
      position: [
        roundScene(target[0] + 0.04),
        roundScene(target[1] + height),
        roundScene(target[2] + distance)
      ],
      target,
      fov: options.fov ?? 42,
      smoothing: 0.05,
      subjectEmphasis: 0.72
    };
  }
  const lookAhead = options.lookAhead ?? (player.facing === -1 ? -0.56 : 0.56);
  const distance = positiveOrDefault(options.distance, 5.1);
  const height = positiveOrDefault(options.height, 0.68);
  const target: Vec3 = [
    roundScene(player.position[0] + lookAhead),
    roundScene(player.position[1] + 0.28),
    roundScene(player.position[2] - 0.04)
  ];
  if (options.targetNode) {
    return {
      mode: "follow",
      targetNode: options.targetNode,
      offset: [roundScene(lookAhead * 0.42), roundScene(height), roundScene(distance)],
      targetOffset: [roundScene(lookAhead), 0.34, 0],
      offsetMode: "scene",
      target: [0, 0.42, 0],
      distance,
      fov: options.fov ?? 42,
      smoothing: 0.045,
      subjectEmphasis: 0.74
    };
  }
  return {
    mode: "perspective",
    position: [
      roundScene(target[0]),
      roundScene(target[1] + height),
      roundScene(player.position[2] + distance)
    ],
    target,
    fov: options.fov ?? 42,
    smoothing: 0.06,
    subjectEmphasis: 0.78
  };
}

function normalizeSceneOffset(offset: GameSceneModelOffset | undefined): Required<GameSceneModelOffset> {
  return {
    x: roundScene(offset?.x ?? 0),
    y: roundScene(offset?.y ?? 0),
    z: roundScene(offset?.z ?? 0)
  };
}

function offsetToVec3(offset: Required<GameSceneModelOffset>): Vec3 {
  return [offset.x, offset.y, offset.z];
}

function hasSceneOffset(offset: Required<GameSceneModelOffset>): boolean {
  return offset.x !== 0 || offset.y !== 0 || offset.z !== 0;
}

function assertNoPresentationOffset(label: string, offset: Required<GameSceneModelOffset>): void {
  if (!hasSceneOffset(offset)) return;
  throw new Error(`${label} is not allowed for scene-bound game geometry; presentation offsets decouple the visible model from gameplay topology.`);
}

interface ModelAnchorFitQualityOptions {
  readonly label: string;
  readonly fit: GameSceneModelAnchorFit;
  readonly targetMaxDimension: number;
  readonly maxAverageErrorRatio: number;
  readonly maxErrorRatio: number;
}

function assertModelAnchorFitQuality(options: ModelAnchorFitQualityOptions): void {
  if (options.fit.anchorCount < 2) return;
  const averageError = options.fit.averageError ?? 0;
  const maxError = options.fit.maxError ?? 0;
  const averageLimit = roundScene(options.targetMaxDimension * options.maxAverageErrorRatio);
  const maxLimit = roundScene(options.targetMaxDimension * options.maxErrorRatio);
  if (averageError <= averageLimit && maxError <= maxLimit) return;
  throw new Error(
    `${options.label} asset geometry is not scene-bound to game geometry (average anchor error ${averageError}, max anchor error ${maxError}, limits ${averageLimit}/${maxLimit}).`
  );
}

interface RacingModelFitOptions {
  readonly anchors: readonly GameRacingTopologyModelAnchor[] | undefined;
  readonly fallbackAnchor: GameRacingTopologyModelAnchor;
  readonly modelBounds: GameRacingTrackTopology["modelAlignment"]["modelBounds"];
  readonly targetMaxDimension: number;
  toScenePoint(anchor: GameRacingTopologyModelAnchor): Vec3;
}

interface PlatformerModelFitOptions {
  readonly anchors: readonly GamePlatformerSurfaceModelAnchor[] | undefined;
  readonly fallbackAnchor: GamePlatformerSurfaceModelAnchor;
  readonly modelBounds: GamePlatformerPlayableSurfaceMap["modelAlignment"]["modelBounds"];
  readonly targetMaxDimension: number;
  readonly worldZ: number;
  toScenePoint(point: GameKitVec2, yOffset?: number): Vec3;
}

interface ModelFitResult {
  readonly position: Vec3;
  readonly anchorFit: GameSceneModelAnchorFit;
}

function fitRacingModelToTopology(options: RacingModelFitOptions): ModelFitResult {
  const anchors = options.anchors && options.anchors.length >= 2 ? options.anchors : [options.fallbackAnchor];
  const localOffsets = anchors.map((anchor) =>
    normalizedModelLocalOffset(options.modelBounds, anchor.modelPoint, options.targetMaxDimension)
  );
  const sceneTargets = anchors.map((anchor) => options.toScenePoint(anchor));
  const rotationY = anchors.length >= 2 ? solveYawFromAnchorPairs(localOffsets, sceneTargets) : 0;
  const rotatedOffsets = localOffsets.map((offset) => rotateXZOffset(offset, rotationY));
  const position = averagePosition(sceneTargets.map((target, index) => subtractVec3(target, rotatedOffsets[index] ?? [0, 0, 0])));
  const errors = sceneTargets.map((target, index) => distance3(target, addVec3(position, rotatedOffsets[index] ?? [0, 0, 0])));
  const fitError = summarizeFitErrors(errors, anchors.length);
  return {
    position,
    anchorFit: {
      mode: anchors.length >= 2 ? "multi-anchor-yaw-fit" : "single-anchor",
      anchorCount: anchors.length,
      averageError: fitError.average,
      maxError: fitError.max,
      rotation: [0, roundScene(rotationY), 0]
    }
  };
}

function fitPlatformerModelToSurfaces(options: PlatformerModelFitOptions): ModelFitResult {
  const anchors = options.anchors && options.anchors.length >= 2 ? options.anchors : [options.fallbackAnchor];
  const localOffsets = anchors.map((anchor) =>
    normalizedModelLocalOffset(options.modelBounds, anchor.modelPoint, options.targetMaxDimension)
  );
  const sceneTargets = anchors.map((anchor) => options.toScenePoint(anchor.gamePoint, 0));
  const x = average(sceneTargets.map((target, index) => target[0] - (localOffsets[index]?.[0] ?? 0)));
  const y = average(sceneTargets.map((target, index) => target[1] - (localOffsets[index]?.[1] ?? 0)));
  const fallbackOffset = localOffsets[0] ?? [0, 0, 0];
  const position: Vec3 = [
    roundScene(x),
    roundScene(y),
    roundScene(options.worldZ - fallbackOffset[2])
  ];
  const errors = sceneTargets.map((target, index) => {
    const localOffset = localOffsets[index] ?? [0, 0, 0];
    return Math.hypot(target[0] - (position[0] + localOffset[0]), target[1] - (position[1] + localOffset[1]));
  });
  const fitError = summarizeFitErrors(errors, anchors.length);
  return {
    position,
    anchorFit: {
      mode: anchors.length >= 2 ? "multi-anchor-plane-fit" : "single-anchor",
      anchorCount: anchors.length,
      averageError: fitError.average,
      maxError: fitError.max,
      rotation: [0, 0, 0]
    }
  };
}

function solveYawFromAnchorPairs(localOffsets: readonly Vec3[], sceneTargets: readonly Vec3[]): number {
  let bestA = 0;
  let bestB = 1;
  let bestDistance = 0;
  for (let a = 0; a < localOffsets.length; a += 1) {
    for (let b = a + 1; b < localOffsets.length; b += 1) {
      const routeDistance = Math.hypot(sceneTargets[b][0] - sceneTargets[a][0], sceneTargets[b][2] - sceneTargets[a][2]);
      const modelDistance = Math.hypot(localOffsets[b][0] - localOffsets[a][0], localOffsets[b][2] - localOffsets[a][2]);
      const distance = Math.min(routeDistance, modelDistance);
      if (distance > bestDistance) {
        bestA = a;
        bestB = b;
        bestDistance = distance;
      }
    }
  }
  if (bestDistance <= 0.001) return 0;
  const routeAngle = Math.atan2(sceneTargets[bestB][2] - sceneTargets[bestA][2], sceneTargets[bestB][0] - sceneTargets[bestA][0]);
  const modelAngle = Math.atan2(localOffsets[bestB][2] - localOffsets[bestA][2], localOffsets[bestB][0] - localOffsets[bestA][0]);
  return routeAngle - modelAngle;
}

function rotateXZOffset(offset: Vec3, yaw: number): Vec3 {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [
    roundScene(offset[0] * cos - offset[2] * sin),
    offset[1],
    roundScene(offset[0] * sin + offset[2] * cos)
  ];
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [roundScene(a[0] + b[0]), roundScene(a[1] + b[1]), roundScene(a[2] + b[2])];
}

function subtractVec3(a: Vec3, b: Vec3): Vec3 {
  return [roundScene(a[0] - b[0]), roundScene(a[1] - b[1]), roundScene(a[2] - b[2])];
}

function averagePosition(points: readonly Vec3[]): Vec3 {
  return [
    roundScene(average(points.map((point) => point[0]))),
    roundScene(average(points.map((point) => point[1]))),
    roundScene(average(points.map((point) => point[2])))
  ];
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function summarizeFitErrors(errors: readonly number[], anchorCount: number): { readonly average: number | null; readonly max: number | null } {
  if (anchorCount < 2 || errors.length < 2) return { average: null, max: null };
  return {
    average: roundScene(average(errors)),
    max: roundScene(Math.max(...errors))
  };
}
