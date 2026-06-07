import { createRequire } from "node:module";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  analyzeRgbaFrameMotionRegions,
  analyzeRgbaFrameVisualMetrics,
  type FrameMotionRegionMetrics,
  type FrameVisualMetrics
} from "../../packages/rendering/src/FrameVisualMetrics.js";

/**
 * Real-pixel cartoon fidelity gate.
 *
 * Unlike the structural/self-reported gates, this tool decodes the episode's
 * representative frame PNGs into RGBA byte buffers and runs the actual pixel
 * analysis from `@aura3d/rendering` (analyzeRgbaFrameVisualMetrics /
 * analyzeRgbaFrameMotionRegions). It FAILS when frames are blank/near-blank,
 * over/under-exposed, byte-identical (static), or show no local/character-region
 * motion across the sequence.
 */

export interface DecodedFrame {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

export interface FidelityFrameReport {
  readonly id: string;
  readonly path: string;
  readonly exists: boolean;
  readonly bytes: number;
  readonly decoded: boolean;
  readonly width: number;
  readonly height: number;
  readonly metrics: FrameVisualMetrics | null;
  readonly ok: boolean;
  readonly reasons: readonly string[];
}

export interface FidelityMotionReport {
  readonly from: string;
  readonly to: string;
  readonly identical: boolean;
  readonly changedRatio: number;
  readonly characterVisible: boolean;
  readonly characterMotionRegionCount: number;
  readonly regions: FrameMotionRegionMetrics["regions"];
  readonly ok: boolean;
  readonly reasons: readonly string[];
}

export interface CartoonVisualFidelityReport {
  readonly schema: "cartoon-studio-visual-fidelity/v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly framesDir: string;
  readonly decoder: string;
  readonly frames: readonly FidelityFrameReport[];
  readonly motion: readonly FidelityMotionReport[];
  readonly blockers: readonly string[];
}

export interface CartoonVisualFidelityThresholds {
  /** Below this mean luma the frame is treated as under-exposed / blank-dark. */
  readonly minMeanLuma: number;
  /** Above this mean luma the frame is treated as over-exposed / blown out. */
  readonly maxMeanLuma: number;
  /** At least this fraction of pixels must be non-dark (actual content). */
  readonly minNonDarkRatio: number;
  /** A frame whose dominant color bucket exceeds this is effectively flat/blank. */
  readonly maxDominantBucketRatio: number;
  /** Minimum local-contrast ratio so the frame has real texture/edges. */
  readonly minLocalContrastRatio: number;
  /** Minimum distinct color buckets. */
  readonly minColorBuckets: number;
  /** Minimum changed-pixel ratio between consecutive frames (rules out static). */
  readonly minMotionChangedRatio: number;
}

export const defaultFidelityThresholds: CartoonVisualFidelityThresholds = {
  minMeanLuma: 6,
  maxMeanLuma: 245,
  minNonDarkRatio: 0.05,
  maxDominantBucketRatio: 0.97,
  minLocalContrastRatio: 0.002,
  minColorBuckets: 6,
  minMotionChangedRatio: 0.0005
};

const requiredFrameIds = ["first", "dialogue", "action", "final"] as const;
const defaultFramesDir = "dist/episodes/moon-garden-001/frames";
const defaultOut = "tests/reports/aura3d11/cartoon-visual-fidelity.json";

interface SharpModule {
  (input: string): {
    ensureAlpha(): SharpModuleInstance;
  };
}
interface SharpModuleInstance {
  raw(): SharpModuleInstance;
  toBuffer(options: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }>;
}

/**
 * Resolve the `sharp` PNG decoder. Tries a normal bare import first (works when
 * sharp is a declared dependency), then falls back to resolving the installed
 * copy from the pnpm store so the gate works in this workspace today.
 */
async function loadSharp(): Promise<{ sharp: SharpModule; source: string }> {
  try {
    // Non-literal specifier so the typechecker doesn't try to resolve the
    // optional `sharp` dep (it's present in the pnpm store, not a direct dep).
    const sharpSpecifier = "sharp";
    const mod = (await import(sharpSpecifier)) as unknown as { default: SharpModule };
    return { sharp: mod.default, source: "sharp (bare import)" };
  } catch {
    // Fall through to store resolution.
  }
  const storeBase = join(
    process.cwd(),
    "node_modules/.pnpm/sharp@0.33.5/node_modules/sharp/package.json"
  );
  if (existsSync(storeBase)) {
    const require = createRequire(storeBase);
    const sharp = require("sharp") as SharpModule;
    return { sharp, source: "sharp (pnpm store: sharp@0.33.5)" };
  }
  throw new Error(
    "Could not load the `sharp` PNG decoder. Install it (pnpm add -D sharp) so the fidelity gate can decode real pixels."
  );
}

async function decodePng(sharp: SharpModule, absolutePath: string): Promise<DecodedFrame> {
  const { data, info } = await sharp(absolutePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) {
    throw new Error(`Expected 4 (RGBA) channels from ${absolutePath}, got ${info.channels}.`);
  }
  const pixels = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (pixels.length !== info.width * info.height * 4) {
    throw new Error(
      `Decoded buffer for ${absolutePath} is ${pixels.length} bytes, expected ${info.width * info.height * 4}.`
    );
  }
  return { width: info.width, height: info.height, pixels };
}

function evaluateFrame(metrics: FrameVisualMetrics, thresholds: CartoonVisualFidelityThresholds): string[] {
  const reasons: string[] = [];
  if (metrics.meanLuma < thresholds.minMeanLuma) {
    reasons.push(`under-exposed / blank-dark: meanLuma ${round(metrics.meanLuma)} < ${thresholds.minMeanLuma}`);
  }
  if (metrics.meanLuma > thresholds.maxMeanLuma) {
    reasons.push(`over-exposed / blown out: meanLuma ${round(metrics.meanLuma)} > ${thresholds.maxMeanLuma}`);
  }
  if (metrics.nonDarkRatio < thresholds.minNonDarkRatio) {
    reasons.push(`near-blank: nonDarkRatio ${round(metrics.nonDarkRatio)} < ${thresholds.minNonDarkRatio}`);
  }
  if (metrics.colorBuckets < thresholds.minColorBuckets) {
    reasons.push(`too few colors: colorBuckets ${metrics.colorBuckets} < ${thresholds.minColorBuckets}`);
  }
  if (metrics.dominantBucketRatio > thresholds.maxDominantBucketRatio) {
    reasons.push(`flat/solid fill: dominantBucketRatio ${round(metrics.dominantBucketRatio)} > ${thresholds.maxDominantBucketRatio}`);
  }
  if (metrics.localContrastRatio < thresholds.minLocalContrastRatio) {
    reasons.push(`no texture: localContrastRatio ${round(metrics.localContrastRatio)} < ${thresholds.minLocalContrastRatio}`);
  }
  return reasons;
}

function buffersIdentical(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export async function createCartoonVisualFidelityReport(
  root = process.cwd(),
  options: { framesDir?: string; thresholds?: CartoonVisualFidelityThresholds } = {}
): Promise<CartoonVisualFidelityReport> {
  const framesDir = options.framesDir ?? defaultFramesDir;
  const thresholds = options.thresholds ?? defaultFidelityThresholds;
  const { sharp, source } = await loadSharp();
  const blockers: string[] = [];

  const frames: FidelityFrameReport[] = [];
  const decoded: Array<DecodedFrame | null> = [];

  for (const id of requiredFrameIds) {
    const path = join(framesDir, `${id}.png`);
    const absolutePath = resolve(root, path);
    const exists = existsSync(absolutePath);
    const bytes = exists ? statSync(absolutePath).size : 0;
    const reasons: string[] = [];

    if (!exists) {
      reasons.push(`${path} is missing.`);
      frames.push({ id, path, exists, bytes, decoded: false, width: 0, height: 0, metrics: null, ok: false, reasons });
      decoded.push(null);
      continue;
    }

    let frame: DecodedFrame | null = null;
    let metrics: FrameVisualMetrics | null = null;
    try {
      frame = await decodePng(sharp, absolutePath);
      metrics = analyzeRgbaFrameVisualMetrics(frame.pixels, frame.width, frame.height);
      reasons.push(...evaluateFrame(metrics, thresholds));
    } catch (error) {
      reasons.push(`failed to decode/analyze ${path}: ${(error as Error).message}`);
    }

    decoded.push(frame);
    frames.push({
      id,
      path,
      exists,
      bytes,
      decoded: frame !== null,
      width: frame?.width ?? 0,
      height: frame?.height ?? 0,
      metrics,
      ok: reasons.length === 0,
      reasons
    });
  }
  blockers.push(...frames.flatMap((frame) => frame.reasons.map((reason) => `${frame.id}: ${reason}`)));

  const motion: FidelityMotionReport[] = [];
  for (let i = 1; i < requiredFrameIds.length; i += 1) {
    const fromId = requiredFrameIds[i - 1]!;
    const toId = requiredFrameIds[i]!;
    const prev = decoded[i - 1];
    const next = decoded[i];
    const reasons: string[] = [];

    if (!prev || !next) {
      reasons.push(`cannot compare ${fromId}->${toId}: a frame failed to decode.`);
      motion.push({
        from: fromId,
        to: toId,
        identical: false,
        changedRatio: 0,
        characterVisible: false,
        characterMotionRegionCount: 0,
        regions: [],
        ok: false,
        reasons
      });
      continue;
    }

    if (prev.width !== next.width || prev.height !== next.height) {
      reasons.push(`dimension mismatch ${fromId}(${prev.width}x${prev.height}) vs ${toId}(${next.width}x${next.height}).`);
      motion.push({
        from: fromId,
        to: toId,
        identical: false,
        changedRatio: 0,
        characterVisible: false,
        characterMotionRegionCount: 0,
        regions: [],
        ok: false,
        reasons
      });
      continue;
    }

    const identical = buffersIdentical(prev.pixels, next.pixels);
    const regionMetrics = analyzeRgbaFrameMotionRegions(prev.pixels, next.pixels, prev.width, prev.height);
    if (identical) {
      reasons.push(`static: ${fromId} and ${toId} are byte-identical.`);
    }
    if (regionMetrics.changedRatio < thresholds.minMotionChangedRatio) {
      reasons.push(
        `no motion: changedRatio ${round(regionMetrics.changedRatio)} < ${thresholds.minMotionChangedRatio} (${fromId}->${toId}).`
      );
    }
    if (regionMetrics.characterMotionRegionCount < 1) {
      reasons.push(`no character/local motion region detected (${fromId}->${toId}).`);
    }

    motion.push({
      from: fromId,
      to: toId,
      identical,
      changedRatio: regionMetrics.changedRatio,
      characterVisible: regionMetrics.characterVisible,
      characterMotionRegionCount: regionMetrics.characterMotionRegionCount,
      regions: regionMetrics.regions,
      ok: reasons.length === 0,
      reasons
    });
  }
  blockers.push(...motion.flatMap((m) => m.reasons.map((reason) => `${m.from}->${m.to}: ${reason}`)));

  return {
    schema: "cartoon-studio-visual-fidelity/v1",
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    framesDir,
    decoder: source,
    frames,
    motion,
    blockers
  };
}

export function writeCartoonVisualFidelityReport(root: string, report: CartoonVisualFidelityReport, out = defaultOut): void {
  const absoluteOut = resolve(root, out);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function parseArgs(argv: readonly string[]): Record<string, string | boolean> {
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
  currentScript.endsWith("tools/cartoon-studio-visual-fidelity-gate/index.ts") ||
  currentScript.endsWith("tools/cartoon-studio-visual-fidelity-gate/index.js")
) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const framesDir = typeof args["frames-dir"] === "string" ? (args["frames-dir"] as string) : undefined;
  const out = typeof args.out === "string" ? (args.out as string) : defaultOut;
  createCartoonVisualFidelityReport(root, framesDir ? { framesDir } : {})
    .then((report) => {
      writeCartoonVisualFidelityReport(root, report, out);
      console.log(`decoder: ${report.decoder}`);
      console.log(`framesDir: ${report.framesDir}`);
      for (const frame of report.frames) {
        if (frame.metrics) {
          console.log(
            `frame ${frame.id} (${frame.width}x${frame.height}): meanLuma=${round(frame.metrics.meanLuma)} ` +
              `nonDark=${round(frame.metrics.nonDarkRatio)} colorBuckets=${frame.metrics.colorBuckets} ` +
              `dominantBucket=${round(frame.metrics.dominantBucketRatio)} localContrast=${round(frame.metrics.localContrastRatio)} ` +
              `=> ${frame.ok ? "OK" : "FAIL"}`
          );
        } else {
          console.log(`frame ${frame.id}: NOT DECODED => FAIL`);
        }
      }
      for (const m of report.motion) {
        console.log(
          `motion ${m.from}->${m.to}: changedRatio=${round(m.changedRatio)} identical=${m.identical} ` +
            `characterRegions=${m.characterMotionRegionCount} => ${m.ok ? "OK" : "FAIL"}`
        );
      }
      console.log(`\nreport: ${out}`);
      if (!report.ok) {
        console.error(`\nFAIL (${report.blockers.length} blocker(s)):`);
        console.error(report.blockers.map((b) => `  - ${b}`).join("\n"));
        process.exitCode = 1;
      } else {
        console.log("\nPASS: frames decode to real pixels with content + motion.");
      }
    })
    .catch((error) => {
      console.error(`fidelity gate crashed: ${(error as Error).message}`);
      process.exitCode = 2;
    });
}
