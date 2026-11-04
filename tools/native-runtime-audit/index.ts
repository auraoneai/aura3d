/** Source provenance inventory and post-freeze offline-network analysis. */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertCandidateIdentity, type AcceptanceGate, type CandidateIdentity } from "../performance/native-benchmark";
import { collectDependencyGraph, type DependencyGraphReport, type ReviewedUnresolvedDependency, type VirtualInstallProfile } from "./dependency-graph";
import { collectSourceEvidence, parseProvenanceRecord, type SourceCandidateClassReview, type SourceEvidenceReport, type SourceFingerprint,
  type SourceProvenance, type SourceReviewCandidate } from "./source-evidence";
import { inspectRuntimeNetwork, type RuntimeNetworkEvent, type RuntimeNetworkReport } from "./runtime-network";

interface ReleasePlan {
  reference: { path: string; sha256: string };
  source: { inputDigest?: string; lockfileSha256: string };
  packages: Array<{ name: string; tarball: string; sha256: string }>;
}
interface SourceAuditOptions {
  root: string;
  planPath: string;
  installProfiles?: string[];
  /** Standalone external comparison harnesses excluded from shipped profiles. */
  externalHarnesses?: string[];
  /** Install-time packed consumer profiles derived from the validated candidate plan. */
  consumerProfiles?: (plan: ReleasePlan) => VirtualInstallProfile[];
  /** Reviewed lock-unpinned dependency names that do not keep a projected profile incomplete. */
  reviewedUnresolved?: readonly ReviewedUnresolvedDependency[];
  sourcePaths?: string[];
  provenance?: Readonly<Record<string, SourceProvenance>>;
  classReviews?: readonly SourceCandidateClassReview[];
  fingerprints?: readonly SourceFingerprint[];
}
interface SourceAuditReport {
  schema: "aura3d.native-runtime-audit/1";
  phase: "source";
  status: "scan-complete" | "review-required" | "failed";
  candidate: { sourceSha256: string; lockfileSha256: string; candidatePlan: { path: string; sha256: string }; archives: Array<{ path: string; sha256: string }> };
  dependencies: DependencyGraphReport;
  source: SourceEvidenceReport;
  unresolvedReviewCandidates: number;
  /** New candidates in the reviewed scope (equations, fingerprints, recorded files) without a disposition; any fails. */
  unreviewedGatedCandidates: number;
  unreviewedGatedSample: Array<Pick<SourceReviewCandidate, "path" | "kind" | "detail" | "line">>;
  unreviewedFileCount: number;
  independence: "not-established";
  unlockedProfiles: string[];
  unprojectedProfiles: string[];
  limitations: string[];
}
interface NetworkObservation {
  schema: "aura3d.native-runtime-network/1";
  runId: string;
  candidate: CandidateIdentity;
  tests: Array<{ id: string; status: string; offline?: boolean; negativeControlBlocked?: boolean; projectSha256?: string;
    negativeControlEvent?: RuntimeNetworkEvent; fixtureSha256?: string; bundleSha256?: string;
    browserName?: string; browserVersion?: string; browserProject?: string; backend?: string }>;
  events: RuntimeNetworkEvent[];
}
interface BrowserAuditReport {
  schema: "aura3d.native-runtime-audit/1";
  phase: "browser";
  status: "passed" | "failed";
  runId: string;
  candidate: CandidateIdentity;
  observationSha256: string;
  tests: NetworkObservation["tests"];
  network: RuntimeNetworkReport;
  limitations: string[];
}

const hashPattern = /^[a-f0-9]{64}$/;
export const defaultProvenanceRecord = "docs/prds/aura3d-native-provenance-record.json";
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

// Public and fixture trees can contain runtime inputs outside decoder folders,
// including ignored generated files copied by a site build. Inventory their
// actual contents rather than assuming a filename or directory allowlist.
export const defaultSourceAuditPaths = Object.freeze([
  "packages", "src", "workers", "tools", "examples", "templates", "apps", "tests", "marketing",
  "public", "fixtures"
]);

/** Default scan roots that exist under `root`; absent ones (a staged candidate holds tracked files only) are skipped. */
export function presentSourceAuditPaths(root: string): string[] {
  return defaultSourceAuditPaths.filter((path) => existsSync(resolve(root, path)));
}

