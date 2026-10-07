import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T0.12 — head-to-head workload aggregates emit `GateVerdict` values
 * (C-32: pass | regression | reference-gap | admitted-loss |
 * calibration-broken | non-discriminating | mask-misaligned |
 * forbidden-capture-flag | blocked-runner | capture-failed), not prose
 * verdicts, and no `observedLosses: [ ... ]` string-literal claim lists.
 */

const GATE_VERDICTS = new Set([
  "pass",
  "regression",
  "reference-gap",
  "admitted-loss",
  "calibration-broken",
  "non-discriminating",
  "mask-misaligned",
  "forbidden-capture-flag",
  "blocked-runner",
  "capture-failed",
]);

const toolsDir = resolve(__dirname, "../../../tools");
const headToHeadFiles = readdirSync(toolsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("head-to-head-"))
  .map((entry) => resolve(toolsDir, entry.name, "index.ts"));

describe("head-to-head verdict literals (C-32)", () => {
  it("no aggregator-only head-to-head tool remains outside quarantine", () => {
    // T4.9 moved aggregator-only families to tools/_quarantine; what remains is
    // runner/pixel-tool/library code that must still emit GateVerdict literals.
    const quarantined = readdirSync(resolve(toolsDir, "_quarantine"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("head-to-head-"));
    expect(headToHeadFiles.length).toBeGreaterThanOrEqual(1);
    expect(quarantined.length).toBeGreaterThanOrEqual(headToHeadFiles.length);
  });

  it("no file emits an observedLosses string list", () => {
    const offenders: string[] = [];
    for (const file of headToHeadFiles) {
      const source = readFileSync(file, "utf8");
      if (/observedLosses:\s*\[/.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("every verdict string literal is a GateVerdict value", () => {
    const offenders: string[] = [];
    for (const file of headToHeadFiles) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/verdict:\s*(?:"([^"]*)"|'([^']*)')/g)) {
        const value = match[1] ?? match[2] ?? "";
        if (!GATE_VERDICTS.has(value)) offenders.push(`${file}: verdict "${value.slice(0, 80)}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
