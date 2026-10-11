/**
 * 01-HANG (GPU run 38183139704 capture: `prd01-draw-throughput` watchdog, no
 * __QR_READY__ after 110 s). Two defects made every lane capture run on the
 * stub C-02 cache and recompile per draw per frame (~134 x drawCalls compiles;
 * 2,000 draws x ~6 ms ≈ 12 s per frame):
 *  1. `StubProgramCache.acquire` computed the key but never memoized it.
 *  2. In a code-split production bundle the rendering lane providers
 *     (`programCacheSlot.provide` et al.) landed in a
 *     lazy chunk reached only through prd06's `import("@aura3d/rendering")`,
 *     so the real cache was not provided at mount. t0-1140's single-entry
 *     esbuild bundle has no code splitting and never saw it.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { build, type Rollup } from "vite";
import { programCacheSlot } from "../../../../packages/rendering/src/contracts/program";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("01-HANG: the stub C-02 cache compiles once per key", () => {
  it("2,000 identical-feature acquires over 3 frames create one program", () => {
    const device = new MockRenderDevice();
    const create = vi.spyOn(device, "createShaderProgram");
    // `stub` is the PR-0a default factory, whatever the slot currently provides.
    const cache = programCacheSlot.stub(device);
    const lit = normalizeProgramFeatures({ lighting: "lit", pass: "forward" });
    const first = cache.acquire(lit);
    for (let frame = 0; frame < 3; frame += 1) {
      cache.beginFrame?.();
      for (let draw = 0; draw < 2000; draw += 1) expect(cache.acquire(lit)).toBe(first);
    }
    expect(first.status).toBe("ready");
    expect(create).toHaveBeenCalledTimes(1);
    expect(cache.stats().compiled).toBe(1);
    cache.dispose();
  });
});

function staticClosure(bundle: Rollup.OutputBundle, entry: Rollup.OutputChunk): Rollup.OutputChunk[] {
  const seen = new Map<string, Rollup.OutputChunk>();
  const visit = (chunk: Rollup.OutputChunk): void => {
    if (seen.has(chunk.fileName)) return;
    seen.set(chunk.fileName, chunk);
    for (const name of chunk.imports) {
      const next = bundle[name];
      if (next && next.type === "chunk") visit(next);
    }
  };
  visit(entry);
  return [...seen.values()];
}

describe("01-HANG: the real C-02 cache is in the lane harness's static graph", () => {
  it("the production harness build (code-split) reaches ProgramCache from the entry chunk without import()", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "qr-01hang-"));
    try {
      // The real lane harness build (tests/qr/prd01/harness/vite.config.ts):
      // its dynamic tool imports and prd06's `import("@aura3d/rendering")`
      // are what code-split the rendering lanes out of the entry graph.
      const output = (await build({
        configFile: resolve(repoRoot, "tests/qr/prd01/harness/vite.config.ts"),
        logLevel: "silent",
        build: { write: false, outDir, emptyOutDir: false }
      })) as Rollup.RollupOutput | Rollup.RollupOutput[];
      const bundle = Object.fromEntries((Array.isArray(output) ? output[0]! : output).output.map((o) => [o.fileName, o])) as Rollup.OutputBundle;
      const entry = Object.values(bundle).find((o): o is Rollup.OutputChunk => o.type === "chunk" && o.isEntry)!;
      expect(entry).toBeTruthy();
      const closure = staticClosure(bundle, entry);
      // `program-compile-failed` is the real ProgramCache's C-36 code (the stub has none).
      const holders = Object.values(bundle).filter((o): o is Rollup.OutputChunk => o.type === "chunk" && o.code.includes('"program-compile-failed"'));
      expect(holders.length).toBeGreaterThan(0);
      expect(holders.filter((chunk) => closure.includes(chunk)).map((c) => c.fileName), `real ProgramCache only in lazy chunks: ${holders.map((c) => c.fileName).join(", ")}`).not.toEqual([]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 600_000);
});
