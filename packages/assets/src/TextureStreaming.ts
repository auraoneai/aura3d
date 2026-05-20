export interface TextureStreamingBudget {
  readonly maxTextureBytes: number;
  readonly loadedTextureBytes: number;
}

export interface TextureStreamingDecision {
  readonly canUpload: boolean;
  readonly remainingBytes: number;
}

export function evaluateTextureStreamingBudget(budget: TextureStreamingBudget): TextureStreamingDecision {
  if (!Number.isFinite(budget.maxTextureBytes) || budget.maxTextureBytes < 0) {
    throw new Error("Texture streaming maxTextureBytes must be finite and non-negative.");
  }
  if (!Number.isFinite(budget.loadedTextureBytes) || budget.loadedTextureBytes < 0) {
    throw new Error("Texture streaming loadedTextureBytes must be finite and non-negative.");
  }
  const remainingBytes = Math.max(0, budget.maxTextureBytes - budget.loadedTextureBytes);
  return { canUpload: remainingBytes > 0, remainingBytes };
}
