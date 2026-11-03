import { afterEach, describe, expect, it, vi } from "vitest";
import { batched, createBatchedLoopItems, registerBatchedDrawShader } from "../../../packages/engine/src/agent-api/nodes/batched";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { packedLoopMemberFor } from "../../../packages/rendering/src/batching/BatchMembers";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { InstancedPBRMaterial } from "../../../packages/rendering/src/InstancedPBRMaterial";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { textureBudgetReport } from "../../../packages/rendering/src/textures/TextureBudget";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import { isEnginePackedBatchItem } from "../../../packages/rendering/src/batching/BatchMembers";
import { defineAuraCustomGeometry } from "../../../packages/engine/src/agent-api/RootGeometry";
import { material } from "../../../packages/engine/src/agent-api/nodes/material";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { realCompilerImpl, type MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import type { RenderItem, RenderSource } from "../../../packages/rendering/src";
import "../../../packages/rendering/src/lanes/prd01";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const translation = (z: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1];

/** A device-shaped source test; shader compilation and GL execution are simulated. */
function webglCanvas(extensionPresent = true, fencePresent = true) {
  type Shader = { source?: string };
  type Program = { shaders: Shader[] };
  type BoundDraw = { kind: "combined" | "ordinary"; vertex: string; fragment: string; matrix?: number[]; color?: number[] };
  type FenceStatus = "signaled" | "pending" | "failed";
  type Fence = { status: FenceStatus };
  const constants: Record<string, number> = {
    NO_ERROR: 0, SYNC_GPU_COMMANDS_COMPLETE: 0x9117, ALREADY_SIGNALED: 0x911a, TIMEOUT_EXPIRED: 0x911b,
    CONDITION_SATISFIED: 0x911c, WAIT_FAILED: 0x911d, LINK_STATUS: 0x8b82, COMPILE_STATUS: 0x8b81,
    ACTIVE_ATTRIBUTES: 0x8b89, ACTIVE_UNIFORMS: 0x8b86, INVALID_INDEX: 0xffffffff,
    ARRAY_BUFFER: 0x8892, ELEMENT_ARRAY_BUFFER: 0x8893, UNIFORM_BUFFER: 0x8a11,
    UNSIGNED_SHORT: 0x1403, UNSIGNED_INT: 0x1405, SAMPLER_2D: 0x8b5e, FLOAT: 0x1406,
    FLOAT_VEC2: 0x8b50, FLOAT_VEC3: 0x8b51, FLOAT_VEC4: 0x8b52, FLOAT_MAT4: 0x8b5c
  };
  const calls: { ordinary: number[]; combined: Array<{ counts: number[]; offsets: number[]; instances: number[] }>;
    rows: number[][]; shaders: string[]; matrices: Array<{ name: string; values: number[] }>;
    pointers: number[]; divisors: Array<{ location: number; divisor: number }>; bufferUploads: number[][];
    vectors: Array<{ name: string; values: number[] }>;
    draws: BoundDraw[];
    fences: Fence[]; deletedTextures: unknown[]; fenceDefault: FenceStatus;
    failCombined: boolean; exposeLoopUniform: boolean; exposeInstanceAttribute: boolean } =
    { ordinary: [], combined: [], rows: [], shaders: [], matrices: [], pointers: [], divisors: [], bufferUploads: [], vectors: [], draws: [],
      fences: [], deletedTextures: [], fenceDefault: "signaled", failCombined: false, exposeLoopUniform: false, exposeInstanceAttribute: false };
  const listeners = new Map<string, EventListener>();
  let contextLost = false;
  let activeProgram: Program | null = null;
  let activeArrayBuffer: object | null = null;
  let activeVertexArray: object | null = null;
  const vertexArrays = new WeakMap<object, Map<number, object>>();
  const bufferContents = new WeakMap<object, number[]>();
  const captureDraw = (kind: BoundDraw["kind"]) => {
    const attributes = activeVertexArray ? vertexArrays.get(activeVertexArray) : undefined;
    const matrixBuffer = attributes?.get(8), colorBuffer = attributes?.get(12);
    calls.draws.push({ kind, vertex: activeProgram?.shaders[0]?.source ?? "", fragment: activeProgram?.shaders[1]?.source ?? "",
      ...(matrixBuffer && bufferContents.get(matrixBuffer) ? { matrix: [...bufferContents.get(matrixBuffer)!] } : {}),
      ...(colorBuffer && bufferContents.get(colorBuffer) ? { color: [...bufferContents.get(colorBuffer)!] } : {}) });
  };
  const extension = { multiDrawElementsInstancedWEBGL: (_mode: number, counts: Int32Array, _ci: number,
    _type: number, offsets: Int32Array, _oi: number, instances: Int32Array, _ii: number, count: number) => {
    calls.combined.push({ counts: Array.from(counts.slice(0, count)), offsets: Array.from(offsets.slice(0, count)),
      instances: Array.from(instances.slice(0, count)) });
    captureDraw("combined");
    if (calls.failCombined) throw new Error("combined attempt failed");
  } };
  const combinedProgram = (program: Program) => program.shaders.some((shader) => shader.source?.includes("#define A3D_L5_MULTI_DRAW"));
  // Model WebGL's active attributes from the generated vertex variant. The
  // test records the actual buffer bindings, while compilation remains mocked.
  const locations: Record<string, number> = { a_position: 0, a_normal: 1, a_uv: 2,
    a_instanceMatrix0: 8, a_instanceMatrix1: 9, a_instanceMatrix2: 10, a_instanceMatrix3: 11, a_instanceColor: 12 };
  const activeAttributes = (program: Program) => {
    const source = program.shaders[0]?.source ?? "";
    const names = ["a_position", ...(source.includes("#define A3D_NEED_NORMAL") ? ["a_normal"] : []),
      ...(source.includes("#define A3D_NEED_UV0") ? ["a_uv"] : []),
      ...(source.includes("#define USE_INSTANCING 1\n") ? ["a_instanceMatrix0", "a_instanceMatrix1", "a_instanceMatrix2", "a_instanceMatrix3"] : []),
      ...(source.includes("#define USE_INSTANCING_COLOR 1\n") ? ["a_instanceColor"] : []),
      ...(combinedProgram(program) && calls.exposeInstanceAttribute ? ["a_instanceMatrix0"] : [])];
    return [...new Set(names)].map((name) => ({ name, type: name.startsWith("a_instance") ? constants.FLOAT_VEC4
      : name === "a_uv" ? constants.FLOAT_VEC2 : constants.FLOAT_VEC3, size: 1 }));
  };
  const activeUniforms = (program: Program) => [
    ...(!combinedProgram(program) ? [{ name: "u_modelMatrix", type: constants.FLOAT_MAT4, size: 1 }] : []),
    { name: "u_geometryMatrix", type: constants.FLOAT_MAT4, size: 1 },
    { name: "u_normalMatrix", type: constants.FLOAT_MAT4, size: 1 },
    { name: "u_baseColor", type: constants.FLOAT_VEC4, size: 1 },
    ...(combinedProgram(program) ? [
      { name: "u_a3dDrawData", type: constants.SAMPLER_2D, size: 1 },
      { name: "u_lightCount", type: constants.FLOAT, size: 1 },
      { name: "u_lightData[0]", type: constants.FLOAT_VEC4, size: 96 },
      ...(calls.exposeLoopUniform ? [{ name: "u_drawId", type: constants.FLOAT, size: 1 }] : [])
    ] : [])
  ];
  const values: Record<string, unknown> = {
    ...constants,
    getError: () => 0, getParameter: () => 4096,
    getExtension: (name: string) => name === "WEBGL_multi_draw" && extensionPresent ? extension : null,
    isContextLost: () => contextLost, createBuffer: () => ({}), createVertexArray: () => ({}), createTexture: () => ({}),
    useProgram: (program: Program | null) => { activeProgram = program; },
    bindVertexArray: (array: object | null) => { activeVertexArray = array; },
    bindBuffer: (target: number, buffer: object | null) => { if (target === constants.ARRAY_BUFFER) activeArrayBuffer = buffer; },
    createSampler: () => ({}), createShader: () => ({} as Shader), shaderSource: (shader: Shader, source: string) => { shader.source = source; calls.shaders.push(source); },
    getShaderParameter: () => true, createProgram: () => ({ shaders: [] } as Program),
    attachShader: (program: Program, shader: Shader) => program.shaders.push(shader),
    getProgramParameter: (program: Program, parameter: number) => parameter === constants.LINK_STATUS ? true
      : parameter === constants.ACTIVE_UNIFORMS ? activeUniforms(program).length
        : parameter === constants.ACTIVE_ATTRIBUTES ? activeAttributes(program).length : 0,
    getActiveAttrib: (program: Program, index: number) => activeAttributes(program)[index],
    getAttribLocation: (_program: Program, name: string) => locations[name] ?? -1,
    getActiveUniform: (program: Program, index: number) => activeUniforms(program)[index],
    getUniformLocation: (_program: Program, name: string) => name, getUniformBlockIndex: () => constants.INVALID_INDEX,
    uniformMatrix4fv: (name: string, _transpose: boolean, values: Float32Array) => calls.matrices.push({ name, values: Array.from(values) }),
    uniform4fv: (name: string, values: Float32Array) => calls.vectors.push({ name, values: Array.from(values) }),
    vertexAttribPointer: (location: number) => {
      calls.pointers.push(location);
      if (activeVertexArray && activeArrayBuffer) {
        let attributes = vertexArrays.get(activeVertexArray);
        if (!attributes) vertexArrays.set(activeVertexArray, attributes = new Map());
        attributes.set(location, activeArrayBuffer);
      }
    },
    vertexAttribDivisor: (location: number, divisor: number) => calls.divisors.push({ location, divisor }),
    bufferSubData: (_target: number, _offset: number, data: ArrayBufferView) => {
      if (data instanceof Float32Array) {
        const copy = Array.from(data);
        calls.bufferUploads.push(copy);
        if (_target === constants.ARRAY_BUFFER && activeArrayBuffer) bufferContents.set(activeArrayBuffer, copy);
      }
    },
    texSubImage2D: (...args: unknown[]) => {
      const data = args[args.length - 1];
      if (data instanceof Float32Array) calls.rows.push(Array.from(data));
    },
    deleteTexture: (texture: unknown) => { calls.deletedTextures.push(texture); },
    drawElements: (_mode: number, _count: number, _type: number, offset: number) => { calls.ordinary.push(offset); captureDraw("ordinary"); },
    drawElementsInstanced: (_mode: number, _count: number, _type: number, offset: number) => { calls.ordinary.push(offset); captureDraw("ordinary"); },
    fenceSync: fencePresent ? () => { const fence: Fence = { status: calls.fenceDefault }; calls.fences.push(fence); return fence; } : undefined, flush: () => {},
    clientWaitSync: (fence: Fence) => fence.status === "signaled" ? constants.ALREADY_SIGNALED
      : fence.status === "pending" ? constants.TIMEOUT_EXPIRED : constants.WAIT_FAILED,
    deleteSync: () => {}
  };
  const gl = new Proxy(values, { get(target, key) {
    if (typeof key === "string" && key in target) return target[key];
    if (typeof key === "string" && /^[A-Z0-9_]+$/.test(key)) return 0x10000;
    return () => undefined;
  } });
  const canvas = { width: 8, height: 8, getContext: () => gl,
    addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name) } as unknown as HTMLCanvasElement;
  return { canvas, calls, loseContext: () => {
    contextLost = true;
    listeners.get("webglcontextlost")?.({ preventDefault() {} } as Event);
  } };
}

