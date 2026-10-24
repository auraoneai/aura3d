import { describe, expect, it } from "vitest";
import * as debug from "../../../packages/debug/src/index";

describe("@aura3d/debug package entry", () => {
  it("re-exports the safety-net and black-frame guard surface the docs name", () => {
    for (const name of [
      "installSafetyNet",
      "installBlackFrameGuard",
      "installFrameTap",
      "installDiagnosticsPanel",
      "createBlackFrameWatch",
      "resolveQualitySwitches",
      "QR_HEAL_LADDER"
    ]) {
      expect((debug as Record<string, unknown>)[name], name).toBeDefined();
    }
  });
});
