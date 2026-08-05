import { copyFileSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error -- .mjs tool module without a declaration file
import { validateRouteReviewRecord } from "../../../tools/showcase-library/showcase-manual-review-gate.mjs";
// @ts-expect-error -- .mjs tool module without a declaration file
import { readPngPerceptualSignature } from "../../../tools/showcase-library/png-foreground.mjs";

/**
 * The visual-review gate must be *strict* without being *unsatisfiable*.
 *
 * Binding approval only to `sha256` of a screenshot made it the latter. GPU rasterisation is not
 * bit-reproducible, so re-rendering an identically settled frame still changed 55 of 3,888,000
 * colour channels (0.0014%, max delta 27/255) — roughly 18 pixels of a 1.3 MP image, visually
 * identical. Every regeneration therefore invalidated a still-correct signature, the only way to keep
 * the gate green was to never re-run the screenshot spec, and it went red before 1.5.2 and stayed
 * there while the release shipped anyway.
 *
 * These tests pin the resulting contract from both directions: approval survives a re-render of the
 * same frame, and does not survive a frame that actually changed.
 */
const SHOT = "tests/reports/showcase-library-screenshots/showcase-product-configurator-desktop.png";
const OTHER = "tests/reports/showcase-library-screenshots/showcase-smart-city-control-desktop.png";
const BACKUP = "tests/reports/showcase-library-screenshots/.perceptual-binding-backup.png";

function sha256(path: string): string {
  return `sha256-${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

/** A synthetic approved record. Never a real reviewer, so no approval is fabricated. */
function approvedRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "showcase-product-configurator",
    reviewedAt: new Date(Date.now() - 60_000).toISOString(),
    sourceCommit: "0".repeat(40),
    sourceHash: "sha256-source",
    routeHealthHash: "sha256-health",
    verdict: "pass",
    approvalScope: "public-release",
    blockingIssues: [],
    notes: "synthetic record for gate-contract tests",
    screenshots: [{
      kind: "desktop",
      path: SHOT,
      viewport: { width: 1440, height: 900 },
      sha256: sha256(SHOT),
      perceptualSignature: readPngPerceptualSignature(SHOT).signature as string
    }],
    ...overrides
  };
}

/** Only the screenshot-binding failures; the synthetic record deliberately fails other checks. */
function screenshotFailures(entry: ReturnType<typeof approvedRecord>): string[] {
  const result = validateRouteReviewRecord({ id: entry.id }, entry, { root: process.cwd() }) as {
    failures: string[];
  };
  return result.failures.filter((failure) => /screenshot-hash|stale-screenshot/.test(failure));
}

describe("visual review binds approval perceptually, not byte-exactly", () => {
  afterAll(() => {
    try { copyFileSync(BACKUP, SHOT); } catch { /* nothing to restore */ }
  });

  it("holds approval when the artifact is untouched", () => {
    /*
     * `reviewedAt` is derived from the artifact's own mtime rather than "a minute ago", so this
     * assertion does not depend on when the screenshot happened to be regenerated. Pinning it to
     * wall-clock time made the test order-dependent: an earlier case here deliberately touches the
     * file, and a stale-mtime failure would then look like a binding defect rather than test setup.
     */
    const record = approvedRecord({
      reviewedAt: new Date(statSync(SHOT).mtimeMs + 1000).toISOString()
    });
    expect(screenshotFailures(record)).toEqual([]);
  });

  it("holds approval when the bytes and mtime change but the pixels do not", () => {
    /*
     * The case that made the gate unsatisfiable. Rewriting the file with identical content produces
     * a new mtime, and a real re-render would also produce slightly different bytes — neither means
     * the reviewer's judgement has been invalidated.
     */
    copyFileSync(SHOT, BACKUP);
    const bytes = readFileSync(SHOT);
    writeFileSync(SHOT, bytes);
    utimesSync(SHOT, new Date(), new Date());
    const rerendered = approvedRecord();
    rerendered.screenshots[0]!.sha256 = "sha256-bytes-differ-after-rerender";
    expect(screenshotFailures(rerendered)).toEqual([]);
  });

  it("rejects approval when the frame genuinely changed", () => {
    // A different route's frame stands in for "something moved, recoloured or disappeared".
    const changed = approvedRecord();
    changed.screenshots[0]!.sha256 = "sha256-bytes-differ";
    changed.screenshots[0]!.perceptualSignature = readPngPerceptualSignature(OTHER).signature as string;
    expect(screenshotFailures(changed).length).toBeGreaterThan(0);
  });

  it("stays conservative for a review recorded before signatures existed", () => {
    // No signature to fall back on, so a hash mismatch must still fail rather than silently pass.
    const legacy = approvedRecord();
    legacy.screenshots = [{
      kind: "desktop",
      path: SHOT,
      viewport: { width: 1440, height: 900 },
      sha256: "sha256-stale-from-an-older-review"
    } as never];
    expect(screenshotFailures(legacy).length).toBeGreaterThan(0);
  });

  it("a perceptual signature is stable for one file and distinct across files", () => {
    const a = readPngPerceptualSignature(SHOT).signature as string;
    const again = readPngPerceptualSignature(SHOT).signature as string;
    const other = readPngPerceptualSignature(OTHER).signature as string;
    expect(a).toBe(again);
    expect(a).not.toBe(other);
    expect(a).toMatch(/^perceptual-8x8-5bit-[0-9a-f]{64}$/);
  });
});
