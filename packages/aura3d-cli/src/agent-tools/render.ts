// `aura3d render`: build (optional), serve, open the app in headless Chrome, save a screenshot and print diagnostics JSON:
// console errors, page exceptions, failed requests, engine diagnostics codes, frame luma and saturation, and how much of the
// frame the subject fills. It is `aura3d verify`'s browser half (same driver, same frame analysis, same codes) plus colour and
// subject-fill metrics; `--url` renders an already running dev server instead of building.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { explainCode } from "../verify/codes.js";
import type { VerifyBrowserDriver } from "../verify/cdp.js";
import { decodePng, type FrameAnalysis, type RgbImage } from "../verify/frame.js";
import { runVerify, type VerifyFinding, type VerifyReport, type VerifyStep } from "../verify/run.js";
import { optionNumber, optionValue, positionals, type AgentToolIo } from "./shared.js";

export const RENDER_SCHEMA = "aura3d.render/1";
export const RENDER_USAGE =
  "aura3d render [projectDir] [--out shot.png] [--json] [--no-build] [--url http://127.0.0.1:5173/] [--route /path] [--dist dist]\n" +
  "              [--width N --height N --settle-ms N --ready-timeout-ms N] [--chrome <path>] [--software-gl]\n" +
  "  Builds (unless --no-build or --url), serves dist/, screenshots the app in headless Chrome and prints diagnostics.\n" +
  "  Exit 0 when no error finding, 1 otherwise, 2 on usage error.";

export interface ColorMetrics {
  /** Mean HSV saturation (0..1) over pixels that are not near-black. */
  readonly meanSaturation: number;
  /** Share of pixels with saturation >= 0.25. */
  readonly saturatedFraction: number;
  readonly meanLuma: number;
  readonly lumaStddev: number;
  /** Share of pixels with luma >= 235 (clipped highlights). */
  readonly clippedFraction: number;
}

export interface SubjectMetrics {
  /** Share of the frame that differs from the border-estimated background. */
  readonly fill: number;
  /** Bounding box of the subject blocks, in 0..1 frame units. */
  readonly bbox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** bbox height / frame height. */
  readonly heightFraction: number;
  /** Background colours estimated from the frame border (1 to 4). */
  readonly background: readonly (readonly [number, number, number])[];
}

export interface RenderReport {
  readonly schema: typeof RENDER_SCHEMA;
  readonly ok: boolean;
  readonly target: string;
  readonly screenshot?: string;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly backend?: string;
  readonly drawCalls?: number;
  readonly frame?: FrameAnalysis;
  readonly color?: ColorMetrics;
  /** Null when the border is not a uniform background (sky gradient, full-bleed scene), so fill cannot be measured this way. */
  readonly subject: SubjectMetrics | null;
  readonly subjectNote?: string;
  readonly motion?: { readonly moved: boolean; readonly changedPixelFraction: number };
  /** Unique finding codes, errors first. */
  readonly codes: readonly string[];
  /** Messages of error findings (console errors, exceptions, failed requests, engine errors). */
  readonly errors: readonly string[];
  readonly findings: readonly VerifyFinding[];
  readonly steps: VerifyReport["steps"];
  readonly counts: VerifyReport["counts"];
}

const round = (v: number, d = 3): number => Math.round(v * 10 ** d) / 10 ** d;

export function colorMetrics(image: RgbImage): ColorMetrics {
  const { rgb } = image;
  const n = image.width * image.height;
  let satSum = 0, satCount = 0, saturated = 0, lumSum = 0, lumSq = 0, clipped = 0;
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3]!, g = rgb[i * 3 + 1]!, b = rgb[i * 3 + 2]!;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumSum += l; lumSq += l * l; if (l >= 235) clipped++;
    if (max >= 20) { const s = (max - min) / max; satSum += s; satCount++; if (s >= 0.25) saturated++; }
  }
  const mean = lumSum / n;
  return {
    meanSaturation: round(satCount ? satSum / satCount : 0), saturatedFraction: round(saturated / n),
    meanLuma: round(mean, 2), lumaStddev: round(Math.sqrt(Math.max(0, lumSq / n - mean * mean)), 2), clippedFraction: round(clipped / n, 4)
  };
}

