import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, type Dirent } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectProviderEnvironment, redactReport, redactSecrets } from "../ai-scene-readiness/index";
import { collectCinematicSourceEvidence, type CinematicSourceEvidence } from "../cinematic-scene-quality/compositionMetrics";

export const CINEMATIC_RUNTIME_READINESS_REPORT = "tests/reports/cinematic/runtime-readiness.json";
export const CINEMATIC_CLAIM_SCAN_REPORT = "tests/reports/cinematic/claim-scan.json";
export const CINEMATIC_COMPLETION_AUDIT_REPORT = "tests/reports/cinematic/completion-audit.json";

export const CINEMATIC_REQUIRED_REPORTS = [
  "tests/reports/cinematic/provider-contracts.json",
  "tests/reports/cinematic/route-health.json",
  "tests/reports/cinematic/screenshot-quality.json",
  "tests/reports/cinematic/runtime-readiness.json",
  "tests/reports/cinematic/scene-diff-quality.json",
  "tests/reports/cinematic/asset-readiness.json",
  "tests/reports/cinematic/secret-audit.json",
  "tests/reports/cinematic/claim-scan.json"
] as const;

export interface CinematicRuntimeProbe {
  readonly status?: string;
  readonly frameCount?: number;
  readonly drawCalls?: number;
  readonly textures?: number;
  readonly materials?: number;
  readonly renderer?: string;
  readonly backend?: string;
  readonly renderWidth?: number;
  readonly renderHeight?: number;
  readonly consoleErrors?: readonly string[];
  readonly pageErrors?: readonly string[];
  readonly cameraAnimationAdvanced?: boolean;
}

export interface CinematicRuntimeReadinessOptions {
  readonly root?: string;
  readonly providerMode?: "fixture" | "mock" | "live" | "local";
  readonly backend?: string;
  readonly sourceEvidence?: CinematicSourceEvidence;
  readonly runtime?: CinematicRuntimeProbe;
  readonly screenshots?: readonly string[];
  readonly env?: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;
}

export interface CinematicFailure {
  readonly id: string;
  readonly severity: "blocked";
  readonly detail: string;
  readonly nextAction: string;
}

