/**
 * F-7: evidence-only feel lint — source scan fixtures + runtime rule.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanFeelSource } from "../../../../packages/engine/src/agent-api/feel/lint/feelSourceScan.js";
import { runEvidenceOnlyFeelCheck } from "../../../../packages/engine/src/agent-api/feel/lint/evidenceOnlyFeel.js";

const FIXTURES = "../../../../tools/camera-cast-codemod/fixtures/feel-lint";
const read = (name: string) => readFileSync(join(import.meta.dirname!, FIXTURES, name), "utf8");

describe("F-7a scanFeelSource", () => {
  it("flags the void-cameraState pattern", () => {
    const rows = scanFeelSource(read("dirty-void-camera-state.ts"));
    expect(rows.some((r) => r.severity === "error" && r.message.includes("void"))).toBe(true);
  });
  it("flags follow() feeding only publishEvidence", () => {
    const rows = scanFeelSource(read("dirty-evidence-follow.ts"));
    expect(rows.some((r) => r.severity === "error" && r.message.includes("follow"))).toBe(true);
  });
  it("flags director output reaching the HUD only", () => {
    const rows = scanFeelSource(read("dirty-hud-director.ts"));
    expect(rows.some((r) => r.severity === "error")).toBe(true);
  });
  it("is clean on spec-conformant usage", () => {
    expect(scanFeelSource(read("clean-real-feel.ts"))).toHaveLength(0);
  });
});

describe("F-7b look/evidence-only-feel runtime rule", () => {
  it("errors when emitted > 0 and every channel executed 0 for 300+ frames", () => {
    const findings = runEvidenceOnlyFeelCheck({ emitted: 4, executed: { shake: 0, audio: 0 }, frames: 301 });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("look/evidence-only-feel");
    expect(findings[0]!.severity).toBe("error");
  });
  it("silent before 300 frames and when any channel executed", () => {
    expect(runEvidenceOnlyFeelCheck({ emitted: 4, executed: {}, frames: 299 })).toHaveLength(0);
    expect(runEvidenceOnlyFeelCheck({ emitted: 4, executed: { shake: 2 }, frames: 500 })).toHaveLength(0);
    expect(runEvidenceOnlyFeelCheck({ emitted: 0, executed: {}, frames: 500 })).toHaveLength(0);
  });
});