/** Do not interpret a fingerprint candidate as an authorship finding. */
export function summarizeSourceEvidence(dependencies: DependencyGraphReport, source: SourceEvidenceReport): {
  status: SourceAuditReport["status"]; unresolvedReviewCandidates: number; unreviewedGatedCandidates: number;
  unreviewedGatedSample: SourceAuditReport["unreviewedGatedSample"]; unreviewedFileCount: number;
  independence: "not-established"; unlockedProfiles: string[]; unprojectedProfiles: string[];
} {
  const recorded = new Set(source.files.filter((file) => file.replacementStatus !== "unreviewed").map((file) => file.path));
  // Only an explicit recorded disposition resolves a candidate, and not one that says the material still needs replacement.
  const unresolved = source.findings.filter((finding) => !finding.review || finding.review.disposition === "replacement-needed");
  const unresolvedReviewCandidates = unresolved.length;
  const gated = unresolved.filter((finding) => !finding.review && (finding.kind === "standardized-equation" || finding.kind === "fingerprint" ||
    recorded.has(finding.path) || recorded.has(finding.path.split("#", 1)[0]!)));
  const unreviewedGatedCandidates = Math.max(gated.length, source.candidateReview?.gatedUnreviewed ?? 0);
  const unreviewedGatedSample = gated.slice(0, 200).map(({ path, kind, detail, line }) => ({ path, kind, detail, ...(line !== undefined ? { line } : {}) }));
  const neededReplacement = source.files.filter((file) => file.replacementStatus === "replacement-needed").length;
  const unreviewedFileCount = source.files.filter((file) => file.replacementStatus === "unreviewed").length;
  const unlockedProfiles = dependencies.installProfiles.filter((profile) => !profile.lockfile).map((profile) => profile.path);
  // An unlocked profile stays a review item unless its workspace-lock projection resolved every dependency.
  const projected = new Set((dependencies.projectedProfiles ?? []).filter((profile) => profile.complete).map((profile) => profile.path));
  const unprojectedProfiles = unlockedProfiles.filter((path) => !projected.has(path));
  return { status: dependencies.findings.length || neededReplacement || unreviewedGatedCandidates ? "failed"
      : unresolvedReviewCandidates || unprojectedProfiles.length ? "review-required" : "scan-complete",
    unresolvedReviewCandidates, unreviewedGatedCandidates, unreviewedGatedSample, unreviewedFileCount, independence: "not-established", unlockedProfiles, unprojectedProfiles };
}

const FAILURE_FINDING_LIMIT = 40;
const oneLine = (text: string, max = 220): string => { const flat = text.replace(/\s+/g, " ").trim(); return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat; };

/**
 * Concise human-readable reason for a non-passing audit: status, counts by kind, the first findings with
 * path and reason, and unresolved review candidate samples. The full report is still written to `--out`
 * or NATIVE_REPORT_DIR; this text exists so a CI log that only keeps stdout/stderr names the cause.
 */