export function createCinematicRuntimeReadinessReport(options: CinematicRuntimeReadinessOptions = {}) {
  const root = resolve(options.root ?? process.cwd());
  const sourceEvidence = options.sourceEvidence ?? collectCinematicSourceEvidence(root);
  const runtime = options.runtime;
  const providerMode = options.providerMode ?? sourceEvidence.providerMode;
  const backend = options.backend ?? runtime?.backend ?? runtime?.renderer?.replace("a3d-", "") ?? sourceEvidence.backend;
  const fixtureDuration = readFixtureDuration(root);
  const consoleErrors = runtime?.consoleErrors ?? [];
  const pageErrors = runtime?.pageErrors ?? [];
  const gates = [
    gate("route-ready", runtime ? runtime.status === "ready" || runtime.status === "running" : false, `runtime.status=${runtime?.status ?? "missing"}`),
    gate("webgl-or-webgpu-backend", backend === "webgl2" || backend === "webgpu", `backend=${backend}`),
    gate("draw-calls", (runtime?.drawCalls ?? 0) > 0, `drawCalls=${runtime?.drawCalls ?? 0}`),
    gate("real-asset-count", sourceEvidence.realAssets.length > 0, `realAssets=${sourceEvidence.realAssets.join(",") || "none"}`),
    gate("zero-hero-placeholders", sourceEvidence.placeholderAssets.length === 0, `placeholderAssets=${sourceEvidence.placeholderAssets.join(",") || "none"}`),
    gate("required-hero-prop", sourceEvidence.rendererOwnedHeroProps.length > 0, `rendererOwnedHeroProps=${sourceEvidence.rendererOwnedHeroProps.join(",") || "none"}`),
    gate("required-environment-geometry", sourceEvidence.rendererOwnedEnvironment.length > 0, `rendererOwnedEnvironment=${sourceEvidence.rendererOwnedEnvironment.join(",") || "none"}`),
    gate("required-renderer-vfx", sourceEvidence.rendererOwnedVfx.length > 0, `rendererOwnedVfx=${sourceEvidence.rendererOwnedVfx.join(",") || "none"}`),
    gate("dom-overlays-not-evidence", sourceEvidence.domOverlayCount === 0 || sourceEvidence.rendererOwnedVfx.length + sourceEvidence.rendererOwnedHeroProps.length + sourceEvidence.rendererOwnedEnvironment.length >= 3, `domOverlayCount=${sourceEvidence.domOverlayCount}`),
    gate("texture-count", (runtime?.textures ?? 0) > 0, `textures=${runtime?.textures ?? 0}`),
    gate("material-count", (runtime?.materials ?? sourceEvidence.realAssets.length) > 0, `materials=${runtime?.materials ?? sourceEvidence.realAssets.length}`),
    gate("camera-animation-advances", runtime?.cameraAnimationAdvanced === true, `cameraAnimationAdvanced=${runtime?.cameraAnimationAdvanced ?? false}`),
    gate("timeline-duration", fixtureDuration >= 8, `durationSeconds=${fixtureDuration}`),
    gate("no-console-errors", consoleErrors.length === 0, `consoleErrors=${consoleErrors.length}`),
    gate("no-page-errors", pageErrors.length === 0, `pageErrors=${pageErrors.length}`),
    gate("not-product-turntable", sourceEvidence.productTurntableSignals.length === 0, `signals=${sourceEvidence.productTurntableSignals.join(",") || "none"}`)
  ];
  const failures = gates.filter((entry) => !entry.pass).map((entry) => failure(entry.id, entry.detail));
  return {
    schema: "a3d-cinematic-runtime-readiness",
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    inputs: {
      root: redactSecrets(relative(process.cwd(), root) || "."),
      providerMode,
      backend,
      requiredFiles: ["apps/cinematic-prompt-to-scene/index.html", "apps/cinematic-prompt-to-scene/src/main.ts"],
      requiredReports: [],
      environment: collectProviderEnvironment(options.env ?? process.env)
    },
    evidence: [
      {
        id: "runtime-probe",
        path: "apps/cinematic-prompt-to-scene/",
        present: Boolean(runtime),
        status: runtime ? "present" as const : "missing" as const,
        detail: "Browser runtime diagnostics for the cinematic route.",
        runtime
      },
      {
        id: "source-evidence",
        path: sourceEvidence.routePath,
        present: true,
        status: "present" as const,
        detail: "Static source evidence for renderer-owned assets, props, VFX, and framing.",
        sourceEvidence
      },
      ...gates
    ],
    providerMode,
    backend,
    networkUsed: false,
    blockedClaims: [],
    failures,
    unsupportedCases: failures,
    screenshots: [...(options.screenshots ?? [])]
  };
}

export function createCinematicClaimScanReport(root = process.cwd()) {
  const resolvedRoot = resolve(root);
  const files = listClaimFiles(resolvedRoot);
  const blockedClaims = files.flatMap((path) => scanBlockedClaims(resolvedRoot, path));
  const failures = blockedClaims.map((claim) => failure(`blocked-claim:${claim.path}:${claim.line}`, `${claim.path}:${claim.line} ${claim.reason}`));
  return {
    schema: "a3d-cinematic-claim-scan",
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    inputs: {
      root: redactSecrets(relative(process.cwd(), resolvedRoot) || "."),
      providerMode: "fixture",
      backend: "static",
      requiredFiles: ["CinematicPrevisPRD.md"],
      requiredReports: [],
      environment: collectProviderEnvironment(process.env)
    },
    evidence: files.map((path) => ({
      id: path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(),
      path: redactSecrets(path),
      present: true,
      status: "present" as const,
      detail: "Scanned for cinematic release claims that are blocked until renderer quality gates pass."
    })),
    providerMode: "fixture",
    backend: "static",
    networkUsed: false,
    blockedClaims,
    failures,
    unsupportedCases: failures,
    screenshots: []
  };
}

