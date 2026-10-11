// QR-13: the lane-13 promote probe scene registers active (both adapters on
// disk), so `suite=promote promote_flag=looks` renders a scene that authors a look.
import { describe, expect, it } from "vitest";
import { getRegisteredScene } from "../../../benchmarks/quality-rebuild/shared/registry";

describe("prd13 bench scenes", () => {
  it("prd13-neon-arcade is active", () => {
    const entry = getRegisteredScene("prd13-neon-arcade");
    expect(entry?.status, entry?.quarantineReason).toBe("active");
  });
});
