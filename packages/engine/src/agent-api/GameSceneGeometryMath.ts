import type {
  GameGeometryModelBounds,
  GameKitRect,
  GameKitVec2,
  GamePlatformerPlayableSurfaceMap
} from "./GameGenreKits";

export interface SceneGeometryTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetZ: number;
  readonly elevation: number;
}

export interface SceneGeometryBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export function assertOverlayValidatedSource(source: string, label: string): void {
  if (source === "asset-mesh-extracted") return;
  if (source === "manifest-authored-overlay-validated") return;
  if (source === "compiler-authored-overlay-validated") return;
  throw new Error(`${label} must be mesh-extracted or overlay-validated; received ${source}.`);
}

export function positiveOrDefault(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : fallback;
}

export function boundsFromPoints(points: readonly GameKitVec2[]): SceneGeometryBounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export function boundsFromRects(rects: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[]): SceneGeometryBounds {
  const xs = rects.flatMap((rect) => [rect.x - rect.width / 2, rect.x + rect.width / 2]);
  const ys = rects.flatMap((rect) => [rect.y, rect.y + rect.height]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export function boundsFromLeftEdgeRects(
  rects: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[]
): SceneGeometryBounds {
  const xs = rects.flatMap((rect) => [rect.x, rect.x + rect.width]);
  const ys = rects.flatMap((rect) => [rect.y, rect.y + rect.height]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export function transformFromBounds(bounds: SceneGeometryBounds, targetSize: number, elevation: number): SceneGeometryTransform {
  const width = Math.max(0.001, bounds.maxX - bounds.minX);
  const height = Math.max(0.001, bounds.maxY - bounds.minY);
  const scale = targetSize / Math.max(width, height);
  return {
    scale: roundScene(scale),
    offsetX: roundScene(-((bounds.minX + bounds.maxX) / 2) * scale),
    offsetZ: roundScene(-((bounds.minY + bounds.maxY) / 2) * scale),
    elevation: roundScene(elevation)
  };
}

export function maxModelDimension(bounds: GameGeometryModelBounds): number {
  return Math.max(
    0.001,
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2]
  );
}

export function normalizedModelLocalOffset(
  bounds: GameGeometryModelBounds,
  modelPoint: readonly [number, number, number],
  targetMaxDimension: number
): readonly [number, number, number] {
  const fitScale = positiveOrDefault(targetMaxDimension, maxModelDimension(bounds)) / maxModelDimension(bounds);
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const bottomY = bounds.min[1];
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  return [
    roundScene((modelPoint[0] - centerX) * fitScale),
    roundScene((modelPoint[1] - bottomY) * fitScale),
    roundScene((modelPoint[2] - centerZ) * fitScale)
  ];
}

export function averageRouteTopologyError(
  routePoints: readonly GameKitVec2[],
  roadCenterline: readonly { readonly x: number; readonly z: number }[]
): number {
  const count = Math.min(routePoints.length, roadCenterline.length);
  if (count === 0) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    const routePoint = routePoints[index];
    const topologyPoint = roadCenterline[index];
    if (routePoint && topologyPoint) total += Math.hypot(routePoint.x - topologyPoint.x, routePoint.y - topologyPoint.z);
  }
  return roundScene(total / count);
}

export function averageSurfaceBindingError(platforms: readonly GameKitRect[], surfaceMap: GamePlatformerPlayableSurfaceMap): number {
  const surfaceById = new Map(
    surfaceMap.surfaces
      .filter((surface) => surface.kind === "ground" || surface.kind === "platform" || surface.kind === "moving")
      .map((surface) => [surface.id, surface])
  );
  const pairs = platforms.flatMap((platform) => {
    const surface = surfaceById.get(platform.id);
    return surface ? [{ platform, surface }] : [];
  });
  if (pairs.length === 0) return Number.POSITIVE_INFINITY;
  const total = pairs.reduce((sum, { platform, surface }) => {
    const platformCenterX = platform.x + platform.width / 2;
    return sum + Math.hypot(platformCenterX - surface.x, platform.y - surface.y);
  }, 0);
  return roundScene(total / pairs.length);
}

export function sampleRoutePoint(points: readonly GameKitVec2[], progress: number): GameKitVec2 {
  const index = Math.min(points.length - 1, Math.max(0, Math.round(progress * (points.length - 1))));
  return points[index] ?? { x: 0, y: 0 };
}

export function roundScene(value: number): number {
  return Math.round(value * 1000) / 1000;
}
