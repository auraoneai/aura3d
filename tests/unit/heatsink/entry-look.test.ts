import { describe, expect, it } from "vitest";
import { lookFromParam } from "../../../apps/showcase-heatsink/src/entry";

describe("heatsink entry look (GU47 PRD D11)", () => {
  it("defaults to the 4.6.2 presentation", () => {
    expect(lookFromParam(null)).toBe("original");
    expect(lookFromParam("original")).toBe("original");
    expect(lookFromParam("bogus")).toBe("original");
  });
  it("opts into the GU47 foundry look with ?look=foundry", () => {
    expect(lookFromParam("foundry")).toBe("foundry");
  });
});
