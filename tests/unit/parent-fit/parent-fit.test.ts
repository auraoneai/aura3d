import { describe, expect, it } from "vitest";
import { createParentFit, type ParentFitCanvas } from "../../../packages/engine/src/agent-api/app/parentFit";

interface Layout {
  canvas: ParentFitCanvas & { style: { width: string; height: string } };
  parentSize(): { width: number; height: number };
  setFixedParent(size: { width: number; height: number } | null): void;
}

/** Block parent: width = viewport; height = fixed, or content-driven (canvas + a 24px HUD beside it). */
function layout(options: { viewportWidth: number; hud: number; canvas: { width: number; height: number }; fixed?: { width: number; height: number } }): Layout {
  let fixed = options.fixed ?? null;
  const style = { width: `${options.canvas.width}px`, height: `${options.canvas.height}px` };
  const parentSize = () => fixed ?? { width: options.viewportWidth, height: parseFloat(style.height) + options.hud };
  const canvas = {
    style,
    get clientWidth() { return parseFloat(style.width); },
    get clientHeight() { return parseFloat(style.height); },
    parentElement: { getBoundingClientRect: () => parentSize() },
    getBoundingClientRect: () => ({ width: parseFloat(style.width), height: parseFloat(style.height) })
  };
  return { canvas, parentSize, setFixedParent: (s) => { fixed = s; } };
}

/** What frameLoop's resizeRenderer does with the fit, driven like a ResizeObserver that fires after every size change. */
function resizeOnce(l: Layout, fit: ReturnType<typeof createParentFit>): void {
  const { cssWidth, cssHeight } = fit.measure(960, 540);
  l.canvas.style.width = `${cssWidth}px`;
  l.canvas.style.height = `${cssHeight}px`;
  if (fit.settle()) resizeOnce(l, fit);
}

describe("createParentFit", () => {
  it("does not grow a canvas whose auto-height parent also holds a HUD", () => {
    const l = layout({ viewportWidth: 800, hud: 24, canvas: { width: 640, height: 360 } });
    const fit = createParentFit(l.canvas);
    for (let i = 0; i < 200; i += 1) resizeOnce(l, fit);
    expect(parseFloat(l.canvas.style.height)).toBe(360);
    expect(parseFloat(l.canvas.style.width)).toBe(800);
  });

  it("without the guard the same layout grows without bound (the failure being prevented)", () => {
    const l = layout({ viewportWidth: 800, hud: 24, canvas: { width: 640, height: 360 } });
    for (let i = 0; i < 200; i += 1) {
      const { width, height } = l.parentSize();
      l.canvas.style.width = `${width}px`;
      l.canvas.style.height = `${height}px`;
    }
    expect(parseFloat(l.canvas.style.height)).toBeGreaterThan(4000);
  });

  it("still follows a parent with a definite size", () => {
    const l = layout({ viewportWidth: 800, hud: 24, canvas: { width: 640, height: 360 }, fixed: { width: 1000, height: 700 } });
    const fit = createParentFit(l.canvas);
    resizeOnce(l, fit);
    expect([parseFloat(l.canvas.style.width), parseFloat(l.canvas.style.height)]).toEqual([1000, 700]);
    l.setFixedParent({ width: 500, height: 300 });
    resizeOnce(l, fit);
    expect([parseFloat(l.canvas.style.width), parseFloat(l.canvas.style.height)]).toEqual([500, 300]);
  });

  it("does not freeze a canvas that is the only child of an auto-height wrapper", () => {
    const l = layout({ viewportWidth: 800, hud: 0, canvas: { width: 640, height: 360 } });
    const fit = createParentFit(l.canvas);
    for (let i = 0; i < 10; i += 1) resizeOnce(l, fit);
    expect(parseFloat(l.canvas.style.height)).toBe(360);
  });
});