export function formatAuditFailureSummary(result: SourceAuditReport | BrowserAuditReport): string {
  const lines: string[] = [];
  const bullet = (text: string) => lines.push(`  - ${oneLine(text)}`);
  if (result.phase === "browser") {
    lines.push(`[native-runtime-audit] phase=browser status=${result.status} observedEvents=${result.network.events.length} findings=${result.network.findings.length} unexpected=${result.network.unexpected.length}`);
    for (const test of result.tests.filter((item) => item.status !== "passed")) bullet(`test ${test.id}: status ${test.status}`);
    for (const finding of result.network.findings.slice(0, FAILURE_FINDING_LIMIT)) bullet(`network ${finding.kind} (event ${finding.event}): ${finding.description}`);
    for (const event of result.network.unexpected.slice(0, FAILURE_FINDING_LIMIT)) bullet(`unexpected request: ${event.resourceType} ${event.url}`);
    if (!result.network.findings.length && !result.network.unexpected.length && !result.tests.some((item) => item.status !== "passed") && result.network.events.length) {
      bullet(`${result.network.events.length} request(s) were observed but the offline fixture requires none`);
    }
    return `${lines.join("\n")}\n`;
  }
  const unresolved = result.source.findings.filter((finding) => !finding.review || finding.review.disposition === "replacement-needed");
  const byKind = new Map<string, number>();
  for (const finding of unresolved) byKind.set(finding.kind, (byKind.get(finding.kind) ?? 0) + 1);
  const kinds = [...byKind].sort((left, right) => right[1] - left[1]).map(([kind, count]) => `${kind}=${count}`).join(" ") || "none";
  const neededReplacement = result.source.files.filter((file) => file.replacementStatus === "replacement-needed");
  lines.push(`[native-runtime-audit] phase=source status=${result.status} dependencyFindings=${result.dependencies.findings.length} ` +
    `replacementNeededFiles=${neededReplacement.length} unreviewedGatedCandidates=${result.unreviewedGatedCandidates} ` +
    `unresolvedReviewCandidates=${result.unresolvedReviewCandidates} (${kinds}) unprojectedProfiles=${result.unprojectedProfiles.length} ` +
    `files=${result.source.files.length} archives=${result.candidate.archives.length}`);
  const rows: string[] = [];
  for (const finding of result.dependencies.findings) {
    rows.push(`dependency ${finding.disposition}: ${finding.name} ${finding.edge.specifier} (${finding.edge.field}) in ${finding.edge.owner} [${finding.edge.document}]`);
  }
  for (const file of neededReplacement) rows.push(`replacement-needed file: ${file.path}`);
  for (const sample of result.unreviewedGatedSample) {
    rows.push(`unreviewed gated ${sample.kind}: ${sample.path}${sample.line !== undefined ? `:${sample.line}` : ""} ${sample.detail}`);
  }
  const profiles = new Map((result.dependencies.projectedProfiles ?? []).map((profile) => [profile.path, profile]));
  for (const path of result.unprojectedProfiles) {
    const profile = profiles.get(path);
    const detail = profile
      ? [...profile.unresolved.map((item) => `unresolved ${item.name}@${item.specifier} (owner ${item.owner})`), ...profile.prohibited.map((name) => `prohibited ${name}`)].join("; ")
      : "no projection was produced";
    rows.push(`unprojected install profile: ${path}: ${detail || "projection incomplete"}`);
  }
  lines.push(`findings (first ${Math.min(rows.length, FAILURE_FINDING_LIMIT)} of ${rows.length}):`);
  for (const row of rows.slice(0, FAILURE_FINDING_LIMIT)) bullet(row);
  if (unresolved.length) {
    lines.push(`unresolved review candidates (first ${Math.min(unresolved.length, 20)} of ${unresolved.length}):`);
    for (const finding of unresolved.slice(0, 20)) {
      bullet(`${finding.kind}: ${finding.path}${finding.line !== undefined ? `:${finding.line}` : ""} ${finding.detail}${finding.review ? ` [review: ${finding.review.disposition}]` : ""}`);
    }
  }
  if (!rows.length && !unresolved.length) bullet(`status ${result.status} without a finding; unreviewed files=${result.unreviewedFileCount} unlockedProfiles=${result.unlockedProfiles.length}`);
  return `${lines.join("\n")}\n`;
}

/** Entry-point failure text: the stack for a crash, so an unexpected exception never exits silently. */
export function formatAuditCrash(error: unknown): string {
  return `[native-runtime-audit] crashed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`;
}

/** Determine active published scaffolds from the actual create-aura3d catalog. */
export function activeTemplateProfiles(root: string): string[] {
  const path = resolve(root, "packages/create-aura3d/src/index.ts");
  const content = readFileSync(path, "utf8");
  const match = /export\s+const\s+CREATE_AURA3D_TEMPLATES\s*=\s*\[([\s\S]*?)\]\s+as\s+const\s*;/.exec(content);
  if (!match) throw new Error("Cannot resolve the active create-aura3d template catalog");
  const names = [...match[1]!.matchAll(/"([a-z0-9-]+)"\s*,?/g)].map((item) => item[1]!);
  if (!names.length || new Set(names).size !== names.length || match[1]!.replace(/"[a-z0-9-]+"\s*,?/g, "").trim()) {
    throw new Error("Active template catalog contains unsupported or duplicate entries");
  }
  return names.map((name) => {
    const path = `packages/create-aura3d/templates/${name}`;
    if (!existsSync(resolve(root, path, "package.json"))) throw new Error(`Active template manifest is missing: ${path}`);
    return path;
  });
}

