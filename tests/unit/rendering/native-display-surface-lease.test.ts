import { afterEach, describe, expect, it } from "vitest";

import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import type { RenderDevice, RenderTarget, RenderTargetDescriptor } from "../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../packages/rendering/src/Texture";
import { PostResources } from "../../../packages/rendering/src/post/PostResources";
import "../../../packages/rendering/src/lanes/prd11";
import {
  abortEncodedDisplaySurfaceWrite,
  assertEncodedDisplaySurface,
  assertEncodedDisplaySurfaceWritten,
  beginEncodedDisplaySurfaceWrite,
  isExplicitEncodedPostLease,
  issueEncodedDisplaySurface,
  markEncodedDisplaySurfaceWritten,
  type EncodedDisplaySurfaceLease
} from "../../../packages/rendering/src/output/EncodedDisplaySurface";

type Alpha = "opaque" | "straight" | "premultiplied";
type NativeTarget = RenderTarget & {
  framebuffer: object;
  drawFramebuffer: object;
  colorHandle: object;
  nativeInvalid: boolean;
};

const flags: QrFlags = { values: { A3D_QR_TIERS: true }, on: (name) => name === "A3D_QR_TIERS" };
const key = { width: 8, height: 6, format: "rgba8", samples: 1, depth: false } as const;
const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

function fixture() {
  const owned = new Set<RenderTarget>();
  const lossListeners = new Set<() => void>();
  const state: {
    frame: object | null;
    generation: number;
    colorSpace: "srgb" | "display-p3";
    alpha: Alpha | undefined;
    scoped: boolean;
    onTargetCheck?: () => void;
  } = { frame: {}, generation: 1, colorSpace: "display-p3", alpha: "opaque", scoped: true };
  let nextId = 0;
  const device = {
    kind: "webgl2" as const,
    disposed: false,
    contextLost: false,
    get activeFrameToken() { return state.frame; },
    get generation() { return state.generation; },
    onDeviceLost(listener: () => void) { lossListeners.add(listener); return () => lossListeners.delete(listener); },
    getOutputColorSpaceNegotiation() {
      return { requested: "display-p3" as const, active: state.colorSpace, supported: ["srgb", "display-p3"] as const };
    },
    getPresentationAlphaMode() { return state.alpha; },
    assertDisplayOutputScope(expected: "display-p3") {
      if (!state.scoped || state.colorSpace !== expected) throw new Error("DISPLAY_SCOPE_INVALID");
    },
    assertEncodedDisplayTarget(target: RenderTarget) {
      state.onTargetCheck?.();
      if (!owned.has(target) || target.disposed) throw new Error("FOREIGN_DISPLAY_TARGET");
    },
    createRenderTarget(desc: RenderTargetDescriptor): RenderTarget {
      const framebuffer = {};
      const texture = new Texture({ width: desc.width, height: desc.height, format: desc.format ?? "rgba8", renderAttachment: true });
      const target: NativeTarget = {
        id: ++nextId,
        label: "display-scratch",
        width: desc.width,
        height: desc.height,
        dimension: "2d",
        sampleCount: desc.sampleCount ?? 1,
        colorTexture: texture,
        framebuffer,
        drawFramebuffer: framebuffer,
        colorHandle: {},
        nativeInvalid: false,
        disposed: false,
        dispose() {
          if (this.disposed) return;
          (this as { disposed: boolean }).disposed = true;
          texture.dispose();
          owned.delete(this);
        }
      };
      owned.add(target);
      return target;
    },
    dispose(this: { disposed: boolean }) { this.disposed = true; }
  } as unknown as RenderDevice & {
    disposed: boolean;
    contextLost: boolean;
    assertEncodedDisplayTarget(target: RenderTarget): void;
  };
  const resources = new PostResources(device, flags);
  const lease = resources.acquireLease(key);
  cleanups.push(() => { resources.dispose(); device.dispose(); });
  return {
    device, resources, lease, state,
    target: lease.target as NativeTarget,
    lose() { device.contextLost = true; for (const listener of [...lossListeners]) listener(); }
  };
}

