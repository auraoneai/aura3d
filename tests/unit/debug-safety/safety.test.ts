import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_HEAL_LADDER,
  createBlackFrameWatch,
  formatEngineSection,
  healParams,
  healRungName,
  healStage,
  installSafetyNet,
  isBlackFrame,
  resolveQualitySwitches
} from "../../../packages/debug/src/index";

const black = new Uint8ClampedArray(16 * 16 * 4).map((_, i) => (i % 4 === 3 ? 255 : 0));
const lit = new Uint8ClampedArray(16 * 16 * 4).map((_, i) => (i % 4 === 3 ? 255 : 90));

function memoryStorage(initial?: string) {
  const map = new Map<string, string>(initial === undefined ? [] : [["aura3d-safety-heal-stage", initial]]);
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
}

describe("isBlackFrame", () => {
  it("accepts only near-black texels and ignores alpha", () => {
    expect(isBlackFrame(black)).toBe(true);
    expect(isBlackFrame(lit)).toBe(false);
    const oneBright = new Uint8ClampedArray(black);
    oneBright[8] = 40;
    expect(isBlackFrame(oneBright)).toBe(false);
    expect(isBlackFrame(new Uint8Array(0))).toBe(false);
  });
});

describe("heal ladder", () => {
  it("is cumulative and named", () => {
    expect(healParams(0)).toEqual({});
    expect(healParams(1)).toEqual({ aa: "0" });
    expect(healParams(2)).toEqual({ aa: "0", post: "0" });
    expect(healParams(DEFAULT_HEAL_LADDER.length)).toMatchObject({ aa: "0", post: "0", tm: "aces", env: "0", shadow: "0", quality: "low", sky: "1" });
    expect(healRungName(0)).toBe("full");
    expect(healRungName(2)).toBe("no-post");
    expect(healRungName(99)).toBe("low-quality");
  });
  it("reads a bounded stage from storage", () => {
    expect(healStage(memoryStorage("3"))).toBe(3);
    expect(healStage(memoryStorage("-1"))).toBe(0);
    expect(healStage(memoryStorage("99"))).toBe(0);
    expect(healStage(memoryStorage("x"))).toBe(0);
    expect(healStage(undefined)).toBe(0);
  });
});

describe("resolveQualitySwitches", () => {
  it("defaults to everything on", () => {
    const s = resolveQualitySwitches({ search: "" });
    expect(s).toMatchObject({ post: true, shadow: true, env: true, sky: true, aa: true, heal: true, diag: false, quality: "default", toneMapping: "default" });
  });
  it("parses every switch", () => {
    const s = resolveQualitySwitches({ search: "?post=0&shadow=0&env=0&sky=0&aa=0&quality=low&tm=aces&heal=0&diag=1" });
    expect(s).toMatchObject({ post: false, shadow: false, env: false, sky: false, aa: false, heal: false, diag: true, quality: "low", toneMapping: "aces" });
  });
  it("merges ladder parameters under explicit ones", () => {
    const s = resolveQualitySwitches({ search: "?post=1", healStage: 2 });
    expect(s.post).toBe(true);
    expect(s.aa).toBe(false);
    expect(s.params).toMatchObject({ post: "1", aa: "0" });
  });
});

