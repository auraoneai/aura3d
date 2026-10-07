// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraSceneNode, AuraRacingPresentationTrackOptions, AuraRacingRoadMeshOptions, AuraRacingCheckpointGateOptions, AuraRacingStartFinishOptions, AuraPublicRacingPresentationOptions, AuraRacingPresentationCertificationInput, AuraPublicPlatformerPresentationOptions, AuraPlatformerSurfaceMeshOptions, AuraPlatformerHazardOptions, AuraPlatformerCheckpointOptions, AuraPlatformerFinishOptions } from "../types.js";
import type { GameAssetBoundRacingRoute } from "../../GameGenreKits";
import type { GameRacingCameraRigOptions, GameScenePresentationCameraSpec, GameRacingSceneBinding } from "../../GameSceneGeometryBindings";
import type { PublicGameGeometryCertification } from "../../PublicGameGeometry";
import { camera } from "../camera.js";
import { certifyPublicRacingGeometry } from "../../PublicGameGeometry";
import { material } from "../material.js";
import { primitives } from "../primitives.js";
import { scene } from "../scene.js";
import { round } from "../../GameRuntime.js";
import type { GamePlatformerPresentationCameraOptions } from "../../GameSceneGeometryBindings.js";
import { createGamePlatformerPresentationCamera } from "../../GameSceneGeometryBindings.js";
import { certifyPublicPlatformerGeometry } from "../../PublicGameGeometry.js";
import type { AuraPlatformerPresentationCertificationInput, AuraPlatformerPresentationSurfaceOptions } from "../types.js";

type AuraGamePresentationVec3 = readonly [number, number, number];

export function createGameRacingRoadMeshNodes(options: AuraRacingRoadMeshOptions): readonly AuraSceneNode[] {
  const mode = options.mode ?? "standalone";
  const routePoints = racingPresentationRoutePoints(options.sceneBinding, options.route, options.roadY);
  if (routePoints.length < 2) return [];
  const isCircuitStage = mode === "game-circuit";
  const roadWidth = racingPresentationRoadWidth(options.sceneBinding, options.route, mode);
  const markingVisibility = options.markingVisibility ?? "full";
  const nodes: AuraSceneNode[] = [];
  const includeTerrain = options.includeTerrain ?? (mode === "standalone" || isCircuitStage);
  if (includeTerrain && mode !== "asset-overlay") {
    const terrainPaddingScale = options.terrainPaddingScale ?? (isCircuitStage ? 4.5 : 3.2);
    const bounds = boundsForPresentationPoints(routePoints, roadWidth * terrainPaddingScale);
    nodes.push(
      primitives.box({
        name: "scene-bound racing terrain pad",
        material: material.pbr({ color: options.terrainColor ?? (isCircuitStage ? "#1f342e" : "#263b35"), roughness: 0.92, metallic: 0 })
      })
        .position(bounds.centerX, -0.032, bounds.centerZ)
        .scale([bounds.width, 0.035, bounds.depth])
        .toJSON()
    );
    if (isCircuitStage) {
      nodes.push(
        primitives.box({
          name: "scene-bound racing pit lane apron",
          material: material.pbr({ color: options.pitLaneColor ?? "#121c1e", roughness: 0.86, metallic: 0 })
        })
          .position(roundGamePresentation(bounds.centerX - bounds.width * 0.12), 0.002, roundGamePresentation(bounds.centerZ + bounds.depth * 0.23))
          .rotate(0, -0.16, 0)
          .scale([Math.max(0.8, bounds.width * 0.42), 0.026, roadWidth * 0.58])
          .toJSON()
      );
    }
  }

  for (let index = 0; index < routePoints.length - 1; index += 1) {
    const start = routePoints[index];
    const end = routePoints[index + 1];
    if (!start || !end) continue;
    const segment = segmentPresentation(start, end);
    if (segment.length <= 0.02) continue;
    if (mode === "asset-overlay") {
      nodes.push(
        primitives.box({
          name: `asset-bound racing topology line ${index + 1}`,
          material: material.emissive({
            color: options.laneColor ?? "#d8f6ff",
            emissive: options.laneColor ?? "#8df4ff",
            emissiveIntensity: 0.48,
            roughness: 0.42
          })
        })
          .position(segment.midX, segment.midY + 0.038, segment.midZ)
          .rotate(0, -segment.angle, 0)
          .scale([Math.max(0.06, segment.length * 0.68), 0.008, 0.014])
          .toJSON()
      );
      continue;
    }
    const sideX = -Math.sin(segment.angle);
    const sideZ = Math.cos(segment.angle);
    const y = segment.midY;
    nodes.push(
      primitives.box({
        name: `scene-bound racing road segment ${index + 1}`,
        material: material.pbr({ color: options.roadColor ?? (isCircuitStage ? "#11191d" : "#343b3f"), roughness: 0.82, metallic: 0 })
      })
        .position(segment.midX, y, segment.midZ)
        .rotate(0, -segment.angle, 0)
        .scale([segment.length + roadWidth * 0.44, 0.028, roadWidth])
        .toJSON()
    );
    if (markingVisibility === "none") continue;
    const isSubtleMark = markingVisibility === "subtle";
    if (!isSubtleMark || index % 3 === 0) {
      nodes.push(
        primitives.box({
          name: `scene-bound racing center stripe ${index + 1}`,
          material: material.emissive({
            color: options.laneColor ?? "#d8f6ff",
            emissive: options.laneColor ?? "#8df4ff",
            emissiveIntensity: isSubtleMark ? 0.34 : 0.7,
            roughness: 0.4
          })
        })
          .position(segment.midX, y + 0.022, segment.midZ)
          .rotate(0, -segment.angle, 0)
          .scale([Math.max(0.08, segment.length * (isCircuitStage ? 0.28 : 0.72)), 0.009, 0.01])
          .toJSON()
      );
    }
    if (!isSubtleMark || index % 4 === 0) {
      nodes.push(
        primitives.box({
          name: `scene-bound racing left curb ${index + 1}`,
          material: material.pbr({ color: index % 2 === 0 ? "#d4ded8" : options.curbColor ?? "#df3550", roughness: 0.66 })
        })
          .position(roundGamePresentation(segment.midX + sideX * roadWidth * 0.54), y + 0.024, roundGamePresentation(segment.midZ + sideZ * roadWidth * 0.54))
          .rotate(0, -segment.angle, 0)
          .scale([Math.max(0.08, segment.length * 0.38), 0.012, 0.016])
          .toJSON(),
        primitives.box({
          name: `scene-bound racing right curb ${index + 1}`,
          material: material.pbr({ color: index % 2 === 0 ? options.curbColor ?? "#df3550" : "#d4ded8", roughness: 0.66 })
        })
          .position(roundGamePresentation(segment.midX - sideX * roadWidth * 0.54), y + 0.024, roundGamePresentation(segment.midZ - sideZ * roadWidth * 0.54))
          .rotate(0, -segment.angle, 0)
          .scale([Math.max(0.08, segment.length * 0.38), 0.012, 0.016])
          .toJSON()
      );
    }
    if (isCircuitStage && (!isSubtleMark || index % 2 === 0)) {
      const railLength = Math.max(0.1, segment.length * (isSubtleMark ? 0.5 : 0.64));
      nodes.push(
        primitives.box({
          name: `scene-bound racing left guardrail ${index + 1}`,
          material: material.pbr({ color: "#141d20", roughness: 0.74, metallic: 0 })
        })
          .position(roundGamePresentation(segment.midX + sideX * roadWidth * 0.62), y + 0.034, roundGamePresentation(segment.midZ + sideZ * roadWidth * 0.62))
          .rotate(0, -segment.angle, 0)
          .scale([railLength, 0.018, 0.014])
          .toJSON(),
        primitives.box({
          name: `scene-bound racing right guardrail ${index + 1}`,
          material: material.pbr({ color: "#141d20", roughness: 0.74, metallic: 0 })
        })
          .position(roundGamePresentation(segment.midX - sideX * roadWidth * 0.62), y + 0.034, roundGamePresentation(segment.midZ - sideZ * roadWidth * 0.62))
          .rotate(0, -segment.angle, 0)
          .scale([railLength, 0.018, 0.014])
          .toJSON()
      );
    }
  }

  return nodes;
}

