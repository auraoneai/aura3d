import type {
  ShowcaseGeometryModelBounds,
  ShowcasePlatformerPlayableSurfaceMap,
  ShowcaseRacingTrackTopology
} from "./showcase-spec-types.js";

const DEFAULT_RACING_SCENE_SIZE = 5.4;
const DEFAULT_PLATFORMER_SCENE_WIDTH = 6.4;

export function racingSceneScale(topology: ShowcaseRacingTrackTopology): {
  readonly targetSceneSize: number;
  readonly trackModelTargetMaxDimension: number;
} {
  const targetSceneSize = DEFAULT_RACING_SCENE_SIZE;
  return {
    targetSceneSize,
    trackModelTargetMaxDimension: topology.source === "asset-mesh-extracted"
      ? deriveModelTargetMaxDimension({
        bounds: topology.modelAlignment.modelBounds,
        anchors: topology.modelAlignment.anchorPairs?.map((anchor) => ({
          model: [anchor.modelPoint[0], anchor.modelPoint[2]],
          game: [anchor.gamePoint.x, anchor.gamePoint.z]
        })),
        gameSpan: span(topology.roadCenterline.map((point) => [point.x, point.z])),
        targetSceneExtent: targetSceneSize
      })
      : targetSceneSize
  };
}

export function platformerSceneScale(surfaceMap: ShowcasePlatformerPlayableSurfaceMap): {
  readonly targetSceneWidth: number;
  readonly worldModelTargetMaxDimension: number;
} {
  const targetSceneWidth = DEFAULT_PLATFORMER_SCENE_WIDTH;
  const playable = surfaceMap.surfaces.filter((surface) =>
    surface.kind === "ground" || surface.kind === "platform" || surface.kind === "moving"
  );
  const minX = Math.min(...playable.map((surface) => surface.x - surface.width / 2));
  const maxX = Math.max(...playable.map((surface) => surface.x + surface.width / 2));
  const minY = Math.min(...playable.map((surface) => surface.y));
  const maxY = Math.max(...playable.map((surface) => surface.y + surface.height));
  return {
    targetSceneWidth,
    worldModelTargetMaxDimension: surfaceMap.source === "asset-mesh-extracted"
      ? deriveModelTargetMaxDimension({
        bounds: surfaceMap.modelAlignment.modelBounds,
        anchors: surfaceMap.modelAlignment.anchorPairs?.map((anchor) => ({
          model: [anchor.modelPoint[0], anchor.modelPoint[1]],
          game: [anchor.gamePoint.x, anchor.gamePoint.y]
        })),
        gameSpan: Math.max(0.001, maxX - minX, maxY - minY),
        targetSceneExtent: targetSceneWidth
      })
      : targetSceneWidth
  };
}

interface DeriveModelTargetInput {
  readonly bounds: ShowcaseGeometryModelBounds;
  readonly anchors?: readonly { readonly model: readonly [number, number]; readonly game: readonly [number, number] }[];
  readonly gameSpan: number;
  readonly targetSceneExtent: number;
}

function deriveModelTargetMaxDimension(input: DeriveModelTargetInput): number {
  const anchors = input.anchors ?? [];
  let mappingScale = 0;
  let longestModelDistance = 0;
  for (let a = 0; a < anchors.length; a += 1) {
    for (let b = a + 1; b < anchors.length; b += 1) {
      const first = anchors[a];
      const second = anchors[b];
      if (!first || !second) continue;
      const modelDistance = Math.hypot(second.model[0] - first.model[0], second.model[1] - first.model[1]);
      const gameDistance = Math.hypot(second.game[0] - first.game[0], second.game[1] - first.game[1]);
      if (modelDistance > longestModelDistance && gameDistance > 0.001) {
        longestModelDistance = modelDistance;
        mappingScale = gameDistance / modelDistance;
      }
    }
  }
  if (!(mappingScale > 0)) return input.targetSceneExtent;
  const fullModelMaxDimension = Math.max(
    input.bounds.max[0] - input.bounds.min[0],
    input.bounds.max[1] - input.bounds.min[1],
    input.bounds.max[2] - input.bounds.min[2],
    0.001
  );
  return round3(input.targetSceneExtent * fullModelMaxDimension * mappingScale / Math.max(0.001, input.gameSpan));
}

function span(points: readonly (readonly [number, number])[]): number {
  return Math.max(
    0.001,
    Math.max(...points.map((point) => point[0])) - Math.min(...points.map((point) => point[0])),
    Math.max(...points.map((point) => point[1])) - Math.min(...points.map((point) => point[1]))
  );
}

function round3(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
