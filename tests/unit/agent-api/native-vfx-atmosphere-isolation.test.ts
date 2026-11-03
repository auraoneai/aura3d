import { describe, expect, it, vi } from "vitest";
import { getRootRenderSource } from "../../../packages/engine/src/agent-api/RootRuntimeSupport";
import { attachVfxBridge } from "../../../packages/engine/src/agent-api/vfx/bridge";
import { bindPrd07AppRuntimeOwner, createEffectsExtension, prd07AppDisposed, prd07MountAuthorityFor, prd07SystemFor } from "../../../packages/engine/src/agent-api/vfx/effects-api";
import { createAtmosphereExtension, disposeAtmosphereExtension } from "../../../packages/engine/src/agent-api/vfx/atmosphere-api";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { ProductionEffectSystem, type AppLike } from "../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";
import type { AtmosphereRenderSnapshot } from "../../../packages/engine/src/production-runtime/effects/LiveAtmosphere";
import type { EffectNodeLike } from "../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import type { AuraApp } from "../../../packages/engine/src/agent-api/index";
import { createAuraApp, effects, groups, scene } from "../../../packages/engine/src";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { flattenNodesWithLineWorldMatrices } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { createPrd07EnvironmentFogFromSnapshot, createProductionRuntimeEnvironmentFog } from "../../../packages/engine/src/agent-api/compiler/fog";
import { skyHorizonRadiance } from "../../../packages/rendering/src/atmosphere/HeightFog";
import { skyFrame } from "../../../packages/rendering/src/atmosphere/SkyEval";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/index";

type FrameSource = {
  renderSnapshot(): AtmosphereRenderSnapshot | null;
  isRenderSnapshotCurrent(snapshot: AtmosphereRenderSnapshot): boolean;
  onRenderChange(listener: () => void): () => void;
  onSkyChanged(listener: () => void): () => void;
  resolveFog(time: number): unknown;
  writePrd07Wetness(snapshot: AtmosphereRenderSnapshot, writer: {
    setWetness(wetness: number, threshold: number, ripples: number, snow: number, texture: null): void;
  }): void;
};

// App-owned overlays are published only under the app's sealed runtime owner;
// the standalone (ownerless) canvas view serves only standalone bridges.
function source(canvas: HTMLCanvasElement, owner?: object): FrameSource {
  return (getRootRenderSource(canvas, owner)!.source as unknown as { atmosphere: FrameSource }).atmosphere;
}

function mockApp(nodes: EffectNodeLike[] = []) {
  const callbacks = new Set<(frame: { dt: number }) => void>();
  const visible = new Map<string, boolean>();
  const canvas = {} as HTMLCanvasElement;
  const app = {
    canvas,
    scene: { nodes, version: 0 },
    nodes: { get: (id: string) => ({ visible: visible.get(id) !== false }) },
    onFrame: (callback: (frame: { dt: number }) => void) => {
      callbacks.add(callback);
      return () => { callbacks.delete(callback); };
    }
  };
  return {
    app, canvas, visible, callbacks,
    step: (dt: number) => { for (const callback of [...callbacks]) callback({ dt }); },
    replace: (next: EffectNodeLike[]) => { app.scene = { nodes: next, version: 0 }; }
  };
}

function fog(density: number): EffectNodeLike {
  return { kind: "effect", effect: "fog", density, color: "#446688", absorption: [0.1, 0.2, 0.3], runtime: { id: "fog" } } as unknown as EffectNodeLike;
}

function volume(position: number[]): EffectNodeLike {
  return { kind: "effect", effect: "fogVolume", shape: "ellipsoid", density: 0.4, position, size: [4, 6, 8], runtime: { id: "volume" } } as unknown as EffectNodeLike;
}

