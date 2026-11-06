import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { waterMaterial, waterParams } from "../../../examples/silt-and-signal-port/world";
import { buildWaterGraph } from "../../../examples/silt-and-signal-port/water-graph";

describe("silt-and-signal-port portable water graph (5.0.3 A4)", () => {
  for (const look of ["original", "inked"] as const) {
    it(`${look} water compiles to paired GLSL + WGSL and keeps the GLSL render state`, () => {
      const spec = waterMaterial(1, look, "graph");
      expect(spec.kind).toBe("custom");
      const custom = (spec as { custom: any }).custom;
      expect(custom.glsl.fragment).toContain("outColor");
      expect(custom.wgsl.fragment.length).toBeGreaterThan(100);
      expect(custom.transparent).toBe(true);
      expect(custom.depthWrite).toBe(false);
      expect(custom.side).toBe("double");
      const runtime = createCustomShaderMaterial(custom, `silt-water-${look}`);
      try {
        // the game's per-frame uniform write keeps working through the alias
        expect(Object.keys(custom.uniformAliases)).toContain("siltTime");
        expect(runtime.sources.glsl.fragment).toContain("siltTime");
      } finally { runtime.dispose(); }
    });
  }
  const available = spawnSync("glslangValidator", ["--version"]).status === 0;
  for (const look of ["original", "inked"] as const) {
    it.skipIf(!available)(`${look} graph GLSL links under glslangValidator`, () => {
      const runtime = createCustomShaderMaterial((waterMaterial(1, look, "graph") as any).custom, `silt-water-glslang-${look}`);
      const dir = mkdtempSync(join(tmpdir(), "silt-water-"));
      try {
        writeFileSync(join(dir, "p.vert"), runtime.sources.glsl.vertex);
        writeFileSync(join(dir, "p.frag"), runtime.sources.glsl.fragment);
        const result = spawnSync("glslangValidator", [join(dir, "p.vert"), join(dir, "p.frag")], { encoding: "utf8" });
        expect(`${result.stdout}${result.stderr}`, "glslang output").not.toMatch(/ERROR/);
        expect(result.status).toBe(0);
      } finally { rmSync(dir, { recursive: true, force: true }); runtime.dispose(); }
    });
  }
  it("graph and GLSL read the same chapter data", () => {
    const p = waterParams(0, "inked");
    expect(p.canalHalf).toBe(25);
    expect(p.canalShift).toBe(0);
    expect(buildWaterGraph(p).resources!.length).toBe(10);
  });
});
