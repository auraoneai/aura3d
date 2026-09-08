import { createEffectsParticleComputeShader, encodeGPUParticleEffects, type GPUParticleEffectsInput } from "./GPUParticleBackend.js";

/** Fixed authored camera, shared by clipping, billboard orientation and ground-ray fade. */
export const RESIDENT_PARTICLE_CAMERA = {
  position: [0, 2.5, 7.2] as const, target: [0, 1.4, 0] as const, fovDegrees: 65, near: 0.05, far: 30,
} as const;
const cameraDepth = Math.hypot(1.1, 7.2);
const cameraForwardY = -1.1 / cameraDepth;
const cameraForwardZ = -7.2 / cameraDepth;
const cameraPositionWGSL = "vec3<f32>(0.0, 2.5, 7.2)";

// Structural native interfaces keep this module usable without ambient @webgpu/types.
interface Buffer { destroy(): void; mapAsync(mode: number): Promise<void>; getMappedRange(): ArrayBuffer; unmap(): void }
interface QuerySet { destroy(): void }
interface Pipeline { getBindGroupLayout(index: number): unknown }
interface Pass { setPipeline(pipeline: Pipeline): void; setBindGroup(index: number, group: unknown): void; dispatchWorkgroups(x: number): void; draw(vertices: number, instances?: number): void; end(): void }
interface Encoder { beginComputePass(options?: object): Pass; beginRenderPass(options: object): Pass; clearBuffer(buffer: Buffer): void; copyBufferToBuffer(a: Buffer, ao: number, b: Buffer, bo: number, bytes: number): void; resolveQuerySet(querySet: QuerySet, first: number, count: number, destination: Buffer, offset: number): void; finish(): unknown }
interface NativeDevice {
  features?: { has(name: string): boolean }; createQuerySet(options: object): QuerySet;
  queue: { writeBuffer(buffer: Buffer, offset: number, data: ArrayBuffer | ArrayBufferView): void; submit(commands: unknown[]): void; onSubmittedWorkDone(): Promise<void> };
  createBuffer(options: object): Buffer; createShaderModule(options: object): unknown;
  createComputePipeline(options: object): Pipeline; createRenderPipeline(options: object): Pipeline;
  createBindGroup(options: object): unknown; createCommandEncoder(options?: object): Encoder;
  lost: Promise<{ message?: string }>; pushErrorScope(filter: "validation"): void; popErrorScope(): Promise<{ message: string } | null>; destroy(): void;
  addEventListener?(type: "uncapturederror", listener: (event: { error?: { message?: string } }) => void): void;
}
interface Context { configure(options: object): void; getCurrentTexture(): { createView(): unknown }; unconfigure(): void }
export interface ResidentGPUParticleOptions {
  effects: GPUParticleEffectsInput; count: number; positions: Float32Array; velocities: Float32Array;
  accelerations: Float32Array; baseAttributes: Float32Array;
}
/** CPU wall-clock intervals; these include browser/IPC scheduling, not GPU timestamps. */
export interface ResidentParticleCPUPhases {
  encodeSubmitMs: number;
  mapWaitMs: number;
  /** Residual validation wait after mapping completes; the promises overlap. */
  validationWaitMs: number;
  completionOrderWaitMs?: number;
}
export interface ResidentParticlePacingControl {
  kind: "native-clear-map-pacing-control";
  cpuPhases: ResidentParticleCPUPhases;
  totalMs: number;
  readbackBytes: 128;
  drawCalls: 0;
  computeDispatches: 0;
  nativeSubmissions: number;
  width: number;
  height: number;
}
export interface ResidentParticleFrame {
  completionFence?: {
    submittedAt: number;
    queueCompletedAt: number;
    counterMappedAt: number;
    counterMapMinusQueueCompletionMs: number;
  };
  gpuPassMs?: Record<string, number> | null;
  diagnosticReadbackBytes?: number;
  /** Actual callback time for this submission's GPU copy/map completion. */
  queueCompletedAt: number;
  /** Submission whose compact reduction counters back this receipt. */
  counterSourceSubmission: number;
  /** Completed submissions since the mapped counter source (0 on sampled frames). */
  counterSampleAge: number;
  cpuPhases: ResidentParticleCPUPhases;
  live: number; renderedLive: number; frustumRejected: number; fadeRejected: number; alphaRejected: number; sizeRejected: number; trailCount: number; ribbonVertices: number; faded: number;
  count: number; workgroups: number; readbackBytes: number; collision: number; trails: number;
  subemitters: number; turbulence: number; curves: number; lighting: number; collisionContacts: number;
  childRequests: number; childSpawns: number; computeAndReadbackMs: number;
  diagnostics: { drawCalls: number; nativeSubmissions: number; gpuResident: true; adapterName: string; readbackBytes: number; buffers: number; shaders: number; lastError: string | null; contextLost: boolean; camera: typeof RESIDENT_PARTICLE_CAMERA };
}

