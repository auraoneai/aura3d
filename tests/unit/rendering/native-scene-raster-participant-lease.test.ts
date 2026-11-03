import { describe, expect, it, vi } from "vitest";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { createSceneRasterSnapshot } from "../../../packages/rendering/src/renderer/SceneRasterSnapshot";
import { assertSceneRasterParticipantArenaScope, createSceneRasterParticipantArena } from "../../../packages/rendering/src/renderer/SceneRasterParticipantLease";

function fixture(maxBytes = 4096, maxBufferBytes = 1024, maxParticipants = 8, maxFields = 32) {
  const device = new MockRenderDevice(), owner = {}, view = {}, target = {}, plan = {};
  Object.defineProperty(device, "generation", { value: 1, writable: true, configurable: true });
  device.beginFrame(8, 8);
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const snapshot = createSceneRasterSnapshot({ owner, device, viewId: view, frameId: 1, viewMatrix: identity,
    projectionMatrix: identity, viewProjectionMatrix: identity, unjitteredViewProjectionMatrix: identity, jitterClip: [0, 0],
    depth: { mode: "standard", clipRange: "minus-one-to-one" }, targetExtent: { width: 8, height: 8 },
    viewport: { x: 0, y: 0, width: 8, height: 8 }, scissor: null, cssExtent: null, devicePixelRatio: 1 });
  const arena = createSceneRasterParticipantArena(snapshot, owner, device, view, 1, target, plan,
    maxBytes, maxBufferBytes, maxParticipants, maxFields);
  return { device, owner, view, target, plan, snapshot, arena };
}

function buffers() {
  const format = new VertexFormat([{ semantic: "position", components: 3, offset: 0 }], 12);
  return { vertex: new VertexBuffer(format, 2), index: new IndexBuffer([0, 1], 2) };
}

