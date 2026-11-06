import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { DirectionalLight, identityMat4 } from "@aura3d/scene";
import { Renderer, collectRenderItems } from "../../../packages/rendering/src/Renderer";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice, type DrawCommand, type RenderShaderProgram, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { subscribeProgramReadiness } from "../../../packages/rendering/src/program/ProgramCache";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { registerFrameContributor } from "../../../packages/rendering/src/contracts/frameGraph";
import { BaseRenderPass } from "../../../packages/rendering/src/RenderPass";
import { batchMembersFor, createEngineBatchInstanceItem, createEnginePackedBatchItem, isEngineBatchInstanceItem, isEnginePackedBatchItem, rememberBatchMembers } from "../../../packages/rendering/src/batching/BatchMembers";

const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false, A3D_QR_LIGHTING: false });
// The contributor-clipping preflight is a strict-mode contract; outside strict mode it degrades (see clipping-contributor-degrade.test.ts).
const strictFlags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false, A3D_QR_LIGHTING: false, A3D_QR_STRICT: true });
const planes = (draw: DrawCommand) => Array.from(draw.uniforms?.get("u_a3dClipPlanes") as Float32Array).slice(0, 8);

describe("renderer frame clipping", () => {
  it("preserves ordered logical batch provenance when projecting items", () => {
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const firstMatrix = identityMat4(), secondMatrix = identityMat4(), viewProjection = identityMat4();
    firstMatrix[12] = 2; secondMatrix[13] = 3; viewProjection[12] = 5;
    const first = { geometry, material, modelMatrix: firstMatrix, label: "first" };
    const second = { geometry, material, modelMatrix: secondMatrix, label: "second" };
    const batch = { geometry, material, label: "physical" };
    rememberBatchMembers(batch, [first, second]);
    try {
      const [projected] = collectRenderItems([batch], viewProjection);
      const members = batchMembersFor(projected!);
      expect(members?.map(item => item.label)).toEqual(["first", "second"]);
      expect(members?.[0]?.modelViewProjectionMatrix?.[12]).toBe(7);
      expect(members?.[1]?.modelViewProjectionMatrix?.[12]).toBe(5);
      expect(members?.[1]?.modelViewProjectionMatrix?.[13]).toBe(3);
      expect((members?.[0] as RenderItem & { readonly temporalObjectKey?: unknown }).temporalObjectKey).toBe(first);
    } finally { geometry.dispose(); material.dispose(); }
  });

  it("retains packed and instance-bucket origin across projection without granting draw trust", () => {
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const packed = createEnginePackedBatchItem({ geometry, material });
    const bucket = createEngineBatchInstanceItem({ geometry, material });
    try {
      const [projectedPacked, projectedBucket] = collectRenderItems([packed, bucket], identityMat4());
      expect(isEnginePackedBatchItem(projectedPacked)).toBe(true);
      expect(isEngineBatchInstanceItem(projectedBucket)).toBe(true);
      expect(isEnginePackedBatchItem(projectedBucket)).toBe(false);
    } finally { geometry.dispose(); material.dispose(); }
  });

  it.each([false, true])("rejects per-member clipping callbacks for batched instance buckets before callback or draw (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const bucket = createEngineBatchInstanceItem({ geometry, material, instanceCount: 2 });
    let calls = 0;
    const source = { cameraPolicy: "identity" as const, renderItems: [bucket],
      materialClippingFor: () => { calls++; return { planes: [[1, 0, 0, 0] as const] }; } };
    try {
      if (asynchronous) await expect(renderer.renderAsync({ source })).rejects.toThrowError(expect.objectContaining({ code: "BATCH_MATERIAL_CLIPPING_CALLBACK_UNSUPPORTED" }));
      else expect(() => renderer.render({ source })).toThrowError(expect.objectContaining({ code: "BATCH_MATERIAL_CLIPPING_CALLBACK_UNSUPPORTED" }));
      expect(calls).toBe(0);
      expect(device.drawCommands).toHaveLength(0);
    } finally { renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each([false, true])("detects a batch bucket before a later contributor can clone it (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    let callbackCalls = 0, laterCalls = 0;
    const first = registerFrameContributor({ id: "prd01.batch-created", owner: "prd01", flag: "A3D_QR_CORE", order: 1, phases: ["collect"],
      collect: items => [...items, createEngineBatchInstanceItem({ geometry, material, instanceCount: 2 })] });
    const second = registerFrameContributor({ id: "prd01.batch-clone", owner: "prd01", flag: "A3D_QR_CORE", order: 2, phases: ["collect"],
      collect: items => { laterCalls++; return items.map(item => ({ ...item })); } });
    const source = { cameraPolicy: "identity" as const, renderItems: [{ geometry, material }],
      materialClippingFor: () => { callbackCalls++; return undefined; } };
    try {
      if (asynchronous) await expect(renderer.renderAsync({ source })).rejects.toThrowError(expect.objectContaining({ code: "BATCH_MATERIAL_CLIPPING_CALLBACK_UNSUPPORTED" }));
      else expect(() => renderer.render({ source })).toThrowError(expect.objectContaining({ code: "BATCH_MATERIAL_CLIPPING_CALLBACK_UNSUPPORTED" }));
      expect([callbackCalls, laterCalls, device.drawCommands.length]).toEqual([0, 0, 0]);
    } finally { second(); first(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });
  it.each([false, true])("shares frozen groups across shadow and forward, then observes edits next frame (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const sourceGlobal = { planes: [[1, 0, 0, -1] as [number, number, number, number]], clipShadows: true };
    const itemGlobal = { planes: [[1, 0, 0, -2] as [number, number, number, number]], clipShadows: true };
    const itemMaterial = { planes: [[0, 0, 1, -4] as [number, number, number, number]], clipShadows: true };
    const callbackMaterial = { planes: [[0, 1, 0, -3] as [number, number, number, number]], space: "local" as const, clipShadows: false };
    let resolveCalls = 0, mutate = true;
    const items: RenderItem[] = [
      { geometry, material, label: "first", globalClipping: itemGlobal, materialClipping: itemMaterial,
        onBeforeRender() {
          if (!mutate) return;
          mutate = false;
          sourceGlobal.planes[0]![3] = -10;
          itemGlobal.planes[0]![3] = -20;
          callbackMaterial.planes[0]![3] = -30;
        } },
      { geometry, material, label: "second" }
    ];
    const sun = new DirectionalLight("sun"); sun.castsShadow = true;
    const source = { cameraPolicy: "identity" as const, renderItems: items, globalClipping: sourceGlobal,
      materialClippingFor: () => { resolveCalls++; return callbackMaterial; },
      shadow: { light: sun, size: 16, lightMatrix: identityMat4() } };
    const render = (id: number) => asynchronous ? renderer.renderAsync({ source, frameId: id }) : Promise.resolve(renderer.render({ source, frameId: id }));
    try {
      await render(1);
      expect(resolveCalls).toBe(2);
      const [depthFirst, depthSecond, forwardFirst, forwardSecond] = device.drawCommands;
      expect(device.drawCommands).toHaveLength(4);
      expect(depthFirst!.uniforms?.get("u_a3dClipGroupCount")).toBe(1);
      expect(depthSecond!.uniforms?.get("u_a3dClipGroupCount")).toBe(1);
      expect(planes(depthFirst!).slice(0, 4)).toEqual([1, 0, 0, -2]);
      expect(planes(depthSecond!).slice(0, 4)).toEqual([1, 0, 0, -1]);
      expect(planes(forwardFirst!)).toEqual([1, 0, 0, -2, 0, 1, 0, -3]);
      expect(planes(forwardSecond!)).toEqual([1, 0, 0, -1, 0, 1, 0, -3]);
      await render(2);
      expect(resolveCalls).toBe(4);
      expect(planes(device.drawCommands[2]!)).toEqual([1, 0, 0, -20, 0, 1, 0, -30]);
      expect(planes(device.drawCommands[3]!)).toEqual([1, 0, 0, -10, 0, 1, 0, -30]);
    } finally { renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each([false, true])("rejects an exceeded plane budget before submitting shadow or color (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const source = { cameraPolicy: "identity" as const, renderItems: [{ geometry, material }], clippingPlaneLimit: 1,
      globalClipping: { planes: [[1, 0, 0, 0] as const, [0, 1, 0, 0] as const] } };
    try {
      if (asynchronous) await expect(renderer.renderAsync({ source })).rejects.toThrow(/plane count exceeds/i);
      else expect(() => renderer.render({ source })).toThrow(/plane count exceeds/i);
      expect(device.drawCommands).toHaveLength(0);
    } finally { renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each([false, true])("rejects clipped packed draws before any shadow submission (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const sun = new DirectionalLight("packed-sun"); sun.castsShadow = true;
    const source = { cameraPolicy: "identity" as const, globalClipping: { planes: [[1, 0, 0, 0] as const], clipShadows: true },
      renderItems: [{ geometry, material, multiDraw: { mode: "loop", drawIndex: 0 } }],
      shadow: { light: sun, size: 8, lightMatrix: identityMat4() } };
    try {
      if (asynchronous) await expect(renderer.renderAsync({ source })).rejects.toThrow(/packed multi-draw/i);
      else expect(() => renderer.render({ source })).toThrow(/packed multi-draw/i);
      expect(device.drawCommands).toHaveLength(0);
    } finally { renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each([false, true])("preflights every clipped shadow caster before the first depth draw (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.litCube(1), points = new Geometry(new VertexBuffer(VertexFormat.P3, 1), null, "points");
    const material = new PBRMaterial();
    const sun = new DirectionalLight("point-shadow-preflight"); sun.castsShadow = true;
    const globalClipping = { planes: [[1, 0, 0, 0] as const], clipShadows: true };
    const source = { cameraPolicy: "identity" as const, globalClipping,
      // Clipped points are supported in depth; instanced clipped points are not.
      renderItems: [{ geometry, material }, { geometry: points, material, instanceTransforms: identityMat4() }],
      shadow: { light: sun, size: 8, lightMatrix: identityMat4() } };
    try {
      if (asynchronous) await expect(renderer.renderAsync({ source })).rejects.toThrow(/clipped point depth does not support instancing/i);
      else expect(() => renderer.render({ source })).toThrow(/clipped point depth does not support instancing/i);
      expect(device.drawCommands).toHaveLength(0);
    } finally { renderer.dispose(); geometry.dispose(); points.dispose(); material.dispose(); }
  });

  it.each([false, true])("rejects scene clipping on splats and unverified contributor geometry (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: strictFlags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const globalClipping = { planes: [[1, 0, 0, 0] as const] };
    const sun = new DirectionalLight("contributor-preflight"); sun.castsShadow = true;
    const render = async (source: Parameters<typeof renderer.render>[0]) => asynchronous ? renderer.renderAsync(source) : renderer.render(source);
    let invoked = false, planned = false;
    class UnknownPass extends BaseRenderPass { constructor() { super("prd01.clip-extra"); } execute() { invoked = true; } }
    const unregister = registerFrameContributor({ id: "prd01.clip-extra", owner: "prd01", flag: "A3D_QR_CORE", phases: ["after-opaque"],
      passes: () => { planned = true; return [new UnknownPass()]; } });
    try {
      const splats = { cameraPolicy: "identity" as const, renderItems: [{ geometry, material }], globalClipping, gaussianSplats: [{}] };
      await expect(render(splats)).rejects.toThrow(/splats do not yet support scene clipping/i);
      const extra = { cameraPolicy: "identity" as const, renderItems: [{ geometry, material }], globalClipping,
        shadow: { light: sun, size: 8, lightMatrix: identityMat4() } };
      await expect(render(extra)).rejects.toThrow(/contributor-owned geometry/i);
      expect(planned).toBe(false);
      expect(invoked).toBe(false);
      expect(device.drawCommands).toHaveLength(0);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each([[false, false], [false, true], [true, false], [true, true]])("rejects an untrusted provider before source collection or shadow work (async=%s, item=%s)", async (asynchronous, perItem) => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: strictFlags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const sun = new DirectionalLight("accessor-provider"); sun.castsShadow = true;
    let collected = 0, read = 0;
    const contributor = { id: "prd01.clipping-accessor", owner: "prd01" as const, flag: "A3D_QR_CORE" as const,
      phases: ["after-opaque"] as const, passes: () => [] };
    const unregister = registerFrameContributor(contributor);
    Object.defineProperty(contributor, "phases", { get() { read++; throw new Error("untrusted phase getter"); } });
    const source = { cameraPolicy: "identity" as const,
      collectRenderItems: () => { collected++; return [{ geometry, material }]; },
      ...(perItem
        ? { renderItems: [{ geometry, material, materialClipping: { planes: [[1, 0, 0, 0] as const], clipShadows: true } }] }
        : { globalClipping: { planes: [[1, 0, 0, 0] as const], clipShadows: true } }),
      shadow: { light: sun, size: 8, lightMatrix: identityMat4() } };
    try {
      if (asynchronous) await expect(renderer.renderAsync({ source })).rejects.toThrow(/contributor-owned geometry/i);
      else expect(() => renderer.render({ source })).toThrow(/contributor-owned geometry/i);
      expect([read, collected, device.drawCommands.length]).toEqual([0, 0, 0]);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each([false, true])("rejects a provider registered by a clipping resolver before shadow work (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: strictFlags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const sun = new DirectionalLight("dynamic-provider"); sun.castsShadow = true;
    let unregister = () => {};
    const source = { cameraPolicy: "identity" as const, renderItems: [{ geometry, material }],
      materialClippingFor: () => {
        unregister = registerFrameContributor({ id: "prd01.clipping-dynamic", owner: "prd01", flag: "A3D_QR_CORE", phases: ["after-opaque"], passes: () => [] });
        return { planes: [[1, 0, 0, 0] as const], clipShadows: true };
      }, shadow: { light: sun, size: 8, lightMatrix: identityMat4() } };
    try {
      if (asynchronous) await expect(renderer.renderAsync({ source })).rejects.toThrow(/contributor-owned geometry/i);
      else expect(() => renderer.render({ source })).toThrow(/contributor-owned geometry/i);
      expect(device.drawCommands).toHaveLength(0);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each([false, true])("does not read item-list accessors during clipped shadow preflight (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: strictFlags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const sun = new DirectionalLight("list-accessor"); sun.castsShadow = true;
    let reads = 0;
    const items = [{ geometry, material }];
    Object.defineProperty(items, "0", { get() { reads++; throw new Error("item-list getter"); } });
    const unregister = registerFrameContributor({ id: "prd01.list-accessor", owner: "prd01", flag: "A3D_QR_CORE", phases: ["collect"], collect: value => value });
    const source = { cameraPolicy: "identity" as const, renderItems: items, shadow: { light: sun, size: 8, lightMatrix: identityMat4() } };
    try {
      if (asynchronous) await expect(renderer.renderAsync({ source })).rejects.toThrow(/contributor-owned geometry/i);
      else expect(() => renderer.render({ source })).toThrow(/contributor-owned geometry/i);
      expect(reads).toBe(0);
      expect(device.drawCommands).toHaveLength(0);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each([false, true])("keeps disabled clipping and disabled shadows on their ordinary path (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const sun = new DirectionalLight("disabled-preflight"); sun.castsShadow = true;
    let collected = 0;
    const unregister = registerFrameContributor({ id: "prd01.clipping-disabled", owner: "prd01", flag: "A3D_QR_CORE", phases: ["collect"],
      collect: items => { collected++; return items; } });
    const render = async (source: Parameters<typeof renderer.render>[0]) => asynchronous ? renderer.renderAsync(source) : renderer.render(source);
    try {
      await render({ cameraPolicy: "identity", renderItems: [{ geometry, material }],
        globalClipping: { enabled: false, planes: [[1, 0, 0, 0]], clipShadows: true },
        shadow: { light: sun, size: 8, lightMatrix: identityMat4() } });
      expect(device.drawCommands).toHaveLength(2);
      await render({ cameraPolicy: "identity", renderItems: [{ geometry, material }],
        globalClipping: { planes: [[1, 0, 0, 0]], clipShadows: true }, shadow: { enabled: false } });
      expect(device.drawCommands).toHaveLength(1);
      expect(collected).toBe(2);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("warms a clipping program introduced by ordered collection", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const unregister = registerFrameContributor({ id: "prd01.clipping-test", owner: "prd01", flag: "A3D_QR_CORE", phases: ["collect"],
      collect: items => items.map(item => ({ ...item, materialClipping: { planes: [[1, 0, 0, -2]] } })) });
    try {
      await renderer.renderAsync({ source: { cameraPolicy: "identity", renderItems: [{ geometry, material }] } });
      const draw = device.drawCommands.at(-1)!;
      expect(draw.uniforms?.get("u_a3dClipGroupCount")).toBe(1);
      expect(planes(draw).slice(0, 4)).toEqual([1, 0, 0, -2]);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("invalidates and draws a contributor-added clipped item after asynchronous compilation", async () => {
    class DeferredClipDevice extends MockRenderDevice {
      readonly pending: { source: ShaderSources; resolve: (program: RenderShaderProgram) => void }[] = [];
      compileAsync(source: ShaderSources): Promise<RenderShaderProgram> {
        if (!source.generatedProgram?.defines.A3D_CLIPPING) return Promise.resolve(this.createShaderProgram(source));
        return new Promise(resolve => this.pending.push({ source, resolve }));
      }
    }
    const device = new DeferredClipDevice();
    Object.defineProperty(device, "probe", { value: { parallelShaderCompile: true } });
    const renderer = new Renderer(device, { backend: "mock", width: 8, height: 8, qrFlags: flags,
      shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    const geometry = Geometry.litCube(1), material = new PBRMaterial();
    const unregister = registerFrameContributor({ id: "prd01.clipping-pending-test", owner: "prd01", flag: "A3D_QR_CORE", phases: ["collect"],
      collect: items => items.map(item => ({ ...item, materialClipping: { planes: [[1, 0, 0, -2]] } })) });
    let invalidations = 0;
    const unsubscribe = subscribeProgramReadiness(device, () => { invalidations++; });
    const source = { cameraPolicy: "identity" as const, renderItems: [{ geometry, material }] };
    try {
      await renderer.renderAsync({ source });
      expect(device.drawCommands).toHaveLength(0);
      expect(device.pending.length).toBeGreaterThan(0);
      // Ignore the initial unclipped warmup notification; completion of the
      // actual clipped variant must schedule another frame of its own.
      await Promise.resolve(); await Promise.resolve();
      const before = invalidations;
      for (const request of device.pending) request.resolve(device.createShaderProgram(request.source));
      for (let index = 0; index < 8; index++) await Promise.resolve();
      expect(invalidations).toBeGreaterThan(before);
      await renderer.renderAsync({ source });
      const draw = device.drawCommands.at(-1)!;
      expect(draw.uniforms?.get("u_a3dClipGroupCount")).toBe(1);
      expect(planes(draw).slice(0, 4)).toEqual([1, 0, 0, -2]);
    } finally { unsubscribe(); unregister(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });
});
