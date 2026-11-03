import { describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { batched, batchedNodeHandler, registerBatchedDrawShader } from "../../../packages/engine/src/agent-api/nodes/batched";
import type { AuraBatchedMeshMode } from "../../../packages/engine/src/agent-api/nodes/batched";
import { instancedMesh } from "../../../packages/engine/src/agent-api/nodes/instancedMesh";
import { clipping } from "../../../packages/engine/src/agent-api/nodes/clipping";
import { material } from "../../../packages/engine/src/agent-api/nodes/material";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { inheritCompiledBatchFrame, realCompilerImpl, retainCompiledBatchFrame, type MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { defineAuraCustomGeometry } from "../../../packages/engine/src/agent-api/RootGeometry";
import { raycast } from "../../../packages/engine/src/agent-api/SceneQueries";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { DepthPass, ForwardPass, MockRenderDevice, Renderer } from "../../../packages/rendering/src";
import { isEngineBatchInstanceItem, isEnginePackedBatchItem, packedLoopMemberFor, packedLoopProducerMemberCurrent } from "../../../packages/rendering/src/batching/BatchMembers";
import { DrawDataTexture, packDrawDataFlags } from "../../../packages/rendering/src/batching/DrawDataTexture";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { RenderItem, RenderSource } from "@aura3d/rendering";

const triangle = defineAuraCustomGeometry({ positions: [0, 0, 0, 2, 0, 0, 0, 2, 0], indices: [0, 1, 2] });
const translated = (z: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1];
const ray = { origin: [0.5, 0.5, 5] as const, direction: [0, 0, -1] as const };

function sourceItems(value: unknown): readonly RenderItem[] {
  const source = value as RenderSource;
  return [...(source.collectRenderItems?.() ?? source.renderItems ?? [])];
}

async function compileBatch(group?: ReturnType<typeof clipping.material>, global?: ReturnType<typeof clipping.global>, mode: AuraBatchedMeshMode = "multi-draw", renderer?: Renderer) {
  const batch = batched.mesh({ maxInstances: 3, name: "clipped", multiDraw: mode, material: group ? material.pbr({ clipping: group }) : material.pbr() });
  const firstGeometry = batch.addGeometry(triangle), secondGeometry = batch.addGeometry(triangle);
  const first = batch.addInstance(firstGeometry), second = batch.addInstance(secondGeometry);
  batch.setMatrixAt(second, translated(2));
  const node = batch.runtime({ id: "clipped" }).toJSON();
  const snapshot = scene(global ? { clipping: global } : undefined).add(node).toJSON();
  const flags = resolveQrFlags({ options: "parity.batching,tiers.batching,core,compiler" });
  const registry = createAuraRuntimeNodeRegistry(snapshot, { flags });
  const mount = {
    canvas: { width: 64, height: 64 }, flags, renderer: renderer ?? null, assets: null, strict: false, quality: { tier: "high" },
    degrade: () => undefined, runtimeNodes: registry,
    environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }), collectedLights: [], runtimeWarnings: new Set<string>()
  } as unknown as MountSceneCompileContext;
  const compiled = await realCompilerImpl.compile(snapshot, mount);
  const frame = () => realCompilerImpl.update(compiled, snapshot, registry, 0) as RenderSource;
  return { batch, firstGeometry, secondGeometry, first, second, registry, compiled, frame, snapshot };
}

/** A real device with an in-memory GL context that exposes extension and fence APIs. */
async function combinedRenderer(): Promise<Renderer> {
  const constants: Record<string, number> = { NO_ERROR: 0, SYNC_GPU_COMMANDS_COMPLETE: 0x9117, ALREADY_SIGNALED: 0x911a,
    TIMEOUT_EXPIRED: 0x911b, CONDITION_SATISFIED: 0x911c, WAIT_FAILED: 0x911d };
  const values: Record<string, unknown> = { ...constants, getError: () => 0, getParameter: () => 4096, isContextLost: () => false,
    getExtension: (name: string) => name === "WEBGL_multi_draw" ? { multiDrawElementsInstancedWEBGL() {} } : null,
    fenceSync: () => ({}), flush() {}, clientWaitSync: () => constants.ALREADY_SIGNALED, deleteSync() {} };
  const gl = new Proxy(values, { get(target, key) {
    if (typeof key === "string" && key in target) return target[key];
    if (typeof key === "string" && /^[A-Z0-9_]+$/.test(key)) return 0x10000;
    return () => undefined;
  } });
  const canvas = { width: 64, height: 64, getContext: () => gl, addEventListener() {}, removeEventListener() {} } as unknown as HTMLCanvasElement;
  return Renderer.create({ backend: "webgl2", canvas, width: 64, height: 64 });
}

