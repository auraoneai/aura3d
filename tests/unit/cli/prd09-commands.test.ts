import { describe, expect, it } from "vitest";
import { buildPerfReport } from "../../../packages/aura3d-cli/src/commands/prd09/perf-report.js";
import { captureBranchesCodemod } from "../../../packages/aura3d-cli/src/commands/prd09/codemods/capture-branches.js";
import { audioWrapperCodemod } from "../../../packages/aura3d-cli/src/commands/prd09/codemods/audio-wrapper.js";
import { evidenceGlobalsCodemod } from "../../../packages/aura3d-cli/src/commands/prd09/codemods/evidence-globals.js";
import { perfScriptCodemod } from "../../../packages/aura3d-cli/src/commands/prd09/codemods/perf-script.js";

describe("aura3d perf-report (PRD-09)", () => {
  it("computes frame stats from rAF interval telemetry", () => {
    const report = buildPerfReport("fixture-route", {
      route: "fixture-route",
      perf: { frameIntervals: [16.6, 16.7, 16.6, 17.1, 16.5, 33.4, 16.6, 16.8, 16.6, 16.6] }
    });
    expect(report.perf.samples).toBe(10);
    expect(report.perf.p50Ms).toBeGreaterThan(16);
    expect(report.perf.jankFrames).toBe(1); // the 33.4 ms spike
    expect(report.perf.estFps).toBeGreaterThan(55);
    expect(report.producer).toBe("aura3d perf-report");
  });
  it("accepts a bare samples array", () => {
    const report = buildPerfReport("r", { perf: { samples: [16.6, 16.6, 16.6] } });
    expect(report.perf.samples).toBe(3);
    expect(report.perf.budget.pass).toBe(true);
  });
});

describe("codemod prd09-capture-branches", () => {
  it("keeps the production arm of a capture ternary", () => {
    const src = `const fov = review ? 45 : 60;\nconst ok = 1;`;
    const { code, rows } = captureBranchesCodemod.transform(src, "main.ts");
    expect(code).toContain("const fov = 60");
    expect(rows[0].mapping).toBe("approximate");
  });
  it("flags if-branches it cannot resolve", () => {
    const src = `if (searchParams.get("capture") === "review") { activateReviewPavilion(); }`;
    const { rows } = captureBranchesCodemod.transform(src, "main.ts");
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("codemod prd09-evidence-globals", () => {
  it("rewrites window.__FOO__ = x onto legacyGlobals", () => {
    const { code, rows } = evidenceGlobalsCodemod.transform(`window.__AURA3D_PROBE__ = snap();\nok();`, "main.ts");
    expect(code).toContain('game.evidence.legacyGlobals.set("__AURA3D_PROBE__", snap());');
    expect(rows[0].mapping).toBe("exact");
  });
  it("leaves __doubleUnderscore reads alone", () => {
    const { code } = evidenceGlobalsCodemod.transform(`const v = window.__AURA3D_PROBE__;`, "main.ts");
    expect(code).toContain("window.__AURA3D_PROBE__");
  });
});

describe("codemod prd09-audio-wrapper", () => {
  it("rewrites new Audio and AudioContext", () => {
    const { code, rows } = audioWrapperCodemod.transform(`const a = new Audio(url);\nconst c = new AudioContext();`, "sound.ts");
    expect(code).toContain("game.audio.element(");
    expect(code).toContain("game.audio.context(");
    expect(rows.every((r) => r.mapping === "approximate")).toBe(true);
  });
});

describe("codemod prd09-perf-script", () => {
  it("removes evidence:performance script lines", () => {
    const src = `{\n  "scripts": {\n    "dev": "vite",\n    "evidence:performance": "tsx scripts/write-performance-report.ts",\n    "build": "tsc"\n  }\n}`;
    const { code, rows } = perfScriptCodemod.transform(src, "package.json");
    expect(code).not.toContain("evidence:performance");
    expect(JSON.parse(code)).toBeTruthy();
    expect(rows[0].mapping).toBe("exact");
  });
});