export function createGameRacingCheckpointGateNodes(options: AuraRacingCheckpointGateOptions): readonly AuraSceneNode[] {
  const mode = options.mode ?? "scene-bound";
  const sample = racingPresentationSceneSample(options.sceneBinding, options.route, options.progress, options.roadY);
  if (!sample) return [];
  const roadWidth = options.roadWidth ?? racingPresentationRoadWidth(options.sceneBinding, options.route, "game-circuit");
  const label = options.index === undefined ? "racing checkpoint gate" : `racing checkpoint gate ${options.index + 1}`;
  const sideX = -Math.sin(sample.angle);
  const sideZ = Math.cos(sample.angle);
  const crossAngle = -sample.angle + Math.PI / 2;
  const prefix = mode === "asset-bound" ? "asset-bound" : "scene-bound";
  if (mode === "asset-bound") {
    return [
      primitives.box({
        name: `${prefix} ${label}`,
        material: material.emissive({ color: options.gateColor ?? "#f8f1bf", emissive: options.accentColor ?? "#f6e27a", emissiveIntensity: 0.38, roughness: 0.46 })
      })
        .position(sample.point[0], sample.point[1] + 0.045, sample.point[2])
        .rotate(0, crossAngle, 0)
        .scale([roadWidth * 0.9, 0.01, 0.026])
        .toJSON()
    ];
  }

  const postOffset = roadWidth * 0.72;
  const bannerY = sample.point[1] + 0.096;
  const lightY = sample.point[1] + 0.072;
  const leftX = roundGamePresentation(sample.point[0] + sideX * postOffset);
  const leftZ = roundGamePresentation(sample.point[2] + sideZ * postOffset);
  const rightX = roundGamePresentation(sample.point[0] - sideX * postOffset);
  const rightZ = roundGamePresentation(sample.point[2] - sideZ * postOffset);
  const bannerX = roundGamePresentation(sample.point[0] + sideX * roadWidth * 0.76);
  const bannerZ = roundGamePresentation(sample.point[2] + sideZ * roadWidth * 0.76);
  return [
    primitives.box({
      name: `${prefix} ${label} left post`,
      material: material.metal({ color: options.gateColor ?? "#26373a", roughness: 0.5, metallic: 0.28 })
    })
      .position(leftX, sample.point[1] + 0.041, leftZ)
      .scale([0.028, 0.082, 0.028])
      .toJSON(),
    primitives.box({
      name: `${prefix} ${label} right post`,
      material: material.metal({ color: options.gateColor ?? "#26373a", roughness: 0.5, metallic: 0.28 })
    })
      .position(rightX, sample.point[1] + 0.041, rightZ)
      .scale([0.028, 0.082, 0.028])
      .toJSON(),
    primitives.box({
      name: `${prefix} ${label} overhead banner`,
      material: material.emissive({
        color: options.accentColor ?? "#b66d33",
        emissive: options.accentColor ?? "#d88f4a",
        emissiveIntensity: 0.16,
        roughness: 0.42
      })
    })
      .position(bannerX, bannerY, bannerZ)
      .rotate(0, crossAngle, 0)
      .scale([roadWidth * 0.26, 0.024, 0.024])
      .toJSON(),
    primitives.sphere({
      name: `${prefix} ${label} left signal light`,
      material: material.emissive({ color: options.lightColor ?? "#7ee8c4", emissive: options.lightColor ?? "#7ee8c4", emissiveIntensity: 0.64, roughness: 0.32 })
    })
      .position(roundGamePresentation(sample.point[0] + sideX * roadWidth * 0.2), lightY, roundGamePresentation(sample.point[2] + sideZ * roadWidth * 0.2))
      .scale(0.018)
      .toJSON(),
    primitives.sphere({
      name: `${prefix} ${label} right signal light`,
      material: material.emissive({ color: options.lightColor ?? "#7ee8c4", emissive: options.lightColor ?? "#7ee8c4", emissiveIntensity: 0.64, roughness: 0.32 })
    })
      .position(roundGamePresentation(sample.point[0] - sideX * roadWidth * 0.2), lightY, roundGamePresentation(sample.point[2] - sideZ * roadWidth * 0.2))
      .scale(0.018)
      .toJSON(),
    primitives.cylinder({
      name: `${prefix} ${label} left cone marker`,
      material: material.emissive({ color: options.accentColor ?? "#c78344", emissive: options.accentColor ?? "#c78344", emissiveIntensity: 0.26, roughness: 0.52 })
    })
      .position(roundGamePresentation(sample.point[0] + sideX * roadWidth * 0.78), sample.point[1] + 0.034, roundGamePresentation(sample.point[2] + sideZ * roadWidth * 0.78))
      .scale([0.038, 0.068, 0.038])
      .toJSON(),
    primitives.cylinder({
      name: `${prefix} ${label} right cone marker`,
      material: material.emissive({ color: options.accentColor ?? "#c78344", emissive: options.accentColor ?? "#c78344", emissiveIntensity: 0.26, roughness: 0.52 })
    })
      .position(roundGamePresentation(sample.point[0] - sideX * roadWidth * 0.78), sample.point[1] + 0.034, roundGamePresentation(sample.point[2] - sideZ * roadWidth * 0.78))
      .scale([0.038, 0.068, 0.038])
      .toJSON()
  ];
}

