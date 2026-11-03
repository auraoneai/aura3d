import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { shaderGraph } from "../../../packages/engine/src/agent-api/nodes/shaderGraph";
import { DepthPass } from "../../../packages/rendering/src/DepthPass";
import { negotiateDepthConvention } from "../../../packages/rendering/src/DepthConvention";
import { ForwardPass } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import { MockRenderDevice, type DrawCommand, type RenderBuffer } from "../../../packages/rendering/src/RenderDevice";
import { globalShaderSource } from "../../../packages/rendering/src/ShaderLibraryCore";
import { Texture } from "../../../packages/rendering/src/Texture";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { WebGL2DrawCallBinder } from "../../../packages/rendering/src/webgl2/MultiDraw";
import type { ShaderGraphDocument } from "../../../packages/rendering/src/program/ShaderGraphCompiler";
import { setRendererQrFlags, withRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { PRD02_DEPTH_MAX_INSTANCES } from "../../../packages/rendering/src/shadows/Prd02DepthShaderLibrary";

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const graph: ShaderGraphDocument = {
  version: 1, stage: "material",
  resources: [{ name: "offset", kind: "uniform", type: "vec3" }],
  nodes: [
    { id: "position", op: "input", type: "vec3", name: "positionLocal" },
    { id: "camera", op: "input", type: "vec3", name: "cameraPosition" },
    { id: "offset", op: "uniform", type: "vec3", resource: "offset" },
    { id: "placed", op: "add", type: "vec3", inputs: ["position", "offset"] },
    { id: "displaced", op: "add", type: "vec3", inputs: ["placed", "camera"] },
    { id: "color", op: "constant", type: "vec3", value: [1, 1, 1] }
  ],
  outputs: { position: "displaced", color: "color" }
};
const storageGraph: ShaderGraphDocument = {
  version: 1, stage: "material",
  resources: [
    { name: "values", kind: "storage-buffer", type: "vec3", access: "read" },
    { name: "tint", kind: "storage-buffer", type: "vec3", access: "read" }
  ],
  nodes: [
    { id: "index", op: "constant", type: "u32", value: 0 },
    { id: "position", op: "input", type: "vec3", name: "positionLocal" },
    { id: "offset", op: "storageLoad", type: "vec3", resource: "values", inputs: ["index"] },
    { id: "color", op: "storageLoad", type: "vec3", resource: "tint", inputs: ["index"] },
    { id: "displaced", op: "add", type: "vec3", inputs: ["position", "offset"] }
  ],
  outputs: { position: "displaced", color: "color" }
};

function displacedMaterial() {
  return createCustomShaderMaterial(shaderGraph.material({ graph, uniforms: { offset: [1, 2, 3] } }).custom!);
}

describe("checked depth submissions", () => {
  it("requires checked capability even with no casters, before allocating caster resources", () => {
    const geometry = Geometry.triangle();
    const device = new MockRenderDevice();
    try {
      device.beginFrame(8, 8);
      const buffersBefore = device.getDiagnostics().buffers;
      for (const casters of [[], [{ geometry }]]) {
        let failure: unknown;
        try { new DepthPass({ casters, checkedSubmission: true }).execute({ device, width: 8, height: 8 }); } catch (error) { failure = error; }
        expect(failure).toMatchObject({ code: "DEPTH_CHECKED_SUBMISSION_UNAVAILABLE" });
      }
      expect(device.getDiagnostics().buffers).toBe(buffersBefore);
      expect(device.drawCommands).toHaveLength(0);
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });

  it("checks every plain, instanced variant, and expanded graph draw while preserving the default path", () => {
    const geometry = Geometry.triangle();
    const material = displacedMaterial();
    const device = new MockRenderDevice();
    const checkedDevice = device as MockRenderDevice & { drawChecked?: (command: DrawCommand) => void };
    const originalDraw = device.draw.bind(device);
    const submitted: DrawCommand[] = [];
    try {
      device.beginFrame(8, 8);
      checkedDevice.drawChecked = () => { throw new Error("unexpected checked draw"); };
      new DepthPass({ casters: [{ geometry, label: "unchecked" }] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands.map((command) => command.label)).toEqual(["unchecked"]);
      checkedDevice.drawChecked = function (this: MockRenderDevice, command) {
        expect(this).toBe(device);
        submitted.push(command);
        originalDraw(command);
      };
      device.draw = () => { throw new Error("unexpected unchecked draw"); };
      const transforms = new Float32Array([...identity, ...identity]);
      new DepthPass({
        checkedSubmission: true,
        casters: [
          { geometry, label: "plain" },
          { geometry, instanceTransforms: transforms, label: "variant" },
          { geometry, material, instanceTransforms: transforms, label: "graph" }
        ]
      }).execute({ device, width: 8, height: 8 });
      expect(submitted.map((command) => command.label)).toEqual(["plain", "variant:0", "graph:custom-depth:0", "graph:custom-depth:1"]);
      expect(submitted[1]?.instanceCount).toBe(2);
      expect(submitted[2]?.uniforms?.get("u_auraGraph_resource_offset")).toEqual([1, 2, 3]);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it.each(["standard", "graph"] as const)("stops on a rejected %s skin draw and releases its transient palette", (kind) => {
    const vertices = new VertexBuffer(VertexFormat.P3J4W4, 3);
    for (let i = 0; i < 3; i += 1) vertices.setAttribute(i, "weights", [1, 0, 0, 0]);
    const geometry = new Geometry(vertices);
    const material = displacedMaterial();
    const palette = new Float32Array(97 * 16);
    for (let i = 0; i < 97; i += 1) palette.set(identity, i * 16);
    const device = new MockRenderDevice();
    const checkedDevice = device as MockRenderDevice & { drawChecked?: (command: DrawCommand) => void };
    const failure = new Error("checked draw rejected");
    const submitted: string[] = [];
    let binding: { texture: { disposed: boolean } | null } | undefined;
    checkedDevice.drawChecked = (command) => {
      submitted.push(command.label!);
      if (submitted.length === 1) return;
      binding = command.uniforms?.get("u_jointPaletteTexture") as typeof binding;
      expect(command.uniforms?.get("u_jointCount")).toBe(97);
      expect(binding?.texture?.disposed).toBe(false);
      throw failure;
    };
    device.draw = () => { throw new Error("unexpected unchecked draw"); };
    try {
      device.beginFrame(8, 8);
      let caught: unknown;
      try {
        new DepthPass({ checkedSubmission: true, casters: [
          { geometry, label: "first" },
          { geometry, ...(kind === "graph" ? { material } : {}), skinning: { jointCount: 97, matrices: palette }, label: "rejected" },
          { geometry, label: "never-submitted" }
        ] }).execute({ device, width: 8, height: 8 });
      } catch (error) { caught = error; }
      expect(caught).toBe(failure);
      expect(submitted).toEqual(["first", kind === "graph" ? "rejected:custom-depth" : "rejected:0"]);
      expect(binding?.texture?.disposed).toBe(true);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("stops a multi-batch instance submission when a batch is rejected", () => {
    const geometry = Geometry.triangle();
    const device = new MockRenderDevice();
    const checkedDevice = device as MockRenderDevice & { drawChecked?: (command: DrawCommand) => void };
    const count = PRD02_DEPTH_MAX_INSTANCES * 2 + 1;
    const transforms = new Float32Array(count * 16);
    for (let i = 0; i < count; i += 1) transforms.set(identity, i * 16);
    const batches: DrawCommand[] = [];
    const failure = new Error("second batch rejected");
    checkedDevice.drawChecked = (command) => { batches.push(command); if (batches.length === 2) throw failure; };
    device.draw = () => { throw new Error("unexpected unchecked draw"); };
    try {
      device.beginFrame(8, 8);
      let caught: unknown;
      try {
        new DepthPass({ casters: [{ geometry, instanceTransforms: transforms, label: "batch" }], checkedSubmission: true })
          .execute({ device, width: 8, height: 8 });
      } catch (error) { caught = error; }
      expect(caught).toBe(failure);
      expect(batches.map((batch) => batch.label)).toEqual(["batch:0", "batch:1"]);
      expect(batches.map((batch) => batch.instanceCount)).toEqual([PRD02_DEPTH_MAX_INSTANCES, PRD02_DEPTH_MAX_INSTANCES]);
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });

  it("releases transient morphed geometry on failure and permits a retry", () => {
    const geometry = Geometry.triangle();
    const device = new MockRenderDevice();
    setRendererQrFlags(resolveQrFlags({ options: { A3D_QR_ANIMATION: false } }), device);
    const checkedDevice = device as MockRenderDevice & { drawChecked?: (command: DrawCommand) => void };
    const draw = device.draw.bind(device);
    const sourcePosition = geometry.vertexBuffer.getAttribute(0, "position");
    const caster = { geometry, morphTargets: [{ positions: [[2, 0, 0], [0, 0, 0], [0, 0, 0]] as [number, number, number][] }], morphWeights: [0.5] };
    let scratch: RenderBuffer | undefined;
    const failure = new Error("morphed draw rejected");
    try {
      device.beginFrame(8, 8);
      checkedDevice.drawChecked = (command) => { scratch = command.vertexBuffer; throw failure; };
      let caught: unknown;
      try {
        withRendererQrFlags(device, () => new DepthPass({ casters: [caster], checkedSubmission: true }).execute({ device, width: 8, height: 8 }));
      } catch (error) { caught = error; }
      expect(caught).toBe(failure);
      expect(scratch?.disposed).toBe(true);
      expect(geometry.vertexBuffer.getAttribute(0, "position")).toEqual(sourcePosition);
      checkedDevice.drawChecked = (command) => { scratch = command.vertexBuffer; draw(command); };
      withRendererQrFlags(device, () => new DepthPass({ casters: [caster], checkedSubmission: true }).execute({ device, width: 8, height: 8 }));
      expect(device.drawCommands).toHaveLength(1);
      expect(scratch?.disposed).toBe(true);
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });
});

describe("custom graph depth submissions", () => {
  it("invalidates a prepared graph depth plan if borrowed storage is replaced or disposed", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "kind", { value: "webgpu" });
    const values = device.createBuffer("storage", 16);
    const replacement = device.createBuffer("storage", 16);
    const tint = device.createBuffer("storage", 16);
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: storageGraph, backend: "wgsl",
      storage: { values: { kind: "storage-buffer", buffer: values }, tint: { kind: "storage-buffer", buffer: tint } } }).custom!);
    const binding = material.graphStorageBindings("depth")[0]!;
    if (binding.kind !== "storage-buffer") throw new Error("Expected graph storage buffer");
    const writable = binding as { buffer: typeof values };
    const geometry = Geometry.triangle();
    const pass = new DepthPass({ casters: [{ geometry, material }] });
    const context = { device, width: 8, height: 8 };
    try {
      device.beginFrame(8, 8);
      const replaced = pass.prepare(context);
      writable.buffer = replacement;
      expect(() => pass.validatePrepared(context, replaced)).toThrow(/stale/);
      writable.buffer = values;
      const disposed = pass.prepare(context);
      values.dispose();
      expect(() => pass.validatePrepared(context, disposed)).toThrow(/stale/);
      expect(device.drawCommands).toHaveLength(0);
      expect(replacement.disposed).toBe(false);
      expect(tint.disposed).toBe(false);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); values.dispose(); replacement.dispose(); tint.dispose(); device.dispose(); }
  });

  it("routes the real graph's displacement resources to depth and excludes fragment-only storage", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "kind", { value: "webgpu" });
    const values = device.createBuffer("storage", 16);
    const tint = device.createBuffer("storage", 16);
    const storage = { values: { kind: "storage-buffer" as const, buffer: values }, tint: { kind: "storage-buffer" as const, buffer: tint } };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: storageGraph, backend: "wgsl", storage }).custom!);
    const geometry = Geometry.triangle();
    try {
      device.beginFrame(8, 8);
      const item = { geometry, material };
      new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 });
      new DepthPass({ casters: [item] }).execute({ device, width: 8, height: 8 });
      const [forward, depth] = device.drawCommands;
      expect(forward?.nativeStorageBindings?.map((binding) => binding.kind === "storage-buffer" ? binding.buffer : null)).toEqual([values, tint]);
      expect(depth?.nativeStorageBindings?.map((binding) => binding.kind === "storage-buffer" ? binding.buffer : null)).toEqual([values]);
      expect(globalShaderSource(material.customDepthShaderKey!)?.webgpu?.storageBindings).toEqual([
        expect.objectContaining({ group: 1, binding: 0, kind: "storage-buffer", access: "read", visibility: "vertex" })
      ]);
      const fragmentOnly = createCustomShaderMaterial(shaderGraph.material({
        graph: { ...storageGraph, outputs: { color: "color" } }, backend: "wgsl", storage
      }).custom!);
      try {
        new DepthPass({ casters: [{ geometry, material: fragmentOnly }] }).execute({ device, width: 8, height: 8 });
        expect(device.drawCommands[2]?.nativeStorageBindings).toBeUndefined();
      } finally { fragmentOnly.dispose(); }
      expect(values.disposed).toBe(false);
      expect(tint.disposed).toBe(false);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); values.dispose(); tint.dispose(); device.dispose(); }
  });

  it("binds the real graph's stage-specific storage through a native-shaped WebGPU device", async () => {
    type Layout = { readonly entries: readonly Record<string, unknown>[] };
    type Group = { readonly label?: string; readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] };
    const layouts: Layout[] = [];
    const groups: Group[] = [];
    const modules: string[] = [];
    const boundGroups: number[] = [];
    let draws = 0;
    const native = {
      queue: { writeBuffer() {}, writeTexture() {}, submit() {}, onSubmittedWorkDone: async () => {} },
      createBuffer: ({ size, usage }: { size: number; usage: number }) => ({ size, usage, destroy() {} }),
      createTexture: () => ({ createView: (descriptor?: unknown) => ({ descriptor }), destroy() {} }),
      createSampler: () => ({}),
      createShaderModule: ({ code }: { code: string }) => { modules.push(code); return { code }; },
      createBindGroupLayout: (layout: Layout) => { layouts.push(layout); return layout; },
      createPipelineLayout: (descriptor: { bindGroupLayouts: readonly Layout[] }) => descriptor,
      createRenderPipeline: (descriptor: { layout: "auto" | { bindGroupLayouts: readonly Layout[] } }) => ({
        getBindGroupLayout: (index: number) => descriptor.layout === "auto" ? {} : descriptor.layout.bindGroupLayouts[index]
      }),
      createBindGroup: (group: Group) => { groups.push(group); return group; },
      createCommandEncoder: () => ({
        beginRenderPass: () => ({
          setPipeline() {}, setVertexBuffer() {}, setIndexBuffer() {},
          setBindGroup: (index: number) => { boundGroups.push(index); },
          draw() { draws += 1; }, drawIndexed() { draws += 1; }, end() {}
        }),
        finish: () => ({})
      }),
      destroy() {}
    };
    const nativeDevice = native as unknown as WebGPUDeviceLike;
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => nativeDevice }, device: nativeDevice });
    const values = device.createBuffer("storage", 16);
    const tint = device.createBuffer("storage", 16);
    const material = createCustomShaderMaterial(shaderGraph.material({
      graph: storageGraph, backend: "wgsl",
      storage: { values: { kind: "storage-buffer", buffer: values }, tint: { kind: "storage-buffer", buffer: tint } }
    }).custom!);
    const geometry = Geometry.triangle();
    const vertices = new VertexBuffer(VertexFormat.P3J4W4, 3);
    for (let i = 0; i < 3; i += 1) vertices.setAttribute(i, "weights", [1, 0, 0, 0]);
    const skinned = new Geometry(vertices);
    const target = device.createRenderTarget({ width: 8, height: 8, depth: "texture" });
    try {
      device.beginFrame(8, 8);
      device.setRenderTarget(target);
      const item = { geometry, material, label: "native-storage-graph" };
      new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 });
      new DepthPass({ casters: [item], checkedSubmission: true }).execute({ device, width: 8, height: 8 });
      new DepthPass({ casters: [{ geometry: skinned, material, skinning: { jointCount: 1, matrices: identity }, label: "native-storage-skin" }], checkedSubmission: true })
        .execute({ device, width: 8, height: 8 });
      const storageGroups = groups.filter((group) => group.label?.endsWith("-storage-1"));
      expect(draws).toBe(3);
      expect(boundGroups).toEqual([0, 1, 0, 1, 0, 1]);
      expect(storageGroups).toHaveLength(3);
      expect(storageGroups[0]?.entries).toEqual([
        { binding: 0, resource: { buffer: device.getNativeStorageBuffer(values), offset: 0, size: 16 } },
        { binding: 1, resource: { buffer: device.getNativeStorageBuffer(tint), offset: 0, size: 16 } }
      ]);
      expect(storageGroups[1]?.entries).toEqual([
        { binding: 0, resource: { buffer: device.getNativeStorageBuffer(values), offset: 0, size: 16 } }
      ]);
      expect(storageGroups[2]?.entries).toEqual(storageGroups[1]?.entries);
      expect(layouts.some((layout) => layout.entries.some((entry) => entry.binding === 0 && entry.visibility === 1 && (entry.buffer as { type?: string } | undefined)?.type === "read-only-storage"))).toBe(true);
      expect(modules.some((source) => source.includes("auraGraph_resource_values"))).toBe(true);
      expect(values.disposed).toBe(false);
      expect(tint.disposed).toBe(false);
      device.setRenderTarget(null);
      let failure: unknown;
      try { new DepthPass({ casters: [item], checkedSubmission: true }).execute({ device, width: 8, height: 8 }); } catch (error) { failure = error; }
      expect(failure).toMatchObject({ code: "WEBGPU_DRAW_UNAVAILABLE" });
      expect(draws).toBe(3);
      expect(values.disposed).toBe(false);
      device.endFrame();
    } finally { skinned.dispose(); geometry.dispose(); material.dispose(); values.dispose(); tint.dispose(); target.dispose(); device.dispose(); }
  });

  it("borrows depth storage bindings for plain, instanced and skinned graph casters", () => {
    const material = displacedMaterial();
    const instance = new MaterialInstance(material);
    instance.setOverride("u_auraGraph_resource_offset", [3, 4, 5]);
    const geometry = Geometry.triangle();
    const vertices = new VertexBuffer(VertexFormat.P3J4W4, 3);
    for (let i = 0; i < 3; i += 1) vertices.setAttribute(i, "weights", [1, 0, 0, 0]);
    const skinned = new Geometry(vertices);
    const device = new MockRenderDevice();
    Object.defineProperty(device, "kind", { value: "webgpu" });
    const checkedDevice = device as MockRenderDevice & { drawChecked?: (command: DrawCommand) => void };
    const originalDraw = device.draw.bind(device);
    let checkedDraws = 0;
    checkedDevice.drawChecked = (command) => { checkedDraws += 1; originalDraw(command); };
    device.draw = () => { throw new Error("unexpected unchecked draw"); };
    const buffer = device.createBuffer("storage", 16);
    const texture = new Texture({ width: 1, height: 1, format: "rgba8", usage: ["storage"] });
    const bindings = [
      { name: "offsets", kind: "storage-buffer" as const, group: 1, binding: 3, buffer, offset: 0, size: 16 },
      { name: "image", kind: "storage-texture" as const, group: 1, binding: 4, texture, format: "rgba8unorm" }
    ];
    const requestedPasses: string[] = [];
    Object.defineProperties(material, {
      graphRequiresWebGPU: { value: true },
      graphStorageBindings: { value: (pass: string) => { requestedPasses.push(pass); return bindings; } }
    });
    try {
      device.beginFrame(8, 8);
      new DepthPass({
        checkedSubmission: true,
        casters: [
          { geometry, material },
          { geometry, material, instanceTransforms: new Float32Array([...identity, ...identity]) },
          { geometry: skinned, material: instance, skinning: { matrices: identity, jointCount: 1 } }
        ]
      }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(4);
      expect(checkedDraws).toBe(4);
      expect(requestedPasses).toEqual(["depth", "depth", "depth"]);
      for (const draw of device.drawCommands) {
        expect(draw.nativeStorageBindings).toBe(bindings);
        expect(draw.nativeStorageBindings?.[0]).toMatchObject({ group: 1, binding: 3, buffer });
        expect(draw.nativeStorageBindings?.[1]).toMatchObject({ group: 1, binding: 4, texture });
        expect(draw.uniforms?.get("u_a3dClipGroupCount")).toBe(0);
      }
      expect(device.drawCommands[3]?.uniforms?.get("u_auraGraph_resource_offset")).toEqual([3, 4, 5]);
      expect(buffer.disposed).toBe(false);
      expect(texture.disposed).toBe(false);
      checkedDevice.drawChecked = () => { throw new Error("draw failed"); };
      expect(() => new DepthPass({ casters: [{ geometry, material }], checkedSubmission: true }).execute({ device, width: 8, height: 8 })).toThrow("draw failed");
      expect(buffer.disposed).toBe(false);
      expect(texture.disposed).toBe(false);
      device.endFrame();
    } finally { skinned.dispose(); geometry.dispose(); material.dispose(); buffer.dispose(); texture.dispose(); device.dispose(); }
  });

  it("rejects graph storage on WebGL before uploading geometry or drawing", () => {
    const material = displacedMaterial();
    const geometry = Geometry.triangle();
    const device = new MockRenderDevice();
    Object.defineProperty(device, "kind", { value: "webgl2" });
    Object.defineProperty(material, "graphRequiresWebGPU", { value: true });
    try {
      device.beginFrame(8, 8);
      const buffersBefore = device.getDiagnostics().buffers;
      let failure: unknown;
      try { new DepthPass({ casters: [{ geometry, material }] }).execute({ device, width: 8, height: 8 }); } catch (error) { failure = error; }
      expect(failure).toMatchObject({ code: "GRAPH_STORAGE_BACKEND_UNSUPPORTED", message: "Shader graph storage resources require WebGPU" });
      expect(device.getDiagnostics().buffers).toBe(buffersBefore);
      expect(device.drawCommands).toHaveLength(0);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("fails explicitly when storage-driven displacement has no depth shader", () => {
    const material = createCustomShaderMaterial({
      glsl: { vertex: "void main() { gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }", fragment: "out vec4 color; void main() { color = vec4(1.0); }" }
    });
    const geometry = Geometry.triangle();
    const device = new MockRenderDevice();
    Object.defineProperty(device, "kind", { value: "webgpu" });
    const buffer = device.createBuffer("storage", 16);
    Object.defineProperties(material, {
      graphRequiresWebGPU: { value: true },
      graphStorageBindings: { value: () => [{ name: "offsets", kind: "storage-buffer", group: 1, binding: 0, buffer }] }
    });
    try {
      device.beginFrame(8, 8);
      let failure: unknown;
      try { new DepthPass({ casters: [{ geometry, material }] }).execute({ device, width: 8, height: 8 }); } catch (error) { failure = error; }
      expect(failure).toMatchObject({ code: "GRAPH_STORAGE_DEPTH_SHADER_MISSING" });
      expect(device.drawCommands).toHaveLength(0);
      expect(buffer.disposed).toBe(false);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); buffer.dispose(); device.dispose(); }
  });

  it("uses the same default and explicit frame time as standalone forward draws", () => {
    const material = createCustomShaderMaterial({
      glsl: {
        vertex: "void main() { vec3 p = position; p.x += uTime; gl_Position = modelViewProjectionMatrix * vec4(p, 1.0); }",
        fragment: "out vec4 color; void main() { color = vec4(1.0); }"
      },
      castShadow: true
    });
    const geometry = Geometry.triangle();
    const device = new MockRenderDevice();
    const item = { geometry, material };
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 });
      new DepthPass({ casters: [item] }).execute({ device, width: 8, height: 8 });
      new ForwardPass({ items: [item], timeSeconds: 7.25 }).execute({ device, width: 8, height: 8 });
      new DepthPass({ casters: [item], timeSeconds: 7.25 }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands.map((draw) => draw.uniforms?.get("u_time"))).toEqual([0, 0, 7.25, 7.25]);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("uses each material instance's live displacement and the scene camera eye", () => {
    const material = displacedMaterial();
    const first = new MaterialInstance(material);
    const second = new MaterialInstance(material);
    first.setOverride("u_auraGraph_resource_offset", [3, 4, 5]);
    second.setOverride("u_auraGraph_resource_offset", [-2, 7, 9]);
    const geometry = Geometry.triangle();
    const device = new MockRenderDevice();
    try {
      device.beginFrame(24, 16);
      const pass = new DepthPass({ casters: [{ geometry, material: first }, { geometry, material: second }], cameraPosition: [10, -3, 7], timeSeconds: 2 });
      pass.execute({ device, width: 24, height: 16 });
      expect(device.drawCommands.map((draw) => draw.uniforms?.get("u_auraGraph_resource_offset"))).toEqual([[3, 4, 5], [-2, 7, 9]]);
      expect(device.drawCommands.map((draw) => draw.uniforms?.get("u_cameraPosition"))).toEqual([[10, -3, 7], [10, -3, 7]]);
      first.clearOverride("u_auraGraph_resource_offset");
      material.setParameter("u_auraGraph_resource_offset", [8, 9, 10]);
      pass.execute({ device, width: 24, height: 16 });
      expect(device.drawCommands[2]?.uniforms?.get("u_auraGraph_resource_offset")).toEqual([8, 9, 10]);
      expect(device.drawCommands[3]?.uniforms?.get("u_auraGraph_resource_offset")).toEqual([-2, 7, 9]);
      expect(material.getParameter("u_auraGraph_resource_offset")).toEqual([8, 9, 10]);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("binds the declared clip range and clears clipping and logarithmic state across draws", () => {
    const material = displacedMaterial();
    const geometry = Geometry.triangle();
    const device = new MockRenderDevice();
    const logarithmic = negotiateDepthConvention({ mode: "logarithmic" }, { clipRange: "minus-one-to-one", reversed: false, logarithmic: true });
    const reversed = negotiateDepthConvention({ mode: "reversed" }, { clipRange: "zero-to-one", reversed: true, logarithmic: true });
    try {
      const source = globalShaderSource(material.customDepthShaderKey!)!;
      expect(source.fragment).toContain("gl_FragCoord.z");
      expect(source.webgpu?.vertex).toContain("aura.u_a3dClipRange");
      device.beginFrame(16, 16);
      new DepthPass({ casters: [{ geometry, material }], depthConvention: logarithmic, depthViewMatrix: identity,
        depthRange: { near: 0.25, far: 80 }, globalClipping: { planes: [[1, 0, 0, -2]], clipShadows: true } })
        .execute({ device, width: 16, height: 16 });
      new DepthPass({ casters: [{ geometry, material }], depthConvention: reversed }).execute({ device, width: 16, height: 16 });
      const [clipped, next] = device.drawCommands;
      expect(clipped?.uniforms?.get("u_a3dClipRange")).toBe(0);
      expect(clipped?.uniforms?.get("u_a3dClipGroupCount")).toBe(1);
      expect(clipped?.uniforms?.get("u_a3dLogDepthEnabled")).toBe(1);
      expect(clipped?.uniforms?.get("u_a3dLogDepthRange")).toEqual([0.25, 80]);
      expect(next?.uniforms?.get("u_a3dClipRange")).toBe(1);
      expect(next?.uniforms?.get("u_a3dClipGroupCount")).toBe(0);
      expect(next?.uniforms?.get("u_a3dLogDepthEnabled")).toBe(0);
      expect(next?.renderState?.depthCompareV2).toBe("greater-equal");
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("uses the forward fallback eye and rejects nonfinite explicit camera input", () => {
    const material = displacedMaterial();
    const geometry = Geometry.triangle();
    const device = new MockRenderDevice();
    try {
      device.beginFrame(8, 8);
      new DepthPass({ casters: [{ geometry, material }] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands[0]?.uniforms?.get("u_cameraPosition")).toEqual([0, 0, 1]);
      expect(() => new DepthPass({ casters: [{ geometry, material }], cameraPosition: [0, NaN, 0] }).execute({ device, width: 8, height: 8 })).toThrow(/finite vec3/);
      expect(device.drawCommands).toHaveLength(1);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("carries per-instance colors without disposing an earlier draw's matrix buffer", () => {
    const material = createCustomShaderMaterial({
      glsl: {
        vertex: "void main() { vec3 p = position; p.x += instanceColor.r; gl_Position = modelViewProjectionMatrix * instanceMatrix * vec4(p, 1.0); }",
        fragment: "out vec4 outColor; void main() { outColor = vec4(1.0); }"
      },
      castShadow: true
    });
    const geometry = Geometry.triangle();
    const transforms = new Float32Array([...identity, ...identity]);
    const device = new MockRenderDevice();
    try {
      device.beginFrame(8, 8);
      new DepthPass({ casters: [{ geometry, material, instanceTransforms: transforms }] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands[0]?.uniforms?.get("u_a3dInstanceColors")).toBe(0);
      const firstMatrixBuffer = device.drawCommands[0]?.instanceAttributes?.[0]?.buffer;
      new DepthPass({ casters: [{ geometry, material, instanceTransforms: transforms, instanceColors: [1, 0, 0, 1, 0, 0.5, 0, 1] }] }).execute({ device, width: 8, height: 8 });
      const draw = device.drawCommands[1]!;
      const color = draw.instanceAttributes?.find((attribute) => attribute.shaderName === "a_instanceColor");
      expect(draw.instanceCount).toBe(2);
      expect(draw.uniforms?.get("u_a3dInstanceColors")).toBe(1);
      expect(color).toBeDefined();
      expect(firstMatrixBuffer?.disposed).toBe(false);
      expect(Array.from(new Float32Array(device.readBuffer(color!.buffer).buffer)).slice(0, 8)).toEqual([1, 0, 0, 1, 0, 0.5, 0, 1]);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects skinned custom shaders that do not declare a palette contract", () => {
    const material = createCustomShaderMaterial({
      glsl: { vertex: "void main() { gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }", fragment: "out vec4 color; void main() { color = vec4(1.0); }" },
      castShadow: true
    });
    const geometry = Geometry.triangle();
    const device = new MockRenderDevice();
    try {
      device.beginFrame(8, 8);
      expect(() => new DepthPass({ casters: [{ geometry, material, skinning: { matrices: identity, jointCount: 1 } }] }).execute({ device, width: 8, height: 8 }))
        .toThrow(/skinning contract/);
      expect(device.drawCommands).toHaveLength(0);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("binds and releases a custom shader's large skin palette after the draw", () => {
    const material = createCustomShaderMaterial({
      glsl: {
        vertex: [
          "layout(location = 5) in vec4 a_joints;",
          "layout(location = 6) in vec4 a_weights;",
          "uniform mat4 u_jointMatrices[96];",
          "uniform float u_jointCount;",
          "uniform float u_jointPaletteMode;",
          "uniform sampler2D u_jointPaletteTexture;",
          "uniform vec2 u_jointPaletteTextureSize;",
          "void main() { gl_Position = modelViewProjectionMatrix * u_jointMatrices[0] * vec4(position, 1.0); }"
        ].join("\n"),
        fragment: "out vec4 color; void main() { color = vec4(1.0); }"
      }, castShadow: true
    });
    const vertices = new VertexBuffer(VertexFormat.P3J4W4, 3);
    for (let i = 0; i < 3; i += 1) {
      vertices.setAttribute(i, "joints", [0, 0, 0, 0]);
      vertices.setAttribute(i, "weights", [1, 0, 0, 0]);
    }
    const geometry = new Geometry(vertices);
    const palette = new Float32Array(97 * 16);
    for (let i = 0; i < 97; i += 1) palette.set(identity, i * 16);
    const device = new MockRenderDevice();
    let binding: { texture: { disposed: boolean } | null } | undefined;
    const draw = device.draw.bind(device);
    device.draw = (command) => {
      binding = command.uniforms?.get("u_jointPaletteTexture") as typeof binding;
      expect(binding?.texture?.disposed).toBe(false);
      expect(command.uniforms?.get("u_jointCount")).toBe(97);
      expect(command.uniforms?.get("u_jointPaletteMode")).toBe(1);
      draw(command);
    };
    try {
      device.beginFrame(8, 8);
      new DepthPass({ casters: [{ geometry, material, skinning: { jointCount: 97, matrices: palette } }] }).execute({ device, width: 8, height: 8 });
      expect(binding?.texture?.disposed).toBe(true);
      device.draw = (command) => {
        binding = command.uniforms?.get("u_jointPaletteTexture") as typeof binding;
        expect(binding?.texture?.disposed).toBe(false);
        throw new Error("draw failed");
      };
      expect(() => new DepthPass({ casters: [{ geometry, material, skinning: { jointCount: 97, matrices: palette } }] })
        .execute({ device, width: 8, height: 8 })).toThrow("draw failed");
      expect(binding?.texture?.disposed).toBe(true);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("selects the matching four- and eight-influence graph depth variants", () => {
    const material = displacedMaterial();
    const override = new MaterialInstance(material);
    override.setOverride("u_auraGraph_resource_offset", [5, 6, 7]);
    const vertices = new VertexBuffer(VertexFormat.P3J8W8, 3);
    const fourVertices = new VertexBuffer(VertexFormat.P3J4W4, 3);
    for (let i = 0; i < 3; i += 1) {
      fourVertices.setAttribute(i, "joints", [0, 0, 0, 0]);
      fourVertices.setAttribute(i, "weights", [1, 0, 0, 0]);
      vertices.setAttribute(i, "joints", [0, 0, 0, 0]);
      vertices.setAttribute(i, "weights", [1, 0, 0, 0]);
      vertices.setAttribute(i, "joints1", [0, 0, 0, 0]);
      vertices.setAttribute(i, "weights1", [0, 0, 0, 0]);
    }
    const geometry = new Geometry(vertices);
    const fourGeometry = new Geometry(fourVertices);
    const device = new MockRenderDevice();
    try {
      device.beginFrame(8, 8);
      new DepthPass({ casters: [
        { geometry: fourGeometry, material: override, skinning: { matrices: identity, jointCount: 1 } },
        { geometry, material: override, skinning: { matrices: identity, jointCount: 1, extraInfluences: true } }
      ] }).execute({ device, width: 8, height: 8 });
      const [four, eight] = device.drawCommands;
      expect(four?.shader?.marker).toContain("skin-four-depth");
      expect(eight?.shader?.marker).toContain("skin-eight-depth");
      expect(four?.shader?.reflection.attributes.has("a_joints1")).toBe(false);
      expect(eight?.shader?.reflection.attributes.has("a_joints1")).toBe(true);
      expect(eight?.uniforms?.get("u_jointCount")).toBe(1);
      expect(eight?.uniforms?.get("u_auraGraph_resource_offset")).toEqual([5, 6, 7]);
      const pair = globalShaderSource(material.graphSkinningDepthShaderKeys!.eight)!;
      expect(pair.vertex.indexOf("auraGraph_deformedPosition =")).toBeLessThan(pair.vertex.indexOf("auraGraph_finalPosition ="));
      expect(() => new DepthPass({ casters: [{ geometry, material: override, skinning: { matrices: identity, jointCount: 1 } }] })
        .execute({ device, width: 8, height: 8 })).toThrow(/enable eight influences/);
      device.endFrame();
    } finally { fourGeometry.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("skins a graph without a position output and revalidates changed joint streams", () => {
    const colorOnly = { ...graph, outputs: { color: "color" } };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: colorOnly, uniforms: { offset: [1, 2, 3] } }).custom!);
    const vertices = new VertexBuffer(VertexFormat.P3J4W4, 3);
    for (let i = 0; i < 3; i += 1) vertices.setAttribute(i, "weights", [1, 0, 0, 0]);
    const geometry = new Geometry(vertices);
    const invalidFormat = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "joints", components: 4, offset: 12, type: "uint8", normalized: true },
      { semantic: "weights", components: 4, offset: 16 }
    ], 32);
    const invalid = new Geometry(new VertexBuffer(invalidFormat, 3));
    const device = new MockRenderDevice();
    try {
      expect(material.customDepthShaderKey).toBeUndefined();
      device.beginFrame(8, 8);
      new DepthPass({ casters: [{ geometry, material, skinning: { matrices: identity, jointCount: 1 } }] })
        .execute({ device, width: 8, height: 8 });
      expect(device.drawCommands[0]?.shader?.marker).toContain("skin-four-depth");
      vertices.setAttribute(0, "joints", [1, 0, 0, 0]);
      expect(() => new DepthPass({ casters: [{ geometry, material, skinning: { matrices: identity, jointCount: 1 } }] })
        .execute({ device, width: 8, height: 8 })).toThrow(/palette/);
      expect(() => new DepthPass({ casters: [{ geometry: invalid, material, skinning: { matrices: identity, jointCount: 1 } }] })
        .execute({ device, width: 8, height: 8 })).toThrow(/supported joint and weight/);
      expect(device.drawCommands).toHaveLength(1);
      device.endFrame();
    } finally { geometry.dispose(); invalid.dispose(); material.dispose(); device.dispose(); }
  });
});

describe("depth geometry streams", () => {
  it("binds the actual position and skinning streams and does not use a coarse proxy", () => {
    const format = new VertexFormat([
      { semantic: "normal", components: 3, offset: 0 },
      { semantic: "position", components: 3, offset: 0, bufferSlot: 2 },
      { semantic: "joints", components: 4, offset: 0, bufferSlot: 3, type: "uint8", integer: true },
      { semantic: "weights", components: 4, offset: 0, bufferSlot: 4, type: "uint8", normalized: true }
    ], 12, [{ slot: 2, stride: 12 }, { slot: 3, stride: 4 }, { slot: 4, stride: 4 }]);
    const normal = new VertexBuffer(format, 3);
    const position = new VertexBuffer(format, 3, 2);
    const joints = new VertexBuffer(format, 3, 3);
    const weights = new VertexBuffer(format, 3, 4);
    for (let i = 0; i < 3; i += 1) {
      position.setAttribute(i, "position", [i + 4, i + 5, i + 6]);
      joints.setAttribute(i, "joints", [0, 0, 0, 0]);
      weights.setAttribute(i, "weights", [255, 0, 0, 0]);
    }
    const geometry = new Geometry(normal, null, "triangles", undefined, [position, joints, weights]);
    const proxy = Geometry.triangle();
    const device = new MockRenderDevice();
    try {
      device.beginFrame(8, 8);
      new DepthPass({ casters: [{ geometry, shadowGeometry: proxy, skinning: { matrices: identity, jointCount: 1 } }] }).execute({ device, width: 8, height: 8 });
      const draw = device.drawCommands[0]!;
      expect(draw.vertexBuffer).toBe(draw.vertexBuffers?.[0]);
      expect(draw.vertexBuffers?.[1]).toBeUndefined();
      expect(Array.from(new Float32Array(device.readBuffer(draw.vertexBuffers![2]!).buffer))).toEqual([4, 5, 6, 5, 6, 7, 6, 7, 8]);
      expect(Array.from(device.readBuffer(draw.vertexBuffers![3]!))).toEqual(new Array(12).fill(0));
      expect(Array.from(device.readBuffer(draw.vertexBuffers![4]!))).toEqual([255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0]);
      expect(draw.uniforms?.get("u_jointCount")).toBe(1);
      device.endFrame();
    } finally { geometry.dispose(); proxy.dispose(); device.dispose(); }
  });

  it("submits instance-rate geometry streams with their draw count and rejects undersized streams", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "color", components: 4, offset: 0, bufferSlot: 3, type: "uint8", normalized: true }
    ], 12, [{ slot: 3, stride: 4, stepMode: "instance" }]);
    const positions = new VertexBuffer(format, 3);
    const colors = new VertexBuffer(format, 3, 3);
    colors.setAttribute(2, "color", [10, 20, 30, 40]);
    const geometry = new Geometry(positions, null, "triangles", undefined, [colors]);
    const device = new MockRenderDevice();
    try {
      device.beginFrame(8, 8);
      new DepthPass({ casters: [{ geometry, instanceCount: 3 }] }).execute({ device, width: 8, height: 8 });
      const draw = device.drawCommands[0]!;
      expect(draw.instanceCount).toBe(3);
      expect(Array.from(device.readBuffer(draw.vertexBuffers![3]!)).slice(8)).toEqual([10, 20, 30, 40]);
      expect(() => new DepthPass({ casters: [{ geometry, instanceCount: 4 }] }).execute({ device, width: 8, height: 8 })).toThrow(/requires 4 records/);
      expect(device.drawCommands).toHaveLength(1);
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });

  it("uploads a morphed position stream while preserving the source geometry", () => {
    const format = new VertexFormat([
      { semantic: "normal", components: 3, offset: 0 },
      { semantic: "position", components: 3, offset: 0, bufferSlot: 2 }
    ], 12, [{ slot: 2, stride: 12 }]);
    const normal = new VertexBuffer(format, 3);
    const positions = new VertexBuffer(format, 3, 2);
    for (let i = 0; i < 3; i += 1) positions.setAttribute(i, "position", [i, 0, 0]);
    const geometry = new Geometry(normal, null, "triangles", undefined, [positions]);
    const device = new MockRenderDevice();
    let submitted: number[] = [];
    const draw = device.draw.bind(device);
    device.draw = (command) => {
      submitted = Array.from(new Float32Array(device.readBuffer(command.vertexBuffers![2]!).buffer));
      draw(command);
    };
    try {
      device.beginFrame(8, 8);
      new DepthPass({ casters: [{ geometry, morphTargets: [{ positions: [[2, 0, 0], [0, 0, 0], [0, 0, 0]] }], morphWeights: [0.5] }] })
        .execute({ device, width: 8, height: 8 });
      expect(submitted).toEqual([1, 0, 0, 1, 0, 0, 2, 0, 0]);
      expect(positions.getAttribute(0, "position")).toEqual([0, 0, 0]);
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); }
  });

  it("rejects per-instance streams when a graph would require per-instance expansion", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "color", components: 4, offset: 0, bufferSlot: 2 }
    ], 12, [{ slot: 2, stride: 16, stepMode: "instance" }]);
    const geometry = new Geometry(new VertexBuffer(format, 3), null, "triangles", undefined, [new VertexBuffer(format, 2, 2)]);
    const material = displacedMaterial();
    const device = new MockRenderDevice();
    try {
      device.beginFrame(8, 8);
      const transforms = new Float32Array([...identity, ...identity]);
      expect(() => new DepthPass({ casters: [{ geometry, material, instanceTransforms: transforms }] }).execute({ device, width: 8, height: 8 }))
        .toThrow(/cannot be expanded/);
      expect(device.drawCommands).toHaveLength(0);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("specializes depth shaders for mixed signed and unsigned joint streams on both backends", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "joints", components: 4, offset: 0, bufferSlot: 2, type: "uint8", integer: true },
      { semantic: "weights", components: 4, offset: 0, bufferSlot: 3, type: "uint8", normalized: true },
      { semantic: "joints1", components: 4, offset: 0, bufferSlot: 4, type: "int16", integer: true },
      { semantic: "weights1", components: 4, offset: 0, bufferSlot: 5, type: "uint8", normalized: true }
    ], 12, [{ slot: 2, stride: 4 }, { slot: 3, stride: 4 }, { slot: 4, stride: 8 }, { slot: 5, stride: 4 }]);
    const streams = [0, 2, 3, 4, 5].map((slot) => new VertexBuffer(format, 3, slot));
    for (let i = 0; i < 3; i += 1) streams[2]!.setAttribute(i, "weights", [255, 0, 0, 0]);
    const geometry = new Geometry(streams[0]!, null, "triangles", undefined, streams.slice(1));
    const fourFormat = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "joints", components: 4, offset: 0, bufferSlot: 2, type: "uint8", integer: true },
      { semantic: "weights", components: 4, offset: 0, bufferSlot: 3, type: "uint8", normalized: true }
    ], 12, [{ slot: 2, stride: 4 }, { slot: 3, stride: 4 }]);
    const fourStreams = [0, 2, 3].map((slot) => new VertexBuffer(fourFormat, 3, slot));
    for (let i = 0; i < 3; i += 1) fourStreams[2]!.setAttribute(i, "weights", [255, 0, 0, 0]);
    const fourGeometry = new Geometry(fourStreams[0]!, null, "triangles", undefined, fourStreams.slice(1));
    const material = displacedMaterial();
    const device = new MockRenderDevice();
    Object.defineProperty(device, "kind", { value: "webgpu" });
    const glDevice = new MockRenderDevice();
    Object.defineProperty(glDevice, "kind", { value: "webgl2" });
    const vertexSources: string[] = [];
    const create = device.createShaderProgram.bind(device);
    device.createShaderProgram = (source) => { vertexSources.push(source.webgpu?.vertex ?? ""); return create(source); };
    let glslVertex = "";
    const createGl = glDevice.createShaderProgram.bind(glDevice);
    glDevice.createShaderProgram = (source) => { glslVertex = source.vertex; return createGl(source); };
    try {
      device.beginFrame(8, 8);
      new DepthPass({ casters: [
        { geometry, skinning: { matrices: identity, jointCount: 1 } },
        { geometry, skinning: { matrices: identity, jointCount: 1, extraInfluences: true } }
      ] })
        .execute({ device, width: 8, height: 8 });
      expect(vertexSources).toHaveLength(2);
      expect(vertexSources[0]).toContain("@location(5) joints: vec4<u32>");
      expect(vertexSources[0]).not.toContain("@location(8) joints1:");
      expect(vertexSources[1]).toContain("@location(5) joints: vec4<u32>");
      expect(vertexSources[1]).toContain("@location(8) joints1: vec4<i32>");
      expect(device.drawCommands[1]?.vertexBuffers?.[4]).toBeDefined();
      new DepthPass({ casters: [
        { geometry: fourGeometry, material, skinning: { matrices: identity, jointCount: 1 } },
        { geometry, material, skinning: { matrices: identity, jointCount: 1, extraInfluences: true } }
      ] })
        .execute({ device, width: 8, height: 8 });
      expect(vertexSources[2]).toContain("@location(5) joints: vec4<u32>");
      expect(vertexSources[2]).not.toContain("@location(8) joints1:");
      expect(vertexSources[3]).toContain("@location(5) joints: vec4<u32>");
      expect(vertexSources[3]).toContain("@location(8) joints1: vec4<i32>");
      expect(device.drawCommands[3]?.uniforms?.get("u_jointCount")).toBe(1);
      device.endFrame();
      glDevice.beginFrame(8, 8);
      new DepthPass({ casters: [{ geometry, skinning: { matrices: identity, jointCount: 1, extraInfluences: true } }] })
        .execute({ device: glDevice, width: 8, height: 8 });
      const glDraw = glDevice.drawCommands[0]!;
      expect(glslVertex).toContain("layout(location = 5) in uvec4 a_joints;");
      expect(glslVertex).toContain("layout(location = 8) in ivec4 a_joints1;");
      expect(glDraw.vertexFormat?.getAttribute("joints")).toMatchObject({ integer: true, type: "uint8", bufferSlot: 2 });
      expect(glDraw.vertexFormat?.getAttribute("joints1")).toMatchObject({ integer: true, type: "int16", bufferSlot: 4 });
      const integerPointers: unknown[][] = [];
      const floatPointers: unknown[][] = [];
      const boundBuffers: unknown[] = [];
      const gl = {
        ARRAY_BUFFER: 0x8892, FLOAT: 0x1406, UNSIGNED_BYTE: 0x1401, SHORT: 0x1402,
        getExtension: () => null,
        bindBuffer: (_target: number, handle: unknown) => boundBuffers.push(handle),
        enableVertexAttribArray() {}, vertexAttribDivisor() {},
        vertexAttribIPointer: (...args: unknown[]) => integerPointers.push(args),
        vertexAttribPointer: (...args: unknown[]) => floatPointers.push(args)
      };
      const binder = new WebGL2DrawCallBinder({
        gl, maxVertexAttributes: 16,
        stateCache: { onInvalidate() {}, bindBuffer: (_target: number, _handle: unknown, bind: () => void) => bind() }
      } as never);
      const buffers = new Map(format.streams.map((stream) => [stream.slot, { handle: `slot-${stream.slot}` }]));
      binder.bindVertexFormat(glDraw.shader!, format, buffers as never);
      expect(integerPointers).toEqual([[5, 4, 0x1401, 4, 0], [8, 4, 0x1402, 8, 0]]);
      expect(floatPointers).toContainEqual([6, 4, 0x1401, true, 4, 0]);
      expect(floatPointers).toContainEqual([9, 4, 0x1401, true, 4, 0]);
      expect(boundBuffers).toEqual(["slot-0", "slot-2", "slot-3", "slot-4", "slot-5"]);
      new DepthPass({ casters: [{ geometry, material, skinning: { matrices: identity, jointCount: 1, extraInfluences: true } }] })
        .execute({ device: glDevice, width: 8, height: 8 });
      expect(glslVertex).toContain("layout(location = 5) in uvec4 a_joints;");
      expect(glslVertex).toContain("layout(location = 8) in ivec4 a_joints1;");
      glDevice.endFrame();
    } finally { material.dispose(); fourGeometry.dispose(); geometry.dispose(); device.dispose(); glDevice.dispose(); }
  });
});