/** One native device owns simulation storage, GPU lifecycle, reduction, and vertex-pulled drawing. */
export class ResidentGPUParticleRenderer {
  readonly camera = RESIDENT_PARTICLE_CAMERA;
  private disposed = false;
  private pending = false;
  private activeFrames = 0;
  private exclusiveFrame = false;
  private readonly busyReadbacks = new Set<Buffer>();
  private secondReadback?: Buffer;
  private thirdReadback?: Buffer;
  private completionTail: Promise<void> = Promise.resolve();
  private failure: Error | null = null;
  private time = 0;
  private submissions = 0;
  private counterSourceSubmission = 0;
  private lastCounters: Uint32Array | null = null;
  private visualFlags = 7;
  private readonly buffers: Buffer[] = [];
  private readonly effectsPipeline: Pipeline;
  private readonly effectsGroup: unknown;
  private readonly lifecycle: Pipeline;
  private readonly collect: Pipeline;
  private readonly reduce: Pipeline;
  private readonly auxiliaryGroup: unknown;
  private readonly sprite: Pipeline;
  private readonly ribbon: Pipeline;
  private readonly spriteGroup: unknown;
  private readonly ribbonGroup: unknown;
  private readonly params: Buffer;
  private readonly simulationUniform: ArrayBuffer;
  private readonly simulationUniformView: DataView;
  private readonly view: Buffer;
  private readonly counters: Buffer;
  private readonly requests: Buffer;
  private readonly readback: Buffer;
  private readonly trailDepth: number;
  private timestampQuery?: QuerySet;
  private timestampResolve?: Buffer;
  private timestampReadback?: Buffer;
  get supportsGPUTimestamps(): boolean { return this.device.features?.has("timestamp-query") === true; }

