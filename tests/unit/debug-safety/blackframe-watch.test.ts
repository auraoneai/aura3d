import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyseFrame,
  createBlackFrameWatch,
  findWorldCanvas,
  hasVisibleLoadingOverlay,
  isBlackFrame,
  type BlackFrameWatchOptions
} from "../../../packages/debug/src/safety/index";

const W = 48;
const H = 32;
const TEXELS = W * H;

/** RGBA probe of `TEXELS` texels: every texel (r,g,b), the first `lit` texels bright. */
function probe(rgb: [number, number, number], lit = 0): Uint8Array {
  const data = new Uint8Array(TEXELS * 4);
  for (let i = 0; i < TEXELS; i++) {
    const bright = i < lit;
    data[i * 4] = bright ? 200 : rgb[0];
    data[i * 4 + 1] = bright ? 180 : rgb[1];
    data[i * 4 + 2] = bright ? 160 : rgb[2];
    data[i * 4 + 3] = 255;
  }
  return data;
}

class Rig {
  t = 0;
  frameMs: number;
  frames = 0;
  data = probe([0, 0, 0]);
  navigated: string[] = [];
  logs: Array<[string, string]> = [];
  store: Record<string, string> = {};
  ready = true;
  drawCalls: number | undefined = undefined;
  hidden = false;
  probeCalls = 0;
  constructor(frameMs = 16) {
    this.frameMs = frameMs;
  }
  options(extra: Partial<BlackFrameWatchOptions> = {}): BlackFrameWatchOptions {
    return {
      enabled: true,
      now: () => this.t,
      isHidden: () => this.hidden,
      isReady: () => this.ready,
      getDrawCalls: () => this.drawCalls,
      readProbe: () => {
        this.probeCalls += 1;
        return this.data;
      },
      storage: { getItem: (k) => this.store[k] ?? null, setItem: (k, v) => void (this.store[k] = v) },
      currentUrl: () => "https://x.test/apps/g/?z=1",
      navigate: (url) => void this.navigated.push(url),
      log: (code, message) => void this.logs.push([code, message]),
      ...extra
    };
  }
  canvas = {} as HTMLCanvasElement;
  run(watch: { sample(): void }, frames: number): void {
    for (let i = 0; i < frames; i++) {
      this.t += this.frameMs;
      this.frames += 1;
      watch.sample();
    }
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("black-frame watch: truly black output", () => {
  it("fires once after readiness, enough frames and the time window, then never again", () => {
    const rig = new Rig(16);
    const watch = createBlackFrameWatch(rig.canvas, rig.options());
    rig.run(watch, 150); // 2.4 s of black: inside the 4 s window
    expect(rig.navigated).toHaveLength(0);
    rig.run(watch, 400);
    expect(rig.navigated).toHaveLength(1);
    expect(rig.navigated[0]).toContain("aa=0");
    expect(rig.navigated[0]).toContain("z=1");
    expect(rig.store["aura3d-safety-heal-stage"]).toBe("1");
    expect(rig.store["aura3d-safety-heal-stage:reason"]).toMatch(/black for \d+ samples/);
    expect(rig.logs.some(([code]) => code === "SAFETY_BLACK_FRAME")).toBe(true);
    rig.run(watch, 2000);
    expect(rig.navigated).toHaveLength(1);
    expect(watch.escalated).toBe(true);
    expect(watch.observation().reason).toMatch(/lit 0\/1536/);
  });

  it("persists the reason so the next page load can say why it is on a lower rung", () => {
    const rig = new Rig();
    rig.store["aura3d-safety-heal-stage"] = "1";
    rig.store["aura3d-safety-heal-stage:reason"] = "black for 12 samples / 4100 ms";
    const watch = createBlackFrameWatch(rig.canvas, rig.options());
    expect(watch.stage).toBe(1);
    expect(watch.rung).toBe("no-aa");
    expect(rig.logs[0]![0]).toBe("SAFETY_COMPAT_MODE");
    expect(rig.logs[0]![1]).toContain("black for 12 samples / 4100 ms");
    expect(watch.observation().reason).toBe("black for 12 samples / 4100 ms");
  });

  it("does nothing when disabled and stops at the last rung", () => {
    const rig = new Rig();
    createBlackFrameWatch(rig.canvas, rig.options({ enabled: false }));
    const off = createBlackFrameWatch(rig.canvas, rig.options({ enabled: false }));
    rig.run(off, 2000);
    expect(rig.navigated).toHaveLength(0);
    const last = new Rig();
    last.store["aura3d-safety-heal-stage"] = "6";
    const watch = createBlackFrameWatch(last.canvas, last.options());
    last.run(watch, 3000);
    expect(last.navigated).toHaveLength(0);
  });

  it("does not store a rung when no URL can be built", () => {
    const rig = new Rig();
    const watch = createBlackFrameWatch(rig.canvas, rig.options({ buildUrl: () => null }));
    rig.run(watch, 1000);
    expect(rig.navigated).toHaveLength(0);
    expect(rig.store["aura3d-safety-heal-stage"]).toBeUndefined();
    expect(watch.escalated).toBe(false);
  });
});

describe("black-frame watch: dark but valid scenes", () => {
  it("never fires for a dim lit scene (every texel above the black threshold)", () => {
    const rig = new Rig();
    rig.data = probe([6, 8, 10]);
    const watch = createBlackFrameWatch(rig.canvas, rig.options());
    rig.run(watch, 3000);
    expect(rig.navigated).toHaveLength(0);
    expect(watch.observation().lastStats?.litFraction).toBe(1);
  });

  it("never fires for a mostly dark frame with real content (30 percent lit)", () => {
    const rig = new Rig();
    rig.data = probe([0, 0, 0], Math.round(TEXELS * 0.3));
    const watch = createBlackFrameWatch(rig.canvas, rig.options());
    rig.run(watch, 3000);
    expect(rig.navigated).toHaveLength(0);
  });

  it("relaxes to occasional sampling once lit frames are confirmed", () => {
    const rig = new Rig();
    rig.data = probe([40, 40, 40]);
    const watch = createBlackFrameWatch(rig.canvas, rig.options());
    rig.run(watch, 1000);
    expect(watch.observation().healthy).toBe(true);
    expect(rig.probeCalls).toBeLessThan(1000 / 4 / 3);
  });
});

describe("black-frame watch: HUD drawn into the canvas", () => {
  it("still treats a frame as black when only a stray texel is lit", () => {
    const rig = new Rig();
    rig.data = probe([0, 0, 0], 1); // 1 of 1536 texels = 0.07 percent
    const watch = createBlackFrameWatch(rig.canvas, rig.options());
    rig.run(watch, 600);
    expect(rig.navigated).toHaveLength(1);
  });

  it("does not treat a frame with a visible HUD strip (5 percent lit) as black", () => {
    const rig = new Rig();
    rig.data = probe([0, 0, 0], Math.round(TEXELS * 0.05));
    const watch = createBlackFrameWatch(rig.canvas, rig.options());
    rig.run(watch, 3000);
    expect(rig.navigated).toHaveLength(0);
  });

  it("ignores minimap, HUD and overlay canvases when choosing the world canvas", () => {
    const canvases = [
      { id: "minimap", className: "", width: 800, height: 800 },
      { id: "", className: "hud-canvas", width: 1600, height: 900 },
      { id: "world", className: "", width: 1200, height: 800 },
      { id: "tiny", className: "", width: 64, height: 64 }
    ];
    const root = { querySelectorAll: () => canvases } as unknown as Pick<Document, "querySelectorAll">;
    expect((findWorldCanvas(root) as unknown as { id: string }).id).toBe("world");
  });

  it("analyseFrame and isBlackFrame agree on the strict default", () => {
    expect(analyseFrame(probe([0, 0, 0], 3)).lit).toBe(3);
    expect(isBlackFrame(probe([0, 0, 0], 3))).toBe(false);
    expect(isBlackFrame(probe([0, 0, 0], 3), 0.01)).toBe(true);
    expect(isBlackFrame([])).toBe(false);
  });
});

describe("black-frame watch: slow loads", () => {
  it("never judges while the app is not ready, however many frames pass", () => {
    const rig = new Rig();
    rig.ready = false;
    const watch = createBlackFrameWatch(rig.canvas, rig.options());
    rig.run(watch, 6000);
    expect(rig.navigated).toHaveLength(0);
    expect(rig.probeCalls).toBe(0);
    expect(watch.observation().skipped.notReady).toBe(6000);
    expect(watch.observation().readyAtCall).toBeNull();
  });

  it("counts frames only from the moment the app became ready", () => {
    const rig = new Rig();
    rig.ready = false;
    const watch = createBlackFrameWatch(rig.canvas, rig.options({ fastFrames: 10, minBlackMs: 0 }));
    rig.run(watch, 500);
    rig.ready = true;
    rig.run(watch, 8);
    expect(rig.navigated).toHaveLength(0);
    rig.run(watch, 40);
    expect(rig.navigated).toHaveLength(1);
    expect(watch.observation().readyAtCall).toBe(501);
  });

  it("resets the black streak when readiness is lost and regained", () => {
    const rig = new Rig();
    const watch = createBlackFrameWatch(rig.canvas, rig.options({ fastFrames: 10 }));
    rig.run(watch, 14);
    expect(watch.observation().consecutiveBlack).toBeGreaterThan(0);
    rig.ready = false;
    rig.run(watch, 2);
    expect(watch.observation().consecutiveBlack).toBe(0);
    expect(rig.navigated).toHaveLength(0);
  });

  it("treats a visible loading overlay, an unloaded document and in-flight fetches as not ready", () => {
    const visible = { hidden: false, classList: { contains: () => false } };
    const done = { hidden: false, classList: { contains: (name: string) => name === "done" } };
    const doc = (elements: unknown[]) => ({ readyState: "complete", querySelectorAll: () => elements });
    expect(hasVisibleLoadingOverlay(doc([visible]) as unknown as Document)).toBe(true);
    expect(hasVisibleLoadingOverlay(doc([done]) as unknown as Document)).toBe(false);
    expect(hasVisibleLoadingOverlay(doc([]) as unknown as Document)).toBe(false);

    vi.stubGlobal("document", { readyState: "loading", querySelectorAll: () => [] });
    const rig = new Rig();
    const loading = createBlackFrameWatch(rig.canvas, { ...rig.options(), isReady: undefined as never });
    rig.run(loading, 3000);
    expect(rig.navigated).toHaveLength(0);

    vi.stubGlobal("document", { readyState: "complete", querySelectorAll: () => [] });
    vi.stubGlobal("__aura3dInFlightByteFetches", 3);
    const rig2 = new Rig();
    const fetching = createBlackFrameWatch(rig2.canvas, { ...rig2.options(), isReady: undefined as never });
    rig2.run(fetching, 3000);
    expect(rig2.navigated).toHaveLength(0);
    vi.stubGlobal("__aura3dInFlightByteFetches", 0);
    rig2.run(fetching, 600);
    expect(rig2.navigated).toHaveLength(1);
  });

  it("scales the black window with the measured frame time (slow CPU renderers wait longer)", () => {
    const rig = new Rig(2000); // 2 s per frame
    const watch = createBlackFrameWatch(rig.canvas, rig.options({ blackFramesBudget: 200 }));
    rig.run(watch, 150); // 300 s of black, window is max(4 s, 2 s * 200) = 400 s after the first black sample (frame 32)
    expect(rig.navigated).toHaveLength(0);
    rig.run(watch, 100);
    expect(rig.navigated).toHaveLength(1);
    expect(watch.observation().medianFrameMs).toBe(2000);
  });
});

describe("black-frame watch: engine and page state", () => {
  it("does not judge frames the engine did not draw, and judges once it draws", () => {
    const rig = new Rig();
    rig.drawCalls = 0;
    const watch = createBlackFrameWatch(rig.canvas, rig.options());
    rig.run(watch, 2000);
    expect(rig.navigated).toHaveLength(0);
    expect(watch.observation().skipped.noDrawCalls).toBeGreaterThan(0);
    rig.drawCalls = 123;
    rig.run(watch, 600);
    expect(rig.navigated).toHaveLength(1);
    expect(watch.observation().reason).toMatch(/drawCalls 123/);
  });

  it("never fires while the page is hidden", () => {
    const rig = new Rig();
    rig.hidden = true;
    const watch = createBlackFrameWatch(rig.canvas, rig.options());
    rig.run(watch, 3000);
    expect(rig.navigated).toHaveLength(0);
    expect(watch.observation().skipped.hidden).toBe(3000);
  });
});

describe("black-frame watch: HiDPI canvases", () => {
  it("samples a fixed nearest-neighbour grid regardless of the canvas size", () => {
    const calls: unknown[][] = [];
    const ctx = {
      imageSmoothingEnabled: true,
      drawImage: (...args: unknown[]) => void calls.push(args),
      getImageData: (...args: unknown[]) => {
        calls.push(["getImageData", ...args]);
        return { data: probe([0, 0, 0]) };
      }
    };
    const probeCanvas = { width: 0, height: 0, getContext: () => ctx };
    vi.stubGlobal("document", { readyState: "complete", hidden: false, querySelectorAll: () => [], createElement: () => probeCanvas });
    const rig = new Rig();
    const hidpi = { width: 3566, height: 2292 } as HTMLCanvasElement;
    const { readProbe: _unused, ...rest } = rig.options({ fastFrames: 4 });
    void _unused;
    const watch = createBlackFrameWatch(hidpi, rest as BlackFrameWatchOptions);
    rig.run(watch, 12);
    expect(ctx.imageSmoothingEnabled).toBe(false);
    expect(probeCanvas.width).toBe(W);
    expect(probeCanvas.height).toBe(H);
    expect(calls.find((c) => c[0] === hidpi)).toEqual([hidpi, 0, 0, W, H]);
    expect(calls.find((c) => c[0] === "getImageData")).toEqual(["getImageData", 0, 0, W, H]);
    expect(rig.navigated).toHaveLength(1);
  });
});
