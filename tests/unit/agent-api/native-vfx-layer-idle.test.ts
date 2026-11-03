import { describe, expect, it, vi } from "vitest";
import { createAppEffects } from "../../../packages/engine/src/agent-api/vfx/effects-api";
import type { AuraApp } from "../../../packages/engine/src/agent-api/index";
import type { ProductionEffectSystem } from "../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";

type Frame = { readonly dt: number };

function harness(options: { readonly synchronousFrame?: number } = {}) {
  const frames = new Set<(frame: Frame) => void>();
  const disposers = new Set<() => void>();
  const live = new Set<string>();
  const emitted: string[] = [];
  const removed: string[] = [];
  let onAdd: (() => void) | undefined;
  let failNextSubscription = false;
  const app = {
    onFrame(callback: (frame: Frame) => void) {
      if (failNextSubscription) {
        failNextSubscription = false;
        throw new Error("subscription failed");
      }
      frames.add(callback);
      if (options.synchronousFrame !== undefined) callback({ dt: options.synchronousFrame });
      return () => { frames.delete(callback); };
    }
  } as unknown as AuraApp;
  const system = {
    onDispose(callback: () => void) { disposers.add(callback); return () => { disposers.delete(callback); }; },
    addInstance(id: string) { live.add(id); emitted.push(id); onAdd?.(); return id; },
    removeInstance(id: string) { live.delete(id); removed.push(id); },
    instanceAlive(id: string) { return live.has(id); },
    clearRuntimeParticles: vi.fn(() => { live.clear(); }),
    diagnostics: { note: vi.fn() }
  } as unknown as ProductionEffectSystem;
  const fx = createAppEffects(app, system);
  const spawn = (at: number) => fx.spawn({ name: "delayed", layers: [{ type: "emitter", at }] }, [0, 0, 0]);
  return {
    fx, frames, emitted, removed, live, spawn,
    step(dt: number) { for (const frame of [...frames]) frame({ dt }); },
    snapshot() { return [...frames]; },
    dispose() { for (const dispose of [...disposers]) dispose(); disposers.clear(); },
    onAdd(callback: () => void) { onAdd = callback; },
    failNextSubscription() { failNextSubscription = true; }
  };
}

