// PRD-07 P1-T1 — lane registration acceptance (PRD-07 §15).
// Every contract-registry entry the lane barrels add is id-unique and owned by
// prd07; with no qr flags resolved, no `prd07.*` frame contributor is active.

import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import { frameContributors } from "@aura3d/rendering/contracts";
import { particleRenderHookSlot, skyBackgroundSlot } from "@aura3d/rendering/contracts";
import "@aura3d/engine/lanes";
import "@aura3d/rendering/lanes";

const NO_FLAGS = resolveQrFlags({ options: [] });

describe("prd07 lane registration", () => {
  it("provides the C-20 particle hook and C-21 sky slot", () => {
    expect(particleRenderHookSlot.provided).toBeDefined();
    expect(skyBackgroundSlot.provided).toBeDefined();
  });

  it("registers lane-owned contributors with prd07 ids", () => {
    const all = frameContributors(resolveQrFlags({ options: ["vfx", "vfx_sky"] })).map((c) => c.id);
    expect(all).toContain("prd07.particles");
    expect(all).toContain("prd07.sky");
  });

  it("activates no prd07.* contributor when every flag is off", () => {
    const active = frameContributors(NO_FLAGS).filter((c) => c.id.startsWith("prd07."));
    expect(active).toEqual([]);
  });
});
