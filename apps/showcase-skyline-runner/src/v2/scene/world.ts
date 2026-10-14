// apps/showcase-skyline-runner/src/v2/scene/world.ts — union scene for the
// skyline-runner v2 shell. Every node is mounted once at boot; act changes,
// lift motion and the runner are per-frame pose/visibility updates on runtime
// handles, so `loading.sceneSwaps === 0` across the whole course.
import { distanceLod, effects, game as engineGame, instances, material, model, primitives, text3D } from "@aura3d/engine";
import type { AuraNodeInput } from "@aura3d/engine";
import { assets } from "../../../../../src/aura-assets";
import { getSkylineActPalette, planSkylineActBackdrop } from "../../gameplay/act-palette";
import { planSkylineBackdropChunks, skylineBackdropLodSpec } from "../../gameplay/backdrop";
import {
  SKYLINE_ACT_GATES,
  SKYLINE_CHARACTER_HEIGHT,
  SKYLINE_DISTRICT_ANCHORS,
  SKYLINE_MOVING_PLATFORMS,
  SKYLINE_SENTRY_ENCOUNTERS
} from "../../gameplay/level";
import {
  planSkylineFoliage,
  planSkylineShardSparkles,
  skylineFoliageNodeId,
  skylineFoliageTint,
  skylineSparkleNodeId,
  skylineSparkleTint,
  type SkylineFoliagePlacement,
  type SkylineSparklePlacement
} from "../../legacy/foliage";
import { SKYLINE_VISUAL_LANGUAGE } from "../../legacy/visual-language";
import {
  GAMEPLAY_ACTOR_DEPTH,
  SKYLINE_RENDERED_CHARACTER_HEIGHT,
  collectibles,
  hazards,
  level,
  platformerScene,
  platforms
} from "./binding";
import { beaconMaterial, hazardMarkMaterial } from "./materials";

