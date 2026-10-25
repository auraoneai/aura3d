import { describe, expect, it } from "vitest";
import { mountFailureConsoleMessage } from "../../../packages/engine/src/agent-api/app/mountFailure";

describe("mountFailureConsoleMessage", () => {
  it("names the failure, says nothing will draw, and points at diagnostics and strict mode", () => {
    const m = mountFailureConsoleMessage("Failed to fetch /aura-assets/hero.glb (HTTP 404).");
    expect(m).toContain("RENDERER_MOUNT_FAILED");
    expect(m).toContain("hero.glb");
    expect(m).toContain("Nothing will draw");
    expect(m).toContain("app.diagnostics().errors");
    expect(m).toContain("strict: true");
  });

  it("truncates a very long message", () => {
    const m = mountFailureConsoleMessage("x".repeat(5000));
    expect(m.length).toBeLessThan(700);
  });
});