/**
 * Subject fill against a background estimated from the frame border (outer 4%). The border colours are bucketed (32 levels per
 * channel) and the most common buckets that together cover 85% of the border (at most 4: a backdrop plus a floor, say) are the
 * background. Blocks of 8x8 pixels where at least half the pixels differ from every background colour by more than 30 (max
 * channel) count as subject. Returns null with a reason when 4 buckets cannot cover the border (a sky gradient, a full-bleed
 * scene), because then the estimate would be noise.
 */
export function subjectMetrics(image: RgbImage): { subject: SubjectMetrics | null; note?: string } {
  const { width: w, height: h, rgb } = image;
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.04));
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let samples = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue;
    const i = (y * w + x) * 3, r = rgb[i]!, g = rgb[i + 1]!, b = rgb[i + 2]!;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const cell = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cell.n++; cell.r += r; cell.g += g; cell.b += b; buckets.set(key, cell);
    samples++;
  }
  const ranked = [...buckets.values()].sort((a, b) => b.n - a.n);
  const background: [number, number, number][] = [];
  let covered = 0;
  for (const cell of ranked) {
    if (covered >= samples * 0.85) break;
    // Neighbouring buckets of a gentle gradient fold into an existing background colour.
    const colour: [number, number, number] = [cell.r / cell.n, cell.g / cell.n, cell.b / cell.n];
    if (!background.some((c) => Math.max(Math.abs(c[0] - colour[0]), Math.abs(c[1] - colour[1]), Math.abs(c[2] - colour[2])) <= 12)) {
      if (background.length === 4) break;
      background.push(colour);
    }
    covered += cell.n;
  }
  if (covered < samples * 0.85) return { subject: null, note: `The frame border has no small set of background colours (4 colours cover ${Math.round((covered / Math.max(1, samples)) * 100)}% of it), e.g. a sky gradient or a full-bleed scene; subject fill not measured.` };
  const far = (r: number, g: number, b: number): boolean => background.every((c) => Math.max(Math.abs(r - c[0]), Math.abs(g - c[1]), Math.abs(b - c[2])) > 30);
  const bs = 8;
  let blocks = 0, hits = 0, minX = w, minY = h, maxX = -1, maxY = -1;
  for (let by = 0; by + bs <= h; by += bs) for (let bx = 0; bx + bs <= w; bx += bs) {
    let off = 0;
    for (let y = by; y < by + bs; y++) for (let x = bx; x < bx + bs; x++) { const i = (y * w + x) * 3; if (far(rgb[i]!, rgb[i + 1]!, rgb[i + 2]!)) off++; }
    blocks++;
    if (off * 2 >= bs * bs) { hits++; minX = Math.min(minX, bx); minY = Math.min(minY, by); maxX = Math.max(maxX, bx + bs); maxY = Math.max(maxY, by + bs); }
  }
  const bg = background.map((c) => c.map(Math.round) as [number, number, number]);
  if (hits === 0) return { subject: { fill: 0, bbox: { x: 0, y: 0, width: 0, height: 0 }, heightFraction: 0, background: bg } };
  return {
    subject: {
      fill: round(hits / blocks), heightFraction: round((maxY - minY) / h),
      bbox: { x: round(minX / w), y: round(minY / h), width: round((maxX - minX) / w), height: round((maxY - minY) / h) }, background: bg
    }
  };
}

function extraFinding(code: string, message: string, evidence: Record<string, unknown>): VerifyFinding {
  const entry = explainCode(code)!;
  return { code, severity: entry.severity, step: entry.step, message, cause: entry.cause, fix: entry.fix, evidence };
}

export interface RenderOptions {
  readonly projectDir: string;
  readonly out?: string;
  readonly build?: boolean;
  readonly url?: string;
  readonly route?: string;
  readonly distDir?: string;
  readonly width?: number;
  readonly height?: number;
  readonly settleMs?: number;
  readonly readyTimeoutMs?: number;
  readonly chromePath?: string;
  readonly softwareGl?: boolean;
  readonly driver?: VerifyBrowserDriver;
  readonly runCommand?: Parameters<typeof runVerify>[0]["runCommand"];
}

