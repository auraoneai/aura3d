import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectProviderEnvironment,
  redactReport,
  redactSecrets,
  type AISceneProviderMode,
  type AISceneReportEvidence,
  type AISceneReportInput,
  type AISceneUnsupportedCase
} from "../ai-scene-readiness/index";

export interface AISceneCompletionAuditReport {
  readonly schema: "a3d-ai-scene-completion-audit";
  readonly generatedAt: string;
  readonly pass: boolean;
  readonly inputs: AISceneReportInput;
  readonly evidence: readonly AISceneReportEvidence[];
  readonly providerMode: AISceneProviderMode;
  readonly networkUsed: false;
  readonly blockedClaims: readonly string[];
  readonly unsupportedCases: readonly AISceneUnsupportedCase[];
}

export interface AISceneCompletionAuditOptions {
  readonly root?: string;
  readonly providerMode?: AISceneProviderMode;
  readonly requiredReports?: readonly string[];
  readonly env?: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;
}

export const AI_SCENE_COMPLETION_AUDIT_REPORT = "tests/reports/ai-scene/completion-audit.json";

export const AI_SCENE_COMPLETION_REQUIRED_REPORTS = [
  "tests/reports/ai-scene/readiness.json",
  "tests/reports/ai-scene/route-health.json",
  "tests/reports/ai-scene/provider-contracts.json",
  "tests/reports/ai-scene/scene-ir-schema-audit.json",
  "tests/reports/ai-scene/prompt-to-scene-evidence.json",
  "tests/reports/ai-scene/scene-diff-audit.json",
  "tests/reports/ai-scene/cinematic-scene-report.json",
  "tests/reports/ai-scene/claim-scan.json",
  "tests/reports/ai-scene/quality.json",
  "tests/reports/ai-scene/report-freshness.json",
  "tests/reports/ai-scene/secret-audit.json"
] as const;

export function createAISceneCompletionAuditReport(options: AISceneCompletionAuditOptions = {}): AISceneCompletionAuditReport {
  const root = resolve(options.root ?? process.cwd());
  const providerMode = normalizeProviderMode(options.providerMode ?? options.env?.A3D_AI_SCENE_PROVIDER_MODE ?? "mock");
  const requiredReports = [...(options.requiredReports ?? AI_SCENE_COMPLETION_REQUIRED_REPORTS)];
  const evidence = requiredReports.map((path) => reportEvidence(root, path));
  const unsupportedCases: AISceneUnsupportedCase[] = [];
  const blockedClaims: string[] = [];

  for (const path of requiredReports) {
    const absolute = join(root, path);
    if (!existsSync(absolute)) {
      unsupportedCases.push({
        id: `missing-report:${path}`,
        severity: "blocked",
        detail: `Required AI scene report is missing: ${path}`,
        nextAction: `Run the producer for ${path} before completion audit.`
      });
      continue;
    }
    const parsed = readJsonReport(absolute);
    if (!hasRequiredReportShape(parsed)) {
      unsupportedCases.push({
        id: `invalid-shape:${path}`,
        severity: "blocked",
        detail: `${path} does not include the required AI scene report fields.`,
        nextAction: "Ensure report has schema, generatedAt, pass, inputs, evidence, providerMode, networkUsed, blockedClaims, and unsupportedCases."
      });
      continue;
    }
    if (parsed.networkUsed !== false) {
      unsupportedCases.push({
        id: `network-used:${path}`,
        severity: "blocked",
        detail: `${path} reports networkUsed=true.`,
        nextAction: "AI scene CI/report tooling must use mock or local deterministic mode by default."
      });
    }
    if (parsed.pass !== true) {
      unsupportedCases.push({
        id: `report-not-passing:${path}`,
        severity: "blocked",
        detail: `${path} is present but not passing.`,
        nextAction: "Resolve the report's blocked claims and unsupported cases."
      });
    }
    blockedClaims.push(...stringifyBlockedClaims(parsed.blockedClaims).map((entry) => `${path}: ${entry}`));
    for (const unsupported of stringifyUnsupportedCases(parsed.unsupportedCases)) {
      unsupportedCases.push({
        id: `upstream:${path}:${unsupported.slice(0, 48)}`,
        severity: "blocked",
        detail: `${path}: ${unsupported}`,
        nextAction: "Resolve upstream AI scene report unsupported case."
      });
    }
  }

  return {
    schema: "a3d-ai-scene-completion-audit",
    generatedAt: new Date().toISOString(),
    pass: unsupportedCases.length === 0 && blockedClaims.length === 0,
    inputs: {
      root: redactSecrets(relative(process.cwd(), root) || "."),
      providerMode,
      requiredFiles: [],
      requiredReports: requiredReports.map(redactSecrets),
      environment: collectProviderEnvironment(options.env ?? process.env)
    },
    evidence,
    providerMode,
    networkUsed: false,
    blockedClaims: blockedClaims.map(redactSecrets),
    unsupportedCases
  };
}

export function writeAISceneCompletionAuditReport(
  report: AISceneCompletionAuditReport = createAISceneCompletionAuditReport(),
  reportPath = AI_SCENE_COMPLETION_AUDIT_REPORT
): void {
  const path = resolve(reportPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(redactReport(report), null, 2)}\n`);
}

function reportEvidence(root: string, path: string): AISceneReportEvidence {
  const present = existsSync(join(root, path));
  return {
    id: path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(),
    path: redactSecrets(path),
    present,
    status: present ? "present" : "missing",
    detail: present ? `${path} exists.` : `${path} is missing.`
  };
}

function readJsonReport(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function hasRequiredReportShape(value: Record<string, unknown> | undefined): value is Record<string, unknown> & {
  readonly pass: boolean;
  readonly networkUsed: boolean;
  readonly blockedClaims: unknown;
  readonly unsupportedCases: unknown;
} {
  if (!value) return false;
  return typeof value.schema === "string"
    && typeof value.generatedAt === "string"
    && typeof value.pass === "boolean"
    && typeof value.inputs === "object"
    && Array.isArray(value.evidence)
    && typeof value.providerMode === "string"
    && typeof value.networkUsed === "boolean"
    && Array.isArray(value.blockedClaims)
    && Array.isArray(value.unsupportedCases);
}

function stringifyBlockedClaims(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => typeof entry === "string" ? entry : JSON.stringify(redactReport(entry)));
}

function stringifyUnsupportedCases(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === "string") return redactSecrets(entry);
    if (entry && typeof entry === "object" && "detail" in entry && typeof entry.detail === "string") return redactSecrets(entry.detail);
    return redactSecrets(JSON.stringify(redactReport(entry)));
  });
}

function normalizeProviderMode(value: unknown): AISceneProviderMode {
  return value === "live" || value === "local" ? value : "mock";
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createAISceneCompletionAuditReport();
  writeAISceneCompletionAuditReport(report);
  if (!report.pass) {
    console.error(`AI scene completion audit failed:\n${[
      ...report.blockedClaims,
      ...report.unsupportedCases.map((entry) => entry.detail)
    ].join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`AI scene completion audit passed. Report: ${AI_SCENE_COMPLETION_AUDIT_REPORT}`);
  }
}
