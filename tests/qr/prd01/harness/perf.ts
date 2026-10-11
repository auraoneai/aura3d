/**
 * `perf` harness tools (PRD-01 §16.3 perf job, rows 01-S13 + 01-S7).
 *
 * Renderer-level on a real WebGL2 canvas: the createAuraApp lane scenes do
 * not publish `__QR_READY__` yet (01-HANG), so the `prd01-draw-throughput`
 * content (50x40 unique-material boxes + 10,000 instanced boxes, per
 * `benchmarks/quality-rebuild/scenes/prd01/scenes.ts`) is built directly as a
 * `RenderSource` and submitted through `Renderer.render`.
 *
 *   tools=perf-throughput   600 measured frames, flags core vs none
 *   tools=perf-orbit        60 s scripted orbit after ready, compile count
 *   tools=perf-instancing   10k instances = 1 draw; VAO eviction at 1,000 buffers
 *   tools=parallel-compile  KHR_parallel_shader_compile pending → ready
 */

import { Geometry, PBRMaterial, Renderer, RenderPipeline, UnlitMaterial, type RenderSource } from "../../../../packages/rendering/src";
import type { RenderItem } from "../../../../packages/rendering/src/ForwardPass";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { WebGL2Device } from "../../../../packages/rendering/src/WebGL2Device";
import { VertexFormat } from "../../../../packages/rendering/src/VertexFormat";
import type { RenderBuffer } from "../../../../packages/rendering/src/RenderDevice";

const WIDTH = 960;
const HEIGHT = 540;
const MEASURED_FRAMES = 600;

type FlagArm = "core" | "none";

const flagsFor = (arm: FlagArm) => resolveQrFlags({ env: arm === "core" ? { A3D_QR_CORE: "v2" } : {} });

function perspective(fovYDeg: number, aspect: number, near: number, far: number): number[] {
  const f = 1 / Math.tan((fovYDeg * Math.PI) / 360);
  const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}

