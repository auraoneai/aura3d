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

export interface TextureStreamingCandidate {
  readonly id: string;
  /** Mip-level byte sizes ordered coarse-to-fine (index 0 always resident when funded). */
  readonly mipBytesCoarseToFine: readonly number[];
  readonly distanceMeters: number;
  /** Higher priority wins ties and funds first; defaults to 0. */
  readonly priority?: number;
}

export interface TextureStreamingResident {
  readonly id: string;
  /** Count of coarse-to-fine levels resident (0 = fully evicted). */
  readonly residentLevels: number;
  readonly residentBytes: number;
}

export interface TextureStreamingResidency {
  readonly schema: "a3d-texture-streaming-residency";
  readonly residents: readonly TextureStreamingResident[];
  readonly evicted: readonly string[];
  readonly usedBytes: number;
  readonly requestedBytes: number;
  readonly overBudget: boolean;
  readonly overBudgetBytes: number;
}

/**
 * M2 distance-prioritized mip residency. Every candidate gets its coarsest
 * level first (no black textures while budget lasts), then refinement walks
 * nearest-first until the budget is exhausted. Over-budget telemetry reports
 * the unfunded tail so the production bridge can warn instead of thrash.
 */
export function evaluateDistancePrioritizedMipResidency(
  candidates: readonly TextureStreamingCandidate[],
  maxTextureBytes: number
): TextureStreamingResidency {
  if (!Number.isFinite(maxTextureBytes) || maxTextureBytes < 0) {
    throw new Error("Texture streaming maxTextureBytes must be finite and non-negative.");
  }
  const ordered = [...candidates].sort((a, b) =>
    (b.priority ?? 0) - (a.priority ?? 0) || a.distanceMeters - b.distanceMeters || (a.id < b.id ? -1 : 1)
  );
  const requestedBytes = ordered.reduce(
    (total, candidate) => total + candidate.mipBytesCoarseToFine.reduce((sum, bytes) => sum + Math.max(0, bytes), 0),
    0
  );
  const residentLevels = new Map<string, number>();
  let usedBytes = 0;
  const tryFund = (candidate: TextureStreamingCandidate, level: number): void => {
    const bytes = Math.max(0, candidate.mipBytesCoarseToFine[level] ?? 0);
    if (usedBytes + bytes > maxTextureBytes) return;
    usedBytes += bytes;
    residentLevels.set(candidate.id, level + 1);
  };
  for (const candidate of ordered) {
    if (candidate.mipBytesCoarseToFine.length > 0) tryFund(candidate, 0);
  }
  const maxLevels = Math.max(0, ...ordered.map((candidate) => candidate.mipBytesCoarseToFine.length));
  for (let level = 1; level < maxLevels; level += 1) {
    for (const candidate of ordered) {
      if ((residentLevels.get(candidate.id) ?? 0) === level && level < candidate.mipBytesCoarseToFine.length) {
        tryFund(candidate, level);
      }
    }
  }
  const residents = ordered.map((candidate) => {
    const levels = residentLevels.get(candidate.id) ?? 0;
    return {
      id: candidate.id,
      residentLevels: levels,
      residentBytes: candidate.mipBytesCoarseToFine.slice(0, levels).reduce((sum, bytes) => sum + Math.max(0, bytes), 0)
    };
  });
  const evicted = residents.filter((resident) => resident.residentLevels === 0).map((resident) => resident.id);
  const overBudgetBytes = Math.max(0, requestedBytes - usedBytes);
  return {
    schema: "a3d-texture-streaming-residency",
    residents,
    evicted,
    usedBytes,
    requestedBytes,
    overBudget: overBudgetBytes > 0,
    overBudgetBytes
  };
}
