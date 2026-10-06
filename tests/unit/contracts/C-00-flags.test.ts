import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "@aura3d/engine/contracts";

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
});
