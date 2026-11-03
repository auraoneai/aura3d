import { describe, expect, it } from "vitest";
import {
  beginPrd07Frame,
  createPrd07FrameScope,
  createPrd07FrameWriter,
  disposePrd07FrameScope,
  endPrd07Frame,
  resolvePrd07FramePacket,
  revokePrd07Device,
  revokePrd07DeviceGeneration,
  type Prd07FramePacket,
  type Prd07FrameWriter
} from "../../../packages/rendering/src/vfx/Prd07FrameState";

function setup(view: string | number = "left", index = 7) {
  const renderer = {}, device = {}, generation = 2;
  const scope = createPrd07FrameScope(renderer, device, generation);
  const frame = beginPrd07Frame(scope, renderer, device, generation, view, index);
  const writer = createPrd07FrameWriter(frame);
  return { renderer, device, generation, view, index, scope, frame, writer };
}

function resolve(packet: Prd07FramePacket, ctx: ReturnType<typeof setup>) {
  return resolvePrd07FramePacket(packet, ctx.scope, ctx.frame, ctx.renderer, ctx.device,
    ctx.generation, ctx.view, ctx.index);
}

function setDry(writer: Prd07FrameWriter) {
  writer.setWetness(0, 0.62, 0, 0, null);
}

function setFog(writer: Prd07FrameWriter) {
  writer.beginFog(5, 0.1, 500);
  writer.setFogA(0.1, 0.2, 0.3, 0.4);
  writer.setFogB(2, 1, 0.5, 0.6);
  writer.setFogColor(0.2, 0.4, 0.6);
  writer.setFogAbsorption(0.01, 0.02, 0.03);
  writer.setSunDirection(0, 1, 0);
  writer.setSunColor(1, 0.8, 0.6);
  writer.setCameraPosition(3, 4, 5);
}

