import { measureParticlePacing } from "../../tools/muse3jsparity-readiness/particle-pacing";

/** Keep failed receipts inspectable without repairing or filtering their times. */
export function inspectParticleCompletions(frames: readonly { frameId: number; completedAt: number }[]) {
  const timestampObservations = frames.flatMap((frame, index) => {
    const previous = frames[index - 1];
    const reason = !Number.isFinite(frame.completedAt) ? "non-finite"
      : previous && frame.completedAt === previous.completedAt ? "equal"
      : previous && frame.completedAt < previous.completedAt ? "backward" : null;
    return reason ? [{ index, frameId: frame.frameId, reason,
      completedAt: String(frame.completedAt), previousCompletedAt: previous ? String(previous.completedAt) : null,
      // Include full receipts (including CPU phases and queue state at runtime).
      neighbors: frames.slice(Math.max(0, index - 2), index + 3) }] : [];
  });
  const timestampFailures=timestampObservations.filter(observation=>observation.reason!=="equal");
  const coalescedCompletions=timestampObservations.filter(observation=>observation.reason==="equal");
  try {
    return { ...measureParticlePacing(frames.map(frame => frame.completedAt),frames.map(frame=>frame.frameId)), pacingError: null, timestampFailures, coalescedCompletions };
  } catch (error) {
    return { longestBelow55Ms: null, rollingFps: null,
      pacingError: error instanceof Error ? error.message : String(error), timestampFailures, coalescedCompletions };
  }
}

/** JSON otherwise silently converts non-finite numbers to null. */
export function particleDiagnosticJSON(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => typeof entry === "number" && !Number.isFinite(entry)
    ? { nonFiniteNumber: String(entry) } : entry, 2);
}