export function createGameRacingStartFinishNodes(options: AuraRacingStartFinishOptions): readonly AuraSceneNode[] {
  const mode = options.mode ?? "scene-bound";
  const sample = racingPresentationSceneSample(options.sceneBinding, options.route, 0, options.roadY);
  if (!sample) return [];
  const roadWidth = options.roadWidth ?? racingPresentationRoadWidth(options.sceneBinding, options.route, "game-circuit");
  const crossAngle = -sample.angle + Math.PI / 2;
  const prefix = mode === "asset-bound" ? "asset-bound" : "scene-bound";
  if (mode === "asset-bound") {
    return [
      primitives.box({
        name: `${prefix} racing start finish band`,
        material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.36, roughness: 0.3 })
      })
        .position(sample.point[0], sample.point[1] + 0.052, sample.point[2])
        .rotate(0, crossAngle, 0)
        .scale([roadWidth * 1.05, 0.01, 0.035])
        .toJSON()
    ];
  }

  const nodes: AuraSceneNode[] = [];
  const sideX = -Math.sin(sample.angle);
  const sideZ = Math.cos(sample.angle);
  const forwardX = Math.cos(sample.angle);
  const forwardZ = Math.sin(sample.angle);
  nodes.push(
    primitives.box({
      name: "scene-bound racing start grid vehicle pad",
      material: material.pbr({ color: options.checkerColorB ?? "#0d1416", roughness: 0.78, metallic: 0 })
    })
      .position(
        roundGamePresentation(sample.point[0] - forwardX * roadWidth * 0.1),
        sample.point[1] + 0.028,
        roundGamePresentation(sample.point[2] - forwardZ * roadWidth * 0.1)
      )
      .rotate(0, crossAngle, 0)
      .scale([roadWidth * 1.08, 0.01, roadWidth * 0.78])
      .toJSON(),
    primitives.box({
      name: "scene-bound racing start finish light strip",
      material: material.emissive({ color: options.lightColor ?? "#86e391", emissive: options.lightColor ?? "#86e391", emissiveIntensity: 0.48, roughness: 0.38 })
    })
      .position(sample.point[0], sample.point[1] + 0.047, sample.point[2])
      .rotate(0, crossAngle, 0)
      .scale([roadWidth * 0.86, 0.012, 0.028])
      .toJSON()
  );
  const tileCount = 10;
  for (let tile = 0; tile < tileCount; tile += 1) {
    const laneOffset = ((tile + 0.5) / tileCount - 0.5) * roadWidth * 1.18;
    nodes.push(
      primitives.box({
        name: `scene-bound racing start finish checker ${tile + 1}`,
        material: material.pbr({ color: tile % 2 === 0 ? options.checkerColorA ?? "#d4ded8" : options.checkerColorB ?? "#0d1416", roughness: 0.52, metallic: 0 })
      })
        .position(roundGamePresentation(sample.point[0] + sideX * laneOffset), sample.point[1] + 0.04, roundGamePresentation(sample.point[2] + sideZ * laneOffset))
        .rotate(0, crossAngle, 0)
        .scale([roadWidth / tileCount, 0.014, 0.07])
        .toJSON()
    );
  }

  const postOffset = roadWidth * 0.68;
  const leftX = roundGamePresentation(sample.point[0] + sideX * postOffset);
  const leftZ = roundGamePresentation(sample.point[2] + sideZ * postOffset);
  const rightX = roundGamePresentation(sample.point[0] - sideX * postOffset);
  const rightZ = roundGamePresentation(sample.point[2] - sideZ * postOffset);
  const bannerX = roundGamePresentation(sample.point[0] + sideX * roadWidth * 0.84);
  const bannerZ = roundGamePresentation(sample.point[2] + sideZ * roadWidth * 0.84);
  nodes.push(
    primitives.box({
      name: "scene-bound racing launch grid bright marker",
      material: material.emissive({ color: options.checkerColorA ?? "#718980", emissive: options.lightColor ?? "#86e391", emissiveIntensity: 0.16, roughness: 0.44 })
    })
      .position(roundGamePresentation(sample.point[0] - forwardX * roadWidth * 0.28), sample.point[1] + 0.038, roundGamePresentation(sample.point[2] - forwardZ * roadWidth * 0.28))
      .rotate(0, crossAngle, 0)
      .scale([roadWidth * 0.44, 0.012, 0.05])
      .toJSON(),
    primitives.box({
      name: "scene-bound racing launch grid dark marker",
      material: material.pbr({ color: options.checkerColorB ?? "#0d1416", roughness: 0.52, metallic: 0 })
    })
      .position(roundGamePresentation(sample.point[0] - forwardX * roadWidth * 0.42), sample.point[1] + 0.039, roundGamePresentation(sample.point[2] - forwardZ * roadWidth * 0.42))
      .rotate(0, crossAngle, 0)
      .scale([roadWidth * 0.44, 0.012, 0.05])
      .toJSON(),
    primitives.sphere({
      name: "scene-bound racing start left lane signal",
      material: material.emissive({ color: options.lightColor ?? "#86e391", emissive: options.lightColor ?? "#86e391", emissiveIntensity: 0.72, roughness: 0.32 })
    })
      .position(
        roundGamePresentation(sample.point[0] + sideX * roadWidth * 0.34 - forwardX * roadWidth * 0.2),
        sample.point[1] + 0.06,
        roundGamePresentation(sample.point[2] + sideZ * roadWidth * 0.34 - forwardZ * roadWidth * 0.2)
      )
      .scale(0.036)
      .toJSON(),
    primitives.sphere({
      name: "scene-bound racing start right lane signal",
      material: material.emissive({ color: options.lightColor ?? "#86e391", emissive: options.lightColor ?? "#86e391", emissiveIntensity: 0.72, roughness: 0.32 })
    })
      .position(
        roundGamePresentation(sample.point[0] - sideX * roadWidth * 0.34 - forwardX * roadWidth * 0.2),
        sample.point[1] + 0.06,
        roundGamePresentation(sample.point[2] - sideZ * roadWidth * 0.34 - forwardZ * roadWidth * 0.2)
      )
      .scale(0.036)
      .toJSON(),
    primitives.box({
      name: "scene-bound racing start gantry left post",
      material: material.metal({ color: options.gantryColor ?? "#26373a", roughness: 0.5, metallic: 0.28 })
    })
      .position(leftX, sample.point[1] + 0.064, leftZ)
      .scale([0.032, 0.128, 0.032])
      .toJSON(),
    primitives.box({
      name: "scene-bound racing start gantry right post",
      material: material.metal({ color: options.gantryColor ?? "#26373a", roughness: 0.5, metallic: 0.28 })
    })
      .position(rightX, sample.point[1] + 0.064, rightZ)
      .scale([0.032, 0.128, 0.032])
      .toJSON(),
    primitives.box({
      name: "scene-bound racing start finish gantry banner",
      material: material.emissive({ color: options.gantryColor ?? "#2c4243", emissive: options.lightColor ?? "#86e391", emissiveIntensity: 0.12, roughness: 0.42 })
    })
      .position(bannerX, sample.point[1] + 0.138, bannerZ)
      .rotate(0, crossAngle, 0)
      .scale([roadWidth * 0.34, 0.034, 0.034])
      .toJSON(),
    primitives.sphere({
      name: "scene-bound racing start green light",
      material: material.emissive({ color: options.lightColor ?? "#86e391", emissive: options.lightColor ?? "#86e391", emissiveIntensity: 0.72, roughness: 0.32 })
    })
      .position(roundGamePresentation(sample.point[0] - sideX * roadWidth * 0.84), sample.point[1] + 0.156, roundGamePresentation(sample.point[2] - sideZ * roadWidth * 0.84))
      .scale(0.023)
      .toJSON()
  );
  return nodes;
}

