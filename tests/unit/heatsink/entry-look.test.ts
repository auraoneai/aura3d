import { describe, expect, it } from "vitest";
import { lookFromParam } from "../../../apps/showcase-heatsink/src/entry";

describe("heatsink entry look (GU47 PRD D11, phase 3)", () => {
  it("defaults to the GU47 foundry look in every circuit (blind panel g03p3r2 better 3/0/0 each)", () => {
    expect(lookFromParam(null)).toBe("foundry");
    expect(lookFromParam("foundry")).toBe("foundry");
    expect(lookFromParam("bogus")).toBe("foundry");
  });
  it("boots the 4.6.2 presentation with ?look=original", () => {
    expect(lookFromParam("original")).toBe("original");
  });
});
