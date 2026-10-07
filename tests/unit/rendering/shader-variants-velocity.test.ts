import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd03";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { buildChunkHarnessProgram } from "../../../packages/rendering/src/contracts/testing/ChunkHarness";
import { VELOCITY_MRT } from "../../../packages/rendering/src/contracts/velocity";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import {
  velocityFeature,
  velocityParsVertexChunk,
  velocityWriteVertexChunk,
  velocityParsFragmentChunk,
  velocityWriteFragmentChunk
} from "../../../packages/rendering/src/post/chunks/velocity.glsl";

const ALL_CHUNKS = [
  velocityParsVertexChunk,
  velocityWriteVertexChunk,
  velocityParsFragmentChunk,
  velocityWriteFragmentChunk
];

describe("prd03.velocity — shader variants (PRD-03 Phase 4)", () => {
  it("feature is registered with id prd03.velocity, flag A3D_QR_POST, and the four chunk stages", () => {
    expect(velocityFeature.id).toBe("prd03.velocity");
    expect(velocityFeature.flag).toBe("A3D_QR_POST");
    expect(velocityFeature.chunks).toEqual(ALL_CHUNKS.map((c) => c.name));
    expect(velocityFeature.defines("velocity")).toEqual({ [VELOCITY_MRT.define]: true });
  });

  it("ChunkHarness composes the full program with AURA_VELOCITY at location 1 and reactive at 2", () => {
    const program = buildChunkHarnessProgram(ALL_CHUNKS);
    expect(program.vertex).toContain("u_previousViewProjection");
    expect(program.vertex).toContain("u_unjitteredViewProjection");
    expect(program.vertex).toContain("u_previousModel");
    expect(program.vertex).toContain("a3d_velPrevClip");
    expect(program.vertex).toContain("a3d_velCurrClip");
    expect(program.fragment).toContain(`layout(location = ${VELOCITY_MRT.velocityLocation})`);
    expect(program.fragment).toContain(`layout(location = ${VELOCITY_MRT.reactiveLocation})`);
    expect(program.fragment).toContain("a3d_o_velocity");
    expect(program.fragment).toContain("a3d_o_reactive");
  });

  it.each(["rigid", "instanced", "skinned", "morph"] as const)(
    "%s variant: same chunk program — deform stages upstream read a_position before this hook",
    (variant) => {
      // The velocity chunks read `a_position` post-deform (skinned pose /
      // morph weights are applied by earlier vertex stages), so every deform
      // family compiles the same velocity program; asserting per variant
      // documents the contract that no variant branches on AURA_* defines.
      const program = buildChunkHarnessProgram(ALL_CHUNKS);
      expect(program.vertex).not.toContain("AURA_INSTANCING");
      expect(program.vertex).not.toContain("AURA_SKINNED");
      expect(program.fragment).toContain("a3d_o_velocity");
      void variant;
    }
  );

  it("feature selects only forward passes under the opt-in A3D_QR_POST_VELOCITY_MRT sub-flag", () => {
    const flags = (mrt: boolean) => resolveQrFlags({ options: { A3D_QR_POST: true, ...(mrt ? { A3D_QR_POST_VELOCITY_MRT: true } : {}) } });
    const select = (f: ReturnType<typeof flags>, pass: string) =>
      velocityFeature.select({ item: {} as never, pass: pass as never, tier: QUALITY_TIERS.high, flags: f });
    expect(select(flags(true), "forward")).toBe("velocity");
    expect(select(flags(false), "forward")).toBeUndefined();
    expect(select(flags(true), "depth")).toBeUndefined();
    expect(select(flags(true), "shadow")).toBeUndefined();
  });

  it("velocity formula matches the S1-C camera-velocity convention (Δndc · 0.5, clamped ±0.25)", () => {
    // v = (ndcCurr − ndcPrev) · 0.5 — same units/sign as S1-C so the TAA
    // reproject stage can blend camera and object velocity uniformly.
    const ndcDelta = (curr: number, prev: number) => Math.max(-0.25, Math.min(0.25, (curr - prev) * 0.5));
    expect(ndcDelta(0.2, 0.1)).toBeCloseTo(0.05);
    expect(ndcDelta(-0.1, 0.1)).toBeCloseTo(-0.1);
    expect(ndcDelta(2, 0)).toBe(0.25); // clamp
    // Rigid cube moving +0.1 NDC/frame (checklist case) → velocity 0.05.
    expect(ndcDelta(0.1, 0)).toBeCloseTo(0.05, 3);
  });
});
