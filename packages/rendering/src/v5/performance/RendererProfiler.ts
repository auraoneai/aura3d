export interface V5RendererProfile {
  readonly objectCount: number;
  readonly instanceCount: number;
  readonly triangleCount: number;
  readonly drawCalls: number;
  readonly textureMemoryBytes: number;
  readonly cpuFrameMs: number;
  readonly warnings: readonly string[];
}

export function createV5RendererProfile(input: Omit<V5RendererProfile, "warnings">): V5RendererProfile {
  return {
    ...input,
    warnings: [
      ...(input.cpuFrameMs > 16.6 ? ["CPU frame time exceeds 60fps budget."] : []),
      ...(input.drawCalls > 500 ? ["Draw call count is high; add batching or instancing."] : [])
    ]
  };
}