const horizonY = platformerScene.toScenePoint({ x: 0, y: 0 })[1];
const levelSpan = platforms.reduce<readonly [number, number]>(
  (span, surface) => [Math.min(span[0], surface.x), Math.max(span[1], surface.x + surface.width)],
  [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as const
);
const sceneSpan = [
  levelSpan[0] * platformerScene.transform.scale + platformerScene.transform.offsetX,
  levelSpan[1] * platformerScene.transform.scale + platformerScene.transform.offsetX
] as const;
/** Behind every composition layer and the world GLB: the painted band depth. */
export const FAR_BACKGROUND_DEPTH = -9.5;

function worldModelNode(): AuraNodeInput {
  return model(assets.showcaseKenneyVerdantPlatformerWorld, {
    name: "platformer-bound-level-one-world",
    role: "primaryWorld",
    castShadow: false,
    scaleMode: "fit",
    targetMaxDimension: platformerScene.worldModel.targetMaxDimension
  })
    .position(
      platformerScene.worldModel.position[0],
      platformerScene.worldModel.position[1],
      platformerScene.worldModel.position[2]
    )
    .rotate(
      platformerScene.worldModel.rotation[0],
      platformerScene.worldModel.rotation[1],
      platformerScene.worldModel.rotation[2]
    )
    .runtime(engineGame.runtimeNode("platformer-bound-level-one-world", {
      tags: ["world", "typed-primary-asset", "asset-surface-bound"]
    }));
}

function winterParallaxNode(): AuraNodeInput {
  return model(assets.skylineWinterParallaxBackdrop, {
    name: "winter dusk painted parallax",
    role: "setDressing",
    scaleMode: "fit",
    targetMaxDimension: 62,
    castShadow: false,
    receiveShadow: false
  })
    .position(-1.5, horizonY - 27, FAR_BACKGROUND_DEPTH - 0.6)
    .scale([1, 1.9, 1])
    .runtime(engineGame.runtimeNode("winter-dusk-parallax", {
      tags: ["typed-supporting-environment", "textured", "parallax", "non-colliding"]
    }));
}

function actBackdropNodes(actNodeIds: Record<number, string[]>): AuraNodeInput[] {
  return [0, 1, 2, 3, 4].flatMap((actIndex) => {
    const backdrop = planSkylineActBackdrop({
      actIndex,
      sceneSpan,
      horizonY,
      farBackgroundDepth: FAR_BACKGROUND_DEPTH
    });
    return backdrop.bandColors.map((band, bandIndex) => {
      const id = `skyline-act-${actIndex}-${band.side}-${bandIndex}`;
      (actNodeIds[actIndex] ??= []).push(id);
      return primitives.box({
        name: `skyline act-${actIndex} ${band.side} band ${bandIndex}`,
        material: material.emissive({
          name: `skyline v2 act-${actIndex} ${band.side} ${bandIndex}`,
          color: band.color,
          emissive: band.emissive,
          emissiveIntensity: band.side === "sky" ? 0.04 : 0.025,
          roughness: 0.96
        })
      })
        .position(0, band.centerY, band.z)
        .scale([band.width, band.height, 0.2])
        .runtime(engineGame.runtimeNode(id, {
          tags: ["backdrop", "sky-band", `act-${actIndex}`]
        }));
    });
  });
}

function actFogNodes(actNodeIds: Record<number, string[]>): AuraNodeInput[] {
  return [0, 1, 2, 3, 4].map((actIndex) => {
    const palette = getSkylineActPalette(actIndex);
    const id = `skyline-act-${actIndex}-fog`;
    (actNodeIds[actIndex] ??= []).push(id);
    return effects.fog({
      name: `skyline act-${actIndex} distance haze`,
      color: palette.fogColor,
      density: palette.fogDensity,
      intensity: palette.fogIntensity
    }).runtime(engineGame.runtimeNode(id, {
      tags: ["backdrop", "fog", `act-${actIndex}`]
    }));
  });
}

function silhouetteChunkNodes(): AuraNodeInput[] {
  return planSkylineBackdropChunks(SKYLINE_DISTRICT_ANCHORS).map((chunk) => {
    const lod = skylineBackdropLodSpec(chunk);
    const [sceneX] = platformerScene.toScenePoint({ x: chunk.centerX, y: 0 });
    const z = chunk.band === "far" ? FAR_BACKGROUND_DEPTH + 0.55 : FAR_BACKGROUND_DEPTH + 1.0;
    return distanceLod({
      name: chunk.id,
      levels: lod.levels,
      hysteresis: lod.hysteresis,
      castShadow: false,
      receiveShadow: false
    })
      .position(sceneX, horizonY + chunk.height / 2 - 0.35, z)
      .scale([chunk.width * platformerScene.transform.scale, chunk.height, 0.3])
      .runtime(engineGame.runtimeNode(chunk.id, {
        tags: ["backdrop", "distance-lod", "skyline-silhouette", `act-${chunk.act}`, chunk.districtId]
      }));
  });
}

function actGateNodes(): AuraNodeInput[] {
  return SKYLINE_ACT_GATES.map((gate) => {
    const palette = getSkylineActPalette(gate.act);
    const [sceneX, surfaceSceneY] = platformerScene.toScenePoint({ x: gate.x, y: gate.surfaceY });
    return text3D(`ACT ${gate.act + 1}`, {
      name: gate.id,
      backend: "sdf",
      size: 0.34,
      depth: 0.1,
      letterSpacing: 0.05,
      material: material.emissive({
        name: `${gate.id} glow`,
        color: "#0d2418",
        emissive: palette.checkpointLightColor,
        emissiveIntensity: 1.05,
        roughness: 0.35
      })
    })
      .position(sceneX, surfaceSceneY + 1.12, GAMEPLAY_ACTOR_DEPTH - 0.28)
      .runtime(engineGame.runtimeNode(gate.id, {
        tags: ["act-gate", "district-language", `act-${gate.act}`]
      }));
  });
}

function sentryNodes(): AuraNodeInput[] {
  return SKYLINE_SENTRY_ENCOUNTERS.map((encounter) => {
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
    })
      .animate({ clip: "Standing", loop: true, captureTime: 0.35 })
      .position(sceneX, sceneY, GAMEPLAY_ACTOR_DEPTH)
      .rotate(0, Math.PI / 2, 0)
      .runtime(engineGame.runtimeNode(`relay-sentry-${encounter.id}`, {
        tags: ["district-landmark", "sentry", "set-dressing", "shape-plus-color"]
      }));
  });
}

