import { describe, expect, it, vi } from "vitest";
import { Collider, RigidBody, Shape } from "@aura3d/physics/solverless";
import { Constraint } from "../../../packages/physics/src/Constraint.js";
import type { PhysicsWorldConstructor } from "../../../packages/engine/src/agent-api/physics/PhysicsWorldAccess.js";
import { v5PhysicsCore } from "../../../packages/engine/src/agent-api/physics/v5/V5PhysicsCore.js";
import { V5PhysicsConnectorError, type V5PhysicsConnector } from "../../../packages/engine/src/agent-api/physics/v5/V5PhysicsConnector.js";
import { createV5PhysicsProvider } from "../../../packages/engine/src/agent-api/physics/v5/V5PhysicsProvider.js";

// These source modules must remain usable without evaluating any 4.x world or
// optional adapter. An accidental static edge makes the test module fail.
vi.mock("@aura3d/physics", () => { throw new Error("Legacy physics root was evaluated."); });
vi.mock("@aura3d/physics/world", () => { throw new Error("Legacy physics world was evaluated."); });
vi.mock("@aura3d/physics-rapier", () => { throw new Error("Optional physics adapter was evaluated."); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

class WorldStub {}
const worldConstructor = WorldStub as unknown as PhysicsWorldConstructor;
const connector = (initialize: V5PhysicsConnector["initialize"] = () => worldConstructor): V5PhysicsConnector => ({
  core: v5PhysicsCore,
  initialize
});

describe("v5 physics connector provider", () => {
  it("exposes one frozen identity containing the actual neutral physics constructors", () => {
    expect(Object.isFrozen(v5PhysicsCore)).toBe(true);
    expect(v5PhysicsCore).toMatchObject({ Collider, Constraint, RigidBody, Shape });
    expect(v5PhysicsCore.Collider).toBe(Collider);
    expect(v5PhysicsCore.Constraint).toBe(Constraint);
    expect(v5PhysicsCore.RigidBody).toBe(RigidBody);
    expect(v5PhysicsCore.Shape).toBe(Shape);
  });

  it("reports a missing connector and permits registration and retry", async () => {
    const provider = createV5PhysicsProvider();
    expect(() => provider.requireReady()).toThrow(/install.*connector.*setConnector/i);

    const first = provider.preload();
    expect(provider.preload()).toBe(first);
    expect(() => provider.setConnector(() => connector())).toThrow(/while loading/i);
    const failure = await first.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(V5PhysicsConnectorError);
    expect(failure).toMatchObject({ code: "CONNECTOR_MISSING", message: expect.stringMatching(/install.*connector.*setConnector/i) });
    expect(() => provider.requireReady()).toThrow(/install.*connector.*setConnector/i);

    provider.setConnector(() => connector());
    await provider.preload();
    expect(provider.requireReady()).toBe(WorldStub);
  });

  it("coalesces concurrent and reentrant loading without constructing a world", async () => {
    const loaded = deferred<V5PhysicsConnector>();
    const initialized = deferred<PhysicsWorldConstructor>();
    const initStarted = deferred<void>();
    let constructions = 0;
    class DeferredWorld { constructor() { constructions += 1; } }
    let nested: Promise<void> | undefined;
    const provider = createV5PhysicsProvider();
    const load = vi.fn(() => { nested = provider.preload(); return loaded.promise; });
    const initialize = vi.fn((core: typeof v5PhysicsCore) => {
      expect(core).toBe(v5PhysicsCore);
      initStarted.resolve();
      return initialized.promise;
    });
    provider.setConnector(load);
    const first = provider.preload();
    expect(provider.preload()).toBe(first);
    expect(load).not.toHaveBeenCalled();
    expect(() => provider.requireReady()).toThrow(/still loading/i);
    await Promise.resolve();
    expect(nested).toBe(first);
    loaded.resolve(connector(initialize));
    await initStarted.promise;
    expect(() => provider.requireReady()).toThrow(/still loading/i);
    expect(constructions).toBe(0);
    initialized.resolve(DeferredWorld as unknown as PhysicsWorldConstructor);
    await first;
    expect(provider.requireReady()).toBe(DeferredWorld);
    expect(constructions).toBe(0);
    await provider.preload();
    expect(load).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(() => provider.setConnector(() => connector())).toThrow(/after it is ready/i);
  });

  it("rejects even a duplicate core with identical constructors before initialization", async () => {
    const provider = createV5PhysicsProvider();
    const initialize = vi.fn(() => worldConstructor);
    const duplicate = Object.freeze({ ...v5PhysicsCore });
    expect(duplicate).not.toBe(v5PhysicsCore);
    expect(duplicate.RigidBody).toBe(v5PhysicsCore.RigidBody);
    provider.setConnector(() => ({ core: duplicate, initialize }));

    const failure = await provider.preload().catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "CONNECTOR_CORE_MISMATCH", message: expect.stringMatching(/duplicate v5 core/i) });
    expect(initialize).not.toHaveBeenCalled();
    expect(() => provider.requireReady()).toThrow(/not ready/i);

    provider.setConnector(() => connector(initialize));
    await provider.preload();
    expect(initialize).toHaveBeenCalledWith(v5PhysicsCore);
    expect(provider.requireReady()).toBe(WorldStub);
  });

  it.each([
    { phase: "load", reason: new Error("module unavailable"), code: "CONNECTOR_LOAD_FAILED" },
    { phase: "initialize", reason: undefined, code: "CONNECTOR_INITIALIZATION_FAILED" }
  ] as const)("retains a $phase failure and permits an immediate retry", async ({ phase, reason, code }) => {
    const provider = createV5PhysicsProvider();
    let failed = false;
    const initialize = vi.fn(() => {
      if (phase === "initialize" && !failed) { failed = true; throw reason; }
      return worldConstructor;
    });
    const load = vi.fn(() => {
      if (phase === "load" && !failed) { failed = true; throw reason; }
      return connector(initialize);
    });
    provider.setConnector(load);
    const first = provider.preload();
    const joined = provider.preload();
    expect(first).toBe(joined);
    let failure: unknown;
    const recovered = first.catch((error: unknown) => { failure = error; return provider.preload(); });
    await recovered;
    expect(failure).toMatchObject({ code });
    expect(Object.hasOwn(failure as object, "cause")).toBe(true);
    expect((failure as Error).cause).toBe(reason);
    expect(load).toHaveBeenCalledTimes(2);
    expect(provider.requireReady()).toBe(WorldStub);
  });

  it("keeps the failure as the cause of unready access and accepts a replacement after failure", async () => {
    const provider = createV5PhysicsProvider();
    const reason = new Error("backend failed");
    provider.setConnector(() => connector(() => { throw reason; }));
    const failure = await provider.preload().catch((error: unknown) => error);
    try {
      provider.requireReady();
      expect.fail("Expected an unready provider to throw.");
    } catch (error) {
      expect(error).toMatchObject({ code: "PHYSICS_NOT_READY", cause: failure });
    }
    provider.setConnector(() => connector());
    await provider.preload();
    expect(provider.requireReady()).toBe(WorldStub);
  });

  it("rejects an invalid connector and nonconstructable worlds without allocating", async () => {
    const provider = createV5PhysicsProvider();
    provider.setConnector(() => ({ core: v5PhysicsCore } as V5PhysicsConnector));
    await expect(provider.preload()).rejects.toMatchObject({ code: "CONNECTOR_INVALID" });
    provider.setConnector(() => connector(() => (() => undefined) as unknown as PhysicsWorldConstructor));
    await expect(provider.preload()).rejects.toMatchObject({ code: "CONNECTOR_INVALID" });

    const cause = new Error("constructor prototype failed");
    const malformed = new Proxy(class {}, {
      get(target, key, receiver) {
        if (key === "prototype") throw cause;
        return Reflect.get(target, key, receiver);
      }
    });
    provider.setConnector(() => connector(() => malformed as unknown as PhysicsWorldConstructor));
    const failure = await provider.preload().catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "CONNECTOR_INVALID", cause });
  });

  it("shares core identity but not readiness between independent providers", async () => {
    const first = createV5PhysicsProvider();
    const second = createV5PhysicsProvider();
    const initialization = deferred<PhysicsWorldConstructor>();
    const received: Array<typeof v5PhysicsCore> = [];
    class OtherWorld {}
    first.setConnector(() => connector((core) => { received.push(core); return initialization.promise; }));
    second.setConnector(() => connector((core) => { received.push(core); return OtherWorld as unknown as PhysicsWorldConstructor; }));
    const pending = first.preload();
    await second.preload();
    expect(second.requireReady()).toBe(OtherWorld);
    expect(() => first.requireReady()).toThrow(/still loading/i);
    initialization.resolve(worldConstructor);
    await pending;
    expect(first.requireReady()).toBe(WorldStub);
    expect(received).toEqual([v5PhysicsCore, v5PhysicsCore]);
    expect(received[0]).toBe(received[1]);
  });
});