describe("staged PRD07 frame snapshot capabilities", () => {
  it("publishes a fog-free dry snapshot and prevents a second writer or publication", () => {
    const ctx = setup();
    setDry(ctx.writer);
    expect(() => createPrd07FrameWriter(ctx.frame)).toThrow(/WRITER_UNAVAILABLE/);
    const packet = ctx.writer.publish();
    const values = resolve(packet, ctx)!;
    expect(values).toEqual({ fog: null, wetness: { wetness: 0, puddleThreshold: 0.62, rainRipples: 0, snowCover: 0, puddleNoise: null } });
    expect(Object.isFrozen(packet)).toBe(true);
    expect(Object.isFrozen(values)).toBe(true);
    expect(Object.isFrozen(values.wetness)).toBe(true);
    expect(() => ctx.writer.publish()).toThrow(/WRITER_CLOSED/);
    expect(() => ctx.writer.setWetness(0, 0.62, 0, 0, null)).toThrow(/WRITER_CLOSED/);
    expect(endPrd07Frame(ctx.frame)).toBe(true);
    expect(disposePrd07FrameScope(ctx.scope)).toBe(true);
  });

  it("copies scalar fog, wetness and volume data into deeply frozen owned values", () => {
    const ctx = setup();
    const sourceColor: [number, number, number] = [0.2, 0.4, 0.6];
    const center: [number, number, number] = [7, 8, 9];
    setFog(ctx.writer);
    ctx.writer.setFogColor(sourceColor[0], sourceColor[1], sourceColor[2]);
    ctx.writer.addFogVolume("box", center[0], center[1], center[2], 1, 2, 3, 0.25);
    ctx.writer.setWetness(0.6, 0.3, 2, 0.1, null);
    const packet = ctx.writer.publish();
    sourceColor[0] = 99;
    center[0] = 99;
    const values = resolve(packet, ctx)!;
    const fog = values.fog!;
    expect(fog.uniforms.fogColor).toEqual([0.2, 0.4, 0.6]);
    expect(fog.volumes[0]).toEqual({ shape: "box", center: [7, 8, 9], halfSize: [1, 2, 3], density: 0.25 });
    expect(values.wetness.wetness).toBe(0.6);
    for (const value of [fog, fog.uniforms, fog.uniforms.fogA, fog.uniforms.fogB, fog.uniforms.fogColor,
      fog.uniforms.fogAbsorption, fog.volumes, fog.volumes[0], fog.volumes[0]!.center,
      fog.volumes[0]!.halfSize, fog.sunDirection, fog.sunColor, fog.cameraPosition]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(() => { (fog.volumes[0]!.center as unknown as number[])[0] = 5; }).toThrow(TypeError);
    expect(resolve(packet, ctx)!.fog!.volumes[0]!.center[0]).toBe(7);
    disposePrd07FrameScope(ctx.scope);
  });

  it("matches the exact renderer, device, generation, view, frame and capabilities", () => {
    const ctx = setup();
    setDry(ctx.writer);
    const packet = ctx.writer.publish();
    const read = (scope = ctx.scope, frame = ctx.frame, renderer = ctx.renderer, device = ctx.device,
      generation = ctx.generation, view: string | number = ctx.view, index = ctx.index) =>
      resolvePrd07FramePacket(packet, scope, frame, renderer, device, generation, view, index);
    expect(read()).toBeDefined();
    expect(read(ctx.scope, ctx.frame, {})).toBeUndefined();
    expect(read(ctx.scope, ctx.frame, ctx.renderer, {})).toBeUndefined();
    expect(read(ctx.scope, ctx.frame, ctx.renderer, ctx.device, 3)).toBeUndefined();
    expect(read(ctx.scope, ctx.frame, ctx.renderer, ctx.device, 2, "right")).toBeUndefined();
    expect(read(ctx.scope, ctx.frame, ctx.renderer, ctx.device, 2, "left", 8)).toBeUndefined();
    expect(read({} as typeof ctx.scope)).toBeUndefined();
    expect(read(ctx.scope, {} as typeof ctx.frame)).toBeUndefined();
    expect(resolvePrd07FramePacket({} as Prd07FramePacket, ctx.scope, ctx.frame, ctx.renderer,
      ctx.device, ctx.generation, ctx.view, ctx.index)).toBeUndefined();
    expect(() => beginPrd07Frame(ctx.scope, {}, ctx.device, ctx.generation, "right", 8)).toThrow(/IDENTITY_INVALID/);
    expect(() => beginPrd07Frame(ctx.scope, ctx.renderer, {}, ctx.generation, "right", 8)).toThrow(/IDENTITY_INVALID/);
    expect(() => beginPrd07Frame(ctx.scope, ctx.renderer, ctx.device, 3, "right", 8)).toThrow(/IDENTITY_INVALID/);
    disposePrd07FrameScope(ctx.scope);
  });

  it("isolates apps, devices and views even when frame indices match", () => {
    const first = setup();
    const secondRenderer = {}, secondDevice = {};
    const otherApp = createPrd07FrameScope(secondRenderer, first.device, first.generation);
    const otherDevice = createPrd07FrameScope(first.renderer, secondDevice, first.generation);
    const appFrame = beginPrd07Frame(otherApp, secondRenderer, first.device, first.generation, "left", first.index);
    const deviceFrame = beginPrd07Frame(otherDevice, first.renderer, secondDevice, first.generation, "left", first.index);
    const rightFrame = beginPrd07Frame(first.scope, first.renderer, first.device, first.generation, "right", first.index);
    setDry(first.writer);
    const firstPacket = first.writer.publish();
    const appWriter = createPrd07FrameWriter(appFrame);
    appWriter.setWetness(0.8, 0.62, 0, 0, null);
    const appPacket = appWriter.publish();
    const rightWriter = createPrd07FrameWriter(rightFrame);
    rightWriter.setWetness(0.4, 0.62, 0, 0, null);
    const rightPacket = rightWriter.publish();
    expect(resolve(firstPacket, first)!.wetness.wetness).toBe(0);
    expect(resolvePrd07FramePacket(appPacket, otherApp, appFrame, secondRenderer, first.device, first.generation, "left", first.index)!.wetness.wetness).toBe(0.8);
    expect(resolvePrd07FramePacket(rightPacket, first.scope, rightFrame, first.renderer, first.device, first.generation, "right", first.index)!.wetness.wetness).toBe(0.4);
    expect(resolvePrd07FramePacket(firstPacket, otherApp, appFrame, secondRenderer, first.device, first.generation, "left", first.index)).toBeUndefined();
    expect(resolvePrd07FramePacket(firstPacket, otherDevice, deviceFrame, first.renderer, secondDevice, first.generation, "left", first.index)).toBeUndefined();
    expect(resolvePrd07FramePacket(firstPacket, first.scope, rightFrame, first.renderer, first.device, first.generation, "right", first.index)).toBeUndefined();
    disposePrd07FrameScope(first.scope);
    disposePrd07FrameScope(otherApp);
    disposePrd07FrameScope(otherDevice);
  });

  it("refuses overlapping frames for a view and never resurrects an ended frame", () => {
    const ctx = setup();
    setDry(ctx.writer);
    const oldPacket = ctx.writer.publish();
    expect(() => beginPrd07Frame(ctx.scope, ctx.renderer, ctx.device, ctx.generation, ctx.view, ctx.index + 1)).toThrow(/IN_FLIGHT/);
    expect(endPrd07Frame(ctx.frame)).toBe(true);
    expect(endPrd07Frame(ctx.frame)).toBe(false);
    expect(resolve(oldPacket, ctx)).toBeUndefined();
    const nextFrame = beginPrd07Frame(ctx.scope, ctx.renderer, ctx.device, ctx.generation, ctx.view, ctx.index);
    const nextWriter = createPrd07FrameWriter(nextFrame);
    nextWriter.setWetness(0.7, 0.62, 0, 0, null);
    const nextPacket = nextWriter.publish();
    expect(resolvePrd07FramePacket(oldPacket, ctx.scope, nextFrame, ctx.renderer, ctx.device,
      ctx.generation, ctx.view, ctx.index)).toBeUndefined();
    expect(resolvePrd07FramePacket(nextPacket, ctx.scope, nextFrame, ctx.renderer, ctx.device,
      ctx.generation, ctx.view, ctx.index)!.wetness.wetness).toBe(0.7);
    disposePrd07FrameScope(ctx.scope);
  });

  it("revokes a suspended writer and packet when its owner is disposed", async () => {
    const ctx = setup();
    setDry(ctx.writer);
    const packet = ctx.writer.publish();
    const alreadyResolved = resolve(packet, ctx)!;
    await Promise.resolve();
    expect(disposePrd07FrameScope(ctx.scope)).toBe(true);
    expect(disposePrd07FrameScope(ctx.scope)).toBe(false);
    expect(resolve(packet, ctx)).toBeUndefined();
    expect(() => ctx.writer.setWetness(0, 0.62, 0, 0, null)).toThrow(/WRITER_CLOSED/);
    expect(() => beginPrd07Frame(ctx.scope, ctx.renderer, ctx.device, ctx.generation, ctx.view, ctx.index + 1)).toThrow(/IDENTITY_INVALID/);
    // Immutable values already handed to a caller cannot be recalled.
    expect(alreadyResolved.wetness.wetness).toBe(0);
  });

  it("cannot publish a writer resumed after its scope is revoked", async () => {
    const ctx = setup();
    setDry(ctx.writer);
    let resume!: () => void;
    const gate = new Promise<void>((resolveGate) => { resume = resolveGate; });
    const pending = (async () => { await gate; return ctx.writer.publish(); })();
    expect(disposePrd07FrameScope(ctx.scope)).toBe(true);
    resume();
    await expect(pending).rejects.toThrow(/WRITER_CLOSED/);
  });

  it("revokes all owners of a lost device without affecting another device", () => {
    const first = setup(), other = setup();
    const secondOwner = {}, secondScope = createPrd07FrameScope(secondOwner, first.device, first.generation);
    const secondFrame = beginPrd07Frame(secondScope, secondOwner, first.device, first.generation, "right", 7);
    const secondWriter = createPrd07FrameWriter(secondFrame);
    setDry(first.writer); setDry(secondWriter); setDry(other.writer);
    const firstPacket = first.writer.publish(), secondPacket = secondWriter.publish(), otherPacket = other.writer.publish();
    expect(revokePrd07Device(first.device)).toBe(2);
    expect(revokePrd07Device(first.device)).toBe(0);
    expect(resolve(firstPacket, first)).toBeUndefined();
    expect(resolvePrd07FramePacket(secondPacket, secondScope, secondFrame, secondOwner, first.device,
      first.generation, "right", 7)).toBeUndefined();
    expect(resolve(otherPacket, other)).toBeDefined();
    const restoredScope = createPrd07FrameScope(first.renderer, first.device, first.generation + 1);
    const restoredFrame = beginPrd07Frame(restoredScope, first.renderer, first.device, first.generation + 1, first.view, first.index);
    expect(resolvePrd07FramePacket(firstPacket, restoredScope, restoredFrame, first.renderer, first.device,
      first.generation + 1, first.view, first.index)).toBeUndefined();
    disposePrd07FrameScope(restoredScope);
    disposePrd07FrameScope(other.scope);
  });

  it("does not revoke a restored device generation when an older generation retires late", () => {
    const old = setup();
    const freshScope = createPrd07FrameScope(old.renderer, old.device, old.generation + 1);
    const freshFrame = beginPrd07Frame(freshScope, old.renderer, old.device, old.generation + 1, old.view, old.index);
    const freshWriter = createPrd07FrameWriter(freshFrame);
    setDry(old.writer); setDry(freshWriter);
    const oldPacket = old.writer.publish(), freshPacket = freshWriter.publish();
    expect(revokePrd07DeviceGeneration(old.device, old.generation)).toBe(1);
    expect(revokePrd07DeviceGeneration(old.device, old.generation)).toBe(0);
    expect(resolve(oldPacket, old)).toBeUndefined();
    expect(resolvePrd07FramePacket(freshPacket, freshScope, freshFrame, old.renderer, old.device,
      old.generation + 1, old.view, old.index)).toBeDefined();
    disposePrd07FrameScope(freshScope);
  });

  it("rejects unverified borrowed textures without inspecting or disposing them", () => {
    const ctx = setup();
    let reads = 0;
    const texture = new Proxy({}, {
      get() { reads += 1; throw new Error("unexpected texture read"); },
      getOwnPropertyDescriptor() { reads += 1; throw new Error("unexpected texture descriptor"); }
    });
    expect(() => ctx.writer.setWetness(0.5, 0.62, 0, 0, texture as unknown as null)).toThrow(/TEXTURE_UNVERIFIED/);
    expect(reads).toBe(0);
    setDry(ctx.writer);
    const packet = ctx.writer.publish();
    expect(resolve(packet, ctx)!.wetness.puddleNoise).toBeNull();
    endPrd07Frame(ctx.frame);
    disposePrd07FrameScope(ctx.scope);
    expect(reads).toBe(0);
  });

  it("rejects getter-backed or proxied scalar inputs without evaluating them", () => {
    const ctx = setup();
    let calls = 0;
    const bad = new Proxy({}, {
      get() { calls += 1; throw new Error("unexpected get"); },
      getOwnPropertyDescriptor() { calls += 1; throw new Error("unexpected descriptor"); }
    });
    expect(() => ctx.writer.setWetness(bad as number, 0.62, 0, 0, null)).toThrow(/NUMBER_INVALID/);
    expect(() => ctx.writer.beginFog(bad as number, 0, 10)).toThrow(/NUMBER_INVALID/);
    ctx.writer.beginFog(5, 0, 10);
    expect(() => ctx.writer.setFogA(bad as number, 0, 0, 0)).toThrow(/NUMBER_INVALID/);
    expect(() => ctx.writer.addFogVolume(bad as "box", 0, 0, 0, 1, 1, 1, 1)).toThrow(/SHAPE_INVALID/);
    expect(calls).toBe(0);
    disposePrd07FrameScope(ctx.scope);
  });

  it("does not inspect forged capability proxies or opaque renderer/device identities", () => {
    let calls = 0;
    const trap = () => { calls += 1; throw new Error("unexpected proxy access"); };
    const renderer = new Proxy({}, { get: trap, getOwnPropertyDescriptor: trap });
    const device = new Proxy({}, { get: trap, getOwnPropertyDescriptor: trap });
    const scope = createPrd07FrameScope(renderer, device, 1);
    const frame = beginPrd07Frame(scope, renderer, device, 1, "main", 0);
    const writer = createPrd07FrameWriter(frame);
    setDry(writer);
    const packet = writer.publish();
    const fakeScope = new Proxy(scope, { get: trap, getOwnPropertyDescriptor: trap });
    const fakeFrame = new Proxy(frame, { get: trap, getOwnPropertyDescriptor: trap });
    const fakePacket = new Proxy(packet, { get: trap, getOwnPropertyDescriptor: trap });
    expect(resolvePrd07FramePacket(packet, fakeScope, frame, renderer, device, 1, "main", 0)).toBeUndefined();
    expect(resolvePrd07FramePacket(fakePacket, scope, frame, renderer, device, 1, "main", 0)).toBeUndefined();
    expect(resolvePrd07FramePacket(packet, scope, fakeFrame, renderer, device, 1, "main", 0)).toBeUndefined();
    expect(resolvePrd07FramePacket(packet, scope, frame, renderer, device, 1, "main", 0)).toBeDefined();
    disposePrd07FrameScope(scope);
    expect(calls).toBe(0);
  });

  it("requires complete finite fog data, explicit wetness, and bounded volume inputs", () => {
    const ctx = setup();
    expect(() => ctx.writer.publish()).toThrow(/WETNESS_REQUIRED/);
    expect(() => ctx.writer.setWetness(NaN, 0.62, 0, 0, null)).toThrow(/NUMBER_INVALID/);
    expect(() => ctx.writer.setWetness(2, 0.62, 0, 0, null)).toThrow(/WETNESS_INVALID/);
    setDry(ctx.writer);
    expect(() => ctx.writer.beginFog(7, 0, 10)).toThrow(/FOG_MODE_INVALID/);
    expect(() => ctx.writer.beginFog(5, 0, Number.MAX_VALUE)).toThrow(/NUMBER_INVALID/);
    setFog(ctx.writer);
    expect(() => ctx.writer.addFogVolume("box", 0, 0, 0, 0, 1, 1, 1)).toThrow(/VOLUME_INVALID/);
    expect(() => ctx.writer.addFogVolume("box", 0, 0, 0, 1, 1, 1, -1)).toThrow(/VOLUME_INVALID/);
    for (let i = 0; i < 8; i += 1) ctx.writer.addFogVolume("ellipsoid", i, 0, 0, 1, 1, 1, 0.1);
    expect(() => ctx.writer.addFogVolume("box", 0, 0, 0, 1, 1, 1, 1)).toThrow(/VOLUME_INVALID/);
    expect(resolve(ctx.writer.publish(), ctx)!.fog!.volumes).toHaveLength(8);
    disposePrd07FrameScope(ctx.scope);
  });

  it("does not publish a partial fog block or publish after revocation", () => {
    const ctx = setup();
    setDry(ctx.writer);
    ctx.writer.beginFog(1, 0, 10);
    ctx.writer.setFogA(0, 0, 0, 0);
    expect(() => ctx.writer.publish()).toThrow(/FOG_INCOMPLETE/);
    expect(endPrd07Frame(ctx.frame)).toBe(true);
    expect(() => ctx.writer.setFogB(0, 0, 0, 0)).toThrow(/WRITER_CLOSED/);
    expect(() => ctx.writer.publish()).toThrow(/WRITER_CLOSED/);
    disposePrd07FrameScope(ctx.scope);
  });

  it("rejects invalid or incomplete scope and frame identities", () => {
    expect(() => createPrd07FrameScope(null as never, {}, 0)).toThrow(/SCOPE_INVALID/);
    expect(() => createPrd07FrameScope({}, {}, -1)).toThrow(/SCOPE_INVALID/);
    expect(() => createPrd07FrameScope({}, {}, Infinity)).toThrow(/SCOPE_INVALID/);
    const renderer = {}, device = {}, scope = createPrd07FrameScope(renderer, device, 0);
    expect(() => beginPrd07Frame(scope, renderer, device, 0, "", 0)).toThrow(/IDENTITY_INVALID/);
    expect(() => beginPrd07Frame(scope, renderer, device, 0, NaN, 0)).toThrow(/IDENTITY_INVALID/);
    expect(() => beginPrd07Frame(scope, renderer, device, 0, "main", 1.5)).toThrow(/IDENTITY_INVALID/);
    expect(() => createPrd07FrameWriter({} as never)).toThrow(/WRITER_UNAVAILABLE/);
    expect(disposePrd07FrameScope(scope)).toBe(true);
  });
});
