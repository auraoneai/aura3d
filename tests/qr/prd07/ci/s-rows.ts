// 07 Phase D CLI — evaluates S1..S15 for one prd07-vfx.yml run.
//
//   pnpm exec tsx tests/qr/prd07/ci/s-rows.ts --evidence <EVIDENCE_DIR>
//     [--judges <dir>] [--signoffs <file.json>] [--out <file.json>] [--strict]
//
// <EVIDENCE_DIR> holds capture-vfx/, capture-none/, games-vfx/, games-none/
// as written by the prd07-vfx.yml capture and games jobs. Judge records are
// C-32 JSON (one record, an array, or `{ records: [...] }` per file) produced
// by the quality-review workflow; sign-offs are `HumanSignoff[]`.
//
// Exit: 1 when any engineering check fails (a broken run). With --strict
// (promotion evaluation, FINISH-LANE-07 flag criterion 2) also when any row
// is not `pass`. Judge/H/unmeasured rows are reported as `pending`, never
// as pass, so a run without judge records cannot tick a row.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { decodePng, type DecodedPng } from "../../../../tools/quality-gate/src/png";
import type { CaptureReportLike, FrameMeasure, GamesReportLike, HumanSignoff, JudgeRecordLike, PhaseDInputs } from "./s-rows-lib";
import { evaluatePhaseD } from "./s-rows-table";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readJson<T>(file: string): T | null {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : null;
}

function png(file: string): DecodedPng | null {
  if (!existsSync(file)) return null;
  try { return decodePng(readFileSync(file)); } catch { return null; }
}

function linLuma(r: number, g: number, b: number): number {
  const l = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b);
}

/** PRD-12 skyVariance: linear-luma std inside the sky mask (top 30 % of the frame when no mask). */
export function skyVariance(img: DecodedPng, mask: DecodedPng | null): number {
  // Two-pass std: the one-pass E[x²]−E[x]² form leaves ~1e-8 on a flat sky,
  // which would wrongly pass the `skyVariance > 0` threshold.
  const values: number[] = [];
  const rows = Math.floor(img.height * 0.3);
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const i = (y * img.width + x) * 4;
      const inside = mask && mask.width === img.width && mask.height === img.height
        ? mask.rgba[i]! + mask.rgba[i + 1]! + mask.rgba[i + 2]! > 0
        : y < rows;
      if (inside) values.push(linLuma(img.rgba[i]!, img.rgba[i + 1]!, img.rgba[i + 2]!));
    }
  }
  if (values.length === 0 || values.every((v) => v === values[0])) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) * (v - mean), 0) / values.length);
}

/** PRD-12 subjectPresence: fraction of the three object mask differing from the corner background by > 6 levels. */
export function subjectPresence(img: DecodedPng, objectMask: DecodedPng): number | null {
  if (objectMask.width !== img.width || objectMask.height !== img.height) return null;
  const patch = 8;
  const corners: number[][] = [];
  for (const [cx, cy] of [[0, 0], [img.width - patch, 0], [0, img.height - patch], [img.width - patch, img.height - patch]] as const) {
    for (let y = cy; y < cy + patch; y += 1) for (let x = cx; x < cx + patch; x += 1) {
      const i = (y * img.width + x) * 4;
      corners.push([img.rgba[i]!, img.rgba[i + 1]!, img.rgba[i + 2]!]);
    }
  }
  const median = (k: number) => { const v = corners.map((c) => c[k]!).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]!; };
  const bg = [median(0), median(1), median(2)];
  let inside = 0, differ = 0;
  for (let p = 0; p < img.width * img.height; p += 1) {
    const i = p * 4;
    if (objectMask.rgba[i]! + objectMask.rgba[i + 1]! + objectMask.rgba[i + 2]! === 0) continue;
    inside += 1;
    const d = Math.max(Math.abs(img.rgba[i]! - bg[0]!), Math.abs(img.rgba[i + 1]! - bg[1]!), Math.abs(img.rgba[i + 2]! - bg[2]!));
    if (d > 6) differ += 1;
  }
  return inside === 0 ? null : differ / inside;
}