export function createGamePublicRacingPresentationNodes(options: AuraPublicRacingPresentationOptions): readonly AuraSceneNode[] {
  const mode = "game-circuit";
  const roadWidth = racingPresentationRoadWidth(options.sceneBinding, options.route, mode);
  const nodes: AuraSceneNode[] = [
    ...createGameRacingRoadMeshNodes({ ...options, mode, includeTerrain: options.includeTerrain ?? true })
  ];
  for (const [index, progress] of (options.route.checkpoints ?? []).entries()) {
    nodes.push(...createGameRacingCheckpointGateNodes({
      sceneBinding: options.sceneBinding,
      route: options.route,
      progress,
      index,
      roadY: options.roadY,
      roadWidth,
      gateColor: options.checkpointColor,
      accentColor: options.checkpointAccentColor,
      lightColor: options.startLightColor
    }));
  }
  nodes.push(...createGameRacingStartFinishNodes({
    sceneBinding: options.sceneBinding,
    route: options.route,
    roadY: options.roadY,
    roadWidth,
    lightColor: options.startLightColor
  }));
  return nodes;
}

export function createGameRacingTopDownCamera(options: GameRacingCameraRigOptions): GameScenePresentationCameraSpec {
  const pose = options.sceneBinding.toScenePose(options.focus);
  const distance = Math.max(0.1, options.distance ?? 4.2);
  const height = Math.max(0.1, options.height ?? 3.2);
  const sideOffset = options.sideOffset ?? 0;
  const lookAhead = Math.max(0, options.lookAhead ?? 0.5);
  const forwardX = Math.cos(pose.heading);
  const forwardZ = Math.sin(pose.heading);
  const targetOffset: readonly [number, number, number] = [
    Number((forwardX * lookAhead).toFixed(4)),
    0.18,
    Number((forwardZ * lookAhead).toFixed(4))
  ];
  if (options.targetNode) {
    return {
      mode: "follow",
      targetNode: options.targetNode,
      offset: [sideOffset, height, distance],
      targetOffset,
      offsetMode: "scene",
      target: [0, 0.2, 0],
      distance,
      fov: options.fov ?? 46,
      smoothing: 0.045,
      subjectEmphasis: 0.82
    };
  }
  return {
    mode: "perspective",
    position: [
      Number((pose.position[0] + sideOffset).toFixed(4)),
      Number((pose.position[1] + height).toFixed(4)),
      Number((pose.position[2] + distance).toFixed(4))
    ],
    target: [
      Number((pose.position[0] + targetOffset[0]).toFixed(4)),
      Number((pose.position[1] + targetOffset[1]).toFixed(4)),
      Number((pose.position[2] + targetOffset[2]).toFixed(4))
    ],
    fov: options.fov ?? 46,
    smoothing: 0.045,
    subjectEmphasis: 0.82
  };
}