export async function runRender(options: RenderOptions): Promise<RenderReport> {
  const projectDir = resolve(options.projectDir);
  const framesDir = mkdtempSync(join(tmpdir(), "aura3d-render-"));
  const skip: VerifyStep[] = ["typecheck", "assets", "lint"];
  if (options.build === false || options.url) skip.push("build");
  try {
    const report = await runVerify({
      projectDir, skip, framesDir,
      ...(options.url ? { url: options.url } : {}), ...(options.route ? { route: options.route } : {}), ...(options.distDir ? { distDir: options.distDir } : {}),
      ...(options.width ? { width: options.width } : {}), ...(options.height ? { height: options.height } : {}),
      ...(options.settleMs !== undefined ? { settleMs: options.settleMs } : {}), ...(options.readyTimeoutMs !== undefined ? { readyTimeoutMs: options.readyTimeoutMs } : {}),
      ...(options.chromePath ? { chromePath: options.chromePath } : {}), ...(options.softwareGl ? { softwareGl: true } : {}),
      ...(options.driver ? { driver: options.driver } : {}), ...(options.runCommand ? { runCommand: options.runCommand } : {})
    });
    const findings: VerifyFinding[] = [...report.findings];
    let screenshot: string | undefined;
    let color: ColorMetrics | undefined;
    let subject: SubjectMetrics | null = null;
    let subjectNote: string | undefined;
    const first = report.render?.frames?.[0];
    if (first && existsSync(join(framesDir, first))) {
      screenshot = resolve(projectDir, options.out ?? join(".aura3d", "render.png"));
      mkdirSync(dirname(screenshot), { recursive: true });
      copyFileSync(join(framesDir, first), screenshot);
      const image = decodePng(readFileSync(screenshot));
      color = colorMetrics(image);
      const measured = subjectMetrics(image);
      subject = measured.subject;
      subjectNote = measured.note;
      const drawn = report.render?.frame?.drawn ?? false;
      if (drawn && color.meanSaturation < 0.12 && color.meanLuma > 140 && color.lumaStddev < 40) {
        findings.push(extraFinding("RENDER_WASHED_OUT", `Mean saturation ${color.meanSaturation} at mean luma ${color.meanLuma} with luma spread ${color.lumaStddev}: the frame reads grey, bright and low-contrast.`, { ...color }));
      }
      // A small subject on a plain background often fails the "drawn" texture threshold (FRAME_EMPTY), so only black and flat frames are excluded here.
      const visible = !!report.render?.frame && !report.render.frame.black && !report.render.frame.flat;
      if (visible && subject && subject.fill > 0 && subject.heightFraction < 0.25 && subject.fill < 0.08) {
        findings.push(extraFinding("RENDER_SUBJECT_SMALL", `The subject covers ${Math.round(subject.fill * 100)}% of the frame and ${Math.round(subject.heightFraction * 100)}% of its height.`, { ...subject }));
      }
    }
    const counts = { error: 0, warning: 0, info: 0 };
    for (const f of findings) counts[f.severity]++;
    const order = { error: 0, warning: 1, info: 2 } as const;
    const codes = [...new Set([...findings].sort((a, b) => order[a.severity] - order[b.severity]).map((f) => f.code))];
    return {
      schema: RENDER_SCHEMA,
      ok: counts.error === 0,
      target: options.url ?? `${basename(projectDir)}${options.route ?? "/"}`,
      ...(screenshot ? { screenshot } : {}),
      ...(report.render ? { viewport: report.render.viewport } : {}),
      ...(report.render?.backend ? { backend: report.render.backend } : {}),
      ...(report.render?.drawCalls !== undefined ? { drawCalls: report.render.drawCalls } : {}),
      ...(report.render?.frame ? { frame: report.render.frame } : {}),
      ...(color ? { color } : {}),
      subject,
      ...(subjectNote ? { subjectNote } : {}),
      ...(report.render?.motion ? { motion: { moved: report.render.motion.moved, changedPixelFraction: report.render.motion.changedPixelFraction } } : {}),
      codes,
      errors: findings.filter((f) => f.severity === "error").map((f) => `${f.code}: ${f.message}`),
      findings,
      steps: report.steps,
      counts
    };
  } finally {
    rmSync(framesDir, { recursive: true, force: true });
  }
}

