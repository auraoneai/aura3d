import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type AISceneProviderMode = "mock" | "live" | "local";

export interface AISceneReportEvidence {
  readonly id: string;
  readonly path: string;
  readonly present: boolean;
  readonly status: "present" | "missing";
  readonly detail: string;
}

export interface AISceneUnsupportedCase {
  readonly id: string;
  readonly severity: "info" | "warning" | "blocked";
  readonly detail: string;
  readonly nextAction: string;
}

export interface AISceneReportInput {
  readonly root: string;
  readonly providerMode: AISceneProviderMode;
  readonly requiredFiles: readonly string[];
  readonly requiredReports: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
}

export interface AISceneReadinessReport {
  readonly schema: "a3d-ai-scene-readiness";
  readonly generatedAt: string;
  readonly pass: boolean;
  readonly inputs: AISceneReportInput;
  readonly evidence: readonly AISceneReportEvidence[];
  readonly providerMode: AISceneProviderMode;
  readonly networkUsed: false;
  readonly blockedClaims: readonly string[];
  readonly unsupportedCases: readonly AISceneUnsupportedCase[];
}

export interface AISceneReadinessOptions {
  readonly root?: string;
  readonly providerMode?: AISceneProviderMode;
  readonly requiredFiles?: readonly string[];
  readonly requiredReports?: readonly string[];
  readonly env?: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;
}

export const AI_SCENE_READINESS_REPORT = "tests/reports/ai-scene/readiness.json";

export const AI_SCENE_REQUIRED_FILES = [
  "RuntimeScenePRD.md",
  "packages/ai-scene/src/index.ts",
  "packages/ai-scene/src/AuraSceneIR.ts",
  "packages/ai-scene/src/AuraSceneCompiler.ts",
  "packages/ai-scene/src/providers/MockProvider.ts",
  "apps/aura-prompt-to-scene/index.html",
  "apps/aura-cinematic-prompt-lab/index.html",
  "apps/aura-scene-diff-editor/index.html",
  "apps/aura-shot-director/index.html",
  "apps/aura-world-builder/index.html",
  "docs/ai-scene/overview.md"
] as const;

export const AI_SCENE_REQUIRED_REPORTS = [
  "tests/reports/ai-scene/route-health.json",
  "tests/reports/ai-scene/claim-scan.json",
  "tests/reports/ai-scene/provider-contracts.json",
  "tests/reports/ai-scene/scene-ir-schema-audit.json",
  "tests/reports/ai-scene/prompt-to-scene-evidence.json",
  "tests/reports/ai-scene/scene-diff-audit.json",
  "tests/reports/ai-scene/cinematic-scene-report.json",
  "tests/reports/ai-scene/quality.json",
  "tests/reports/ai-scene/report-freshness.json",
  "tests/reports/ai-scene/secret-audit.json"
] as const;

const secretEnvironmentKeys = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "AURA_AI_API_KEY",
  "A3D_AI_API_KEY",
  "LOCAL_MODEL_API_KEY"
] as const;

export function createAISceneReadinessReport(options: AISceneReadinessOptions = {}): AISceneReadinessReport {
  const root = resolve(options.root ?? process.cwd());
  const providerMode = normalizeProviderMode(options.providerMode ?? options.env?.A3D_AI_SCENE_PROVIDER_MODE ?? "mock");
  const requiredFiles = [...(options.requiredFiles ?? AI_SCENE_REQUIRED_FILES)];
  const requiredReports = [...(options.requiredReports ?? AI_SCENE_REQUIRED_REPORTS)];
  const requiredPaths = [...requiredFiles, ...requiredReports];
  const evidence = requiredPaths.map((path) => evidenceForPath(root, path));
  const unsupportedCases = evidence
    .filter((entry) => !entry.present)
    .map((entry): AISceneUnsupportedCase => ({
      id: `missing:${entry.path}`,
      severity: "blocked",
      detail: `${entry.path} is required by the AI scene runtime plan but is not present.`,
      nextAction: `Create ${entry.path} or update the readiness requirement when the runtime-scene PRD scope changes.`
    }));
  const blockedClaims = collectBlockedClaims(root);
  return {
    schema: "a3d-ai-scene-readiness",
    generatedAt: new Date().toISOString(),
    pass: unsupportedCases.length === 0 && blockedClaims.length === 0,
    inputs: {
      root: redactSecrets(relative(process.cwd(), root) || "."),
      providerMode,
      requiredFiles: requiredFiles.map(redactSecrets),
      requiredReports: requiredReports.map(redactSecrets),
      environment: collectProviderEnvironment(options.env ?? process.env)
    },
    evidence,
    providerMode,
    networkUsed: false,
    blockedClaims,
    unsupportedCases
  };
}

