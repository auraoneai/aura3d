import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_ONLY_FIELDS, compileScene } from "@aura3d/engine/contracts";

describe("C-36 compiler", () => {
  it("compileScene stub resolves a compilable shape", async () => {
    const scene = await compileScene({} as never, {} as never);
    expect(typeof scene.snapshotVersion).toBe("number");
    expect(Array.isArray(scene.actors)).toBe(true);
    expect(typeof scene.dispose).toBe("function");
  });
  it("DIAGNOSTIC_ONLY_FIELDS is seeded with known-unconsumed fields", () => {
    expect(Object.keys(DIAGNOSTIC_ONLY_FIELDS).length).toBeGreaterThanOrEqual(15);
  });
});
