import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

interface ExternalDemoManifest {
  readonly version?: string;
  readonly requiredDemoIds?: readonly string[];
  readonly demos?: readonly ExternalDemoEntry[];
}

interface ExternalDemoEntry {
  readonly id?: string;
  readonly url?: string;
  readonly version?: string;
  readonly gitSha?: string;
  readonly deployedAt?: string;
  readonly access?: "public" | "private" | "temporary" | "local-only";
}

interface ExternalDemoValidation {
  readonly id: string;
  readonly url: string;
  readonly access: string;
  readonly version: string;
  readonly screenshotPath: string;
  readonly statusCode: number | null;
  readonly title: string;
  readonly passed: boolean;
  readonly violations: readonly string[];
}

interface ExternalDemoValidationReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly releaseRunId: string;
  readonly command: string;
  readonly manifestPath: string;
  readonly environment: {
    readonly platform: NodeJS.Platform;
    readonly release: string;
    readonly arch: string;
    readonly cpuModel: string;
    readonly cpuCount: number;
    readonly totalMemoryBytes: number;
    readonly ci: boolean;
  };
  readonly requiredDemoIds: readonly string[];
  readonly validations: readonly ExternalDemoValidation[];
  readonly violations: readonly string[];
}

const defaultManifestPath = "docs/examples/external-demo-urls.json";
const reportPath = "tests/reports/external-demo-validation.json";
const defaultRequiredDemoIds = [
  "product-configurator",
  "architecture-viewer",
  "game-slice",
  "racing-showcase",
  "large-world-streaming",
] as const;

export async function validateExternalDemos(root = process.cwd(), manifestPath = process.env.G3D_EXTERNAL_DEMO_MANIFEST ?? defaultManifestPath): Promise<ExternalDemoValidationReport> {
  const absoluteManifestPath = join(root, manifestPath);
  const manifest = readManifest(absoluteManifestPath);
  const requiredDemoIds = manifest?.requiredDemoIds ?? defaultRequiredDemoIds;
  const demos = manifest?.demos ?? [];
  const manifestViolations = [
    ...(manifest ? [] : [`Missing external demo manifest: ${manifestPath}`]),
    ...requiredDemoIds.filter((id) => !demos.some((demo) => demo.id === id)).map((id) => `Missing external demo URL for required demo: ${id}`)
  ];
  const browser = demos.length > 0 ? await chromium.launch() : null;
  const validations: ExternalDemoValidation[] = [];
  try {
    for (const demo of demos) {
      validations.push(await validateDemo(root, demo, browser));
    }
  } finally {
    await browser?.close();
  }
  const violations = [
    ...manifestViolations,
    ...validations.flatMap((validation) => validation.violations.map((violation) => `${validation.id}: ${violation}`))
  ];
  return {
    ok: violations.length === 0 && validations.length >= requiredDemoIds.length && validations.every((validation) => validation.passed),
    generatedAt: new Date().toISOString(),
    releaseRunId: process.env.G3D_RELEASE_RUN_ID ?? "standalone-external-demo-validation-run",
    command: "pnpm verify:external-demos",
    manifestPath,
    environment: {
      platform: platform(),
      release: release(),
      arch: process.arch,
      cpuModel: cpus()[0]?.model ?? "unknown",
      cpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
      ci: process.env.CI === "true"
    },
    requiredDemoIds,
    validations,
    violations
  };
}

function readManifest(path: string): ExternalDemoManifest | null {
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isRecord(parsed)) return null;
  return {
    version: typeof parsed.version === "string" ? parsed.version : undefined,
    requiredDemoIds: Array.isArray(parsed.requiredDemoIds) ? parsed.requiredDemoIds.filter((id): id is string => typeof id === "string") : undefined,
    demos: Array.isArray(parsed.demos) ? parsed.demos.filter(isRecord).map((demo) => ({
      id: typeof demo.id === "string" ? demo.id : undefined,
      url: typeof demo.url === "string" ? demo.url : undefined,
      version: typeof demo.version === "string" ? demo.version : undefined,
      gitSha: typeof demo.gitSha === "string" ? demo.gitSha : undefined,
      deployedAt: typeof demo.deployedAt === "string" ? demo.deployedAt : undefined,
      access: isAccess(demo.access) ? demo.access : undefined
    })) : undefined
  };
}

async function validateDemo(root: string, demo: ExternalDemoEntry, browser: Awaited<ReturnType<typeof chromium.launch>> | null): Promise<ExternalDemoValidation> {
  const id = demo.id ?? "missing-id";
  const url = demo.url ?? "";
  const access = demo.access ?? "public";
  const version = demo.version ?? "";
  const screenshotPath = `tests/reports/external-demo-${sanitizeId(id)}.png`;
  const staticViolations = [
    ...(demo.id ? [] : ["missing id"]),
    ...(isPublicHttpsUrl(url) ? [] : ["url must be a durable public https URL, not localhost, file, private, temporary, or empty"]),
    ...(access === "public" ? [] : [`access must be public, received ${access}`]),
    ...(version ? [] : ["missing deployed package/build version"])
  ];
  if (staticViolations.length > 0 || !browser) {
    return {
      id,
      url,
      access,
      version,
      screenshotPath,
      statusCode: null,
      title: "",
      passed: false,
      violations: staticViolations
    };
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    mkdirSync(dirname(join(root, screenshotPath)), { recursive: true });
    await page.screenshot({ path: join(root, screenshotPath), fullPage: true });
    const statusCode = response?.status() ?? null;
    const title = await page.title();
    const violations = [
      ...(statusCode !== null && statusCode >= 200 && statusCode < 400 ? [] : [`HTTP status was ${statusCode ?? "missing"}`]),
      ...(title.trim() ? [] : ["page title is empty"])
    ];
    return { id, url, access, version, screenshotPath, statusCode, title, passed: violations.length === 0, violations };
  } finally {
    await page.close();
  }
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAccess(value: unknown): value is NonNullable<ExternalDemoEntry["access"]> {
  return value === "public" || value === "private" || value === "temporary" || value === "local-only";
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "unknown";
}

function writeReport(root: string, report: ExternalDemoValidationReport): void {
  const outputPath = join(root, reportPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = await validateExternalDemos();
  writeReport(process.cwd(), report);
  console.log(JSON.stringify({
    ok: report.ok,
    manifestPath: report.manifestPath,
    requiredDemoIds: report.requiredDemoIds.length,
    validations: report.validations.length,
    violations: report.violations
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
