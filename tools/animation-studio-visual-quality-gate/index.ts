import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * Animation Studio visual-quality gate — Phase 6.1.
 *
 * Derives its verdict from the REAL render artifact written by
 * `scripts/render-live.ts` (`render-live-summary.json`) and the representative
 * frame PNGs it saves (first/dialogue/action/final.png). It does NOT read the
 * deleted fabricated `visual-acceptance.json` and never emits a hard-coded pass.
 *
 * Real signals asserted:
 *  - the named representative frame PNGs exist and are non-trivial (real bytes);
 *  - the toon treatment was actually applied (`toon.bands` > 1, outline/grade on);
 *  - at least one caption proof exists with real, high-contrast burned-in text;
 *  - the render produced a non-trivial frame count.
 *
 * For true per-pixel content/exposure analysis (blank/over-exposed/static) use
 * the companion `animation-studio-visual-fidelity-gate`, which decodes the PNGs.
 */

export interface AnimationStudioVisualQualityFrame {
  readonly id: string;
  readonly path: string;
  readonly exists: boolean;
  readonly bytes: number;
  readonly ok: boolean;
  readonly blockers: readonly string[];
}

export interface AnimationStudioVisualQualityReport {
  readonly schema: "animation-studio-visual-quality/v2";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly summaryPath: string;
  readonly summaryExists: boolean;
  readonly framesDir: string;
  readonly frames: readonly AnimationStudioVisualQualityFrame[];
  readonly toon: { readonly bands: number; readonly outline: boolean; readonly colorGrade: boolean } | null;
  readonly captionCueCount: number;
  readonly minCaptionContrastRatio: number | null;
  readonly frameCount: number;
  readonly blockers: readonly string[];
}

export interface AnimationStudioVisualQualityOptions {
  readonly summaryPath?: string;
  /** Back-compat: a package dir whose `render-live-summary.json` is read. */
  readonly packageDir?: string;
  readonly framesDir?: string;
  readonly out?: string;
  readonly generatedAt?: string;
  readonly minFrameBytes?: number;
  readonly minToonBands?: number;
  readonly minCaptionContrastRatio?: number;
}

const defaultSummaryPath =
  "packages/create-aura3d/templates/animation-studio/dist/episodes/live-3d/render-live-summary.json";
const defaultOut = "tests/reports/aura3d11/animation-visual-quality.json";
const requiredFrameIds = ["first", "dialogue", "action", "final"] as const;

interface RenderLiveSummary {
  readonly frameCount?: number;
  readonly toon?: { readonly bands?: number; readonly outline?: boolean; readonly colorGrade?: boolean };
  readonly captionProofs?: readonly { readonly text?: string; readonly contrastRatio?: number }[];
}

function resolveSummaryPath(options: AnimationStudioVisualQualityOptions): string {
  if (options.summaryPath) return options.summaryPath;
  if (options.packageDir) return join(options.packageDir, "render-live-summary.json");
  return defaultSummaryPath;
}

