import { describe, expect, it } from "vitest";
import { frameContributors, registerFrameContributor, type FrameContributor } from "@aura3d/rendering/contracts";
import { resolveQrFlags } from "@aura3d/engine/contracts";

describe("C-01 FrameGraph", () => {
  it("all-flags-off yields zero contributors", () => {
    const flags = resolveQrFlags({ options: [] });
    expect(frameContributors(flags).length).toBe(0);
  });
  it("registered contributor shows up under its flag", () => {
    const c: FrameContributor = {
      id: "prd01.test", owner: "prd01", flag: "A3D_QR_CORE",
      phases: ["opaque"],
      passes: () => []
    };
    const dispose = registerFrameContributor(c);
    const flags = resolveQrFlags({ options: ["core"] });
    expect(frameContributors(flags).map((x) => x.id)).toContain("prd01.test");
    const off = resolveQrFlags({ options: [] });
    expect(frameContributors(off).map((x) => x.id)).not.toContain("prd01.test");
    dispose();
  });
});
