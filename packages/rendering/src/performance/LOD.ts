export interface V4LodLevel {
  readonly id: string;
  readonly maxDistance: number;
  readonly triangleBudget: number;
}

export function selectV4LodLevel(levels: readonly V4LodLevel[], distance: number): V4LodLevel {
  if (levels.length === 0) throw new Error("selectV4LodLevel requires at least one LOD level.");
  const sorted = [...levels].sort((a, b) => a.maxDistance - b.maxDistance);
  return sorted.find((level) => distance <= level.maxDistance) ?? sorted[sorted.length - 1]!;
}

export function createV4DefaultLodLevels(baseTriangles: number): readonly V4LodLevel[] {
  const triangles = Math.max(1, Math.floor(baseTriangles));
  return [
    { id: "lod0", maxDistance: 8, triangleBudget: triangles },
    { id: "lod1", maxDistance: 20, triangleBudget: Math.max(1, Math.floor(triangles * 0.45)) },
    { id: "lod2", maxDistance: Number.POSITIVE_INFINITY, triangleBudget: Math.max(1, Math.floor(triangles * 0.16)) }
  ];
}
