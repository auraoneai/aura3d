import { describe, expect, it } from "vitest";
import {
  MockRenderDevice,
  buildRenderDebugOverlaySnapshot,
  captureRenderDebugIssue,
  type RenderDebugIssue
} from "../../../packages/rendering/src";

describe("renderer debug overlays", () => {
  it("captures shader validation failures with labels and device error codes", () => {
    const device = new MockRenderDevice();
    const issues: RenderDebugIssue[] = [];

    try {
      device.createShaderProgram({
        label: "debug-broken-shader",
        marker: "@galileo3d-debug-overlay-marker",
        vertex: "void main() { gl_Position = vec4(0.0); }",
        fragment: "void main() { }"
      });
    } catch (error) {
      issues.push(captureRenderDebugIssue("shader-error", "debug-broken-shader", error));
    }

    const overlay = buildRenderDebugOverlaySnapshot(issues);

    expect(overlay.visible).toBe(true);
    expect(overlay.issueCount).toBe(1);
    expect(overlay.shaderErrors).toBe(1);
    expect(overlay.renderPassErrors).toBe(0);
    expect(overlay.lines[0]).toContain("debug-broken-shader");
    expect(overlay.lines[0]).toContain("SHADER_MARKER_MISSING");
  });

  it("captures render pass failures without swallowing the original message", () => {
    const overlay = buildRenderDebugOverlaySnapshot([
      captureRenderDebugIssue("render-pass-error", "deferred-lighting-pass", new Error("Framebuffer incomplete"))
    ]);

    expect(overlay).toMatchObject({
      visible: true,
      issueCount: 1,
      shaderErrors: 0,
      renderPassErrors: 1
    });
    expect(overlay.lines[0]).toBe("[render-pass-error] deferred-lighting-pass: Framebuffer incomplete");
  });
});