  static async create(canvas: HTMLCanvasElement, width: number, height: number, options: ResidentGPUParticleOptions): Promise<ResidentGPUParticleRenderer> {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(options: object): Promise<{ features?: { has(name: string): boolean }; requestDevice(options?: object): Promise<NativeDevice>; info?: { description?: string; vendor?: string; architecture?: string } } | null>; getPreferredCanvasFormat(): string } }).gpu;
    if (!gpu) throw new Error("Resident particles require native WebGPU.");
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("Resident particles: no WebGPU adapter.");
    const device = await adapter.requestDevice(adapter.features?.has("timestamp-query") ? { requiredFeatures: ["timestamp-query"] } : {});
    try {
      const context = canvas.getContext("webgpu") as unknown as Context | null;
      if (!context) throw new Error("Resident particles: WebGPU canvas unavailable.");
      device.pushErrorScope("validation");
      const owner = new ResidentGPUParticleRenderer(device, context, canvas, width, height, gpu.getPreferredCanvasFormat(), options,
        [adapter.info?.description, adapter.info?.vendor, adapter.info?.architecture].filter(Boolean).join(" "));
      const error = await device.popErrorScope();
      if (error) { owner.dispose(); throw new Error(`Resident particle initialization: ${error.message}`); }
      return owner;
    } catch (error) { device.destroy(); throw error; }
  }

  private constructor(private readonly device: NativeDevice, private readonly context: Context, private readonly canvas: HTMLCanvasElement,
    width: number, height: number, format: string, private readonly options: ResidentGPUParticleOptions, readonly adapterName: string) {
    const n = options.count;
    if (!Number.isInteger(n) || n < 1 || options.positions.length !== n * 4 || options.velocities.length !== n * 4
      || options.accelerations.length !== n * 4 || options.baseAttributes.length !== n * 8) throw new RangeError("Resident particle buffer lengths must match count.");
    const plan = encodeGPUParticleEffects(options.effects, 0, n);
    this.simulationUniform = plan.uniform;
    this.simulationUniformView = new DataView(this.simulationUniform);
    this.trailDepth = plan.trailDepth;
    if (this.trailDepth < 2) throw new RangeError("Resident ribbons require at least two trail points.");
    const allocate = (size: number, usage = 140, data?: ArrayBuffer | ArrayBufferView): Buffer => {
      const buffer = device.createBuffer({ label: "aura3d-resident-particle-storage", size: Math.max(size, 16), usage });
      this.buffers.push(buffer); if (data) device.queue.writeBuffer(buffer, 0, data); return buffer;
    };
    const p = allocate(n * 16, 140, options.positions), v = allocate(n * 16, 140, options.velocities);
    const a = allocate(n * 16, 140, options.accelerations);
    this.params = allocate(plan.uniform.byteLength, 72, plan.uniform);
    const fields = allocate(plan.fieldData.byteLength, 140, plan.fieldData);
    this.requests = allocate(n * 4);
    const initialTrail = new Float32Array(n * this.trailDepth * 4);
    for (let i = 0; i < n; i++) for (let k = 0; k < this.trailDepth; k++) {
      initialTrail.set(options.positions.subarray(i * 4, i * 4 + 3), (i * this.trailDepth + k) * 4);
      initialTrail[(i * this.trailDepth + k) * 4 + 3] = -1;
    }
    const trail = allocate(initialTrail.byteLength, 140, initialTrail);
    const attributes = allocate(n * 32, 140, options.baseAttributes), base = allocate(n * 32, 140, options.baseAttributes);
    const templates = new Float32Array(n * 12);
    for (let i = 0; i < n; i++) { templates.set(options.positions.subarray(i * 4, i * 4 + 4), i * 12); templates[i * 12 + 3] = 0; templates.set(options.velocities.subarray(i * 4, i * 4 + 4), i * 12 + 4); templates.set(options.accelerations.subarray(i * 4, i * 4 + 4), i * 12 + 8); }
    const seeds = allocate(templates.byteLength, 140, templates);
    // Two vec4 entries per queued child; records are captured before any parent is recycled.
    const children = allocate(n * 32);
    this.counters = allocate(128);
    this.readback = allocate(128, 9);
    this.view = allocate(32, 72);
    const entries = (buffers: Buffer[]) => buffers.map((buffer, binding) => ({ binding, resource: { buffer } }));
    this.effectsPipeline = device.createComputePipeline({ label: "resident-a4-verbatim-effects", layout: "auto", compute: {
      module: device.createShaderModule({ code: createEffectsParticleComputeShader({ preserveTrailBirthAge: true }) }), entryPoint: "main" } });
    this.effectsGroup = device.createBindGroup({ layout: this.effectsPipeline.getBindGroupLayout(0), entries: entries([p, v, a, this.params, fields, this.requests, trail, attributes, base]) });
    // Compute entry points use separate auto layouts with persistent resource bindings.
    const auxiliarySource = residentLifecycleShader(n, this.trailDepth);
    const auxiliaryModule = device.createShaderModule({ code: auxiliarySource });
    this.collect = device.createComputePipeline({ layout: "auto", compute: { module: auxiliaryModule, entryPoint: "collect" } });
    this.lifecycle = device.createComputePipeline({ layout: "auto", compute: { module: auxiliaryModule, entryPoint: "recycle" } });
    this.reduce = device.createComputePipeline({ layout: "auto", compute: { module: auxiliaryModule, entryPoint: "reduce" } });
    // Auto layouts prune unused bindings per entry point, so create each group independently below.
    const all = [p, v, attributes, trail, this.requests, seeds, children, this.counters, this.view, a];
    this.auxiliaryGroup = {
      collect: device.createBindGroup({ layout: this.collect.getBindGroupLayout(0), entries: [0,1,2,4,6,7].map(binding => ({ binding, resource: { buffer: all[binding]! } })) }),
      recycle: device.createBindGroup({ layout: this.lifecycle.getBindGroupLayout(0), entries: [0,1,2,3,5,6,7,9].map(binding => ({ binding, resource: { buffer: all[binding]! } })) }),
      reduce: device.createBindGroup({ layout: this.reduce.getBindGroupLayout(0), entries: [0,2,3,7,8].map(binding => ({ binding, resource: { buffer: all[binding]! } })) }),
    };
    const drawModule = device.createShaderModule({ code: residentDrawShader(n, this.trailDepth, options.effects.lighting) });
    const drawPipeline = (entryPoint: string) => device.createRenderPipeline({ label: `resident-${entryPoint}`, layout: "auto",
      vertex: { module: drawModule, entryPoint }, fragment: { module: drawModule, entryPoint: "fragment", targets: [{ format,
        blend: { color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" } } }] },
      primitive: { topology: "triangle-list", cullMode: "none" } });
    this.sprite = drawPipeline("sprite"); this.ribbon = drawPipeline("ribbon");
    this.spriteGroup = device.createBindGroup({ layout: this.sprite.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: p } }, { binding: 1, resource: { buffer: attributes } }, { binding: 3, resource: { buffer: this.view } }, { binding: 4, resource: { buffer: v } }] });
    this.ribbonGroup = device.createBindGroup({ layout: this.ribbon.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: p } }, { binding: 1, resource: { buffer: attributes } }, { binding: 2, resource: { buffer: trail } }, { binding: 3, resource: { buffer: this.view } }, { binding: 4, resource: { buffer: v } }] });
    this.resize(width, height); context.configure({ device, format, alphaMode: "opaque" });
    device.addEventListener?.("uncapturederror", event => {
      this.failure = new Error(`Resident particle uncaptured GPU error: ${event.error?.message ?? "unknown"}`);
    });
    void device.lost.then(info => { this.failure = new Error(`Resident particle device lost: ${info.message ?? "unknown"}`); });
  }

  resize(width: number, height: number): void {
    if (this.disposed || this.pending) throw new Error("Cannot resize disposed or pending resident particles.");
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError("Invalid resident particle viewport.");
    this.canvas.width = width; this.canvas.height = height;
    this.device.queue.writeBuffer(this.view, 0, new Float32Array([width / height, 0.45, 0.45, 0, ...RESIDENT_PARTICLE_CAMERA.position, this.visualFlags]));
  }

  /** Diagnostic controls only; timed full-feature runs must retain all three defaults. */
  setVisualControl(control: { trails?: boolean; softFade?: boolean; lighting?: boolean }): void {
    if (this.pending || this.disposed) throw new Error("Await frame before changing resident visual controls.");
    for (const [key, bit] of [["trails", 1], ["softFade", 2], ["lighting", 4]] as const) {
      if (control[key] !== undefined) this.visualFlags = control[key] ? this.visualFlags | bit : this.visualFlags & ~bit;
    }
    this.device.queue.writeBuffer(this.view, 28, new Float32Array([this.visualFlags]));
  }

  async render(dt: number, gpuDiagnostic = false, allowOverlap = false): Promise<ResidentParticleFrame> {
    const limit=allowOverlap&&!gpuDiagnostic?3:1;
    if (this.disposed || this.failure || (this.pending && this.activeFrames === 0) || this.activeFrames >= limit || (this.activeFrames > 0 && (this.exclusiveFrame || gpuDiagnostic))) throw this.failure ?? new Error("Resident particle renderer disposed or frame pending.");
    if (!Number.isFinite(dt) || dt < 0 || dt > 0.25) throw new RangeError("Resident particle dt must be in [0, .25].");
    const submittedFrame=this.submissions+1;
    // Each submission copies and maps at least one counter word into its own slot.
    // That map callback is bound to this command buffer, unlike queue-wide
    // onSubmittedWorkDone callbacks which may coalesce multiple overlapping frames.
    // Full compact counters remain periodic and are accepted for at most 59 later submissions.
    const sampleCounters=gpuDiagnostic||submittedFrame===1||(submittedFrame-1)%60===0;
    if (allowOverlap && !this.secondReadback) { this.secondReadback=this.device.createBuffer({size:128,usage:9});this.buffers.push(this.secondReadback); }
    if (allowOverlap && this.busyReadbacks.size >= 2 && !this.thirdReadback) { this.thirdReadback=this.device.createBuffer({size:128,usage:9});this.buffers.push(this.thirdReadback); }
    const readback=[this.readback,this.secondReadback,this.thirdReadback].find(buffer=>buffer&&!this.busyReadbacks.has(buffer));
    if(!readback)throw new Error("Resident particle completion readback pending.");
    this.busyReadbacks.add(readback);
    const completionReadbackBytes=sampleCounters?128:4;
    if(!allowOverlap||gpuDiagnostic)this.exclusiveFrame=true;
    const previousCompletion=this.completionTail;
    let releaseCompletion!:()=>void;
    this.completionTail=new Promise<void>(resolve=>{releaseCompletion=resolve;});
    this.activeFrames++;this.pending=true; const start = performance.now();
    // popErrorScope crosses the browser/GPU-process boundary and measured 9.2ms
    // p95 on the reference runner. Keep it on every periodic counter sample and
    // explicit diagnostic/control submission; ordinary acceptance frames remain
    // covered by uncapturederror, device loss, and their queue-completion fence.
    const validateSubmission=sampleCounters||gpuDiagnostic||!allowOverlap;
    if(validateSubmission)this.device.pushErrorScope("validation");
    let scopePending = validateSubmission;
    let fenceTimer:ReturnType<typeof setTimeout>|undefined;
    try {
      const timestamped = gpuDiagnostic && this.supportsGPUTimestamps;
      if (timestamped && !this.timestampQuery) {
        this.timestampQuery = this.device.createQuerySet({ type: "timestamp", count: 10 });
        this.timestampResolve = this.device.createBuffer({ size: 80, usage: 512 | 4 });
        this.timestampReadback = this.device.createBuffer({ size: 80, usage: 1 | 8 });
        this.buffers.push(this.timestampResolve, this.timestampReadback);
      }
      let queryIndex = 0;
      const timestampWrites = () => { const begin=queryIndex;queryIndex+=2;return timestamped?{timestampWrites:{querySet:this.timestampQuery,beginningOfPassWriteIndex:begin,endOfPassWriteIndex:begin+1}}:{}; };
      this.time += dt;
      this.simulationUniformView.setFloat32(0, dt, true);
      this.simulationUniformView.setFloat32(8, this.time, true);
      this.device.queue.writeBuffer(this.params, 0, this.simulationUniform);
      const encoder = this.device.createCommandEncoder({ label: "resident-particles-simulate-lifecycle-draw" });
      encoder.clearBuffer(this.requests); encoder.clearBuffer(this.counters);
      const groups = this.auxiliaryGroup as { collect: unknown; recycle: unknown; reduce: unknown };
      const dispatch = (pipeline: Pipeline, group: unknown) => { const pass=encoder.beginComputePass(timestampWrites());pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(this.options.count/64));pass.end(); };
      if (dt > 0) { dispatch(this.effectsPipeline,this.effectsGroup);dispatch(this.collect,groups.collect);dispatch(this.lifecycle,groups.recycle); }
      dispatch(this.reduce,groups.reduce);
      const draw=encoder.beginRenderPass({...timestampWrites(),colorAttachments:[{view:this.context.getCurrentTexture().createView(),loadOp:"clear",storeOp:"store",clearValue:{r:.018,g:.028,b:.05,a:1}}]});
      if(this.visualFlags&1){draw.setPipeline(this.ribbon);draw.setBindGroup(0,this.ribbonGroup);draw.draw(6*(this.trailDepth-1),Math.ceil(this.options.count/4));}
      draw.setPipeline(this.sprite);draw.setBindGroup(0,this.spriteGroup);draw.draw(6,this.options.count);draw.end();
      encoder.copyBufferToBuffer(this.counters,0,readback,0,completionReadbackBytes);
      if(timestamped){encoder.resolveQuerySet(this.timestampQuery!,0,queryIndex,this.timestampResolve!,0);encoder.copyBufferToBuffer(this.timestampResolve!,0,this.timestampReadback!,0,queryIndex*8);}
      this.device.queue.submit([encoder.finish()]);this.submissions=submittedFrame;
      const submittedAt=performance.now();
      const queueCompletion=gpuDiagnostic?Promise.race([
        this.device.queue.onSubmittedWorkDone().then(()=>({at:performance.now(),error:null as string|null}),error=>({at:performance.now(),error:String(error)})),
        new Promise<{at:number;error:string|null}>(resolve=>{fenceTimer=setTimeout(()=>resolve({at:performance.now(),error:'GPU completion fence exceeded 5000 ms'}),5000);}),
      ]):undefined;
      const validation=validateSubmission?this.device.popErrorScope():Promise.resolve(null);scopePending=false;
      const mapStartedAt=performance.now();
      await readback.mapAsync(1);
      const counterMappedAt=performance.now();
      let gpuPassMs:Record<string,number>|null=null;
      if(timestamped){await this.timestampReadback!.mapAsync(1);try{const timestamps=new BigUint64Array(this.timestampReadback!.getMappedRange());const names=dt>0?["effects","collect","recycle","reduce","draw"]:["reduce","draw"];gpuPassMs=Object.fromEntries(names.map((name,index)=>[name,Number(timestamps[index*2+1]!-timestamps[index*2]!)/1e6]));}finally{this.timestampReadback!.unmap();}}
      const mappedAt=performance.now();
      const validationError=await validation;
      const observedFence=queueCompletion?await queueCompletion:{at:counterMappedAt,error:null as string|null};
      if(fenceTimer!==undefined){clearTimeout(fenceTimer);fenceTimer=undefined;}
      if(observedFence.error){readback.unmap();throw new Error(`Resident particle completion: ${observedFence.error}`);}
      const validatedAt=performance.now();
      await previousCompletion;
      const orderedAt=performance.now();
      if(validationError){readback.unmap();throw new Error(`Resident particle frame: ${validationError.message}`);}
      if(sampleCounters){this.lastCounters=new Uint32Array(readback.getMappedRange().slice(0));this.counterSourceSubmission=submittedFrame;}
      readback.unmap();
      if(this.failure)throw this.failure;
      const c=this.lastCounters;
      if(!c||this.counterSourceSubmission<1)throw new Error("Resident particle counters were not initialized.");
      const readbackBytes=completionReadbackBytes;
      return { ...(gpuDiagnostic?{completionFence:{submittedAt,queueCompletedAt:observedFence.at,counterMappedAt,counterMapMinusQueueCompletionMs:counterMappedAt-observedFence.at},gpuPassMs,diagnosticReadbackBytes:timestamped?queryIndex*8:0}:{}),
        queueCompletedAt:observedFence.at,counterSourceSubmission:this.counterSourceSubmission,counterSampleAge:submittedFrame-this.counterSourceSubmission,
        cpuPhases:{encodeSubmitMs:submittedAt-start,mapWaitMs:mappedAt-mapStartedAt,validationWaitMs:validatedAt-mappedAt,completionOrderWaitMs:orderedAt-validatedAt},
        live:c[2]!,renderedLive:c[2]!,frustumRejected:c[15]!,fadeRejected:c[16]!,alphaRejected:c[17]!,sizeRejected:c[18]!,count:c[2]!,trailCount:c[4]!,ribbonVertices:c[5]!,faded:c[6]!,collision:c[7]!,trails:c[8]!,subemitters:c[9]!,turbulence:c[10]!,curves:c[11]!,lighting:c[12]!,collisionContacts:c[13]!,childRequests:c[0]!,childSpawns:c[14]!,workgroups:Math.ceil(this.options.count/64),readbackBytes,
        computeAndReadbackMs:performance.now()-start,diagnostics:{drawCalls:this.visualFlags&1?2:1,buffers:this.buffers.length,shaders:3,lastError:null,contextLost:false,camera:this.camera,nativeSubmissions:submittedFrame,gpuResident:true,adapterName:this.adapterName,readbackBytes} };
    } catch(error){this.failure=error instanceof Error?error:new Error(String(error));throw error;}
    finally{if(fenceTimer!==undefined)clearTimeout(fenceTimer);if(scopePending)await this.device.popErrorScope();this.busyReadbacks.delete(readback);this.activeFrames--;if(!allowOverlap||gpuDiagnostic)this.exclusiveFrame=false;this.pending=this.activeFrames>0;releaseCompletion();}
  }

  /** Post-measurement diagnostic baseline, never a substitute for render(dt).
   * Clears this native canvas, then maps the ordered copy without particle work.
   * Existing particle storage, simulation time and feature settings are retained.
   */
  async renderPacingControl(): Promise<ResidentParticlePacingControl> {
    if (this.disposed || this.pending || this.failure) throw this.failure ?? new Error("Resident particle renderer disposed or frame pending.");
    this.pending = true;
    const start = performance.now();
    this.device.pushErrorScope("validation");
    let scopePending = true;
    try {
      const encoder = this.device.createCommandEncoder({ label: "resident-particle-diagnostic-clear-map-only" });
      const clear = encoder.beginRenderPass({ colorAttachments: [{
        view: this.context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store",
        clearValue: { r: .018, g: .028, b: .05, a: 1 },
      }] });
      clear.end();
      encoder.copyBufferToBuffer(this.counters, 0, this.readback, 0, 128);
      this.device.queue.submit([encoder.finish()]); this.submissions++;
      const submittedAt = performance.now();
      const validation = this.device.popErrorScope(); scopePending = false;
      const mapStartedAt = performance.now();
      await this.readback.mapAsync(1);
      const mappedAt = performance.now();
      const validationError = await validation;
      const validatedAt = performance.now();
      this.readback.unmap();
      if (validationError) throw new Error(`Resident particle pacing control: ${validationError.message}`);
      if (this.failure) throw this.failure;
      return { kind: "native-clear-map-pacing-control", cpuPhases: {
        encodeSubmitMs: submittedAt - start, mapWaitMs: mappedAt - mapStartedAt, validationWaitMs: validatedAt - mappedAt,
      }, totalMs: performance.now() - start, readbackBytes: 128, drawCalls: 0, computeDispatches: 0,
      nativeSubmissions: this.submissions, width: this.canvas.width, height: this.canvas.height };
    } catch (error) { this.failure = error instanceof Error ? error : new Error(String(error)); throw error; }
    finally { if (scopePending) await this.device.popErrorScope(); this.pending = false; }
  }

  dispose(): void {
    if (this.pending) throw new Error("Await resident particle frame before disposal.");
    if (this.disposed) return; this.disposed = true;
    this.timestampQuery?.destroy();
    for (const buffer of this.buffers) buffer.destroy(); this.context.unconfigure(); this.device.destroy();
  }
}

