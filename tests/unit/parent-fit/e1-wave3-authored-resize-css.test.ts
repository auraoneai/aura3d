// Lane E1 wave 3 (handoff from G22, Saltwind Highway resize bands): with `resize: false` the engine does not pin the canvas's CSS
// size in pixels, so a page that grows after load grows the canvas, and the game's own backing-store resize reaches the renderer.
import { afterEach, describe, expect, it, vi } from "vitest";
import { authoredBackingResize, configureCanvas } from "../../../packages/engine/src/agent-api/app/canvas";

/** A canvas styled `width: 100%; height: 100%` inside a fixed parent (the viewport). Inline style beats the sheet. */
function fullPageCanvas(parent: { width: number; height: number }) {
  const style = { width: "", height: "", display: "" };
  const backing = { width: 300, height: 150 };
  const axis = (inline: string, parentSize: number): number => {
    if (inline.endsWith("px")) return parseFloat(inline);
    if (inline.endsWith("%")) return (parseFloat(inline) / 100) * parentSize;
    return parentSize; // the sheet's 100%
  };
  const box = () => ({ width: axis(style.width, parent.width), height: axis(style.height, parent.height) });
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
    parentElement: { getBoundingClientRect: () => ({ ...parent }), get clientWidth() { return parent.width; }, get clientHeight() { return parent.height; } },
    getBoundingClientRect: () => box()
  };
  return { canvas, box };
}

const zeroStyle = { paddingLeft: "0", paddingRight: "0", paddingTop: "0", paddingBottom: "0", borderLeftWidth: "0", borderRightWidth: "0", borderTopWidth: "0", borderBottomWidth: "0" };

afterEach(() => { vi.unstubAllGlobals(); });

describe("E1 wave 3: resize:false keeps the canvas's CSS size fluid (G22 handoff)", () => {
  it("a game that sizes its own backing store fills the page after the window grows", () => {
    vi.stubGlobal("getComputedStyle", () => zeroStyle);
    const parent = { width: 1280, height: 720 };
    const { canvas, box } = fullPageCanvas(parent);
    // The game's sizeCanvas() before createAuraApp: backing = clientWidth x clientHeight.
    canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight;
    configureCanvas(canvas as unknown as HTMLCanvasElement, 1, false, { width: 1, height: 1 });
    expect([canvas.style.width, canvas.style.height]).toEqual(["100%", "100%"]);
    expect([canvas.width, canvas.height]).toEqual([1280, 720]);
    const synced = { width: canvas.width, height: canvas.height };

    parent.width = 1440; parent.height = 900;
    expect(box()).toEqual({ width: 1440, height: 900 });
    // The game's window resize listener, then the frame loop's authored-backing check.
    canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight;
    expect(authoredBackingResize(false, canvas, synced)).toEqual({ width: 1440, height: 900 });
  });

  it("resize:true still writes the measured pixel size (the engine re-measures on resize)", () => {
    vi.stubGlobal("getComputedStyle", () => zeroStyle);
    const { canvas } = fullPageCanvas({ width: 1280, height: 720 });
    configureCanvas(canvas as unknown as HTMLCanvasElement, 1, true, { width: 1, height: 1 });
    expect([canvas.style.width, canvas.style.height]).toEqual(["1280px", "720px"]);
  });

  it("resize:false leaves a page's own inline size alone", () => {
    vi.stubGlobal("getComputedStyle", () => zeroStyle);
    const { canvas } = fullPageCanvas({ width: 1280, height: 720 });
    canvas.style.width = "100vw"; canvas.style.height = "100vh";
    configureCanvas(canvas as unknown as HTMLCanvasElement, 1, false, { width: 1, height: 1 });
    expect([canvas.style.width, canvas.style.height]).toEqual(["100vw", "100vh"]);
  });
});
