export interface ThreeCompatRendererProfile {
  readonly objectCount: number;
  readonly instanceCount: number;
  readonly triangleCount: number;
  readonly drawCalls: number;
  readonly textureMemoryBytes: number;
  readonly cpuFrameMs: number;
  readonly warnings: readonly string[];
}

export function createThreeCompatRendererProfile(input: Omit<ThreeCompatRendererProfile, "warnings">): ThreeCompatRendererProfile {
  return {
    ...input,
    warnings: [
      ...(input.cpuFrameMs > 16.6 ? ["CPU frame time exceeds 60fps budget."] : []),
      ...(input.drawCalls > 500 ? ["Draw call count is high; add batching or instancing."] : [])
    ]
  };
}