describe("delayed effect frame lifecycle", () => {
  it("unsubscribes after the final due layer and subscribes again for later work", () => {
    const h = harness();
    const first = h.spawn(0.2);
    expect(h.frames.size).toBe(1);
    h.step(0.1);
    expect(h.emitted).toHaveLength(0);
    expect(h.frames.size).toBe(1);
    h.step(0.1);
    expect(h.emitted).toHaveLength(1);
    expect(h.frames.size).toBe(0);
    expect(first.alive).toBe(true);

    h.spawn(0.3);
    expect(h.frames.size).toBe(1);
    h.step(0.3);
    expect(h.emitted).toHaveLength(2);
    expect(h.frames.size).toBe(0);
  });

  it("unsubscribes immediately when the last pending handle is stopped", () => {
    const h = harness();
    const first = h.spawn(0.1);
    const second = h.spawn(0.2);
    const queuedFrame = h.snapshot()[0]!;
    first.stop();
    expect(h.frames.size).toBe(1);
    second.stop();
    expect(h.frames.size).toBe(0);
    expect(first.alive).toBe(false);
    expect(second.alive).toBe(false);
    queuedFrame({ dt: 1 });
    expect(h.emitted).toHaveLength(0);
  });

  it("clears queued effects and ignores a callback already copied by the frame loop", () => {
    const h = harness();
    const handle = h.spawn(0.1);
    const queuedFrame = h.snapshot()[0]!;
    h.fx.clear();
    expect(h.frames.size).toBe(0);
    expect(handle.alive).toBe(false);
    queuedFrame({ dt: 1 });
    expect(h.emitted).toHaveLength(0);
    h.spawn(0.1);
    h.step(0.1);
    expect(h.emitted).toHaveLength(1);
  });

  it("cancels pending work when the effect system is disposed", () => {
    const h = harness();
    const handle = h.spawn(0.1);
    const queuedFrame = h.snapshot()[0]!;
    h.dispose();
    expect(h.frames.size).toBe(0);
    expect(handle.alive).toBe(false);
    queuedFrame({ dt: 1 });
    expect(h.emitted).toHaveLength(0);
    const late = h.spawn(0.1);
    expect(late.alive).toBe(false);
    expect(h.frames.size).toBe(0);
  });

  it("keeps the existing subscription when a fired layer schedules another one", () => {
    const h = harness();
    let scheduled = false;
    h.onAdd(() => {
      if (!scheduled) {
        scheduled = true;
        h.spawn(0.2);
      }
    });
    h.spawn(0.1);
    h.step(0.1);
    expect(h.emitted).toHaveLength(1);
    expect(h.frames.size).toBe(1);
    h.step(0.19);
    expect(h.emitted).toHaveLength(1);
    h.step(0.02);
    expect(h.emitted).toHaveLength(2);
    expect(h.frames.size).toBe(0);
  });

  it("honors reentrant cancellation of a later group while processing the frame", () => {
    const h = harness();
    h.spawn(0.1);
    const later = h.spawn(0.1);
    h.onAdd(() => later.stop());
    h.step(0.1);
    expect(h.emitted).toHaveLength(1);
    expect(later.alive).toBe(false);
    expect(h.frames.size).toBe(0);
  });

  it("removes an emitter when its own handle is stopped reentrantly during creation", () => {
    const h = harness();
    const handle = h.spawn(0.1);
    h.onAdd(() => handle.stop());
    h.step(0.1);
    expect(h.emitted).toHaveLength(1);
    expect(h.removed).toEqual(h.emitted);
    expect(h.live.size).toBe(0);
    expect(handle.alive).toBe(false);
    expect(h.frames.size).toBe(0);
  });

  it("does not republish an emitter when clear is called reentrantly during creation", () => {
    const h = harness();
    const handle = h.spawn(0.1);
    h.onAdd(() => h.fx.clear());
    h.step(0.1);
    expect(h.emitted).toHaveLength(1);
    expect(h.live.size).toBe(0);
    expect(handle.alive).toBe(false);
    expect(h.frames.size).toBe(0);
  });

  it("handles a frame callback fired synchronously during subscription", () => {
    const h = harness({ synchronousFrame: 1 });
    h.spawn(0.1);
    expect(h.emitted).toHaveLength(1);
    expect(h.frames.size).toBe(0);
  });

  it("does not advance delayed work for invalid or negative frame deltas", () => {
    const h = harness();
    h.spawn(0.1);
    h.step(Number.NaN);
    h.step(-1);
    h.step(0);
    expect(h.emitted).toHaveLength(0);
    expect(h.frames.size).toBe(1);
    h.step(0.1);
    expect(h.emitted).toHaveLength(1);
    expect(h.frames.size).toBe(0);
  });

  it("rejects non-finite delays before spawning or subscribing", () => {
    const h = harness();
    for (const at of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => h.fx.spawn({ name: "bad-delay", layers: [{ type: "emitter" }, { type: "emitter", at }] }, [0, 0, 0]))
        .toThrow("Effect layer delay must be finite");
    }
    expect(h.emitted).toHaveLength(0);
    expect(h.frames.size).toBe(0);
  });

  it("leaves no timer behind after subscription failure and allows a later retry", () => {
    const h = harness();
    h.failNextSubscription();
    expect(() => h.spawn(0.1)).toThrow("subscription failed");
    expect(h.frames.size).toBe(0);
    h.spawn(0.1);
    h.step(0.1);
    expect(h.emitted).toHaveLength(1);
    expect(h.frames.size).toBe(0);
  });
});
