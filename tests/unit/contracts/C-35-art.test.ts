import { describe, expect, it } from "vitest";
import { auditArtDirection } from "@aura3d/engine/contracts";

describe("C-35-art symbols", () => {
  it("contract surface is present on the stub", () => {
    expect(auditArtDirection).toBeDefined();
  });
});
