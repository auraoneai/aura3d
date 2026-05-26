export interface PerformanceLodLevel {
  readonly id: string;
  readonly maxDistance: number;
  readonly triangleBudget: number;
}

export function selectPerformanceLodLevel(levels: readonly PerformanceLodLevel[], distance: number): PerformanceLodLevel {
  if (levels.length === 0) throw new Error("selectPerformanceLodLevel requires at least one LOD level.");
  const sorted = [...levels].sort((a, b) => a.maxDistance - b.maxDistance);
  return sorted.find((level) => distance <= level.maxDistance) ?? sorted[sorted.length - 1]!;
}

export function createDefaultPerformanceLodLevels(baseTriangles: number): readonly PerformanceLodLevel[] {
  const triangles = Math.max(1, Math.floor(baseTriangles));
  return [
    { id: "lod0", maxDistance: 8, triangleBudget: triangles },
    { id: "lod1", maxDistance: 20, triangleBudget: Math.max(1, Math.floor(triangles * 0.45)) },
    { id: "lod2", maxDistance: Number.POSITIVE_INFINITY, triangleBudget: Math.max(1, Math.floor(triangles * 0.16)) }
  ];
}
