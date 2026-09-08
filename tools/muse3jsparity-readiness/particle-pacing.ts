/** Replay the producer's one-second rolling FPS from completed GPU frame times. */
export function measureParticlePacing(completedAt: readonly number[], frameIds: readonly number[]): {
  longestBelow55Ms: number;
  rollingFps: { at: number; fps: number }[];
} {
  // Native52 observed distinct submissions 2795/2796 at the same 52144 ms
  // browser clock quantum. Keep both receipts; zero intervals are real observed
  // values, not missing frames. A rolling window always spans at least 1000 ms.
  if (completedAt.some((at, i) => !Number.isFinite(at) || (i > 0 && at < completedAt[i - 1]!))) {
    throw new Error("Particle completion timestamps must be finite and nondecreasing.");
  }
  if (completedAt.length < 2 || !(completedAt.at(-1)! > completedAt[0]!)) throw new Error("Particle completion window must have positive duration.");
  if (frameIds.length !== completedAt.length || frameIds.some((id,i)=>!Number.isSafeInteger(id)||id<0||(i>0&&id!==frameIds[i-1]!+1))) throw new Error("Particle completion frame IDs must be unique and contiguous integers.");
  let cursor = 0;
  let slowStart: number | undefined;
  let longestBelow55Ms = 0;
  const rollingFps: { at: number; fps: number }[] = [];
  for (let i = 1; i < completedAt.length; i++) {
    const at = completedAt[i]!;
    if (at - completedAt[0]! < 1000) continue;
    while (cursor + 1 < i && at - completedAt[cursor + 1]! >= 1000) cursor++;
    const fps = (i - cursor) * 1000 / (at - completedAt[cursor]!);
    rollingFps.push({ at, fps });
    if (fps < 55) slowStart ??= at;
    else if (slowStart !== undefined) {
      longestBelow55Ms = Math.max(longestBelow55Ms, at - slowStart);
      slowStart = undefined;
    }
  }
  if (slowStart !== undefined) {
    longestBelow55Ms = Math.max(longestBelow55Ms, completedAt[completedAt.length - 1]! - slowStart);
  }
  return { longestBelow55Ms, rollingFps };
}