describe("createBlackFrameWatch", () => {
  const canvas = {} as HTMLCanvasElement;
  const make = (probe: () => Uint8ClampedArray, storage = memoryStorage(), enabled = true) => {
    const navigate = vi.fn();
    const log = vi.fn();
    const watch = createBlackFrameWatch(canvas, {
      enabled, fastFrames: 4, storage, readProbe: probe, navigate, log, currentUrl: () => "https://x.test/play/?diag=1"
    });
    return { watch, navigate, log, storage };
  };
  const run = (watch: { sample(n: number): void }, frames: number) => { for (let i = 1; i <= frames; i += 1) watch.sample(i); };

  it("reloads one rung down after sustained black frames and records the rung", () => {
    const { watch, navigate, storage, log } = make(() => black);
    run(watch, 40);
    expect(navigate).toHaveBeenCalledTimes(1);
    const url = new URL(navigate.mock.calls[0]![0] as string);
    expect(url.searchParams.get("aa")).toBe("0");
    expect(url.searchParams.get("diag")).toBe("1");
    expect(storage.map.get("aura3d-safety-heal-stage")).toBe("1");
    expect(watch.escalated).toBe(true);
    expect(log).toHaveBeenCalledWith("SAFETY_BLACK_FRAME", expect.stringContaining("no-aa"));
  });
  it("does nothing for lit frames, when disabled, or when frames flicker", () => {
    const a = make(() => lit);
    run(a.watch, 40);
    expect(a.navigate).not.toHaveBeenCalled();
    const b = make(() => black, memoryStorage(), false);
    run(b.watch, 40);
    expect(b.navigate).not.toHaveBeenCalled();
    let n = 0;
    const c = make(() => (n++ % 2 === 0 ? black : lit));
    run(c.watch, 60);
    expect(c.navigate).not.toHaveBeenCalled();
  });
  it("continues down the ladder across reloads and stops at the last rung", () => {
    const mid = make(() => black, memoryStorage("2"));
    expect(mid.watch.stage).toBe(2);
    expect(mid.watch.rung).toBe("no-post");
    expect(mid.log).toHaveBeenCalledWith("SAFETY_COMPAT_MODE", expect.stringContaining("rung 2"));
    run(mid.watch, 40);
    expect(new URL(mid.navigate.mock.calls[0]![0] as string).searchParams.get("tm")).toBe("aces");
    const last = make(() => black, memoryStorage(String(DEFAULT_HEAL_LADDER.length)));
    run(last.watch, 80);
    expect(last.navigate).not.toHaveBeenCalled();
  });
  it("survives a throwing probe", () => {
    const { watch, navigate } = make(() => { throw new Error("tainted"); });
    run(watch, 40);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("installSafetyNet", () => {
  it("is inert unless safety is set, but still parses switches", () => {
    const net = installSafetyNet({ safety: false, search: "?post=0&diag=1" });
    expect(net.switches.post).toBe(false);
    expect(net.report()).toMatchObject({ enabled: false, panel: false, stage: 0, rung: "full" });
    net.sample(100);
    net.dispose();
    expect((globalThis as { __AURA_SAFETY__?: unknown }).__AURA_SAFETY__).toBeUndefined();
  });
  it("reports its rung and exposes __AURA_SAFETY__ while installed", () => {
    const storage = memoryStorage("1");
    const net = installSafetyNet({
      safety: { panel: false, watch: { storage, readProbe: () => lit, navigate: vi.fn(), log: vi.fn(), currentUrl: () => "https://x.test/" } },
      canvas: {} as HTMLCanvasElement,
      search: ""
    });
    expect(net.report()).toMatchObject({ enabled: true, stage: 1, rung: "no-aa", escalated: false });
    expect(net.switches.aa).toBe(false);
    expect((globalThis as { __AURA_SAFETY__?: () => unknown }).__AURA_SAFETY__?.()).toMatchObject({ rung: "no-aa" });
    net.dispose();
    expect((globalThis as { __AURA_SAFETY__?: unknown }).__AURA_SAFETY__).toBeUndefined();
  });
  it("heals through the handle when the canvas stays black", () => {
    const navigate = vi.fn();
    const net = installSafetyNet({
      safety: { panel: false, watch: { fastFrames: 4, storage: memoryStorage(), readProbe: () => black, navigate, log: vi.fn(), currentUrl: () => "https://x.test/" } },
      canvas: {} as HTMLCanvasElement,
      search: ""
    });
    for (let i = 1; i <= 40; i += 1) net.sample(i);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(net.report().escalated).toBe(true);
    net.dispose();
  });
  it("honours ?heal=0", () => {
    const navigate = vi.fn();
    const net = installSafetyNet({
      safety: { panel: false, watch: { fastFrames: 4, storage: memoryStorage(), readProbe: () => black, navigate, log: vi.fn(), currentUrl: () => "https://x.test/" } },
      canvas: {} as HTMLCanvasElement,
      search: "?heal=0"
    });
    for (let i = 1; i <= 40; i += 1) net.sample(i);
    expect(navigate).not.toHaveBeenCalled();
    net.dispose();
  });
});

describe("formatEngineSection", () => {
  it("summarises app diagnostics and canvases, and survives a throwing diagnostics()", () => {
    const text = formatEngineSection(
      { diagnostics: () => ({ backend: "webgl2", drawCalls: 123, fps: 59.6, warnings: ["POSTPROCESS_V2_UNMIGRATED"], errors: [] }) },
      [{ id: "world", width: 100, height: 50, clientWidth: 100, clientHeight: 50 }]
    );
    expect(text).toContain("backend=webgl2 drawCalls=123 fps=60 warn:POSTPROCESS_V2_UNMIGRATED");
    expect(text).toContain("world 100x50 (css 100x50)");
    expect(formatEngineSection({ diagnostics: () => { throw new Error("x"); } }, [])).toContain("diagnostics() threw");
    expect(formatEngineSection(undefined, [])).toContain("no diagnostics exposed");
  });
});
