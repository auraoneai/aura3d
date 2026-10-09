/**
 * 05-S5 — the optimize pipeline must be deterministic: the same source
 * optimized twice produces byte-identical output (derived URLs embed the
 * hash, so drift would churn every consumer). Runs in `asset-optimize.yml`
 * after `npm install --prefix tools/asset-optimize` so `hasDeps` is true.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const toolDir = join(repoRoot, "tools", "asset-optimize");
const hasDeps = existsSync(join(toolDir, "node_modules", "@gltf-transform", "core"));
const source = readFileSync(join(repoRoot, "fixtures", "asset-corpus", "damaged-helmet.glb"));

describe.runIf(hasDeps)("asset-optimize determinism", () => {
  it("optimizes damaged-helmet twice to identical sha256", async () => {
    const { optimizeGLB } = await import("../../../tools/asset-optimize/pipeline.js");
    const { ASSET_OPTIMIZE_PROFILES } = await import("../../../tools/asset-optimize/profiles.js");
    const profile = ASSET_OPTIMIZE_PROFILES["prop-large"];
    const opts = { profile, geometry: "none" as const, mobileCap: 0, log: () => undefined };
    const a = await optimizeGLB(source, opts);
    const b = await optimizeGLB(source, opts);
    const ha = createHash("sha256").update(a.glb).digest("hex");
    const hb = createHash("sha256").update(b.glb).digest("hex");
    expect(ha).toBe(hb);
    expect(a.steps.map((s) => s.step)).toEqual(b.steps.map((s) => s.step));
    expect(a.extensionsUsed).toEqual(b.extensionsUsed);
  });
});
