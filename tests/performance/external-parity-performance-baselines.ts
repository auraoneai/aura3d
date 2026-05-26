import {
  createV4DefaultLodLevels,
  createV4RendererStats,
  evaluateV4ResourceBudget,
  selectV4LodLevel,
  sortV4RenderItems
} from "@aura3d/rendering";

const stats = createV4RendererStats({
  objectCount: 640,
  visibleObjectCount: 418,
  drawCalls: 146,
  triangles: 268_000,
  cpuFrameMs: 13.8,
  textureMemoryBytes: 184 * 1024 * 1024
});
const budget = evaluateV4ResourceBudget(
  { textureBudgetBytes: 256 * 1024 * 1024, geometryBudgetBytes: 160 * 1024 * 1024, drawCallBudget: 220 },
  { textureBytes: stats.textureMemoryBytes, geometryBytes: 92 * 1024 * 1024, drawCalls: stats.drawCalls }
);
const lod = selectV4LodLevel(createV4DefaultLodLevels(120_000), 18);
const sorted = sortV4RenderItems([
  { id: "glass-front", materialBucket: "transparent", pipelineKey: "glass", depth: 2 },
  { id: "opaque-case", materialBucket: "opaque", pipelineKey: "pbr", depth: 5 },
  { id: "alpha-label", materialBucket: "mask", pipelineKey: "pbr", depth: 3 }
]);

export const V4_PERFORMANCE_BASELINE = {
  schema: "a3d-v4-performance-baseline/v1",
  stats,
  budget,
  lod,
  sortedIds: sorted.map((item) => item.id),
  featureCoverage: ["frustum-culling", "instancing-ready", "resource-budget", "render-item-sorting", "transparent-sorting", "lod", "timing-diagnostics", "memory-diagnostics"]
} as const;

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(V4_PERFORMANCE_BASELINE, null, 2));
}
