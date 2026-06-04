import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, type Dirent } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
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

export interface AISceneBlockedClaim {
  readonly claim: string;
  readonly path: string;
  readonly line: number;
  readonly excerpt: string;
  readonly reason: string;
}

export interface AISceneClaimScanReport {
  readonly schema: "a3d-ai-scene-claim-scan";
  readonly generatedAt: string;
  readonly pass: boolean;
  readonly inputs: AISceneReportInput & {
    readonly scannedGlobs: readonly string[];
  };
  readonly evidence: readonly AISceneReportEvidence[];
  readonly providerMode: AISceneProviderMode;
  readonly networkUsed: false;
  readonly blockedClaims: readonly AISceneBlockedClaim[];
  readonly unsupportedCases: readonly AISceneUnsupportedCase[];
}

export interface AISceneClaimScanOptions {
  readonly root?: string;
  readonly providerMode?: AISceneProviderMode;
  readonly env?: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;
  readonly scannedGlobs?: readonly string[];
}

export const AI_SCENE_CLAIM_SCAN_REPORT = "tests/reports/ai-scene/claim-scan.json";

const defaultScannedGlobs = [
  "README.md",
  "RuntimeScenePRD.md",
  "docs/**/*.md",
  "packages/**/package.json",
  "apps/**/README.md"
] as const;

const blockedClaimPatterns = [
  {
    claim: "Aura3D replaces AI model providers.",
    pattern: /\b(?:replaces|competes\s+with)\s+(?:openai|anthropic|gemini|local models?|llms?|ai models?)\b/i,
    reason: "runtime scene positions Aura3D as the scene runtime for providers, not a replacement for model providers."
  },
  {
    claim: "Aura3D generates final cinematic quality by default.",
    pattern: /\b(?:pixar|disney|ilm|marvel|dreamworks)[-\s]*(?:final|quality|grade)|\bfinal\s+cinematic\s+(?:quality|render)/i,
    reason: "Final cinematic quality requires separate offline/quality-pipeline evidence."
  },
  {
    claim: "Aura3D requires live AI provider calls for local/CI usage.",
    pattern: /\b(?:requires?|must\s+use)\s+(?:openai|anthropic|gemini|api\s*key|network)\b/i,
    reason: "runtime scene requires no-network deterministic tests and no API keys for local development."
  },
  {
    claim: "Aura3D is better than Three.js as primary positioning.",
    pattern: /\bbetter\s+than\s+three\.?js\b/i,
    reason: "runtime scene should use Aura-native AI scene runtime positioning instead of Three.js superiority as the primary frame."
  }
] as const;

export function createAISceneClaimScanReport(options: AISceneClaimScanOptions = {}): AISceneClaimScanReport {
  const root = resolve(options.root ?? process.cwd());
  const providerMode = normalizeProviderMode(options.providerMode ?? options.env?.A3D_AI_SCENE_PROVIDER_MODE ?? "mock");
  const scannedFiles = listClaimFiles(root);
  const blockedClaims = scannedFiles.flatMap((path) => scanFileForBlockedClaims(root, path));
  const unsupportedCases = existsSync(join(root, "RuntimeScenePRD.md"))
    ? []
    : [{
        id: "missing-v2prd",
        severity: "blocked" as const,
        detail: "RuntimeScenePRD.md is missing, so AI scene claim scope cannot be audited.",
        nextAction: "Create RuntimeScenePRD.md before relying on AI scene claim-scan output."
      }];
  return {
    schema: "a3d-ai-scene-claim-scan",
    generatedAt: new Date().toISOString(),
    pass: blockedClaims.length === 0 && unsupportedCases.length === 0,
    inputs: {
      root: redactSecrets(relative(process.cwd(), root) || "."),
      providerMode,
      requiredFiles: ["RuntimeScenePRD.md"],
      requiredReports: [],
      environment: collectProviderEnvironment(options.env ?? process.env),
      scannedGlobs: options.scannedGlobs ?? defaultScannedGlobs
    },
    evidence: scannedFiles.map((path) => ({
      id: path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(),
      path: redactSecrets(path),
      present: true,
      status: "present" as const,
      detail: "Scanned for AI scene blocked claim language."
    })),
    providerMode,
    networkUsed: false,
    blockedClaims,
    unsupportedCases
  };
}

export function writeAISceneClaimScanReport(
  report: AISceneClaimScanReport = createAISceneClaimScanReport(),
  reportPath = AI_SCENE_CLAIM_SCAN_REPORT
): void {
  const path = resolve(reportPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(redactReport(report), null, 2)}\n`);
}

function scanFileForBlockedClaims(root: string, path: string): readonly AISceneBlockedClaim[] {
  const text = readFileSync(join(root, path), "utf8");
  const blockedClaims: AISceneBlockedClaim[] = [];
  let inQuotedBoundarySection = false;
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (/^#{1,6}\s+/.test(trimmed)) {
      inQuotedBoundarySection = /(?:blocked|avoid|non-goals|not realistic|not supported|limitations?)/i.test(trimmed);
    } else if (/(?:must not promise|should not claim|do not claim|do not use(?:\s+[a-z ]+)?\s+wording\s+such\s+as|do not use unqualified language|do not write these|avoid|blocked shape)$/i.test(trimmed.replace(/:$/, ""))) {
      inQuotedBoundarySection = true;
    }
    if (inQuotedBoundarySection || isScopedOrNegated(line)) return;
    blockedClaims.push(...blockedClaimPatterns.flatMap((entry) => entry.pattern.test(line)
      ? [{
          claim: entry.claim,
          path: redactSecrets(path),
          line: index + 1,
          excerpt: redactSecrets(line.trim()).slice(0, 240),
          reason: entry.reason
        }]
      : []));
  });
  return blockedClaims;
}

function listClaimFiles(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return walk(root)
    .map((path) => relative(root, path).replaceAll("\\", "/"))
    .filter((path) => {
      if (path.includes("/node_modules/") || path.startsWith("node_modules/")) return false;
      if (path.startsWith("tests/reports/")) return false;
      if (path.startsWith("release-artifacts/")) return false;
      if (path === "README.md" || path === "RuntimeScenePRD.md") return true;
      if (path.startsWith("docs/") && path.endsWith(".md")) return true;
      if (/^packages\/[^/]+\/package\.json$/.test(path)) return true;
      if (/^apps\/[^/]+\/README\.md$/.test(path)) return true;
      return false;
    })
    .sort();
}

function walk(root: string): readonly string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const child = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist" || entry.name === ".vite") return [];
      return walk(child);
    }
    return entry.isFile() && (extname(entry.name) === ".md" || entry.name === "package.json") ? [child] : [];
  });
}

function isScopedOrNegated(line: string): boolean {
  return /\b(?:do not|does not|must not|should not|avoid|without|unless|not claim|not require|not a replacement|blocked|unsupported|forbidden)\b/i.test(line);
}

function normalizeProviderMode(value: unknown): AISceneProviderMode {
  return value === "live" || value === "local" ? value : "mock";
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createAISceneClaimScanReport();
  writeAISceneClaimScanReport(report);
  if (!report.pass) {
    console.error(`AI scene claim scan failed:\n${report.blockedClaims.map((entry) => `${entry.path}:${entry.line} ${entry.claim}`).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`AI scene claim scan passed. Report: ${AI_SCENE_CLAIM_SCAN_REPORT}`);
  }
}
