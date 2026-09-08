import { afterEach, describe, expect, it, vi } from "vitest";
import type { GPUParticleEffectsInput } from "../../../packages/rendering/src/effects/GPUParticleBackend";
import { ResidentGPUParticleRenderer, residentLifecycleShader } from "../../../packages/rendering/src/effects/ResidentGPUParticleRenderer";

function fixture(effects: GPUParticleEffectsInput = { trailPointsPerParticle: 6 }, timestamps = false) {
  const allocations: { size: number; usage: number }[] = [];
  const copies: number[] = [];
  const copyDestinations:unknown[]=[];
  const writes: { buffer: unknown; source: ArrayBuffer | ArrayBufferView; bytes: Uint8Array }[] = [];
  const dispatches: number[] = [];
  const draws: number[][] = [];
  let clears = 0;
  const destroyed: number[] = [];
  let validation: { message: string } | null = null;
  let pushedScopes = 0;
  let poppedScopes = 0;
  let completion: Promise<void> = Promise.resolve();
  const pass = () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups(n: number) { dispatches.push(n); }, draw(...values: number[]) { draws.push(values); }, end() {} });
  const queryDestroy = vi.fn();
  const timestampPasses: object[] = [];
  const device = {
    features: { has: () => timestamps }, createQuerySet: vi.fn(() => ({ destroy: queryDestroy })),
    queue: { writeBuffer(buffer: unknown, _offset: number, source: ArrayBuffer | ArrayBufferView) {
      const bytes = source instanceof ArrayBuffer ? new Uint8Array(source) : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
      writes.push({ buffer, source, bytes: bytes.slice() });
    }, submit() {}, onSubmittedWorkDone: vi.fn(() => completion) },
    lost: new Promise(() => {}), destroy: vi.fn(), pushErrorScope() { pushedScopes++; }, popErrorScope: async () => { poppedScopes++; return validation; },
    createBuffer(descriptor: { size: number; usage: number }) {
      const id = allocations.push(descriptor); const data = new ArrayBuffer(descriptor.size);
      if(descriptor.size===80)new BigUint64Array(data).set([0n,1000000n,1000000n,3000000n,3000000n,6000000n,6000000n,10000000n,10000000n,15000000n]);
      return { destroy() { destroyed.push(id); }, async mapAsync() { await completion; }, getMappedRange() { return data; }, unmap() {} };
    },
    createShaderModule() { return {}; },
    createComputePipeline() { return { getBindGroupLayout() { return {}; } }; },
    createRenderPipeline() { return { getBindGroupLayout() { return {}; } }; },
    createBindGroup() { return {}; },
    createCommandEncoder() { return {
      clearBuffer() {}, beginComputePass(options: object) {timestampPasses.push(options);return pass();}, beginRenderPass(options: object) { timestampPasses.push(options);clears++; return pass(); }, resolveQuerySet() {},
      copyBufferToBuffer(_a: unknown, _ao: number, _b: unknown, _bo: number, bytes: number) { copies.push(bytes);copyDestinations.push(_b); }, finish() { return {}; },
    }; },
  };
  const context = { configure() {}, getCurrentTexture() { return { createView() { return {}; } }; }, unconfigure: vi.fn() };
  vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => ({ features: {has: () => timestamps}, requestDevice: async () => device, info: { description: "unit double" } }), getPreferredCanvasFormat: () => "rgba8unorm" } });
  const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
  const n = 128;
  return { allocations, copies, copyDestinations, writes, dispatches, draws, destroyed, device, context, queryDestroy, timestampPasses, get clears() { return clears; },
    get pushedScopes() { return pushedScopes; }, get poppedScopes() { return poppedScopes; },
    setValidation(error: { message: string } | null) { validation = error; }, setCompletion(value: Promise<void>) { completion = value; },
    create: () => ResidentGPUParticleRenderer.create(canvas, 640, 360, { count: n, effects,
      positions: new Float32Array(n * 4), velocities: new Float32Array(n * 4), accelerations: new Float32Array(n * 4), baseAttributes: new Float32Array(n * 8) }) };
}
afterEach(() => vi.unstubAllGlobals());