describe("batched material clipping", () => {
  it("renders a compiled public loop from its shared packed geometry", async () => {
    const f = await compileBatch(undefined, undefined, "loop");
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false,
      A3D_PARITY_BATCHING: true, A3D_QR_TIERS_BATCHING: true });
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    try {
      f.batch.setColorAt(f.first, [0.25, 0.5, 0.75, 0.5]);
      f.batch.state.geometries[f.secondGeometry]!.drawRange = { start: 1, count: Infinity };
      const source = f.frame();
      const items = sourceItems(source);
      const packets = items.map((item) => packedLoopMemberFor(item)!);
      expect(items).toHaveLength(2);
      expect(items.every(packedLoopProducerMemberCurrent)).toBe(true);
      expect(items.map((item) => item.modelMatrix?.[14])).toEqual([0, 2]);
      expect(Array.from(items[0]!.instanceColors!)).toEqual([0.25, 0.5, 0.75, 0.5]);
      expect(packets[1]!.sourceRange).toEqual({ start: 1, count: 2 });
      expect(packets[0]!.lease).toBe(packets[1]!.lease);
      const configured = { ...source, cameraPolicy: "identity" as const, frustumCulling: false,
        cameraPosition: [0, 0, 6] as const, shadow: { enabled: false }, postprocess: undefined };
      renderer.render(configured);
      const draws = (renderer.device as MockRenderDevice).drawCommands;
      expect(draws).toHaveLength(2);
      // The opaque queue is front-to-back: the member at z=2 is closer to
      // this camera. Tie each submitted model to its own translated slice.
      expect(draws.map((draw) => [
        (draw.uniforms?.get("u_modelMatrix") as Float32Array)[14], draw.firstIndex ?? 0, draw.indexCount
      ])).toEqual([packets[1]!, packets[0]!].map((packet) => [
        packet.modelMatrix[14], packet.packedRange.start, packet.packedRange.count
      ]));
      expect(draws.every((draw) => draw.vertexBuffer === packets[0]!.packedGeometry.vertexBuffer.uploadedBuffer)).toBe(true);
      expect(items.every((item) => item.geometry.vertexBuffer.uploadedBuffer === null)).toBe(true);
    } finally { renderer.dispose(); f.compiled.dispose(); f.registry.dispose(); f.batch.dispose(); }
  });

  it("retains an in-flight compiled loop across replacement and releases it once", async () => {
    const f = await compileBatch(undefined, undefined, "loop");
    let release = () => {};
    try {
      const source = f.frame();
      const copied = { ...source };
      inheritCompiledBatchFrame(source, copied);
      const firstLease = packedLoopMemberFor(sourceItems(source)[0])!.lease;
      release = retainCompiledBatchFrame(copied);
      const next = f.frame();
      const secondLease = packedLoopMemberFor(sourceItems(next)[0])!.lease;
      expect(firstLease.isCurrent()).toBe(true);
      expect(secondLease.isCurrent()).toBe(true);
      release(); release();
      expect(firstLease.isCurrent()).toBe(false);
      const holdNext = retainCompiledBatchFrame(next);
      f.compiled.dispose();
      expect(secondLease.isCurrent()).toBe(true);
      holdNext();
      expect(secondLease.isCurrent()).toBe(false);
    } finally { release(); f.compiled.dispose(); f.registry.dispose(); f.batch.dispose(); }
  });

  it("cleans every compiled batch lease if one generation disposal fails", async () => {
    const first = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    const second = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    first.addInstance(first.addGeometry(triangle)); first.addGeometry(triangle);
    second.addInstance(second.addGeometry(triangle)); second.addGeometry(triangle);
    const snapshot = scene().add(first.runtime({ id: "cleanup-first" }).toJSON())
      .add(second.runtime({ id: "cleanup-second" }).toJSON()).toJSON();
    const flags = resolveQrFlags({ options: "parity.batching,tiers.batching,core,compiler" });
    const registry = createAuraRuntimeNodeRegistry(snapshot, { flags });
    const mount = { canvas: { width: 8, height: 8 }, flags, renderer: null, assets: null, strict: false,
      quality: { tier: "high" }, degrade: () => undefined, runtimeNodes: registry,
      environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }), collectedLights: [], runtimeWarnings: new Set<string>()
    } as unknown as MountSceneCompileContext;
    const compiled = await realCompilerImpl.compile(snapshot, mount);
    let restoreFirst = () => {};
    try {
      const source = realCompilerImpl.update(compiled, snapshot, registry, 0) as RenderSource;
      const packets = sourceItems(source).map((item) => packedLoopMemberFor(item)!);
      expect(packets).toHaveLength(2);
      first.dispose(); second.dispose();
      const failure = new Error("first compiled generation disposal failed");
      const dispose = vi.spyOn(packets[0]!.packedGeometry, "dispose").mockImplementation(() => { throw failure; });
      restoreFirst = () => { dispose.mockRestore(); packets[0]!.packedGeometry.dispose(); };
      let thrown: unknown;
      try { compiled.dispose(); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(AggregateError);
      const batchFailure = (thrown as AggregateError).errors[0] as AggregateError;
      const poolFailure = batchFailure.errors[0] as AggregateError;
      expect(poolFailure.errors).toContain(failure);
      expect(() => packets[1]!.packedGeometry.vertexBuffer.readBytes()).toThrow(/disposed/i);
    } finally { restoreFirst(); compiled.dispose(); registry.dispose(); first.dispose(); second.dispose(); }
  });

  it("rejects per-member clipping callbacks for fallback batches before callbacks or submissions", async () => {
    const f = await compileBatch();
    const device = new MockRenderDevice();
    const flags = resolveQrFlags({ options: "parity.batching,tiers.batching,core" });
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    let calls = 0;
    const materialClippingFor = () => { calls += 1; return undefined; };
    try {
      const extra = f.batch.addInstance(f.firstGeometry);
      f.batch.setMatrixAt(extra, translated(1));
      const source = f.frame();
      const items = sourceItems(source);
      expect(items).toHaveLength(2);
      expect(items.every(isEngineBatchInstanceItem)).toBe(true);
      expect(items.some((item) => item.instanceTransforms?.length === 32)).toBe(true);
      const proxy = new Proxy(items[0]!, { get() { throw new Error("identity check inspected a property"); } });
      expect(isEngineBatchInstanceItem(proxy)).toBe(false);
      // An ordinary earlier draw must not escape before the unsupported batch.
      const mixed = [{ ...items[0]! }, ...items];
      expect(isEngineBatchInstanceItem(mixed[0])).toBe(false);
      device.beginFrame(64, 64);
      expect(() => new ForwardPass({ items: mixed, materialClippingFor }).execute({ device, width: 64, height: 64 }))
        .toThrow(/materialClippingFor.*unavailable/);
      expect(() => new DepthPass({ casters: mixed, materialClippingFor }).execute({ device, width: 64, height: 64 }))
        .toThrow(/materialClippingFor.*unavailable/);
      const configured = { ...source, collectRenderItems: () => mixed, cameraPolicy: "identity" as const,
        frustumCulling: false, postprocess: undefined, materialClippingFor };
      expect(() => renderer.render(configured)).toThrow(/materialClippingFor.*unavailable/);
      expect(calls).toBe(0);
      expect(device.drawCommands).toHaveLength(0);
      expect((renderer.device as MockRenderDevice).drawCommands).toHaveLength(0);
    } finally { renderer.dispose(); f.compiled.dispose(); f.registry.dispose(); f.batch.dispose(); device.dispose(); }
  });

  it("keeps material clipping callbacks for ordinary instances.mesh", () => {
    const local = clipping.material({ planes: [[1, 0, 0, 0]], clipShadows: true });
    const mesh = instancedMesh(triangle, material.pbr(), 2);
    const device = new MockRenderDevice();
    const items: RenderItem[] = [];
    let calls = 0;
    const materialClippingFor = () => { calls += 1; return local; };
    const flags = resolveQrFlags({ options: "parity.batching,tiers.batching,core" });
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    try {
      const out = { addItems: (next: readonly RenderItem[]) => items.push(...next), set() {}, feature() {} } as never;
      batchedNodeHandler.update!(mesh.toJSON() as never, undefined, { flags } as never, out, 0);
      expect(items).toHaveLength(1);
      expect(isEngineBatchInstanceItem(items[0])).toBe(false);
      device.beginFrame(64, 64);
      new ForwardPass({ items, materialClippingFor }).execute({ device, width: 64, height: 64 });
      new DepthPass({ casters: items, materialClippingFor, clippingPass: "shadow" }).execute({ device, width: 64, height: 64 });
      expect(calls).toBe(2);
      expect(device.drawCommands).toHaveLength(2);
      expect(device.drawCommands.every((draw) => draw.uniforms?.get("u_a3dClipGroupCount") === 1)).toBe(true);
    } finally { mesh.dispose(); local.dispose(); device.dispose(); }
  });

  it.each(["auto", "multi-draw", "loop"] as const)("renders %s batches with the requested logical semantics", async (mode) => {
    const f = await compileBatch(undefined, undefined, mode);
    const device = new MockRenderDevice();
    const flags = resolveQrFlags({ options: "parity.batching,tiers.batching,core,compiler" });
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_PARITY_BATCHING: true, A3D_QR_TIERS_BATCHING: true }), device);
    try {
      const fields = new Map<string, unknown>();
      const out = { addItems() {}, set: (key: string, value: unknown) => fields.set(key, value), feature() {} } as never;
      batchedNodeHandler.compile(f.batch.toJSON() as never, { flags } as never, out);
      expect(fields.get("parityBatched")).toMatchObject({ mode: "instanced", fallbackReason: "packed-execution-unavailable", instances: 2, draws: 2 });
      const source = f.frame();
      const items = sourceItems(source);
      expect(items).toHaveLength(2);
      expect(items.every((item) => !isEnginePackedBatchItem(item) && !("multiDraw" in item))).toBe(true);
      if (mode === "loop") {
        expect(items.map((item) => item.modelMatrix?.[14])).toEqual([0, 2]);
        expect(items.every((item) => item.instanceTransforms?.length === 16)).toBe(true);
      } else {
        expect(items.map((item) => item.instanceTransforms?.[14])).toEqual([0, 2]);
      }
      device.beginFrame(64, 64);
      new ForwardPass({ items }).execute({ device, width: 64, height: 64 });
      new DepthPass({ casters: items }).execute({ device, width: 64, height: 64 });
      expect(device.drawCommands).toHaveLength(4);
      const configured = { ...source, cameraPolicy: "identity" as const, frustumCulling: false, postprocess: undefined };
      expect(renderer.render(configured).drawCalls).toBeGreaterThanOrEqual(2);
      expect(raycast(ray, { nodes: [f.batch.toJSON()], mode: "mesh" }).map((hit) => hit.batchMemberId)).toEqual([f.second, f.first]);
      f.batch.setVisibleAt(f.second, false);
      expect(sourceItems(f.frame())).toHaveLength(1);
      expect(raycast(ray, { nodes: [f.batch.toJSON()], mode: "mesh" }).map((hit) => hit.batchMemberId)).toEqual([f.first]);
      f.batch.dispose();
      expect(sourceItems(f.frame())).toHaveLength(0);
      expect(raycast(ray, { nodes: [f.batch.toJSON()], mode: "mesh" })).toEqual([]);
    } finally { renderer.dispose(); f.compiled.dispose(); f.registry.dispose(); f.batch.dispose(); device.dispose(); }
  });

  it("decodes numeric draw-data visibility flags in the generated batch shader", () => {
    registerBatchedDrawShader();
    const flags = createTrustedQrFlags({ A3D_PARITY_BATCHING: true });
    const program = generateProgramImpl(normalizeProgramFeatures({
      pass: "forward", lighting: "unlit", features: { "parity.batchDraw": "loop" }
    }), { flags });
    expect(program.vertex).toContain("(uint(a3dL5Meta.w + 0.5) & 1u) == 0u");
    expect(program.vertex).not.toContain("floatBitsToUint(a3dL5Meta.w)");

    // Hidden engine members are filtered before submission, so exercise both
    // flag states directly through the same float texture row representation.
    const rows = new DrawDataTexture(4);
    const cases = [[true, 0], [false, 0], [true, 7], [false, 7]] as const;
    try {
      cases.forEach(([visible, geometryId], index) => rows.setDraw(index, {
        model: translated(0), meta: [0, 0, 3, packDrawDataFlags(visible, geometryId)]
      }));
      expect(cases.map((_, index) => rows.drawTexels(index)[23]! >>> 1)).toEqual(cases.map(([, geometryId]) => geometryId));
      expect(cases.map((_, index) => (Math.trunc(rows.drawTexels(index)[23]! + 0.5) & 1) !== 0)).toEqual(cases.map(([visible]) => visible));
      if (spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0) {
        const dir = mkdtempSync(join(tmpdir(), "aura3d-batch-visibility-"));
        try {
          const vertex = join(dir, "source.vert"), fragment = join(dir, "source.frag");
          writeFileSync(vertex, program.vertex); writeFileSync(fragment, program.fragment);
          const linked = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
          expect(linked).toContain("u_a3dDrawData");
        } finally { rmSync(dir, { recursive: true, force: true }); }
      }
    } finally { rows.dispose(); }
  });

  it("marks compiled packed item identities without inspecting their properties", async () => {
    const group = clipping.material({ planes: [[1, 0, 0, 0]] });
    const capable = await combinedRenderer();
    const f = await compileBatch(undefined, undefined, "multi-draw", capable);
    try {
      const packed = sourceItems(f.frame());
      expect(packed).toHaveLength(2);
      expect(packed.map(isEnginePackedBatchItem)).toEqual([true, true]);
      expect(isEnginePackedBatchItem({ ...packed[0]! })).toBe(false);
      const proxy = new Proxy(packed[0]!, {
        get() { throw new Error("identity check inspected a property"); },
        getPrototypeOf() { throw new Error("identity check inspected a prototype"); },
        ownKeys() { throw new Error("identity check enumerated properties"); }
      });
      expect(isEnginePackedBatchItem(proxy)).toBe(false);

      f.registry.require("clipped").setMaterial(material.pbr({ clipping: group }));
      const instanced = sourceItems(f.frame());
      expect(instanced).toHaveLength(2);
      expect(instanced.map(isEnginePackedBatchItem)).toEqual([false, false]);
      f.registry.require("clipped").setMaterial(material.pbr());
      expect(sourceItems(f.frame()).map(isEnginePackedBatchItem)).toEqual([true, true]);
      expect(raycast(ray, { nodes: [f.batch.toJSON()], mode: "mesh" }).map((hit) => hit.batchMemberId)).toEqual([f.second, f.first]);
    } finally {
      f.compiled.dispose(); f.registry.dispose(); f.batch.dispose(); group.dispose(); capable.dispose();
    }
  });

  it.each(["auto", "multi-draw"] as const)("keeps recoverable source members for %s on a capable device", async (mode) => {
    const capable = await combinedRenderer();
    const f = await compileBatch(undefined, undefined, mode, capable);
    try {
      const items = sourceItems(f.frame());
      expect(items).toHaveLength(2);
      expect(items.every(isEnginePackedBatchItem)).toBe(true);
      expect(items.every((item) => "multiDraw" in item)).toBe(true);
      expect(items.every((item) => packedLoopProducerMemberCurrent(item))).toBe(true);
    } finally { f.compiled.dispose(); f.registry.dispose(); f.batch.dispose(); capable.dispose(); }
  });

  it("passes a live local group through compiled, instanced items without changing member identities", async () => {
    const local = clipping.material({ planes: [[1, 0, 0, -0.25]], space: "local", combine: "union", clipShadows: true });
    const global = clipping.global({ planes: [[0, 1, 0, -0.5]], clipShadows: true });
    const f = await compileBatch(local, global);
    try {
      const source = f.frame();
      const items = sourceItems(source);
      expect(items).toHaveLength(2);
      expect(source.globalClipping).toBe(global);
      expect(items.every((item) => item.materialClipping === local)).toBe(true);
      expect(items.every((item) => item.instanceTransforms?.length === 16 && !("multiDraw" in item))).toBe(true);
      expect(items.map((item) => item.instanceTransforms![14])).toEqual([0, 2]);
      expect(raycast(ray, { nodes: [f.batch.toJSON()], mode: "mesh" }).map((hit) => hit.batchMemberId)).toEqual([f.second, f.first]);

      local.update({ planes: [[1, 0, 0, -0.75]] });
      expect(sourceItems(f.frame()).every((item) => item.materialClipping === local && item.materialClipping.planes[0]![3] === -0.75)).toBe(true);
      // Raycasts are geometric: the queried x=0.5 point is removed by the
      // current local clip plane, but still reports both stable member IDs.
      expect(raycast(ray, { nodes: [f.batch.toJSON()], mode: "mesh" }).map((hit) => hit.batchMemberId)).toEqual([f.second, f.first]);
      f.batch.setVisibleAt(f.second, false);
      expect(raycast(ray, { nodes: [f.batch.toJSON()], mode: "mesh" }).map((hit) => hit.batchMemberId)).toEqual([f.first]);
      expect(sourceItems(f.frame())).toHaveLength(1);
      f.batch.dispose();
      expect(sourceItems(f.frame())).toHaveLength(0);
      expect(raycast(ray, { nodes: [f.batch.toJSON()], mode: "mesh" })).toEqual([]);
      expect(local.disposed).toBe(false);
    } finally {
      f.compiled.dispose(); f.registry.dispose(); f.batch.dispose(); local.dispose(); global.dispose();
    }
  });

  it("binds material and global clipping to mock forward and shadow submissions", async () => {
    const local = clipping.material({ planes: [[1, 0, 0, -0.25]], space: "local", clipShadows: true });
    const global = clipping.global({ planes: [[0, 1, 0, -0.5]], clipShadows: true });
    const f = await compileBatch(local, global);
    const device = new MockRenderDevice();
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    try {
      const source = f.frame();
      const items = sourceItems(source);
      device.beginFrame(64, 64);
      new ForwardPass({ items, globalClipping: source.globalClipping }).execute({ device, width: 64, height: 64 });
      new DepthPass({ casters: items, globalClipping: source.globalClipping, clippingPass: "shadow" }).execute({ device, width: 64, height: 64 });
      expect(device.drawCommands).toHaveLength(4);
      for (const draw of device.drawCommands) {
        expect(draw.uniforms?.get("u_a3dClipGroupCount")).toBe(2);
        expect(Array.from((draw.uniforms!.get("u_a3dClipPlanes") as Float32Array).slice(0, 8)))
          .toEqual([0, 1, 0, -0.5, 1, 0, 0, -0.25]);
        expect(Array.from(draw.uniforms!.get("u_a3dClipGroups") as Float32Array)).toEqual([0, 1, 0, 0, 1, 1, 0, 1]);
      }
    } finally {
      f.compiled.dispose(); f.registry.dispose(); f.batch.dispose(); local.dispose(); global.dispose(); device.dispose();
    }
  });

  it("reads material replacement and group disposal from the live runtime handle", async () => {
    const original = clipping.material({ planes: [[1, 0, 0, 0]], space: "local" });
    const replacement = clipping.material({ planes: [[0, 1, 0, -0.5]], clipShadows: true });
    const capable = await combinedRenderer();
    const f = await compileBatch(original, undefined, "multi-draw", capable);
    try {
      expect(sourceItems(f.frame()).every((item) => item.materialClipping === original)).toBe(true);
      f.registry.require("clipped").setMaterial(material.pbr({ clipping: replacement }));
      const changed = sourceItems(f.frame());
      expect(changed.every((item) => item.materialClipping === replacement && !("multiDraw" in item))).toBe(true);
      replacement.dispose();
      expect(sourceItems(f.frame()).every((item) => item.materialClipping === replacement && !item.materialClipping.enabled)).toBe(true);
      expect(original.disposed).toBe(false);
      f.registry.require("clipped").setMaterial(material.pbr());
      expect(sourceItems(f.frame()).every((item) => item.materialClipping === undefined && "multiDraw" in item)).toBe(true);
    } finally {
      f.compiled.dispose(); f.registry.dispose(); f.batch.dispose(); original.dispose(); replacement.dispose(); capable.dispose();
    }
  });

  it("retains instance IDs and clipping for instances.mesh draws", () => {
    const local = clipping.material({ planes: [[1, 0, 0, 0]], space: "local" });
    const mesh = instancedMesh(triangle, material.pbr({ clipping: local }), 2);
    const node = mesh.toJSON();
    const flags = resolveQrFlags({ options: "parity.batching,tiers.batching,core" });
    const items: RenderItem[] = [];
    const out = { addItems: (next: readonly RenderItem[]) => items.push(...next), set() {}, feature() {} } as never;
    try {
      mesh.setMatrixAt(1, translated(2));
      batchedNodeHandler.update!(node as never, undefined, { flags } as never, out, 0);
      expect(items).toHaveLength(1);
      expect(items[0]!.materialClipping).toBe(local);
      expect(items[0]!.instanceTransforms).toHaveLength(32);
      expect(raycast(ray, { nodes: [node], mode: "mesh" }).map((hit) => hit.instanceId)).toEqual([1, 0]);
      mesh.setVisibleAt(0, false);
      expect(raycast(ray, { nodes: [node], mode: "mesh" }).map((hit) => hit.instanceId)).toEqual([1]);
      mesh.dispose();
      expect(raycast(ray, { nodes: [node], mode: "mesh" })).toEqual([]);
      expect(local.disposed).toBe(false);
    } finally { mesh.dispose(); local.dispose(); }
  });

  it("uses the safe instance route for a live scene-wide group and returns to packed drawing when it is removed", async () => {
    const global = clipping.global({ planes: [[0, 1, 0, -0.5]], clipShadows: true });
    const capable = await combinedRenderer();
    const f = await compileBatch(undefined, global, "multi-draw", capable);
    const device = new MockRenderDevice();
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    try {
      const source = f.frame();
      const items = sourceItems(source);
      expect(items).toHaveLength(2);
      expect(items.every((item) => item.instanceTransforms?.length === 16 && !("multiDraw" in item))).toBe(true);
      device.beginFrame(64, 64);
      new ForwardPass({ items, globalClipping: source.globalClipping }).execute({ device, width: 64, height: 64 });
      new DepthPass({ casters: items, globalClipping: source.globalClipping, clippingPass: "shadow" }).execute({ device, width: 64, height: 64 });
      expect(device.drawCommands).toHaveLength(4);
      for (const draw of device.drawCommands) {
        expect(draw.uniforms?.get("u_a3dClipGroupCount")).toBe(1);
        expect(Array.from((draw.uniforms!.get("u_a3dClipPlanes") as Float32Array).slice(0, 4))).toEqual([0, 1, 0, -0.5]);
      }
      global.setEnabled(false);
      expect(sourceItems(f.frame()).every((item) => !("multiDraw" in item))).toBe(true);
      global.update({ enabled: true, planes: [[0, 1, 0, -1]] });
      expect((f.frame().globalClipping?.planes[0] ?? [])[3]).toBe(-1);
      expect(raycast(ray, { nodes: [f.batch.toJSON()], mode: "mesh" }).map((hit) => hit.batchMemberId)).toEqual([f.second, f.first]);

      // A subtree added after compilation inherits the same per-scene route.
      f.registry.attachCompiled(f.compiled);
      const added = batched.mesh({ maxInstances: 2, multiDraw: "multi-draw" });
      const first = added.addGeometry(triangle), second = added.addGeometry(triangle);
      added.addInstance(first); added.addInstance(second);
      try {
        f.registry.add(added.runtime({ id: "added-clipped" }).toJSON());
        const withAdded = sourceItems(f.frame());
        expect(withAdded).toHaveLength(4);
        expect(withAdded.every((item) => !("multiDraw" in item))).toBe(true);
        expect(f.registry.remove("added-clipped")).toBe(true);
        expect(sourceItems(f.frame())).toHaveLength(2);
      } finally { added.dispose(); }

      global.dispose();
      expect(sourceItems(f.frame()).every((item) => !("multiDraw" in item))).toBe(true);
      const withoutGroup = { ...f.snapshot, clipping: undefined };
      const ungrouped = realCompilerImpl.update(f.compiled, withoutGroup, f.registry, 0);
      expect(sourceItems(ungrouped).every((item) => "multiDraw" in item)).toBe(true);
    } finally {
      f.compiled.dispose(); f.registry.dispose(); f.batch.dispose(); global.dispose(); device.dispose(); capable.dispose();
    }
  });

  it("reselects the safe route when a later snapshot introduces a scene group", async () => {
    const global = clipping.global({ planes: [[1, 0, 0, 0]], clipShadows: true });
    const capable = await combinedRenderer();
    const f = await compileBatch(undefined, undefined, "multi-draw", capable);
    try {
      expect(sourceItems(f.frame()).every((item) => "multiDraw" in item)).toBe(true);
      const nextSnapshot = { ...f.snapshot, clipping: global.snapshot() };
      const clipped = realCompilerImpl.update(f.compiled, nextSnapshot, f.registry, 0) as RenderSource;
      expect(clipped.globalClipping).toEqual(nextSnapshot.clipping);
      expect(sourceItems(clipped).every((item) => !("multiDraw" in item))).toBe(true);
      expect(raycast(ray, { nodes: [f.batch.toJSON()], mode: "mesh" }).map((hit) => hit.batchMemberId)).toEqual([f.second, f.first]);
    } finally {
      f.compiled.dispose(); f.registry.dispose(); f.batch.dispose(); global.dispose(); capable.dispose();
    }
  });

  it("rejects callback clipping on unproven packed items when no safe fallback is selected", async () => {
    const local = clipping.material({ planes: [[1, 0, 0, 0]], space: "local", clipShadows: true });
    const capable = await combinedRenderer();
    const f = await compileBatch(undefined, undefined, "multi-draw", capable);
    const device = new MockRenderDevice();
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    try {
      const items = sourceItems(f.frame());
      expect(items.every((item) => "multiDraw" in item)).toBe(true);
      const unproven = items.map((item) => ({ ...item }));
      device.beginFrame(64, 64);
      expect(() => new ForwardPass({ items: unproven, materialClippingFor: () => local }).execute({ device, width: 64, height: 64 }))
        .toThrow(/Clipping is unavailable for packed multi-draw/);
      let depthFailure: unknown;
      try {
        new DepthPass({ casters: unproven, materialClippingFor: () => local, clippingPass: "shadow" })
          .execute({ device, width: 64, height: 64 });
      } catch (error) { depthFailure = error; }
      expect(depthFailure).toMatchObject({ code: "DEPTH_CLIPPING_BATCH_UNSUPPORTED",
        message: "Packed multi-draw depth geometry has no per-member transform support" });
      expect(device.drawCommands).toHaveLength(0);
    } finally {
      f.compiled.dispose(); f.registry.dispose(); f.batch.dispose(); local.dispose(); device.dispose(); capable.dispose();
    }
  });

  it("recovers authentic packed members before heterogeneous forward and shadow clipping callbacks", async () => {
    const local = clipping.material({ planes: [[1, 0, 0, 0]], space: "local", clipShadows: true });
    const capable = await combinedRenderer();
    const f = await compileBatch(undefined, undefined, "multi-draw", capable);
    const device = new MockRenderDevice();
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    const seen: number[] = [];
    const materialClippingFor = (item: RenderItem) => {
      const z = item.modelMatrix?.[14] ?? 0;
      seen.push(z);
      return z === 2 ? local : undefined;
    };
    try {
      const items = sourceItems(f.frame());
      expect(items.every(isEnginePackedBatchItem)).toBe(true);
      device.beginFrame(64, 64);
      new ForwardPass({ items, materialClippingFor }).execute({ device, width: 64, height: 64 });
      new DepthPass({ casters: items, materialClippingFor, clippingPass: "shadow" }).execute({ device, width: 64, height: 64 });
      expect(seen).toEqual([0, 2, 0, 2]);
      expect(device.drawCommands).toHaveLength(4);
      expect(device.drawCommands.map((draw) => draw.uniforms?.get("u_a3dClipGroupCount") ?? 0)).toEqual([0, 1, 0, 1]);
    } finally { f.compiled.dispose(); f.registry.dispose(); f.batch.dispose(); local.dispose(); device.dispose(); capable.dispose(); }
  });

  it("rejects a heterogeneous per-item callback on unproven markers before submission", async () => {
    const local = clipping.material({ planes: [[1, 0, 0, 0]], space: "local", clipShadows: true });
    const capable = await combinedRenderer();
    const f = await compileBatch(undefined, undefined, "multi-draw", capable);
    const flags = resolveQrFlags({ options: "parity.batching,tiers.batching,core" });
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    try {
      const source = f.frame();
      const items = sourceItems(source);
      expect(items.every((item) => "multiDraw" in item)).toBe(true);
      const configured = {
        ...source,
        collectRenderItems: () => items.map((item) => ({ ...item })),
        cameraPolicy: "identity" as const,
        frustumCulling: false,
        postprocess: undefined,
        materialClippingFor: (item: RenderItem) => (item as RenderItem & { multiDraw?: { drawIndex: number } }).multiDraw?.drawIndex === 1 ? local : undefined
      };
      expect(() => renderer.render(configured)).toThrow(/Clipping is unavailable for packed multi-draw/);
      expect((renderer.device as MockRenderDevice).drawCommands).toHaveLength(0);
    } finally {
      renderer.dispose(); f.compiled.dispose(); f.registry.dispose(); f.batch.dispose(); local.dispose(); capable.dispose();
    }
  });

  it("rejects unsupported per-member or array material clipping instead of dropping it", async () => {
    const local = clipping.material({ planes: [[1, 0, 0, 0]] });
    const f = await compileBatch(local);
    try {
      const node = f.batch.toJSON();
      const unsafe = { ...node, instances: [{ clipping: local }] };
      const unsafeMaterials = { ...node, material: [material.pbr({ clipping: local }), material.pbr()] };
      const flags = resolveQrFlags({ options: "parity.batching,tiers.batching,core" });
      const out = { addItems() {}, set() {}, feature() {} } as never;
      const ctx = { flags } as never;
      expect(() => batchedNodeHandler.update!(unsafe as never, undefined, ctx, out, 0)).toThrow(/BATCH_MEMBER_MATERIAL_UNSUPPORTED/);
      expect(() => batchedNodeHandler.update!(unsafeMaterials as never, undefined, ctx, out, 0)).toThrow(/BATCH_MEMBER_MATERIAL_UNSUPPORTED/);
    } finally {
      f.compiled.dispose(); f.registry.dispose(); f.batch.dispose(); local.dispose();
    }
  });
});
