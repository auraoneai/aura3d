/**
 * r185-golden-glsl.test.ts — PRD-04 P1-3 (04-P1-3) unit half: the browser
 * golden generator's case table and GLSL assembly match the committed
 * python/llvmpipe fixture's schema (same fn order, argorder, axes, fixed
 * args, component count), and every case's r185 functions are extracted from
 * `THREE.ShaderChunk` without error. The numeric regeneration itself runs in
 * `browser/generate-r185-golden.spec.ts` on macos-14.
 */
import { readFileSync } from "node:fs";
import { ShaderChunk } from "three";
import { describe, expect, it } from "vitest";
import { R185_GOLDEN_CASES } from "../browser/r185-golden-cases";
import { caseFragment, chunkSources, linspace } from "../browser/r185-golden-glsl";

interface FixtureCase {
  fn: string;
  out: number;
  argorder: string[];
  axes: Record<string, number[]>;
  fixed: Record<string, number | number[]>;
}

const fixture = JSON.parse(readFileSync("tests/qr/prd04/fixtures/bsdf/r185-golden.json", "utf8")) as { cases: FixtureCase[] };
const sources = chunkSources(ShaderChunk as unknown as Record<string, string>);

describe("PRD-04 P1-3 r185 golden generator GLSL", () => {
  it("lists the fixture's 20 cases in the same order", () => {
    expect(R185_GOLDEN_CASES.map((c) => c.fn)).toEqual(fixture.cases.map((c) => c.fn));
  });

  for (const c of R185_GOLDEN_CASES) {
    it(`${c.fn}: schema matches the committed golden and the fragment assembles`, () => {
      const golden = fixture.cases.find((x) => x.fn === c.fn)!;
      expect(c.out).toBe(golden.out);
      expect(c.argorder).toEqual(golden.argorder);
      expect(c.fixed).toEqual(golden.fixed);
      for (const name of c.argorder) {
        const axis = linspace(c.axes[name]!);
        expect(axis.length, `${name} length`).toBe(golden.axes[name]!.length);
        axis.forEach((v, i) => expect(v, `${name}[${i}]`).toBeCloseTo(golden.axes[name]![i]!, 12));
      }
      const total = c.argorder.reduce((acc, k) => acc * c.axes[k]![2], 1);
      expect(total).toBeLessThanOrEqual(4096);
      const src = caseFragment(c, sources, Math.min(1024, total));
      expect(src.startsWith("#version 300 es")).toBe(true);
      expect(src).toContain("layout(location=0) out vec4 o;");
      for (const fn of [...(c.needs.phys ?? []), ...(c.needs.transmission ?? []), ...(c.needs.irid ?? [])]) {
        expect(src, `${fn} definition extracted`).toMatch(new RegExp(`\\b${fn}\\s*\\([^;{]*\\)\\s*\\{`));
      }
      if (c.textures?.includes("dfg")) expect(src).toContain("uniform sampler2D dfgLUT;");
    });
  }
});
