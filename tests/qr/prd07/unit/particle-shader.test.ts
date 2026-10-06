// PRD-07 P1-T9 acceptance — the particle program is a C-02 chunk and encodes
// output per §6.2.7 (HDR target vs legacy outputColorSpace).

import { describe, expect, it } from "vitest";
import { buildChunkHarnessProgram } from "../../../../packages/rendering/src/contracts/testing/ChunkHarness";
import {
  PARTICLE_CHUNKS,
  PARTICLE_SHADER_MARKER,
  particleFragmentSource,
  particleProgramKey,
  particleVertexSource,
  type ParticleProgramDefines
} from "../../../../packages/rendering/src/vfx/shaders/particle.glsl";

const base: ParticleProgramDefines = {
  stretch: false,
  frameBlend: false,
  softParticles: false,
  blendAdditive: false,
  blendAdditiveFallback: false,
  unpremultiplyOutput: false,
  proceduralSoftDot: false,
  fogAnalytic: false
};

describe("P1-T9 particle shader chunks", () => {
  it("every chunk wraps in the ChunkHarness", () => {
    const program = buildChunkHarnessProgram(PARTICLE_CHUNKS);
    for (const chunk of PARTICLE_CHUNKS) {
      const src = chunk.stage === "vertex" ? program.vertex : program.fragment;
      expect(src).toContain(chunk.glsl);
      expect(src).toContain("#version 300 es");
    }
    expect(program.vertex).toContain("main()");
    expect(program.fragment).toContain("main()");
  });

  it("chunks carry the marker and owner", () => {
    for (const chunk of PARTICLE_CHUNKS) {
      expect(chunk.owner).toBe("prd07");
      expect(chunk.name.startsWith("a3d_prd07_particle_")).toBe(true);
      expect(chunk.glsl).toContain(PARTICLE_SHADER_MARKER);
    }
  });

  it("program key is distinct per define bit", () => {
    const keys = new Set<string>();
    const bits: (keyof ParticleProgramDefines)[] = ["stretch", "frameBlend", "softParticles", "blendAdditive", "blendAdditiveFallback", "unpremultiplyOutput", "proceduralSoftDot", "fogAnalytic"];
    for (const bit of bits) keys.add(particleProgramKey({ ...base, [bit]: true }));
    keys.add(particleProgramKey(base));
    expect(keys.size).toBe(bits.length + 1);
  });

  it("fragment encodes per §6.2.7 — u_outputColorSpace picks HDR vs legacy sRGB", () => {
    const src = particleFragmentSource(base);
    expect(src).toContain("u_outputColorSpace");
    expect(src).toContain("a3dParticleEncodeOutput");
    expect(src).toContain("a3dLinearToSrgb");
    expect(src).toContain("layout(location=2) out vec4 o_reactive");
  });

  it("SOFT_PARTICLES gates the scene-depth fade uniforms", () => {
    const soft = particleFragmentSource({ ...base, softParticles: true });
    expect(soft).toContain("#define SOFT_PARTICLES 1");
    expect(soft).toContain("u_sceneDepth");
    expect(soft).toContain("u_depthLinearize");
    const off = particleFragmentSource(base);
    expect(off).toContain("#define SOFT_PARTICLES 0");
  });

  it("BLEND_ADDITIVE branch keeps alpha zero; fallback multiplies core 1.6", () => {
    const additive = particleFragmentSource({ ...base, blendAdditive: true });
    expect(additive).toContain("#define BLEND_ADDITIVE 1");
    expect(additive).toContain("o_color = vec4(rgb, 0.0)");
    const fallback = particleFragmentSource({ ...base, blendAdditiveFallback: true });
    expect(fallback).toContain("rgb *= 1.6");
  });

  it("vertex source carries the billboard + flipbook varyings", () => {
    const src = particleVertexSource(base);
    expect(src).toContain("a_posSize");
    expect(src).toContain("v_uv0");
    expect(src).toContain("v_uv1");
    expect(src).toContain("v_frameT");
  });
});