function submittedDrawData(renderer: Renderer) {
  const registry = (renderer.device as unknown as { readonly host: WebGL2DeviceHost }).host.textureRegistry;
  const entry = [...registry.textures.entries()].find(([texture]) => texture.label === "a3d-prd11-draw-data");
  if (!entry) throw new Error("The submitted draw-data texture was not registered");
  return { registry, texture: entry[0], handle: entry[1] };
}

async function setup(extension = true, fence = true) {
  registerBatchedDrawShader();
  const gl = webglCanvas(extension, fence);
  const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false,
    A3D_PARITY_BATCHING: true, A3D_QR_TIERS_BATCHING: true });
  const renderer = await Renderer.create({ backend: "webgl2", canvas: gl.canvas, width: 8, height: 8, qrFlags: flags });
  const firstGeometry = Geometry.triangle(), secondGeometry = Geometry.triangle();
  const material = new UnlitMaterial({ color: [0.5, 0.25, 0.75, 1] });
  const batch = batched.mesh({ maxInstances: 2, multiDraw: "multi-draw" });
  const first = batch.addInstance(batch.addGeometry(firstGeometry)), second = batch.addInstance(batch.addGeometry(secondGeometry));
  batch.setMatrixAt(first, translation(0)); batch.setMatrixAt(second, translation(2));
  batch.setColorAt(first, [0.25, 0.5, 0.75, 0.5]); batch.setColorAt(second, [0.75, 1, 0.5, 1]);
  const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), identity, material, undefined, undefined, false, "multi-draw");
  const render = (extra: Record<string, unknown> = {}) => renderer.render({ source: {
    renderItems: prepared.items, cameraPolicy: "identity", frustumCulling: false, cameraPosition: [0, 0, 6],
    shadow: { enabled: false }, ...extra
  } });
  return { gl, renderer, batch, prepared, render, dispose: () => {
    renderer.dispose(); prepared.release(); batch.dispose(); firstGeometry.dispose(); secondGeometry.dispose(); material.dispose();
  } };
}

