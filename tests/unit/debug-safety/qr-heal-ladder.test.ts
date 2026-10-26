import { describe, expect, it } from "vitest";
import { QR_HEAL_LADDER as HEAL_LADDER, isBlackFrame, qrHealRungName as healRungName, qrHealStage as healStage, qrHealUrl as healUrl } from "../../../packages/debug/src/index";

describe("black-frame guard QR ladder", () => {
  it("detects an all-black frame and ignores any lit texel", () => {
    expect(isBlackFrame(new Uint8Array(16 * 4).map((_, i) => (i % 4 === 3 ? 255 : 0)))).toBe(true);
    const lit = new Uint8Array(16 * 4);
    lit[4 * 7] = 40;
    expect(isBlackFrame(lit)).toBe(false);
    expect(isBlackFrame([])).toBe(false);
  });

  it("parses the stored rung defensively", () => {
    expect(healStage(null)).toBe(0);
    expect(healStage("2")).toBe(2);
    expect(healStage("99")).toBe(0);
    expect(healStage("-1")).toBe(0);
    expect(healStage("x")).toBe(0);
    expect(healRungName(0)).toBe("full");
    expect(healRungName(HEAL_LADDER.length)).toBe("legacy-compile");
  });

  it("builds a ladder of engine a3d-qr lists that ends at the old blanket pin", () => {
    expect(healUrl("https://x.test/apps/g/", 1)).toBe("https://x.test/apps/g/?a3d-qr=game%2C-vfxFog");
    expect(healUrl("https://x.test/apps/g/", 3)).toBe("https://x.test/apps/g/?a3d-qr=game%2C-vfxFog%2C-post%2C-compiler");
    expect(healUrl("https://x.test/apps/g/", 0)).toBeNull();
    expect(healUrl("https://x.test/apps/g/", HEAL_LADDER.length + 1)).toBeNull();
  });

  it("respects an author-supplied a3d-qr but may replace its own earlier rung", () => {
    expect(healUrl("https://x.test/g/?a3d-qr=game,post", 1)).toBeNull();
    expect(healUrl("https://x.test/g/?a3d-qr=game%2C-vfxFog&z=1", 2, true)).toBe("https://x.test/g/?a3d-qr=game%2C-vfxFog%2C-post&z=1");
  });
});

import { afterEach, beforeEach, vi } from "vitest";
import { installBlackFrameGuard } from "../../../packages/debug/src/index";