describe("staged scene raster participant packets", () => {
  it("compares ordered forward and offscreen shadow packets, including raw bytes and effective values", () => {
    const f = fixture(), { vertex, index } = buffers();
    const item = {}, geometry = {}, material = {}, shader = {}, shadowItem = {}, sampler = {};
    const transform = Float32Array.from([1, 0, 0, 1]);
    const capture = () => {
      const lease = f.arena.createLease();
      const forward = lease.addParticipant("forward", item, geometry, material, shader);
      lease.addScalar(forward, "draw.start", 0);
      lease.addScalar(forward, "coverage.dash", 2);
      lease.addVector(forward, "model", transform);
      lease.addResource(forward, "sampler", sampler);
      lease.addBuffer(forward, "vertex.0", vertex);
      lease.addBuffer(forward, "indices", index);
      lease.addParticipant("shadow", shadowItem, geometry, material, shader);
      lease.seal();
      return lease;
    };
    try {
      const a = capture(), b = capture();
      expect(a.staged).toBe(true);
      expect(a.matches(b)).toBe(true);
      expect(f.arena.participantCount).toBe(4);
      expect(f.arena.retainedBytes).toBeGreaterThan(0);
      const bytes = new Uint8Array(vertex.data);
      bytes[0] = 17; // A raw edit deliberately bypasses the revision counter.
      expect(a.matches(b)).toBe(false);
      bytes[0] = 0;
      index.data[0] = 1;
      expect(a.matches(b)).toBe(false);
      index.data[0] = 0;
      transform[0] = 2;
      expect(a.matches(b)).toBe(false);
      transform[0] = 1;
      expect(a.matches(b)).toBe(true);
      const retained = f.arena.retainedBytes;
      a.dispose();
      expect(f.arena.retainedBytes).toBeLessThan(retained);
      expect(a.matches(b)).toBe(false);
      b.dispose();
      expect([f.arena.retainedBytes, f.arena.participantCount, f.arena.fieldCount]).toEqual([0, 0, 0]);
    } finally { f.arena.dispose(); vertex.dispose(); index.dispose(); f.device.endFrame(); f.device.dispose(); }
  });

  it("checks exact packet and scope identities without inspecting opaque objects or proxies", () => {
    const f = fixture(), a = f.arena.createLease(), b = f.arena.createLease();
    let traps = 0;
    const opaque = new Proxy({}, { get() { traps += 1; throw new Error("unexpected access"); },
      getPrototypeOf() { traps += 1; throw new Error("unexpected prototype"); } });
    try {
      const first = a.addParticipant("forward", opaque, opaque, opaque, opaque);
      const second = b.addParticipant("forward", opaque, opaque, opaque, opaque);
      a.addResource(first, "texture", opaque); b.addResource(second, "texture", opaque);
      a.addScalar(first, "alpha", 0.5); b.addScalar(second, "alpha", 0.6);
      a.seal(); b.seal();
      expect(a.matches(b)).toBe(false);
      const wrapped = new Proxy(a, { get() { traps += 1; throw new Error("unexpected lease access"); } });
      expect(a.matches(wrapped)).toBe(false);
      expect(() => assertSceneRasterParticipantArenaScope(f.arena, f.snapshot, f.owner, f.device, f.view, 1, f.target, f.plan)).not.toThrow();
      const wrappedArena = new Proxy(f.arena, { get() { traps += 1; throw new Error("unexpected arena access"); } });
      expect(() => assertSceneRasterParticipantArenaScope(wrappedArena, f.snapshot, f.owner, f.device, f.view, 1, f.target, f.plan)).toThrow(/stale/);
      expect(() => assertSceneRasterParticipantArenaScope(f.arena, f.snapshot, f.owner, f.device, f.view, 1, {}, f.plan)).toThrow(/stale/);
      expect(() => assertSceneRasterParticipantArenaScope(f.arena, f.snapshot, f.owner, f.device, f.view, 1, f.target, {})).toThrow(/stale/);
      expect(traps).toBe(0);
      f.device.endFrame();
      f.device.beginFrame(8, 8);
      expect(() => a.matches(b)).toThrow(/stale/);
    } finally { f.arena.dispose(); f.device.endFrame(); f.device.dispose(); }
  });

  it("keeps forward order and the separate shadow-caster order in the comparison", () => {
    const f = fixture(4096, 1024, 12, 16), left = {}, right = {}, offscreen = {}, otherCaster = {};
    const geometry = {}, material = {}, shader = {};
    const capture = (first: object, second: object, caster: object) => {
      const lease = f.arena.createLease();
      lease.addParticipant("forward", first, geometry, material, shader);
      lease.addParticipant("forward", second, geometry, material, shader);
      lease.addParticipant("shadow", caster, geometry, material, shader);
      lease.seal();
      return lease;
    };
    try {
      const original = capture(left, right, offscreen);
      expect(original.matches(capture(right, left, offscreen))).toBe(false);
      expect(original.matches(capture(left, right, otherCaster))).toBe(false);
      expect(original.matches(capture(left, right, offscreen))).toBe(true);
    } finally { f.arena.dispose(); f.device.endFrame(); f.device.dispose(); }
  });

  it("rejects unauthoritative, accessor-backed, shared and detached source data without retaining bytes", () => {
    const f = fixture(), { vertex, index } = buffers(), lease = f.arena.createLease();
    const slot = lease.addParticipant("forward", {}, {}, {}, {});
    let calls = 0;
    try {
      const wrapped = new Proxy(vertex, { get() { calls += 1; throw new Error("unexpected buffer access"); },
        getPrototypeOf() { calls += 1; throw new Error("unexpected buffer prototype"); } });
      expect(() => lease.addBuffer(slot, "proxy", wrapped)).toThrow(/genuine CPU buffer/);
      const original = Object.getOwnPropertyDescriptor(vertex, "data")!;
      Object.defineProperty(vertex, "data", { configurable: true, get() { calls += 1; throw new Error("unexpected data getter"); } });
      expect(() => lease.addBuffer(slot, "getter", vertex)).toThrow(/own data property/);
      if (typeof SharedArrayBuffer !== "undefined") {
        Object.defineProperty(vertex, "data", { ...original, value: new SharedArrayBuffer(24) });
        expect(() => lease.addBuffer(slot, "shared", vertex)).toThrow(/ArrayBuffer/);
      }
      Object.defineProperty(vertex, "data", original);
      Object.defineProperty(vertex, "upload", { configurable: true, get() { calls += 1; throw new Error("unexpected upload getter"); } });
      expect(() => lease.addBuffer(slot, "custom-upload", vertex)).toThrow(/unverified upload/);
      Reflect.deleteProperty(vertex, "upload");
      const vector = new Float32Array([1, 2]);
      Object.defineProperty(vector, Symbol.iterator, { get() { calls += 1; throw new Error("unexpected iterator"); } });
      lease.addVector(slot, "vector", vector);
      expect(calls).toBe(0);
      const before = f.arena.retainedBytes;
      index.upload(f.device);
      expect(() => lease.addBuffer(slot, "uploaded", index)).toThrow(/attempted GPU upload/);
      expect(f.arena.retainedBytes).toBe(before);
      if (typeof structuredClone === "function") {
        structuredClone(vertex.data, { transfer: [vertex.data] });
        expect(() => lease.addBuffer(slot, "detached", vertex)).toThrow(/ArrayBuffer/);
      }
    } finally { f.arena.dispose(); vertex.dispose(); index.dispose(); f.device.endFrame(); f.device.dispose(); }
  });

  it("enforces per-buffer and aggregate budgets across live packets and frees reservations", () => {
    const f = fixture(80, 32, 2, 3), { vertex } = buffers();
    try {
      const a = f.arena.createLease(), b = f.arena.createLease();
      expect(() => f.arena.createLease()).toThrow(/lease count/);
      const x = a.addParticipant("forward", {}, {}, {}, {}), y = b.addParticipant("shadow", {}, {}, {}, {});
      expect(() => a.addParticipant("shadow", {}, {}, {}, {})).toThrow(/count/);
      a.addBuffer(x, "v", vertex);
      b.addBuffer(y, "v", vertex);
      const before = f.arena.retainedBytes;
      expect(() => a.addVector(x, "too-large", new Float32Array(9))).toThrow(/per-buffer/);
      expect(() => a.addVector(x, "aggregate", new Float32Array(7))).toThrow(/aggregate/);
      expect(f.arena.retainedBytes).toBe(before);
      a.dispose();
      b.addVector(y, "valid", new Float32Array(4));
      b.dispose();
      expect([f.arena.retainedBytes, f.arena.participantCount, f.arena.fieldCount]).toEqual([0, 0, 0]);
    } finally { f.arena.dispose(); vertex.dispose(); f.device.endFrame(); f.device.dispose(); }
  });

  it("rejects a CPU buffer even when its first GPU upload attempt failed", () => {
    const f = fixture(), { vertex } = buffers(), lease = f.arena.createLease();
    const slot = lease.addParticipant("forward", {}, {}, {}, {});
    const failedCreate = vi.spyOn(f.device, "createBuffer").mockImplementationOnce(() => { throw new Error("upload failed"); });
    try {
      expect(() => vertex.upload(f.device)).toThrow(/upload failed/);
      expect(() => lease.addBuffer(slot, "vertex", vertex)).toThrow(/attempted GPU upload/);
      expect(f.arena.retainedBytes).toBe(0);
    } finally { failedCreate.mockRestore(); f.arena.dispose(); vertex.dispose(); f.device.endFrame(); f.device.dispose(); }
  });

  it("releases outstanding copied data when the arena is disposed", () => {
    const f = fixture(), { vertex } = buffers(), lease = f.arena.createLease();
    const slot = lease.addParticipant("forward", {}, {}, {}, {});
    try {
      lease.addBuffer(slot, "vertex", vertex);
      lease.seal();
      expect(f.arena.retainedBytes).toBeGreaterThan(0);
      f.arena.dispose();
      expect([f.arena.retainedBytes, f.arena.participantCount, f.arena.fieldCount]).toEqual([0, 0, 0]);
      expect(() => lease.matches(lease)).toThrow(/stale/);
      expect(() => lease.addScalar(slot, "late", 1)).toThrow(/stale/);
      expect(() => lease.dispose()).not.toThrow();
    } finally { f.arena.dispose(); vertex.dispose(); f.device.endFrame(); f.device.dispose(); }
  });

  it("does not publish a packet when frame checks mutate a source during capture", () => {
    const f = fixture(), { vertex } = buffers(), lease = f.arena.createLease();
    const slot = lease.addParticipant("forward", {}, {}, {}, {});
    let uploadTriggered = false;
    try {
      Object.defineProperty(f.device, "contextLost", { configurable: true, get() {
        if (!uploadTriggered) { uploadTriggered = true; vertex.upload(f.device); }
        return false;
      } });
      expect(() => lease.addBuffer(slot, "vertex", vertex)).toThrow(/attempted GPU upload/);
      expect(f.arena.retainedBytes).toBe(0);
      Reflect.deleteProperty(f.device, "contextLost");

      const vector = new Float32Array([1, 2]);
      let checks = 0;
      Object.defineProperty(f.device, "contextLost", { configurable: true, get() {
        checks += 1;
        // The Mock token getter and the explicit loss check each read this
        // property once; the third read occurs after the vector was copied.
        if (checks === 3) vector[0] = 3;
        return false;
      } });
      expect(() => lease.addVector(slot, "transform", vector)).toThrow(/changed while it was copied/);
      expect(f.arena.retainedBytes).toBe(0);
    } finally { Reflect.deleteProperty(f.device, "contextLost"); f.arena.dispose(); vertex.dispose(); f.device.endFrame(); f.device.dispose(); }
  });

  it("reserves the aggregate budget before copying and rejects reentrant arena mutation", () => {
    const f = fixture(64, 32, 2, 2), lease = f.arena.createLease();
    const slot = lease.addParticipant("forward", {}, {}, {}, {}), vector = new Float32Array([1, 2, 3, 4]);
    let rejected = 0;
    const reservations: number[] = [];
    try {
      Object.defineProperty(f.device, "contextLost", { configurable: true, get() {
        reservations.push(f.arena.retainedBytes);
        try { lease.addVector(slot, "nested", vector); } catch { rejected += 1; }
        try { f.arena.dispose(); } catch { rejected += 1; }
        return false;
      } });
      lease.addVector(slot, "outer", vector);
      expect(rejected).toBeGreaterThan(0);
      expect(reservations).toContain(26);
      expect(f.arena.fieldCount).toBe(1);
      expect(f.arena.retainedBytes).toBe(26); // 16 data bytes + five UTF-16 name characters.
      Reflect.deleteProperty(f.device, "contextLost");
      lease.dispose();
      expect([f.arena.retainedBytes, f.arena.fieldCount]).toEqual([0, 0]);
    } finally { Reflect.deleteProperty(f.device, "contextLost"); f.arena.dispose(); f.device.endFrame(); f.device.dispose(); }
  });
});