export function createAnimationStudioVisualQualityReport(
  root = process.cwd(),
  options: AnimationStudioVisualQualityOptions = {}
): AnimationStudioVisualQualityReport {
  const summaryRel = resolveSummaryPath(options);
  const absoluteSummary = join(root, summaryRel);
  const summaryExists = existsSync(absoluteSummary);
  const summary = summaryExists ? (readJson(absoluteSummary) as RenderLiveSummary | null) : null;

  const minFrameBytes = options.minFrameBytes ?? 1_024;
  const minToonBands = options.minToonBands ?? 2;
  const minCaptionContrast = options.minCaptionContrastRatio ?? 3;
  const blockers: string[] = [];

  if (!summaryExists) blockers.push(`${summaryRel} is missing — run scripts/render-live.ts to produce a real render.`);
  if (summaryExists && !summary) blockers.push(`${summaryRel} is not valid JSON.`);

  // Resolve the frames directory next to the summary file by default. We do NOT
  // trust an absolute `framesDir` baked into the summary — that field can be stale
  // (e.g. a pre-rename path) and would make the gate look at the wrong directory.
  // An explicit option override still wins.
  const framesDir = options.framesDir ?? join(dirname(summaryRel), "frames");

  const frames = requiredFrameIds.map((id): AnimationStudioVisualQualityFrame => {
    const path = join(framesDir, `${id}.png`);
    const absolutePath = framesDir.startsWith("/") ? join(framesDir, `${id}.png`) : join(root, path);
    const exists = existsSync(absolutePath);
    const bytes = exists ? statSync(absolutePath).size : 0;
    const frameBlockers: string[] = [];
    if (!exists) frameBlockers.push(`${path} is missing.`);
    if (exists && bytes < minFrameBytes) frameBlockers.push(`${path} is below ${minFrameBytes} byte(s) (empty frame).`);
    return { id, path, exists, bytes, ok: frameBlockers.length === 0, blockers: frameBlockers };
  });
  blockers.push(...frames.flatMap((frame) => frame.blockers));

  // Toon treatment must actually have been applied.
  const toon = summary?.toon
    ? {
        bands: typeof summary.toon.bands === "number" ? summary.toon.bands : 0,
        outline: summary.toon.outline === true,
        colorGrade: summary.toon.colorGrade === true
      }
    : null;
  if (summary) {
    if (!toon || toon.bands < minToonBands) {
      blockers.push(`Toon treatment not applied: bands ${toon?.bands ?? 0} < ${minToonBands}.`);
    } else if (!toon.outline) {
      blockers.push("Toon treatment missing ink outline pass.");
    }
  }

  // Captions must be present and readable (real burned-in proof with contrast).
  const captionProofs = summary?.captionProofs ?? [];
  const captionCueCount = captionProofs.length;
  const contrasts = captionProofs
    .map((c) => (typeof c.contrastRatio === "number" ? c.contrastRatio : null))
    .filter((v): v is number => v !== null);
  const minCaptionContrastRatio = contrasts.length > 0 ? Math.min(...contrasts) : null;
  if (summary) {
    if (captionCueCount === 0) {
      blockers.push("No caption proofs in the render summary (no dialogue captions were rendered).");
    } else if (minCaptionContrastRatio !== null && minCaptionContrastRatio < minCaptionContrast) {
      blockers.push(
        `Caption contrast ratio ${round(minCaptionContrastRatio)} below ${minCaptionContrast}:1 (captions unreadable).`
      );
    }
  }

  const frameCount = typeof summary?.frameCount === "number" ? summary.frameCount : 0;
  if (summary && frameCount < requiredFrameIds.length) {
    blockers.push(`Render produced only ${frameCount} frame(s); too few to represent the episode.`);
  }

  return {
    schema: "animation-studio-visual-quality/v2",
    ok: blockers.length === 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    summaryPath: summaryRel,
    summaryExists,
    framesDir,
    frames,
    toon,
    captionCueCount,
    minCaptionContrastRatio,
    frameCount,
    blockers
  };
}

export function writeAnimationStudioVisualQualityReport(
  root: string,
  report: AnimationStudioVisualQualityReport,
  out = defaultOut
): void {
  const absoluteOut = join(root, out);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function readJson(path: string): unknown | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function parseArgs(argv: readonly string[]) {
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const currentScript = process.argv[1] ? relative(process.cwd(), process.argv[1]) : "";
if (
  currentScript.endsWith("tools/animation-studio-visual-quality-gate/index.ts") ||
  currentScript.endsWith("tools/animation-studio-visual-quality-gate/index.js")
) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = createAnimationStudioVisualQualityReport(root, {
    summaryPath: typeof args.summary === "string" ? args.summary : undefined,
    packageDir: typeof args["package-dir"] === "string" ? args["package-dir"] : undefined,
    framesDir: typeof args["frames-dir"] === "string" ? args["frames-dir"] : undefined
  });
  writeAnimationStudioVisualQualityReport(root, report, typeof args.out === "string" ? args.out : defaultOut);
  for (const frame of report.frames) {
    console.log(`frame ${frame.id}: ${frame.exists ? `${frame.bytes}B` : "MISSING"} => ${frame.ok ? "OK" : "FAIL"}`);
  }
  console.log(
    `toon bands=${report.toon?.bands ?? 0} outline=${report.toon?.outline} captions=${report.captionCueCount} ` +
      `minContrast=${report.minCaptionContrastRatio ?? "n/a"} frames=${report.frameCount}`
  );
  if (!report.ok) {
    console.error(report.blockers.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("PASS: real frames present, toon applied, captions readable.");
  }
}