function summitBeaconNodes(): AuraNodeInput[] {
  const finishPoint = platformerScene.toScenePoint({ x: level.finish?.x ?? 0, y: level.finish?.y ?? 0 });
  const z = platformerScene.worldZ + 0.4;
  return [
    primitives.box({ name: "summit beacon plinth", material: beaconMaterial })
      .position(finishPoint[0], finishPoint[1] + 0.055, z)
      .scale([0.5, 0.11, 0.5])
      .runtime(engineGame.runtimeNode("summit-beacon-plinth", { tags: ["district-landmark", "crown-heights", "set-dressing", "finish-language"] })),
    primitives.box({ name: "summit beacon pedestal", material: beaconMaterial })
      .position(finishPoint[0], finishPoint[1] + 0.15, z)
      .scale([0.22, 0.1, 0.22])
      .runtime(engineGame.runtimeNode("summit-beacon-pedestal", { tags: ["district-landmark", "crown-heights", "set-dressing", "finish-language"] })),
    primitives.box({ name: "summit beacon mast", material: beaconMaterial })
      .position(finishPoint[0], finishPoint[1] + 0.35, z)
      .scale([0.05, 0.55, 0.05])
      .runtime(engineGame.runtimeNode("summit-beacon-mast", { tags: ["district-landmark", "crown-heights", "set-dressing", "finish-language"] })),
    primitives.sphere({ name: "summit beacon core", material: beaconMaterial })
      .position(finishPoint[0], finishPoint[1] + 0.62, z + 0.02)
      .scale([0.09, 0.09, 0.09])
      .runtime(engineGame.runtimeNode("summit-beacon-core", { tags: ["district-landmark", "crown-heights", "set-dressing", "finish-language"] })) as AuraNodeInput
  ];
}

function presentationNodes(): AuraNodeInput[] {
  return [...engineGame.platformerPresentationSurfaces({
    sceneBinding: platformerScene,
    level,
    mode: "asset-overlay",
    guideVisibility: "public",
    platformColor: "#173353",
    platformTrimColor: "#58e5f4",
    hazardColor: "#ff5f77",
    checkpointColor: "#54d7ff",
    collectibleColor: "#ffd66b",
    finishColor: "#62e8b8"
  })] as AuraNodeInput[];
}

function hazardMarkNodes(): AuraNodeInput[] {
  return hazards.map((hazard) => {
    const rect = platformerScene.surfaceToSceneRect(hazard);
    const armLength = Math.max(0.1, Math.min(0.22, rect.size[0] * 0.62));
    return primitives.box({
      name: `hazard mark ${hazard.id}`,
      material: hazardMarkMaterial
    })
      .position(rect.center[0], rect.center[1] + rect.size[1] / 2 + 0.03, rect.center[2] + 0.05)
      .rotate(0, 0, Math.PI * 0.22)
      .scale([armLength, 0.022, 0.026])
      .runtime(engineGame.runtimeNode(`skyline-hazard-language-${hazard.id}`, {
        tags: [SKYLINE_VISUAL_LANGUAGE.hazard.nodeTag, "shape-plus-color", "non-colliding"]
      }));
  });
}

function foliagePoolNodes(): AuraNodeInput[] {
  const placements = planSkylineFoliage({ platforms });
  const byAct = new Map<number, SkylineFoliagePlacement[]>();
  for (const placement of placements) {
    const list = byAct.get(placement.act) ?? [];
    list.push(placement);
    byAct.set(placement.act, list);
  }
  return [...byAct.entries()].map(([act, items]) => {
    const shared = material.emissive({
      name: `${skylineFoliageNodeId(act)} tint`,
      color: skylineFoliageTint(act, 0.5),
      emissive: skylineFoliageTint(act, 0.85),
      emissiveIntensity: 0.55,
      roughness: 0.6
    });
    const transforms = items.map((item) => {
      const [sx, sy] = platformerScene.toScenePoint({ x: item.x, y: item.y });
      return {
        position: [sx, sy + 0.06 * item.scale, -0.3 + item.depthBias * 0.26] as [number, number, number],
        rotation: [0, item.depthBias * Math.PI, 0] as [number, number, number],
        scale: [0.055 * item.scale, 0.13 * item.scale, 0.055 * item.scale] as [number, number, number]
      };
    });
    return instances.capsule({ name: skylineFoliageNodeId(act), material: shared, transforms })
      .runtime(engineGame.runtimeNode(skylineFoliageNodeId(act), {
        tags: ["foliage", "act-tinted", "instanced", `act-${act}`]
      }));
  });
}