describe("encoded display surface provenance", () => {
  it("issues a frame-scoped opaque proof and publishes only a completed write", () => {
    const f = fixture();
    expect(isExplicitEncodedPostLease(f.lease, f.device)).toBe(true);
    const surface = issueEncodedDisplaySurface(f.lease, f.device, "opaque");
    expect(isExplicitEncodedPostLease(f.lease, f.device)).toBe(false);
    expect(Object.isFrozen(surface)).toBe(true);
    expect(Object.keys(surface)).toEqual([]);
    expect(assertEncodedDisplaySurface(surface, f.device, f.target, "opaque")).toEqual({
      colorSpace: "display-p3", transfer: "srgb", alphaMode: "opaque", width: 8, height: 6
    });
    expect(() => assertEncodedDisplaySurfaceWritten(surface, f.device, f.target)).toThrow(/not completed/);
    expect(() => markEncodedDisplaySurfaceWritten(surface, f.device, f.target)).toThrow(/no active writer/);
    beginEncodedDisplaySurfaceWrite(surface, f.device, f.target, "opaque");
    expect(() => assertEncodedDisplaySurfaceWritten(surface, f.device, f.target)).toThrow(/not completed/);
    expect(() => beginEncodedDisplaySurfaceWrite(surface, f.device, f.target)).toThrow(/already has a writer/);
    markEncodedDisplaySurfaceWritten(surface, f.device, f.target);
    expect(assertEncodedDisplaySurfaceWritten(surface, f.device, f.target).alphaMode).toBe("opaque");
    f.resources.dispose();
  });

  it("does not expose prior pixels while a rewrite is active or after abort", () => {
    const f = fixture();
    f.state.alpha = "premultiplied";
    const surface = issueEncodedDisplaySurface(f.lease, f.device, "straight");
    beginEncodedDisplaySurfaceWrite(surface, f.device, f.target, "straight");
    markEncodedDisplaySurfaceWritten(surface, f.device, f.target);
    beginEncodedDisplaySurfaceWrite(surface, f.device, f.target, "straight");
    expect(() => assertEncodedDisplaySurfaceWritten(surface, f.device, f.target)).toThrow(/not completed/);
    abortEncodedDisplaySurfaceWrite(surface);
    abortEncodedDisplaySurfaceWrite(surface);
    expect(() => assertEncodedDisplaySurfaceWritten(surface, f.device, f.target)).toThrow(/not completed/);
    beginEncodedDisplaySurfaceWrite(surface, f.device, f.target, "straight");
    markEncodedDisplaySurfaceWritten(surface, f.device, f.target);
    expect(assertEncodedDisplaySurfaceWritten(surface, f.device, f.target).alphaMode).toBe("straight");
    f.resources.dispose();
  });

  it("rejects forged, foreign, duplicate and legacy target-only acquisitions", () => {
    const f = fixture();
    const other = fixture();
    const surface = issueEncodedDisplaySurface(f.lease, f.device, "opaque");
    expect(() => issueEncodedDisplaySurface(f.lease, f.device, "opaque")).toThrow(/explicit post-target lease/);
    expect(() => issueEncodedDisplaySurface({}, f.device, "opaque")).toThrow(/explicit post-target lease/);
    expect(() => issueEncodedDisplaySurface(other.lease, f.device, "opaque")).toThrow(/explicit post-target lease/);
    expect(() => assertEncodedDisplaySurface({} as EncodedDisplaySurfaceLease, f.device, f.target)).toThrow(/forged/);
    expect(() => assertEncodedDisplaySurface(surface, other.device, f.target)).toThrow(/foreign/);
    expect(() => assertEncodedDisplaySurface(surface, f.device, other.target)).toThrow(/foreign/);
    expect(() => assertEncodedDisplaySurface(surface, f.device, f.target, "straight")).toThrow(/alpha mode/);
    const legacy = f.resources.acquire(key);
    expect(isExplicitEncodedPostLease(legacy, f.device)).toBe(false);
    expect(() => issueEncodedDisplaySurface(legacy, f.device, "opaque")).toThrow(/explicit post-target lease/);
    const legacyResources = new PostResources(f.device, { values: {}, on: () => false });
    const backing = (legacyResources as unknown as { backingPool: object }).backingPool;
    Object.defineProperty(backing, "acquireLease", { value: undefined, configurable: true });
    const legacyWrapper = legacyResources.acquireLease(key);
    expect(isExplicitEncodedPostLease(legacyWrapper, f.device)).toBe(false);
    expect(() => issueEncodedDisplaySurface(legacyWrapper, f.device, "opaque")).toThrow(/explicit post-target lease/);
    legacyResources.dispose();
    f.resources.dispose();
    other.resources.dispose();
  });

  it("revokes the exact acquisition on release, transfer and subsequent target reuse", () => {
    const f = fixture();
    const old = issueEncodedDisplaySurface(f.lease, f.device, "opaque");
    f.lease.release();
    expect(() => assertEncodedDisplaySurface(old, f.device, f.target)).toThrow(/no longer live/);
    const next = f.resources.acquireLease(key);
    expect(next.target).toBe(f.target);
    const current = issueEncodedDisplaySurface(next, f.device, "opaque");
    f.lease.release();
    expect(assertEncodedDisplaySurface(current, f.device, next.target).width).toBe(8);
    f.resources.transferLeaseToLegacy(next);
    expect(() => assertEncodedDisplaySurface(current, f.device, next.target)).toThrow(/no longer live/);
    f.resources.release(next.target);
    f.resources.dispose();
  });

  it.each(["resize", "loss", "dispose"] as const)("revokes active proofs on %s", (action) => {
    const f = fixture();
    const surface = issueEncodedDisplaySurface(f.lease, f.device, "opaque");
    if (action === "resize") f.resources.resize(2, 2);
    else if (action === "loss") f.lose();
    else f.resources.dispose();
    expect(() => assertEncodedDisplaySurface(surface, f.device, f.target)).toThrow(/no longer live/);
    f.resources.dispose();
  });

  const invalidations: Array<[string, (f: ReturnType<typeof fixture>) => void]> = [
    ["frame", (f) => { f.state.frame = {}; }],
    ["generation", (f) => { f.state.generation += 1; }],
    ["scope", (f) => { f.state.scoped = false; }],
    ["canvas color", (f) => { f.state.colorSpace = "srgb"; }],
    ["canvas alpha", (f) => { f.state.alpha = "straight"; }],
    ["texture transfer", (f) => { f.target.colorTexture.colorSpace = "srgb"; }],
    ["texture disposal", (f) => { f.target.colorTexture.dispose(); }],
    ["native handle", (f) => { f.target.colorHandle = {}; }],
    ["framebuffer", (f) => { f.target.framebuffer = {}; }],
    ["native loss", (f) => { f.target.nativeInvalid = true; }]
  ];

  it.each(invalidations)("rejects a changed %s", (_label, invalidate) => {
    const f = fixture();
    const surface = issueEncodedDisplaySurface(f.lease, f.device, "opaque");
    invalidate(f);
    expect(() => assertEncodedDisplaySurface(surface, f.device, f.target)).toThrow();
    f.resources.dispose();
  });

  it("rejects stale or unverified canvas state before issuing a token", () => {
    const f = fixture();
    f.state.frame = null;
    expect(() => issueEncodedDisplaySurface(f.lease, f.device, "opaque")).toThrow(/active verified frame/);
    f.state.frame = {};
    f.state.alpha = undefined;
    expect(() => issueEncodedDisplaySurface(f.lease, f.device, "opaque")).toThrow(/active verified frame/);
    f.state.alpha = "opaque";
    f.state.scoped = false;
    expect(() => issueEncodedDisplaySurface(f.lease, f.device, "opaque")).toThrow(/DISPLAY_SCOPE_INVALID/);
    f.resources.dispose();
  });

  it("rechecks the canvas and lease after reentrant target ownership checks", () => {
    const f = fixture();
    const surface = issueEncodedDisplaySurface(f.lease, f.device, "opaque");
    f.state.onTargetCheck = () => { f.state.colorSpace = "srgb"; };
    expect(() => assertEncodedDisplaySurface(surface, f.device, f.target)).toThrow(/DISPLAY_SCOPE_INVALID/);
    f.state.onTargetCheck = undefined;
    f.state.colorSpace = "display-p3";
    f.state.onTargetCheck = () => f.lease.release();
    expect(() => assertEncodedDisplaySurface(surface, f.device, f.target)).toThrow(/no longer live/);
    f.resources.dispose();
  });

  it("prevents a device callback from issuing twice or recursively validating the same surface", () => {
    const f = fixture();
    let nestedIssue: unknown;
    f.state.onTargetCheck = () => {
      try { issueEncodedDisplaySurface(f.lease, f.device, "opaque"); }
      catch (error) { nestedIssue = error; }
    };
    const surface = issueEncodedDisplaySurface(f.lease, f.device, "opaque");
    expect(nestedIssue).toBeInstanceOf(Error);
    let nestedValidation: unknown;
    f.state.onTargetCheck = () => {
      try { assertEncodedDisplaySurface(surface, f.device, f.target); }
      catch (error) { nestedValidation = error; }
    };
    expect(assertEncodedDisplaySurface(surface, f.device, f.target).width).toBe(8);
    expect(nestedValidation).toMatchObject({ message: expect.stringMatching(/already being validated/) });
    f.resources.dispose();
  });
});
