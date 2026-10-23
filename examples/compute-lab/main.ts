import { camera, compute, createAuraApp, lights, primitives, scene } from "@aura3d/engine";
import { ComputeError, createComputeContext } from "@aura3d/rendering";

/**
 * threejs-parity SH-04: the public WebGPU-only `compute.*` surface run on a REAL
 * GPUDevice (no canvas is ever configured or presented, so the R-22 runner
 * limitation does not apply). Every check records measured values so the browser
 * spec can assert on exact GPU read-back, not just "did not throw".
 */

interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: Record<string, unknown>;
  readonly error?: string;
}

interface LabState {
  status: "loading" | "ready" | "error";
  adapter: Record<string, unknown>;
  results: CheckResult[];
  error?: string;
}

declare global {
  interface Window {
    __AURA_COMPUTE_LAB__?: LabState;
  }
}

const statusEl = document.querySelector("#status")!;
const resultsEl = document.querySelector("#results")!;
const state: LabState = { status: "loading", adapter: {}, results: [] };
window.__AURA_COMPUTE_LAB__ = state;

const record = (name: string, ok: boolean, detail: Record<string, unknown> = {}, error?: unknown): void => {
  state.results.push({ name, ok, detail, ...(error === undefined ? {} : { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }) });
  resultsEl.textContent = state.results.map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.name} ${JSON.stringify(r.detail)}${r.error ? ` :: ${r.error}` : ""}`).join("\n");
};

const check = async (name: string, run: () => Promise<Record<string, unknown>> | Record<string, unknown>): Promise<void> => {
  try {
    record(name, true, await run());
  } catch (error) {
    record(name, false, {}, error);
  }
};

const VECTOR_ADD_WGSL = `@group(0) @binding(0) var<storage, read> a: array<f32>;
@group(0) @binding(1) var<storage, read> b: array<f32>;
@group(0) @binding(2) var<storage, read_write> out: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i < arrayLength(&out)) {
    out[i] = a[i] + b[i];
  }
}`;

const REDUCE_WGSL = `var<workgroup> scratch: array<u32, 256>;
@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var<storage, read_write> partial: array<u32>;
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) li: u32, @builtin(workgroup_id) wg: vec3<u32>, @builtin(global_invocation_id) gid: vec3<u32>) {
  scratch[li] = input[gid.x];
  workgroupBarrier();
  var stride = 128u;
  loop {
    if (stride == 0u) { break; }
    if (li < stride) { scratch[li] = scratch[li] + scratch[li + stride]; }
    workgroupBarrier();
    stride = stride >> 1u;
  }
  if (li == 0u) { partial[wg.x] = scratch[0]; }
}`;

const GRID_2D_WGSL = `struct Dims { w: u32, h: u32 }
@group(0) @binding(0) var<uniform> dims: Dims;
@group(0) @binding(1) var<storage, read_write> out: array<u32>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x < dims.w && gid.y < dims.h) {
    out[gid.y * dims.w + gid.x] = gid.x + gid.y * 1000u;
  }
}`;

const GRID_3D_WGSL = `@group(0) @binding(0) var<storage, read_write> out: array<u32>;
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  out[(gid.z * 16u + gid.y) * 16u + gid.x] = gid.x | (gid.y << 8u) | (gid.z << 16u);
}`;

const run = async (): Promise<void> => {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<any> } }).gpu;
  if (!gpu) throw new Error("navigator.gpu is missing");
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error("no WebGPU adapter");
  const device = await adapter.requestDevice();
  let lost: string | null = null;
  void device.lost.then((info: { reason: string; message: string }) => { lost = `${info.reason}: ${info.message}`; });
  state.adapter = {
    isFallbackAdapter: adapter.isFallbackAdapter ?? null,
    maxComputeInvocationsPerWorkgroup: device.limits.maxComputeInvocationsPerWorkgroup,
    maxComputeWorkgroupSizeX: device.limits.maxComputeWorkgroupSizeX,
    maxComputeWorkgroupsPerDimension: device.limits.maxComputeWorkgroupsPerDimension,
    maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize
  };

  const context = createComputeContext(device);

  await check("1 vector add N=65536 exact", async () => {
    const N = 1 << 16;
    const a = new Float32Array(N);
    const b = new Float32Array(N);
    for (let i = 0; i < N; i += 1) { a[i] = i; b[i] = 2 * i + 1; }
    const A = context.createBuffer({ data: a, label: "a" });
    const B = context.createBuffer({ data: b, label: "b" });
    const OUT = context.createBuffer({ size: N * 4, label: "out" });
    const pipeline = context.createPipeline({ wgsl: VECTOR_ADD_WGSL, bindings: [{ binding: 0, type: "read-only-storage" }, { binding: 1, type: "read-only-storage" }, { binding: 2, type: "storage" }] });
    const dispatched = context.dispatch({ pipeline, bindings: [{ binding: 0, buffer: A }, { binding: 1, buffer: B }, { binding: 2, buffer: OUT }], items: [N] });
    await context.onIdle();
    const result = new Float32Array(await OUT.read());
    let mismatches = 0;
    for (let i = 0; i < N; i += 1) if (result[i] !== a[i]! + b[i]!) mismatches += 1;
    if (mismatches > 0) throw new Error(`${mismatches} of ${N} elements differ from the JS result`);
    return { n: N, workgroups: dispatched.workgroups, invocations: dispatched.invocations, first: [result[0], result[1], result[2]], last: result[N - 1] };
  });

  await check("2 workgroup shared-memory reduction", async () => {
    const N = 1 << 14;
    const groups = N / 256;
    const input = new Uint32Array(N);
    for (let i = 0; i < N; i += 1) input[i] = i % 17;
    const IN = context.createBuffer({ data: input });
    const PARTIAL = context.createBuffer({ size: groups * 4 });
    const pipeline = context.createPipeline({ wgsl: REDUCE_WGSL, bindings: [{ binding: 0, type: "read-only-storage" }, { binding: 1, type: "storage" }] });
    context.dispatch({ pipeline, bindings: [{ binding: 0, buffer: IN }, { binding: 1, buffer: PARTIAL }], workgroups: [groups] });
    const partial = new Uint32Array(await PARTIAL.read());
    let bad = 0;
    for (let g = 0; g < groups; g += 1) {
      let expected = 0;
      for (let k = 0; k < 256; k += 1) expected += input[g * 256 + k]!;
      if (partial[g] !== expected) bad += 1;
    }
    if (bad > 0) throw new Error(`${bad} of ${groups} workgroup sums differ from the JS result`);
    let total = 0;
    for (const v of partial) total += v;
    return { groups, total, expectedTotal: input.reduce((s, v) => s + v, 0) };
  });

  await check("3a 2D dispatch writes indices (items mode)", async () => {
    const W = 64;
    const H = 64;
    const DIMS = context.createBuffer({ data: new Uint32Array([W, H, 0, 0]), usage: "uniform" });
    const OUT = context.createBuffer({ size: W * H * 4 });
    const pipeline = context.createPipeline({ wgsl: GRID_2D_WGSL, bindings: [{ binding: 0, type: "uniform" }, { binding: 1, type: "storage" }] });
    const dispatched = context.dispatch({ pipeline, bindings: [{ binding: 0, buffer: DIMS }, { binding: 1, buffer: OUT }], items: [W, H] });
    const out = new Uint32Array(await OUT.read());
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      if (out[y * W + x] !== x + y * 1000) throw new Error(`2D cell (${x},${y}) = ${out[y * W + x]}, expected ${x + y * 1000}`);
    }
    return { workgroups: dispatched.workgroups, cells: W * H };
  });

  await check("3b 3D dispatch writes indices", async () => {
    const OUT = context.createBuffer({ size: 16 * 16 * 16 * 4 });
    const pipeline = context.createPipeline({ wgsl: GRID_3D_WGSL, bindings: [{ binding: 0, type: "storage" }] });
    const dispatched = context.dispatch({ pipeline, bindings: [{ binding: 0, buffer: OUT }], workgroups: [4, 4, 4] });
    const out = new Uint32Array(await OUT.read());
    for (let z = 0; z < 16; z += 1) for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
      const expected = x | (y << 8) | (z << 16);
      if (out[(z * 16 + y) * 16 + x] !== expected) throw new Error(`3D cell (${x},${y},${z}) = ${out[(z * 16 + y) * 16 + x]}, expected ${expected}`);
    }
    return { workgroups: dispatched.workgroups, cells: 16 * 16 * 16 };
  });

  await check("3c write() updates a buffer between dispatches", async () => {
    const N = 1024;
    const A = context.createBuffer({ data: new Float32Array(N).fill(1) });
    const B = context.createBuffer({ data: new Float32Array(N).fill(2) });
    const OUT = context.createBuffer({ size: N * 4 });
    const pipeline = context.createPipeline({ wgsl: VECTOR_ADD_WGSL, bindings: [{ binding: 0, type: "read-only-storage" }, { binding: 1, type: "read-only-storage" }, { binding: 2, type: "storage" }] });
    const bindings = [{ binding: 0, buffer: A }, { binding: 1, buffer: B }, { binding: 2, buffer: OUT }];
    context.dispatch({ pipeline, bindings, items: [N] });
    const first = new Float32Array(await OUT.read())[0]!;
    B.write(new Float32Array(N).fill(40));
    context.dispatch({ pipeline, bindings, items: [N] });
    const second = new Float32Array(await OUT.read())[N - 1]!;
    if (first !== 3 || second !== 41) throw new Error(`expected 3 then 41, got ${first} then ${second}`);
    return { first, second };
  });

  await check("4 dispose idempotence", async () => {
    const own = createComputeContext(device);
    const buffer = own.createBuffer({ size: 64 });
    const pipeline = own.createPipeline({ wgsl: GRID_3D_WGSL, bindings: [{ binding: 0, type: "storage" }] });
    own.dispose();
    own.dispose();
    buffer.dispose();
    buffer.dispose();
    pipeline.dispose();
    const codes: string[] = [];
    for (const action of [
      () => own.createBuffer({ size: 4 }),
      () => own.dispatch({ pipeline, bindings: [{ binding: 0, buffer }], workgroups: [1] }),
      () => buffer.write(new Uint32Array(1))
    ]) {
      try { action(); codes.push("no-throw"); } catch (error) { codes.push(error instanceof ComputeError ? error.code : String(error)); }
    }
    try { await buffer.read(); codes.push("no-throw"); } catch (error) { codes.push(error instanceof ComputeError ? error.code : String(error)); }
    if (!codes.every((code) => code === "compute-disposed")) throw new Error(`expected compute-disposed everywhere, got ${codes.join(", ")}`);
    return { codes };
  });

  await check("4b validation errors surface as named ComputeError", async () => {
    const codes: string[] = [];
    for (const action of [
      () => context.createPipeline({ wgsl: "#version 300 es\nvoid main(){}" }),
      () => context.createPipeline({ wgsl: GRID_3D_WGSL, entryPoint: "nope" }),
      () => context.createBuffer({ size: 0 })
    ]) {
      try { action(); codes.push("no-throw"); } catch (error) { codes.push(error instanceof ComputeError ? error.code : String(error)); }
    }
    return { codes };
  });

  await check("5a engine surface: compute.bind(realDevice) vector add", async () => {
    compute.bind(device);
    const N = 4096;
    const a = new Float32Array(N).map((_, i) => i);
    const b = new Float32Array(N).map((_, i) => i * 3);
    const A = compute.buffer({ data: a });
    const B = compute.buffer({ data: b });
    const OUT = compute.buffer({ size: N * 4 });
    const pipeline = compute.pipeline({ wgsl: VECTOR_ADD_WGSL, bindings: [{ binding: 0, type: "read-only-storage" }, { binding: 1, type: "read-only-storage" }, { binding: 2, type: "storage" }] });
    compute.dispatch({ pipeline, bindings: [{ binding: 0, buffer: A }, { binding: 1, buffer: B }, { binding: 2, buffer: OUT }], items: [N] });
    await compute.idle();
    const out = new Float32Array(await OUT.read());
    for (let i = 0; i < N; i += 1) if (out[i] !== a[i]! + b[i]!) throw new Error(`element ${i}: ${out[i]} != ${a[i]! + b[i]!}`);
    const available = compute.available;
    compute.dispose();
    return { n: N, availableWhileBound: available, availableAfterDispose: compute.available };
  });

  await check("5b createAuraApp (WebGL2) rejects with compute-requires-webgpu", async () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
    const app = createAuraApp(canvas, {
      autoStart: false,
      resize: false,
      pixelRatio: 1,
      renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
      // A scene with renderable content is what makes createAuraApp mount the production WebGL2 renderer
      // (an empty scene stays on the diagnostic 2D path).
      scene: scene()
        .background("#080a18")
        .camera(camera.perspective({ position: [0, 1, 4], target: [0, 0, 0], fov: 46 }))
        .add(lights.directional({ name: "key", position: [3, 5, 4], intensity: 1.2 }))
        .add(primitives.box({ name: "probe-box" }))
    });
    await app.ready();
    const detail: Record<string, unknown> = { backend: app.backend, available: app.compute.available };
    let thrown: unknown;
    try { app.compute.pipeline({ wgsl: VECTOR_ADD_WGSL }); } catch (error) { thrown = error; }
    detail.code = (thrown as { code?: string } | undefined)?.code ?? null;
    detail.mentionsBackend = typeof (thrown as Error | undefined)?.message === "string" && (thrown as Error).message.includes(`"${app.backend}"`);
    app.compute.dispose();
    if (detail.code !== "compute-requires-webgpu") throw new Error(`expected compute-requires-webgpu, got ${String(detail.code)}`);
    return detail;
  });

  context.dispose();
  record("device stayed alive", lost === null, { lost });
};

run()
  .then(() => {
    state.status = "ready";
    statusEl.textContent = `done: ${state.results.filter((r) => r.ok).length}/${state.results.length} passed`;
  })
  .catch((error: unknown) => {
    state.status = "error";
    state.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    statusEl.textContent = state.error;
  });
