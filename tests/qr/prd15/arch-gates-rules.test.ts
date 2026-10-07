// PRD-15 T3.9/T3.14 — arch-gates rules fixture tests: one known-bad and one
// clean fixture per rule (§13 exit: "arch-gates: one known-bad fixture per
// rule that must fail, and one clean fixture that must pass"), plus the live
// T3.9 assertion that agent-api/index.ts is ≤300 lines excluding the pending
// Q-01-5 range listed by line in the gate config.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkLayering } from "../../../tools/arch-gates/rules/layering";
import { checkNoCycles } from "../../../tools/arch-gates/rules/noCycles";
import { checkMaxFileLines } from "../../../tools/arch-gates/rules/maxFileLines";
import { checkSingleRenderer } from "../../../tools/arch-gates/rules/singleRenderer";
import { checkGlslLocation } from "../../../tools/arch-gates/rules/glslLocation";

const REPO = join(__dirname, "../../..");
const tmp: string[] = [];

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "archgate-"));
  tmp.push(root);
  const dir = join(root, "packages/engine/src/agent-api");
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}

afterAll(() => {
  for (const d of tmp) rmSync(d, { recursive: true, force: true });
});

const AA = "packages/engine/src/agent-api";

describe("arch-gates layering", () => {
  it("fails a nodes/ file that value-imports compiler/", () => {
    const root = fixture({
      [`${AA}/nodes/x.ts`]: `import { y } from "../compiler/y.js";\nexport const useY = () => y;\n`,
      [`${AA}/compiler/y.ts`]: `export const y = 1;\n`
    });
    const findings = checkLayering(root).filter((f) => f.enforced);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].file).toBe(`${AA}/nodes/x.ts`);
  });

  it("passes type-only edges and app→nodes value imports", () => {
    const root = fixture({
      [`${AA}/nodes/x.ts`]: `import type { T } from "../compiler/y.js";\nexport const useT = (t: T): T => t;\n`,
      [`${AA}/compiler/y.ts`]: `export type T = number;\n`,
      [`${AA}/app/z.ts`]: `import { w } from "../nodes/w.js";\nexport const useW = () => w;\n`,
      [`${AA}/nodes/w.ts`]: `export const w = 1;\n`
    });
    expect(checkLayering(root).filter((f) => f.enforced)).toEqual([]);
  });

  it("fails any devtools import except through public/devtools.ts", () => {
    const root = fixture({
      [`${AA}/app/x.ts`]: `import { d } from "../devtools/d.js";\nexport const useD = () => d;\n`,
      [`${AA}/devtools/d.ts`]: `export const d = 1;\n`,
      [`${AA}/public/devtools.ts`]: `export { d } from "../devtools/d.js";\n`
    });
    const findings = checkLayering(root).filter((f) => f.enforced);
    expect(findings.length).toBe(1);
    expect(findings[0].file).toBe(`${AA}/app/x.ts`);
  });
});

describe("arch-gates no-cycles", () => {
  it("fails an a↔b value-import cycle", () => {
    const root = fixture({
      [`${AA}/a.ts`]: `import { b } from "./b.js";\nexport const a = () => b;\n`,
      [`${AA}/b.ts`]: `import { a } from "./a.js";\nexport const b = () => a;\n`
    });
    const findings = checkNoCycles(root).filter((f) => f.enforced);
    expect(findings.length).toBe(1);
    expect(findings[0].detail).toContain("SCC size 2");
  });

  it("passes an acyclic graph and type-only cycles", () => {
    const root = fixture({
      [`${AA}/a.ts`]: `import type { TB } from "./b.js";\nexport const a = 1;\n`,
      [`${AA}/b.ts`]: `import type { TA } from "./a.js";\nexport type TB = number;\nexport type TA = string;\n`
    });
    expect(checkNoCycles(root).filter((f) => f.enforced)).toEqual([]);
  });
});

describe("arch-gates max-file-lines", () => {
  it("fails a 15-owned agent-api file over 2,500 lines", () => {
    const big = Array.from({ length: 2600 }, (_, i) => `// line ${i}`).join("\n");
    const root = fixture({ [`${AA}/big.ts`]: big });
    const findings = checkMaxFileLines(root).filter((f) => f.enforced);
    expect(findings.length).toBe(1);
    expect(findings[0].file).toBe(`${AA}/big.ts`);
  });

  it("passes a small file", () => {
    const root = fixture({ [`${AA}/small.ts`]: `export const s = 1;\n` });
    expect(checkMaxFileLines(root).filter((f) => f.enforced)).toEqual([]);
  });
});

