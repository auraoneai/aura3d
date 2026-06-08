import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * B2 — the render proof must show MOTION as a SKELETON (per-bone projection over time), not a raw
 * pixel-diff. This test drives the SAME `buildSkeletonStrip` render-live.ts saves per character (via
 * its standalone CLI, so no Playwright/GPU is needed) and asserts a REAL 3-frame (first/mid/final)
 * bone-projection PNG strip is produced and that the first and final frames DIFFER — i.e. the body
 * skeleton actually moved across the clip.
 */

const REPO_ROOT = resolve(__dirname, "../../..");
const CLI = resolve(
  REPO_ROOT,
  "packages/create-aura3d/templates/animation-studio/scripts/skeleton-overlay-cli.ts"
);

interface StripResult {
  ok: boolean;
  out: string;
  intent: string;
  width: number;
  height: number;
  panelJointCounts: number[];
  firstFinalMaxDiff: number;
  pngBytes: number;
}

const workDir = mkdtempSync(join(tmpdir(), "aura-skeleton-overlay-"));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

function runStrip(intent: string): { result: StripResult; png: Buffer } {
  const out = join(workDir, `${intent}.png`);
  const stdout = execFileSync("npx", ["tsx", CLI, "--intent", intent, "--out", out], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const line = stdout.trim().split("\n").pop() ?? "{}";
  const result = JSON.parse(line) as StripResult;
  expect(result.ok, `strip CLI failed: ${line}`).toBe(true);
  expect(existsSync(out), `strip PNG not written for ${intent}`).toBe(true);
  return { result, png: readFileSync(out) };
}

// PNG magic bytes.
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("B2 — per-character 3-frame skeleton-overlay strip", () => {
  it("produces a valid 3-panel PNG strip with projected joints in every panel (walk)", () => {
    const { result, png } = runStrip("walk");
    // Valid PNG.
    expect(png.subarray(0, 8).equals(PNG_SIG)).toBe(true);
    expect(result.pngBytes).toBeGreaterThan(100);
    // Three panels side by side (width is 3x the panel width).
    expect(result.width).toBe(result.height * 2); // 480x240 default => 3 * 160 panels
    expect(result.panelJointCounts).toHaveLength(3);
    // Every panel projected the full skeleton.
    for (const count of result.panelJointCounts) expect(count).toBeGreaterThanOrEqual(18);
  }, 60_000);

  it("first and final frames DIFFER — the skeleton visibly moved (not a static pose)", () => {
    const { result } = runStrip("walk");
    // firstFinalMaxDiff > 0 means at least one pixel of the stick figure changed between the first
    // and final panels — proof of body motion as a skeleton, independent of any pixel-diff heuristic.
    expect(result.firstFinalMaxDiff).toBeGreaterThan(0);
  }, 60_000);

  it("works across multiple standard intents (gesture, point, nod)", () => {
    for (const intent of ["gesture", "point", "nod"]) {
      const { result, png } = runStrip(intent);
      expect(png.subarray(0, 8).equals(PNG_SIG), `${intent} not a PNG`).toBe(true);
      expect(result.intent).toBe(intent);
      expect(result.firstFinalMaxDiff, `${intent} strip is static`).toBeGreaterThan(0);
    }
  }, 120_000);
});
