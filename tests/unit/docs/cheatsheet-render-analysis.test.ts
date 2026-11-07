import { describe, expect, it } from "vitest";
// @ts-ignore plain ESM module without types (tests/unit/agent-eval/modules.d.ts declares *.mjs in the check program)
import { analyzeFrames, extractBlocks, frameDifference, frameStats, verifyReport } from "../../../tools/docs/cheatsheet-lib.mjs";

interface Frame { width: number; height: number; data: Uint8Array }
const solid = (r: number, g: number, b: number, w = 8, h = 8): Frame => {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i += 1) data.set([r, g, b, 255], i * 4);
  return { width: w, height: h, data };
};
// Left half colour A, right half colour B: a non-flat frame.
const split = (a: [number, number, number], b: [number, number, number], w = 8, h = 8): Frame => {
  const f = solid(0, 0, 0, w, h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) f.data.set([...(x < w / 2 ? a : b), 255], (y * w + x) * 4);
  return f;
};

describe("cheat sheet frame analysis", () => {
  it("flags an all-black frame", () => {
    const verdict = analyzeFrames(solid(0, 0, 0), solid(0, 0, 0), { animated: false });
    expect(verdict.pass).toBe(false);
    expect(verdict.failures.join(" ")).toMatch(/black/);
  });

  it("flags a flat single-colour frame even when bright", () => {
    const verdict = analyzeFrames(solid(200, 200, 200), solid(200, 200, 200), { animated: false });
    expect(verdict.pass).toBe(false);
    expect(verdict.failures.join(" ")).toMatch(/flat colour/);
  });

  it("passes a static, lit, varied frame pair", () => {
    const f = split([30, 60, 120], [220, 200, 160]);
    expect(analyzeFrames(f, f, { animated: false }).pass).toBe(true);
  });

  it("fails an animated block whose frames are identical and passes one that changes", () => {
    const a = split([30, 60, 120], [220, 200, 160]);
    const b = split([40, 70, 130], [220, 200, 160]);
    expect(analyzeFrames(a, a, { animated: true }).pass).toBe(false);
    const moved = analyzeFrames(a, b, { animated: true });
    expect(moved.pass).toBe(true);
    expect(moved.difference).toBeGreaterThan(0.2);
  });

  it("measures mean absolute RGB difference on a 0 to 255 scale", () => {
    expect(frameDifference(solid(0, 0, 0), solid(30, 30, 30))).toBeCloseTo(30, 6);
    expect(frameStats(solid(255, 255, 255)).litFraction).toBe(1);
  });

  it("rejects frames of different sizes", () => {
    expect(() => frameDifference(solid(0, 0, 0, 4, 4), solid(0, 0, 0, 8, 8))).toThrow(/size/);
  });
});

describe("cheat sheet block extraction and report gate", () => {
  const md = "### One\n```ts render=animated\nconst a = 1;\n```\n### Two\n```ts\nconst b = 2;\n```\n";
  it("reads render attributes, headings and line counts", () => {
    const blocks = extractBlocks(md);
    expect(blocks.map((b: { heading: string; animated: boolean; lines: number }) => [b.heading, b.animated, b.lines])).toEqual([["One", true, 1], ["Two", false, 1]]);
  });

  it("fails the gate for a block with no report, a failed render, or 25+ lines", () => {
    const blocks = extractBlocks(md);
    expect(verifyReport(blocks, { blocks: [] })).toHaveLength(2);
    const ok = blocks.map((b: { index: number; sha256: string }) => ({ index: b.index, sha256: b.sha256, typecheck: { pass: true }, render: { pass: true, failures: [] } }));
    expect(verifyReport(blocks, { blocks: ok })).toEqual([]);
    const bad = ok.map((e: object, i: number) => (i === 0 ? { ...e, render: { pass: false, failures: ["frame1 is black"] } } : e));
    expect(verifyReport(blocks, { blocks: bad }).join(" ")).toMatch(/failed the render check: frame1 is black/);
    const long = extractBlocks(`### Long\n\`\`\`ts\n${"x;\n".repeat(25)}\`\`\`\n`);
    expect(verifyReport(long, { blocks: [{ sha256: long[0].sha256, typecheck: { pass: true }, render: { pass: true } }] }).join(" ")).toMatch(/limit 24/);
  });

  it("invalidates a report entry when the block text changes", () => {
    const [block] = extractBlocks(md);
    const changed = extractBlocks(md.replace("const a = 1;", "const a = 2;"));
    const entry = { sha256: block.sha256, typecheck: { pass: true }, render: { pass: true } };
    expect(verifyReport(changed.slice(0, 1), { blocks: [entry] }).join(" ")).toMatch(/no render report/);
  });
});
