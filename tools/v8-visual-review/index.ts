import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readV6PngStats, type V6PngStats } from "../v6-report-bridge/pngStats";

const DEFAULT_SCREENSHOT_ROOTS = ["tests/reports/v8"] as const;
const REPORT_PATH = "tests/reports/v8-visual-review.json";
const NOTES_PATH = process.env.G3D_V8_VISUAL_NOTES ?? "tests/reports/v8-visual-review-notes.json";

interface ScreenshotReview {
  readonly screenshot: string;
  readonly fileSize: number;
  readonly metrics: V6PngStats | null;
  readonly metricFailures: readonly string[];
  readonly noteFailures: readonly string[];
  readonly notes: ScreenshotNotes | null;
  readonly pass: boolean;
}

interface ScreenshotNotes {
  readonly verdict?: unknown;
  readonly subject?: unknown;
  readonly compositionNotes?: unknown;
  readonly materialLightingNotes?: unknown;
  readonly motionInteractionNotes?: unknown;
  readonly notes?: unknown;
  readonly blockingIssues?: unknown;
}

interface NotesFile {
  readonly reviewer?: unknown;
  readonly reviewedAt?: unknown;
  readonly scope?: unknown;
  readonly overallVerdict?: unknown;
  readonly summaryNotes?: unknown;
  readonly screenshots?: unknown;
}

const gate = {
  minimumFileSizeBytes: 24 * 1024,
  minimumWidth: 768,
  minimumHeight: 540,
  minimumNonBlackCoverage: 0.08,
  minimumUniqueColorBuckets: 64,
  minimumAverageLuma: 6,
  maximumAverageLuma: 248,
  minimumForegroundCoverage: 0.025,
  minimumLargestForegroundComponentCoverage: 0.015,
  minimumCenterForegroundCoverage: 0.008,
  minimumForegroundBoundsCoverage: 0.035,
  minimumDetailEdgeDensity: 0.0015,
  minimumLocalContrast: 6,
  strongerDetailUniqueColorBuckets: 100,
  strongerDetailEdgeDensity: 0.004,
  strongerDetailLocalContrast: 12
} as const;

export function createV8VisualReviewReport(): Record<string, unknown> {
  const screenshotRoots = screenshotRootsFromEnv();
  const screenshots = screenshotRoots.flatMap((root) => findPngFiles(root));
  const notesResult = loadNotesFile(NOTES_PATH);
  const globalNoteFailures = validateGlobalNotes(notesResult.notes);
  const reviews = screenshots.map((screenshot) => reviewScreenshot(screenshot, notesResult.notes));
  const failures = [
    ...screenshotRoots
      .filter((root) => !existsSync(resolve(root)))
      .map((root) => `screenshot root is missing: ${root}`),
    ...(screenshots.length === 0 ? [`no PNG screenshots found under ${screenshotRoots.join(", ")}`] : []),
    ...notesResult.failures,
    ...globalNoteFailures,
    ...reviews.flatMap((review) => [
      ...review.metricFailures.map((failure) => `${review.screenshot}: ${failure}`),
      ...review.noteFailures.map((failure) => `${review.screenshot}: ${failure}`)
    ])
  ];

  return {
    schema: "g3d-v8-visual-review/v1",
    generatedAt: new Date().toISOString(),
    pass: screenshots.length > 0 && failures.length === 0,
    screenshotRoots,
    notesPath: NOTES_PATH,
    gate,
    requiredNotesFields: {
      global: ["reviewer", "reviewedAt", "scope", "overallVerdict", "summaryNotes"],
      perScreenshot: ["verdict", "subject", "compositionNotes", "materialLightingNotes", "motionInteractionNotes", "notes", "blockingIssues"]
    },
    summary: {
      screenshotCount: screenshots.length,
      acceptedCount: reviews.filter((review) => review.pass).length,
      rejectedCount: reviews.filter((review) => !review.pass).length,
      notesPresent: notesResult.notes !== null
    },
    reviews,
    failures
  };
}

export function writeV8VisualReviewReport(report: Record<string, unknown>): void {
  mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });
  writeFileSync(resolve(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);
}

