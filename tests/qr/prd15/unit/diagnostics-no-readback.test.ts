import { describe, expect, it, vi } from "vitest";
import { AURA_APP_CANVAS, appCanvasOf } from "../../../../packages/engine/src/agent-api/app/screenshot";

// #1131: diagnostics() must not read the frame back. collectResolution used
// app.screenshot() (canvas.toDataURL) just to learn the canvas size.
describe("#1131 diagnostics canvas size without readback", () => {
  it("appCanvasOf returns the slotted canvas and never calls screenshot()", () => {
    const canvas = { width: 640, height: 360, toDataURL: vi.fn(() => "data:") } as unknown as HTMLCanvasElement;
    const screenshot = vi.fn();
    const app = { screenshot };
    Object.defineProperty(app, AURA_APP_CANVAS, { value: canvas, enumerable: false });
    const found = appCanvasOf(app);
    expect(found).toBe(canvas);
    expect(found?.width).toBe(640);
    expect(screenshot).not.toHaveBeenCalled();
    expect((canvas as unknown as { toDataURL: ReturnType<typeof vi.fn> }).toDataURL).not.toHaveBeenCalled();
    expect(Object.keys(app)).toEqual(["screenshot"]); // non-enumerable seam
  });

  it("apps without the slot report undefined (callers fall back)", () => {
    expect(appCanvasOf({})).toBeUndefined();
  });

  it("collectResolution and findAppCanvas use the seam before screenshot()", async () => {
    const { readFileSync } = await import("node:fs");
    const diag = readFileSync("packages/engine/src/lanes/prd01/diagnostics.ts", "utf8");
    const surface = readFileSync("packages/engine/src/lanes/prd01/outputSurface.ts", "utf8");
    expect(diag).toMatch(/const size = appCanvas \?\? app\.screenshot\(\)/);
    expect(surface).toMatch(/const own = appCanvasOf\(app\);\s*if \(own\) return own;/);
  });
});