export function certifyPublicRacingPresentation(input: AuraRacingPresentationCertificationInput): PublicGameGeometryCertification {
  const base = certifyPublicRacingGeometry(input);
  const blockers = [...base.blockers];
  const presentation = input.presentation;
  if (!presentation) {
    blockers.push("racing:presentation-missing");
  } else {
    if ((presentation.roadMeshNodes ?? 0) < 8) blockers.push(`racing:presentation-road-mesh-too-small:${presentation.roadMeshNodes ?? 0}`);
    if ((presentation.checkpointGateNodes ?? 0) < input.checkpoints.length) {
      blockers.push(`racing:presentation-checkpoint-gates-too-few:${presentation.checkpointGateNodes ?? 0}`);
    }
    if ((presentation.startFinishNodes ?? 0) < 4) blockers.push(`racing:presentation-start-finish-too-small:${presentation.startFinishNodes ?? 0}`);
    if (presentation.cameraMode !== "follow" && presentation.cameraMode !== "perspective") {
      blockers.push(`racing:presentation-camera-not-racing:${presentation.cameraMode ?? "missing"}`);
    }
    if ((presentation.debugMarkerCount ?? 0) > 0) blockers.push(`racing:presentation-debug-markers:${presentation.debugMarkerCount}`);
  }
  return {
    ...base,
    publicReady: blockers.length === 0,
    blockers
  };
}

export function createGameRacingPresentationTrackNodes(options: AuraRacingPresentationTrackOptions): readonly AuraSceneNode[] {
  const mode = options.mode ?? "standalone";
  const guideVisibility = options.guideVisibility ?? (mode === "asset-overlay" ? "evidence" : "full");
  if (mode === "asset-overlay" && guideVisibility === "public") return [];
  const roadWidth = racingPresentationRoadWidth(options.sceneBinding, options.route, mode);
  const nodes: AuraSceneNode[] = [...createGameRacingRoadMeshNodes(options)];
  if (mode === "asset-overlay") {
    for (const [index, progress] of (options.route.checkpoints ?? []).entries()) {
      nodes.push(...createGameRacingCheckpointGateNodes({
        sceneBinding: options.sceneBinding,
        route: options.route,
        progress,
        index,
        mode: "asset-bound",
        roadY: options.roadY,
        roadWidth,
        gateColor: options.laneColor,
        accentColor: options.laneColor
      }));
    }
    nodes.push(...createGameRacingStartFinishNodes({
      sceneBinding: options.sceneBinding,
      route: options.route,
      mode: "asset-bound",
      roadY: options.roadY,
      roadWidth
    }));
    return nodes;
  }

  if (guideVisibility === "evidence" || guideVisibility === "full") {
    for (const [index, progress] of (options.route.checkpoints ?? []).entries()) {
      nodes.push(...createGameRacingCheckpointGateNodes({
        sceneBinding: options.sceneBinding,
        route: options.route,
        progress,
        index,
        roadY: options.roadY,
        roadWidth,
        gateColor: options.laneColor,
        accentColor: options.laneColor
      }));
    }
    nodes.push(...createGameRacingStartFinishNodes({
      sceneBinding: options.sceneBinding,
      route: options.route,
      roadY: options.roadY,
      roadWidth,
      lightColor: options.laneColor
    }));
  }

  return nodes;
}

export function createGamePublicPlatformerPresentationNodes(options: AuraPublicPlatformerPresentationOptions): readonly AuraSceneNode[] {
  return createGamePlatformerPresentationSurfaceNodes({
    ...options,
    mode: "game-level",
    guideVisibility: "public"
  });
}

export function createGamePlatformerGroundMeshNodes(options: AuraPlatformerSurfaceMeshOptions): readonly AuraSceneNode[] {
  return createSinglePlatformerSurfaceMeshNodes("ground", options);
}

export function createGamePlatformerPlatformMeshNodes(options: AuraPlatformerSurfaceMeshOptions): readonly AuraSceneNode[] {
  return createSinglePlatformerSurfaceMeshNodes("platform", options);
}

