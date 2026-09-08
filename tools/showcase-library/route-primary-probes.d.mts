import type { ShowcaseRouteGate, ShowcaseRouteGateConfig } from "./route-gates.mjs";

export const ROUTE_PRIMARY_PROBE_PRODUCER_ID: "route-primary-probes";
export const ROUTE_PRIMARY_PROBE_PRODUCER_VERSION: "1.1";
export const routePrimaryProbeSchema: "aura3d-route-primary-probe/1.0";
export const routePrimaryProbeReportDirRelativePath: "tests/reports/showcase-route-primary-probes";
export const routePrimaryProbeThresholds: Readonly<{
  minNonBlankPixels: 2500; minColorBuckets: 8; minForegroundWidth: 96;
  minForegroundHeight: 72; minReadabilityScore: 35;
}>;
export const routePrimaryProbeSummarySchema: "aura3d-route-primary-probe-summary/2.0";
export const routePrimaryProbeFullSummaryRelativePath: "tests/reports/showcase-route-primary-probes/_summary.json";
export const routePrimaryProbeTargetedSummaryRelativePath: "tests/reports/showcase-route-primary-probes/_summary.targeted.json";
export type RoutePrimaryProbeRunScope = "full" | "targeted";
export interface RoutePrimaryProbeOutcome {
  readonly routeId: string;
  readonly pass: boolean;
  readonly failures?: readonly string[];
  readonly evidencePath?: string;
  readonly screenshotPath?: string;
}
export interface RoutePrimaryProbeVerdict extends RoutePrimaryProbeOutcome {
  readonly verdict: "pass" | "fail";
  readonly allowedToFail: boolean;
  readonly blocking: boolean;
  readonly failures: readonly string[];
}
export interface RoutePrimaryProbeSummary {
  readonly schema: typeof routePrimaryProbeSummarySchema;
  readonly generatedAt: string;
  readonly runScope: RoutePrimaryProbeRunScope;
  readonly evidenceLabel: "structural/image QA pass";
  readonly humanVisualApproval: false;
  readonly humanVisualApprovalNote: string;
  readonly summaryPath: string;
  readonly routeGateConfig: { readonly path: string; readonly schema: string | undefined; readonly hash: string };
  readonly selectedRouteIds: readonly string[];
  readonly expectedRouteIds: readonly string[];
  readonly expectedRouteCount: number;
  readonly executedRouteIds: readonly string[];
  readonly executedRouteCount: number;
  readonly missingRouteIds: readonly string[];
  readonly failingRouteIds: readonly string[];
  readonly blockingRouteIds: readonly string[];
  readonly pass: boolean;
  readonly routeVerdicts: readonly RoutePrimaryProbeVerdict[];
  readonly routes: readonly RoutePrimaryProbeVerdict[];
}
export interface RoutePrimaryProbeContext {
  readonly schema: typeof routePrimaryProbeSchema;
  readonly routeId: string;
  readonly routePath: string;
  readonly appId: string;
  readonly sourceHash: string;
  readonly routeGateHash: string;
  readonly rendererFingerprint: string;
  readonly producerFingerprint: string;
  readonly producerId: typeof ROUTE_PRIMARY_PROBE_PRODUCER_ID;
  readonly producerVersion: typeof ROUTE_PRIMARY_PROBE_PRODUCER_VERSION;
  readonly routeHealthHash: string | undefined;
  readonly routePrimaryHeroAsset: string | undefined;
  readonly secondaryPrimaryAssets: readonly string[];
  readonly primaryAssets: readonly {
    readonly id: string; readonly role: string; readonly expectedTypedRef: string;
    readonly manifestHash: string | undefined; readonly routePrimaryEvidenceTarget: boolean;
    readonly evidenceMode: "route-primary-foreground" | "secondary-present";
  }[];
}
/** Validators deliberately retain untrusted JSON; callers must narrow it before use. */
export interface RoutePrimaryProbeValidation {
  readonly ok: boolean;
  readonly required: boolean;
  readonly path: string | null;
  readonly screenshotPath: string | null;
  readonly failures: string[];
  readonly evidence: unknown;
}
export function routePrimaryProbeSummaryRelativePath(runScope: RoutePrimaryProbeRunScope): string;
export function routePrimaryProbeSummaryPath(runScope: RoutePrimaryProbeRunScope, root?: string): string;
export function routePrimaryProbeExpectedRouteIds(routes: readonly ShowcaseRouteGate[]): string[];
export function routePrimaryProbeIsFrozen(route: { readonly retainedEvidenceFrozen?: boolean } | null | undefined): boolean;
export function createRoutePrimaryProbeSummary(input: {
  readonly runScope: RoutePrimaryProbeRunScope;
  readonly routes: readonly ShowcaseRouteGate[];
  readonly selectedRouteIds?: readonly string[];
  readonly outcomes: readonly RoutePrimaryProbeOutcome[];
  readonly routeGateConfig?: Pick<ShowcaseRouteGateConfig, "schema">;
  readonly routeGateConfigHash: string;
  readonly generatedAt?: string;
  readonly root?: string;
}): RoutePrimaryProbeSummary;
export function routeAllowsFailingRoutePrimaryProbe(routeId: string, root?: string): boolean;
export function validateRoutePrimaryProbeSummary(options?: {
  readonly root?: string; readonly path?: string;
  readonly requiredRouteIds?: readonly string[]; readonly routeGateConfigHash?: string;
}): { readonly ok: boolean; readonly path: string; readonly summary: unknown; readonly requiredRouteIds: string[]; readonly failures: string[] };
export function routePrimaryProbeEvidencePath(routeId: string, root?: string): string;
export function routePrimaryProbeScreenshotPath(routeId: string, root?: string): string;
export function routePrimaryProbeRelativeEvidencePath(routeId: string): string;
export function routePrimaryProbeRelativeScreenshotPath(routeId: string): string;
export function createRoutePrimaryProbeContext(route: ShowcaseRouteGate, root?: string): RoutePrimaryProbeContext;
export function validateRoutePrimaryProbeEvidence(route: ShowcaseRouteGate, options?: {
  readonly root?: string; readonly evidencePath?: string; readonly requireScreenshot?: boolean;
}): RoutePrimaryProbeValidation;
export function validateRoutePrimaryProbeEvidenceRecord(route: ShowcaseRouteGate, evidence: unknown, options?: {
  readonly root?: string; readonly path?: string; readonly requireScreenshot?: boolean;
}): RoutePrimaryProbeValidation;
export function createRouteSourceHash(routeId: string, root?: string): string;
export const ROUTE_HEALTH_COMPOSITION_OWNED_FIELDS: readonly ["gameAssetPairEvidence"];
export const ROUTE_HEALTH_COMPOSITION_OWNED_DIGEST_FIELDS: readonly ["screenshotSha256", "routePrimaryScreenshotSha256"];
export function hashRouteHealthDependency(path: string): string;
export function hashFile(path: string): string;
