/** Pure analysis of separately collected native performance sessions.
 * No browser, device, process, or historical runtime is started by this module.
 */

export const NATIVE_PERFORMANCE_SCHEMA = "aura3d.native-performance/1" as const;

export interface NativePerformanceIdentity {
  workloadId: string;
  workloadSha256: string;
  assetSha256: string | null;
  seed: number;
  look: string;
  quality: string;
  viewport: { width: number; height: number; dpr: number };
  browser: string;
  browserVersion: string;
  os: string;
  backend: string;
  /** A stable, non-secret identifier for the same physical or software device. */
  device: string;
  adapter: string | null;
  driver: string | null;
}

export interface NativePerformanceSession {
  id: string;
  timedFrames: number;
  /** One lower-is-better summary for each metric in this session. */
  metrics: Record<string, number | null>;
  unavailable?: Record<string, string>;
}

export interface NativePerformanceReport {
  schema: typeof NATIVE_PERFORMANCE_SCHEMA;
  runId: string;
  candidate: { sourceSha256: string };
  /** Required on the historical baseline, including the rerun baseline. */
  baselineVersion?: string;
  identity: NativePerformanceIdentity;
  sessions: NativePerformanceSession[];
}

export interface NativeMetricPolicy {
  name: string;
  /** Optional independent maximum in the same unit as the session metric. */
  absoluteMax?: number;
  /**
   * The metric may be excluded as explicitly unsupported on this browser or
   * device. Exclusion requires every baseline and candidate session to report
   * null with a recorded unavailable reason; a partial or one-sided gap stays
   * no-data. Metrics without this flag are always required.
   */
  unsupportedAllowed?: boolean;
}

export interface NativeBudgetOptions {
  metrics: readonly NativeMetricPolicy[];
  /** At least three independent sessions are required by the roadmap. */
  minimumSessions?: number;
  /** At least 300 timed frames are required per calibrated session. */
  minimumTimedFrames?: number;
  /** Above this relative MAD, require one independent rerun. Default 5%. */
  maximumRelativeNoise?: number;
  rerun?: { baseline: NativePerformanceReport; candidate: NativePerformanceReport };
}

export type NativeMetricStatus = "pass" | "regression" | "inconclusive" | "no-data" | "unsupported";
export interface NativeMetricResult {
  name: string;
  status: NativeMetricStatus;
  reason?: string;
  baselineMedian: number | null;
  candidateMedian: number | null;
  relativeBaselineNoise: number | null;
  relativeCandidateNoise: number | null;
  relativeChange: number | null;
  regressionThreshold: number | null;
  /** Raw threshold crossing, including a provisional crossing on a noisy run. */
  exceedsRegressionThreshold: boolean | null;
  absolute: { maximum: number; status: "pass" | "fail" | "no-data" } | null;
  /** One rerun is requested only when the first comparison is noisy. */
  rerunRequired: boolean;
  comparedRun: "initial" | "rerun";
  /** Recorded per-session reasons when the metric is excluded as unsupported. */
  unsupportedReasons?: string[];
}

export interface NativeBudgetResult {
  schema: "aura3d.native-budget/1";
  status: "pass" | "fail" | "inconclusive" | "no-data";
  /** Metrics excluded from the aggregate because both sides explicitly report them unsupported. */
  excludedUnsupported: string[];
  baselineVersion: string | null;
  baselineRunId: string | null;
  candidateRunId: string | null;
  metrics: NativeMetricResult[];
}