export function createCinematicCompletionAuditReport(root = process.cwd(), requiredReports: readonly string[] = CINEMATIC_REQUIRED_REPORTS) {
  const resolvedRoot = resolve(root);
  const failures: CinematicFailure[] = [];
  const evidence = requiredReports.map((path) => {
    const absolute = join(resolvedRoot, path);
    const present = existsSync(absolute);
    if (!present) {
      failures.push(failure(`missing:${path}`, `Required cinematic report is missing: ${path}`));
    } else {
      const parsed = readJson(absolute);
      if (!hasCinematicReportShape(parsed)) {
        failures.push(failure(`invalid-shape:${path}`, `${path} does not include schema, generatedAt, pass, providerMode, backend, failures, and screenshots.`));
      } else {
        if (parsed.pass !== true) failures.push(failure(`not-passing:${path}`, `${path} is present but pass is not true.`));
        if (containsPotentialSecret(JSON.stringify(parsed))) failures.push(failure(`secret-leak:${path}`, `${path} appears to contain an unredacted secret.`));
      }
    }
    return {
      id: path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(),
      path: redactSecrets(path),
      present,
      status: present ? "present" as const : "missing" as const,
      detail: present ? `${path} exists and was audited.` : `${path} is missing.`
    };
  });
  const prdAudit = auditCinematicPrevisPrd(resolvedRoot);
  if (!prdAudit.present) {
    failures.push(failure("missing:CinematicPrevisPRD.md", "CinematicPrevisPRD.md is missing."));
  }
  for (const item of prdAudit.uncheckedTasks) {
    failures.push(failure(`unchecked-task:${item.line}`, `CinematicPrevisPRD.md:${item.line} remains unchecked: ${item.task}`));
  }
  for (const path of prdAudit.missingPaths) {
    failures.push(failure(`missing-prd-file:${path}`, `CinematicPrevisPRD.md references ${path}, but it is missing.`));
  }
  return {
    schema: "a3d-cinematic-completion-audit",
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    inputs: {
      root: redactSecrets(relative(process.cwd(), resolvedRoot) || "."),
      providerMode: "fixture",
      backend: "static",
      requiredFiles: [],
      requiredReports: requiredReports.map(redactSecrets),
      environment: collectProviderEnvironment(process.env)
    },
    evidence: [
      ...evidence,
      {
        id: "v3prd-checklist",
        path: "CinematicPrevisPRD.md",
        present: prdAudit.present,
        status: prdAudit.present ? "present" as const : "missing" as const,
        detail: "Audited CinematicPrevisPRD.md checkboxes and referenced file paths.",
        checkedTaskCount: prdAudit.checkedTaskCount,
        uncheckedTaskCount: prdAudit.uncheckedTasks.length,
        referencedPathCount: prdAudit.referencedPathCount,
        missingPaths: prdAudit.missingPaths
      }
    ],
    providerMode: "fixture",
    backend: "static",
    networkUsed: false,
    blockedClaims: [],
    failures,
    unsupportedCases: failures,
    screenshots: []
  };
}

export function writeCinematicRuntimeReadinessReport(report = createCinematicRuntimeReadinessReport(), reportPath = CINEMATIC_RUNTIME_READINESS_REPORT): void {
  writeReport(report, reportPath);
}

export function writeCinematicClaimScanReport(report = createCinematicClaimScanReport(), reportPath = CINEMATIC_CLAIM_SCAN_REPORT): void {
  writeReport(report, reportPath);
}

export function writeCinematicCompletionAuditReport(report = createCinematicCompletionAuditReport(), reportPath = CINEMATIC_COMPLETION_AUDIT_REPORT): void {
  writeReport(report, reportPath);
}

function writeReport(report: unknown, reportPath: string): void {
  mkdirSync(dirname(resolve(reportPath)), { recursive: true });
  writeFileSync(resolve(reportPath), `${JSON.stringify(redactReport(report), null, 2)}\n`);
}

function gate(id: string, pass: boolean, detail: string) {
  return { id, pass, detail };
}

function failure(id: string, detail: string): CinematicFailure {
  return {
    id,
    severity: "blocked",
    detail,
    nextAction: "Replace placeholder or DOM-only cinematic evidence with renderer-owned runtime evidence."
  };
}

