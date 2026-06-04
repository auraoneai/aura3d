import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, type Dirent } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { containsPotentialSecret } from "../../packages/ai-scene/src";
import { collectProviderEnvironment, redactReport, redactSecrets } from "../ai-scene-readiness/index";

export const AI_SCENE_SECRET_AUDIT_REPORT = "tests/reports/ai-scene/secret-audit.json";

const scannedRoots = ["apps/aura-prompt-to-scene", "apps/aura-cinematic-prompt-lab", "apps/aura-scene-diff-editor", "apps/aura-shot-director", "apps/aura-world-builder", "packages/ai-scene", "docs/ai-scene", "tests/reports/ai-scene"] as const;

export function createAISceneSecretAuditReport(root = process.cwd()) {
  const files = scannedRoots.flatMap((scanRoot) => walk(resolve(root, scanRoot)).map((path) => relative(root, path).replaceAll("\\", "/")));
  const findings = files.flatMap((path) => scanFile(resolve(root, path), path));
  const unsupportedCases = findings.map((finding) => ({
    id: `${finding.path}:${finding.line}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, ""),
    severity: "blocked" as const,
    detail: `${finding.path}:${finding.line} may contain a secret.`,
    nextAction: "Remove or redact the secret before release."
  }));
  return {
    schema: "a3d-ai-scene-secret-audit",
    generatedAt: new Date().toISOString(),
    pass: unsupportedCases.length === 0,
    inputs: {
      root: redactSecrets(relative(process.cwd(), resolve(root)) || "."),
      providerMode: "mock",
      requiredFiles: [...scannedRoots],
      requiredReports: [],
      environment: collectProviderEnvironment(process.env)
    },
    evidence: files.map((path) => ({
      id: path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, ""),
      path: redactSecrets(path),
      present: true,
      status: "present",
      detail: "Scanned for API keys, bearer tokens, and secret-looking strings."
    })),
    providerMode: "mock",
    networkUsed: false,
    blockedClaims: [],
    unsupportedCases,
    findings
  };
}

export function writeAISceneSecretAuditReport(report = createAISceneSecretAuditReport(), path = AI_SCENE_SECRET_AUDIT_REPORT): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(redactReport(report), null, 2)}\n`);
}

function scanFile(absolute: string, relativePath: string): readonly { readonly path: string; readonly line: number; readonly excerpt: string }[] {
  const text = readFileSync(absolute, "utf8");
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (!containsPotentialSecret(line)) return [];
    return [{ path: redactSecrets(relativePath), line: index + 1, excerpt: redactSecrets(line.trim()).slice(0, 200) }];
  });
}

function walk(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  let entries: Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const child = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") return [];
      return walk(child);
    }
    if (!entry.isFile()) return [];
    return [".ts", ".tsx", ".js", ".json", ".md", ".html", ".css"].includes(extname(entry.name)) ? [child] : [];
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = createAISceneSecretAuditReport();
  writeAISceneSecretAuditReport(report);
  if (!report.pass) {
    console.error(`AI scene secret audit failed:\n${report.unsupportedCases.map((entry) => entry.detail).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`AI scene secret audit passed. Report: ${AI_SCENE_SECRET_AUDIT_REPORT}`);
  }
}
