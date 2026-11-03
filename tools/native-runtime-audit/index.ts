/** Source provenance inventory and post-freeze offline-network analysis. */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertCandidateIdentity, type AcceptanceGate, type CandidateIdentity } from "../performance/native-benchmark";
import { collectDependencyGraph, type DependencyGraphReport } from "./dependency-graph";
import { collectSourceEvidence, type SourceEvidenceReport, type SourceFingerprint, type SourceProvenance } from "./source-evidence";
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
  sourcePaths?: string[];
  provenance?: Readonly<Record<string, SourceProvenance>>;
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
  unreviewedFileCount: number;
  independence: "not-established";
  unlockedProfiles: string[];
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
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

// Public and fixture trees can contain runtime inputs outside decoder folders,
// including ignored generated files copied by a site build. Inventory their
// actual contents rather than assuming a filename or directory allowlist.
export const defaultSourceAuditPaths = Object.freeze([
  "packages", "src", "workers", "tools", "examples", "templates", "apps", "tests", "marketing",
  "public", "fixtures"
]);

/** Do not interpret a fingerprint candidate as an authorship finding. */
export function summarizeSourceEvidence(dependencies: DependencyGraphReport, source: SourceEvidenceReport): {
  status: SourceAuditReport["status"]; unresolvedReviewCandidates: number; unreviewedFileCount: number;
  independence: "not-established"; unlockedProfiles: string[];
} {
  const records = new Map(source.files.map((file) => [file.path, file]));
  const unresolvedReviewCandidates = source.findings.filter((finding) => {
    const record = records.get(finding.path);
    return !record || record.replacementStatus === "unreviewed" || record.replacementStatus === "replacement-needed";
  }).length;
  const neededReplacement = source.files.filter((file) => file.replacementStatus === "replacement-needed").length;
  const unreviewedFileCount = source.files.filter((file) => file.replacementStatus === "unreviewed").length;
  const unlockedProfiles = dependencies.installProfiles.filter((profile) => !profile.lockfile).map((profile) => profile.path);
  return { status: dependencies.findings.length || neededReplacement ? "failed" : unresolvedReviewCandidates || unlockedProfiles.length ? "review-required" : "scan-complete",
    unresolvedReviewCandidates, unreviewedFileCount, independence: "not-established", unlockedProfiles };
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
  const dependencies = collectDependencyGraph(options.root, { payloads, installProfiles: options.installProfiles });
  const source = collectSourceEvidence(options.root, { paths: options.sourcePaths ?? defaultSourceAuditPaths,
    payloads, provenance: options.provenance, fingerprints: options.fingerprints });
  const summary = summarizeSourceEvidence(dependencies, source);
  return { schema: "aura3d.native-runtime-audit/1", phase: "source", ...summary,
    candidate: { sourceSha256: plan.source.inputDigest!, lockfileSha256: plan.source.lockfileSha256, candidatePlan: plan.reference, archives },
    dependencies, source,
    limitations: ["Source scan and fingerprint matches are leads for human or ledger review, not proof of authorship; absence of matches does not prove independence.",
      "The scan covers only the selected workspace roots and candidate archives as present in this checkout or staged snapshot, not other checkouts or deployment outputs.",
      "Git-ignored public or fixture files can be copied by site builds but omitted from staged source; per-file hashes do not establish inclusion in the candidate source manifest, archives, or deployed outputs.",
      "Unlocked profiles reveal declared dependencies but their complete transitive graphs remain unverified.",
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
    const profiles = [...activeTemplateProfiles(root), ...(existsSync(resolve(root, "marketing/package.json")) ? ["marketing"] : []), ...(values.get("--install-profile") ?? [])];
    const provenancePath = get("--provenance");
    const fingerprintsPath = get("--fingerprints");
    const provenance = provenancePath ? JSON.parse(readFileSync(resolve(root, provenancePath), "utf8")) as Record<string, SourceProvenance> : undefined;
    const fingerprints = fingerprintsPath ? JSON.parse(readFileSync(resolve(root, fingerprintsPath), "utf8")) as SourceFingerprint[] : undefined;
    result = runSourceAudit({ root, planPath: get("--candidate-plan") ?? process.env.A3D_RELEASE_PLAN ?? "",
      installProfiles: [...new Set(profiles)], provenance, fingerprints }, release.loadValidatedReleasePlan);
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
  if (result.status !== "scan-complete" && result.status !== "passed") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
