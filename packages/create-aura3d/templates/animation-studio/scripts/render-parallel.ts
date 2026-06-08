/**
 * render-parallel.ts — render a full episode FASTER by splitting the timeline across N
 * render-live processes (each uses its own core / browser page), then concatenating the
 * partial videos (#8). Process-level parallelism so the CPU toon pass is parallel too.
 *
 *   AURA_DOCUMENT=<doc.json> AURA_PARALLEL=4 \
 *     pnpm exec tsx --tsconfig tsconfig.base.json packages/create-aura3d/templates/animation-studio/scripts/render-parallel.ts
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..", "..", "..", "..", "..");
const TEMPLATE = resolve(__dirname, "..");

const DOC = process.env.AURA_DOCUMENT ? resolve(process.env.AURA_DOCUMENT) : resolve(TEMPLATE, "dist/scene/working.document.json");
const N = Math.max(1, Math.min(8, Number(process.env.AURA_PARALLEL ?? "4")));
const FINAL_OUT = resolve(TEMPLATE, process.env.AURA_OUTPUT_DIR ?? "dist/episodes/scene");

function ffmpegBin(): string {
  try {
    const req = createRequire(import.meta.url);
    const inst = req("@ffmpeg-installer/ffmpeg") as { path?: string };
    if (inst.path && existsSync(inst.path)) return inst.path;
  } catch { /* PATH */ }
  return "ffmpeg";
}

function renderSlice(index: number, start: number, end: number): Promise<number> {
  const outDir = `dist/episodes/parallel/slice-${index}`;
  return new Promise((res) => {
    const child = spawn(
      "pnpm",
      ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "packages/create-aura3d/templates/animation-studio/scripts/render-live.ts"],
      { cwd: REPO, stdio: "ignore", env: { ...process.env, AURA_DOCUMENT: DOC, AURA_OUTPUT_DIR: outDir, AURA_PREVIEW_RANGE: `${start}-${end}` } }
    );
    child.on("exit", (code) => res(code ?? 1));
  });
}

async function main(): Promise<void> {
  if (!existsSync(DOC)) { console.error(`document not found: ${DOC}`); process.exitCode = 1; return; }
  const duration = (JSON.parse(readFileSync(DOC, "utf8")) as { duration: number }).duration;
  const sliceDur = duration / N;
  const ranges = Array.from({ length: N }, (_, i) => ({ i, start: +(i * sliceDur).toFixed(3), end: +((i + 1) * sliceDur).toFixed(3) }));

  console.log(`rendering ${duration}s across ${N} parallel processes ...`);
  const t0 = Date.now();
  const codes = await Promise.all(ranges.map((r) => renderSlice(r.i, r.start, r.end)));
  if (codes.some((c) => c !== 0)) { console.error(`a slice failed: ${codes.join(",")}`); process.exitCode = 1; return; }
  console.log(`all slices rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s; concatenating ...`);

  // Concatenate the partial webms in order (ffmpeg concat demuxer).
  mkdirSync(FINAL_OUT, { recursive: true });
  const listPath = resolve(FINAL_OUT, "concat.txt");
  writeFileSync(
    listPath,
    ranges.map((r) => `file '${resolve(TEMPLATE, `dist/episodes/parallel/slice-${r.i}/episode-3d.webm`)}'`).join("\n") + "\n"
  );
  const cat = spawnSync(ffmpegBin(), ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", resolve(FINAL_OUT, "episode-3d.webm")], { stdio: "ignore" });
  rmSync(listPath, { force: true });
  if (cat.status !== 0) { console.error("concat failed"); process.exitCode = 1; return; }
  console.log(`done → ${resolve(FINAL_OUT, "episode-3d.webm")} (total ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

void main();
