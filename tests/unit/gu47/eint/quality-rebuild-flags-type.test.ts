import { describe, expect, expectTypeOf, it } from "vitest";
import type { AuraCreateAppOptions } from "../../../../packages/engine/src/agent-api/index";
import { resolveQrFlags, type QrFlagInput } from "../../../../packages/engine/src/contracts/flags";

// GU47 pass 4 (g04 GD-00): createAuraApp's `qualityRebuild.flags` takes the record form resolveQrFlags already reads.
describe("createAuraApp qualityRebuild.flags type (pass 4)", () => {
  it("accepts every QrFlagInput form", () => {
    type Flags = NonNullable<NonNullable<AuraCreateAppOptions["qualityRebuild"]>["flags"]>;
    expectTypeOf<QrFlagInput>().toMatchTypeOf<Flags>();
    expectTypeOf<readonly string[]>().toMatchTypeOf<Flags>();
    const record: Flags = { A3D_QR_POST: true };
    expect(resolveQrFlags({ options: record, env: {} }).on("A3D_QR_POST")).toBe(true);
  });
});
