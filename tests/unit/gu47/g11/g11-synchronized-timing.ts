/**
 * A MutationObserver timestamps delivery, not the attribute assignment. The
 * last observation of "not ready" and the delivery time bound the transition.
 * All inputs use one document's performance.now() clock, never the host clock.
 */
export interface G11TimingObservation {
  readonly nominalMs: number;
  readonly earlyWindowMs: number;
  readonly readyTimeOriginMs: number | null;
  readonly captureTimeOriginMs: number | null;
  readonly observerInstalledMs: number | null;
  readonly lastNotReadyMs: number | null;
  readonly readyObservedMs: number | null;
  readonly beforeStartMs: number | null;
  readonly beforeEndMs: number | null;
  readonly screenshotStartMs: number | null;
  readonly screenshotEndMs: number | null;
  readonly afterStartMs: number | null;
  readonly afterEndMs: number | null;
}

export type G11AgeBounds = readonly [minimumMs: number, maximumMs: number];

export interface G11TimingClassification {
  readonly status: "within-window" | "early" | "late" | "not-proven";
  readonly reasons: readonly string[];
  readonly targetWindowMs: readonly [number, number] | null;
  readonly readyUncertaintyMs: number | null;
  readonly beforeStartAgeMs: G11AgeBounds | null;
  readonly screenshotStartAgeMs: G11AgeBounds | null;
  readonly screenshotEndAgeMs: G11AgeBounds | null;
  readonly afterEndAgeMs: G11AgeBounds | null;
}

export function classifyG11ReadyMutation(oldValue: string | null, newValue: string | null, observedReady: boolean, isCurrentBody: boolean) {
  const changed = oldValue !== newValue;
  return { invalidates: observedReady && changed, becameReady: isCurrentBody && changed && newValue === "true" };
}

export function isG11ReadySnapshotValid(state: {
  currentValue: string | null; sameBody: boolean; bodyConnected: boolean;
  readyTransitions: number; changesAfterReady: number; bodyReplacements: number; timeOriginMs: number;
}, timeOriginMs: number): boolean {
  return state.currentValue === "true" && state.sameBody && state.bodyConnected &&
    state.readyTransitions === 1 && state.changesAfterReady === 0 && state.bodyReplacements === 0 &&
    state.timeOriginMs === timeOriginMs;
}

/**
 * The entire bracket, not just the screenshot request, must fit in the
 * declared window for every possible ready time. Late/uncertain captures keep
 * their measured ages; they must never be renamed as an on-time milestone.
 */
export function classifyG11Timing(input: G11TimingObservation): G11TimingClassification {
  const empty = (reason: string): G11TimingClassification => ({
    status: "not-proven", reasons: [reason], targetWindowMs: null, readyUncertaintyMs: null,
    beforeStartAgeMs: null, screenshotStartAgeMs: null, screenshotEndAgeMs: null, afterEndAgeMs: null
  });
  if (!Number.isFinite(input.nominalMs) || input.nominalMs <= 0 ||
      !Number.isFinite(input.earlyWindowMs) || input.earlyWindowMs < 0 || input.earlyWindowMs > input.nominalMs) {
    return empty("invalid target window");
  }
  const clockValues = [
    input.readyTimeOriginMs, input.captureTimeOriginMs, input.observerInstalledMs, input.lastNotReadyMs,
    input.readyObservedMs, input.beforeStartMs, input.beforeEndMs, input.screenshotStartMs,
    input.screenshotEndMs, input.afterStartMs, input.afterEndMs
  ];
  if (clockValues.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    return empty("missing or invalid browser clock data");
  }
  if (input.readyTimeOriginMs !== input.captureTimeOriginMs) return empty("document timeOrigin changed");

  // The validation above establishes these as finite, non-negative numbers.
  const installed = input.observerInstalledMs as number;
  const notReady = input.lastNotReadyMs as number;
  const ready = input.readyObservedMs as number;
  const beforeStart = input.beforeStartMs as number;
  const beforeEnd = input.beforeEndMs as number;
  const screenshotStart = input.screenshotStartMs as number;
  const screenshotEnd = input.screenshotEndMs as number;
  const afterStart = input.afterStartMs as number;
  const afterEnd = input.afterEndMs as number;
  const ordered = [installed, notReady, ready, beforeStart, beforeEnd, screenshotStart, screenshotEnd, afterStart, afterEnd];
  if (ordered.some((value, index) => index > 0 && value < ordered[index - 1]!)) {
    return empty("browser timestamps are stale or out of order");
  }

  const bounds = (time: number): G11AgeBounds => [time - ready, time - notReady];
  const startAge = bounds(beforeStart);
  const endAge = bounds(afterEnd);
  const firstAllowed = input.nominalMs - input.earlyWindowMs;
  const common = {
    targetWindowMs: [firstAllowed, input.nominalMs] as const,
    readyUncertaintyMs: ready - notReady,
    beforeStartAgeMs: startAge,
    screenshotStartAgeMs: bounds(screenshotStart),
    screenshotEndAgeMs: bounds(screenshotEnd),
    afterEndAgeMs: endAge
  };
  if (endAge[0] > input.nominalMs) {
    return { ...common, status: "late", reasons: ["diagnostic bracket completed after the deadline"] };
  }
  if (startAge[1] < firstAllowed) {
    return { ...common, status: "early", reasons: ["diagnostic bracket began before the target window"] };
  }
  if (startAge[0] < firstAllowed || endAge[1] > input.nominalMs) {
    return { ...common, status: "not-proven", reasons: ["ready-time uncertainty or bracket crosses the target window"] };
  }
  return { ...common, status: "within-window", reasons: [] };
}
