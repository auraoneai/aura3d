import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";

// threejs-parity B-02 (docs/workflows/threejs-parity-gaps.md §5.0): the six
// A3D_PARITY_* lane flags resolve through every source and stay opt-in dev
// flags (off unless explicitly enabled).
describe("threejs-parity lane flags", () => {
  it("accepts a full A3D_PARITY_* token in a flag list", () => {
    const flags = resolveQrFlags({ options: "A3D_PARITY_LINES" });
    expect(flags.on("A3D_PARITY_LINES")).toBe(true);
    expect(flags.on("A3D_PARITY_GEOMETRY")).toBe(false);
  });

  it("maps the parity.<lane> short form", () => {
    const flags = resolveQrFlags({ options: "parity.geometry" });
    expect(flags.on("A3D_PARITY_GEOMETRY")).toBe(true);
  });

  it("reads per-flag A3D_PARITY_* env vars", () => {
    const flags = resolveQrFlags({ env: { A3D_PARITY_SHADING: "1" } });
    expect(flags.on("A3D_PARITY_SHADING")).toBe(true);
  });

  it("reads per-flag A3D_QR-style negation for parity flags", () => {
    const flags = resolveQrFlags({ env: { A3D_PARITY_TEXTURES: "0" } });
    expect(flags.on("A3D_PARITY_TEXTURES")).toBe(false);
  });

  it("all / none blankets cover parity flags", () => {
    expect(resolveQrFlags({ options: "all" }).on("A3D_PARITY_BATCHING")).toBe(true);
    expect(resolveQrFlags({ options: "none" }).on("A3D_PARITY_BATCHING")).toBe(false);
  });

  it("the inert parity flags are off by default (dev state); BATCHING and LINES are default-on (R-17)", () => {
    const flags = resolveQrFlags({});
    for (const lane of ["SHADING", "GEOMETRY", "TEXTURES", "RUNTIME"] as const) {
      expect(flags.on(`A3D_PARITY_${lane}` as never)).toBe(false);
    }
    for (const lane of ["BATCHING", "LINES"] as const) {
      expect(flags.on(`A3D_PARITY_${lane}` as never)).toBe(true);
    }
  });
});
