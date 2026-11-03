import { describe, expect, it, vi } from "vitest";

import { MockRenderDevice, MockRenderTarget, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { createTrustedQrFlags, type QrFlags } from "../../../packages/rendering/src/contracts/core";
import { frameContributors, type FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import "../../../packages/rendering/src/lanes/prd07";
import "../../../packages/rendering/src/lanes/prd11";
import { sharedResourceRegistry } from "../../../packages/rendering/src/resources/ResourceRegistry";
import { ParticleGpuSim } from "../../../packages/rendering/src/vfx/ParticleGpuSim";

const flags: QrFlags = { values: { A3D_QR_WEBGPU: true }, on: (name) => name === "A3D_QR_WEBGPU" };
const spec = { capacity: 4, lifetimeMax: 2 } as const;

class LossDevice extends MockRenderDevice {
  readonly lossListeners = new Set<() => void>();

  onDeviceLost(listener: () => void): () => void {
    this.lossListeners.add(listener);
    return () => { this.lossListeners.delete(listener); };
  }

  lose(): void {
    this.contextLost = true;
    for (const listener of [...this.lossListeners]) listener();
  }
}

describe("WP-21 particle simulation restore isolation", () => {
  it("does not recreate another device's live particle state", async () => {
    const deviceA = new MockRenderDevice();
    const deviceB = new MockRenderDevice();
    deviceA.beginFrame(8, 8);
    deviceB.beginFrame(8, 8);
    const simA = new ParticleGpuSim(deviceA, spec, flags);
    const simB = new ParticleGpuSim(deviceB, spec, flags);
    const registry = sharedResourceRegistry();
    try {
      const stateA = simA.state!;
      const stateB = simB.state!;
      const beforeB = deviceB.getDiagnostics().renderTargets;
      const result = await registry.rebuild(deviceA);
      expect(result.failed).toEqual([]);
      expect(simA.state!.posTarget).not.toBe(stateA.posTarget);
      expect(simB.state!.posTarget).toBe(stateB.posTarget);
      expect(simB.state!.velTarget).toBe(stateB.velTarget);
      expect(stateB.posTarget.disposed).toBe(false);
      expect(stateB.velTarget.disposed).toBe(false);
      expect(deviceB.getDiagnostics().renderTargets).toBe(beforeB);
    } finally {
      registry.unregister(simA);
      registry.unregister(simB);
      simA.dispose();
      simB.dispose();
      deviceA.dispose();
      deviceB.dispose();
    }
  });

  it("does not keep a disposed particle simulation registered for restore", async () => {
    const device = new MockRenderDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    device.beginFrame(8, 8);
    const sim = new ParticleGpuSim(device, spec, flags);
    try {
      expect(registry.size).toBe(before + 1);
      sim.dispose();
      expect(registry.size).toBe(before);
      await registry.rebuild(device);
      expect(sim.state).toBeNull();
    } finally {
      registry.unregister(sim);
      sim.dispose();
      device.dispose();
    }
  });

  it("ignores a captured rebuild callback after its simulation is disposed", async () => {
    const device = new MockRenderDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const registrations = vi.spyOn(registry, "register");
    const sim = new ParticleGpuSim(device, spec, flags);
    const descriptor = registrations.mock.calls.find(([handle]) => handle === sim)?.[1];
    try {
      expect(descriptor).toBeDefined();
      sim.dispose();
      await descriptor!.rebuild();
      expect(sim.state).toBeNull();
      expect(device.getDiagnostics().renderTargets).toBe(0);
      expect(registry.size).toBe(before);
    } finally {
      registrations.mockRestore();
      sim.dispose();
      device.dispose();
    }
  });

  it("does not publish targets created after disposal interrupts a rebuild", async () => {
    const device = new MockRenderDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const sim = new ParticleGpuSim(device, spec, flags);
    const create = device.createRenderTarget.bind(device);
    const created: RenderTarget[] = [];
    const targets = vi.spyOn(device, "createRenderTarget").mockImplementation((descriptor) => {
      const target = create(descriptor);
      created.push(target);
      sim.dispose();
      return target;
    });
    try {
      await registry.rebuild(device);
      expect(created).toHaveLength(1);
      expect(created.every((target) => target.disposed)).toBe(true);
      expect(sim.state).toBeNull();
      expect(registry.size).toBe(before);
      expect(device.getDiagnostics().renderTargets).toBe(0);
      expect(() => sim.dispose()).not.toThrow();
    } finally {
      targets.mockRestore();
      sim.dispose();
      device.dispose();
    }
  });

  it("discards partially rebuilt targets if loss interrupts a restore", async () => {
    const device = new LossDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const sim = new ParticleGpuSim(device, spec, flags);
    const create = device.createRenderTarget.bind(device);
    const created: RenderTarget[] = [];
    const targets = vi.spyOn(device, "createRenderTarget").mockImplementation((descriptor) => {
      const target = create(descriptor);
      created.push(target);
      if (created.length === 1) {
        device.lose();
        device.contextLost = false;
      }
      return target;
    });
    try {
      expect((await registry.rebuild(device)).failed).toContain("prd07.gpuSim");
      expect(created).toHaveLength(1);
      expect(created.every((target) => target.disposed)).toBe(true);
      expect(sim.state).toBeNull();
      expect(registry.size).toBe(before + 1);
      expect(device.getDiagnostics().renderTargets).toBe(0);
      targets.mockRestore();
      expect((await registry.rebuild(device)).failed).toEqual([]);
      expect(sim.state).not.toBeNull();
    } finally {
      targets.mockRestore();
      sim.dispose();
      device.dispose();
    }
  });

  it("rebuilds particle state when the restore occurs outside a render frame", async () => {
    const device = new MockRenderDevice();
    const registry = sharedResourceRegistry();
    device.beginFrame(8, 8);
    const sim = new ParticleGpuSim(device, spec, flags);
    device.endFrame();
    try {
      const previous = sim.state!;
      const result = await registry.rebuild(device);
      expect(result.failed).toEqual([]);
      expect(sim.state!.posTarget).not.toBe(previous.posTarget);
    } finally {
      registry.unregister(sim);
      sim.dispose();
      device.dispose();
    }
  });

  it("retires all old targets, programs, and geometry on restore without disturbing the caller's target", async () => {
    const device = new MockRenderDevice();
    const registry = sharedResourceRegistry();
    device.beginFrame(8, 8);
    const caller = device.createRenderTarget({ width: 8, height: 8 });
    device.setRenderTarget(caller);
    const targets = vi.spyOn(device, "createRenderTarget");
    const sim = new ParticleGpuSim(device, spec, flags);
    try {
      sim.step(1 / 60, 3);
      const oldTargets = targets.mock.results.map((result) => result.value as RenderTarget);
      const oldCommands = [...device.drawCommands];
      expect(oldTargets).toHaveLength(4);
      expect(sim.state).toMatchObject({ head: 3, frame: 1 });
      expect(device.getDiagnostics()).toMatchObject({ renderTargets: 5, shaders: 2, buffers: 1 });

      expect((await registry.rebuild(device)).failed).toEqual([]);
      expect(oldTargets.every((target) => target.disposed)).toBe(true);
      expect(oldCommands.every((command) => command.shader?.disposed === true && command.vertexBuffer.disposed)).toBe(true);
      expect(sim.state).toMatchObject({ head: 0, frame: 0 });
      expect(device.getDiagnostics()).toMatchObject({ renderTargets: 5, shaders: 0, buffers: 0 });
      expect(device.getRenderTarget()).toBe(caller);

      sim.step(1 / 60);
      expect(device.getRenderTarget()).toBe(caller);
      expect(device.getDiagnostics()).toMatchObject({ renderTargets: 5, shaders: 2, buffers: 1 });
    } finally {
      registry.unregister(sim);
      sim.dispose();
      device.dispose();
    }
  });

  it("allocates outside a frame and initializes all four dead-state targets before the first step", () => {
    const device = new MockRenderDevice();
    const registry = sharedResourceRegistry();
    const targets = vi.spyOn(device, "createRenderTarget");
    const sim = new ParticleGpuSim(device, spec, flags);
    try {
      expect(device.activeFrameToken).toBeNull();
      expect(sim.state).not.toBeNull();
      const stateTargets = targets.mock.results.map((result) => result.value as MockRenderTarget);
      expect(stateTargets).toHaveLength(4);
      device.beginFrame(8, 8);
      const caller = device.createRenderTarget({ width: 8, height: 8 });
      device.setRenderTarget(caller);
      sim.step(1 / 60);
      expect(stateTargets.map((target) => target.colorFloatPixels?.[3])).toEqual([1e9, 1e9, 1e9, 1e9]);
      expect(device.getRenderTarget()).toBe(caller);
    } finally {
      registry.unregister(sim);
      sim.dispose();
      device.dispose();
    }
  });

  it("cleans partially allocated targets when construction fails", () => {
    const device = new MockRenderDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const create = device.createRenderTarget.bind(device);
    const created: RenderTarget[] = [];
    vi.spyOn(device, "createRenderTarget").mockImplementation((descriptor) => {
      if (created.length === 2) throw new Error("allocation failed");
      const target = create(descriptor);
      created.push(target);
      return target;
    });
    try {
      expect(() => new ParticleGpuSim(device, spec, flags)).toThrow("allocation failed");
      expect(created).toHaveLength(2);
      expect(created.every((target) => target.disposed)).toBe(true);
      expect(device.getDiagnostics().renderTargets).toBe(0);
      expect(registry.size).toBe(before);
    } finally {
      device.dispose();
    }
  });

  it("cleans partial construction when a loss interrupts allocation", () => {
    const device = new LossDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const create = device.createRenderTarget.bind(device);
    const created: RenderTarget[] = [];
    const targets = vi.spyOn(device, "createRenderTarget").mockImplementation((descriptor) => {
      const target = create(descriptor);
      created.push(target);
      if (created.length === 1) {
        device.lose();
        device.contextLost = false;
      }
      return target;
    });
    try {
      expect(() => new ParticleGpuSim(device, spec, flags)).toThrow("Particle simulation allocation invalidated");
      expect(created).toHaveLength(1);
      expect(created.every((target) => target.disposed)).toBe(true);
      expect(device.lossListeners.size).toBe(0);
      expect(device.getDiagnostics().renderTargets).toBe(0);
      expect(registry.size).toBe(before);
    } finally {
      targets.mockRestore();
      device.dispose();
    }
  });

  it("retires old and partial allocations on a failed restore and permits a later retry", async () => {
    const device = new MockRenderDevice();
    const registry = sharedResourceRegistry();
    device.beginFrame(8, 8);
    const targets = vi.spyOn(device, "createRenderTarget");
    const sim = new ParticleGpuSim(device, spec, flags);
    const oldTargets = targets.mock.results.map((result) => result.value as RenderTarget);
    const create = targets.getMockImplementation() ?? MockRenderDevice.prototype.createRenderTarget;
    const partial: RenderTarget[] = [];
    targets.mockImplementation((descriptor) => {
      if (partial.length === 2) throw new Error("restore allocation failed");
      const target = create.call(device, descriptor);
      partial.push(target);
      return target;
    });
    try {
      expect((await registry.rebuild(device)).failed).toContain("prd07.gpuSim");
      expect(oldTargets.every((target) => target.disposed)).toBe(true);
      expect(partial.every((target) => target.disposed)).toBe(true);
      expect(device.getDiagnostics().renderTargets).toBe(0);
      expect(sim.state).toBeNull();
      targets.mockRestore();
      expect((await registry.rebuild(device)).failed).toEqual([]);
      expect(sim.state).not.toBeNull();
      expect(device.getDiagnostics().renderTargets).toBe(4);
    } finally {
      registry.unregister(sim);
      sim.dispose();
      device.dispose();
    }
  });

  it("unregisters on device disposal and makes repeated simulation disposal harmless", async () => {
    const device = new MockRenderDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    device.beginFrame(8, 8);
    const a = new ParticleGpuSim(device, spec, flags);
    const b = new ParticleGpuSim(device, spec, flags);
    try {
      expect(registry.size).toBe(before + 2);
      device.dispose();
      expect(registry.size).toBe(before);
      expect(a.state).toBeNull();
      expect(b.state).toBeNull();
      expect(() => { a.dispose(); b.dispose(); device.dispose(); }).not.toThrow();
      expect((await registry.rebuild(device)).failed).toEqual([]);
    } finally {
      registry.unregister(a);
      registry.unregister(b);
      a.dispose();
      b.dispose();
      device.dispose();
    }
  });

  it("retires lost-generation resources before restoration and removes the loss listener on disposal", async () => {
    const device = new LossDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    device.beginFrame(8, 8);
    const targets = vi.spyOn(device, "createRenderTarget");
    const sim = new ParticleGpuSim(device, spec, flags);
    try {
      sim.step(1 / 60, 2);
      const oldTargets = targets.mock.results.map((result) => result.value as RenderTarget);
      const oldCommands = [...device.drawCommands];
      device.setRenderTarget(sim.state!.posTarget);
      device.endFrame();
      device.lose();
      expect(sim.state).toBeNull();
      expect(oldTargets.every((target) => target.disposed)).toBe(true);
      expect(oldCommands.every((command) => command.shader?.disposed === true && command.vertexBuffer.disposed)).toBe(true);
      expect(registry.size).toBe(before + 1);

      device.contextLost = false;
      expect((await registry.rebuild(device)).failed).toEqual([]);
      expect(sim.state).toMatchObject({ head: 0, frame: 0 });
      device.beginFrame(8, 8);
      expect(() => sim.step(1 / 60)).not.toThrow();
      expect(device.getRenderTarget()).toBeNull();
      sim.dispose();
      expect(device.lossListeners.size).toBe(0);
      expect(registry.size).toBe(before);
    } finally {
      registry.unregister(sim);
      sim.dispose();
      device.dispose();
    }
  });

  it("recreates an unregistered simulation on the first frame after loss", () => {
    const device = new LossDevice();
    device.beginFrame(8, 8);
    const sim = new ParticleGpuSim(device, spec);
    try {
      const previous = sim.step(1 / 60).posTarget;
      device.endFrame();
      device.lose();
      expect(sim.state).toBeNull();
      device.contextLost = false;
      device.beginFrame(8, 8);
      const restored = sim.step(1 / 60);
      expect(restored.posTarget).not.toBe(previous);
      expect(restored.frame).toBe(1);
      expect(previous.disposed).toBe(true);
    } finally {
      sim.dispose();
      device.dispose();
    }
  });

  it("continues cleanup and calls device disposal when a particle target disposer throws", () => {
    const device = new MockRenderDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    device.beginFrame(8, 8);
    const targets = vi.spyOn(device, "createRenderTarget");
    const a = new ParticleGpuSim(device, spec, flags);
    const b = new ParticleGpuSim(device, spec, flags);
    const allTargets = targets.mock.results.map((result) => result.value as RenderTarget);
    const failing = vi.spyOn(allTargets[0]!, "dispose").mockImplementationOnce(() => { throw new Error("cleanup failure"); });
    try {
      a.step(1 / 60);
      b.step(1 / 60);
      expect(() => device.dispose()).toThrow("Particle simulation device cleanup failed");
      expect(device.disposed).toBe(true);
      expect(a.state).toBeNull();
      expect(b.state).toBeNull();
      expect(allTargets.every((target) => target.disposed)).toBe(true);
      expect(registry.size).toBe(before);
      expect(() => { a.dispose(); b.dispose(); device.dispose(); }).not.toThrow();
    } finally {
      failing.mockRestore();
      registry.unregister(a);
      registry.unregister(b);
      a.dispose();
      b.dispose();
      device.dispose();
    }
  });

  it("restores the caller's target after a failed simulation draw", () => {
    const device = new MockRenderDevice();
    device.beginFrame(8, 8);
    const caller = device.createRenderTarget({ width: 8, height: 8 });
    device.setRenderTarget(caller);
    const sim = new ParticleGpuSim(device, spec, flags);
    const draw = vi.spyOn(device, "draw").mockImplementationOnce(() => { throw new Error("draw failed"); });
    try {
      expect(() => sim.step(1 / 60)).toThrow("draw failed");
      expect(device.getRenderTarget()).toBe(caller);
      expect(sim.state).toMatchObject({ head: 0, frame: 0 });
      expect(() => sim.step(1 / 60)).not.toThrow();
      expect(device.getRenderTarget()).toBe(caller);
    } finally {
      draw.mockRestore();
      sim.dispose();
      device.dispose();
    }
  });

  it("retires a shader returned after disposal interrupts shader creation", () => {
    const device = new MockRenderDevice();
    device.beginFrame(8, 8);
    const sim = new ParticleGpuSim(device, spec, flags);
    const create = device.createShaderProgram.bind(device);
    const shaders = vi.spyOn(device, "createShaderProgram").mockImplementation((sources) => {
      const shader = create(sources);
      sim.dispose();
      return shader;
    });
    try {
      expect(() => sim.step(1 / 60)).toThrow("Particle simulation");
      expect(sim.state).toBeNull();
      expect(device.getDiagnostics()).toMatchObject({ renderTargets: 0, shaders: 0, buffers: 0 });
      expect(() => sim.dispose()).not.toThrow();
    } finally {
      shaders.mockRestore();
      sim.dispose();
      device.dispose();
    }
  });

  it("retires a vertex buffer returned after disposal interrupts its upload", () => {
    const device = new MockRenderDevice();
    device.beginFrame(8, 8);
    const sim = new ParticleGpuSim(device, spec, flags);
    const create = device.createBuffer.bind(device);
    const buffers = vi.spyOn(device, "createBuffer").mockImplementation((...args) => {
      const buffer = create(...args);
      sim.dispose();
      return buffer;
    });
    try {
      expect(() => sim.step(1 / 60)).toThrow("Particle simulation");
      expect(sim.state).toBeNull();
      expect(device.getDiagnostics()).toMatchObject({ renderTargets: 0, shaders: 0, buffers: 0 });
      expect(() => sim.dispose()).not.toThrow();
    } finally {
      buffers.mockRestore();
      sim.dispose();
      device.dispose();
    }
  });

  it("releases the disposed renderer's simulations without affecting a second renderer on the same device", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "probe", { value: { floatColorBuffer: true } });
    const qrFlags = createTrustedQrFlags({ A3D_QR_VFX: true, A3D_QR_WEBGPU: true });
    const options = { backend: "mock" as const, width: 8, height: 8, qrFlags, shaderLibrary: createDefaultShaderLibrary() };
    const rendererA = new Renderer(device, options, new TemporalHistory());
    const rendererB = new Renderer(device, options, new TemporalHistory());
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const registrations = vi.spyOn(registry, "register");
    const source = {
      cameraPolicy: "identity" as const,
      renderItems: [],
      vfx: { feed: () => {}, gpuSimFeed: () => [{ nodeId: "same", batchKey: "same", emitCount: 1, spec }] }
    };
    try {
      rendererA.render({ source });
      rendererB.render({ source });
      const simulations = registrations.mock.calls
        .filter(([, descriptor]) => descriptor.kind === "prd07.gpuSim")
        .map(([handle]) => handle as ParticleGpuSim);
      expect(simulations).toHaveLength(2);
      const [simA, simB] = simulations as [ParticleGpuSim, ParticleGpuSim];
      const stateA = simA.state!;
      const stateB = simB.state!;
      expect(registry.size).toBe(before + 2);

      rendererA.dispose();
      expect(device.disposed).toBe(false);
      expect(simA.disposed).toBe(true);
      expect(simA.state).toBeNull();
      expect(stateA.posTarget.disposed).toBe(true);
      expect(stateA.velTarget.disposed).toBe(true);
      expect(registry.size).toBe(before + 1);
      expect(simB.state!.posTarget).toBe(stateB.posTarget);
      expect(simB.state!.velTarget).toBe(stateB.velTarget);
      rendererB.render({ source });
      expect(simB.disposed).toBe(false);
      expect(registry.size).toBe(before + 1);
    } finally {
      registrations.mockRestore();
      rendererA.dispose();
      rendererB.dispose();
    }
  });

  it("preserves existing registrations if a later emitter cannot be allocated", async () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "probe", { value: { floatColorBuffer: true } });
    device.beginFrame(8, 8);
    const enabled = createTrustedQrFlags({ A3D_QR_VFX: true, A3D_QR_WEBGPU: true });
    const disabled = createTrustedQrFlags({ A3D_QR_VFX: true });
    const contributor = frameContributors(enabled).find((entry) => entry.id === "prd07.gpuSim")!;
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const owner = {};
    const request = (nodeId: string) => ({ nodeId, batchKey: nodeId, emitCount: 1, spec });
    const collect = (frameFlags: QrFlags, nodeIds: readonly string[]): ParticleGpuSim[] => {
      const ctx = {
        device, postScopeId: owner, flags: frameFlags, timeSeconds: 0,
        source: { vfx: { gpuSimFeed: () => nodeIds.map(request) } },
        blackboard: new Map<string, unknown>()
      } as unknown as FrameContributorContext;
      contributor.collect!([], ctx);
      return (ctx.blackboard.get("prd07.gpuSims") as { sim: ParticleGpuSim }[]).map(({ sim }) => sim);
    };
    const sim = collect(enabled, ["one"])[0]!;
    const oldTarget = sim.state!.posTarget;
    const targets = vi.spyOn(device, "createRenderTarget").mockImplementation(() => { throw new Error("allocation failed"); });
    try {
      expect(() => collect(disabled, ["one", "two"])).toThrow("allocation failed");
      expect(registry.size).toBe(before + 1);
      targets.mockRestore();
      expect((await registry.rebuild(device)).failed).toEqual([]);
      expect(sim.state!.posTarget).not.toBe(oldTarget);
      expect(collect(enabled, ["one"])[0]).toBe(sim);
    } finally {
      targets.mockRestore();
      sim.dispose();
      device.dispose();
    }
  });

  it("retries failed old-generation resources before publishing restored state", async () => {
    const deviceA = new MockRenderDevice();
    const deviceB = new MockRenderDevice();
    const registry = sharedResourceRegistry();
    deviceA.beginFrame(8, 8);
    deviceB.beginFrame(8, 8);
    const targets = vi.spyOn(deviceA, "createRenderTarget");
    const simA = new ParticleGpuSim(deviceA, spec, flags);
    const simB = new ParticleGpuSim(deviceB, spec, flags);
    simA.step(1 / 60);
    simB.step(1 / 60);
    const otherTarget = simB.state!.posTarget;
    const oldTargets = targets.mock.results.map(({ value }) => value);
    const [pos, vel] = deviceA.drawCommands;
    const target = vi.spyOn(oldTargets[0]!, "dispose").mockImplementationOnce(() => { throw new Error("target cleanup failed"); });
    const healthyTarget = vi.spyOn(oldTargets[1]!, "dispose");
    const shader = vi.spyOn(pos!.shader!, "dispose").mockImplementationOnce(() => { throw new Error("shader cleanup failed"); });
    const healthyShader = vi.spyOn(vel!.shader!, "dispose");
    const buffer = vi.spyOn(pos!.vertexBuffer, "dispose").mockImplementationOnce(() => { throw new Error("buffer cleanup failed"); });
    try {
      expect((await registry.rebuild(deviceA)).failed).toContain("prd07.gpuSim");
      expect(simA.state).toBeNull();
      expect(targets).toHaveBeenCalledTimes(4);
      expect(oldTargets[0]!.disposed).toBe(false);
      expect(pos!.shader!.disposed).toBe(false);
      expect(pos!.vertexBuffer.disposed).toBe(false);
      expect(healthyTarget).toHaveBeenCalledOnce();
      expect(healthyShader).toHaveBeenCalledOnce();
      expect(simB.state!.posTarget).toBe(otherTarget);
      expect(otherTarget.disposed).toBe(false);

      expect((await registry.rebuild(deviceA)).failed).toEqual([]);
      expect(simA.state).not.toBeNull();
      expect(targets).toHaveBeenCalledTimes(8);
      expect(target).toHaveBeenCalledTimes(2);
      expect(shader).toHaveBeenCalledTimes(2);
      expect(buffer).toHaveBeenCalledTimes(2);
      expect(healthyTarget).toHaveBeenCalledOnce();
      expect(healthyShader).toHaveBeenCalledOnce();
      expect(simB.state!.posTarget).toBe(otherTarget);
    } finally {
      target.mockRestore();
      healthyTarget.mockRestore();
      shader.mockRestore();
      healthyShader.mockRestore();
      buffer.mockRestore();
      targets.mockRestore();
      simA.dispose();
      simB.dispose();
      deviceA.dispose();
      deviceB.dispose();
    }
  });

  it("retains a late target whose cleanup fails after disposal interrupted a rebuild", async () => {
    const device = new MockRenderDevice();
    const registry = sharedResourceRegistry();
    const sim = new ParticleGpuSim(device, spec, flags);
    const create = device.createRenderTarget.bind(device);
    let late: RenderTarget | undefined;
    let failure: { mockRestore(): void } | undefined;
    const targets = vi.spyOn(device, "createRenderTarget").mockImplementation((descriptor) => {
      late = create(descriptor);
      failure = vi.spyOn(late, "dispose").mockImplementationOnce(() => { throw new Error("late target cleanup failed"); });
      sim.dispose();
      return late;
    });
    try {
      expect((await registry.rebuild(device)).failed).toContain("prd07.gpuSim");
      expect(sim.disposed).toBe(true);
      expect(sim.state).toBeNull();
      expect(late!.disposed).toBe(false);
      sim.dispose();
      expect(late!.disposed).toBe(true);
      expect(failure).toHaveBeenCalledTimes(2);
      expect(device.getDiagnostics().renderTargets).toBe(0);
    } finally {
      failure?.mockRestore();
      targets.mockRestore();
      sim.dispose();
      device.dispose();
    }
  });

  it("retries a late shader whose cleanup fails after disposal interrupted its creation", () => {
    const device = new MockRenderDevice();
    device.beginFrame(8, 8);
    const sim = new ParticleGpuSim(device, spec, flags);
    const create = device.createShaderProgram.bind(device);
    let late: ReturnType<typeof create> | undefined;
    let failure: { mockRestore(): void } | undefined;
    const shaders = vi.spyOn(device, "createShaderProgram").mockImplementation((sources) => {
      late = create(sources);
      failure = vi.spyOn(late, "dispose").mockImplementationOnce(() => { throw new Error("late shader cleanup failed"); });
      sim.dispose();
      return late;
    });
    try {
      expect(() => sim.step(1 / 60)).toThrow("Particle simulation program cleanup failed");
      expect(late!.disposed).toBe(false);
      sim.dispose();
      expect(late!.disposed).toBe(true);
      expect(failure).toHaveBeenCalledTimes(2);
      expect(device.getDiagnostics()).toMatchObject({ renderTargets: 0, shaders: 0, buffers: 0 });
    } finally {
      failure?.mockRestore();
      shaders.mockRestore();
      sim.dispose();
      device.dispose();
    }
  });

  it("retries a late vertex buffer whose cleanup fails after disposal interrupted its upload", () => {
    const device = new MockRenderDevice();
    device.beginFrame(8, 8);
    const sim = new ParticleGpuSim(device, spec, flags);
    const create = device.createBuffer.bind(device);
    let late: ReturnType<typeof create> | undefined;
    let failure: { mockRestore(): void } | undefined;
    const buffers = vi.spyOn(device, "createBuffer").mockImplementation((...args) => {
      late = create(...args);
      failure = vi.spyOn(late, "dispose").mockImplementationOnce(() => { throw new Error("late buffer cleanup failed"); });
      sim.dispose();
      return late;
    });
    try {
      expect(() => sim.step(1 / 60)).toThrow("Particle simulation buffer cleanup failed");
      expect(late!.disposed).toBe(false);
      sim.dispose();
      expect(late!.disposed).toBe(true);
      expect(failure).toHaveBeenCalledTimes(2);
      expect(device.getDiagnostics()).toMatchObject({ renderTargets: 0, shaders: 0, buffers: 0 });
    } finally {
      failure?.mockRestore();
      buffers.mockRestore();
      sim.dispose();
      device.dispose();
    }
  });

  it("retries a failed loss unsubscription after device disposal without repeating resource cleanup", () => {
    class FlakyLossDevice extends LossDevice {
      attempts = 0;
      override onDeviceLost(listener: () => void): () => void {
        const off = super.onDeviceLost(listener);
        return () => {
          this.attempts += 1;
          if (this.attempts === 1) throw new Error("unsubscribe failed");
          off();
        };
      }
    }
    const device = new FlakyLossDevice();
    const registry = sharedResourceRegistry();
    const before = registry.size;
    const a = new ParticleGpuSim(device, spec, flags);
    const b = new ParticleGpuSim(device, spec, flags);
    const target = a.state!.posTarget;
    const targetDisposal = vi.spyOn(target, "dispose");
    try {
      expect(() => device.dispose()).toThrow("Particle simulation device cleanup failed");
      expect(device.disposed).toBe(true);
      expect(device.lossListeners.size).toBe(1);
      expect(registry.size).toBe(before);
      const callsAfterDeviceCleanup = targetDisposal.mock.calls.length;
      device.dispose();
      expect(device.lossListeners.size).toBe(0);
      expect(targetDisposal).toHaveBeenCalledTimes(callsAfterDeviceCleanup);
      expect(a.cleanupPending).toBe(false);
      expect(b.cleanupPending).toBe(false);
    } finally {
      targetDisposal.mockRestore();
      a.dispose();
      b.dispose();
      device.dispose();
    }
  });

  it("does not expose or reuse an old device generation while its cleanup is retrying", () => {
    class GenerationDevice extends MockRenderDevice {
      generation = 0;
    }
    const deviceA = new GenerationDevice();
    const deviceB = new GenerationDevice();
    deviceA.beginFrame(8, 8);
    deviceB.beginFrame(8, 8);
    const simA = new ParticleGpuSim(deviceA, spec, flags);
    const simB = new ParticleGpuSim(deviceB, spec, flags);
    const oldTarget = simA.step(1 / 60).posTarget;
    const otherTarget = simB.step(1 / 60).posTarget;
    const failure = vi.spyOn(oldTarget, "dispose").mockImplementationOnce(() => { throw new Error("old generation failed"); });
    try {
      deviceA.generation += 1;
      expect(simA.state).toBeNull();
      expect(() => simA.step(1 / 60)).toThrow("Particle simulation resource cleanup failed");
      expect(simA.state).toBeNull();
      expect(oldTarget.disposed).toBe(false);
      expect(simB.state!.posTarget).toBe(otherTarget);
      expect(simA.step(1 / 60).posTarget).not.toBe(oldTarget);
      expect(oldTarget.disposed).toBe(true);
      expect(failure).toHaveBeenCalledTimes(2);
      expect(simB.state!.posTarget).toBe(otherTarget);
      expect(otherTarget.disposed).toBe(false);
    } finally {
      failure.mockRestore();
      simA.dispose();
      simB.dispose();
      deviceA.dispose();
      deviceB.dispose();
    }
  });
});