export function formatRender(report: RenderReport): string {
  const lines = [`aura3d render: ${report.ok ? "PASS" : "FAIL"} ${report.target} (${report.counts.error} error, ${report.counts.warning} warning)`];
  if (report.screenshot) lines.push(`  screenshot: ${report.screenshot}  (open it and look before calling the scene done)`);
  if (report.backend || report.drawCalls !== undefined) lines.push(`  backend ${report.backend ?? "?"}, ${report.drawCalls ?? "?"} draw calls`);
  if (report.frame) lines.push(`  frame: mean luma ${report.frame.meanLuma}, p99 ${report.frame.p99Luma}, ${report.frame.distinctColors} colours, ${(report.frame.texturedBlockFraction * 100).toFixed(1)}% textured${report.frame.drawn ? "" : `  (${report.frame.reasons.join("; ")})`}`);
  if (report.color) lines.push(`  colour: mean saturation ${report.color.meanSaturation}, ${(report.color.saturatedFraction * 100).toFixed(1)}% saturated, ${(report.color.clippedFraction * 100).toFixed(2)}% clipped`);
  if (report.subject) lines.push(`  subject: ${(report.subject.fill * 100).toFixed(1)}% of frame, ${(report.subject.heightFraction * 100).toFixed(0)}% of height, bbox x ${report.subject.bbox.x} y ${report.subject.bbox.y} w ${report.subject.bbox.width} h ${report.subject.bbox.height}`);
  else if (report.subjectNote) lines.push(`  subject: ${report.subjectNote}`);
  if (report.motion) lines.push(`  motion: ${report.motion.moved ? "moving" : "static"} (${(report.motion.changedPixelFraction * 100).toFixed(2)}% pixels changed)`);
  for (const step of report.steps) if (step.status !== "skipped") lines.push(`  ${step.status.padEnd(7)} ${step.id}${step.detail ? `  (${step.detail})` : ""}`);
  for (const f of report.findings) lines.push(`${f.severity.toUpperCase().padEnd(7)} ${f.code}`, `        ${f.message}`, `        fix: ${f.fix}`);
  return lines.join("\n");
}

export async function renderCommand(argv: readonly string[], io: AgentToolIo, injected?: { driver?: VerifyBrowserDriver; runCommand?: RenderOptions["runCommand"] }): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) { io.stdout(RENDER_USAGE); return 0; }
  const valueFlags = new Set(["--out", "--url", "--route", "--dist", "--width", "--height", "--settle-ms", "--ready-timeout-ms", "--chrome"]);
  let report: RenderReport;
  try {
    const url = optionValue(argv, "--url");
    if (url && !/^https?:\/\//.test(url)) { io.stderr("--url needs an http(s) URL, for example http://127.0.0.1:5173/"); return 2; }
    report = await runRender({
      projectDir: resolve(io.cwd, positionals(argv, valueFlags)[0] ?? "."),
      build: !argv.includes("--no-build"),
      ...(optionValue(argv, "--out") ? { out: resolve(io.cwd, optionValue(argv, "--out")!) } : {}),
      ...(url ? { url } : {}),
      ...(optionValue(argv, "--route") ? { route: optionValue(argv, "--route")! } : {}),
      ...(optionValue(argv, "--dist") ? { distDir: optionValue(argv, "--dist")! } : {}),
      ...(optionNumber(argv, "--width") ? { width: optionNumber(argv, "--width")! } : {}),
      ...(optionNumber(argv, "--height") ? { height: optionNumber(argv, "--height")! } : {}),
      ...(optionNumber(argv, "--settle-ms") !== undefined ? { settleMs: optionNumber(argv, "--settle-ms")! } : {}),
      ...(optionNumber(argv, "--ready-timeout-ms") !== undefined ? { readyTimeoutMs: optionNumber(argv, "--ready-timeout-ms")! } : {}),
      ...(optionValue(argv, "--chrome") ? { chromePath: optionValue(argv, "--chrome")! } : {}),
      ...(argv.includes("--software-gl") ? { softwareGl: true } : {}),
      ...(injected?.driver ? { driver: injected.driver } : {}),
      ...(injected?.runCommand ? { runCommand: injected.runCommand } : {})
    });
  } catch (error) { io.stderr(String((error as Error).message ?? error)); return 2; }
  io.stdout(argv.includes("--json") ? JSON.stringify(report, null, 2) : formatRender(report));
  return report.ok ? 0 : 1;
}