async function setupCompiled(mode: "auto" | "multi-draw" | "loop", withUvs = false) {
  const gl = webglCanvas();
  const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false,
    A3D_QR_COMPILER: true, A3D_PARITY_BATCHING: true, A3D_QR_TIERS_BATCHING: true });
  const renderer = await Renderer.create({ backend: "webgl2", canvas: gl.canvas, width: 8, height: 8, qrFlags: flags });
  const batch = batched.mesh({ maxInstances: 2, multiDraw: mode, material: material.pbr({ color: "#a04080", metallic: 0.25 }) });
  const triangle = defineAuraCustomGeometry({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], indices: [0, 1, 2], ...(withUvs ? { uvs: [0, 0, 1, 0, 0, 1] } : {}) });
  const first = batch.addInstance(batch.addGeometry(triangle)), second = batch.addInstance(batch.addGeometry(triangle));
  // Rotate and apply nonuniform positive scale so the lit path must consume
  // the actual row transform for both positions and normals.
  batch.setMatrixAt(second, [0, 2, 0, 0, -3, 0, 0, 0, 0, 0, 4, 0, 0, 0, 2, 1]);
  batch.setColorAt(first, [0.25, 0.5, 0.75, 0.5]); batch.setColorAt(second, [0.75, 1, 0.5, 1]);
  const snapshot = scene().add(batch.runtime({ id: "compiled-combined" }).toJSON()).toJSON();
  const registry = createAuraRuntimeNodeRegistry(snapshot, { flags });
  const mount = { canvas: gl.canvas, flags, renderer, assets: null, strict: false, quality: { tier: "high" },
    degrade: () => undefined, runtimeNodes: registry, environmentLighting: () => ({ color: [0.2, 0.3, 0.4], intensity: 1 }),
    collectedLights: [], runtimeWarnings: new Set<string>() } as unknown as MountSceneCompileContext;
  const compiled = await realCompilerImpl.compile(snapshot, mount);
  const source = realCompilerImpl.update(compiled, snapshot, registry, 0) as RenderSource;
  const items: readonly RenderItem[] = [...(source.collectRenderItems?.() ?? source.renderItems ?? [])];
  const render = () => renderer.render({ source: { ...source, cameraPolicy: "identity", frustumCulling: false,
    cameraPosition: [0, 0, 6], shadow: { enabled: false }, postprocess: undefined } });
  return { gl, renderer, batch, compiled, registry, source, items, render, dispose: () => {
    renderer.dispose(); compiled.dispose(); registry.dispose(); batch.dispose();
  } };
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("renderer combined forward submission", () => {
  it.each(["auto", "multi-draw"] as const)("submits a compiled public %s PBR batch as one native call", async (mode) => {
    vi.useFakeTimers();
    const f = await setupCompiled(mode);
    try {
      expect(f.items).toHaveLength(2);
      expect(f.items.every(isEnginePackedBatchItem)).toBe(true);
      const packets = f.items.map((item) => packedLoopMemberFor(item)!);
      const pbr = packets[0]!.logicalMaterial;
      expect(pbr).toBeInstanceOf(InstancedPBRMaterial);
      expect(packets[1]!.logicalMaterial).toBe(pbr);
      for (const packet of packets) {
        expect(Array.from(packet.logicalItem.instanceTransforms!)).toEqual(identity);
        expect(Array.from(packet.logicalItem.instanceColors!)).toEqual(Array.from(packet.color));
      }
      const before = (pbr as InstancedPBRMaterial).getRevision();
      f.render();
      expect(f.gl.calls.ordinary).toEqual([]);
      expect(f.gl.calls.combined).toEqual([{ counts: [3, 3], offsets: [packets[1]!.packedRange.start * 2, packets[0]!.packedRange.start * 2], instances: [1, 1] }]);
      const rows = f.gl.calls.rows.find((data) => data.length === 48)!;
      expect([rows[14], rows[38]]).toEqual([2, 0]);
      expect(rows.slice(0, 16)).toEqual(Array.from(packets[1]!.modelMatrix));
      expect(rows.slice(24, 40)).toEqual(Array.from(packets[0]!.modelMatrix));
      expect(rows.slice(16, 20)).toEqual([0.75, 1, 0.5, 1]);
      expect(rows.slice(40, 44)).toEqual([0.25, 0.5, 0.75, 0.5]);
      expect(f.gl.calls.matrices.find((matrix) => matrix.name === "u_normalMatrix")?.values).toEqual(identity);
      expect((pbr as InstancedPBRMaterial).getRevision() - before).toBe(4);
      expect((pbr as InstancedPBRMaterial).getParameter("u_lightCount")).toBe(0);
      expect((pbr as InstancedPBRMaterial).getParameter("u_lightData")).toHaveLength(384);
      const draw = f.gl.calls.draws[0]!;
      expect(draw.kind).toBe("combined");
      const vertex = draw.vertex;
      expect(vertex).toContain("#define A3D_L5_MULTI_DRAW 1\n");
      expect(vertex).not.toContain("#define USE_INSTANCING 1\n");
      expect(vertex).not.toContain("#define USE_INSTANCING_COLOR 1\n");
      expect(draw.fragment).toContain("a3dBaseColor *= v_a3dL5DrawColor;");
      expect(draw.matrix).toBeUndefined();
      expect(draw.color).toBeUndefined();
      expect(f.gl.calls.pointers).toEqual(expect.arrayContaining([0, 1]));
      expect(f.gl.calls.pointers.some((location) => location >= 8 && location <= 12)).toBe(false);
      expect(f.gl.calls.divisors.some(({ divisor }) => divisor !== 0)).toBe(false);
      await vi.runAllTimersAsync();
    } finally { f.dispose(); }
  });

  it("preserves PBR light-parameter revisions on the logical fallback", async () => {
    const f = await setupCompiled("auto");
    const loop = await setupCompiled("loop");
    try {
      f.gl.calls.exposeLoopUniform = true;
      const pbr = packedLoopMemberFor(f.items[0])!.logicalMaterial as InstancedPBRMaterial;
      const loopMaterial = packedLoopMemberFor(loop.items[0])!.logicalMaterial as InstancedPBRMaterial;
      expect(pbr).toBeInstanceOf(InstancedPBRMaterial);
      expect(loopMaterial).toBeInstanceOf(InstancedPBRMaterial);
      const before = pbr.getRevision();
      const loopBefore = loopMaterial.getRevision();
      f.render();
      loop.render();
      expect(f.gl.calls.combined).toHaveLength(0);
      expect(f.gl.calls.ordinary).toHaveLength(2);
      expect(loop.gl.calls.ordinary).toHaveLength(2);
      expect(pbr.getRevision() - before).toBe(4);
      expect(pbr.getRevision() - before).toBe(loopMaterial.getRevision() - loopBefore);
      expect(pbr.getParameter("u_lightCount")).toBe(0);
      expect(pbr.getParameter("u_lightData")).toHaveLength(384);
      expect(pbr.getParameter("u_lightCount")).toEqual(loopMaterial.getParameter("u_lightCount"));
      expect(pbr.getParameter("u_lightData")).toEqual(loopMaterial.getParameter("u_lightData"));
      expect(loop.gl.calls.draws).toHaveLength(2);
      for (const draw of loop.gl.calls.draws) {
        expect(draw.kind).toBe("ordinary");
        expect(draw.vertex).toContain("#define USE_INSTANCING 1\n");
        expect(draw.vertex).toContain("#define USE_INSTANCING_COLOR 1\n");
        expect(draw.fragment).toContain("#define USE_INSTANCING_COLOR 1\n");
        expect(draw.fragment).toContain("a3dBaseColor *= v_instanceColor;");
        expect(draw.matrix).toEqual(identity);
      }
      expect(loop.gl.calls.draws.map(({ color }) => color)).toEqual([[0.75, 1, 0.5, 1], [0.25, 0.5, 0.75, 0.5]]);
      expect(loop.gl.calls.pointers).toEqual(expect.arrayContaining([0, 1, 8, 9, 10, 11, 12]));
      expect(loop.gl.calls.divisors.filter(({ divisor }) => divisor === 1).map(({ location }) => location))
        .toEqual(expect.arrayContaining([8, 9, 10, 11, 12]));
      expect(loop.gl.calls.bufferUploads).toContainEqual(identity);
      expect(loop.gl.calls.bufferUploads).toEqual(expect.arrayContaining([[0.25, 0.5, 0.75, 0.5], [0.75, 1, 0.5, 1]]));
      const loopPackets = loop.items.map((item) => packedLoopMemberFor(item)!);
      expect(loop.gl.calls.matrices.filter(({ name }) => name === "u_modelMatrix").map(({ values }) => values))
        .toEqual([Array.from(loopPackets[1]!.modelMatrix), Array.from(loopPackets[0]!.modelMatrix)]);
      expect(f.gl.calls.vectors.find(({ name }) => name === "u_baseColor")?.values)
        .toEqual(loop.gl.calls.vectors.find(({ name }) => name === "u_baseColor")?.values);
    } finally { f.dispose(); loop.dispose(); }
  });

  it("records only the first logical material update when a PBR native attempt throws", async () => {
    const f = await setupCompiled("auto");
    try {
      const pbr = packedLoopMemberFor(f.items[0])!.logicalMaterial as InstancedPBRMaterial;
      const before = pbr.getRevision();
      f.gl.calls.failCombined = true;
      expect(() => f.render()).toThrow("combined attempt failed");
      expect(f.gl.calls.combined).toHaveLength(1);
      expect(f.gl.calls.ordinary).toHaveLength(0);
      expect(pbr.getRevision() - before).toBe(2);
      expect(pbr.getParameter("u_lightCount")).toBe(0);
    } finally { f.dispose(); }
  });

  it("falls back if a combined program unexpectedly reflects an instance attribute", async () => {
    const f = await setupCompiled("auto");
    try {
      f.gl.calls.exposeInstanceAttribute = true;
      f.render();
      expect(f.gl.calls.combined).toHaveLength(0);
      expect(f.gl.calls.ordinary).toHaveLength(2);
    } finally { f.dispose(); }
  });

  it("keeps a live textured PBR material on logical draws", async () => {
    const f = await setupCompiled("auto", true);
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 128, 64, 255]) });
    try {
      const pbr = packedLoopMemberFor(f.items[0])!.logicalMaterial as InstancedPBRMaterial;
      pbr.setParameter("u_baseColorTexture", new TextureBinding({ name: "u_baseColorTexture", texture }));
      f.render();
      expect(f.gl.calls.shaders.some((source) => source.includes("#define USE_BASE_COLOR_MAP 1\n"))).toBe(true);
      expect(f.gl.calls.combined).toHaveLength(0);
      expect(f.gl.calls.ordinary).toHaveLength(2);
    } finally { f.dispose(); texture.dispose(); }
  });

  it("keeps a custom normal matrix on logical PBR draws", async () => {
    const f = await setupCompiled("auto");
    try {
      const first = packedLoopMemberFor(f.items[0])!.logicalItem;
      Object.assign(first, { normalMatrix: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] });
      f.render();
      expect(f.gl.calls.combined).toHaveLength(0);
      expect(f.gl.calls.ordinary).toHaveLength(2);
    } finally { f.dispose(); }
  });

  it("submits one ordered native call with distinct per-member rows", async () => {
    vi.useFakeTimers();
    const f = await setup();
    try {
      f.gl.calls.fenceDefault = "pending";
      f.render();
      const packets = f.prepared.items.map((item) => packedLoopMemberFor(item)!);
      expect(f.gl.calls.ordinary).toEqual([]);
      expect(f.gl.calls.combined).toEqual([{ counts: [3, 3], offsets: [packets[1]!.packedRange.start * 2, packets[0]!.packedRange.start * 2], instances: [1, 1] }]);
      const rows = f.gl.calls.rows.find((data) => data.length === 48)!;
      expect(rows).toBeDefined();
      expect([rows[14], rows[38]]).toEqual([2, 0]);
      expect(rows.slice(16, 20)).toEqual([0.75, 1, 0.5, 1]);
      expect(rows.slice(40, 44)).toEqual([0.25, 0.5, 0.75, 0.5]);
      const resource = submittedDrawData(f.renderer);
      const bytes = textureBudgetReport(f.renderer.device).textureBytes;
      expect(bytes).toBeGreaterThanOrEqual(resource.texture.byteLength);
      expect(resource.texture.disposed).toBe(false);
      expect(f.gl.calls.fences).toHaveLength(1);
      expect(f.gl.calls.deletedTextures).toEqual([]);
      await vi.advanceTimersByTimeAsync(0);
      expect(resource.texture.disposed).toBe(false);
      expect(f.gl.calls.fences).toHaveLength(1);
      expect(f.gl.calls.deletedTextures).toEqual([]);

      // The frame fence releases the logical texture. Its dispose subscriber
      // must synchronously schedule a second fence without a later bind or
      // diagnostics sweep, retaining the native name and budget in the meantime.
      f.gl.calls.fences[0]!.status = "signaled";
      await vi.advanceTimersByTimeAsync(8);
      expect(resource.texture.disposed).toBe(true);
      expect(resource.registry.textures.has(resource.texture)).toBe(false);
      expect(f.gl.calls.fences).toHaveLength(2);
      expect(f.gl.calls.deletedTextures).toEqual([]);
      expect(textureBudgetReport(f.renderer.device).textureBytes).toBe(bytes);
      await vi.advanceTimersByTimeAsync(8);
      expect(f.gl.calls.deletedTextures).toEqual([]);
      f.gl.calls.fences[1]!.status = "signaled";
      await vi.advanceTimersByTimeAsync(8);
      expect(f.gl.calls.deletedTextures.filter((handle) => handle === resource.handle)).toHaveLength(1);
      expect(textureBudgetReport(f.renderer.device).textureBytes).toBe(bytes - resource.texture.byteLength);
      await vi.advanceTimersByTimeAsync(32);
      expect(f.gl.calls.fences).toHaveLength(2);
      expect(f.gl.calls.deletedTextures.filter((handle) => handle === resource.handle)).toHaveLength(1);
    } finally { f.dispose(); }
  });

  it("retains draw data after a failed frame fence until context loss", async () => {
    vi.useFakeTimers();
    const f = await setup();
    try {
      f.gl.calls.fenceDefault = "pending";
      f.render();
      const resource = submittedDrawData(f.renderer);
      const bytes = textureBudgetReport(f.renderer.device).textureBytes;
      expect(bytes).toBeGreaterThanOrEqual(resource.texture.byteLength);
      expect(f.gl.calls.fences).toHaveLength(1);
      f.gl.calls.fences[0]!.status = "failed";
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(32);
      expect(resource.texture.disposed).toBe(false);
      expect(resource.registry.textures.get(resource.texture)).toBe(resource.handle);
      expect(f.gl.calls.fences).toHaveLength(1);
      expect(f.gl.calls.deletedTextures).not.toContain(resource.handle);
      expect(textureBudgetReport(f.renderer.device).textureBytes).toBe(bytes);
      f.gl.loseContext();
      expect(resource.texture.disposed).toBe(true);
      expect(resource.registry.textures.has(resource.texture)).toBe(false);
      expect(textureBudgetReport(f.renderer.device).textureBytes).toBe(0);
      await vi.advanceTimersByTimeAsync(32);
      expect(f.gl.calls.fences).toHaveLength(1);
      expect(f.gl.calls.deletedTextures).not.toContain(resource.handle);
    } finally { f.dispose(); }
  });

  it("retains failed native retirement until context loss without deleting an invalid handle", async () => {
    vi.useFakeTimers();
    const f = await setup();
    try {
      f.gl.calls.fenceDefault = "pending";
      f.render();
      const resource = submittedDrawData(f.renderer);
      const bytes = textureBudgetReport(f.renderer.device).textureBytes;
      expect(bytes).toBeGreaterThanOrEqual(resource.texture.byteLength);
      expect(f.gl.calls.fences).toHaveLength(1);
      f.gl.calls.fences[0]!.status = "signaled";
      await vi.advanceTimersByTimeAsync(0);
      expect(resource.texture.disposed).toBe(true);
      expect(resource.registry.textures.has(resource.texture)).toBe(false);
      expect(f.gl.calls.fences).toHaveLength(2);
      f.gl.calls.fences[1]!.status = "failed";
      await vi.advanceTimersByTimeAsync(8);
      expect(f.gl.calls.deletedTextures).not.toContain(resource.handle);
      expect(textureBudgetReport(f.renderer.device).textureBytes).toBe(bytes);
      f.gl.loseContext();
      expect(textureBudgetReport(f.renderer.device).textureBytes).toBe(0);
      await vi.advanceTimersByTimeAsync(32);
      expect(f.gl.calls.fences).toHaveLength(2);
      expect(f.gl.calls.deletedTextures).not.toContain(resource.handle);
    } finally { f.dispose(); }
  });

  it.each([[false, true], [true, false]] as const)("keeps logical draws when extension=%s fence=%s", async (extension, fence) => {
    const f = await setup(extension, fence);
    try {
      f.render();
      expect(f.gl.calls.combined).toHaveLength(0);
      expect(f.gl.calls.ordinary).toHaveLength(2);
    } finally { f.dispose(); }
  });

  it("runs per-member clipping callbacks and ordinary draws in order", async () => {
    const f = await setup();
    const seen: unknown[] = [];
    try {
      f.render({ materialClippingFor: (item: unknown) => { seen.push(item); return undefined; } });
      expect(f.gl.calls.combined).toHaveLength(0);
      expect(f.gl.calls.ordinary).toHaveLength(2);
      expect(seen).toHaveLength(2);
    } finally { f.dispose(); }
  });

  it("does not replay members when the native extension throws after entry", async () => {
    const f = await setup();
    f.gl.calls.failCombined = true;
    try {
      expect(() => f.render()).toThrow("combined attempt failed");
      expect(f.gl.calls.combined).toHaveLength(1);
      expect(f.gl.calls.ordinary).toHaveLength(0);
    } finally { f.dispose(); }
  });
});
