// Lane E1 wave 2 (handoff from G01, top-tennis C2): a canvas the page's CSS sizes smaller than its parent keeps that size.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createParentFit, type ParentFitCanvas } from "../../../packages/engine/src/agent-api/app/parentFit";
import { configureCanvas, ownSizedCanvasAxes, refreshOwnSizedAxes } from "../../../packages/engine/src/agent-api/app/canvas";

/**
 * A small box model: the parent is a fixed box; the canvas's width is `auto` or a CSS value, its height `auto` or a CSS value.
 * `auto` follows the backing store (a canvas's intrinsic size is its width/height attributes); inline style beats the sheet.
 */
function fakeCanvas(options: { parent: { width: number; height: number }; sheet: { width?: (parent: { width: number; height: number }) => number; height?: (parent: { width: number; height: number }) => number } }) {
  const parent = { ...options.parent };
  const style = { width: "", height: "", display: "" };
  const backing = { width: 300, height: 150 };
  const axis = (inline: string, sheet: ((p: typeof parent) => number) | undefined, parentSize: number, intrinsic: number): number => {
    if (inline.endsWith("px")) return parseFloat(inline);
    if (inline.endsWith("%")) return (parseFloat(inline) / 100) * parentSize;
    return sheet ? sheet(parent) : intrinsic;
  };
  const box = () => ({
    width: axis(style.width, options.sheet.width, parent.width, backing.width),
    height: axis(style.height, options.sheet.height, parent.height, backing.height)
  });
  const canvas = {
    style,
    dataset: {} as Record<string, string>,
    hasAttribute: () => false,
    get width() { return backing.width; },
    set width(v: number) { backing.width = v; },
    get height() { return backing.height; },
    set height(v: number) { backing.height = v; },
    get clientWidth() { return box().width; },
    get clientHeight() { return box().height; },
    parentElement: { getBoundingClientRect: () => ({ ...parent }), clientWidth: parent.width, clientHeight: parent.height },
    getBoundingClientRect: () => box()
  };
  return { canvas, parent, box, sheet: options.sheet };
}

const zeroStyle = { paddingLeft: "0", paddingRight: "0", paddingTop: "0", paddingBottom: "0", borderLeftWidth: "0", borderRightWidth: "0", borderTopWidth: "0", borderBottomWidth: "0" };

afterEach(() => { vi.unstubAllGlobals(); });