const projection = `
struct View { aspect: f32, fade: f32, trailLife: f32, delta: f32, camera: vec4<f32> };
fn project(p: vec3<f32>, aspect: f32) -> vec4<f32> {
  let relative = p - ${cameraPositionWGSL};
  let depth = dot(relative, vec3<f32>(0.0, ${cameraForwardY}, ${cameraForwardZ}));
  let y = dot(relative, vec3<f32>(0.0, ${-cameraForwardZ}, ${cameraForwardY}));
  return vec4<f32>(relative.x * 1.56968558 / aspect, y * 1.56968558, depth * (30.0 / 29.95) - 1.5 / 29.95, depth);
}
fn softFade(p: vec3<f32>, distance: f32) -> f32 {
  let ray = p - ${cameraPositionWGSL};
  if (ray.y >= -0.0001) { return 1.0; }
  let groundT = -2.5 / ray.y;
  return clamp((groundT - 1.0) * length(ray) / distance, 0.0, 1.0);
}
fn visible(p: vec3<f32>, aspect: f32) -> bool {
  let c = project(p, aspect);
  return c.w > 0.05 && c.w < 30.0 && abs(c.x) < c.w && abs(c.y) < c.w;
}
`;

export function residentLifecycleShader(count: number, depth: number): string {
  return `${projection}
@group(0) @binding(0) var<storage, read_write> p: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> v: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> attr: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> trail: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> requests: array<u32>;
@group(0) @binding(5) var<storage, read> seeds: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> children: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read_write> totals: array<atomic<u32>>;
@group(0) @binding(8) var<uniform> view: View;
@group(0) @binding(9) var<storage, read_write> acceleration: array<vec4<f32>>;
var<workgroup> collectCounts: array<atomic<u32>, 7>;
var<workgroup> reduceCounts: array<atomic<u32>, 8>;
const reduceTotalSlots = array<u32, 8>(2u, 15u, 16u, 17u, 18u, 6u, 4u, 5u);
fn hash(i: u32) -> f32 { var x = i * 747796405u + 2891336453u; x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u; return f32((x >> 22u) ^ x) / 4294967295.0; }
@compute @workgroup_size(64) fn collect(@builtin(global_invocation_id) id: vec3<u32>, @builtin(local_invocation_index) lane: u32) {
  if (lane < 7u) { atomicStore(&collectCounts[lane], 0u); }
  workgroupBarrier();
  let i = id.x;
  if (i < ${count}u) {
    let mask = u32(attr[i * 2u + 1u].y);
    if ((mask & 12u) != 0u) { atomicAdd(&collectCounts[0], 1u); }
    if ((mask & 128u) != 0u) { atomicAdd(&collectCounts[1], 1u); }
    if ((mask & 16u) != 0u) { atomicAdd(&collectCounts[2], 1u); }
    if ((mask & 2u) != 0u) { atomicAdd(&collectCounts[3], 1u); }
    if ((mask & 288u) == 288u) { atomicAdd(&collectCounts[4], 1u); }
    if ((mask & 64u) != 0u) { atomicAdd(&collectCounts[5], 1u); }
    atomicAdd(&collectCounts[6], u32(attr[i * 2u + 1u].w));
    let requested = (requests[i] & 65535u) + (requests[i] >> 16u);
    let offset = atomicAdd(&totals[0], requested);
    for (var k = 0u; k < requested; k++) {
      let child = offset + k;
      if (child < ${count}u) {
        let r = hash(i * 3u + k); let angle = r * 6.2831853;
        let z = hash(i * 7u + k + 41u) * 2.0 - 1.0;
        let radius = sqrt(max(0.0, 1.0 - z * z));
        let direction = vec3<f32>(radius * cos(angle), z, radius * sin(angle));
        children[child * 2u] = vec4<f32>(p[i].xyz + direction * 0.05, 0.0);
        children[child * 2u + 1u] = vec4<f32>(v[i].xyz * 0.4 + direction * (0.8 + r), 0.4 + 0.5 * r);
      }
    }
  }
  workgroupBarrier();
  if (lane < 7u) {
    let value = atomicLoad(&collectCounts[lane]);
    if (value > 0u) { atomicAdd(&totals[7u + lane], value); }
  }
}
@compute @workgroup_size(64) fn recycle(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x; if (i >= ${count}u) { return; }
  if (p[i].w < 0.0 || p[i].w >= v[i].w) {
    let child = atomicAdd(&totals[1], 1u);
    if (child < min(atomicLoad(&totals[0]), ${count}u)) {
      p[i] = children[child * 2u]; v[i] = children[child * 2u + 1u]; acceleration[i] = vec4<f32>(0.0);
      attr[i * 2u] = vec4<f32>(1.0, 0.6, 0.2, 1.0); attr[i * 2u + 1u].x = 0.03;
      atomicAdd(&totals[14], 1u);
    } else {
      p[i] = seeds[i * 3u]; v[i] = seeds[i * 3u + 1u]; acceleration[i] = seeds[i * 3u + 2u];
      attr[i * 2u] = vec4<f32>(1.0, 0.75, 0.3, 1.0); attr[i * 2u + 1u].x = 0.03;
    }
    attr[i * 2u + 1u].z = 0.0;
    for (var k = 0u; k < ${depth}u; k++) { trail[i * ${depth}u + k] = vec4<f32>(p[i].xyz, -1.0); }
  }
}
@compute @workgroup_size(64) fn reduce(@builtin(global_invocation_id) id: vec3<u32>, @builtin(local_invocation_index) lane: u32) {
  if (lane < 8u) { atomicStore(&reduceCounts[lane], 0u); }
  workgroupBarrier();
  let i = id.x;
  if (i < ${count}u && p[i].w >= 0.0) {
    atomicAdd(&reduceCounts[0], 1u);
    // The sprite draw submits one instance for every configured particle. The
    // live reduction is therefore also the submitted-live count. The remaining
    // exact diagnostics reduce within each workgroup before their global merge.
    let fade = select(1.0, softFade(p[i].xyz, view.fade), (u32(view.camera.w) & 2u) != 0u);
    if (!visible(p[i].xyz, view.aspect)) { atomicAdd(&reduceCounts[1], 1u); }
    if (fade <= 0.0) { atomicAdd(&reduceCounts[2], 1u); }
    if (attr[i * 2u].a * fade < (1.0 / 255.0)) { atomicAdd(&reduceCounts[3], 1u); }
    if (attr[i * 2u + 1u].x <= 0.0) { atomicAdd(&reduceCounts[4], 1u); }
    if (fade < 1.0) { atomicAdd(&reduceCounts[5], 1u); }
    if (i % 4u == 0u && (u32(view.camera.w) & 1u) != 0u) {
      var segments = 0u;
      for (var k = 0u; k < ${depth - 1}u; k++) {
        let a = trail[i * ${depth}u + k]; let b = trail[i * ${depth}u + k + 1u];
        if (a.w >= 0.0 && b.w >= 0.0 && p[i].w - b.w <= view.trailLife && distance(a.xyz, b.xyz) > 0.00001) { segments++; }
      }
      if (segments > 0u) { atomicAdd(&reduceCounts[6], 1u); atomicAdd(&reduceCounts[7], segments * 6u); }
    }
  }
  workgroupBarrier();
  if (lane < 8u) {
    let value = atomicLoad(&reduceCounts[lane]);
    if (value > 0u) { atomicAdd(&totals[reduceTotalSlots[lane]], value); }
  }
}
`;
}

