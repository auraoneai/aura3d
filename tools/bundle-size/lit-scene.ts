// Bundle baseline (PRD-15 T0.3). Production Vite builds of three lit scenes,
// each reported as: initial-chunk gzip bytes + every lazy chunk at gzip -9.
//   - benchmarks/quality-rebuild `01-simple-geometry` (Aura side): built with
//     the scene module itself as the entry, so "initial" is the full eager
//     cost of the scene + engine and non-entry chunks are its lazy splits.
//   - apps/showcase-siege-golf: the app's own vite config (repo aliases) with
//     its index.html entry.
//   - templates/product-viewer: a real consumer — copied to a temp dir, its
//     `@aura3d/engine` dep rewritten to a `file:` tarball of the packed
//     package, installed, and built. Read-only: repo sources are untouched
//     and all outputs land in tmpdirs.
// Report lands in evidence/prd15/bundle-baseline.json (--out overrides).
// Run: pnpm exec tsx --tsconfig tsconfig.base.json tools/bundle-size/lit-scene.ts [--out <path>] [--keep-tmp]
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "vite";
import { prepareConsumerCopy } from "../packed-consumer-check/index";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_OUT = "docs/project/aura3d-quality-rebuild/evidence/prd15/bundle-baseline.json";

export interface ChunkReport {
  readonly file: string;
  readonly bytes: number;
  readonly gzipBytes: number;
}

export interface TargetReport {
  readonly id: string;
  readonly label: string;
  readonly entry: ChunkReport | null;
  readonly lazyChunks: readonly ChunkReport[];
  readonly totalJsBytes: number;
  readonly totalGzipBytes: number;
  readonly error?: string;
}

export interface BundleBaseline {
  readonly generatedAt: string;
  readonly tool: "tools/bundle-size/lit-scene.ts";
  readonly compression: "gzip-9";
  readonly targets: readonly TargetReport[];
}

function gzipSize(path: string): number {
  return gzipSync(readFileSync(path), { level: 9 }).length;
}

function reportOutDir(id: string, outDir: string): TargetReport {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.js$/.test(entry.name)) files.push(path);
    }
  };
  walk(outDir);
  const chunks = files
    .map((file) => ({ file: basename(file), bytes: readFileSync(file).length, gzipBytes: gzipSize(file) }))
    .sort((a, b) => b.bytes - a.bytes);
  // The entry chunk is the largest JS that shares its name stem with the
  // input (vite emits `<stem>-<hash>.js`); index.html builds emit `index-*`.
  const stem = id === "lit-scene-01" ? "01-simple-geometry" : "index";
  const entry = chunks.find((c) => c.file.startsWith(`${stem}-`)) ?? chunks[0] ?? null;
  const lazyChunks = chunks.filter((c) => c !== entry);
  return {
    id,
    label: id,
    entry,
    lazyChunks,
    totalJsBytes: chunks.reduce((s, c) => s + c.bytes, 0),
    totalGzipBytes: chunks.reduce((s, c) => s + c.gzipBytes, 0)
  };
}

async function buildScene(tmp: string): Promise<TargetReport> {
  const outDir = join(tmp, "dist-scene");
  await build({
    root: join(REPO_ROOT, "benchmarks/quality-rebuild"),
    configFile: join(REPO_ROOT, "benchmarks/quality-rebuild/vite.config.ts"),
    logLevel: "silent",
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: { input: join(REPO_ROOT, "benchmarks/quality-rebuild/aura3d/01-simple-geometry.ts") }
    }
  });
  const report = reportOutDir("lit-scene-01", outDir);
  return { ...report, label: "benchmarks/quality-rebuild aura3d/01-simple-geometry (entry build)" };
}

async function buildApp(tmp: string): Promise<TargetReport> {
  const appDir = join(REPO_ROOT, "apps/showcase-siege-golf");
  const outDir = join(tmp, "dist-siege-golf");
  await build({
    root: appDir,
    configFile: join(appDir, "vite.config.ts"),
    logLevel: "silent",
    build: { outDir, emptyOutDir: true }
  });
  const report = reportOutDir("siege-golf", outDir);
  return { ...report, label: "apps/showcase-siege-golf (index.html build)" };
}

function buildConsumer(tmp: string): TargetReport {
  const consumer = join(tmp, "consumer-product-viewer");
  const tarballDir = join(tmp, "pack");
  mkdirSync(tarballDir, { recursive: true });
  execFileSync("pnpm", ["pack", "--pack-destination", tarballDir], { cwd: REPO_ROOT, stdio: "pipe" });
  const tarball = join(tarballDir, readdirSync(tarballDir).find((f) => f.endsWith(".tgz"))!);
  prepareConsumerCopy(join(REPO_ROOT, "templates/product-viewer"), consumer, tarball);
  execFileSync("pnpm", ["install", "--offline=false"], { cwd: consumer, stdio: "pipe" });
  execFileSync("pnpm", ["exec", "vite", "build"], { cwd: consumer, stdio: "pipe" });
  const report = reportOutDir("product-viewer", join(consumer, "dist"));
  return { ...report, label: "templates/product-viewer (packed consumer build)" };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const keepTmp = args.includes("--keep-tmp");
  const outIndex = args.indexOf("--out");
  const outRel = outIndex >= 0 ? args[outIndex + 1]! : DEFAULT_OUT;

  const tmp = mkdtempSync(join(tmpdir(), "a3d-lit-scene-"));
  console.log(`lit-scene: temp dir ${tmp}`);

  const targets: TargetReport[] = [];
  const run = async (label: string, fn: () => Promise<TargetReport> | TargetReport): Promise<void> => {
    try {
      const report = await fn();
      targets.push(report);
      console.log(`PASS ${label}: initial ${report.entry?.gzipBytes ?? 0} B gzip, ${report.lazyChunks.length} lazy chunks, total ${report.totalGzipBytes} B gzip`);
    } catch (error) {
      targets.push({
        id: label, label,
        entry: null, lazyChunks: [], totalJsBytes: 0, totalGzipBytes: 0,
        error: error instanceof Error ? (error.stack ?? error.message) : String(error)
      });
      console.log(`FAIL ${label}: ${error instanceof Error ? error.message : error}`);
    }
  };

  await run("lit-scene-01", () => buildScene(tmp));
  await run("siege-golf", () => buildApp(tmp));
  await run("product-viewer", () => buildConsumer(tmp));

  const baseline: BundleBaseline = {
    generatedAt: new Date().toISOString(),
    tool: "tools/bundle-size/lit-scene.ts",
    compression: "gzip-9",
    targets
  };
  const outPath = resolve(REPO_ROOT, outRel);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`lit-scene: wrote ${outRel}`);

  if (!keepTmp) rmSync(tmp, { recursive: true, force: true });
  const failures = targets.filter((t) => t.error);
  if (failures.length > 0) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void main();
}