describe("E1 wave 2: canvas fit honours a CSS size smaller than the parent (top-tennis C2)", () => {
  it("a portrait canvas styled calc(100% - bands) keeps its CSS height; width still follows the parent", () => {
    vi.stubGlobal("getComputedStyle", () => zeroStyle);
    // 390x844 shell; score band 120 px above, control band 76 px below.
    const { canvas, box } = fakeCanvas({ parent: { width: 390, height: 844 }, sheet: { height: (p) => p.height - 196 } });
    configureCanvas(canvas as unknown as HTMLCanvasElement, 1, true, { width: 1, height: 1 });
    expect(ownSizedCanvasAxes(canvas as unknown as HTMLCanvasElement)).toEqual({ width: false, height: true });
    expect(canvas.style.height).toBe("");
    expect(box().height).toBe(648);
    expect([canvas.width, canvas.height]).toEqual([390, 648]);
  });

  it("before the fix the engine wrote the parent height inline (the failure being prevented)", () => {
    vi.stubGlobal("getComputedStyle", undefined);
    const { canvas, box } = fakeCanvas({ parent: { width: 390, height: 844 }, sheet: { height: (p) => p.height - 196 } });
    configureCanvas(canvas as unknown as HTMLCanvasElement, 1, true, { width: 1, height: 1 });
    expect(box().height).toBe(844);
  });

  it("an auto-sized canvas (follows its backing store) keeps the parent fit", () => {
    vi.stubGlobal("getComputedStyle", () => zeroStyle);
    const { canvas, box } = fakeCanvas({ parent: { width: 800, height: 600 }, sheet: {} });
    configureCanvas(canvas as unknown as HTMLCanvasElement, 1, true, { width: 1, height: 1 });
    expect(ownSizedCanvasAxes(canvas as unknown as HTMLCanvasElement)).toEqual({ width: false, height: false });
    expect(box()).toEqual({ width: 800, height: 600 });
  });

  it("a canvas styled to the parent's full size keeps the parent fit", () => {
    vi.stubGlobal("getComputedStyle", () => zeroStyle);
    const { canvas } = fakeCanvas({ parent: { width: 800, height: 600 }, sheet: { width: (p) => p.width, height: (p) => p.height } });
    configureCanvas(canvas as unknown as HTMLCanvasElement, 1, true, { width: 1, height: 1 });
    expect(ownSizedCanvasAxes(canvas as unknown as HTMLCanvasElement)).toEqual({ width: false, height: false });
  });

  it("parent fit reads the canvas's own box on an own-sized axis and does not freeze it", () => {
    let parentHeight = 844;
    const style = { width: "390px", height: "" };
    let ownHeight = 648;
    const canvas: ParentFitCanvas = {
      style,
      clientWidth: 390,
      clientHeight: ownHeight,
      parentElement: { getBoundingClientRect: () => ({ width: 390, height: parentHeight }) },
      getBoundingClientRect: () => ({ width: 390, height: ownHeight })
    };
    const fit = createParentFit(canvas, { width: false, height: true, box: () => ({ width: 390, height: ownHeight }) });
    expect(fit.measure(960, 540)).toEqual({ cssWidth: 390, cssHeight: 648, ownWidth: false, ownHeight: true });
    parentHeight = 700; ownHeight = 504;
    expect(fit.settle()).toBe(false);
    expect(fit.measure(960, 540)).toMatchObject({ cssHeight: 504, ownHeight: true });
  });

  it("an own-sized axis that measures 0 (hidden) falls back to the parent", () => {
    const canvas: ParentFitCanvas = {
      style: { width: "", height: "" },
      clientWidth: 0,
      clientHeight: 0,
      parentElement: { getBoundingClientRect: () => ({ width: 390, height: 844 }) },
      getBoundingClientRect: () => ({ width: 0, height: 0 })
    };
    const fit = createParentFit(canvas, { width: false, height: true, box: () => ({ width: 0, height: 0 }) });
    expect(fit.measure(960, 540)).toMatchObject({ cssHeight: 844, ownHeight: false });
  });

  it("a phone turned to portrait after mount: the resize check switches the height to the page's CSS", () => {
    vi.stubGlobal("getComputedStyle", () => zeroStyle);
    const portrait = (p: { width: number; height: number }) => (p.width < p.height ? p.height - 196 : p.height);
    const { canvas, parent, box } = fakeCanvas({ parent: { width: 844, height: 390 }, sheet: { height: portrait } });
    const el = canvas as unknown as HTMLCanvasElement;
    configureCanvas(el, 1, true, { width: 1, height: 1 });
    expect(ownSizedCanvasAxes(el)).toEqual({ width: false, height: false });
    expect(canvas.style.height).toBe("390px");
    parent.width = 390; parent.height = 844;
    canvas.style.width = "390px"; // what the width fit writes
    expect(refreshOwnSizedAxes(el)).toEqual({ width: false, height: true });
    expect(canvas.style.height).toBe("");
    expect(box().height).toBe(648);
    expect(canvas.style.width).toBe("390px");
  });

  it("the resize check leaves an auto-sized canvas on the parent fit and restores its inline size", () => {
    vi.stubGlobal("getComputedStyle", () => zeroStyle);
    const { canvas, parent } = fakeCanvas({ parent: { width: 800, height: 600 }, sheet: {} });
    const el = canvas as unknown as HTMLCanvasElement;
    configureCanvas(el, 1, true, { width: 1, height: 1 });
    parent.width = 1000; parent.height = 700;
    expect(refreshOwnSizedAxes(el)).toEqual({ width: false, height: false });
    expect([canvas.style.width, canvas.style.height]).toEqual(["800px", "600px"]);
  });

  it("a second app on the same canvas probes the page's CSS, not the pixel size the first app wrote", () => {
    vi.stubGlobal("getComputedStyle", () => zeroStyle);
    const { canvas, parent } = fakeCanvas({ parent: { width: 800, height: 600 }, sheet: {} });
    const el = canvas as unknown as HTMLCanvasElement;
    configureCanvas(el, 1, true, { width: 1, height: 1 });
    parent.width = 1200; parent.height = 900;
    configureCanvas(el, 1, true, { width: 1, height: 1 });
    expect(ownSizedCanvasAxes(el)).toEqual({ width: false, height: false });
    expect([canvas.width, canvas.height]).toEqual([1200, 900]);
  });
});
