import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installBlackFrameGuard } from "../../../packages/debug/src/safety/index";

/**
 * Simulated browser whose WebGL canvas behaves like one created without preserveDrawingBuffer: its pixels exist only in the
 * task that drew them and read as zeros anywhere else. The page has several animation-frame callbacks per frame (a HUD
 * updater that never draws, then the game loop that does), the pattern of the real showcase games.
 */
describe("black-frame guard samples in the task that drew", () => {
  let replace: ReturnType<typeof vi.fn>;
  let store: Record<string, string>;
  let nowMs = 0;
  let buffer: "empty" | "lit" | "black" = "empty";
  let callbacks: Array<(t: number) => void> = [];
  let microtasks: Array<() => void> = [];

  class FakeGL {
    constructor(public canvas: unknown) {}
    drawElements(): void { /* the draw itself: the fake canvas content is set by the scene */ }
    bindFramebuffer(): void {}
    getExtension(): unknown { return null; }
  }
  const proto = FakeGL.prototype as unknown as Record<string, unknown>;
  const original = { drawElements: proto.drawElements, bindFramebuffer: proto.bindFramebuffer, getExtension: proto.getExtension };

  const world = { width: 800, height: 600 };
  let gl: FakeGL;

  const setup = (search: string): void => {
    replace = vi.fn();
    store = {};
    nowMs = 0;
    buffer = "empty";
    callbacks = [];
    microtasks = [];
    const probe = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => undefined,
        getImageData: () => ({ data: new Uint8Array(16 * 16 * 4).map((_, i) => (i % 4 === 3 ? 255 : buffer === "lit" ? 90 : 0)) })
      })
    };
    vi.stubGlobal("performance", { now: () => nowMs });
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } });
    vi.stubGlobal("location", { href: `https://x.test/apps/g/${search}`, pathname: "/apps/g/", search, replace });
    vi.stubGlobal("document", { hidden: false, createElement: () => probe, readyState: "complete", querySelectorAll: (selector: string) => (selector === "canvas" ? [world] : []) });
    vi.stubGlobal("window", { requestAnimationFrame: (cb: (t: number) => void) => { callbacks.push(cb); return callbacks.length; } });
    gl = new FakeGL(world);
  };

  /** One browser frame: the buffer was cleared by the previous composite; each callback runs, then its microtasks. */
  const runFrame = (scene: "lit" | "black"): void => {
    nowMs += 100;
    buffer = "empty";
    const batch = callbacks;
    callbacks = [];
    for (const cb of batch) {
      cb(nowMs);
      while (microtasks.length) microtasks.shift()!();
    }
    void scene;
  };

  /** Registers a HUD loop (never draws) and a game loop (draws `scene`) the way the games do, through the possibly wrapped rAF. */
  const startLoops = (scene: "lit" | "black", drawEvery = 1): void => {
    const win = (globalThis as unknown as { window: { requestAnimationFrame: (cb: (t: number) => void) => number } }).window;
    let frameNo = 0;
    const hud = (): void => { win.requestAnimationFrame(hud); };
    const game = (): void => {
      win.requestAnimationFrame(game);
      frameNo += 1;
      if (frameNo % drawEvery !== 0) return;
      buffer = scene;
      gl.drawElements();
    };
    win.requestAnimationFrame(hud);
    win.requestAnimationFrame(game);
  };

  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => {
    vi.unstubAllGlobals();
    proto.drawElements = original.drawElements;
    proto.bindFramebuffer = original.bindFramebuffer;
    proto.getExtension = original.getExtension;
  });

  const install = (extra: Record<string, unknown> = {}): void => {
    installBlackFrameGuard({ fast: true, tap: { prototypes: [FakeGL.prototype], enqueue: (fn: () => void) => microtasks.push(fn) }, ...extra } as never);
  };

  it("a healthy game whose HUD callbacks run without drawing is never reloaded (draw sampling)", () => {
    setup("");
    install();
    startLoops("lit");
    for (let i = 0; i < 200; i += 1) runFrame("lit");
    expect(replace).not.toHaveBeenCalled();
    const heal = (globalThis as unknown as { window: { __AURA3D_HEAL__?: { observation?: () => { samples: number; blackSamples: number } } } }).window.__AURA3D_HEAL__;
    expect(heal?.observation?.().samples).toBeGreaterThan(5);
    expect(heal?.observation?.().blackSamples).toBe(0);
  });

  it("a scene that draws but outputs black reloads exactly once (draw sampling)", () => {
    setup("");
    install();
    startLoops("black");
    for (let i = 0; i < 200; i += 1) runFrame("black");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(String(replace.mock.calls[0]![0])).toContain("a3d-qr=game%2C-vfxFog");
  });

  it("documents the old failure: sampling after every animation-frame callback reads an empty buffer in the HUD callback and misfires", () => {
    setup("");
    install({ sampling: "raf" });
    startLoops("lit", 4);
    for (let i = 0; i < 200; i += 1) runFrame("lit");
    expect(replace.mock.calls.length, "raf sampling judged frames from callbacks that never drew").toBeGreaterThan(0);
  });

  it("a healthy game that draws less often than it runs animation-frame callbacks is not reloaded (draw sampling)", () => {
    setup("");
    install();
    startLoops("lit", 4);
    for (let i = 0; i < 400; i += 1) runFrame("lit");
    expect(replace).not.toHaveBeenCalled();
  });

  it("heal=0 and an author-supplied a3d-qr still disable it", () => {
    for (const search of ["?heal=0", "?a3d-qr=game,post"]) {
      setup(search);
      install();
      startLoops("black");
      for (let i = 0; i < 200; i += 1) runFrame("black");
      expect(replace).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    }
  });
});