function measureFrames(captureDir: string, report: CaptureReportLike | null): Record<string, FrameMeasure> {
  const out: Record<string, FrameMeasure> = {};
  for (const s of report?.scenes ?? []) {
    const dir = join(captureDir, s.scene);
    const img = png(join(dir, "aura3d.png"));
    if (!img) continue;
    const skyMask = png(join(dir, "three.sky.mask.png"));
    const objMask = png(join(dir, "three.object-id.mask.png"));
    out[s.scene] = {
      skyVariance: skyVariance(img, skyMask),
      skyVarianceSource: skyMask ? "sky-mask" : "frame-top-region",
      subjectPresence: objMask ? subjectPresence(img, objMask) : null
    };
  }
  return out;
}

function readJudges(dir: string | undefined): JudgeRecordLike[] {
  if (!dir || !existsSync(dir)) return [];
  const out: JudgeRecordLike[] = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const data = JSON.parse(readFileSync(join(dir, name), "utf8")) as unknown;
    const list = Array.isArray(data) ? data : (data as { records?: unknown[] }).records ?? [data];
    for (const r of list as JudgeRecordLike[]) if (r && typeof r.itemId === "string" && r.scores) out.push(r);
  }
  return out;
}

function main(): void {
  const evidence = arg("--evidence") ?? process.env.EVIDENCE_DIR;
  if (!evidence) {
    console.error("::error::usage: s-rows.ts --evidence <dir> [--judges <dir>] [--signoffs <file>] [--out <file>] [--strict]");
    process.exit(2);
  }
  const vfx = readJson<CaptureReportLike>(join(evidence, "capture-vfx", "report.json"));
  const input: PhaseDInputs = {
    vfx,
    none: readJson<CaptureReportLike>(join(evidence, "capture-none", "report.json")),
    gamesVfx: readJson<GamesReportLike>(join(evidence, "games-vfx", "report.json")),
    gamesNone: readJson<GamesReportLike>(join(evidence, "games-none", "report.json")),
    frames: measureFrames(join(evidence, "capture-vfx"), vfx),
    judges: readJudges(arg("--judges")),
    signoffs: readJson<HumanSignoff[]>(arg("--signoffs") ?? "") ?? []
  };
  const rows = evaluatePhaseD(input);
  const engineeringFails = rows.flatMap((r) => r.checks.filter((c) => c.cls === "engineering" && c.status === "fail").map((c) => `${r.row} ${c.id}: ${c.detail}`));
  const result = {
    schema: "aura3d.prd07.phase-d/1",
    generatedAt: new Date().toISOString(),
    githubRunId: process.env.GITHUB_RUN_ID ?? vfx?.environment?.githubRunId ?? null,
    sha: process.env.GITHUB_SHA ?? null,
    provider: { ciProvider: vfx?.environment?.ciProvider ?? null, runnerImage: vfx?.environment?.runnerImage ?? null },
    judgeRecords: input.judges.length,
    signoffs: input.signoffs.length,
    summary: Object.fromEntries(rows.map((r) => [r.row, r.status])),
    rows
  };
  const out = arg("--out") ?? join(evidence, "s-rows.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(result, null, 2));
  const md = ["| row | status | fail | pending/unmeasured |", "|---|---|---|---|",
    ...rows.map((r) => `| ${r.row} | ${r.status} | ${r.checks.filter((c) => c.status === "fail").length} | ${r.checks.filter((c) => c.status === "pending" || c.status === "unmeasured").length} |`)].join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 07 Phase D S-rows\n\n${md}\n`);
  console.log(md);
  for (const f of engineeringFails) console.error(`::error::${f}`);
  const strict = process.argv.includes("--strict");
  process.exit(engineeringFails.length > 0 || (strict && rows.some((r) => r.status !== "pass")) ? 1 : 0);
}

// Run only as a CLI so the unit test can import the pixel metrics.
if (/s-rows\.ts$/.test(process.argv[1] ?? "")) main();