describe("installBlackFrameGuard (simulated browser)", () => {
  let nextFrame: (() => void) | null = null;
  let replace: ReturnType<typeof vi.fn>;
  let store: Record<string, string>;
  let black = true;
  let nowMs = 0;
  let bootVisible = false;

  const setup = (search: string): void => {
    replace = vi.fn();
    store = {};
    black = true;
    nowMs = 0;
    bootVisible = false;
    nextFrame = null;
    const probe = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => undefined,
        getImageData: () => ({ data: new Uint8Array(16 * 16 * 4).map((_, i) => (i % 4 === 3 ? 255 : black ? 0 : 90)) })
      })
    };
    const world = { width: 800, height: 600 };
    vi.stubGlobal("performance", { now: () => nowMs });
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } });
    vi.stubGlobal("location", { href: `https://x.test/apps/g/${search}`, pathname: "/apps/g/", search, replace });
    vi.stubGlobal("document", {
      hidden: false,
      createElement: () => probe,
      readyState: "complete",
      querySelectorAll: (selector: string) =>
        selector === "canvas" ? [world, { width: 160, height: 160 }] : selector.includes("#boot") && bootVisible ? [{ hidden: false, classList: { contains: () => false } }] : []
    });
    const win: Record<string, unknown> = {
      requestAnimationFrame: (cb: (t: number) => void) => { nextFrame = () => cb(0); return 1; }
    };
    vi.stubGlobal("window", win);
  };

  const runFrames = (count: number): void => {
    for (let i = 0; i < count; i++) {
      nowMs += 100;
      const frame = nextFrame;
      nextFrame = null;
      frame?.();
    }
  };

  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("reloads one rung down after a sustained black frame, using the engine a3d-qr list", () => {
    setup("");
    installBlackFrameGuard({ fast: true, sampling: "raf" });
    const win = (globalThis as unknown as { window: { requestAnimationFrame: (cb: (t: number) => void) => number; __AURA3D_HEAL__?: { rung: number } } }).window;
    win.requestAnimationFrame(() => win.requestAnimationFrame(() => undefined));
    // Re-arm the loop like a game would, then run frames.
    const loop = (): void => { win.requestAnimationFrame(loop); };
    win.requestAnimationFrame(loop);
    runFrames(60);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(String(replace.mock.calls[0]![0])).toContain("a3d-qr=game%2C-vfxFog");
    expect(store["aura3d-heal:/apps/g/"]).toBe("1");
    expect(win.__AURA3D_HEAL__?.rung).toBe(0);
  });

  it("does nothing while frames are lit, when heal=0, or when the URL carries its own a3d-qr", () => {
    for (const [search, isBlack] of [["", false], ["?heal=0", true], ["?a3d-qr=game,post", true]] as const) {
      setup(search);
      installBlackFrameGuard({ fast: true, sampling: "raf" });
      black = isBlack;
      const win = (globalThis as unknown as { window: { requestAnimationFrame: (cb: (t: number) => void) => number } }).window;
      const loop = (): void => { win.requestAnimationFrame(loop); };
      win.requestAnimationFrame(loop);
      runFrames(80);
      expect(replace).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    }
  });

  it("continues down the ladder from the stored rung and stops at the last one", () => {
    setup("?a3d-qr=game%2C-vfxFog");
    store["aura3d-heal:/apps/g/"] = "1";
    installBlackFrameGuard({ fast: true, sampling: "raf" });
    const win = (globalThis as unknown as { window: { requestAnimationFrame: (cb: (t: number) => void) => number; __AURA3D_HEAL__?: { rung: number } } }).window;
    const loop = (): void => { win.requestAnimationFrame(loop); };
    win.requestAnimationFrame(loop);
    runFrames(60);
    expect(win.__AURA3D_HEAL__?.rung).toBe(1);
    expect(String(replace.mock.calls[0]![0])).toContain("a3d-qr=game%2C-vfxFog%2C-post");
    expect(store["aura3d-heal:/apps/g/"]).toBe("2");
  });

  it("does not reload while the loading overlay is up (slow first frame on a CPU renderer), and does once it is gone", () => {
    setup("");
    bootVisible = true;
    installBlackFrameGuard({ fast: true, sampling: "raf" });
    const win = (globalThis as unknown as { window: { requestAnimationFrame: (cb: (t: number) => void) => number; __AURA3D_HEAL__?: { observation?: () => { skipped: { notReady: number }; readyAtCall: number | null } } } }).window;
    const loop = (): void => { win.requestAnimationFrame(loop); };
    win.requestAnimationFrame(loop);
    runFrames(400);
    expect(replace).not.toHaveBeenCalled();
    expect(win.__AURA3D_HEAL__?.observation?.().skipped.notReady).toBeGreaterThan(300);
    expect(win.__AURA3D_HEAL__?.observation?.().readyAtCall).toBeNull();
    bootVisible = false;
    runFrames(60);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("never reloads a dark but valid scene", () => {
    setup("");
    black = false;
    installBlackFrameGuard({ fast: true, sampling: "raf" });
    const win = (globalThis as unknown as { window: { requestAnimationFrame: (cb: (t: number) => void) => number } }).window;
    const loop = (): void => { win.requestAnimationFrame(loop); };
    win.requestAnimationFrame(loop);
    runFrames(500);
    expect(replace).not.toHaveBeenCalled();
  });
});
