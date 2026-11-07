import { describe, expect, it } from "vitest";
import { shieldSpec } from "../../../apps/showcase-roadster-rush/src/art/shield";

describe("Apex Overdrive shield portable pair (A4)", () => {
  const spec = shieldSpec();
  it("keeps the GLSL stages and adds a WGSL twin reading the same uniforms", () => {
    expect(spec.glsl.fragment).toContain("shieldPulse");
    expect(spec.wgsl?.vertex).toContain("@aura3d-bindings");
    expect(spec.wgsl?.fragment).toContain("@aura3d-bindings");
    const used = `${spec.wgsl?.vertex ?? ""}${spec.wgsl?.fragment ?? ""}`;
    for (const name of Object.keys(spec.uniforms ?? {})) {
      expect(used).toContain(`aura.u_${name}`);
    }
  });
  it("keeps the additive, depth-write-off render state", () => {
    expect(spec.blending).toBe("additive");
    expect(spec.depthWrite).toBe(false);
  });
});
