import { describe, expect, it } from "vitest";
import { TEXTURE_WAIT_MS, texturesSettled } from "../../../examples/roadster-hours-port/art/textureGate";

describe("Saltwind Highway texture gate for judged shots (GU47 phase 2)", () => {
  it("opens once every row is textured or on its settled fallback", () => {
    expect(texturesSettled({ total: 58, textured: 58, pending: 0, none: 0 }, 0)).toBe(true);
    expect(texturesSettled({ total: 58, textured: 57, pending: 0, none: 0 }, 0)).toBe(true); // one fallback row
  });
  it("waits on pending or unreached rows, but only up to the bound", () => {
    expect(texturesSettled({ total: 58, textured: 40, pending: 18, none: 0 }, 1000)).toBe(false);
    expect(texturesSettled({ total: 58, textured: 50, pending: 0, none: 8 }, 1000)).toBe(false);
    expect(texturesSettled({ total: 58, textured: 40, pending: 18, none: 0 }, TEXTURE_WAIT_MS)).toBe(true);
  });
  it("does not open on an empty diagnostics read before the bound", () => {
    expect(texturesSettled({ total: 0, textured: 0, pending: 0, none: 0 }, 10)).toBe(false);
  });
});
