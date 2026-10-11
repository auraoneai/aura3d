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

describe("PRD-04 04-S5 per-device golden manifest (fixtures/bsdf/r185-goldens.json)", () => {
  const manifest = JSON.parse(readFileSync("tests/qr/prd04/fixtures/bsdf/r185-goldens.json", "utf8")) as {
    goldens: { id: string; rendererMatch: string; file: string; renderer: string; runId: number | null }[];
  };

  it("ids are unique and every entry matches its own recorded renderer string", () => {
    expect(new Set(manifest.goldens.map((g) => g.id)).size).toBe(manifest.goldens.length);
    for (const g of manifest.goldens) {
      expect(new RegExp(g.rendererMatch).test(g.renderer), `${g.id} matches ${g.renderer}`).toBe(true);
      // No entry may also claim another entry's device (first-match must be unambiguous).
      for (const other of manifest.goldens) {
        if (other.id !== g.id) expect(new RegExp(g.rendererMatch).test(other.renderer), `${g.id} vs ${other.renderer}`).toBe(false);
      }
    }
    expect(manifest.goldens.some((g) => /swiftshader/i.test(g.renderer))).toBe(false);
  });

  for (const g of manifest.goldens) {
    it(`${g.id}: ${g.file} has the 20-case fixture schema`, () => {
      const golden = JSON.parse(readFileSync(`tests/qr/prd04/fixtures/bsdf/${g.file}`, "utf8")) as {
        meta: { renderer: string };
        cases: (FixtureCase & { values: (number | null)[] })[];
      };
      expect(golden.meta.renderer).toBe(g.renderer);
      expect(golden.cases.map((c) => c.fn)).toEqual(fixture.cases.map((c) => c.fn));
      for (const c of golden.cases) {
        const ref = fixture.cases.find((x) => x.fn === c.fn)!;
        expect(c.argorder).toEqual(ref.argorder);
        const total = c.argorder.reduce((acc, k) => acc * c.axes[k]!.length, 1);
        expect(c.values, `${c.fn} values`).toHaveLength(total * c.out);
      }
      if (g.file !== "r185-golden.json") expect(g.runId, `${g.id} cites the remote run that generated it`).toBeGreaterThan(0);
    });
  }
});