function lookAt(eye: readonly number[], target: readonly number[]): number[] {
  const sub = (a: readonly number[], b: readonly number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
  const norm = (v: number[]) => { const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1; return v.map((x) => x / l); };
  const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
  const dot = (a: number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const z = norm(sub(eye, target));
  const x = norm(cross([0, 1, 0], z));
  const y = cross(z, x);
  return [x[0]!, y[0]!, z[0]!, 0, x[1]!, y[1]!, z[1]!, 0, x[2]!, y[2]!, z[2]!, 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}

function multiply(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) for (let k = 0; k < 4; k += 1) out[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
  return out;
}

function camera(angle: number) {
  const eye = [Math.sin(angle) * 13.5, 9.5, Math.cos(angle) * 13.5];
  const view = lookAt(eye, [0, 0.4, 0]);
  const projection = perspective(46, WIDTH / HEIGHT, 0.1, 200);
  return { viewMatrix: view, projectionMatrix: projection, viewProjectionMatrix: multiply(projection, view) };
}

function translation(x: number, y: number, z: number, s: number): number[] {
  return [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, x, y, z, 1];
}

/** `prd01-draw-throughput` content: 2,000 unique-material boxes + one 10,000-instance box item. */
export function throughputItems(): RenderItem[] {
  const items: RenderItem[] = [];
  const box = Geometry.box();
  for (let row = 0; row < 40; row += 1) {
    for (let col = 0; col < 50; col += 1) {
      const material = new PBRMaterial({ name: `tp-${row}-${col}`, baseColor: [col / 50, row / 40, 0.5, 1], roughness: 0.3 + (col % 7) / 10 });
      items.push({ geometry: box, material, modelMatrix: translation((col - 24.5) * 0.24, 0.12, (row - 19.5) * 0.24 + 2, 0.18), label: `tp-${row}-${col}` });
    }
  }
  items.push(instancedItem(10_000));
  return items;
}

export function instancedItem(count: number): RenderItem {
  const transforms = new Float32Array(count * 16);
  for (let i = 0; i < count; i += 1) {
    const m = translation(((i % 100) - 49.5) * 0.062, -0.4, (Math.floor(i / 100) - 49.5) * 0.062 - 4, 0.05);
    transforms.set(m, i * 16);
  }
  return { geometry: Geometry.box(), material: new UnlitMaterial({ name: "tp-instanced" }), instanceTransforms: transforms, label: "tp-instanced-10k" };
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function createRenderer(stage: HTMLElement, arm: FlagArm): Promise<Renderer> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  stage.appendChild(canvas);
  const renderer = await Renderer.create({ backend: "webgl2", canvas, width: WIDTH, height: HEIGHT });
  setRendererQrFlags(flagsFor(arm), renderer.device);
  return renderer;
}

/** Render until no parallel compile is pending and a frame issues no compile (the renderer-level "ready"). */
async function warm(renderer: Renderer, source: RenderSource): Promise<number> {
  const device = renderer.device as WebGL2Device;
  let frames = 0;
  for (; frames < 240; frames += 1) {
    const before = device.counters().programCompiles;
    renderer.render(source, camera(0));
    await nextFrame();
    while ((device.parallelCompilesPending ?? 0) > 0) await nextFrame();
    if (frames >= 1 && device.counters().programCompiles === before) return frames + 1;
  }
  return frames;
}

function heapBytes(): number | null {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? memory.usedJSHeapSize : null;
}

export interface ThroughputArm {
  readonly arm: FlagArm;
  readonly warmFrames: number;
  readonly measuredFrames: number;
  readonly pipelineConstructionsAfterWarm: number;
  readonly programCompilesAfterWarm: number;
  readonly bufferDelta: number;
  readonly renderTargetDelta: number;
  readonly heapBytesPerFrame: number | null;
  readonly cpuSubmitMsMedian: number;
  readonly cpuSubmitMsP95: number;
  readonly drawCallsPerFrame: number;
}

async function throughputArm(stage: HTMLElement, arm: FlagArm): Promise<ThroughputArm> {
  const renderer = await createRenderer(stage, arm);
  try {
    const source: RenderSource = { renderItems: throughputItems() };
    const warmFrames = await warm(renderer, source);
    const device = renderer.device as WebGL2Device;
    const start = device.counters();
    const startDiag = device.getDiagnostics();
    const pipelinesBefore = RenderPipeline.constructedCount;
    const times: number[] = [];
    let drawCalls = 0;
    const cam = camera(0);
    renderer.render(source, cam); // one unmeasured frame so the heap baseline excludes warm garbage
    const heapStart = heapBytes();
    for (let frame = 0; frame < MEASURED_FRAMES; frame += 1) {
      const t0 = performance.now();
      const diagnostics = renderer.render(source, cam);
      times.push(performance.now() - t0);
      drawCalls = diagnostics.drawCalls;
    }
    const heapEnd = heapBytes();
    const end = device.counters();
    const endDiag = device.getDiagnostics();
    const sorted = [...times].sort((a, b) => a - b);
    return {
      arm,
      warmFrames,
      measuredFrames: MEASURED_FRAMES,
      pipelineConstructionsAfterWarm: RenderPipeline.constructedCount - pipelinesBefore,
      programCompilesAfterWarm: end.programCompiles - start.programCompiles,
      bufferDelta: endDiag.buffers - startDiag.buffers,
      renderTargetDelta: (endDiag.renderTargets ?? 0) - (startDiag.renderTargets ?? 0),
      heapBytesPerFrame: heapStart !== null && heapEnd !== null ? (heapEnd - heapStart) / MEASURED_FRAMES : null,
      cpuSubmitMsMedian: sorted[Math.floor(sorted.length / 2)]!,
      cpuSubmitMsP95: sorted[Math.floor(sorted.length * 0.95)]!,
      drawCallsPerFrame: drawCalls
    };
  } finally {
    renderer.dispose();
  }
}

export async function runThroughputTool(stage: HTMLElement): Promise<{ arms: ThroughputArm[]; cpuSubmitRatio: number; errors: string[] }> {
  const none = await throughputArm(stage, "none");
  const core = await throughputArm(stage, "core");
  return { arms: [core, none], cpuSubmitRatio: core.cpuSubmitMsMedian / none.cpuSubmitMsMedian, errors: [] };
}

export async function runOrbitTool(stage: HTMLElement, seconds: number): Promise<{ frames: number; seconds: number; programCompilesAfterReady: number; pipelineConstructionsAfterReady: number; errors: string[] }> {
  const renderer = await createRenderer(stage, "core");
  try {
    const source: RenderSource = { renderItems: throughputItems() };
    await warm(renderer, source);
    const device = renderer.device as WebGL2Device;
    const compilesBefore = device.counters().programCompiles;
    const pipelinesBefore = RenderPipeline.constructedCount;
    const t0 = performance.now();
    let frames = 0;
    while (performance.now() - t0 < seconds * 1000) {
      const angle = ((performance.now() - t0) / (seconds * 1000)) * Math.PI * 2;
      renderer.render(source, camera(angle));
      frames += 1;
      await nextFrame();
    }
    return {
      frames,
      seconds: (performance.now() - t0) / 1000,
      programCompilesAfterReady: device.counters().programCompiles - compilesBefore,
      pipelineConstructionsAfterReady: RenderPipeline.constructedCount - pipelinesBefore,
      errors: []
    };
  } finally {
    renderer.dispose();
  }
}

const EVICT_MARKER = "a3d-prd01-perf-evict";
const EVICT_VS = `#version 300 es
// ${EVICT_MARKER}
in vec3 a_position;
in vec4 a_instanceOffset;
void main() { gl_Position = vec4(a_position * 0.01 + a_instanceOffset.xyz, 1.0); }
`;
const EVICT_FS = `#version 300 es
// ${EVICT_MARKER}
precision highp float;
out vec4 color;
void main() { color = vec4(1.0); }
`;

export async function runInstancingTool(stage: HTMLElement): Promise<{
  instancedDraws: number; instanceCount: number; bufferDeltaFrame2: number;
  vaoBaseline: number; vaoPeak: number; vaoAfterDispose: number; evictedBuffers: number; errors: string[];
}> {
  const errors: string[] = [];
  const renderer = await createRenderer(stage, "core");
  try {
    const device = renderer.device as WebGL2Device;
    const empty: RenderSource = { renderItems: [] };
    const source: RenderSource = { renderItems: [instancedItem(10_000)] };
    await warm(renderer, source);
    const baselineDraws = renderer.render(empty, camera(0)).drawCalls;
    const buffersBefore = device.getDiagnostics().buffers;
    const drawCalls = renderer.render(source, camera(0)).drawCalls;
    const bufferDeltaFrame2 = device.getDiagnostics().buffers - buffersBefore;

    // VAO eviction (§6.1): 1,000 instance buffers, each keys one cached VAO;
    // disposing them must return `liveVertexArrays` to the baseline.
    const shader = device.createShaderProgram({ label: "perf-evict", marker: EVICT_MARKER, vertex: EVICT_VS, fragment: EVICT_FS });
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const vertexBuffer = device.createBuffer("vertex", positions.byteLength, positions);
    const instanceData = new Float32Array([0, 0, 0, 0, 0.1, 0, 0, 0]);
    const vaoBaseline = device.counters().liveVertexArrays;
    const instanceBuffers: RenderBuffer[] = [];
    device.beginFrame(WIDTH, HEIGHT);
    for (let i = 0; i < 1_000; i += 1) {
      const buffer = device.createBuffer("vertex", instanceData.byteLength, instanceData);
      instanceBuffers.push(buffer);
      device.draw({
        label: `evict-${i}`, topology: "triangles", vertexBuffer, vertexFormat: VertexFormat.P3,
        vertexCount: 3, instanceCount: 2, shader,
        instanceAttributes: [{ buffer, shaderName: "a_instanceOffset", components: 4, offset: 0, stride: 16, divisor: 1 }]
      });
    }
    device.endFrame();
    const vaoPeak = device.counters().liveVertexArrays;
    for (const buffer of instanceBuffers) buffer.dispose();
    const vaoAfterDispose = device.counters().liveVertexArrays;
    vertexBuffer.dispose();
    shader.dispose();
    return {
      instancedDraws: drawCalls - baselineDraws, instanceCount: 10_000, bufferDeltaFrame2,
      vaoBaseline, vaoPeak, vaoAfterDispose, evictedBuffers: instanceBuffers.length, errors
    };
  } finally {
    renderer.dispose();
  }
}