function sparklePoolNodes(): AuraNodeInput[] {
  const placements = planSkylineShardSparkles(
    collectibles.filter((collectible) => !String(collectible.id).includes("ember-charge"))
  );
  const byAct = new Map<number, SkylineSparklePlacement[]>();
  for (const placement of placements) {
    const list = byAct.get(placement.act) ?? [];
    list.push(placement);
    byAct.set(placement.act, list);
  }
  return [...byAct.entries()].map(([act, items]) => {
    const shared = material.emissive({
      name: `${skylineSparkleNodeId(act)} tint`,
      color: skylineSparkleTint(act, 0.35),
      emissive: skylineSparkleTint(act, 0.8),
      emissiveIntensity: 0.55,
      roughness: 0.6
    });
    const transforms = items.map((item) => {
      const [sx, sy] = platformerScene.toScenePoint({ x: item.x, y: item.y });
      return {
        position: [sx, sy + 0.04 * item.scale, GAMEPLAY_ACTOR_DEPTH - 0.14 + item.depthBias * 0.02] as [number, number, number],
        rotation: [0, item.depthBias * Math.PI, 0] as [number, number, number],
        scale: [0.13 * item.scale, 0.13 * item.scale, 0.035 * item.scale] as [number, number, number]
      };
    });
    return instances.torus({ name: skylineSparkleNodeId(act), material: shared, transforms })
      .runtime(engineGame.runtimeNode(skylineSparkleNodeId(act), {
        tags: ["sparkle", "coin-halo", "act-tinted", "instanced", `act-${act}`]
      }));
  });
}

export const LIFT_CARD_NODE_IDS = SKYLINE_MOVING_PLATFORMS.map((platform) => `skyline-lift-card-${platform.id}`);

function liftCardNodes(): AuraNodeInput[] {
  return SKYLINE_MOVING_PLATFORMS.map((platform, index) => {
    const rect = platformerScene.surfaceToSceneRect({
      id: platform.id,
      x: platform.x,
      y: platform.y,
      width: platform.width,
      height: platform.height
    });
    return primitives.box({
      name: `skyline lift card ${platform.id}`,
      material: material.pbr({
        name: `skyline lift card ${platform.id} body`,
        color: "#3d6a8f",
        roughness: 0.6,
        metallic: 0.18
      })
    })
      .position(rect.center[0], rect.center[1], GAMEPLAY_ACTOR_DEPTH - 0.08)
      .scale([rect.size[0], Math.max(0.06, rect.size[1]), 0.34])
      .runtime(engineGame.runtimeNode(LIFT_CARD_NODE_IDS[index]!, {
        tags: ["moving-platform", "lift", "act-scene", "non-colliding"]
      }));
  });
}

export const HERO_NODE_ID = "platformer-player";

function heroNode(): AuraNodeInput {
  return model(assets.skylineArcticRunnerHero, {
    name: "platformer-readable-character",
    role: "primaryCharacter",
    scaleMode: "fit",
    targetHeight: SKYLINE_RENDERED_CHARACTER_HEIGHT,
    castShadow: true,
    receiveShadow: true
  })
    .position(0, 0.6, GAMEPLAY_ACTOR_DEPTH)
    .runtime(engineGame.runtimeNode(HERO_NODE_ID, {
      tags: ["player", "character", "typed-primary-asset", "player-language", "shape-plus-color"]
    }));
}

export interface SkylineWorld {
  readonly nodes: AuraNodeInput[];
  readonly actNodeIds: Readonly<Record<number, readonly string[]>>;
}

export function skylineWorldNodes(): SkylineWorld {
  const actNodeIds: Record<number, string[]> = {};
  const nodes: AuraNodeInput[] = [
    winterParallaxNode(),
    ...actBackdropNodes(actNodeIds),
    ...actFogNodes(actNodeIds),
    ...silhouetteChunkNodes(),
    ...actGateNodes(),
    worldModelNode(),
    ...sentryNodes(),
    ...summitBeaconNodes(),
    ...presentationNodes(),
    ...hazardMarkNodes(),
    ...foliagePoolNodes(),
    ...sparklePoolNodes(),
    ...liftCardNodes(),
    heroNode()
  ];
  return { nodes, actNodeIds };
}
