export const SOURCE5_REPORT_SCHEMA: 'aura3d.source5-report/2';
export const SOURCE5_STAGE_SCHEMA: 'aura3d.source5-report/1';
export const GATE_INPUTS_SCHEMA: 'aura3d.source5-gate-inputs/1';
export const SOURCE_MANIFEST_SCHEMA: 'aura3d.native-source-manifest/1';
export const SOURCE_MANIFEST_FILE: 'source-manifest.json';
export const ARTIFACTS_SCHEMA: 'aura3d.source5-artifacts/1';
export const CONSUMERS_SCHEMA: 'aura3d.source5-consumers/1';
export const REUSED_IMAGE: 'reused-image';
export const ACCEPTANCE_EVIDENCE_LIST: string;
export const DEFAULT_SCOPE: string;

export interface Source5ExpectedCheck { readonly id: string; readonly section4: string | null; readonly from: readonly string[]; readonly runner?: string; readonly satisfiedBy?: string }
export interface Source5VerifyOnlyRow { readonly checks: readonly string[]; readonly requiresDone?: readonly string[]; readonly basis: string }
export interface Source5FileRef { path: string; sha256: string }
export interface Source5Command { runId: string; stage: string; id: string; exitCode: number; seconds: number; command: string }
export interface Source5Check { id: string; section4Command: string | null; runnerCheckFor?: string; satisfiedBy?: string; status: 'passed' | 'failed'; commands: Source5Command[]; artifacts: Source5FileRef[] }
export interface Source5Archive { name: string; version: string; tarball: string; path: string; jobPath: string; sha256: string; integrity: string }
export interface Source5ConsumerReportRef { path: string; jobPath: string; sha256: string }
export interface Source5ConsumerReports {
  runId: string; index: Source5FileRef; sourceConsumerReport: Source5ConsumerReportRef; matrixSourceReport: Source5ConsumerReportRef;
  examplesSourceReport: Source5ConsumerReportRef; examples: { runId: string; index: Source5FileRef; shards: number; shardIndexes: Array<{ shard: number; path: string; sha256: string }> }; files: Source5ConsumerReportRef[];
}
export interface Source5OutcomeCompletion { id: string; basis: 'done-marker' | 'verified-checks'; checks?: string[]; requiresDone?: string[] }
export interface Source5GateInputs {
  schema: 'aura3d.source5-gate-inputs/1'; acceptance: 'not-run'; browserAcceptance: 'not-run'; sourceRunner: 'acr-source5'; runId: string;
  runs: Array<{ dir: string; runId: string; sourceReport: Source5FileRef; stagesRun: string[] }>;
  candidate: { commit: string; sourceManifestSha256: string; lockfileSha256: string };
  sourceManifest: Source5FileRef; releaseKind: 'patch' | 'minor' | 'major'; unitShards: number;
  stageSources: Record<string, { runId: string; stageReport: Source5FileRef; log: Source5FileRef }>;
  checks: Source5Check[]; expectedCheckIds: string[]; executedCheckIds: string[]; passingCheckIds: string[];
  candidatePlan: Source5ConsumerReportRef; archives: Source5Archive[]; archiveBinding: 'retained-rehashed'; consumerReports: Source5ConsumerReports; deferredToAcceptance: string[];
  scope: string; completedOutcomeIds: string[]; outcomeCompletion: Source5OutcomeCompletion[];
}
export interface ScopeLike { rows: Array<{ id: string; remaining: string }>; required: string[] }

export const STAGE_COMMANDS: Readonly<Record<'static' | 'suites' | 'packed-a' | 'packed-b1' | 'packed-b2', readonly string[]>>;
/** Commands of every example shard stage `packed-c<I>` (I = 1..N), in run order. */
export const EXAMPLE_SHARD_COMMANDS: readonly string[];
export const EXPECTED_CHECKS: readonly Source5ExpectedCheck[];
export const VERIFY_ONLY_ROWS: Readonly<Record<string, Source5VerifyOnlyRow>>;
export function stageCommandIds(stage: string): readonly string[] | null;
export class Source5GateInputsError extends Error { problems: string[]; constructor(problems: string[]) }
export function rowIsDone(row: { remaining?: string } | null | undefined): boolean;
export function deriveCompletion(scope: ScopeLike, passingCheckIds: readonly string[], table?: Readonly<Record<string, Source5VerifyOnlyRow>>): { problems: string[]; completedOutcomeIds: string[]; completion: Source5OutcomeCompletion[] };
export function buildGateInputs(options: { root?: string; runDirs: string[]; scopePath?: string; out?: string; verifyOnlyRows?: Readonly<Record<string, Source5VerifyOnlyRow>> }): { sourceManifest: Source5FileRef; sourceReports: Source5FileRef; reports: Source5GateInputs };
export function verifySource5GateInputs(options: { reports: unknown; manifestRef: Source5FileRef; scope: ScopeLike; io: { read(path: string): Buffer; exists(path: string): boolean } }): { value: Omit<Source5GateInputs, 'schema' | 'acceptance' | 'browserAcceptance' | 'sourceRunner' | 'runId' | 'runs' | 'scope' | 'completedOutcomeIds' | 'outcomeCompletion'>; used: string[] };
