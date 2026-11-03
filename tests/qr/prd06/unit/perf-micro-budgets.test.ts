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
 *
 * Machine calibration (pattern: tests/unit/engine/instance-matrices-dense.test.ts): the raw µs bars are
 * reference-Mac numbers, and a shared ACR shard is several times slower without any code change. The bench
 * times a fixed engine-free calibration workload interleaved with every case sample, and each case asserts
 * median(case) / median(calibration) <= budget / REFERENCE_CALIBRATION_US. The §13 budgets are unchanged;
 * the calibration only translates them to the current machine.
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

type BenchCase = "mixer65x2" | "mixer191x3mask" | "palette65" | "ik2bone" | "spring5b1s";
type BenchResults = Record<BenchCase, number> & { readonly calibration: Record<BenchCase, number> };

/**
 * Calibration time (median µs of the bench's `calibrate()`) on the reference Mac (Apple Silicon dev Mac, plain
 * Node), recorded 2026-11-03 from 5 local bench runs (per-case medians 0.708-1.417 µs under varying load); the
 * smallest is used. Later runs on the same Mac measured calibration as low as 0.5 µs, where the translated bars
 * are stricter than the raw §13 numbers, never looser. Re-record only when the calibration workload changes.
 */
const REFERENCE_CALIBRATION_US = 0.708;

/** Assert one §13 bar in calibration units and log the translation to this machine. */
function expectWithinBudget(results: BenchResults, name: BenchCase, budgetUs: number): void {
  const measured = results[name];
  const calibrationUs = results.calibration[name];
  expect(Number.isFinite(measured) && Number.isFinite(calibrationUs) && calibrationUs > 0, `${name}: bench output`).toBe(true);
  const ratio = measured / calibrationUs;
  const budgetRatio = budgetUs / REFERENCE_CALIBRATION_US;
  console.log(
    `${name}: median ${measured.toFixed(3)} µs, calibration ${calibrationUs.toFixed(3)} µs (reference ${REFERENCE_CALIBRATION_US} µs); ` +
      `ratio ${ratio.toFixed(3)} <= ${budgetRatio.toFixed(3)} (${budgetUs} µs on the reference Mac = ${(budgetRatio * calibrationUs).toFixed(3)} µs here)`
  );
  expect(ratio, `${name}: ${measured.toFixed(3)} µs vs ${budgetUs} µs reference budget`).toBeLessThanOrEqual(budgetRatio);
}

function runBench(): BenchResults {
  const stdout = execFileSync(process.execPath, ["--import", TSX_LOADER, BENCH], {
    cwd: REPO_ROOT,
    timeout: 120_000,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      // Resolve @aura3d/* specifiers to packages/*/src: CI has no built dist/.
      TSX_TSCONFIG_PATH: fileURLToPath(new URL("../../../../tsconfig.check.json", import.meta.url))
    }
  });
  const line = stdout.trim().split("\n").at(-1)!;
  return JSON.parse(line) as BenchResults;
}

describe("PRD-06 §13 CPU micro-budgets (S12)", () => {
  let results: BenchResults | undefined;
  const bench = (): BenchResults => (results ??= runBench());

  it("PoseMixer.evaluate ≤ 25 µs for 65 bones × 2 clips", { timeout: 150_000 }, () => {
    expectWithinBudget(bench(), "mixer65x2", 25);
  });

  it("PoseMixer.evaluate ≤ 60 µs for 191 bones × 3 clips with mask", { timeout: 150_000 }, () => {
    expectWithinBudget(bench(), "mixer191x3mask", 60);
  });

  it("palette build ≤ 10 µs per 65 joints", { timeout: 150_000 }, () => {
    expectWithinBudget(bench(), "palette65", 10);
  });

  it("two-bone IK solve ≤ 2 µs", { timeout: 150_000 }, () => {
    expectWithinBudget(bench(), "ik2bone", 2);
  });

  it("spring chain (5 bones, 1 substep) ≤ 3 µs", { timeout: 150_000 }, () => {
    expectWithinBudget(bench(), "spring5b1s", 3);
  });
});