export function createGamePlatformerHazardNodes(options: AuraPlatformerHazardOptions): readonly AuraSceneNode[] {
  const mode = options.mode ?? "game-level";
  const isGameLevel = mode === "game-level";
  const rect = options.sceneBinding.surfaceToSceneRect(options.hazard);
  return [
    primitives.box({
      name: `scene-bound platformer hazard ${options.hazard.id}`,
      material: material.emissive({
        color: options.color ?? "#ff6b6b",
        emissive: options.color ?? "#ff6b6b",
        emissiveIntensity: isGameLevel ? 0.7 : 0.54,
        roughness: 0.36
      })
    })
      .position(rect.center[0], rect.center[1], rect.center[2] + (isGameLevel ? 0.39 : 0.31))
      .scale([Math.max(rect.size[0], 0.045), Math.max(rect.size[1], 0.045), 0.055])
      .toJSON()
  ];
}

export function createGamePlatformerCheckpointNodes(options: AuraPlatformerCheckpointOptions): readonly AuraSceneNode[] {
  const point = options.sceneBinding.toScenePoint(options.checkpoint, 0.02);
  return [
    primitives.box({
      name: `scene-bound platformer checkpoint ${options.checkpoint.id}`,
      material: material.emissive({
        color: options.color ?? "#d7f9ff",
        emissive: options.color ?? "#a6f4ff",
        emissiveIntensity: 0.48,
        roughness: 0.4
      })
    })
      .position(point[0], point[1], point[2] + 0.29)
      .scale([0.026, 0.22, 0.034])
      .toJSON()
  ];
}

export function createGamePlatformerFinishNodes(options: AuraPlatformerFinishOptions): readonly AuraSceneNode[] {
  const point = options.sceneBinding.toScenePoint(options.finish, 0.04);
  return [
    primitives.box({
      name: `scene-bound platformer finish marker${options.finish.id ? ` ${options.finish.id}` : ""}`,
      material: material.emissive({
        color: options.color ?? "#b6ffbd",
        emissive: options.color ?? "#83f58f",
        emissiveIntensity: 0.6,
        roughness: 0.42
      })
    })
      .position(point[0], point[1], point[2] + 0.34)
      .scale([0.06, 0.34, 0.05])
      .toJSON()
  ];
}

export function createGamePlatformerCameraRig(options: GamePlatformerPresentationCameraOptions): GameScenePresentationCameraSpec {
  return createGamePlatformerPresentationCamera(options);
}

export function certifyPublicPlatformerPresentation(input: AuraPlatformerPresentationCertificationInput): PublicGameGeometryCertification {
  const base = certifyPublicPlatformerGeometry(input);
  const blockers = [...base.blockers];
  const presentation = input.presentation;
  if (!presentation) {
    blockers.push("platformer:presentation-missing");
  } else {
    if ((presentation.groundMeshNodes ?? 0) < 2) blockers.push(`platformer:presentation-ground-mesh-too-small:${presentation.groundMeshNodes ?? 0}`);
    if ((presentation.platformMeshNodes ?? 0) < 6) blockers.push(`platformer:presentation-platform-mesh-too-small:${presentation.platformMeshNodes ?? 0}`);
    if ((presentation.hazardNodes ?? 0) < input.hazards.length) {
      blockers.push(`platformer:presentation-hazards-too-few:${presentation.hazardNodes ?? 0}`);
    }
    if ((presentation.checkpointNodes ?? 0) < input.checkpoints.length) {
      blockers.push(`platformer:presentation-checkpoints-too-few:${presentation.checkpointNodes ?? 0}`);
    }
    if ((presentation.finishNodes ?? 0) < 1) blockers.push(`platformer:presentation-finish-missing:${presentation.finishNodes ?? 0}`);
    if (presentation.cameraMode !== "follow" && presentation.cameraMode !== "perspective") {
      blockers.push(`platformer:presentation-camera-not-side-scroller:${presentation.cameraMode ?? "missing"}`);
    }
    if ((presentation.debugMarkerCount ?? 0) > 0) blockers.push(`platformer:presentation-debug-markers:${presentation.debugMarkerCount}`);
    if (presentation.characterGrounded !== true) blockers.push("platformer:presentation-character-not-grounded");
  }
  return {
    ...base,
    publicReady: blockers.length === 0,
    blockers
  };
}

