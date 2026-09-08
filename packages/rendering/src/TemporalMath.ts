/** Seed frames contribute equally until the requested history weight is reached. */
export function temporalAccumulationWeight(blend: number, historyFrames?: number): number {
  if (historyFrames === undefined) return blend;
  if (!Number.isSafeInteger(historyFrames) || historyFrames < 0) throw new RangeError("Temporal history frame count must be a nonnegative integer");
  return Math.min(blend, historyFrames / (historyFrames + 1));
}