export function residentDrawShader(_count: number, depth: number, lighting?: GPUParticleEffectsInput["lighting"]): string {
  const ambient = lighting?.ambient ?? [1, 1, 1];
  const key = lighting?.keyDirection ?? { x: 0, y: 1, z: 0 };
  const number = (v: number) => Number.isInteger(v) ? `${v}.0` : `${v}`;
  return `${projection}
@group(0) @binding(0) var<storage, read> p: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> attr: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> trail: array<vec4<f32>>;
@group(0) @binding(3) var<uniform> view: View;
@group(0) @binding(4) var<storage, read> velocities: array<vec4<f32>>;
fn particleColor(i: u32) -> vec4<f32> {
  var color = attr[i * 2u];
  if ((u32(view.camera.w) & 4u) == 0u && attr[i * 2u + 1u].z > 0.5) {
    let speed = length(velocities[i].xyz);
    let normal = select(vec3<f32>(0,1,0), velocities[i].xyz / max(speed, 0.0001), speed > 0.0001);
    let key = normalize(vec3<f32>(${number(key.x)}, ${number(key.y)}, ${number(key.z)}));
    let factor = vec3<f32>(${ambient.map(number).join(",")}) + ${number(lighting?.diffuseStrength ?? 0)} * max(dot(normal, key), 0.0);
    color = vec4<f32>(color.rgb / max(factor, vec3<f32>(0.00001)), color.a);
  }
  return color;
}
struct Out { @builtin(position) position: vec4<f32>, @location(0) color: vec4<f32>, @location(1) world: vec3<f32> };
fn corner(vertex: u32) -> vec2<f32> {
  var corners = array<vec2<f32>, 6>(vec2<f32>(-1,-1),vec2<f32>(1,-1),vec2<f32>(1,1),vec2<f32>(-1,-1),vec2<f32>(1,1),vec2<f32>(-1,1));
  return corners[vertex % 6u];
}
@vertex fn sprite(@builtin(vertex_index) vertex: u32, @builtin(instance_index) i: u32) -> Out {
  let c = corner(vertex); let size = attr[i * 2u + 1u].x * 0.5;
  let world = p[i].xyz + vec3<f32>(c.x, c.y * ${-cameraForwardZ}, c.y * ${cameraForwardY}) * size;
  var out: Out; out.position = project(world, view.aspect); out.world = world; out.color = particleColor(i);
  if (p[i].w < 0.0) { out.position = vec4<f32>(2,2,2,1); out.color.a = 0.0; }
  return out;
}
@vertex fn ribbon(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> Out {
  let i = instance * 4u; let segment = vertex / 6u; let c = corner(vertex);
  let a = trail[i * ${depth}u + segment]; let b = trail[i * ${depth}u + segment + 1u];
  let forward = b.xyz - a.xyz;
  let sideRaw = cross(forward, ${cameraPositionWGSL} - a.xyz);
  let side = sideRaw / max(length(sideRaw), 0.00001);
  let endpoint = select(a.xyz, b.xyz, c.y > 0.0);
  let world = endpoint + side * c.x * attr[i * 2u + 1u].x * 0.3;
  var out: Out; out.position = project(world, view.aspect); out.world = world;
  out.color = particleColor(i); out.color.a *= 0.45 * (1.0 - f32(segment) / ${depth}.0);
  if (a.w < 0.0 || b.w < 0.0 || p[i].w - b.w > view.trailLife || length(forward) <= 0.00001) { out.position = vec4<f32>(2,2,2,1); out.color.a = 0.0; }
  return out;
}
@fragment fn fragment(input: Out) -> @location(0) vec4<f32> {
  let linear = max(input.color.rgb, vec3<f32>(0.0));
  let srgb = select(linear * 12.92, 1.055 * pow(linear, vec3<f32>(1.0 / 2.4)) - 0.055, linear > vec3<f32>(0.0031308));
  return vec4<f32>(srgb, input.color.a * select(1.0, softFade(input.world, view.fade), (u32(view.camera.w) & 2u) != 0u));
}
`;
}
