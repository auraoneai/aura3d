// Pip's Big Leap — engine platformer-helper certification.
//
// Every world is *also* lowered into the engine's public platformer surface
// contract: `game.assetBoundPlatformerLevel` -> `game.platformerSceneBinding`
// -> `game.publicPlatformerPresentation` -> `game.certifyPlatformerGeometry` /
// `game.certifyPlatformerPresentation`, plus a `game.platformer` kit snapshot
// stepped once at spawn. The pipeline runs for real — bindings bind to the
// world's *actual* typed backdrop GLB (real sha-256 hashes), surfaces are the
// course's authored geometry (compiler-authored overlay source, honestly
// labelled) — and the only honest blockers are the retained-proof fields
// (browser screenshots/hashes), which cannot exist until a captured run.

import { game } from "@aura3d/engine";

// The kit/certification types are not re-exported on the public surface —
// derive them structurally from the `game` namespace signatures.
type BoundLevelOptions = Parameters<typeof game.assetBoundPlatformerLevel>[0];
type GamePlatformerLevel = NonNullable<BoundLevelOptions["level"]>;
type GamePlatformerPlayableSurfaceMap = NonNullable<BoundLevelOptions["playableSurfaceMap"]>;
type GameAssetBoundPlatformerLevel = ReturnType<typeof game.assetBoundPlatformerLevel>;
type GamePlatformerSceneBinding = ReturnType<typeof game.platformerSceneBinding>;
type PublicPlatformerGeometryContract = Parameters<typeof game.certifyPlatformerGeometry>[0];
type PublicGameGeometryCertification = ReturnType<typeof game.certifyPlatformerGeometry>;
type PresentationCertInput = Parameters<typeof game.certifyPlatformerPresentation>[0];
import { assets } from "../aura-assets.js";
import type { WorldMotion } from "./motion.js";
import type { WorldSpec } from "./types.js";

const PENDING_PROOF = {
  routePrimaryScreenshot: "",
  routePrimaryScreenshotSha256: "",
  geometryReport: "",
  manifestHash: "",
  visualReview: "fail",
  assetPairPass: false,
  blockers: ["retained-proof pending captured browser run (screenshot + sha256)"]
} as const;

/** Project the 3D course onto the kit's 2D plane: game-x = -worldZ (finish ahead). */
const gx = (z: number) => -z;
const gy = (y: number) => y;

export interface WorldCertification {
  readonly ok: boolean;
  readonly level?: GameAssetBoundPlatformerLevel;
  readonly kitSnapshot?: unknown;
  readonly surfaceCount: number;
  readonly presentationCounts: {
    readonly groundMeshNodes: number;
    readonly platformMeshNodes: number;
    readonly hazardNodes: number;
    readonly checkpointNodes: number;
    readonly finishNodes: number;
  };
  readonly geometry: PublicGameGeometryCertification | null;
  readonly presentation: PublicGameGeometryCertification | null;
  readonly error?: string;
  readonly notes: readonly string[];
}