export function createGamePlatformerPresentationSurfaceNodes(options: AuraPlatformerPresentationSurfaceOptions): readonly AuraSceneNode[] {
  const mode = options.mode ?? "standalone";
  const platforms = options.level.platforms ?? [];
  const guideVisibility = options.guideVisibility ?? (mode === "asset-overlay" ? "evidence" : "full");
  if (mode === "asset-overlay" && guideVisibility === "public") return [];
  const isGameLevel = mode === "game-level";
  const nodes: AuraSceneNode[] = [];
  if ((mode === "standalone" || mode === "game-level") && platforms.length > 0 && options.includeBackdrop !== false) {
    const rects = platforms.map((surface) => options.sceneBinding.surfaceToSceneRect(surface));
    const bounds = boundsForPresentationRects(rects, isGameLevel ? 0.78 : 0.42);
    nodes.push(
      primitives.box({
        name: "scene-bound platformer backdrop",
        material: material.pbr({ color: isGameLevel ? "#263d48" : "#314d59", roughness: 0.94, metallic: 0, opacity: isGameLevel ? 0.2 : 0.28 })
      })
        .position(bounds.centerX, bounds.centerY + (isGameLevel ? 0.18 : 0.08), bounds.backZ)
        .scale([bounds.width, Math.max(0.2, bounds.height * (isGameLevel ? 2.25 : 1.8)), 0.035])
        .toJSON()
    );
  }

  for (const surface of platforms) {
    const rect = options.sceneBinding.surfaceToSceneRect(surface);
    const width = Math.max(rect.size[0], 0.08);
    const height = Math.max(rect.size[1], 0.055);
    if (mode === "asset-overlay") {
      nodes.push(
        primitives.box({
          name: `asset-bound platformer contact strip ${surface.id}`,
          material: material.emissive({
            color: options.platformTrimColor ?? "#c9f7ff",
            emissive: options.platformTrimColor ?? "#a8f4ff",
            emissiveIntensity: 0.28,
            roughness: 0.44
          })
        })
          .position(rect.center[0], roundGamePresentation(rect.center[1] + height / 2 + 0.026), rect.center[2] + 0.24)
          .scale([width * 0.78, 0.012, 0.024])
          .toJSON()
      );
      continue;
    }
    nodes.push(
      primitives.box({
        name: `scene-bound platformer surface ${surface.id}`,
        material: material.pbr({ color: options.platformColor ?? (isGameLevel ? "#526972" : "#718994"), roughness: 0.72, metallic: 0 })
      })
        .position(rect.center[0], rect.center[1], rect.center[2])
        .scale([width, height, isGameLevel ? 0.64 : 0.5])
        .toJSON(),
      primitives.box({
        name: `scene-bound platformer surface trim ${surface.id}`,
        material: material.emissive({
          color: options.platformTrimColor ?? "#c9f7ff",
          emissive: options.platformTrimColor ?? "#a8f4ff",
          emissiveIntensity: 0.36,
          roughness: 0.38
        })
        })
        .position(rect.center[0], roundGamePresentation(rect.center[1] + height / 2 + 0.012), rect.center[2] + (isGameLevel ? 0.334 : 0.262))
        .scale([width * 0.92, 0.016, 0.035])
        .toJSON()
    );
  }

  for (const hazard of options.level.hazards ?? []) {
    const rect = options.sceneBinding.surfaceToSceneRect(hazard);
    nodes.push(
      primitives.box({
        name: `scene-bound platformer hazard ${hazard.id}`,
        material: material.emissive({
          color: options.hazardColor ?? "#ff6b6b",
          emissive: options.hazardColor ?? "#ff6b6b",
          emissiveIntensity: 0.7,
          roughness: 0.36
        })
      })
        .position(rect.center[0], rect.center[1], rect.center[2] + (isGameLevel ? 0.39 : 0.31))
        .scale([Math.max(rect.size[0], 0.045), Math.max(rect.size[1], 0.045), 0.055])
        .toJSON()
    );
  }

  for (const collectible of options.level.collectibles ?? []) {
    const point = options.sceneBinding.toScenePoint(collectible, 0.04);
    nodes.push(
      primitives.torus({
        name: `scene-bound platformer collectible ${collectible.id}`,
        material: material.emissive({
          color: options.collectibleColor ?? "#fff3a3",
          emissive: options.collectibleColor ?? "#f6dc67",
          emissiveIntensity: 0.62,
          roughness: 0.4
        })
      })
        .position(point[0], point[1], point[2] + (isGameLevel ? 0.26 : 0.16))
        .rotate(Math.PI / 2, 0, 0)
        .scale([0.11, 0.11, 0.028])
        .toJSON()
    );
  }

  for (const checkpoint of options.level.checkpoints ?? []) {
    const point = options.sceneBinding.toScenePoint(checkpoint, 0.02);
    nodes.push(
      primitives.box({
        name: `scene-bound platformer checkpoint ${checkpoint.id}`,
        material: material.emissive({
          color: options.checkpointColor ?? "#d7f9ff",
          emissive: options.checkpointColor ?? "#a6f4ff",
          emissiveIntensity: 0.48,
          roughness: 0.4
        })
      })
        .position(point[0], point[1], point[2] + (isGameLevel ? 0.29 : 0.19))
        .scale([0.026, 0.22, 0.034])
        .toJSON()
    );
  }

  if (options.level.finish) {
    const finish = options.sceneBinding.toScenePoint(options.level.finish, 0.04);
    nodes.push(
      primitives.box({
        name: "scene-bound platformer finish marker",
        material: material.emissive({
          color: options.finishColor ?? "#b6ffbd",
          emissive: options.finishColor ?? "#83f58f",
          emissiveIntensity: 0.6,
          roughness: 0.42
        })
      })
        .position(finish[0], finish[1], finish[2] + (isGameLevel ? 0.34 : 0.22))
        .scale([0.06, 0.34, 0.05])
        .toJSON()
    );
  }

  return nodes;
}

function createSinglePlatformerSurfaceMeshNodes(
  surfaceRole: "ground" | "platform",
  options: AuraPlatformerSurfaceMeshOptions
): readonly AuraSceneNode[] {
  const mode = options.mode ?? "game-level";
  const isGameLevel = mode === "game-level";
  const rect = options.sceneBinding.surfaceToSceneRect(options.surface);
  const width = Math.max(rect.size[0], 0.08);
  const height = Math.max(rect.size[1], 0.055);
  if (mode === "asset-bound") {
    return [
      primitives.box({
        name: `asset-bound platformer ${surfaceRole} contact strip ${options.surface.id}`,
        material: material.emissive({
          color: options.trimColor ?? "#c9f7ff",
          emissive: options.trimColor ?? "#a8f4ff",
          emissiveIntensity: 0.28,
          roughness: 0.44
        })
      })
        .position(rect.center[0], roundGamePresentation(rect.center[1] + height / 2 + 0.026), rect.center[2] + 0.24)
        .scale([width * 0.78, 0.012, 0.024])
        .toJSON()
    ];
  }
  return [
    primitives.box({
      name: `scene-bound platformer ${surfaceRole} mesh ${options.surface.id}`,
      material: material.pbr({
        color: options.color ?? (isGameLevel ? "#526972" : "#718994"),
        roughness: 0.72,
        metallic: 0
      })
    })
      .position(rect.center[0], rect.center[1], rect.center[2])
      .scale([width, height, isGameLevel ? 0.64 : 0.5])
      .toJSON(),
    primitives.box({
      name: `scene-bound platformer ${surfaceRole} trim ${options.surface.id}`,
      material: material.emissive({
        color: options.trimColor ?? "#c9f7ff",
        emissive: options.trimColor ?? "#a8f4ff",
        emissiveIntensity: 0.36,
        roughness: 0.38
      })
    })
      .position(rect.center[0], roundGamePresentation(rect.center[1] + height / 2 + 0.012), rect.center[2] + (isGameLevel ? 0.334 : 0.262))
      .scale([width * 0.92, 0.016, 0.035])
      .toJSON()
  ];
}