function readFixtureDuration(root: string): number {
  const index = readOptional(join(root, "apps/cinematic-prompt-to-scene/index.html"));
  const match = index.match(/"durationSeconds"\s*:\s*(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function auditCinematicPrevisPrd(root: string): {
  readonly present: boolean;
  readonly checkedTaskCount: number;
  readonly uncheckedTasks: readonly { readonly line: number; readonly task: string }[];
  readonly referencedPathCount: number;
  readonly missingPaths: readonly string[];
} {
  const prdPath = join(root, "CinematicPrevisPRD.md");
  if (!existsSync(prdPath)) {
    return {
      present: false,
      checkedTaskCount: 0,
      uncheckedTasks: [],
      referencedPathCount: 0,
      missingPaths: []
    };
  }
  const text = readFileSync(prdPath, "utf8");
  const uncheckedTasks: { readonly line: number; readonly task: string }[] = [];
  let checkedTaskCount = 0;
  text.split(/\r?\n/).forEach((line, index) => {
    const checked = line.match(/^- \[x\]\s+(.+)$/);
    if (checked) checkedTaskCount += 1;
    const unchecked = line.match(/^- \[ \]\s+(.+)$/);
    if (unchecked) uncheckedTasks.push({ line: index + 1, task: unchecked[1] ?? "" });
  });
  const referencedPaths = [...new Set([...text.matchAll(/- `([^`]+)`/g)]
    .map((match) => match[1] ?? "")
    .filter((path) => /^(apps|docs|packages|templates|tests|tools|fixtures|marketing|README|index|pnpm|package|tsconfig|vite|vitest)/.test(path))
    .filter((path) => !path.endsWith("*")))];
  const missingPaths = referencedPaths.filter((path) => !existsSync(join(root, path)));
  return {
    present: true,
    checkedTaskCount,
    uncheckedTasks,
    referencedPathCount: referencedPaths.length,
    missingPaths
  };
}

function listClaimFiles(root: string): readonly string[] {
  return walk(root)
    .map((path) => relative(root, path).replaceAll("\\", "/"))
    .filter((path) => path === "README.md" || path.startsWith("docs/project/") && path.endsWith(".md") || path.startsWith("marketing/") && [".html", ".ts", ".css"].includes(extname(path)))
    .filter((path) => !path.startsWith("tests/reports/"))
    .sort();
}

function scanBlockedClaims(root: string, path: string) {
  const text = readOptional(join(root, path));
  const claims: { readonly path: string; readonly line: number; readonly excerpt: string; readonly reason: string }[] = [];
  let inBlockedClaimSection = false;
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (/^#{1,6}\s+/.test(trimmed)) inBlockedClaimSection = /(?:blocked|avoid|do not|claims?|boundar|limitations?)/i.test(trimmed);
    if (/do not use .*wording|do not claim|avoid .*claims|blocked claims?/i.test(trimmed)) inBlockedClaimSection = true;
    if (inBlockedClaimSection) return;
    if (/\b(?:do not|must not|blocked|not claim|until separately proven|quality gate|claim boundary|not promise|avoid|unsupported|limitation)\b/i.test(line)) return;
    if (/\b(?:final film quality|offline final|pixar|ilm|photoreal final|replaces openai|requires api key)\b/i.test(line)) {
      claims.push({
        path: redactSecrets(path),
        line: index + 1,
        excerpt: redactSecrets(line.trim()).slice(0, 220),
        reason: "Cinematic release wording promises blocked final/live-provider quality without gate evidence."
      });
    }
  });
  return claims;
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
      if ([".git", "node_modules", "dist", ".vite", "tests"].includes(entry.name)) return [];
      return walk(child);
    }
    return entry.isFile() && [".md", ".html", ".ts", ".css"].includes(extname(entry.name)) ? [child] : [];
  });
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function hasCinematicReportShape(value: Record<string, unknown> | undefined): value is Record<string, unknown> & {
  readonly pass: boolean;
} {
  return Boolean(value)
    && typeof value?.schema === "string"
    && typeof value.generatedAt === "string"
    && typeof value.pass === "boolean"
    && typeof value.providerMode === "string"
    && typeof value.backend === "string"
    && Array.isArray(value.failures)
    && Array.isArray(value.screenshots);
}

function containsPotentialSecret(value: string): boolean {
  return /\b(?:sk|ak|pk|rk|xoxb|ghp|github_pat|AIza)[A-Za-z0-9_\-]{12,}\b/.test(value)
    || /\b[A-Za-z0-9_\-]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)[A-Za-z0-9_\-]*\s*[:=]\s*(?!\[REDACTED_SECRET\])[^,\s"'}]+/i.test(value);
}

function readOptional(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const mode = process.argv.includes("--claim-scan")
    ? "claim-scan"
    : process.argv.includes("--completion-audit")
      ? "completion-audit"
      : "runtime-readiness";
  const report = mode === "claim-scan"
    ? createCinematicClaimScanReport()
    : mode === "completion-audit"
      ? createCinematicCompletionAuditReport()
      : createCinematicRuntimeReadinessReport();
  const path = mode === "claim-scan"
    ? CINEMATIC_CLAIM_SCAN_REPORT
    : mode === "completion-audit"
      ? CINEMATIC_COMPLETION_AUDIT_REPORT
      : CINEMATIC_RUNTIME_READINESS_REPORT;
  writeReport(report, path);
  if (!report.pass) {
    console.error(`Cinematic ${mode} failed:\n${report.failures.map((entry) => entry.detail).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`Cinematic ${mode} passed. Report: ${path}`);
  }
}
