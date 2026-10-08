/**
 * PRD-06 §13 CPU micro-budgets (S12 evidence).
 *
 * The PRD scopes these as "unit benchmarks, Node on GH macos-14" — so the
 * measurements run in a plain `node --import tsx` subprocess
 * (`../bench/perf-micro-budgets.bench.mts`), not inside vitest's worker
 * (vite-node's module transform layer inflates identical code ~40%). The
 * bench prints one JSON object of per-case medians in µs; this spec asserts
 * each §13 bar:
 *   PoseMixer.evaluate ≤ 25 µs (65 bones × 2 clips)
 *                      ≤ 60 µs (191 bones × 3 clips with mask)
 *   palette build      ≤ 10 µs per 65 joints
 *   two-bone IK        ≤ 2 µs
 *   spring chain       ≤ 3 µs (5 bones, 1 substep)
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../../../..", import.meta.url));
const BENCH = fileURLToPath(new URL("../bench/perf-micro-budgets.bench.mts", import.meta.url));
// `node --import tsx` resolves the package from cwd — under vitest's sandboxed
// spawn env that's fragile, so point at the loader entry directly (tsx's main
// export is ./dist/loader.mjs).
const TSX_LOADER = fileURLToPath(new URL("../../../../node_modules/tsx/dist/loader.mjs", import.meta.url));

interface BenchResults {
  mixer65x2: number;
  mixer191x3mask: number;
  palette65: number;
  ik2bone: number;
  spring5b1s: number;
}

function runBench(): BenchResults {
  const stdout = execFileSync(process.execPath, ["--import", TSX_LOADER, BENCH], {
    cwd: REPO_ROOT,
    timeout: 120_000,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const line = stdout.trim().split("\n").at(-1)!;
  return JSON.parse(line) as BenchResults;
}

describe("PRD-06 §13 CPU micro-budgets (S12)", () => {
  let results: BenchResults | undefined;
  const bench = (): BenchResults => (results ??= runBench());

  it("PoseMixer.evaluate ≤ 25 µs for 65 bones × 2 clips", { timeout: 150_000 }, () => {
    expect(bench().mixer65x2).toBeLessThanOrEqual(25);
  });

  it("PoseMixer.evaluate ≤ 60 µs for 191 bones × 3 clips with mask", { timeout: 150_000 }, () => {
    expect(bench().mixer191x3mask).toBeLessThanOrEqual(60);
  });

  it("palette build ≤ 10 µs per 65 joints", { timeout: 150_000 }, () => {
    expect(bench().palette65).toBeLessThanOrEqual(10);
  });

  it("two-bone IK solve ≤ 2 µs", { timeout: 150_000 }, () => {
    expect(bench().ik2bone).toBeLessThanOrEqual(2);
  });

  it("spring chain (5 bones, 1 substep) ≤ 3 µs", { timeout: 150_000 }, () => {
    expect(bench().spring5b1s).toBeLessThanOrEqual(3);
  });
});