describe("arch-gates single-renderer (T4.9 fail mode)", () => {
  it("fails a file calling canvas.getContext(\"webgl2\") outside the allowlist", () => {
    const root = fixture({
      "packages/engine/src/agent-api/harness.ts": `export const boot = (c: HTMLCanvasElement) => c.getContext("webgl2");\n`
    });
    const findings = checkSingleRenderer(root).filter((f) => f.enforced);
    expect(findings.length).toBe(1);
    expect(findings[0].file).toBe("packages/engine/src/agent-api/harness.ts");
    expect(findings[0].detail).toContain('getContext("webgl2")');
  });

  it("fails a file constructing a WebGPUDevice outside the device owners", () => {
    const root = fixture({
      "packages/rendering/src/effects/rogue.ts": `export const make = () => new WebGPUDevice();\n`
    });
    const findings = checkSingleRenderer(root).filter((f) => f.enforced);
    expect(findings.length).toBe(1);
    expect(findings[0].file).toBe("packages/rendering/src/effects/rogue.ts");
  });

  it("passes the device owner files themselves and clean files", () => {
    const root = fixture({
      "packages/rendering/src/WebGL2Device.ts": `const gl = canvas.getContext("webgl2");\nexport const make = () => new WebGL2Device();\n`,
      "packages/engine/src/agent-api/plain.ts": `export const p = 1;\n`
    });
    expect(checkSingleRenderer(root).filter((f) => f.enforced)).toEqual([]);
  });

  it("passes an allowlisted file while the entry is unexpired", () => {
    const root = fixture({
      "packages/engine/src/agent-api/compiler/webglRuntime.ts": `const gl = c.getContext("webgl2");\n`,
      "tools/arch-gates/allowlist.json": JSON.stringify([{
        rule: "single-renderer",
        file: "packages/engine/src/agent-api/compiler/webglRuntime.ts",
        expires: "2999-01-01",
        reason: "fixture"
      }])
    });
    expect(checkSingleRenderer(root).filter((f) => f.enforced)).toEqual([]);
  });
});

describe("arch-gates glsl-location (T4.9 fail mode)", () => {
  const glsl = "const v = `#version 300 es\nprecision highp float;\n`;\n";

  it("fails a GLSL template string outside the chunk/post/output dirs", () => {
    const root = fixture({
      "packages/engine/src/agent-api/app/inline.ts": `export ${glsl}`
    });
    const findings = checkGlslLocation(root).filter((f) => f.enforced);
    expect(findings.length).toBe(1);
    expect(findings[0].file).toBe("packages/engine/src/agent-api/app/inline.ts");
  });

  it("passes GLSL under program/chunks/ and shaders/", () => {
    const root = fixture({
      "packages/rendering/src/program/chunks/chunk.ts": `export ${glsl}`,
      "packages/rendering/src/shaders/deform/deform.ts": `export ${glsl}`,
      "packages/rendering/src/post/pass.ts": `export ${glsl}`
    });
    expect(checkGlslLocation(root).filter((f) => f.enforced)).toEqual([]);
  });
});

describe("T3.9 live assertion", () => {
  it("agent-api/index.ts is ≤300 lines excluding the pending Q-01-5 range", () => {
    // The gate config records the exclusion by line (lines 28–162 = the
    // pending scenegraph declarations); effective length must be ≤ 300.
    const src = require("node:fs").readFileSync(
      join(REPO, "packages/engine/src/agent-api/index.ts"), "utf8").split("\n").length;
    const effective = src - (162 - 28 + 1);
    expect(effective).toBeLessThanOrEqual(300);
  });

  it("the real repo has zero enforced arch-gate findings", { timeout: 120_000 }, async () => {
    const { runGates } = await import("../../../tools/arch-gates/index");
    const report = runGates(REPO);
    const enforced = Object.values(report.rules)
      .flatMap((r) => r.findings)
      .filter((f) => f.enforced);
    expect(enforced).toEqual([]);
  });
});
