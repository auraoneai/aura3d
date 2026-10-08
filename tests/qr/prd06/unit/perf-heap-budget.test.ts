/**
 * PRD-06 §13 steady-state heap budget (S12 evidence): 0 bytes/frame on the
 * mixer + palette path — asserted as a < 64 KB `heapUsed` delta over 600
 * frames of two 191-joint mixer actors + the palette inner loop.
 *
 * Runs in a `node --expose-gc --import tsx` subprocess (vitest doesn't expose
 * `gc()` and its worker transform adds ambient allocations, which would
 * poison a per-frame heap-delta measurement).
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../../../..", import.meta.url));
const BENCH = fileURLToPath(new URL("../bench/perf-heap.bench.mts", import.meta.url));
const TSX_LOADER = fileURLToPath(new URL("../../../../node_modules/tsx/dist/loader.mjs", import.meta.url));

describe("PRD-06 §13 steady-state heap (S12)", () => {
  it("mixer + palette path allocates < 64 KB over 600 frames", { timeout: 120_000 }, () => {
    const stdout = execFileSync(process.execPath, ["--import", TSX_LOADER, "--expose-gc", BENCH], {
      cwd: REPO_ROOT,
      timeout: 120_000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    const line = stdout.trim().split("\n").at(-1)!;
    const { heapDeltaBytes } = JSON.parse(line) as { heapDeltaBytes: number };
    expect(heapDeltaBytes).toBeLessThan(64 * 1024);
  });
});