describe("resident GPU owner resource and failure contracts (native pixels verified separately)", () => {
  it("reduces exact particle counters per workgroup without a duplicate submitted-live atomic", () => {
    const shader = residentLifecycleShader(10_000, 6);
    expect(shader).toContain("var<workgroup> collectCounts: array<atomic<u32>, 7>");
    expect(shader).toContain("var<workgroup> reduceCounts: array<atomic<u32>, 8>");
    expect(shader).toContain("const reduceTotalSlots = array<u32, 8>(2u, 15u, 16u, 17u, 18u, 6u, 4u, 5u)");
    expect(shader).toContain("atomicAdd(&totals[7u + lane], value)");
    expect(shader).toContain("atomicAdd(&totals[reduceTotalSlots[lane]], value)");
    expect(shader).not.toContain("atomicAdd(&totals[3]");
    for (const counter of [2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18]) {
      expect(shader).not.toContain(`atomicAdd(&totals[${counter}], 1u)`);
    }
  });
  it("retains storage across frames and reads only the GPU reduction buffer", async () => {
    const f = fixture(); const owner = await f.create(); const initialAllocations = f.allocations.length;
    await owner.render(1 / 60); await owner.render(1 / 60);
    expect(f.allocations).toHaveLength(initialAllocations);
    expect(f.copies).toEqual([128, 4]);
    expect(f.dispatches).toHaveLength(8); // effects, child capture, recycle, reduction each frame
    expect(f.draws).toEqual([[30, 32], [6, 128], [30, 32], [6, 128]]);
    owner.dispose(); owner.dispose();
    expect(f.destroyed).toHaveLength(initialAllocations);
    expect(f.context.unconfigure).toHaveBeenCalledOnce();
  });
  it("bounds overlap to three independent readbacks and reports completions in submission order", async()=>{
    const f=fixture(),owner=await f.create();
    let releaseFirst!:()=>void,releaseSecond!:()=>void,releaseThird!:()=>void;
    f.setCompletion(new Promise<void>(resolve=>{releaseFirst=resolve;}));
    const order:number[]=[];
    const first=owner.render(1/60,false,true).then(result=>{order.push(result.diagnostics.nativeSubmissions);return result;});
    f.setCompletion(new Promise<void>(resolve=>{releaseSecond=resolve;}));
    const second=owner.render(1/60,false,true).then(result=>{order.push(result.diagnostics.nativeSubmissions);return result;});
    f.setCompletion(new Promise<void>(resolve=>{releaseThird=resolve;}));
    const third=owner.render(1/60,false,true).then(result=>{order.push(result.diagnostics.nativeSubmissions);return result;});
    expect(new Set(f.copyDestinations.slice(0,3)).size).toBe(3);
    expect(f.copies).toEqual([128, 4, 4]);
    await expect(owner.render(1/60,false,true)).rejects.toThrow(/pending/);
    expect(()=>owner.resize(800,600)).toThrow(/pending/);
    expect(()=>owner.setVisualControl({trails:false})).toThrow(/Await/);
    expect(()=>owner.dispose()).toThrow(/Await/);
    releaseThird();releaseSecond();await Promise.resolve();await Promise.resolve();await Promise.resolve();
    expect(order).toEqual([]);
    releaseFirst();await Promise.all([first,second,third]);expect(order).toEqual([1,2,3]);
    // Initialization and the first periodic counter sample are scoped. The two
    // ordinary overlapping submissions use uncaptured-error/device-loss paths.
    expect(f.pushedScopes).toBe(2);expect(f.poppedScopes).toBe(2);
    const allocations=f.allocations.length;
    f.setCompletion(Promise.resolve());const fourth=await owner.render(1/60,false,true);
    expect(fourth.diagnostics.nativeSubmissions).toBe(4);
    expect(f.copyDestinations).toHaveLength(4);expect(f.copies.at(-1)).toBe(4);expect(f.allocations).toHaveLength(allocations);
    owner.dispose();expect(f.destroyed).toHaveLength(allocations);
  });
  it("drains both overlapping frames after a validation failure without accepting a later completion",async()=>{
    const f=fixture(),owner=await f.create();let release!:()=>void;
    f.setCompletion(new Promise<void>(resolve=>{release=resolve;}));
    f.setValidation({message:'first submission invalid'});
    const first=owner.render(1/60,false,true);
    f.setValidation(null);const second=owner.render(1/60,false,true);
    const settled=Promise.allSettled([first,second]);release();
    const results=await settled;expect(results.map(result=>result.status)).toEqual(['rejected','rejected']);
    await expect(owner.render(1/60,false,true)).rejects.toThrow(/first submission invalid/);
    owner.dispose();expect(f.destroyed).toHaveLength(f.allocations.length);
  });
  it("observes queue completion and counter-map callbacks separately without substituting submission times",async()=>{
    const clock=vi.spyOn(performance,'now');let time=100;clock.mockImplementation(()=>++time);
    try{
      const f=fixture(),owner=await f.create();let release!:()=>void;
      f.device.queue.onSubmittedWorkDone.mockImplementation(()=>new Promise<void>(resolve=>{release=resolve;}));
      let settled=false;const frame=owner.render(1/60,true).then(value=>{settled=true;return value;});
      await Promise.resolve();await Promise.resolve();await Promise.resolve();
      expect(settled).toBe(false);release();const result=await frame;
      expect(result.completionFence!.submittedAt).toBeLessThan(result.completionFence!.counterMappedAt);
      expect(result.completionFence!.counterMappedAt).toBeLessThan(result.completionFence!.queueCompletedAt);
      expect(result.completionFence!.counterMapMinusQueueCompletionMs).toBeLessThan(0);
      expect(result.gpuPassMs).toBeNull();expect(result.diagnosticReadbackBytes).toBe(0);
      expect(f.copies).toEqual([128]);owner.dispose();
      const second=fixture(),other=await second.create();let releaseMap!:()=>void;
      second.setCompletion(new Promise<void>(resolve=>{releaseMap=resolve;}));
      second.device.queue.onSubmittedWorkDone.mockResolvedValue(undefined);
      const secondFrame=other.render(1/60,true);
      await Promise.resolve();await Promise.resolve();releaseMap();
      const result2=await secondFrame;expect(result2.completionFence!.counterMapMinusQueueCompletionMs).toBeGreaterThan(0);
      other.dispose();
    }finally{clock.mockRestore();}
  });
  it("bounds a stalled diagnostic completion fence and invalidates the owner cleanly",async()=>{
    vi.useFakeTimers();
    try{
      const f=fixture(),owner=await f.create();
      f.device.queue.onSubmittedWorkDone.mockImplementation(()=>new Promise<void>(()=>{}));
      const failure=expect(owner.render(1/60,true)).rejects.toThrow(/completion fence exceeded 5000 ms/);
      await vi.advanceTimersByTimeAsync(5000);await failure;
      expect(vi.getTimerCount()).toBe(0);
      await expect(owner.render(1/60)).rejects.toThrow(/completion fence exceeded/);
      owner.dispose();expect(f.destroyed).toHaveLength(f.allocations.length);
    }finally{vi.useRealTimers();}
  });
  it("keeps GPU timestamp instrumentation out of acceptance frames and measures only opted-in diagnostics", async () => {
    const f=fixture(undefined,true);const owner=await f.create();
    await owner.render(1/60);
    expect(f.device.createQuerySet).not.toHaveBeenCalled();
    expect(f.device.queue.onSubmittedWorkDone).not.toHaveBeenCalled();
    expect(f.timestampPasses.every(pass=>!("timestampWrites" in pass))).toBe(true);
    const diagnostic=await owner.render(1/60,true);
    expect(diagnostic.gpuPassMs).toEqual({effects:1,collect:2,recycle:3,reduce:4,draw:5});
    expect(diagnostic.diagnosticReadbackBytes).toBe(80);
    expect(f.copies).toEqual([128,128,80]);
    expect(f.device.queue.onSubmittedWorkDone).toHaveBeenCalledTimes(1);
    expect(f.timestampPasses.slice(5).every(pass=>"timestampWrites" in pass)).toBe(true);
    await owner.render(1/60);
    expect(f.copies).toEqual([128,128,80,4]);
    expect(f.device.queue.onSubmittedWorkDone).toHaveBeenCalledTimes(1);
    expect(f.timestampPasses.slice(10).every(pass=>!("timestampWrites" in pass))).toBe(true);
    owner.dispose();expect(f.queryDestroy).toHaveBeenCalledOnce();
    const unsupported=fixture();const second=await unsupported.create();
    expect(await second.render(1/60,true)).toMatchObject({gpuPassMs:null,diagnosticReadbackBytes:0});
    second.dispose();
  });
  it("reuses the initial uniform allocation while updating only dt and elapsed-time ABI lanes", async () => {
    let windReads = 0;
    const f = fixture({
      trailPointsPerParticle: 6, seed: 19,
      get wind() { windReads++; return { direction: { x: 1, y: 0, z: 0 }, strength: 0.5,
        gustAmplitude: 0.2, gustDirection: { x: 0, y: 1, z: 0 }, gustFrequency: 0.4, gustSpeed: 0.8 }; },
      turbulence: { strength: 0.9, scale: 0.7, flowSpeed: 0.15, lut: new Float32Array(8 ** 3 * 4), lutResolution: 8 },
      heightfield: { originX: -1, originZ: -1, cellSize: 1, columns: 2, rows: 2,
        heights: new Float32Array([0, 0.1, 0.2, 0]), restitution: 0.3, killOnContact: false },
      lifeCurves: { stops: 16, colors: new Float32Array(64).fill(0.5), sizes: new Float32Array(16).fill(0.03) },
    });
    const owner = await f.create();
    const uniformInitial = f.writes.find(write => write.bytes.byteLength === 272)!;
    const readsAfterCreation = windReads;
    const initialBytes = uniformInitial.bytes.slice();
    await owner.render(0.125); await owner.render(0); await owner.render(0.0625);
    expect(windReads).toBe(readsAfterCreation);
    const uniforms = f.writes.filter(write => write.buffer === uniformInitial.buffer);
    expect(uniforms).toHaveLength(4);
    for (const [index, write] of uniforms.slice(1).entries()) {
      expect(write.source).toBe(uniformInitial.source);
      const view = new DataView(write.bytes.buffer);
      expect(view.getFloat32(0, true)).toBe([0.125, 0, 0.0625][index]);
      expect(view.getFloat32(8, true)).toBe([0.125, 0.125, 0.1875][index]);
      expect(view.getUint32(4, true)).toBe(128);
      expect(write.bytes.slice(4, 8)).toEqual(initialBytes.slice(4, 8));
      expect(write.bytes.slice(12)).toEqual(initialBytes.slice(12));
    }
    owner.dispose();
  });
  it("measures CPU phases and keeps the native clear/map baseline separate from particle simulation", async () => {
    const f = fixture(); const owner = await f.create();
    const first = await owner.render(0.125);
    for (const milliseconds of Object.values(first.cpuPhases)) expect(milliseconds).toBeGreaterThanOrEqual(0);
    const dispatchCount = f.dispatches.length, drawCount = f.draws.length, writeCount = f.writes.length;
    let release!: () => void; f.setCompletion(new Promise(resolve => { release = resolve; }));
    let settled = false;
    const control = owner.renderPacingControl().then(result => { settled = true; return result; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await expect(owner.renderPacingControl()).rejects.toThrow(/pending/);
    await expect(owner.render(0.125)).rejects.toThrow(/pending/);
    await expect(owner.render(0.125,false,true)).rejects.toThrow(/pending/);
    expect(() => owner.dispose()).toThrow(/Await/);
    release();
    const baseline = await control;
    expect(baseline).toMatchObject({ kind: "native-clear-map-pacing-control", readbackBytes: 128, drawCalls: 0,
      computeDispatches: 0, nativeSubmissions: 2, width: 640, height: 360 });
    expect(f.dispatches).toHaveLength(dispatchCount); expect(f.draws).toHaveLength(drawCount);
    expect(f.writes).toHaveLength(writeCount); expect(f.copies).toEqual([128, 128]); expect(f.clears).toBe(2);
    for (const milliseconds of Object.values(baseline.cpuPhases)) expect(milliseconds).toBeGreaterThanOrEqual(0);
    expect(baseline.totalMs).toBeGreaterThanOrEqual(baseline.cpuPhases.mapWaitMs);
    await owner.render(0.125);
    const lastUniform = f.writes.filter(write => write.bytes.byteLength === 272).at(-1)!;
    expect(new DataView(lastUniform.bytes.buffer).getFloat32(8, true)).toBe(0.25);
    owner.dispose();
  });
  it("redraws diagnostic controls without dispatching simulation or changing particle state", async () => {
    const f = fixture(); const owner = await f.create();
    owner.setVisualControl({ trails: false, softFade: false, lighting: false });
    await owner.render(0);
    expect(f.dispatches).toHaveLength(1); // reduction only
    expect(f.draws).toEqual([[6, 128]]);
    owner.dispose();
  });
  it("rejects concurrent mutation and invalidates subsequent frames after native validation failure", async () => {
    const f = fixture(); const owner = await f.create();
    let release!: () => void; f.setCompletion(new Promise(resolve => { release = resolve; }));
    f.setValidation({ message: "invalid native bind group" });
    let settled = false;
    const frame = owner.render(1 / 60);
    void frame.then(() => { settled = true; }, () => { settled = true; });
    expect(() => owner.resize(300, 300)).toThrow(/pending/);
    expect(() => owner.dispose()).toThrow(/Await/);
    await expect(owner.render(1 / 60)).rejects.toThrow(/pending/);
    expect(settled).toBe(false);
    expect(f.device.queue.onSubmittedWorkDone).not.toHaveBeenCalled();
    release();
    await expect(frame).rejects.toThrow(/invalid native bind group/);
    await expect(owner.render(1 / 60)).rejects.toThrow(/invalid native bind group/);
    owner.dispose();
  });
});