function boundsForPresentationPoints(points: readonly AuraGamePresentationVec3[], padding: number): {
  readonly centerX: number;
  readonly centerZ: number;
  readonly width: number;
  readonly depth: number;
} {
  const xs = points.map((point) => point[0]);
  const zs = points.map((point) => point[2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    centerX: roundGamePresentation((minX + maxX) / 2),
    centerZ: roundGamePresentation((minZ + maxZ) / 2),
    width: roundGamePresentation(Math.max(1.2, maxX - minX + padding)),
    depth: roundGamePresentation(Math.max(1.2, maxZ - minZ + padding))
  };
}

function boundsForPresentationRects(
  rects: readonly { readonly center: AuraGamePresentationVec3; readonly size: AuraGamePresentationVec3 }[],
  padding: number
): {
  readonly centerX: number;
  readonly centerY: number;
  readonly backZ: number;
  readonly width: number;
  readonly height: number;
} {
  const minX = Math.min(...rects.map((rect) => rect.center[0] - rect.size[0] / 2));
  const maxX = Math.max(...rects.map((rect) => rect.center[0] + rect.size[0] / 2));
  const minY = Math.min(...rects.map((rect) => rect.center[1] - rect.size[1] / 2));
  const maxY = Math.max(...rects.map((rect) => rect.center[1] + rect.size[1] / 2));
  const z = Math.min(...rects.map((rect) => rect.center[2]));
  return {
    centerX: roundGamePresentation((minX + maxX) / 2),
    centerY: roundGamePresentation((minY + maxY) / 2),
    backZ: roundGamePresentation(z - 0.22),
    width: roundGamePresentation(Math.max(1, maxX - minX + padding)),
    height: roundGamePresentation(Math.max(0.6, maxY - minY + padding))
  };
}

function segmentPresentation(start: AuraGamePresentationVec3, end: AuraGamePresentationVec3): {
  readonly midX: number;
  readonly midY: number;
  readonly midZ: number;
  readonly length: number;
  readonly angle: number;
} {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  return {
    midX: roundGamePresentation((start[0] + end[0]) / 2),
    midY: roundGamePresentation((start[1] + end[1]) / 2),
    midZ: roundGamePresentation((start[2] + end[2]) / 2),
    length: roundGamePresentation(Math.hypot(dx, dz)),
    angle: Math.atan2(dz, dx)
  };
}

function racingPresentationRoutePoints(
  sceneBinding: GameRacingSceneBinding,
  route: GameAssetBoundRacingRoute,
  roadY?: number
): readonly AuraGamePresentationVec3[] {
  return route.points.map((point) => sceneBinding.toScenePoint(point, roadY ?? 0.012));
}

function racingPresentationRoadWidth(
  sceneBinding: GameRacingSceneBinding,
  route: GameAssetBoundRacingRoute,
  mode: NonNullable<AuraRacingPresentationTrackOptions["mode"]>
): number {
  const isCircuitStage = mode === "game-circuit";
  return Math.max(
    (route.width ?? 0.18) * sceneBinding.transform.scale * (isCircuitStage ? 1.55 : 1.5),
    isCircuitStage ? 0.34 : 0.18
  );
}

function racingPresentationSceneSample(
  sceneBinding: GameRacingSceneBinding,
  route: GameAssetBoundRacingRoute,
  progress: number,
  roadY?: number
): { readonly point: AuraGamePresentationVec3; readonly angle: number } | undefined {
  const sample = racingPresentationRouteSample(route, progress);
  if (!sample) return undefined;
  return {
    point: sceneBinding.toScenePoint(sample.point, roadY ?? 0.012),
    angle: sample.angle
  };
}

function racingPresentationRouteSample(
  route: GameAssetBoundRacingRoute,
  progress: number
): { readonly point: { readonly x: number; readonly y: number }; readonly angle: number } | undefined {
  const points = route.points;
  if (points.length < 2) return undefined;
  const clamped = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  let totalLength = 0;
  const segmentLengths: number[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    segmentLengths[index] = length;
    totalLength += length;
  }
  if (totalLength <= 0) {
    const start = points[0];
    const end = points[1] ?? start;
    if (!start || !end) return undefined;
    return {
      point: start,
      angle: Math.atan2(end.y - start.y, end.x - start.x)
    };
  }
  const targetLength = clamped * totalLength;
  let traversed = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = segmentLengths[index] ?? 0;
    if (!start || !end || length <= 0) continue;
    if (targetLength <= traversed + length || index === points.length - 2) {
      const localT = Math.min(1, Math.max(0, (targetLength - traversed) / length));
      return {
        point: {
          x: start.x + (end.x - start.x) * localT,
          y: start.y + (end.y - start.y) * localT
        },
        angle: Math.atan2(end.y - start.y, end.x - start.x)
      };
    }
    traversed += length;
  }
  const last = points[points.length - 1];
  const previous = points[points.length - 2] ?? last;
  if (!last || !previous) return undefined;
  return {
    point: last,
    angle: Math.atan2(last.y - previous.y, last.x - previous.x)
  };
}

function roundGamePresentation(value: number): number {
  return Math.round(value * 1000) / 1000;
}
