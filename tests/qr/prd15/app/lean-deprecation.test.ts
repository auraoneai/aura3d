import { describe, expect, it } from "vitest";
describe("lean shim names exist on engine", () => {
  it("exports the §7.5 surface", async () => {
    const engine = await import("@aura3d/engine"); // full barrel; can exceed the 5s default on first transform

    for (const n of ["createAuraApp","scene","model","primitives","material","lights","camera","environments","interactions","defineAuraAssets","game"]) {
      expect(n in engine, n).toBe(true);
    }
  }, 30000);
  it("@aura3d/lean shim re-exports them with the one-time warn", async () => {
    const warnings: string[] = [];
    const orig = console.warn;
    console.warn = (m: string) => { warnings.push(String(m)); };
    const lean = await import("@aura3d/lean");
    console.warn = orig;
    for (const n of ["createAuraApp","scene","model","primitives","material","lights","camera","environments","interactions","defineAuraAssets"]) {
      expect(n in lean, n).toBe(true);
    }
    expect(warnings.some((w) => w.includes("@aura3d/lean is deprecated"))).toBe(true);
  });
  it("@aura3d/lean/game re-exports game + §7.5 names", async () => {
    const leanGame = await import("@aura3d/lean/game");
    for (const n of ["createAuraApp","scene","game","defineAuraAssets"]) {
      expect(n in leanGame, n).toBe(true);
    }
  });
  it("@aura3d/lean/product re-exports §7.5 names", async () => {
    const leanProduct = await import("@aura3d/lean/product");
    for (const n of ["createAuraApp","scene","environments","interactions","defineAuraAssets"]) {
      expect(n in leanProduct, n).toBe(true);
    }
  });
});
