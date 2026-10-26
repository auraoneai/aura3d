import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARTICLE_MAX_SCREEN } from "../../../packages/rendering/src/vfx/ParticleBatchPass";

const read = (path: string): string => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

// CPU mirror of the attenuated-point vertex math in packages/engine/src/agent-api/compiler/lines.ts.
function attenuatedPointPx(size: number, renderHeightPx: number, clipW: number): number {
  const raw = (size * (0.5 * renderHeightPx)) / Math.max(clipW, 1e-3);
  return Math.min(raw, 0.12 * renderHeightPx);
}

describe("point and particle on-screen size clamp (real GPUs allow huge point sizes)", () => {
  it("never produces a point larger than 12% of the render height, near or far, at DPR 1 and 2", () => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (const height of [720, 900, 1800, 2880]) {
      for (let i = 0; i < 2000; i += 1) {
        const size = 10 ** (rnd() * 6 - 3);
        const w = 10 ** (rnd() * 5 - 3);
        expect(attenuatedPointPx(size, height, w)).toBeLessThanOrEqual(0.12 * height + 1e-6);
      }
    }
  });

  it("the shader source carries the same cap and the near cull, so the CPU mirror cannot drift", () => {
    const lines = read("packages/engine/src/agent-api/compiler/lines.ts");
    expect(lines).toContain("gl_PointSize = min(a3dPointPx, 0.12 * u_resolutionFarTime.y);");
    expect(lines).toContain("if (gl_Position.w < 0.05) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);");
    for (const path of ["packages/rendering/src/shaders/unlit.vert.glsl", "packages/rendering/src/ShaderLibraryCore.ts"]) {
      expect(read(path)).toContain("min(max(u_pointSize, 1.0), 256.0)");
    }
    expect(read("packages/rendering/src/program/ProgramGenerator.ts")).toContain("gl_PointSize = min(u_pointSize, 256.0);");
  });

  it("billboard particles are capped by default and a particle at or behind the camera is dropped", () => {
    expect(DEFAULT_PARTICLE_MAX_SCREEN).toBeGreaterThan(0);
    expect(DEFAULT_PARTICLE_MAX_SCREEN).toBeLessThanOrEqual(0.12);
    expect(read("packages/rendering/src/vfx/ParticleBatchPass.ts")).toContain("batch.desc.maxScreen ?? DEFAULT_PARTICLE_MAX_SCREEN");
    const vertex = read("packages/rendering/src/vfx/shaders/particle.glsl.ts");
    expect(vertex).toContain("if (clipC.w < 0.02) {");
    expect(vertex).toContain("if (halfNdc > u_maxScreen) off *= u_maxScreen / halfNdc;");
  });
});