export function writeAISceneReadinessReport(
  report: AISceneReadinessReport = createAISceneReadinessReport(),
  reportPath = AI_SCENE_READINESS_REPORT
): void {
  const path = resolve(reportPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(redactReport(report), null, 2)}\n`);
}

export function redactReport<T>(value: T): T {
  return redactValue(value) as T;
}

export function redactSecrets(value: string): string {
  return value
    .replace(/\b(?:sk|ak|pk|rk|xoxb|ghp|github_pat|AIza)[A-Za-z0-9_\-]{12,}\b/g, "[REDACTED_SECRET]")
    .replace(/\b[A-Za-z0-9_\-]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)[A-Za-z0-9_\-]*\s*[:=]\s*[^,\s"'}]+/gi, (match) => {
      const separator = match.includes("=") ? "=" : ":";
      return `${match.slice(0, match.indexOf(separator) + 1)}[REDACTED_SECRET]`;
    });
}

export function collectProviderEnvironment(env: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>): Readonly<Record<string, string>> {
  const entries: Record<string, string> = {};
  for (const key of secretEnvironmentKeys) {
    const value = env[key];
    if (value !== undefined) entries[key] = "[REDACTED_SECRET]";
  }
  entries.A3D_AI_SCENE_PROVIDER_MODE = redactSecrets(env.A3D_AI_SCENE_PROVIDER_MODE ?? "mock");
  entries.A3D_AI_SCENE_NETWORK = "disabled";
  return entries;
}

function evidenceForPath(root: string, path: string): AISceneReportEvidence {
  const present = existsSync(join(root, path));
  return {
    id: path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(),
    path: redactSecrets(path),
    present,
    status: present ? "present" : "missing",
    detail: present ? `${path} exists.` : `${path} is missing.`
  };
}

function collectBlockedClaims(root: string): readonly string[] {
  const prd = readOptional(join(root, "RuntimeScenePRD.md"));
  if (!prd) return ["RuntimeScenePRD.md is missing, so AI scene claim boundaries cannot be verified."];
  const requiredBoundaries = [
    "Do not compete with OpenAI, Anthropic, Gemini, or local models.",
    "Do not require network AI calls for deterministic tests.",
    "Do not require API keys for local development, route health, or CI."
  ];
  return requiredBoundaries.filter((boundary) => !prd.includes(boundary)).map((boundary) => `RuntimeScenePRD.md missing boundary: ${boundary}`);
}

function readOptional(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function normalizeProviderMode(value: unknown): AISceneProviderMode {
  return value === "live" || value === "local" ? value : "mock";
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      next[key] = /(?:api[_-]?key|token|secret|password)/i.test(key) ? "[REDACTED_SECRET]" : redactValue(entry);
    }
    return next;
  }
  return value;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createAISceneReadinessReport();
  writeAISceneReadinessReport(report);
  if (!report.pass) {
    console.error(`AI scene readiness has unsupported cases:\n${report.unsupportedCases.map((entry) => entry.detail).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`AI scene readiness passed. Report: ${AI_SCENE_READINESS_REPORT}`);
  }
}