describe("app-owned VFX atmosphere frame source", () => {
  it("isolates apps that share authored fog nodes and snapshots all scalar/vector values", () => {
    const position = [1, 2, 3];
    const shared = [fog(0.2), volume(position)];
    const a = mockApp(shared), b = mockApp(shared);
    const sysA = new ProductionEffectSystem(a.app as unknown as AppLike);
    const sysB = new ProductionEffectSystem(b.app as unknown as AppLike);
    const bridgeA = attachVfxBridge(a.canvas, sysA), bridgeB = attachVfxBridge(b.canvas, sysB);
    try {
      const srcA = source(a.canvas), srcB = source(b.canvas);
      const changedA = vi.fn(), changedB = vi.fn();
      const offA = srcA.onRenderChange(changedA), offB = srcB.onRenderChange(changedB);
      const initialA = srcA.renderSnapshot()!, initialB = srcB.renderSnapshot()!;
      expect(initialA.owner).not.toBe(initialB.owner);
      expect(initialA.fog?.density).toBe(0.2);
      expect(initialA.fogVolumes[0]).toEqual({ shape: "ellipsoid", center: [1, 2, 3], halfSize: [2, 3, 4], density: 0.4 });
      expect(Object.isFrozen(initialA)).toBe(true);
      expect(Object.isFrozen(initialA.fog)).toBe(true);
      expect(Object.isFrozen(initialA.fog?.absorption)).toBe(true);
      expect(Object.isFrozen(initialA.fogVolumes)).toBe(true);
      expect(Object.isFrozen(initialA.fogVolumes[0]?.center)).toBe(true);
      expect(Object.isFrozen(initialA.wetness)).toBe(true);
      expect(srcA.renderSnapshot()).toBe(initialA);

      sysA.atmosphere.setNodeFogByRuntimeId("fog", { density: 0.7 });
      sysA.atmosphere.setWetness(0.8);
      const updatedA = srcA.renderSnapshot()!;
      expect(updatedA.revision).toBeGreaterThan(initialA.revision);
      expect(updatedA.fog?.density).toBe(0.7);
      expect(updatedA.wetness.wetness).toBe(0.8);
      expect(srcB.renderSnapshot()).toBe(initialB);
      expect(srcB.renderSnapshot()!.fog?.density).toBe(0.2);
      expect(changedA).toHaveBeenCalled();
      expect(changedB).not.toHaveBeenCalled();
      expect(srcA.isRenderSnapshotCurrent(initialA)).toBe(false);

      position[0] = 9;
      const moved = srcA.renderSnapshot()!;
      expect(moved.revision).toBeGreaterThan(updatedA.revision);
      expect(moved.fogVolumes[0]?.center).toEqual([9, 2, 3]);
      expect(initialA.fogVolumes[0]?.center).toEqual([1, 2, 3]);
      offA(); offA(); offB(); offB();
    } finally { bridgeA.detach(); bridgeB.detach(); sysA.dispose(); sysB.dispose(); }
  });

  it("refreshes after idle, tracks scene and visibility changes, and advances fog transitions", () => {
    const mock = mockApp([fog(0.2), volume([0, 0, 0])]);
    const system = new ProductionEffectSystem(mock.app as unknown as AppLike);
    const bridge = attachVfxBridge(mock.canvas, system);
    try {
      const src = source(mock.canvas);
      const start = src.renderSnapshot()!;
      system.atmosphere.setFog({ density: 0.8 }, { transitionSeconds: 2 });
      expect(src.renderSnapshot()!.fog?.density).toBe(0.2);
      mock.step(1);
      const midpoint = src.renderSnapshot()!;
      expect(midpoint.fog?.density).toBeCloseTo(0.5);
      expect(midpoint.revision).toBeGreaterThan(start.revision);

      const observed: (AtmosphereRenderSnapshot | null)[] = [];
      const off = src.onRenderChange(() => { observed.push(src.renderSnapshot()); });
      mock.replace([fog(0.35)]); // No onFrame tick between setScene and capture.
      const replaced = src.renderSnapshot()!;
      expect(replaced.fog?.density).toBe(0.35);
      expect(replaced.fogVolumes).toEqual([]);
      expect(replaced.revision).toBeGreaterThan(midpoint.revision);
      expect(observed).toHaveLength(1);
      expect(observed[0]?.fog?.density).toBe(0.35);
      expect(observed[0]?.fogVolumes).toEqual([]);
      mock.visible.set("fog", false);
      const hidden = src.renderSnapshot()!;
      expect(hidden.fog).toBeNull();
      expect(hidden.revision).toBeGreaterThan(replaced.revision);
      expect(src.isRenderSnapshotCurrent(replaced)).toBe(false);
      off();
    } finally { bridge.detach(); system.dispose(); }
  });

  it("publishes explicit dry defaults and rejects stale writes without touching the writer", () => {
    const mock = mockApp();
    expect(getRootRenderSource(mock.canvas)).toBeUndefined();
    const system = new ProductionEffectSystem(mock.app as unknown as AppLike);
    const bridge = attachVfxBridge(mock.canvas, system);
    try {
      const src = source(mock.canvas), dry = src.renderSnapshot()!;
      expect(dry.fog).toBeNull();
      expect(dry.fogVolumes).toEqual([]);
      expect(dry.wetness).toEqual({ wetness: 0, puddleThreshold: 0.62, rainRipples: 0, snowCover: 0, puddleNoise: null });
      const writer = { setWetness: vi.fn() };
      src.writePrd07Wetness(dry, writer);
      expect(writer.setWetness).toHaveBeenCalledWith(0, 0.62, 0, 0, null);
      system.atmosphere.setWetness(1.5);
      expect(system.atmosphere.state().wetness).toBe(1.5);
      expect(src.renderSnapshot()!.wetness.wetness).toBe(1);
      expect(() => src.writePrd07Wetness(dry, writer)).toThrow(/SNAPSHOT_STALE/);
      expect(writer.setWetness).toHaveBeenCalledTimes(1);
      system.atmosphere.setWetness(NaN);
      expect(() => src.renderSnapshot()).toThrow(/NUMBER_INVALID/);
    } finally { bridge.detach(); system.dispose(); }
  });

  it("copies the scalar sky inputs needed by fog without reading borrowed textures", () => {
    const mock = mockApp();
    const system = new ProductionEffectSystem(mock.app as unknown as AppLike);
    const bridge = attachVfxBridge(mock.canvas, system);
    try {
      const src = source(mock.canvas);
      const sky = {
        model: "gradient" as const,
        zenith: "#334466", horizon: "#88aacc", ground: "#223344", exponent: 1.5,
        sun: { elevationDeg: 30, azimuthDeg: 80, intensity: 0.9 },
        bands: [{ elevationDeg: 3, widthDeg: 5, color: "#ff8844", intensity: 0.4 }]
      };
      system.atmosphere.setSky(sky);
      const frame = src.renderSnapshot()!;
      expect(skyHorizonRadiance(frame.skyForFog, 0.4)).toEqual(skyHorizonRadiance(sky, 0.4));
      expect(Object.isFrozen(frame.skyForFog)).toBe(true);
      expect(Object.isFrozen(frame.skyForFog?.sun)).toBe(true);
      expect(Object.isFrozen(frame.skyForFog?.bands?.[0])).toBe(true);
      sky.sun.elevationDeg = 10;
      const next = src.renderSnapshot()!;
      expect(next.revision).toBeGreaterThan(frame.revision);
      expect(frame.skyForFog?.sun?.elevationDeg).toBe(30);
      expect(next.skyForFog?.sun?.elevationDeg).toBe(10);

      let reads = 0;
      const texture = new Proxy({}, { get() { reads++; throw new Error("unexpected texture read"); } });
      system.atmosphere.setSky({ model: "hdri", texture } as never);
      expect(src.renderSnapshot()!.skyForFog).toEqual({ model: "hdri" });
      expect(reads).toBe(0);
    } finally { bridge.detach(); system.dispose(); }
  });

  it("does not notify observers with a partially rebuilt scene after an error", () => {
    const mock = mockApp([fog(0.2)]);
    const system = new ProductionEffectSystem(mock.app as unknown as AppLike);
    const bridge = attachVfxBridge(mock.canvas, system);
    try {
      const src = source(mock.canvas);
      const observed: (AtmosphereRenderSnapshot | null)[] = [];
      src.onRenderChange(() => { observed.push(src.renderSnapshot()); });
      const offSky = system.atmosphere.onSkyChanged(() => { throw new Error("sky observer failed"); });
      mock.replace([
        { kind: "sky", spec: { model: "gradient", zenith: "#111111", horizon: "#999999" } } as unknown as EffectNodeLike,
        fog(0.6)
      ]);
      expect(() => src.renderSnapshot()).toThrow("sky observer failed");
      expect(observed).toEqual([]);
      offSky();
      const recovered = src.renderSnapshot()!;
      expect(recovered.fog?.density).toBe(0.6);
      expect(recovered.skyForFog?.model).toBe("gradient");
      expect(observed).toEqual([recovered]);
    } finally { bridge.detach(); system.dispose(); }
  });

  it("disposes the owning app's bridge and callbacks without disturbing the other app", () => {
    const a = mockApp(), b = mockApp();
    const flags = resolveQrFlags({ options: { A3D_QR_VFX: true, A3D_QR_VFX_FOG: true } });
    const effectsA = createEffectsExtension(a.app as unknown as AuraApp, { flags, options: { scene: scene() } });
    const effectsB = createEffectsExtension(b.app as unknown as AuraApp, { flags, options: { scene: scene() } });
    const apiA = createAtmosphereExtension(a.app as unknown as AuraApp, { flags });
    const apiB = createAtmosphereExtension(b.app as unknown as AuraApp, { flags });
    const ownerA = {}, ownerB = {};
    bindPrd07AppRuntimeOwner(a.app as unknown as AuraApp, ownerA);
    bindPrd07AppRuntimeOwner(b.app as unknown as AuraApp, ownerB);
    expect(getRootRenderSource(a.canvas)).toBeUndefined();
    expect(getRootRenderSource(a.canvas, ownerB)).toBeUndefined();
    const srcA = source(a.canvas, ownerA), srcB = source(b.canvas, ownerB);
    const off = srcA.onRenderChange(vi.fn());
    apiA.setWetness(0.25); apiB.setWetness(0.75);
    const old = srcA.renderSnapshot()!;
    try {
      prd07AppDisposed(effectsA);
      expect(prd07SystemFor(a.app as unknown as AuraApp)).toBeNull();
      expect(getRootRenderSource(a.canvas)).toBeUndefined();
      expect(getRootRenderSource(a.canvas, ownerA)).toBeUndefined();
      expect(getRootRenderSource(b.canvas, ownerB)).toBeDefined();
      expect(srcA.renderSnapshot()).toBeNull();
      expect(srcA.isRenderSnapshotCurrent(old)).toBe(false);
      expect(a.callbacks.size).toBe(0);
      expect(srcB.renderSnapshot()!.wetness.wetness).toBe(0.75);
      off(); off();
      disposeAtmosphereExtension(a.app as unknown as AuraApp);
      expect(srcB.renderSnapshot()!.wetness.wetness).toBe(0.75);
    } finally {
      prd07AppDisposed(effectsA); prd07AppDisposed(effectsB);
      disposeAtmosphereExtension(a.app as unknown as AuraApp);
      disposeAtmosphereExtension(b.app as unknown as AuraApp);
    }
  });

  it("revokes retained source callbacks and detaches even when a disposal listener throws", () => {
    const mock = mockApp([fog(0.2)]);
    const system = new ProductionEffectSystem(mock.app as unknown as AppLike);
    const bridge = attachVfxBridge(mock.canvas, system);
    const src = source(mock.canvas);
    const onSky = vi.fn();
    const offSky = src.onSkyChanged(onSky);
    src.onRenderChange(() => { throw new Error("observer failed"); });
    system.onDispose(() => { throw new Error("disposal failed"); });
    expect(() => system.dispose()).toThrow(/dispose/);
    expect(bridge.attached).toBe(false);
    expect(getRootRenderSource(mock.canvas)).toBeUndefined();
    expect(mock.callbacks.size).toBe(0);
    expect(src.renderSnapshot()).toBeNull();
    expect(src.resolveFog(0)).toBeNull();
    system.atmosphere.setSky({ model: "gradient", zenith: "#000000", horizon: "#ffffff" });
    expect(onSky).not.toHaveBeenCalled();
    offSky(); offSky(); bridge.detach(); system.dispose();
  });

  it("releases the real app system on app.dispose while a second app remains live", () => {
    const makeApp = () => createAuraApp(null, { scene: scene(), autoStart: false, qualityRebuild: { flags: ["vfx", "vfx.fog"] } });
    const appA = makeApp(), appB = makeApp();
    const systemA = prd07SystemFor(appA)!, systemB = prd07SystemFor(appB)!;
    try {
      appA.atmosphere!.setWetness(0.3);
      appB.atmosphere!.setWetness(0.6);
      expect(systemA.captureAtmosphereSnapshot()!.wetness.wetness).toBe(0.3);
      expect(systemB.captureAtmosphereSnapshot()!.wetness.wetness).toBe(0.6);
      appA.dispose();
      expect(prd07SystemFor(appA)).toBeNull();
      expect(systemA.captureAtmosphereSnapshot()).toBeNull();
      expect(systemB.captureAtmosphereSnapshot()!.wetness.wetness).toBe(0.6);
    } finally { appA.dispose(); appB.dispose(); }
  });

  it("issues only an owner/canvas-bound authority and revokes it when its bridge detaches", () => {
    const a = mockApp(), b = mockApp();
    b.app.canvas = a.canvas; // Competing apps on one canvas cannot borrow its live bridge.
    const flags = resolveQrFlags({ options: { A3D_QR_VFX: true, A3D_QR_VFX_FOG: true } });
    const appA = a.app as unknown as AuraApp, appB = b.app as unknown as AuraApp;
    const fxA = createEffectsExtension(appA, { flags, options: { scene: scene() } });
    const fxB = createEffectsExtension(appB, { flags, options: { scene: scene() } });
    const apiA = createAtmosphereExtension(appA, { flags });
    const ownerA = {}, ownerB = {};
    try {
      bindPrd07AppRuntimeOwner(appA, ownerA);
      bindPrd07AppRuntimeOwner(appB, ownerB);
      const authority = prd07MountAuthorityFor(appA, a.canvas, ownerA)!;
      expect(authority.isLive()).toBe(true);
      expect(authority.owner).toBe(ownerA);
      expect(authority.canvas).toBe(a.canvas);
      expect(authority.overlay).toBeTruthy();
      expect(prd07MountAuthorityFor(appA, a.canvas, ownerB)).toBeNull();
      expect(prd07MountAuthorityFor(appA, b.canvas, ownerA)).toBeNull();
      // Overlays are per runtime owner: B on the shared canvas gets only its
      // own authority, never A's overlay or A's staged values.
      const authorityB = prd07MountAuthorityFor(appB, a.canvas, ownerB)!;
      expect(authorityB.owner).toBe(ownerB);
      expect(authorityB.overlay).not.toBe(authority.overlay);
      expect(() => bindPrd07AppRuntimeOwner(appA, ownerB)).toThrow(/OWNER_MISMATCH/);
      const systemA = prd07SystemFor(appA)!, systemB = prd07SystemFor(appB)!;
      let traps = 0;
      const impostor = new Proxy({}, { get() { traps++; throw new Error("unexpected read"); }, getOwnPropertyDescriptor() { traps++; throw new Error("unexpected descriptor"); } });
      const realBridge = systemA.currentBridge()!;
      const ctor = realBridge.constructor as unknown as { owns: unknown; overlayFor: unknown };
      const originalOwns = ctor.owns, originalOverlay = ctor.overlayFor;
      try {
        ctor.owns = () => true;
        ctor.overlayFor = () => ({});
        expect(() => systemB.setOwnedBridge(impostor as never, a.canvas)).toThrow(/BRIDGE_OWNER_MISMATCH/);
        expect(() => systemB.setOwnedBridge(realBridge, a.canvas)).toThrow(/BRIDGE_OWNER_MISMATCH/);
        expect(authority.isLive()).toBe(true);
      } finally { ctor.owns = originalOwns; ctor.overlayFor = originalOverlay; }
      expect(traps).toBe(0);
      const forged = {};
      (systemA as unknown as { mountAuthority: () => object }).mountAuthority = () => forged;
      expect(prd07MountAuthorityFor(appA, a.canvas, ownerA)).not.toBe(forged);
      const old = authority.capture()!;
      const changes = vi.fn(), revoked = vi.fn();
      const offChange = authority.onChange(changes), offRevoke = authority.onRevoke(revoked);
      apiA.setWetness(0.4);
      expect(changes).toHaveBeenCalled();
      expect(authority.isCurrent(old)).toBe(false);
      expect(authority.capture()!.wetness.wetness).toBe(0.4);
      expect(authorityB.capture()!.wetness.wetness).not.toBe(0.4);
      prd07AppDisposed(fxB);
      expect(authorityB.isLive()).toBe(false);
      expect(authority.isLive()).toBe(true);
      prd07AppDisposed(fxA);
      expect(revoked).toHaveBeenCalledTimes(1);
      expect(authority.capture()).toBeNull();
      expect(authority.isCurrent(old)).toBe(false);
      expect(authority.isLive()).toBe(false);
      offChange(); offChange(); offRevoke(); offRevoke();
    } finally { prd07AppDisposed(fxA); prd07AppDisposed(fxB); disposeAtmosphereExtension(appA); disposeAtmosphereExtension(appB); }
  });

  it("captures only the staged values and fails closed when a later ingestion throws or reenters", () => {
    const mock = mockApp(), app = mock.app as unknown as AuraApp, owner = {};
    const flags = resolveQrFlags({ options: { A3D_QR_VFX: true } });
    const fx = createEffectsExtension(app, { flags, options: { scene: scene() } });
    const api = createAtmosphereExtension(app, { flags });
    bindPrd07AppRuntimeOwner(app, owner);
    let authority = prd07MountAuthorityFor(app, mock.canvas, owner)!;
    let reads = 0, failReads = false, reenter = false;
    const sky = {
      model: "gradient" as const,
      get zenith() {
        reads++;
        if (failReads) throw new Error("authored sky getter");
        if (reenter) { reenter = false; api.setWetness(0.9); }
        return "#223344";
      },
      horizon: "#8899aa",
      stars: { count: 180, brightness: 0.7 },
      clouds: { coverage: 0.4, speed: 0.8, color: "#ccddee" },
      moon: { elevationDeg: 20, azimuthDeg: 30, phase: 0.5, color: "#ddeeff" }
    };
    try {
      api.setSky(sky);
      const staged = authority.capture()!;
      const revoked = vi.fn();
      const offRevoke = authority.onRevoke(revoked);
      expect(staged).toBeTruthy();
      expect(skyFrame(staged.skyForFog as never)).toEqual(skyFrame(sky as never));
      expect(Object.isFrozen(staged.skyForFog?.stars)).toBe(true);
      expect(Object.isFrozen(staged.skyForFog?.clouds)).toBe(true);
      expect(Object.isFrozen(staged.skyForFog?.moon)).toBe(true);
      failReads = true;
      const before = reads;
      expect(authority.capture()).toBe(staged);
      expect(authority.isCurrent(staged)).toBe(true);
      expect(reads).toBe(before); // No authored getter is touched during managed capture/check.
      api.setWetness(0.5);
      expect(authority.capture()).toBeNull();
      expect(authority.isCurrent(staged)).toBe(false);
      expect(authority.isLive()).toBe(false);
      expect(revoked).toHaveBeenCalledTimes(1);
      expect(prd07MountAuthorityFor(app, mock.canvas, owner)).toBeNull();
      failReads = false;
      api.setWetness(0.6);
      expect(authority.isLive()).toBe(false); // A failed authority cannot be revived.
      expect(revoked).toHaveBeenCalledTimes(1);
      offRevoke(); offRevoke();
      authority = prd07MountAuthorityFor(app, mock.canvas, owner)!;
      expect(authority.capture()!.wetness.wetness).toBe(0.6);
      reenter = true;
      api.setSky(sky);
      expect(authority.capture()).toBeNull();
      expect(authority.isLive()).toBe(false);
      api.setWetness(0.7);
      expect(authority.isLive()).toBe(false);
      authority = prd07MountAuthorityFor(app, mock.canvas, owner)!;
      expect(authority.capture()!.wetness.wetness).toBe(0.7);
      api.setSky({ model: "hdri", texture: {} } as never);
      expect(authority.capture()).toBeNull(); // No retention/revision lease for sky textures.
      expect(authority.isLive()).toBe(false);
      expect(prd07MountAuthorityFor(app, mock.canvas, owner)).toBeNull();
    } finally { prd07AppDisposed(fx); disposeAtmosphereExtension(app); }
  });

  it("validates the same vector components it copies and does not call authored array methods", () => {
    const mock = mockApp(), app = mock.app as unknown as AuraApp, owner = {};
    const flags = resolveQrFlags({ options: { A3D_QR_VFX: true } });
    const fx = createEffectsExtension(app, { flags, options: { scene: scene() } });
    const api = createAtmosphereExtension(app, { flags });
    bindPrd07AppRuntimeOwner(app, owner);
    const authority = prd07MountAuthorityFor(app, mock.canvas, owner)!;
    const vector = [0.1, 0.2, 0.3];
    let reads = 0;
    Object.defineProperty(vector, "0", { get: () => ++reads === 1 ? 0.1 : { borrowed: true } });
    const color = [0.4, 0.5, 0.6];
    const bands = [{ color, widthDeg: 10 }];
    Object.defineProperty(bands, "slice", { value: () => { throw new Error("authored slice"); } });
    try {
      api.setSky({ model: "gradient", zenith: vector, bands } as never);
      const staged = authority.capture()!;
      expect(staged.skyForFog?.zenith).toEqual([0.1, 0.2, 0.3]);
      expect(reads).toBe(1);
      expect(staged.skyForFog?.bands?.[0]?.color).toEqual([0.4, 0.5, 0.6]);
      color[0] = 1;
      expect(staged.skyForFog?.bands?.[0]?.color).toEqual([0.4, 0.5, 0.6]);
      expect(Object.isFrozen(staged.skyForFog?.bands?.[0]?.color)).toBe(true);
    } finally { prd07AppDisposed(fx); disposeAtmosphereExtension(app); }
  });

  it("invalidates managed snapshots even when an earlier render observer throws", () => {
    const mock = mockApp(), app = mock.app as unknown as AuraApp, owner = {};
    const flags = resolveQrFlags({ options: { A3D_QR_VFX: true } });
    const fx = createEffectsExtension(app, { flags, options: { scene: scene() } });
    const api = createAtmosphereExtension(app, { flags });
    const off = prd07SystemFor(app)!.atmosphere.onRenderChange(() => { throw new Error("observer"); });
    try {
      bindPrd07AppRuntimeOwner(app, owner);
      const authority = prd07MountAuthorityFor(app, mock.canvas, owner)!;
      const initial = authority.capture()!;
      const notified = vi.fn();
      const unsubscribe = authority.onChange(notified);
      api.setWetness(0.65);
      expect(authority.isCurrent(initial)).toBe(false);
      expect(authority.capture()!.wetness.wetness).toBe(0.65);
      expect(notified).toHaveBeenCalled();
      unsubscribe();
    } finally { off(); prd07AppDisposed(fx); disposeAtmosphereExtension(app); }
  });

  it("revokes authority when scene inspection reenters an atmosphere setter", () => {
    const mock = mockApp(), app = mock.app as unknown as AuraApp, owner = {};
    const flags = resolveQrFlags({ options: { A3D_QR_VFX: true } });
    const fx = createEffectsExtension(app, { flags, options: { scene: scene() } });
    const api = createAtmosphereExtension(app, { flags });
    let reenter = false;
    Object.defineProperty(mock.app.scene, "version", { get: () => {
      if (reenter) { reenter = false; api.setWetness(0.9); }
      return 0;
    } });
    try {
      bindPrd07AppRuntimeOwner(app, owner);
      const authority = prd07MountAuthorityFor(app, mock.canvas, owner)!;
      const revoked = vi.fn();
      authority.onRevoke(revoked);
      reenter = true;
      api.setWetness(0.2);
      expect(authority.isLive()).toBe(false);
      expect(authority.capture()).toBeNull();
      expect(revoked).toHaveBeenCalledTimes(1);
      expect(prd07MountAuthorityFor(app, mock.canvas, owner)).toBeNull();
      api.setWetness(0.3);
      expect(prd07MountAuthorityFor(app, mock.canvas, owner)!.capture()!.wetness.wetness).toBe(0.3);
      expect(authority.isLive()).toBe(false);
    } finally { prd07AppDisposed(fx); disposeAtmosphereExtension(app); }
  });

  it("ingests live ancestor visibility and volume positions on committed scene changes", () => {
    const authored = scene().add(groups.create("parent", [
      effects.fogVolume({ position: [1, 0, 0], size: [4, 4, 4] }).runtime({ id: "volume" })
    ], { position: [2, 0, 0] }).runtime({ id: "parent" })).toJSON() as AuraSceneSnapshot;
    const flat = { ...authored, nodes: flattenNodesWithLineWorldMatrices(authored.nodes) };
    const registry = createAuraRuntimeNodeRegistry(flat, { getScene: () => authored }, authored);
    const mock = mockApp();
    const app = { ...mock.app, scene: authored, nodes: registry } as unknown as AuraApp;
    const flags = resolveQrFlags({ options: { A3D_QR_VFX: true } });
    const fx = createEffectsExtension(app, { flags, options: { scene: authored } });
    const owner = {};
    try {
      bindPrd07AppRuntimeOwner(app, owner);
      const authority = prd07MountAuthorityFor(app, mock.canvas, owner)!;
      const initial = authority.capture()!;
      expect(initial.fogVolumes[0]?.center).toEqual([3, 0, 0]);
      registry.require("parent").setPosition(5, 0, 0);
      const moved = authority.capture()!;
      expect(authority.isCurrent(initial)).toBe(false);
      expect(moved.fogVolumes[0]?.center).toEqual([6, 0, 0]);
      registry.require("parent").setVisible(false);
      expect(authority.capture()!.fogVolumes).toEqual([]);
      registry.require("parent").setVisible(true);
      expect(authority.capture()!.fogVolumes[0]?.center).toEqual([6, 0, 0]);
      registry.require("parent").setRotation(0, Math.PI / 4, 0);
      expect(authority.isLive()).toBe(false);
      expect(authority.capture()).toBeNull();
      expect(prd07MountAuthorityFor(app, mock.canvas, owner)).toBeNull();
      registry.require("parent").setRotation(0, 0, 0);
      const reset = prd07MountAuthorityFor(app, mock.canvas, owner)!;
      expect(reset.capture()!.fogVolumes[0]?.center).toEqual([6, 0, 0]);
      registry.require("parent").setScale(2);
      expect(reset.isLive()).toBe(false);
      expect(prd07MountAuthorityFor(app, mock.canvas, owner)).toBeNull();
      registry.require("parent").setScale(1);
      const restored = prd07MountAuthorityFor(app, mock.canvas, owner)!;
      expect(restored.capture()!.fogVolumes[0]?.halfSize).toEqual([2, 2, 2]);
      registry.require("parent").setPosition(NaN, 0, 0);
      expect(restored.isLive()).toBe(false);
      expect(prd07MountAuthorityFor(app, mock.canvas, owner)).toBeNull();
    } finally { prd07AppDisposed(fx); disposeAtmosphereExtension(app); registry.dispose(); }
  });

  it("packs legacy fog from the staged value and resolved camera, independently of later changes", () => {
    const mock = mockApp(), app = mock.app as unknown as AuraApp, owner = {};
    const flags = resolveQrFlags({ options: { A3D_QR_VFX: true, A3D_QR_VFX_FOG: true } });
    const fx = createEffectsExtension(app, { flags, options: { scene: scene() } });
    const api = createAtmosphereExtension(app, { flags });
    bindPrd07AppRuntimeOwner(app, owner);
    const authority = prd07MountAuthorityFor(app, mock.canvas, owner)!;
    try {
      api.setSky({ model: "gradient", zenith: "#224466", horizon: "#88aacc" });
      api.setFog({ mode: "height", color: "sky", density: 0.03, heightDensity: 0.06, heightFalloff: 0.2, heightReference: 1 });
      authority.noteCamera(1, 5, 3, 0.4, 0, -0.9);
      const snapshot = authority.capture()!;
      const packed = createPrd07EnvironmentFogFromSnapshot(snapshot, 5, 0.4, -0.9);
      const legacy = createProductionRuntimeEnvironmentFog({ nodes: [] } as never, [], 100, 100, app);
      // A managed app's fog is keyed by the app (or its private renderer
      // owner), never by the canvas.
      expect(createProductionRuntimeEnvironmentFog({ nodes: [] } as never, [], 100, 100, mock.canvas)).toBe(false);
      expect(packed).toEqual(legacy);
      api.setFog({ mode: "exp", density: 0.8, color: "#ff0000" });
      expect(authority.isCurrent(snapshot)).toBe(false);
      expect(createPrd07EnvironmentFogFromSnapshot(snapshot, 5, 0.4, -0.9)).toEqual(packed);
    } finally { prd07AppDisposed(fx); disposeAtmosphereExtension(app); }
  });

  it("fails closed for an unlinked volume below a transformed static ancestor", () => {
    const authored = scene().add(groups.create("static", [
      effects.fogVolume({ position: [1, 0, 0], size: 4 })
    ], { position: [2, 0, 0] })).toJSON() as AuraSceneSnapshot;
    const flat = { ...authored, nodes: flattenNodesWithLineWorldMatrices(authored.nodes) };
    const registry = createAuraRuntimeNodeRegistry(flat, { getScene: () => authored }, authored);
    const mock = mockApp();
    const app = { ...mock.app, scene: authored, nodes: registry } as unknown as AuraApp;
    const flags = resolveQrFlags({ options: { A3D_QR_VFX: true } });
    const fx = createEffectsExtension(app, { flags, options: { scene: authored } });
    const owner = {};
    try {
      bindPrd07AppRuntimeOwner(app, owner);
      expect(prd07MountAuthorityFor(app, mock.canvas, owner)).toBeNull();
      expect(getRootRenderSource(mock.canvas)).toBeUndefined();
      expect(source(mock.canvas, owner).renderSnapshot()).not.toBeNull();
    } finally { prd07AppDisposed(fx); disposeAtmosphereExtension(app); registry.dispose(); }
  });

  it("fails closed for an unlinked volume with its own unsupported transform", () => {
    const transformed = { ...volume([1, 0, 0]), rotation: [0, 0, 1] } as unknown as EffectNodeLike;
    const mock = mockApp([transformed]), app = mock.app as unknown as AuraApp, owner = {};
    const flags = resolveQrFlags({ options: { A3D_QR_VFX: true } });
    const fx = createEffectsExtension(app, { flags, options: { scene: scene() } });
    try {
      bindPrd07AppRuntimeOwner(app, owner);
      expect(prd07MountAuthorityFor(app, mock.canvas, owner)).toBeNull();
      expect(getRootRenderSource(mock.canvas)).toBeUndefined();
      expect(source(mock.canvas, owner).renderSnapshot()).not.toBeNull();
    } finally { prd07AppDisposed(fx); disposeAtmosphereExtension(app); }
  });
});
