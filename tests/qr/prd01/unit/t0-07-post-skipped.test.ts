/**
 * T0-07: C-31 `output.postSkipped` reports the legacy postprocess chain the
 * renderer skipped under A3D_QR_CORE_OUTPUT (C-36-shaped record).
 */
import { describe, expect, it } from "vitest";
import { collectOutput, PRD01_RENDERER } from "../../../../packages/engine/src/lanes/prd01/diagnostics";

const appWith = (postSkipped: unknown) => ({ [PRD01_RENDERER]: { postSkipped } }) as never;

describe("T0-07 output.postSkipped", () => {
  it("emits the renderer's postSkipped record (no output surface needed)", () => {
    const record = {
      code: "post-v2-unmigrated",
      message: "legacy postprocess chain skipped under A3D_QR_CORE_OUTPUT; encode handled by OutputPass",
      effects: ["bloom", "ssao"]
    };
    const out = collectOutput(appWith(record)) as { postSkipped?: unknown };
    expect(out.postSkipped).toEqual(record);
  });

  it("emits null when the renderer skipped nothing", () => {
    const out = collectOutput(appWith(null)) as { postSkipped?: unknown };
    expect(out.postSkipped).toBeNull();
  });
});
