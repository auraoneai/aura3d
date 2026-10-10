import { describe, expect, it } from "vitest";
import { qrFlagsWithAnimationMixer, resolveQrFlags } from "@aura3d/engine/contracts";

describe("C-00 flags", () => {
  it("options list enables named flags", () => {
    const flags = resolveQrFlags({ options: ["core", "post.taa"] });
    expect(flags.on("A3D_QR_CORE")).toBe(true);
    expect(flags.on("A3D_QR_POST_TAA")).toBe(true);
    expect(flags.on("A3D_QR_POST")).toBe(false);
  });
  it("env A3D_QR list enables flags; per-flag env overrides", () => {
    const flags = resolveQrFlags({ env: { A3D_QR: "core", A3D_QR_POST: "1" } });
    expect(flags.on("A3D_QR_CORE")).toBe(true);
    expect(flags.on("A3D_QR_POST")).toBe(true);
  });
  it("no input disables everything", () => {
    const flags = resolveQrFlags({});
    expect(flags.on("A3D_QR_CORE")).toBe(false);
  });
  it("T1.11: animation.mixer:\"pose\" aliases A3D_QR_ANIMATION_POSE_MIXER; an explicit flags value wins", () => {
    const base = resolveQrFlags({ options: [] });
    const aliased = qrFlagsWithAnimationMixer(base, "pose");
    expect(aliased.on("A3D_QR_ANIMATION_POSE_MIXER")).toBe(true);
    // the sub-flag alone does not imply the lane flag
    expect(aliased.on("A3D_QR_ANIMATION")).toBe(false);
    expect(qrFlagsWithAnimationMixer(base, "legacy").on("A3D_QR_ANIMATION_POSE_MIXER")).toBe(false);
    expect(qrFlagsWithAnimationMixer(base, undefined).on("A3D_QR_ANIMATION_POSE_MIXER")).toBe(false);
    const explicitOff = qrFlagsWithAnimationMixer(
      resolveQrFlags({ options: { A3D_QR_ANIMATION_POSE_MIXER: false } }),
      "pose"
    );
    expect(explicitOff.on("A3D_QR_ANIMATION_POSE_MIXER")).toBe(false);
  });
  it("#72: flagNameFor resolves multi-segment names (core.x.y, route.a.b)", () => {
    const flags = resolveQrFlags({ options: ["core.shadows.cascade", "route.demo.alpha", "camera.dof"] });
    expect(flags.on("A3D_QR_CORE_SHADOWS_CASCADE")).toBe(true);
    expect(flags.on("A3D_QR_ROUTE_DEMO_ALPHA")).toBe(true);
    expect(flags.on("A3D_QR_CAMERA_DOF")).toBe(true);
    // dotted shorthand still resolves two-segment names
    expect(resolveQrFlags({ options: ["looks.hair"] }).on("A3D_QR_LOOKS_HAIR")).toBe(true);
  });
});
