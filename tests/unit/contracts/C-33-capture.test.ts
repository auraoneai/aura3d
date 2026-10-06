import { describe, expect, it } from "vitest";
import { registerCaptureStepPlugin, captureStepPluginFor } from "../../../tools/quality-rebuild-capture/contracts.mjs";

describe("C-33 capture step plugins", () => {
  it("register + lookup; duplicates throw", () => {
    const p = { name: "test-step", owner: "prd15", run: async () => ({ files: [] }) };
    registerCaptureStepPlugin(p);
    expect(captureStepPluginFor("test-step")).toBe(p);
    expect(() => registerCaptureStepPlugin(p)).toThrow(/CAPTURE_STEP_DUPLICATE/);
  });
});
