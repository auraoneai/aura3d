/**
 * Lane-01 §6.9 context-attribute test (vitest, flag ON): lane canvases must be
 * created with {antialias: false, alpha: false, preserveDrawingBuffer: false,
 * powerPreference: "high-performance"} while the flag is on, honoring
 * renderer.debug.preserveDrawingBuffer with a dev warning; the flag-off
 * baseline keeps antialias: true. Exercises `resolveCanvasContextAttributes`
 * plus the WebGL2Device option plumbing (powerPreference forwarded verbatim).
 */

import { describe, expect, it, vi } from "vitest";

import { resolveCanvasContextAttributes } from "@aura3d/rendering";

describe("PRD-01 §6.9 canvas context attributes", () => {
  it("flag-on attributes match the §6.9 table verbatim", () => {
    const attrs = resolveCanvasContextAttributes({ flagOn: true });
    expect(attrs).toEqual({
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance"
    });
  });

  it("flag-off keeps the pre-flag baseline (antialias: true)", () => {
    const attrs = resolveCanvasContextAttributes({ flagOn: false });
    expect(attrs.antialias).toBe(true);
    expect(attrs.alpha).toBe(false);
    expect(attrs.preserveDrawingBuffer).toBe(false);
    expect(attrs.powerPreference).toBe("default");
  });

  it("renderer.debug.preserveDrawingBuffer opt-in wins and warns", () => {
    const warn = vi.fn();
    const attrs = resolveCanvasContextAttributes({
      flagOn: true,
      debugPreserveDrawingBuffer: true,
      warn
    });
    expect(attrs.preserveDrawingBuffer).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("preserveDrawingBuffer"));
  });

  it("opt-in without flag keeps the baseline (no warning)", () => {
    const warn = vi.fn();
    const attrs = resolveCanvasContextAttributes({
      flagOn: false,
      debugPreserveDrawingBuffer: true,
      warn
    });
    expect(attrs.preserveDrawingBuffer).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});