function screenshotRootsFromEnv(): readonly string[] {
  const raw = process.env.G3D_V8_VISUAL_ROOTS;
  if (!raw) return DEFAULT_SCREENSHOT_ROOTS;
  return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function findPngFiles(root: string): string[] {
  const absoluteRoot = resolve(root);
  if (!existsSync(absoluteRoot)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    const absolutePath = resolve(absoluteRoot, entry.name);
    if (entry.isDirectory()) {
      files.push(...findPngFiles(relative(process.cwd(), absolutePath)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
      files.push(relative(process.cwd(), absolutePath));
    }
  }
  return files.sort();
}

function loadNotesFile(path: string): { readonly notes: NotesFile | null; readonly failures: readonly string[] } {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    return {
      notes: null,
      failures: [`visual review notes file is missing: ${path}`]
    };
  }
  try {
    const notes = JSON.parse(readFileSync(absolutePath, "utf8")) as NotesFile;
    return { notes, failures: [] };
  } catch (error) {
    return {
      notes: null,
      failures: [`visual review notes file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

function reviewScreenshot(screenshot: string, notesFile: NotesFile | null): ScreenshotReview {
  const absolutePath = resolve(screenshot);
  const metricFailures: string[] = [];
  let metrics: V6PngStats | null = null;
  const fileSize = existsSync(absolutePath) ? statSync(absolutePath).size : 0;

  if (!existsSync(absolutePath)) {
    metricFailures.push("screenshot file is missing");
  } else {
    try {
      metrics = readV6PngStats(absolutePath);
      metricFailures.push(...evaluateMetrics(screenshot, fileSize, metrics));
    } catch (error) {
      metricFailures.push(`could not read PNG metrics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const notes = findScreenshotNotes(notesFile, screenshot);
  const noteFailures = validateScreenshotNotes(notesFile, screenshot, notes);
  return {
    screenshot,
    fileSize,
    metrics,
    metricFailures,
    noteFailures,
    notes,
    pass: metricFailures.length === 0 && noteFailures.length === 0
  };
}

function evaluateMetrics(screenshot: string, fileSize: number, metrics: V6PngStats): string[] {
  const failures: string[] = [];
  const totalPixels = Math.max(1, metrics.width * metrics.height);
  const nonBlackCoverage = metrics.nonBlackPixels / totalPixels;

  if (fileSize < gate.minimumFileSizeBytes) failures.push(`file size ${fileSize} is below ${gate.minimumFileSizeBytes} bytes`);
  if (metrics.width < gate.minimumWidth) failures.push(`width ${metrics.width} is below ${gate.minimumWidth}`);
  if (metrics.height < gate.minimumHeight) failures.push(`height ${metrics.height} is below ${gate.minimumHeight}`);
  if (nonBlackCoverage < gate.minimumNonBlackCoverage) failures.push(`non-black coverage ${round(nonBlackCoverage)} is below ${gate.minimumNonBlackCoverage}`);
  if (metrics.uniqueColorBuckets < gate.minimumUniqueColorBuckets) failures.push(`unique color buckets ${metrics.uniqueColorBuckets} is below ${gate.minimumUniqueColorBuckets}`);
  if (metrics.averageLuma < gate.minimumAverageLuma) failures.push(`average luma ${metrics.averageLuma} is below ${gate.minimumAverageLuma}`);
  if (metrics.averageLuma > gate.maximumAverageLuma) failures.push(`average luma ${metrics.averageLuma} is above ${gate.maximumAverageLuma}`);
  if (metrics.foregroundCoverage < gate.minimumForegroundCoverage) failures.push(`foreground coverage ${metrics.foregroundCoverage} is below ${gate.minimumForegroundCoverage}`);
  if (metrics.largestForegroundComponentCoverage < gate.minimumLargestForegroundComponentCoverage) failures.push(`largest subject coverage ${metrics.largestForegroundComponentCoverage} is below ${gate.minimumLargestForegroundComponentCoverage}`);
  if (metrics.centerForegroundCoverage < gate.minimumCenterForegroundCoverage) failures.push(`center subject coverage ${metrics.centerForegroundCoverage} is below ${gate.minimumCenterForegroundCoverage}`);
  if (metrics.foregroundBoundsCoverage < gate.minimumForegroundBoundsCoverage) failures.push(`foreground bounds coverage ${metrics.foregroundBoundsCoverage} is below ${gate.minimumForegroundBoundsCoverage}`);
  if (metrics.detailEdgeDensity < gate.minimumDetailEdgeDensity) failures.push(`detail edge density ${metrics.detailEdgeDensity} is below ${gate.minimumDetailEdgeDensity}`);
  if (metrics.localContrast < gate.minimumLocalContrast) failures.push(`local contrast ${metrics.localContrast} is below ${gate.minimumLocalContrast}`);

  const weakAcrossDetailFamilies = metrics.uniqueColorBuckets < gate.strongerDetailUniqueColorBuckets
    && metrics.detailEdgeDensity < gate.strongerDetailEdgeDensity
    && metrics.localContrast < gate.strongerDetailLocalContrast;
  if (weakAcrossDetailFamilies) {
    failures.push("image is flat across color, edge, and contrast metrics");
  }
  if (/debug|sandbox|proof|placeholder|reference/i.test(screenshot)) {
    failures.push("path name is debug-like; V8 approval screenshots must be product or comparison outputs");
  }

  return failures;
}

function validateGlobalNotes(notes: NotesFile | null): string[] {
  if (!notes) return [];
  const failures: string[] = [];
  for (const field of ["reviewer", "reviewedAt", "scope", "summaryNotes"] as const) {
    if (!isSubstantiveText(notes[field])) failures.push(`visual review notes missing substantive global field: ${field}`);
  }
  if (!["pass", "fail", "needs-work"].includes(typeof notes.overallVerdict === "string" ? notes.overallVerdict.toLowerCase() : "")) {
    failures.push("visual review notes overallVerdict must be pass, fail, or needs-work");
  }
  if (typeof notes.reviewedAt === "string" && Number.isNaN(Date.parse(notes.reviewedAt))) {
    failures.push("visual review notes reviewedAt is not a parseable date");
  }
  return failures;
}

function findScreenshotNotes(notesFile: NotesFile | null, screenshot: string): ScreenshotNotes | null {
  if (!notesFile || !notesFile.screenshots || typeof notesFile.screenshots !== "object" || Array.isArray(notesFile.screenshots)) return null;
  const screenshots = notesFile.screenshots as Record<string, unknown>;
  const candidates = [
    screenshot,
    `./${screenshot}`,
    resolve(screenshot),
    screenshot.replace(/^tests\/reports\//, "")
  ];
  for (const candidate of candidates) {
    const value = screenshots[candidate];
    if (value && typeof value === "object" && !Array.isArray(value)) return value as ScreenshotNotes;
  }
  return null;
}

function validateScreenshotNotes(notesFile: NotesFile | null, screenshot: string, notes: ScreenshotNotes | null): string[] {
  if (!notesFile) return [`missing required human visual review notes for ${screenshot}`];
  if (!notes) return [`missing per-screenshot review notes for ${screenshot}`];

  const failures: string[] = [];
  for (const field of ["subject", "compositionNotes", "materialLightingNotes", "motionInteractionNotes", "notes"] as const) {
    if (!isSubstantiveText(notes[field])) failures.push(`missing substantive notes field: ${field}`);
  }
  if (!Array.isArray(notes.blockingIssues)) failures.push("blockingIssues must be an array");
  const verdict = typeof notes.verdict === "string" ? notes.verdict.toLowerCase() : "";
  if (!["pass", "fail", "needs-work"].includes(verdict)) failures.push("verdict must be pass, fail, or needs-work");
  if (verdict !== "pass") failures.push(`human visual review verdict is ${verdict || "missing"}, not pass`);
  if (verdict === "pass" && Array.isArray(notes.blockingIssues) && notes.blockingIssues.length > 0) {
    failures.push("passing screenshot notes cannot include blockingIssues");
  }
  return failures;
}

function isSubstantiveText(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 12) return false;
  return !/^(?:n\/a|none|todo|tbd|placeholder|ok|pass)$/i.test(trimmed);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

async function main(): Promise<void> {
  const report = createV8VisualReviewReport();
  writeV8VisualReviewReport(report);
  if (report.pass !== true) {
    console.error(`V8 visual review failed. Report: ${REPORT_PATH}`);
    const failures = Array.isArray(report.failures) ? report.failures : [];
    for (const failure of failures) console.error(`- ${String(failure)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`V8 visual review passed. Report: ${REPORT_PATH}`);
}

const isCli = process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;
if (isCli) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