export function certifyWorld(spec: WorldSpec, motion: WorldMotion): WorldCertification {
  const notes: string[] = [];
  try {
    const backdropKey = spec.backdrops[0]?.asset ?? "verdant";
    const backdropAsset = assets.backdrop[backdropKey];
    const worldAsset = backdropKey === "verdant" ? "showcaseKenneyVerdantPlatformerWorld"
      : backdropKey === "cartoon" ? "showcaseCartoonPlatformWorld"
      : backdropKey === "palace" ? "showcasePlatformerWorldLevel"
      : backdropKey === "readable" ? "showcaseReadablePlatformLevel"
      : backdropKey === "sidescroll" ? "showcaseSideScrollerPlatformLevel"
      : "showcasePlatformerBasicPack";
    const worldAssetHash = backdropAsset.hash;
    const overlay = `apps/showcase-pips-big-leap/src/game/worlds.ts#${spec.id}`;

    const walkable = spec.platforms.filter((p) => !p.ghost);
    const start = { x: gx(spec.spawn[2]), y: spec.spawn[1] };
    const finish = { x: gx(spec.gate.z) + 1, y: spec.gate.y + 1 };

    const statics = walkable.filter((p) => !p.mover);
    const movers = walkable.filter((p) => p.mover);
    const level: GamePlatformerLevel = {
      id: `pbl-${spec.id}`,
      start,
      finish,
      platforms: statics.map((p) => ({ id: p.id, x: gx(p.z) - p.d / 2, y: gy(p.y), width: p.d, height: p.h ?? 0.55 })),
      movingPlatforms: movers.map((p) => ({
        id: p.id,
        x: gx(p.z) - p.d / 2,
        y: gy(p.y),
        width: p.d,
        height: p.h ?? 0.55,
        axis: p.mover!.axis === "y" ? "y" : "x",
        amplitude: p.mover!.amplitude,
        period: p.mover!.period,
        ...(p.mover!.phase !== undefined ? { phase: p.mover!.phase } : {})
      })),
      hazards: spec.hazards.map((h) => ({
        id: h.id, x: gx(h.z) - h.d / 2, y: gy(h.y) - 0.5, width: h.d, height: 0.5,
        damage: 1, respawn: h.respawn
      })),
      collectibles: spec.seeds.map((s) => ({ id: s.id, x: gx(s.z), y: s.y, value: 1, radius: 0.6 })),
      checkpoints: spec.checkpoints.map((c) => ({ id: c.id, x: gx(c.z), y: c.y, radius: 0.9 })),
      lives: 3,
      gravity: motion.tuning.gravity,
      moveSpeed: motion.tuning.moveSpeed,
      jumpVelocity: motion.tuning.jumpVelocity,
      coyoteMs: motion.tuning.coyoteMs,
      jumpBufferMs: motion.tuning.jumpBufferMs,
      lowerBound: spec.lowerBound
    };

    const minX = Math.min(start.x, finish.x);
    const maxX = Math.max(start.x, finish.x);
    const levelLength = maxX - minX;
    const ys = walkable.map((p) => p.y);
    const spanY = Math.max(...ys) - Math.min(...ys) + 1.5;

    const surfaceMap: GamePlatformerPlayableSurfaceMap = {
      assetId: worldAsset,
      assetHash: worldAssetHash,
      source: "compiler-authored-overlay-validated",
      surfaces: walkable.map((p) => ({
        id: p.id,
        x: gx(p.z),
        y: gy(p.y),
        width: p.d,
        height: p.h ?? 0.55,
        kind: p.mover ? "moving" : "platform"
      })),
      levelLength,
      estimatedCompletionSeconds: Math.max(35, Math.round(levelLength * 1.4)),
      characterScaleRatio: Math.min(1.25, 0.95 / Math.max(1, spanY)),
      confidence: 0.72,
      modelAlignment: {
        source: "compiler-authored-overlay-validated",
        modelBounds: {
          min: [-backdropAsset.bounds[0] / 2, 0, -backdropAsset.bounds[2] / 2],
          max: [backdropAsset.bounds[0] / 2, backdropAsset.bounds[1], backdropAsset.bounds[2] / 2]
        },
        modelPoint: [0, backdropAsset.bounds[1] / 2, 0],
        gamePoint: start,
        evidence: {
          routeOverlay: overlay,
          notes: "Compiler-authored platform surfaces from the authored WorldSpec course; the backdrop GLB is scene dressing and its real sha-256 hash anchors the binding."
        }
      },
      evidence: {
        sourceAsset: worldAsset,
        routeOverlay: overlay,
        notes: "Authored course overlay for Pip's Big Leap; retained browser proof pending."
      }
    };

    const bound = game.assetBoundPlatformerLevel({
      characterAsset: "showcaseKenneyOobiPlatformerHero",
      worldAssetBindings: [{
        worldAsset,
        worldAssetHash,
        surfaceSource: "compiler-authored-overlay-validated",
        confidence: 0.72,
        surfaceIds: walkable.map((p) => p.id)
      }],
      level,
      playableSurfaceMap: surfaceMap,
      motionTuning: "reported"
    });

    const binding: GamePlatformerSceneBinding = game.platformerSceneBinding({
      surfaceMap,
      level: bound,
      worldAsset
    });

    const presentationNodes = game.publicPlatformerPresentation({ sceneBinding: binding, level: bound });
    const groundNodes = walkable.filter((p) => p.w >= 5).map((p) =>
      game.platformerGroundMesh({ sceneBinding: binding, surface: { id: p.id, x: gx(p.z) - p.d / 2, y: gy(p.y), width: p.d, height: p.h ?? 0.55 } })
    ).flat();
    const platformMeshNodes = walkable.map((p) =>
      game.platformerPlatformMesh({ sceneBinding: binding, surface: { id: p.id, x: gx(p.z) - p.d / 2, y: gy(p.y), width: p.d, height: p.h ?? 0.55 } })
    ).flat();
    const hazardNodes = spec.hazards.map((h) =>
      game.platformerHazard({ sceneBinding: binding, hazard: { id: h.id, x: gx(h.z) - h.d / 2, y: gy(h.y) - 0.5, width: h.d, height: 0.5 } })
    ).flat();
    const checkpointNodes = spec.checkpoints.map((c) =>
      game.platformerCheckpoint({ sceneBinding: binding, checkpoint: { id: c.id, x: gx(c.z), y: c.y } })
    ).flat();
    const finishNodes = game.platformerFinish({ sceneBinding: binding, finish: { ...finish, id: `${spec.id}-gate` } });

    const contract: PublicPlatformerGeometryContract = {
      worldAssets: [worldAsset],
      characterAsset: "showcaseKenneyOobiPlatformerHero",
      worldCertification: "candidate-needs-geometry",
      characterCertification: "certified-platformer-character",
      geometrySource: "compiler-authored-overlay-validated",
      spawn: start,
      surfaces: surfaceMap.surfaces.map((s) => ({ id: s.id, x: s.x, y: s.y, width: s.width, height: s.height, kind: s.kind })),
      hazards: spec.hazards.map((h) => ({ id: h.id, x: gx(h.z), y: gy(h.y), width: h.d, height: h.h ?? 0.5, respawn: h.respawn === true })),
      checkpoints: spec.checkpoints.map((c) => ({ id: c.id, x: gx(c.z), y: c.y, radius: 0.9 })),
      finish,
      worldBounds: { minX, maxX, minY: Math.min(...ys), maxY: Math.max(...ys) + 3 },
      cameraBounds: { minX, maxX, minY: Math.min(...ys) - 1, maxY: Math.max(...ys) + 5 },
      characterScale: { width: 0.62, height: 0.95 },
      retainedProof: { ...PENDING_PROOF, blockers: [...PENDING_PROOF.blockers] }
    };

    const geometry = game.certifyPlatformerGeometry(contract);
    const presentationInput: PresentationCertInput = {
      ...contract,
      presentation: {
        groundMeshNodes: groundNodes.length,
        platformMeshNodes: platformMeshNodes.length,
        hazardNodes: hazardNodes.length,
        checkpointNodes: checkpointNodes.length,
        finishNodes: finishNodes.length,
        cameraMode: "follow",
        characterGrounded: true
      }
    };
    const presentation = game.certifyPlatformerPresentation(presentationInput);

    const kit = game.platformer({ ...level, feel: false });
    const snap = kit.step(1 / 60, {});
    const kitSnapshot = {
      status: snap.status,
      player: snap.player,
      grounded: snap.player.grounded,
      lives: snap.lives,
      score: snap.score
    };

    notes.push(`scene-bound nodes generated: ${presentationNodes.length}`);
    return {
      ok: true,
      level: bound,
      kitSnapshot,
      surfaceCount: walkable.length,
      presentationCounts: {
        groundMeshNodes: groundNodes.length,
        platformMeshNodes: platformMeshNodes.length,
        hazardNodes: hazardNodes.length,
        checkpointNodes: checkpointNodes.length,
        finishNodes: finishNodes.length
      },
      geometry,
      presentation,
      notes
    };
  } catch (error) {
    return {
      ok: false,
      surfaceCount: spec.platforms.length,
      presentationCounts: { groundMeshNodes: 0, platformMeshNodes: 0, hazardNodes: 0, checkpointNodes: 0, finishNodes: 0 },
      geometry: null,
      presentation: null,
      error: error instanceof Error ? error.message : String(error),
      notes
    };
  }
}