/**
 * Every install profile the source pass must prove engine-free, plus the
 * external comparison harnesses recorded as excluded (S5-WP19-07 decision):
 * root workspace (always scanned with its lock), every create-aura3d template,
 * every root template and app project with a manifest, and marketing.
 * `apps/showcase-kits` and `benchmarks/*` are standalone three.js/Babylon
 * comparison harnesses outside the workspace and lockfile; they are never
 * installed, packed or shipped and so are recorded, not profiled.
 */
export const externalComparisonHarnessRoots = Object.freeze(["apps/showcase-kits", "benchmarks"]);
export function installProfileInventory(root: string): { profiles: string[]; externalHarnesses: string[] } {
  const base = resolve(root);
  const isHarness = (path: string) => externalComparisonHarnessRoots.some((harness) => path === harness || path.startsWith(`${harness}/`));
  const children = (directory: string): string[] => existsSync(resolve(base, directory))
    ? readdirSync(resolve(base, directory), { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => `${directory}/${entry.name}`).filter((path) => existsSync(resolve(base, path, "package.json"))).sort()
    : [];
  const profiles = [
    ...activeTemplateProfiles(root), ...children("packages/create-aura3d/templates"), ...children("templates"),
    ...children("apps").filter((path) => !isHarness(path)), ...(existsSync(resolve(base, "marketing/package.json")) ? ["marketing"] : [])
  ];
  const externalHarnesses = [
    ...(existsSync(resolve(base, "apps/showcase-kits")) ? ["apps/showcase-kits"] : []), ...children("benchmarks")
  ];
  return { profiles: [...new Set(profiles)], externalHarnesses };
}

/** Packed consumer projects: one synthesized manifest per consumer-matrix cell, over the candidate archives. */
export function packedConsumerProfiles(cells: readonly { id: string }[], manifestFor: (cell: { id: string }) => Record<string, unknown>): VirtualInstallProfile[] {
  return cells.map((cell) => ({ path: `packed-consumer/${cell.id}`, manifest: manifestFor(cell) }));
}

/** The loader must validate source identity and every archive before returning. */
export function runSourceAudit(options: SourceAuditOptions, loadPlan: (root: string, path: string) => ReleasePlan | null): SourceAuditReport {
  if (!options.planPath) throw new Error("Source audit requires a validated candidate release plan");
  const plan = loadPlan(options.root, options.planPath);
  if (!plan || !hashPattern.test(plan.source.inputDigest ?? "") || !hashPattern.test(plan.source.lockfileSha256 ?? "") ||
      !hashPattern.test(plan.reference?.sha256 ?? "") || !Array.isArray(plan.packages) || !plan.packages.length) {
    throw new Error("Candidate plan lacks source, lockfile, plan or archive identity");
  }
  const archives = plan.packages.map((item) => ({ path: item.tarball, sha256: item.sha256 }));
  if (new Set(archives.map((item) => item.path)).size !== archives.length || archives.some((item) => !item.path || !hashPattern.test(item.sha256))) {
    throw new Error("Candidate archive inventory is missing, invalid or duplicated");
  }
  const payloads = archives.map((archive) => archive.path);
  const harnesses = new Set(options.externalHarnesses ?? []);
  const shipped = (options.installProfiles ?? []).filter((path) => !harnesses.has(path));
  if (shipped.length !== (options.installProfiles ?? []).length) throw new Error("An external comparison harness may not be a shipped install profile");
  const dependencies = collectDependencyGraph(options.root, { payloads, installProfiles: shipped,
    virtualProfiles: options.consumerProfiles?.(plan), externalHarnesses: options.externalHarnesses, reviewedUnresolved: options.reviewedUnresolved });
  // Default roots that a staged candidate omits (for example untracked-only trees) are skipped; explicitly requested paths still fail when missing.
  const source = collectSourceEvidence(options.root, { paths: options.sourcePaths ?? presentSourceAuditPaths(options.root),
    payloads, provenance: options.provenance, classReviews: options.classReviews, fingerprints: options.fingerprints });
  const summary = summarizeSourceEvidence(dependencies, source);
  return { schema: "aura3d.native-runtime-audit/1", phase: "source", ...summary,
    candidate: { sourceSha256: plan.source.inputDigest!, lockfileSha256: plan.source.lockfileSha256, candidatePlan: plan.reference, archives },
    dependencies, source,
    limitations: ["Source scan and fingerprint matches are leads for human or ledger review, not proof of authorship; absence of matches does not prove independence.",
      "The scan covers only the selected workspace roots and candidate archives as present in this checkout or staged snapshot, not other checkouts or deployment outputs.",
      "Git-ignored public or fixture files can be copied by site builds but omitted from staged source; per-file hashes do not establish inclusion in the candidate source manifest, archives, or deployed outputs.",
      "Unlocked profiles are projected onto the root pnpm lock (dependencies.projectedProfiles); a registry install can resolve their ranges differently, so the projection is review evidence rather than an install receipt.",
      "Install profiles cover the root workspace, every create-aura3d and root template, every app project and marketing, plus one synthesized packed-consumer profile per consumer-matrix cell; apps/showcase-kits and benchmarks/* are recorded external comparison harnesses (dependencies.externalHarnesses), excluded from shipped profiles.",
      "Runtime network capture has not run in the source phase; browser acceptance requires the global gate."] };
}

export interface BrowserAuditOptions { root: string; gatePath: string; sourceReport: string; networkReport: string; runId: string }

/** Browser observations are not opened until the real global gate accepts the source report. */
export async function runBrowserAudit(options: BrowserAuditOptions,
  validateGate: (input: { root: string; gatePath: string; sourceReport: string }) => BrowserAcceptanceGate | Promise<BrowserAcceptanceGate>
): Promise<BrowserAuditReport> {
  if (!options.gatePath || !options.sourceReport || !options.networkReport || !options.runId) {
    throw new Error("Browser audit requires a gate, gate-bound matrix source report, acceptance run ID and network report");
  }
  const gate = await validateGate({ root: options.root, gatePath: options.gatePath, sourceReport: options.sourceReport });
  if (gate.matrixSourceReport?.path !== options.sourceReport) throw new Error("Offline audit requires the gate-bound matrix source report");
  const path = resolve(options.root, options.networkReport), stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Network report must be a regular file");
  const bytes = readFileSync(path);
  const observation = JSON.parse(bytes.toString("utf8")) as NetworkObservation;
  if (!observation || observation.schema !== "aura3d.native-runtime-network/1" || observation.runId !== options.runId ||
      !Array.isArray(observation.tests) || !Array.isArray(observation.events)) throw new Error("Missing or mismatched network observation identity");
  assertCandidateIdentity(observation.candidate, gate);
  const expected = ["native-offline-independence"];
  const names = observation.tests.map((test) => test?.id);
  if (names.length !== expected.length || new Set(names).size !== expected.length || expected.some((id) => !names.includes(id))) {
    throw new Error("Network observation test inventory is incomplete or duplicated");
  }
  const test = observation.tests[0]!;
  if (!["passed", "failed"].includes(test.status) || (test.status === "passed" && (test.offline !== true || test.negativeControlBlocked !== true))) {
    throw new Error("Offline test outcome lacks required control observations");
  }
  const control = test.negativeControlEvent;
  if (test.status === "passed" && (!control || control.url !== "https://aura3d-offline-probe.invalid/control" ||
      control.resourceType !== "fetch" || control.method !== "GET" || control.failure !== "failed")) {
    throw new Error("Offline test outcome lacks the recorded failed negative control request");
  }
  if (test.status === "passed" && (![test.projectSha256, test.fixtureSha256, test.bundleSha256].every((value) => typeof value === "string" && hashPattern.test(value)) ||
      ![test.browserName, test.browserVersion, test.browserProject, test.backend].every((value) => typeof value === "string" && value.trim().length > 0))) {
    throw new Error("Offline test outcome lacks browser, fixture or consumer identity");
  }
  const network = inspectRuntimeNetwork(observation.events);
  return { schema: "aura3d.native-runtime-audit/1", phase: "browser",
    // The fixture producer requires zero observed requests, even for normally
    // permitted local/data/blob URLs. Classification alone is less strict.
    status: test.status === "passed" && observation.events.length === 0 && network.findings.length === 0 ? "passed" : "failed",
    runId: observation.runId, candidate: observation.candidate, observationSha256: sha256(bytes), tests: observation.tests, network,
    limitations: ["This result covers the exercised packed-consumer fixture, not all code paths or devices.",
      "URL references are review candidates; request observation or its absence does not establish authorship or response contents."] };
}

interface BrowserAcceptanceGate extends AcceptanceGate { matrixSourceReport: { path: string; sha256: string } }

async function main(): Promise<void> {
  const args = process.argv.slice(2), values = new Map<string, string[]>();
  const allowed = ["--phase", "--candidate-plan", "--install-profile", "--provenance", "--fingerprints", "--out", "--gate", "--source-report", "--network-report", "--run-id"];
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index], value = args[index + 1];
    if (!name || !allowed.includes(name) || !value || value.startsWith("--") || (name !== "--install-profile" && values.has(name))) {
      throw new Error("Usage: native-runtime-audit --phase source|browser [--candidate-plan file] [--gate file] [--source-report file] [--network-report file] [--run-id id] [--out file]");
    }
    values.set(name, [...(values.get(name) ?? []), value]);
  }
  const get = (name: string) => values.get(name)?.[0];
  const root = process.cwd();
  let result: SourceAuditReport | BrowserAuditReport;
  if (get("--phase") === "source") {
    const release = await import(pathToFileURL(resolve(root, "tools/release/exact-release-plan.mjs")).href) as {
      loadValidatedReleasePlan(root: string, path: string): ReleasePlan | null;
    };
    const inventory = installProfileInventory(root);
    const profiles = [...inventory.profiles, ...(values.get("--install-profile") ?? [])];
    const matrix = await import(pathToFileURL(resolve(root, "tools/native-consumer-matrix/index.ts")).href) as {
      matrixCells(): { id: string }[]; projectManifest(root: string, cell: { id: string }, plan: unknown): Record<string, unknown>;
    };
    // The reviewed provenance record applies by default so recorded dispositions resolve their candidates.
    const provenancePath = get("--provenance") ?? (existsSync(resolve(root, defaultProvenanceRecord)) ? defaultProvenanceRecord : undefined);
    const fingerprintsPath = get("--fingerprints");
    const record = provenancePath ? parseProvenanceRecord(JSON.parse(readFileSync(resolve(root, provenancePath), "utf8"))) : undefined;
    const fingerprints = fingerprintsPath ? JSON.parse(readFileSync(resolve(root, fingerprintsPath), "utf8")) as SourceFingerprint[] : undefined;
    result = runSourceAudit({ root, planPath: get("--candidate-plan") ?? process.env.A3D_RELEASE_PLAN ?? "",
      installProfiles: [...new Set(profiles)], externalHarnesses: inventory.externalHarnesses,
      consumerProfiles: (plan) => packedConsumerProfiles(matrix.matrixCells(), (cell) => matrix.projectManifest(root, cell, plan)),
      provenance: record?.provenance, classReviews: record ? [...record.classReviews, ...record.pathScopedReviews] : undefined,
      reviewedUnresolved: record?.reviewedUnresolvedDependencies, fingerprints }, release.loadValidatedReleasePlan);
  } else if (get("--phase") === "browser") {
    const module = await import(pathToFileURL(resolve(root, "tools/native-capability-gate/index.mjs")).href) as {
      validateAcceptanceGate(input: { root: string; gatePath: string; sourceReport: string }): BrowserAcceptanceGate | Promise<BrowserAcceptanceGate>;
    };
    result = await runBrowserAudit({ root, gatePath: get("--gate") ?? process.env.AURA3D_CODE_COMPLETE_GATE ?? "",
      sourceReport: get("--source-report") ?? process.env.NATIVE_MATRIX_SOURCE_REPORT ?? "",
      networkReport: get("--network-report") ?? process.env.NATIVE_NETWORK_REPORT ?? "",
      runId: get("--run-id") ?? process.env.NATIVE_ACCEPTANCE_RUN_ID ?? "" }, module.validateAcceptanceGate);
  } else throw new Error("--phase must be source or browser");
  const out = get("--out") ?? (process.env.NATIVE_REPORT_DIR && result.phase === "source" ? resolve(process.env.NATIVE_REPORT_DIR, "native-runtime-audit.json") : undefined);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (out) { const path = resolve(root, out); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, json); }
  else process.stdout.write(json);
  if (result.status !== "scan-complete" && result.status !== "passed") {
    process.stderr.write(formatAuditFailureSummary(result));
    if (out) process.stderr.write(`[native-runtime-audit] full report: ${resolve(root, out)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { process.stderr.write(formatAuditCrash(error)); process.exitCode = 1; });
}