/** Median is deterministic and does not mutate the caller's samples. */
export function median(values: readonly number[]): number {
  if (!values.length || values.some((value) => !Number.isFinite(value))) {
    throw new Error("median requires one or more finite values");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function relativeMad(values: readonly number[], center: number): number {
  const mad = median(values.map((value) => Math.abs(value - center)));
  return center === 0 ? (mad === 0 ? 0 : Infinity) : mad / center;
}

const digestPattern = /^[a-f0-9]{64}$/i;
const known = (value: unknown): value is string => typeof value === "string" && !!value.trim() && !/^(unknown|unavailable|unverified|not[- ]?reported|n\/?a)$/i.test(value.trim());

function validIdentity(identity: NativePerformanceIdentity | undefined): boolean {
  if (!identity || !identity.viewport) return false;
  return known(identity.workloadId) && digestPattern.test(identity.workloadSha256 ?? "") &&
    (identity.assetSha256 === null || digestPattern.test(identity.assetSha256 ?? "")) &&
    Number.isSafeInteger(identity.seed) && known(identity.look) && known(identity.quality) &&
    Number.isInteger(identity.viewport.width) && identity.viewport.width > 0 &&
    Number.isInteger(identity.viewport.height) && identity.viewport.height > 0 &&
    Number.isFinite(identity.viewport.dpr) && identity.viewport.dpr > 0 &&
    known(identity.browser) && known(identity.browserVersion) && known(identity.os) &&
    known(identity.backend) && known(identity.device) &&
    (identity.adapter === null || known(identity.adapter)) && (identity.driver === null || known(identity.driver));
}

function sameIdentity(a: NativePerformanceIdentity, b: NativePerformanceIdentity): boolean {
  return a.workloadId === b.workloadId && a.workloadSha256 === b.workloadSha256 &&
    a.assetSha256 === b.assetSha256 && a.seed === b.seed && a.look === b.look && a.quality === b.quality &&
    a.viewport.width === b.viewport.width && a.viewport.height === b.viewport.height && a.viewport.dpr === b.viewport.dpr &&
    a.browser === b.browser && a.browserVersion === b.browserVersion && a.os === b.os &&
    a.backend === b.backend && a.device === b.device && a.adapter === b.adapter && a.driver === b.driver;
}

function reportError(report: NativePerformanceReport | undefined, baseline: boolean, minSessions: number, minFrames: number): string | null {
  if (!report || report.schema !== NATIVE_PERFORMANCE_SCHEMA || !known(report.runId)) return "missing or invalid report schema/run ID";
  if (!digestPattern.test(report.candidate?.sourceSha256 ?? "")) return "missing or invalid source digest";
  if (baseline && !known(report.baselineVersion)) return "missing baseline version";
  if (!validIdentity(report.identity)) return "missing or invalid workload/device identity";
  if (!Array.isArray(report.sessions) || report.sessions.length < minSessions) return `fewer than ${minSessions} independent sessions`;
  const ids = new Set<string>();
  for (const session of report.sessions) {
    if (!session || !known(session.id) || ids.has(session.id)) return "missing or duplicate session ID";
    ids.add(session.id);
    if (!Number.isSafeInteger(session.timedFrames) || session.timedFrames < minFrames) return `session has fewer than ${minFrames} timed frames`;
    if (!session.metrics || typeof session.metrics !== "object" || Array.isArray(session.metrics)) return "missing session metrics";
    for (const [name, value] of Object.entries(session.metrics)) {
      if (value === null && !known(session.unavailable?.[name])) return `metric ${name} has no unavailable reason`;
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) return `metric ${name} is invalid`;
    }
  }
  return null;
}

function sessionsIndependent(...reports: readonly NativePerformanceReport[]): boolean {
  const ids = reports.flatMap((report) => report.sessions.map((session) => session.id));
  return new Set(ids).size === ids.length;
}

function valuesFor(report: NativePerformanceReport, metric: string): number[] | null {
  const values = report.sessions.map((session) => session.metrics[metric]);
  return values.every((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0) ? values : null;
}

/** Reasons when every session explicitly reports the metric unavailable; otherwise null. */
function uniformlyUnsupported(report: NativePerformanceReport, metric: string): string[] | null {
  const reasons: string[] = [];
  for (const session of report.sessions) {
    const reason = session.unavailable?.[metric];
    if (session.metrics[metric] !== null || !known(reason)) return null;
    reasons.push(reason.trim());
  }
  return reasons.length ? [...new Set(reasons)] : null;
}

function initialResult(policy: NativeMetricPolicy, comparedRun: "initial" | "rerun"): NativeMetricResult {
  return {
    name: policy.name, status: "no-data", baselineMedian: null, candidateMedian: null,
    relativeBaselineNoise: null, relativeCandidateNoise: null, relativeChange: null, regressionThreshold: null, exceedsRegressionThreshold: null,
    absolute: policy.absoluteMax === undefined ? null : { maximum: policy.absoluteMax, status: "no-data" },
    rerunRequired: false, comparedRun
  };
}

function compareMetric(
  baseline: NativePerformanceReport,
  candidate: NativePerformanceReport,
  policy: NativeMetricPolicy,
  maximumNoise: number,
  comparedRun: "initial" | "rerun"
): NativeMetricResult {
  const result = initialResult(policy, comparedRun);
  if (policy.unsupportedAllowed) {
    const baseReasons = uniformlyUnsupported(baseline, policy.name), nextReasons = uniformlyUnsupported(candidate, policy.name);
    if (baseReasons && nextReasons) {
      result.status = "unsupported";
      result.unsupportedReasons = [...new Set([...baseReasons, ...nextReasons])];
      result.reason = `metric ${policy.name} is explicitly unsupported in every baseline and candidate session: ${result.unsupportedReasons.join("; ")}`;
      return result;
    }
  }
  const base = valuesFor(baseline, policy.name);
  const next = valuesFor(candidate, policy.name);
  if (next) {
    result.candidateMedian = median(next);
    result.relativeCandidateNoise = relativeMad(next, result.candidateMedian);
    if (result.absolute) result.absolute.status = result.candidateMedian <= result.absolute.maximum ? "pass" : "fail";
  }
  if (!base || !next) {
    result.reason = `metric ${policy.name} is unavailable in one or more sessions`;
    if (result.relativeCandidateNoise !== null && result.relativeCandidateNoise > maximumNoise) {
      result.status = "inconclusive";
      result.rerunRequired = comparedRun === "initial";
      result.reason = "candidate noise prevents evaluating its absolute bound";
      if (result.absolute) result.absolute.status = "no-data";
    }
    return result;
  }
  const B = median(base);
  const C = result.candidateMedian!;
  result.baselineMedian = B;
  if (B === 0) {
    result.reason = "zero baseline cannot define a relative comparison";
    if (result.relativeCandidateNoise! > maximumNoise) {
      result.status = "inconclusive";
      result.rerunRequired = comparedRun === "initial";
      result.reason = "candidate noise prevents evaluating its absolute bound";
      if (result.absolute) result.absolute.status = "no-data";
    }
    return result;
  }
  const baselineNoise = relativeMad(base, B);
  const candidateNoise = result.relativeCandidateNoise!;
  result.relativeBaselineNoise = baselineNoise;
  result.relativeCandidateNoise = candidateNoise;
  result.relativeChange = C / B - 1;
  result.regressionThreshold = Math.max(0.05, 2 * baselineNoise);
  // At the exact boundary, floating-point division must not turn equality
  // (for example 10.5 / 10 - 1 versus 0.05) into a false regression.
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(result.relativeChange), result.regressionThreshold) * 8;
  result.exceedsRegressionThreshold = result.relativeChange > result.regressionThreshold + tolerance;
  if (baselineNoise > maximumNoise || candidateNoise > maximumNoise) {
    result.status = "inconclusive";
    result.rerunRequired = comparedRun === "initial";
    result.reason = comparedRun === "initial" ? "measurement noise requires one independent rerun" : "measurement noise remains inconclusive after rerun";
    if (result.absolute) result.absolute.status = "no-data";
  } else {
    result.status = result.exceedsRegressionThreshold ? "regression" : "pass";
  }
  return result;
}

/**
 * Compare lower-is-better session medians against a versioned baseline from the
 * same workload and device. No-data and unresolved noise never become a pass.
 * Absolute bounds are reported independently when relative comparison is absent.
 */
export function compareNativeBudget(
  baseline: NativePerformanceReport,
  candidate: NativePerformanceReport,
  options: NativeBudgetOptions
): NativeBudgetResult {
  const minSessions = options.minimumSessions ?? 3;
  const minFrames = options.minimumTimedFrames ?? 300;
  const maxNoise = options.maximumRelativeNoise ?? 0.05;
  if (!Number.isSafeInteger(minSessions) || minSessions < 3 || !Number.isSafeInteger(minFrames) || minFrames < 300 ||
      !Number.isFinite(maxNoise) || maxNoise < 0 || !Array.isArray(options.metrics) || !options.metrics.length) {
    throw new Error("invalid performance budget policy");
  }
  const names = new Set<string>();
  for (const metric of options.metrics) {
    if (!known(metric.name) || names.has(metric.name) || (metric.absoluteMax !== undefined && (!Number.isFinite(metric.absoluteMax) || metric.absoluteMax < 0))) {
      throw new Error("invalid or duplicate performance metric policy");
    }
    names.add(metric.name);
  }
  const candidateError = reportError(candidate, false, minSessions, minFrames);
  let error = reportError(baseline, true, minSessions, minFrames) ?? candidateError;
  if (!error && !sameIdentity(baseline.identity, candidate.identity)) error = "workload or device identity differs from baseline";
  if (!error && baseline.runId === candidate.runId) error = "baseline and candidate run IDs must be independent";
  if (!error && !sessionsIndependent(baseline, candidate)) error = "baseline and candidate sessions must be independent";
  let metrics: NativeMetricResult[];
  if (error) {
    metrics = options.metrics.map((policy) => {
      const result = { ...initialResult(policy, "initial"), reason: error! };
      // A separately defined absolute limit remains meaningful without a
      // usable historical baseline, but needs a valid candidate measurement.
      const values = candidateError ? null : valuesFor(candidate, policy.name);
      if (values) {
        result.candidateMedian = median(values);
        result.relativeCandidateNoise = relativeMad(values, result.candidateMedian);
        if (result.absolute && result.relativeCandidateNoise <= maxNoise) result.absolute.status = result.candidateMedian <= result.absolute.maximum ? "pass" : "fail";
      }
      return result;
    });
  } else {
    metrics = options.metrics.map((policy) => compareMetric(baseline, candidate, policy, maxNoise, "initial"));
    if (metrics.some((metric) => metric.rerunRequired) && options.rerun) {
      const rerun = options.rerun;
      const rerunError = reportError(rerun.baseline, true, minSessions, minFrames) ?? reportError(rerun.candidate, false, minSessions, minFrames) ??
        (!sameIdentity(baseline.identity, rerun.baseline.identity) || !sameIdentity(candidate.identity, rerun.candidate.identity) ? "rerun workload or device identity differs" : null) ??
        (rerun.baseline.baselineVersion !== baseline.baselineVersion || rerun.baseline.candidate.sourceSha256 !== baseline.candidate.sourceSha256 || rerun.candidate.candidate.sourceSha256 !== candidate.candidate.sourceSha256 ? "rerun source or baseline differs" : null) ??
        (new Set([baseline.runId, candidate.runId, rerun.baseline.runId, rerun.candidate.runId]).size !== 4 ||
          !sessionsIndependent(baseline, candidate, rerun.baseline, rerun.candidate) ? "rerun IDs and sessions must be independent" : null);
      metrics = metrics.map((metric, index) => {
        if (!metric.rerunRequired) return metric;
        if (rerunError) return { ...metric, reason: rerunError, rerunRequired: false, comparedRun: "rerun" };
        return compareMetric(rerun.baseline, rerun.candidate, options.metrics[index]!, maxNoise, "rerun");
      });
    }
  }
  // Explicitly unsupported metrics are excluded, never counted as passes; a
  // comparison with nothing left to compare is no-data.
  const compared = metrics.filter((metric) => metric.status !== "unsupported");
  const status = compared.some((metric) => metric.status === "regression" || metric.absolute?.status === "fail") ? "fail" :
    compared.some((metric) => metric.status === "inconclusive") ? "inconclusive" :
    !compared.length || compared.some((metric) => metric.status === "no-data") ? "no-data" : "pass";
  return { schema: "aura3d.native-budget/1", status,
    excludedUnsupported: metrics.filter((metric) => metric.status === "unsupported").map((metric) => metric.name), baselineVersion: baseline?.baselineVersion ?? null,
    baselineRunId: baseline?.runId ?? null, candidateRunId: candidate?.runId ?? null, metrics };
}
