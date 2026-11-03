import { describe, expect, it, vi } from "vitest";

import { Geometry } from "../../../packages/rendering/src/Geometry";
import {
  MockRenderDevice,
  MockRenderTarget,
  MockShaderProgram,
  type RenderBuffer
} from "../../../packages/rendering/src/RenderDevice";
import { ResourceLifecycle, resourceDisposalPending } from "../../../packages/rendering/src/ResourceLifecycle";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { prd11RenderTargetPoolFor } from "../../../packages/rendering/src/lanes/prd11";
import { ParticleGpuSim } from "../../../packages/rendering/src/vfx/ParticleGpuSim";

const spec = { capacity: 4, lifetimeMax: 2 } as const;
const poolDesc = { width: 8, height: 8, format: "rgba8", samples: 1, depth: false } as const;

function leaves(error: unknown): unknown[] {
  return error instanceof AggregateError ? error.errors.flatMap(leaves) : [error];
}

function caught(action: () => void): unknown {
  try { action(); } catch (error) { return error; }
  throw new Error("Expected an error");
}

describe("WP-21 particle cleanup retries", () => {
  it.each(["pool-first", "particle-first"] as const)(
    "retries a failing lane pool through the particle device wrapper (%s)",
    (order) => {
      const device = new MockRenderDevice();
      const peerDevice = new MockRenderDevice();
      const nativeDispose = vi.fn(() => { device.disposed = true; });
      device.dispose = nativeDispose;
      const earlyPool = order === "pool-first" ? prd11RenderTargetPoolFor(device) : undefined;
      const sim = new ParticleGpuSim(device, spec);
      const pool = earlyPool ?? prd11RenderTargetPoolFor(device);
      const pooled = pool.acquireLease(poolDesc).target;
      const peer = new ParticleGpuSim(peerDevice, spec);
      const peerTarget = peer.state!.posTarget;
      const particleTarget = sim.state!.posTarget;
      const particleDisposal = vi.spyOn(particleTarget, "dispose");
      const failure = new Error("pool cleanup failed");
      const disposePool = pool.dispose.bind(pool);
      const poolDisposal = vi.spyOn(pool, "dispose")
        .mockImplementationOnce(() => { throw failure; })
        .mockImplementation(disposePool);
      const lifecycle = new ResourceLifecycle();
      lifecycle.track(device);
      try {
        expect(leaves(caught(() => lifecycle.dispose()))).toContain(failure);
        expect(device.disposed).toBe(true);
        expect(lifecycle.leakCount()).toBe(1);
        expect(pooled.disposed).toBe(false);
        expect(sim.cleanupPending).toBe(false);

        lifecycle.dispose();
        lifecycle.dispose();
        expect(lifecycle.disposed).toBe(true);
        expect(pooled.disposed).toBe(true);
        expect(poolDisposal).toHaveBeenCalledTimes(2);
        expect(nativeDispose).toHaveBeenCalledOnce();
        expect(particleDisposal).toHaveBeenCalledOnce();
        expect(peer.state!.posTarget).toBe(peerTarget);
        expect(peerTarget.disposed).toBe(false);
      } finally {
        poolDisposal.mockRestore();
        particleDisposal.mockRestore();
        pool.dispose();
        sim.dispose();
        lifecycle.dispose();
        device.dispose();
        peer.dispose();
        peerDevice.dispose();
      }
    }
  );

  it.each(["pool-first", "particle-first"] as const)(
    "keeps particle cleanup visible to a parent device lifecycle (%s)",
    (order) => {
      const device = new MockRenderDevice();
      const peerDevice = new MockRenderDevice();
      const nativeDispose = vi.fn(() => { device.disposed = true; });
      device.dispose = nativeDispose;
      const earlyPool = order === "pool-first" ? prd11RenderTargetPoolFor(device) : undefined;
      const sim = new ParticleGpuSim(device, spec);
      const pool = earlyPool ?? prd11RenderTargetPoolFor(device);
      const peer = new ParticleGpuSim(peerDevice, spec);
      const peerTarget = peer.state!.posTarget;
      const target = sim.state!.posTarget;
      const healthy = sim.state!.velTarget;
      const failure = new Error("particle target cleanup failed");
      const targetDisposal = vi.spyOn(target, "dispose").mockImplementationOnce(() => { throw failure; });
      const healthyDisposal = vi.spyOn(healthy, "dispose");
      const lifecycle = new ResourceLifecycle();
      lifecycle.track(device);
      try {
        expect(leaves(caught(() => lifecycle.dispose()))).toContain(failure);
        expect(device.disposed).toBe(true);
        expect(target.disposed).toBe(false);
        expect(sim.cleanupPending).toBe(true);
        expect(lifecycle.leakCount()).toBe(1);
        expect(peer.state!.posTarget).toBe(peerTarget);

        lifecycle.dispose();
        lifecycle.dispose();
        expect(lifecycle.disposed).toBe(true);
        expect(sim.cleanupPending).toBe(false);
        expect(target.disposed).toBe(true);
        expect(targetDisposal).toHaveBeenCalledTimes(2);
        expect(healthyDisposal).toHaveBeenCalledOnce();
        expect(nativeDispose).toHaveBeenCalledOnce();
        expect(peerTarget.disposed).toBe(false);
      } finally {
        targetDisposal.mockRestore();
        healthyDisposal.mockRestore();
        sim.dispose();
        pool.dispose();
        lifecycle.dispose();
        device.dispose();
        peer.dispose();
        peerDevice.dispose();
      }
    }
  );

  it.each(["returns", "throws"] as const)(
    "retries a native device that %s while reporting pending cleanup",
    (outcome) => {
      const device = new MockRenderDevice();
      let nativePending = false;
      let attempts = 0;
      Object.defineProperty(device, resourceDisposalPending, {
        configurable: true,
        get: () => nativePending
      });
      const nativeDispose = vi.fn(() => {
        attempts += 1;
        device.disposed = true;
        nativePending = attempts === 1;
        if (nativePending && outcome === "throws") throw new Error("native cleanup failed");
      });
      device.dispose = nativeDispose;
      const sim = new ParticleGpuSim(device, spec);
      const targetDisposal = vi.spyOn(sim.state!.posTarget, "dispose");
      const lifecycle = new ResourceLifecycle();
      lifecycle.track(device);
      try {
        expect(() => lifecycle.dispose()).toThrow();
        expect(nativePending).toBe(true);
        expect(lifecycle.leakCount()).toBe(1);

        lifecycle.dispose();
        lifecycle.dispose();
        expect(nativePending).toBe(false);
        expect(lifecycle.disposed).toBe(true);
        expect(nativeDispose).toHaveBeenCalledTimes(2);
        expect(targetDisposal).toHaveBeenCalledOnce();
      } finally {
        nativePending = false;
        targetDisposal.mockRestore();
        sim.dispose();
        lifecycle.dispose();
        device.dispose();
      }
    }
  );

  it("does not repeat a completed mock device close that reports a later error", () => {
    const device = new MockRenderDevice();
    const failure = new Error("reported after device close");
    const nativeDispose = vi.fn(() => { device.disposed = true; throw failure; });
    device.dispose = nativeDispose;
    const sim = new ParticleGpuSim(device, spec);
    const targetDisposal = vi.spyOn(sim.state!.posTarget, "dispose");
    try {
      expect(leaves(caught(() => device.dispose()))).toContain(failure);
      expect(device.disposed).toBe(true);
      expect(sim.cleanupPending).toBe(false);
      expect(() => device.dispose()).not.toThrow();
      expect(nativeDispose).toHaveBeenCalledOnce();
      expect(targetDisposal).toHaveBeenCalledOnce();
    } finally {
      targetDisposal.mockRestore();
      sim.dispose();
      device.dispose();
    }
  });

  it("retries a closed WebGPU device's failed non-particle target without touching a peer", async () => {
    const makeNative = (): WebGPUDeviceLike => ({
      createBuffer: () => ({ destroy() {} }),
      createTexture: () => ({ createView: () => ({}), destroy() {} }),
      queue: { writeBuffer() {}, submit() {}, onSubmittedWorkDone: () => Promise.resolve() }
    }) as unknown as WebGPUDeviceLike;
    const native = makeNative(), peerNative = makeNative();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native } });
    const peerDevice = await WebGPUDevice.create({ adapter: { requestDevice: async () => peerNative } });
    const sim = new ParticleGpuSim(device, spec);
    const peer = new ParticleGpuSim(peerDevice, spec);
    const peerTarget = peer.state!.posTarget;
    const particleDisposal = vi.spyOn(sim.state!.posTarget, "dispose");
    const target = device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: false });
    const failure = new Error("WebGPU target cleanup failed");
    const targetDisposal = vi.spyOn(target, "dispose").mockImplementationOnce(() => { throw failure; });
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    try {
      expect(leaves(caught(() => lifecycle.dispose()))).toContain(failure);
      expect(device.disposed).toBe(true);
      expect(target.disposed).toBe(false);
      expect(lifecycle.leakCount()).toBe(1);
      expect(particleDisposal).toHaveBeenCalledOnce();
      expect(peer.state!.posTarget).toBe(peerTarget);

      lifecycle.dispose();
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(target.disposed).toBe(true);
      expect(targetDisposal).toHaveBeenCalledTimes(2);
      expect(particleDisposal).toHaveBeenCalledOnce();
      expect(peer.state!.posTarget).toBe(peerTarget);
      expect(peerTarget.disposed).toBe(false);
    } finally {
      targetDisposal.mockRestore();
      particleDisposal.mockRestore();
      if (!target.disposed) target.dispose();
      sim.dispose();
      lifecycle.dispose();
      device.dispose();
      peer.dispose();
      peerDevice.dispose();
    }
  });

  it.each(["symbol", "webgpu"] as const)(
    "retains closed targets and shaders with incomplete cleanup (%s)",
    (targetCompletion) => {
      const device = new MockRenderDevice();
      device.beginFrame(8, 8);
      const sim = new ParticleGpuSim(device, spec);
      const peer = new ParticleGpuSim(device, spec);
      sim.step(1 / 60);
      peer.step(1 / 60);
      const target = sim.state!.posTarget as MockRenderTarget;
      const healthy = sim.state!.velTarget;
      const peerTarget = peer.state!.posTarget;
      const shader = device.drawCommands[0]!.shader! as MockShaderProgram;
      const healthyShader = device.drawCommands[1]!.shader!;
      const targetError = new Error("target retirement failed");
      const shaderError = new Error("shader retirement failed");
      let targetPending = false;
      let shaderPending = false;
      const targetProperty = targetCompletion === "symbol" ? resourceDisposalPending : "nativeDisposalComplete";
      Object.defineProperty(target, targetProperty, {
        configurable: true,
        get: () => targetCompletion === "symbol" ? targetPending : !targetPending
      });
      Object.defineProperty(shader, resourceDisposalPending, { configurable: true, get: () => shaderPending });
      const disposeTarget = target.dispose.bind(target);
      const disposeShader = shader.dispose.bind(shader);
      const targetDisposal = vi.spyOn(target, "dispose")
        .mockImplementationOnce(() => { target.disposed = true; targetPending = true; throw targetError; })
        .mockImplementation(() => { targetPending = false; disposeTarget(); });
      const shaderDisposal = vi.spyOn(shader, "dispose")
        .mockImplementationOnce(() => { shader.disposed = true; shaderPending = true; throw shaderError; })
        .mockImplementation(() => { shaderPending = false; disposeShader(); });
      const healthyDisposal = vi.spyOn(healthy, "dispose");
      const healthyShaderDisposal = vi.spyOn(healthyShader, "dispose");
      const lifecycle = new ResourceLifecycle();
      lifecycle.track(sim);
      device.setRenderTarget(peerTarget);
      try {
        expect(leaves(caught(() => lifecycle.dispose()))).toEqual(expect.arrayContaining([targetError, shaderError]));
        expect(target.disposed).toBe(true);
        expect(target.colorTexture.disposed).toBe(false);
        expect(sim.cleanupPending).toBe(true);
        expect(lifecycle.leakCount()).toBe(1);
        expect(device.getRenderTarget()).toBe(peerTarget);

        lifecycle.dispose();
        lifecycle.dispose();
        expect(lifecycle.disposed).toBe(true);
        expect(target.colorTexture.disposed).toBe(true);
        expect(targetDisposal).toHaveBeenCalledTimes(2);
        expect(shaderDisposal).toHaveBeenCalledTimes(2);
        expect(healthyDisposal).toHaveBeenCalledOnce();
        expect(healthyShaderDisposal).toHaveBeenCalledOnce();
        expect(device.getRenderTarget()).toBe(peerTarget);
        expect(peer.state!.posTarget).toBe(peerTarget);
        expect(peerTarget.disposed).toBe(false);
      } finally {
        targetDisposal.mockRestore();
        shaderDisposal.mockRestore();
        healthyDisposal.mockRestore();
        healthyShaderDisposal.mockRestore();
        targetPending = false;
        shaderPending = false;
        if (!target.colorTexture.disposed) target.dispose();
        sim.dispose();
        lifecycle.dispose();
        peer.dispose();
        device.dispose();
      }
    }
  );

  it("retains a target that returns before its reported cleanup completes", () => {
    const device = new MockRenderDevice();
    const sim = new ParticleGpuSim(device, spec);
    const peer = new ParticleGpuSim(device, spec);
    const target = sim.state!.posTarget as MockRenderTarget;
    const healthy = sim.state!.velTarget;
    const peerTarget = peer.state!.posTarget;
    let pending = false;
    Object.defineProperty(target, resourceDisposalPending, { configurable: true, get: () => pending });
    const dispose = target.dispose.bind(target);
    const targetDisposal = vi.spyOn(target, "dispose")
      .mockImplementationOnce(() => { target.disposed = true; pending = true; })
      .mockImplementation(() => { pending = false; dispose(); });
    const healthyDisposal = vi.spyOn(healthy, "dispose");
    try {
      expect(() => sim.dispose()).toThrow("Particle simulation disposal failed");
      expect(sim.cleanupPending).toBe(true);
      expect(target.colorTexture.disposed).toBe(false);
      expect(targetDisposal).toHaveBeenCalledOnce();
      expect(healthyDisposal).toHaveBeenCalledOnce();

      sim.dispose();
      expect(sim.cleanupPending).toBe(false);
      expect(target.colorTexture.disposed).toBe(true);
      expect(targetDisposal).toHaveBeenCalledTimes(2);
      expect(healthyDisposal).toHaveBeenCalledOnce();
      expect(peer.state!.posTarget).toBe(peerTarget);
      expect(peerTarget.disposed).toBe(false);
    } finally {
      pending = false;
      targetDisposal.mockRestore();
      healthyDisposal.mockRestore();
      if (!target.colorTexture.disposed) target.dispose();
      sim.dispose();
      peer.dispose();
      device.dispose();
    }
  });

  it("retains the geometry owner, not just its failed GPU buffer, until both finish", () => {
    const device = new MockRenderDevice();
    device.beginFrame(8, 8);
    const sim = new ParticleGpuSim(device, spec);
    const peer = new ParticleGpuSim(device, spec);
    sim.step(1 / 60);
    peer.step(1 / 60);
    const peerTarget = peer.state!.posTarget;
    const buffer = device.drawCommands[0]!.vertexBuffer;
    const bufferDisposal = vi.spyOn(buffer, "dispose").mockImplementationOnce(() => { throw new Error("buffer cleanup failed"); });
    const geometryDispose = Geometry.prototype.dispose;
    const geometries: Geometry[] = [];
    const geometryDisposal = vi.spyOn(Geometry.prototype, "dispose").mockImplementation(function (this: Geometry) {
      geometries.push(this);
      geometryDispose.call(this);
    });
    try {
      expect(() => sim.dispose()).toThrow("Particle simulation disposal failed");
      expect(sim.cleanupPending).toBe(true);
      expect(buffer.disposed).toBe(false);
      expect(geometries).toHaveLength(1);
      expect(geometries[0]!.disposed).toBe(false);

      sim.dispose();
      expect(sim.cleanupPending).toBe(false);
      expect(buffer.disposed).toBe(true);
      expect(geometries[0]!.disposed).toBe(true);
      expect(geometryDisposal).toHaveBeenCalledTimes(2);
      expect(bufferDisposal).toHaveBeenCalledTimes(2);
      expect(peer.state!.posTarget).toBe(peerTarget);
      expect(peerTarget.disposed).toBe(false);
    } finally {
      bufferDisposal.mockRestore();
      geometryDisposal.mockRestore();
      sim.dispose();
      peer.dispose();
      device.dispose();
    }
  });

  it("defers reentrant upload disposal and retries only the failed particle resources", () => {
    const device = new MockRenderDevice();
    device.beginFrame(8, 8);
    const sim = new ParticleGpuSim(device, spec);
    const peer = new ParticleGpuSim(device, spec);
    peer.step(1 / 60);
    const peerTarget = peer.state!.posTarget;
    device.setRenderTarget(peerTarget);
    const target = sim.state!.posTarget;
    const healthy = sim.state!.velTarget;
    const targetError = new Error("target cleanup failed");
    const bufferError = new Error("buffer cleanup failed");
    const targetDisposal = vi.spyOn(target, "dispose").mockImplementationOnce(() => { throw targetError; });
    const healthyDisposal = vi.spyOn(healthy, "dispose");
    const createBuffer = device.createBuffer.bind(device);
    let late: RenderBuffer | undefined;
    let bufferDisposal: { mockRestore(): void } | undefined;
    const create = vi.spyOn(device, "createBuffer").mockImplementation((...args) => {
      late = createBuffer(...args);
      bufferDisposal = vi.spyOn(late, "dispose").mockImplementationOnce(() => { throw bufferError; });
      sim.dispose();
      return late;
    });
    try {
      expect(leaves(caught(() => sim.step(1 / 60)))).toEqual(expect.arrayContaining([targetError, bufferError]));
      expect(sim.disposed).toBe(true);
      expect(sim.cleanupPending).toBe(true);
      expect(late!.disposed).toBe(false);
      expect(target.disposed).toBe(false);
      expect(targetDisposal).toHaveBeenCalledOnce();
      expect(bufferDisposal).toHaveBeenCalledOnce();
      expect(healthyDisposal).toHaveBeenCalledOnce();
      expect(device.getRenderTarget()).toBe(peerTarget);

      sim.dispose();
      expect(sim.cleanupPending).toBe(false);
      expect(target.disposed).toBe(true);
      expect(late!.disposed).toBe(true);
      expect(targetDisposal).toHaveBeenCalledTimes(2);
      expect(bufferDisposal).toHaveBeenCalledTimes(2);
      expect(healthyDisposal).toHaveBeenCalledOnce();
      expect(device.getRenderTarget()).toBe(peerTarget);
      expect(peer.state!.posTarget).toBe(peerTarget);
      expect(peerTarget.disposed).toBe(false);
    } finally {
      targetDisposal.mockRestore();
      healthyDisposal.mockRestore();
      bufferDisposal?.mockRestore();
      create.mockRestore();
      sim.dispose();
      peer.dispose();
      device.dispose();
    }
  });

  it("retains a failed upload retirement through device loss without retrying it in the same pass", () => {
    class LossDevice extends MockRenderDevice {
      readonly listeners = new Set<() => void>();
      onDeviceLost(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
      }
      lose(): void {
        this.contextLost = true;
        for (const listener of [...this.listeners]) listener();
      }
    }
    const device = new LossDevice();
    const peerDevice = new LossDevice();
    device.beginFrame(8, 8);
    peerDevice.beginFrame(8, 8);
    const sim = new ParticleGpuSim(device, spec);
    const peer = new ParticleGpuSim(peerDevice, spec);
    const oldTarget = sim.state!.posTarget;
    const peerTarget = peer.state!.posTarget;
    const failure = new Error("late buffer retirement failed");
    const createBuffer = device.createBuffer.bind(device);
    let late: RenderBuffer | undefined;
    let bufferDisposal: { mockRestore(): void } | undefined;
    const create = vi.spyOn(device, "createBuffer").mockImplementation((...args) => {
      late = createBuffer(...args);
      bufferDisposal = vi.spyOn(late, "dispose").mockImplementationOnce(() => { throw failure; });
      device.lose();
      return late;
    });
    try {
      expect(leaves(caught(() => sim.step(1 / 60)))).toContain(failure);
      expect(late!.disposed).toBe(false);
      expect(bufferDisposal).toHaveBeenCalledOnce();
      expect(sim.state).toBeNull();
      expect(oldTarget.disposed).toBe(true);
      expect(device.getDiagnostics()).toMatchObject({ renderTargets: 0, buffers: 1 });
      expect(peer.state!.posTarget).toBe(peerTarget);

      create.mockRestore();
      device.contextLost = false;
      device.endFrame();
      device.beginFrame(8, 8);
      const restored = sim.step(1 / 60);
      expect(restored.posTarget).not.toBe(oldTarget);
      expect(late!.disposed).toBe(true);
      expect(bufferDisposal).toHaveBeenCalledTimes(2);
      expect(peer.state!.posTarget).toBe(peerTarget);
      expect(peerTarget.disposed).toBe(false);
    } finally {
      bufferDisposal?.mockRestore();
      create.mockRestore();
      sim.dispose();
      peer.dispose();
      device.dispose();
      peerDevice.dispose();
    }
  });
});
