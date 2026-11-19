import { describe, expect, it } from "vitest";
import { lowerModelMaterialOverrides } from "../../../../packages/engine/src/production-runtime/ModelMaterialOverrides";

describe("material override target \"*\"", () => {
  it("applies to every material (no target predicate), like an omitted target", () => {
    const [star] = lowerModelMaterialOverrides(undefined, [{ target: "*", color: "#ff0000", colorMode: "multiply" } as never]);
    const [none] = lowerModelMaterialOverrides(undefined, [{ color: "#ff0000", colorMode: "multiply" } as never]);
    expect(star?.target).toBeUndefined();
    expect(none?.target).toBeUndefined();
  });

  it("treats \"*\" inside a target list as every material", () => {
    const [rule] = lowerModelMaterialOverrides(undefined, [{ target: ["Body", "*"], color: "#00ff00" } as never]);
    expect(rule?.target).toBeUndefined();
  });

  it("keeps exact-name targets exact", () => {
    const [rule] = lowerModelMaterialOverrides(undefined, [{ target: "Body", color: "#0000ff" } as never]);
    expect(rule?.target?.("Body")).toBe(true);
    expect(rule?.target?.("Visor")).toBe(false);
  });
});
