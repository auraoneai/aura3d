import { describe, expect, it } from "vitest";
import { nodeHandlers, resolveNodeHandler } from "../../../packages/engine/src/agent-api/compiler/handlers";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { batched } from "../../../packages/engine/src/agent-api/nodes/batched";

describe("batched flag-off fails closed", () => {
  it("pending sentinel compile throws parity-not-implemented", () => {
    const h = resolveNodeHandler("batched", resolveQrFlags({ options: "none" }));
    expect(h?.flag).toBe("A3D_PARITY_BATCHING");
    expect(() => h!.compile({ kind: "batched" } as never, {} as never, {} as never)).toThrowError(/parity-not-implemented|not yet implemented/);
  });
  it("flag-on resolves the real handler (owner prd11)", () => {
    const h = resolveNodeHandler("batched", resolveQrFlags({ options: "parity.batching" }));
    expect(h?.owner).toBe("prd11");
  });
});
