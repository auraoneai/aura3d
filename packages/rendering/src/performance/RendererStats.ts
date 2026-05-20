export interface V4RendererStatsInput {
  readonly objectCount: number;
  readonly visibleObjectCount: number;
  readonly drawCalls: number;
  readonly triangles?: number;
  readonly cpuFrameMs?: number;
  readonly gpuFrameMs?: number;
  readonly textureMemoryBytes?: number;
  readonly warnings?: readonly string[];
}

export interface V4RendererStats {
  readonly objectCount: number;
  readonly visibleObjectCount: number;
  readonly culledObjectCount: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly cpuFrameMs: number;
  readonly gpuFrameMs?: number;
  readonly textureMemoryBytes: number;
  readonly warnings: readonly string[];
}

export function createV4RendererStats(input: V4RendererStatsInput): V4RendererStats {
  const objectCount = Math.max(0, Math.floor(input.objectCount));
  const visibleObjectCount = Math.max(0, Math.min(objectCount, Math.floor(input.visibleObjectCount)));
  const drawCalls = Math.max(0, Math.floor(input.drawCalls));
  const textureMemoryBytes = Math.max(0, Math.floor(input.textureMemoryBytes ?? 0));
  const warnings = [...(input.warnings ?? [])];
  if (drawCalls > 500) warnings.push("draw-call-count-high");
  if (textureMemoryBytes > 512 * 1024 * 1024) warnings.push("texture-memory-budget-high");
  return {
    objectCount,
    visibleObjectCount,
    culledObjectCount: objectCount - visibleObjectCount,
    drawCalls,
    triangles: Math.max(0, Math.floor(input.triangles ?? 0)),
    cpuFrameMs: Math.max(0, input.cpuFrameMs ?? 0),
    ...(input.gpuFrameMs === undefined ? {} : { gpuFrameMs: Math.max(0, input.gpuFrameMs) }),
    textureMemoryBytes,
    warnings
  };
}
