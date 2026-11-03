import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import { createScopedVelocityHistory, velocityHistorySlot, VelocityHistory } from "@aura3d/rendering";
import { resetTemporalHistory } from "@aura3d/rendering/contracts";
import { bindVelocityUniforms } from "@aura3d/rendering";

const flagsOn = () => resolveQrFlags({ options: ["post"] });
const flagsOff = () => resolveQrFlags({ options: { A3D_QR_POST: false } }); // A3D_QR_POST is default-on

const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

describe("C-14 velocityHistorySlot (impl: prd03)", () => {
  it("slot identity is frozen (C-14, prd03, A3D_QR_POST)", () => {
    expect(velocityHistorySlot.id).toBe("C-14");
    expect(velocityHistorySlot.owner).toBe("prd03");
    expect(velocityHistorySlot.flag).toBe("A3D_QR_POST");
  });

  it("lane barrel provided the real; flag-off resolves the stub", () => {
    expect(velocityHistorySlot.provided).toBe(true);
    expect(velocityHistorySlot.get(flagsOff()).kind).toBe("legacy");
    expect(velocityHistorySlot.get(flagsOn()).kind).toBe("v2");
  });

  it("seed frame: previous == unjittered and jitter is zero", () => {
    const history = new VelocityHistory();
    const out = history.prepare(identity(), history.jitter(1920, 1080));
    expect(out.previous).toEqual(out.unjittered);
    history.commit();
    expect(history.jitter(1920, 1080)).not.toEqual([0, 0]);
  });

  it("second frame: previous is the first frame's unjittered matrix", () => {
    const history = new VelocityHistory();
    const a = history.prepare(identity(), [0, 0]);
    const moved = new Float32Array(identity());
    moved[12] = 4;
    const b = history.prepare(moved, [0, 0]);
    expect(b.previous).toEqual(a.unjittered);
    expect(b.unjittered).toEqual(moved);
  });

  it("jitter offsets in clip space scale by w and stay inside a pixel", () => {
    const history = new VelocityHistory();
    history.prepare(identity(), [0, 0]);
    history.commit();
    const [jx, jy] = history.jitter(100, 100);
    expect(Math.abs(jx)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(jy)).toBeLessThanOrEqual(0.01);
    const out = history.prepare(identity(), [jx, jy]);
    // Clip-space offset lands on the translation column (indices 12/13): for an
    // affine matrix the jitter scales each column by its w row (index col*4+3).
    expect(out.jittered[0]).toBe(1);
    expect(out.jittered[12]).toBeCloseTo(jx, 6);
    expect(out.jittered[13]).toBeCloseTo(jy, 6);
  });

  it("reset clears previous so the next frame re-seeds", () => {
    const history = new VelocityHistory();
    history.prepare(identity(), [0, 0]);
    history.reset("camera-cut");
    const out = history.prepare(identity(), [0, 0]);
    expect(out.previous).toEqual(out.unjittered);
  });

  it("the contract reset seam reaches only its explicit scoped target", () => {
    const real = createScopedVelocityHistory(flagsOn());
    const other = createScopedVelocityHistory(flagsOn());
    const moved = identity();
    moved[12] = 3;
    real.prepare(identity(), [0, 0]);
    other.prepare(identity(), [0, 0]);
    other.commit?.();
    resetTemporalHistory("resize", real);
    const out = real.prepare(identity(), [0, 0]);
    expect(out.previous).toEqual(out.unjittered);
    expect(other.prepare(moved, [0, 0]).previous).toEqual(identity());
    expect(() => resetTemporalHistory("resize", undefined as never)).toThrow(/explicit renderer, device or view/);
    expect("history" in velocityHistorySlot.get(flagsOn())).toBe(false);
  });

  it("uniform binder writes previous matrices only after a prepared frame", () => {
    const uniforms = new Map<string, unknown>();
    const item = { modelMatrix: identity() } as Parameters<NonNullable<typeof bindVelocityUniforms>>[0];
    bindVelocityUniforms?.(item, uniforms as never);
    expect(uniforms.size).toBe(0);
    const real = createScopedVelocityHistory(flagsOn()) as VelocityHistory;
    real.prepare(identity(), [0, 0]);
    bindVelocityUniforms?.(real.prepareItem(item, true), uniforms as never);
    expect(uniforms.has("u_previousViewProjection")).toBe(true);
    expect(uniforms.has("u_unjitteredViewProjection")).toBe(true);
    expect(uniforms.has("u_previousModel")).toBe(true);
  });
});
