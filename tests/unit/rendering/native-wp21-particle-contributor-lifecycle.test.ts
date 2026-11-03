import { describe, expect, it, vi } from "vitest";

import "../../../packages/rendering/src/lanes/prd07";
import "../../../packages/rendering/src/lanes/prd11";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { createTrustedQrFlags, type QrFlags } from "../../../packages/rendering/src/contracts/core";
import { frameContributors, type FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import { sharedResourceRegistry } from "../../../packages/rendering/src/resources/ResourceRegistry";
import { ParticleGpuSim } from "../../../packages/rendering/src/vfx/ParticleGpuSim";
import * as particleContributors from "../../../packages/rendering/src/vfx/contributors";
import { disposePrd07GpuSimsForOwner, type GpuSimRequest } from "../../../packages/rendering/src/vfx/contributors";

const enabled = createTrustedQrFlags({ A3D_QR_VFX: true, A3D_QR_WEBGPU: true });
const disabled = createTrustedQrFlags({ A3D_QR_VFX: true });
const request = (nodeId: string): GpuSimRequest => ({
  nodeId,
  batchKey: nodeId,
  emitCount: 1,
  spec: { capacity: 4, lifetimeMax: 2 }
});

function makeDevice() {
  const device = new MockRenderDevice();
  const probe = { floatColorBuffer: true };
  Object.defineProperty(device, "probe", { value: probe });
  device.beginFrame(8, 8);
  return { device, probe };
}

function collect(device: MockRenderDevice, owner: object, requests: readonly GpuSimRequest[], flags: QrFlags = enabled) {
  const contributor = frameContributors(flags).find((entry) => entry.id === "prd07.gpuSim");
  if (!contributor?.collect) throw new Error("missing gpu sim contributor");
  const context = {
    device,
    postScopeId: owner,
    flags,
    source: { vfx: { gpuSimFeed: () => requests } },
    blackboard: new Map<string, unknown>(),
    timeSeconds: 0
  } as unknown as FrameContributorContext;
  contributor.collect([], context);
  return context.blackboard.get("prd07.gpuSims") as readonly { sim: ParticleGpuSim; emitCount: number }[];
}

describe("WP-21 production particle contributor lifecycle", () => {
  it("registers with frame flags, retires removed emitters, and preserves the other device", async () => {
    const a = makeDevice();
    const b = makeDevice();
    const ownerA = {}, ownerB = {};
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const all: ParticleGpuSim[] = [];
    try {
      const entriesA = collect(a.device, ownerA, [request("one"), request("two")]);
      const entriesB = collect(b.device, ownerB, [request("one")]);
      all.push(...entriesA.map((entry) => entry.sim), ...entriesB.map((entry) => entry.sim));
      const removed = entriesA[0]!.sim;
      const retained = entriesA[1]!.sim;
      const other = entriesB[0]!.sim;
      const removedState = removed.state!;
      const otherState = other.state!;
      expect(registry.size).toBe(before + 3);
      expect(a.device.getDiagnostics()).toMatchObject({ renderTargets: 8, shaders: 4, buffers: 2 });

      const next = collect(a.device, ownerA, [request("two")]);
      expect(next[0]!.sim).toBe(retained);
      expect(removed.state).toBeNull();
      expect(removedState.posTarget.disposed).toBe(true);
      expect(removedState.velTarget.disposed).toBe(true);
      expect(registry.size).toBe(before + 2);
      expect(a.device.getDiagnostics()).toMatchObject({ renderTargets: 4, shaders: 2, buffers: 1 });
      expect((await registry.rebuild(a.device)).failed).toEqual([]);
      expect(other.state!.posTarget).toBe(otherState.posTarget);
      expect(other.state!.velTarget).toBe(otherState.velTarget);
      expect(otherState.posTarget.disposed).toBe(false);
      expect(otherState.velTarget.disposed).toBe(false);

      collect(a.device, ownerA, []);
      expect(retained.state).toBeNull();
      expect(registry.size).toBe(before + 1);
      expect(a.device.getDiagnostics()).toMatchObject({ renderTargets: 0, shaders: 0, buffers: 0 });
      expect(other.state).not.toBeNull();
    } finally {
      for (const sim of all) { registry.unregister(sim); sim.dispose(); }
      a.device.dispose();
      b.device.dispose();
    }
  });

  it("retires the prior GPU simulation when float target support disappears", () => {
    const { device, probe } = makeDevice();
    const owner = {};
    const registry = sharedResourceRegistry();
    const before = registry.size;
    let sim: ParticleGpuSim | undefined;
    try {
      sim = collect(device, owner, [request("one")])[0]!.sim;
      expect(registry.size).toBe(before + 1);
      probe.floatColorBuffer = false;
      expect(collect(device, owner, [request("one")])).toEqual([]);
      expect(sim.state).toBeNull();
      expect(registry.size).toBe(before);
      expect(device.getDiagnostics()).toMatchObject({ renderTargets: 0, shaders: 0, buffers: 0 });
    } finally {
      if (sim) { registry.unregister(sim); sim.dispose(); }
      device.dispose();
    }
  });

  it("selects and updates registration from the current frame's flags", () => {
    const { device } = makeDevice();
    const owner = {};
    const registry = sharedResourceRegistry();
    const before = registry.size;
    let sim: ParticleGpuSim | undefined;
    try {
      sim = collect(device, owner, [request("one")], disabled)[0]!.sim;
      expect(registry.size).toBe(before);
      expect(collect(device, owner, [request("one")], enabled)[0]!.sim).toBe(sim);
      expect(registry.size).toBe(before + 1);
      expect(collect(device, owner, [request("one")], disabled)[0]!.sim).toBe(sim);
      expect(registry.size).toBe(before);
    } finally {
      if (sim) { registry.unregister(sim); sim.dispose(); }
      device.dispose();
    }
  });

  it("keeps emitters from different renderer owners isolated on the same device", () => {
    const { device } = makeDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const ownerA = {}, ownerB = {};
    const all: ParticleGpuSim[] = [];
    try {
      const a = collect(device, ownerA, [request("same")])[0]!.sim;
      const b = collect(device, ownerB, [request("same")])[0]!.sim;
      all.push(a, b);
      expect(a).not.toBe(b);
      expect(registry.size).toBe(before + 2);
      collect(device, ownerA, []);
      expect(a.state).toBeNull();
      expect(b.state).not.toBeNull();
      expect(collect(device, ownerB, [request("same")])[0]!.sim).toBe(b);
      expect(registry.size).toBe(before + 1);
    } finally {
      for (const sim of all) { registry.unregister(sim); sim.dispose(); }
      device.dispose();
    }
  });

  it("retires only the explicitly released renderer owner", () => {
    const { device } = makeDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const ownerA = {}, ownerB = {};
    const all: ParticleGpuSim[] = [];
    try {
      const a = collect(device, ownerA, [request("one")])[0]!.sim;
      const b = collect(device, ownerB, [request("one")])[0]!.sim;
      all.push(a, b);
      expect(registry.size).toBe(before + 2);
      disposePrd07GpuSimsForOwner(device, ownerA);
      disposePrd07GpuSimsForOwner(device, ownerA);
      expect(a.state).toBeNull();
      expect(b.state).not.toBeNull();
      expect(registry.size).toBe(before + 1);
      expect(device.getDiagnostics()).toMatchObject({ renderTargets: 4, shaders: 2, buffers: 1 });
    } finally {
      for (const sim of all) { registry.unregister(sim); sim.dispose(); }
      device.dispose();
    }
  });

  it("retires newly created simulations if a later emitter allocation fails", () => {
    const { device } = makeDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const create = device.createRenderTarget.bind(device);
    let calls = 0;
    const targets = vi.spyOn(device, "createRenderTarget").mockImplementation((descriptor) => {
      calls += 1;
      if (calls === 7) throw new Error("second emitter allocation failed");
      return create(descriptor);
    });
    try {
      expect(() => collect(device, {}, [request("one"), request("two")])).toThrow("second emitter allocation failed");
      expect(registry.size).toBe(before);
      expect(device.getDiagnostics()).toMatchObject({ renderTargets: 0, shaders: 0, buffers: 0 });
    } finally {
      targets.mockRestore();
      device.dispose();
    }
  });

  it("uses renderer-owned flags and retires emitters through real frame collection", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "probe", { value: { floatColorBuffer: true } });
    const renderer = new Renderer(device, {
      backend: "mock", width: 8, height: 8, qrFlags: enabled, shaderLibrary: createDefaultShaderLibrary()
    }, new TemporalHistory());
    const registry = sharedResourceRegistry();
    const before = registry.size;
    let requests = [request("one")];
    const source = {
      cameraPolicy: "identity" as const,
      renderItems: [],
      vfx: { feed: () => {}, gpuSimFeed: () => requests }
    };
    try {
      renderer.render({ source });
      expect(registry.size).toBe(before + 1);
      expect(device.drawCommands.map((command) => command.label)).toEqual(
        expect.arrayContaining(["prd07.gpuSim.pos", "prd07.gpuSim.vel"])
      );
      requests = [];
      renderer.render({ source });
      expect(registry.size).toBe(before);
    } finally {
      renderer.dispose();
    }
  });

  it("aggregates particle and other cleanup errors while retiring only the disposed renderer's emitters", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "probe", { value: { floatColorBuffer: true } });
    const options = { backend: "mock" as const, width: 8, height: 8, qrFlags: enabled, shaderLibrary: createDefaultShaderLibrary() };
    const historyA = new TemporalHistory();
    const rendererA = new Renderer(device, options, historyA);
    const rendererB = new Renderer(device, options, new TemporalHistory());
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const registrations = vi.spyOn(registry, "register");
    const source = (nodes: readonly string[]) => ({
      cameraPolicy: "identity" as const,
      renderItems: [],
      vfx: { feed: () => {}, gpuSimFeed: () => nodes.map(request) }
    });
    const sourceA = source(["one", "two"]);
    const sourceB = source(["one"]);
    const particleFailure = new Error("particle cleanup reported");
    const historyFailure = new Error("history cleanup reported");
    let simFailure: { mockRestore(): void } | undefined;
    let historyDisposal: { mockRestore(): void } | undefined;
    try {
      rendererA.render({ source: sourceA });
      rendererB.render({ source: sourceB });
      const simulations = registrations.mock.calls
        .filter(([, descriptor]) => descriptor.kind === "prd07.gpuSim")
        .map(([handle]) => handle as ParticleGpuSim);
      expect(simulations).toHaveLength(3);
      const [first, second, other] = simulations as [ParticleGpuSim, ParticleGpuSim, ParticleGpuSim];
      const otherTarget = other.state!.posTarget;
      const disposeFirst = first.dispose.bind(first);
      const disposeHistory = historyA.dispose.bind(historyA);
      simFailure = vi.spyOn(first, "dispose").mockImplementationOnce(() => { disposeFirst(); throw particleFailure; });
      historyDisposal = vi.spyOn(historyA, "dispose").mockImplementationOnce(() => { disposeHistory(); throw historyFailure; });

      let failure: unknown;
      try { rendererA.dispose(); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(AggregateError);
      const errors = (failure as AggregateError).errors;
      expect(errors).toContain(historyFailure);
      const particleErrors = errors.find((error) => error instanceof AggregateError && error.message === "Particle simulation owner cleanup failed");
      expect(particleErrors?.errors).toContain(particleFailure);
      expect(first.disposed).toBe(true);
      expect(second.disposed).toBe(true);
      expect(other.disposed).toBe(false);
      expect(other.state!.posTarget).toBe(otherTarget);
      expect(otherTarget.disposed).toBe(false);
      expect(device.disposed).toBe(false);
      expect(registry.size).toBe(before + 1);
      expect(() => rendererA.dispose()).not.toThrow();
      rendererB.render({ source: sourceB });
      expect(other.disposed).toBe(false);
      expect(registry.size).toBe(before + 1);
    } finally {
      simFailure?.mockRestore();
      historyDisposal?.mockRestore();
      registrations.mockRestore();
      rendererA.dispose();
      rendererB.dispose();
    }
    expect(registry.size).toBe(before);
    expect(device.disposed).toBe(true);
  });

  it("retries an interrupted owner cleanup without repeating other disposers or reentering cleanup", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "probe", { value: { floatColorBuffer: true } });
    const options = { backend: "mock" as const, width: 8, height: 8, qrFlags: enabled, shaderLibrary: createDefaultShaderLibrary() };
    const historyA = new TemporalHistory();
    const rendererA = new Renderer(device, options, historyA);
    const rendererB = new Renderer(device, options, new TemporalHistory());
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const registrations = vi.spyOn(registry, "register");
    const historyDisposal = vi.spyOn(historyA, "dispose");
    const source = {
      cameraPolicy: "identity" as const, renderItems: [],
      vfx: { feed: () => {}, gpuSimFeed: () => [request("same")] }
    };
    const original = particleContributors.disposePrd07GpuSimsForOwner;
    const failure = new Error("owner cleanup unavailable");
    const retryFailure = new Error("owner cleanup still unavailable");
    const cleanup = vi.spyOn(particleContributors, "disposePrd07GpuSimsForOwner")
      .mockImplementationOnce(() => { throw failure; })
      .mockImplementationOnce(() => { throw retryFailure; })
      .mockImplementationOnce((ownerDevice, owner) => {
        rendererA.dispose();
        original(ownerDevice, owner);
      });
    try {
      rendererA.render({ source });
      rendererB.render({ source });
      const simulations = registrations.mock.calls
        .filter(([, descriptor]) => descriptor.kind === "prd07.gpuSim")
        .map(([handle]) => handle as ParticleGpuSim);
      expect(simulations).toHaveLength(2);
      const [first, other] = simulations as [ParticleGpuSim, ParticleGpuSim];
      let error: unknown;
      try { rendererA.dispose(); } catch (caught) { error = caught; }
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toContain(failure);
      expect(first.disposed).toBe(false);
      expect(other.disposed).toBe(false);
      expect(device.disposed).toBe(false);
      expect(historyDisposal).toHaveBeenCalledOnce();
      rendererB.render({ source });
      let retryError: unknown;
      try { rendererA.dispose(); } catch (caught) { retryError = caught; }
      expect(retryError).toBeInstanceOf(AggregateError);
      expect((retryError as AggregateError).errors).toContain(retryFailure);
      expect(first.disposed).toBe(false);
      rendererA.dispose();
      expect(first.disposed).toBe(true);
      expect(other.disposed).toBe(false);
      expect(registry.size).toBe(before + 1);
      expect(cleanup).toHaveBeenCalledTimes(3);
      expect(historyDisposal).toHaveBeenCalledOnce();
      rendererA.dispose();
      expect(cleanup).toHaveBeenCalledTimes(3);
    } finally {
      cleanup.mockRestore();
      historyDisposal.mockRestore();
      registrations.mockRestore();
      rendererA.dispose();
      rendererB.dispose();
    }
    expect(registry.size).toBe(before);
  });

  it("retries a failed particle target disposal without disturbing another renderer", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "probe", { value: { floatColorBuffer: true } });
    const options = { backend: "mock" as const, width: 8, height: 8, qrFlags: enabled, shaderLibrary: createDefaultShaderLibrary() };
    const rendererA = new Renderer(device, options, new TemporalHistory());
    const rendererB = new Renderer(device, options, new TemporalHistory());
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const registrations = vi.spyOn(registry, "register");
    const source = {
      cameraPolicy: "identity" as const, renderItems: [],
      vfx: { feed: () => {}, gpuSimFeed: () => [request("same")] }
    };
    let target: ReturnType<MockRenderDevice["createRenderTarget"]> | undefined;
    let failing: { mockRestore(): void } | undefined;
    try {
      rendererA.render({ source });
      rendererB.render({ source });
      const simulations = registrations.mock.calls
        .filter(([, descriptor]) => descriptor.kind === "prd07.gpuSim")
        .map(([handle]) => handle as ParticleGpuSim);
      expect(simulations).toHaveLength(2);
      const [first, other] = simulations as [ParticleGpuSim, ParticleGpuSim];
      target = first.state!.posTarget;
      const otherTarget = other.state!.posTarget;
      failing = vi.spyOn(target, "dispose").mockImplementationOnce(() => { throw new Error("transient target cleanup failure"); });

      expect(() => rendererA.dispose()).toThrow("Renderer disposal failed");
      expect(device.disposed).toBe(false);
      expect(other.state!.posTarget).toBe(otherTarget);
      rendererA.dispose();
      expect(target.disposed).toBe(true);
      expect(other.disposed).toBe(false);
      expect(otherTarget.disposed).toBe(false);
      rendererB.render({ source });
      expect(registry.size).toBe(before + 1);
    } finally {
      failing?.mockRestore();
      if (target && !target.disposed) target.dispose();
      registrations.mockRestore();
      rendererA.dispose();
      rendererB.dispose();
    }
    expect(registry.size).toBe(before);
  });

  it("retries only failed resources, attempts other emitters, and ignores reentrant owner cleanup", () => {
    const { device } = makeDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const ownerA = {}, ownerB = {};
    const targets = vi.spyOn(device, "createRenderTarget");
    const first = collect(device, ownerA, [request("one"), request("two")]);
    const other = collect(device, ownerB, [request("one")])[0]!.sim;
    const [sim, sibling] = first.map(({ sim: entry }) => entry) as [ParticleGpuSim, ParticleGpuSim];
    const simTargets = targets.mock.results.slice(0, 4).map(({ value }) => value);
    const [pos, vel] = device.drawCommands.filter(({ label }) => label?.startsWith("prd07.gpuSim."));
    const targetError = new Error("target failed");
    const shaderError = new Error("shader failed");
    const bufferError = new Error("buffer failed");
    const unregisterError = new Error("unregister failed");
    const target = vi.spyOn(simTargets[0]!, "dispose").mockImplementationOnce(() => {
      disposePrd07GpuSimsForOwner(device, ownerA);
      sim.dispose();
      throw targetError;
    });
    const healthyTarget = vi.spyOn(simTargets[1]!, "dispose");
    const shader = vi.spyOn(pos!.shader!, "dispose").mockImplementationOnce(() => { throw shaderError; });
    const healthyShader = vi.spyOn(vel!.shader!, "dispose");
    const buffer = vi.spyOn(pos!.vertexBuffer, "dispose").mockImplementationOnce(() => { throw bufferError; });
    const siblingDisposal = vi.spyOn(sibling, "dispose");
    const unregisterOriginal = registry.unregister.bind(registry);
    let failUnregister = true;
    const unregister = vi.spyOn(registry, "unregister").mockImplementation((handle) => {
      if (handle === sim && failUnregister) {
        failUnregister = false;
        throw unregisterError;
      }
      unregisterOriginal(handle);
    });
    const leaves = (error: unknown): unknown[] => error instanceof AggregateError ? error.errors.flatMap(leaves) : [error];
    try {
      let failure: unknown;
      try { disposePrd07GpuSimsForOwner(device, ownerA); } catch (error) { failure = error; }
      expect(leaves(failure)).toEqual(expect.arrayContaining([targetError, shaderError, bufferError, unregisterError]));
      expect(sim.disposed).toBe(true);
      expect(sibling.disposed).toBe(true);
      expect(siblingDisposal).toHaveBeenCalledOnce();
      expect(target).toHaveBeenCalledOnce();
      expect(healthyTarget).toHaveBeenCalledOnce();
      expect(shader).toHaveBeenCalledOnce();
      expect(healthyShader).toHaveBeenCalledOnce();
      expect(buffer).toHaveBeenCalledOnce();
      expect(other.disposed).toBe(false);
      expect(registry.size).toBe(before + 2);

      disposePrd07GpuSimsForOwner(device, ownerA);
      expect(simTargets[0]!.disposed).toBe(true);
      expect(pos!.shader!.disposed).toBe(true);
      expect(pos!.vertexBuffer.disposed).toBe(true);
      expect(target).toHaveBeenCalledTimes(2);
      expect(shader).toHaveBeenCalledTimes(2);
      expect(buffer).toHaveBeenCalledTimes(2);
      expect(healthyTarget).toHaveBeenCalledOnce();
      expect(healthyShader).toHaveBeenCalledOnce();
      expect(siblingDisposal).toHaveBeenCalledOnce();
      expect(unregister.mock.calls.filter(([handle]) => handle === sim)).toHaveLength(2);
      expect(other.disposed).toBe(false);
      expect(registry.size).toBe(before + 1);
      disposePrd07GpuSimsForOwner(device, ownerA);
      expect(target).toHaveBeenCalledTimes(2);
    } finally {
      target.mockRestore();
      healthyTarget.mockRestore();
      shader.mockRestore();
      healthyShader.mockRestore();
      buffer.mockRestore();
      siblingDisposal.mockRestore();
      unregister.mockRestore();
      targets.mockRestore();
      registry.unregister(sim);
      disposePrd07GpuSimsForOwner(device, ownerA);
      disposePrd07GpuSimsForOwner(device, ownerB);
      device.dispose();
    }
    expect(registry.size).toBe(before);
  });

  it("retains a removed emitter for retry while replacing its node without touching another owner", () => {
    const { device } = makeDevice();
    const ownerA = {}, ownerB = {};
    const [removed, retained] = collect(device, ownerA, [request("one"), request("two")]).map(({ sim }) => sim);
    const other = collect(device, ownerB, [request("one")])[0]!.sim;
    const target = removed!.state!.posTarget;
    const failing = vi.spyOn(target, "dispose").mockImplementationOnce(() => { throw new Error("removed target failed"); });
    try {
      expect(() => collect(device, ownerA, [request("two")])).toThrow("Particle simulation retirement failed");
      expect(target.disposed).toBe(false);
      expect(retained!.disposed).toBe(false);
      const replacement = collect(device, ownerA, [request("one"), request("two")]);
      expect(target.disposed).toBe(true);
      expect(replacement[0]!.sim).not.toBe(removed);
      expect(replacement[1]!.sim).toBe(retained);
      expect(other.disposed).toBe(false);
      expect(failing).toHaveBeenCalledTimes(2);
      disposePrd07GpuSimsForOwner(device, ownerA);
      expect(other.disposed).toBe(false);
    } finally {
      failing.mockRestore();
      disposePrd07GpuSimsForOwner(device, ownerA);
      disposePrd07GpuSimsForOwner(device, ownerB);
      device.dispose();
    }
  });

  it("retains failed rollback of a newly created emitter for owner cleanup", () => {
    const { device } = makeDevice();
    const ownerA = {}, ownerB = {};
    const retained = collect(device, ownerA, [request("keep")])[0]!.sim;
    const other = collect(device, ownerB, [request("keep")])[0]!.sim;
    const create = device.createRenderTarget.bind(device);
    let calls = 0;
    let abandoned: ReturnType<typeof create> | undefined;
    let failure: { mockRestore(): void } | undefined;
    const targets = vi.spyOn(device, "createRenderTarget").mockImplementation((descriptor) => {
      calls += 1;
      if (calls === 5) throw new Error("later emitter allocation failed");
      const target = create(descriptor);
      if (calls === 1) {
        abandoned = target;
        failure = vi.spyOn(target, "dispose").mockImplementationOnce(() => { throw new Error("rollback target failed"); });
      }
      return target;
    });
    try {
      expect(() => collect(device, ownerA, [request("keep"), request("new"), request("bad")]))
        .toThrow("Particle simulation collection failed");
      expect(abandoned!.disposed).toBe(false);
      expect(retained.disposed).toBe(false);
      expect(other.disposed).toBe(false);
      disposePrd07GpuSimsForOwner(device, ownerA);
      expect(abandoned!.disposed).toBe(true);
      expect(retained.disposed).toBe(true);
      expect(other.disposed).toBe(false);
    } finally {
      failure?.mockRestore();
      targets.mockRestore();
      disposePrd07GpuSimsForOwner(device, ownerA);
      disposePrd07GpuSimsForOwner(device, ownerB);
      device.dispose();
    }
  });

  it("keeps failed partial construction owned until cleanup succeeds", () => {
    const { device } = makeDevice();
    const ownerA = {}, ownerB = {};
    const retained = collect(device, ownerA, [request("keep")])[0]!.sim;
    const other = collect(device, ownerB, [request("keep")])[0]!.sim;
    const create = device.createRenderTarget.bind(device);
    let calls = 0;
    let abandoned: ReturnType<typeof create> | undefined;
    let failure: { mockRestore(): void } | undefined;
    const targets = vi.spyOn(device, "createRenderTarget").mockImplementation((descriptor) => {
      calls += 1;
      if (calls === 2) throw new Error("partial allocation failed");
      const target = create(descriptor);
      abandoned = target;
      const dispose = target.dispose.bind(target);
      let attempts = 0;
      failure = vi.spyOn(target, "dispose").mockImplementation(() => {
        attempts += 1;
        if (attempts <= 2) throw new Error("partial cleanup failed");
        dispose();
      });
      return target;
    });
    try {
      expect(() => collect(device, ownerA, [request("keep"), request("bad")]))
        .toThrow("Particle simulation initialization failed");
      expect(abandoned!.disposed).toBe(false);
      expect(failure).toHaveBeenCalledTimes(2);
      expect(retained.disposed).toBe(false);
      disposePrd07GpuSimsForOwner(device, ownerA);
      expect(abandoned!.disposed).toBe(true);
      expect(failure).toHaveBeenCalledTimes(3);
      expect(retained.disposed).toBe(true);
      expect(other.disposed).toBe(false);
    } finally {
      failure?.mockRestore();
      targets.mockRestore();
      disposePrd07GpuSimsForOwner(device, ownerA);
      disposePrd07GpuSimsForOwner(device, ownerB);
      device.dispose();
    }
  });

  it("keeps an interrupted collection's late allocation for the owner to retry", () => {
    const { device } = makeDevice();
    const ownerA = {}, ownerB = {};
    const other = collect(device, ownerB, [request("other")])[0]!.sim;
    const create = device.createRenderTarget.bind(device);
    let late: ReturnType<typeof create> | undefined;
    let failure: { mockRestore(): void } | undefined;
    let interrupted: unknown;
    const targets = vi.spyOn(device, "createRenderTarget").mockImplementation((descriptor) => {
      const target = create(descriptor);
      if (!late) {
        late = target;
        failure = vi.spyOn(target, "dispose").mockImplementationOnce(() => { throw new Error("late cleanup failed"); });
        try { disposePrd07GpuSimsForOwner(device, ownerA); } catch (error) { interrupted = error; }
      }
      return target;
    });
    try {
      expect(() => collect(device, ownerA, [request("new")])).toThrow("Particle simulation collection failed");
      expect(interrupted).toBeInstanceOf(AggregateError);
      expect(late!.disposed).toBe(false);
      expect(failure).toHaveBeenCalledOnce();
      disposePrd07GpuSimsForOwner(device, ownerA);
      expect(late!.disposed).toBe(true);
      expect(failure).toHaveBeenCalledTimes(2);
      expect(other.disposed).toBe(false);
    } finally {
      failure?.mockRestore();
      targets.mockRestore();
      disposePrd07GpuSimsForOwner(device, ownerA);
      disposePrd07GpuSimsForOwner(device, ownerB);
      device.dispose();
    }
  });

  it("does not retry a target that reports an error after it was disposed", () => {
    const { device } = makeDevice();
    const owner = {};
    const sim = collect(device, owner, [request("one")])[0]!.sim;
    const target = sim.state!.posTarget;
    const dispose = target.dispose.bind(target);
    const failure = vi.spyOn(target, "dispose").mockImplementationOnce(() => {
      dispose();
      throw new Error("reported after disposal");
    });
    try {
      expect(() => disposePrd07GpuSimsForOwner(device, owner)).toThrow("Particle simulation owner cleanup failed");
      expect(target.disposed).toBe(true);
      disposePrd07GpuSimsForOwner(device, owner);
      expect(failure).toHaveBeenCalledOnce();
    } finally {
      failure.mockRestore();
      disposePrd07GpuSimsForOwner(device, owner);
      device.dispose();
    }
  });

  it("retries failed target unbinding without unbinding a different owner's target", () => {
    const { device } = makeDevice();
    const ownerA = {}, ownerB = {};
    const sim = collect(device, ownerA, [request("one")])[0]!.sim;
    const other = collect(device, ownerB, [request("one")])[0]!.sim;
    const target = sim.state!.posTarget;
    const otherTarget = other.state!.posTarget;
    device.setRenderTarget(target);
    const targetDisposal = vi.spyOn(target, "dispose");
    const binding = vi.spyOn(device, "setRenderTarget").mockImplementationOnce(() => { throw new Error("unbind failed"); });
    try {
      expect(() => disposePrd07GpuSimsForOwner(device, ownerA)).toThrow("Particle simulation owner cleanup failed");
      expect(target.disposed).toBe(true);
      device.setRenderTarget(otherTarget);
      disposePrd07GpuSimsForOwner(device, ownerA);
      expect(device.getRenderTarget()).toBe(otherTarget);
      expect(otherTarget.disposed).toBe(false);
      expect(targetDisposal).toHaveBeenCalledOnce();
    } finally {
      targetDisposal.mockRestore();
      binding.mockRestore();
      disposePrd07GpuSimsForOwner(device, ownerA);
      disposePrd07GpuSimsForOwner(device, ownerB);
      device.dispose();
    }
  });
});
