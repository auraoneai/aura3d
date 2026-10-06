import { describe, expect, it } from "vitest";
import { ALL_SCENES } from "../../../benchmarks/quality-rebuild/shared/registry";
import { REGISTRY } from "../../../benchmarks/quality-rebuild/shared/contracts";

describe("C-30 benchmark registry", () => {
  it("lane scene aggregation is an array", () => {
    expect(Array.isArray(ALL_SCENES)).toBe(true);
    expect(Array.isArray(REGISTRY)).toBe(true);
  });
});
