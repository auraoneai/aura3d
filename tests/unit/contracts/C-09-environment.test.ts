import { describe, expect, it } from "vitest";
import { resolveEnvironment } from "@aura3d/engine/contracts";
import { resolveQrFlags } from "@aura3d/engine/contracts";

describe("C-09 environment resolution", () => {
  it("with no registered sources falls back to legacy", () => {
    const flags = resolveQrFlags({});
    const r = resolveEnvironment({} as never, "high" as never, flags);
    expect(r.kind).toBe("legacy");
  });
});
