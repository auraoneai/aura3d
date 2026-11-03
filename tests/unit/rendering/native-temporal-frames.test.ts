import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { identityMat4, multiplyMat4, perspectiveMat4 } from "@aura3d/scene";
import "../../../packages/rendering/src/lanes/prd03";
import "../../../packages/rendering/src/lanes/prd06";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Material } from "../../../packages/rendering/src/Material";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { rememberBatchMembers } from "../../../packages/rendering/src/batching/BatchMembers";
import { OBJECT_MOTION_SHADER, deformObjectMotionGeometry } from "../../../packages/rendering/src/renderer/ObjectMotionPass";
import { MockRenderDevice, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import {
  VelocityHistory, bindVelocityUniforms, postVelocityCoverage, velocityFramePrepared
} from "../../../packages/rendering/src/forward/Velocity";
import {
  temporalCameraVelocity, temporalCanAccumulate, temporalCubicWeights, temporalDepthAccepted, temporalFeedbackWeight, temporalJitter,
  temporalLinearDepth, temporalReprojection
} from "../../../packages/rendering/src/TemporalMath";
import { validateWebGPUTemporalInputs, webgpuTaaResolveUniforms } from "../../../packages/rendering/src/webgpu/WebGPUTemporal";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { acquireV2Target, disposeNativePostEffects, releaseV2Target, runV2HdrStages, runV2LdrTail, type DeferredAfterBloomStage } from "../../../packages/rendering/src/post/v2Stages";
import { consumeTaaHistoryWritten } from "../../../packages/rendering/src/renderer/postSkipped";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import type { PostPassDescriptor } from "../../../packages/rendering/src/contracts/post";
import { postDiagnostics } from "../../../packages/rendering/src/renderer/PostDiagnosticsScope";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";

const id = () => Float32Array.from(identityMat4());
const matrixAt = (x: number) => { const out = id(); out[12] = x; return out; };
const v2Flags = { values: {}, on: (flag: string) => flag === "A3D_QR_POST" };
const triangle = Geometry.triangle();
const item = (key: object, x = 0) => ({ geometry: triangle, label: "same", modelMatrix: matrixAt(x), temporalObjectKey: key });

describe("view-owned temporal frames", () => {
  it("previews camera cuts without committing the per-view authored-frame position", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    const temporal = renderer as unknown as {
      authoredFrameId: number;
      activeViewId: string;
      lastTemporalCameraPosition: Map<string, { frameId: number; position: readonly number[]; cameraCut: boolean }>;
      previewTemporalCameraCut(position: readonly [number, number, number]): boolean;
      temporalCameraCut(position: readonly [number, number, number]): boolean;
    };
    try {
      temporal.activeViewId = "left"; temporal.authoredFrameId = 1;
      expect(temporal.previewTemporalCameraCut([0, 0, 0])).toBe(false);
      expect(temporal.lastTemporalCameraPosition.size).toBe(0);
      expect(temporal.temporalCameraCut([0, 0, 0])).toBe(false);
      expect(temporal.previewTemporalCameraCut([20, 0, 0])).toBe(false);
      expect(temporal.temporalCameraCut([20, 0, 0])).toBe(false);
      expect(temporal.lastTemporalCameraPosition.get("left")?.position).toEqual([0, 0, 0]);
      temporal.authoredFrameId = 2;
      expect(temporal.previewTemporalCameraCut([6, 0, 0])).toBe(true);
      expect(temporal.previewTemporalCameraCut([4, 0, 0])).toBe(false);
      expect(temporal.lastTemporalCameraPosition.get("left")?.frameId).toBe(1);
      expect(temporal.temporalCameraCut([6, 0, 0])).toBe(true);
      temporal.activeViewId = "right";
      expect(temporal.previewTemporalCameraCut([20, 0, 0])).toBe(false);
      expect(temporal.lastTemporalCameraPosition.has("right")).toBe(false);
    } finally { renderer.dispose(); }
  });

  it("generates compilable rigid, instanced and deformed velocity programs from the previous pose", () => {
    const executable = spawnSync("glslangValidator", ["--version"], { stdio: "ignore" });
    const dir = mkdtempSync(join(tmpdir(), "aura-temporal-velocity-"));
    try {
      const variants = [
        { name: "rigid", instancing: undefined, velocity: "velocity", deform: undefined },
        { name: "instanced", instancing: { color: false }, velocity: "velocity-instanced", deform: undefined },
        { name: "skinned", instancing: undefined, velocity: "velocity", deform: "skin4" }
      ] as const;
      for (const variant of variants) {
        const source = generateProgramImpl(normalizeProgramFeatures({ instancing: variant.instancing,
          features: { "prd03.velocity": variant.velocity, ...(variant.deform ? { "prd06.deform": variant.deform } : {}) } }),
          { flags: variant.deform ? { values: {}, on: (flag: string) => flag === "A3D_QR_POST" || flag === "A3D_QR_ANIMATION" } : v2Flags });
        expect(source.vertex).toContain("u_unjitteredViewProjection * a3dWorld");
        expect(source.vertex).toContain("u_previousModel * a3dVelPrevInstance * a3dVelPrevLocal");
        expect(source.vertex).toContain("#define A3D_VELOCITY");
        // Instanced draws read each instance's previous matrix; others reuse instanceMatrix.
        expect(source.vertex.includes("#define A3D_VELOCITY_PREVIOUS_INSTANCE")).toBe(variant.name === "instanced");
        // Skinned draws evaluate the previous palette through the deform chunk.
        if (variant.deform) {
          expect(source.vertex).toContain("uniform highp sampler2D u_prevBoneTexture;");
          expect(source.vertex).toContain("a3dSkin(u_prevBoneTexture)");
          expect(source.vertex).toContain("a3dDeformPrevious(a3dVelPrevDeformed);");
        }
        if (executable.error) continue;
        for (const stage of ["vertex", "fragment"] as const) {
          const ext = stage === "vertex" ? "vert" : "frag";
          const path = join(dir, `velocity-${variant.name}.${ext}`);
          writeFileSync(path, source[stage]);
          const compiled = spawnSync("glslangValidator", ["-S", ext, path], { encoding: "utf8" });
          expect(compiled.status, compiled.stdout + compiled.stderr).toBe(0);
        }
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
    if (process.env.A3D_REQUIRE_GLSLANG === "1") expect(executable.error).toBeUndefined();
  });
  it("commits camera and object history once per authored frame and distinguishes duplicate labels", () => {
    const owner = new VelocityHistory();
    const a = {}, b = {};
    expect(() => owner.prepare(matrixAt(0), [0, 0], NaN)).toThrow(/frame ID/);
    owner.prepare(matrixAt(0), [0, 0], "f0");
    const invalidKey = { ...item(a), temporalObjectKey: NaN };
    expect(() => owner.prepareItem(invalidKey, true)).toThrow(/object ID/);
    const firstA = owner.prepareItem(item(a, 1), true);
    owner.prepareItem(item(b, 10), true);
    owner.prepareItem(item(a, 1), true); // another pass, same object
    expect(owner.coverage).toMatchObject({ items: 2, moving: 2, withVelocity: 0 });
    expect(velocityFramePrepared(firstA)).toBe(true);
    expect(velocityFramePrepared(item(a))).toBe(false);
    owner.commit("f0");
    owner.commit("f0");
    const camera = owner.prepare(matrixAt(3), [0, 0], "f1");
    expect(camera.previous[12]).toBe(0);
    const movedA = owner.prepareItem(item(a, 2), true);
    const movedB = owner.prepareItem(item(b, 11), true);
    const uniformsA = new Map(), uniformsB = new Map();
    bindVelocityUniforms?.(movedA, uniformsA);
    bindVelocityUniforms?.(movedB, uniformsB);
    expect((uniformsA.get("u_previousModel") as Float32Array)[12]).toBe(1);
    expect((uniformsB.get("u_previousModel") as Float32Array)[12]).toBe(10);
    expect(owner.coverage).toEqual({ items: 2, withVelocity: 2, moving: 2, movingWithHistory: 2 });
    expect(owner.prepare(matrixAt(3), [0, 0], "f1").previous[12]).toBe(0);
    expect(() => owner.prepare(matrixAt(0), [0, 0], "f0")).toThrow(/cannot be resumed/);
    expect(() => owner.prepareItem(item(a, 7), true)).toThrow(/conflicting transforms/);
    owner.reset("camera-cut");
    expect(velocityFramePrepared(movedA)).toBe(false);
    expect(postVelocityCoverage().available).toBe(false);
    const afterReset = new Map();
    bindVelocityUniforms?.(movedA, afterReset);
    expect(afterReset.size).toBe(0);
  });

  it("supplies previous morph weights and per-instance matrices once per authored frame", () => {
    const owner = new VelocityHistory();
    const key = {};
    const instances = (x: number) => Float32Array.from([...matrixAt(x), ...matrixAt(x + 100)]);
    const deformed = (weight: number, x: number) => ({ ...item(key), morphTargets: [{} as never], morphWeights: [weight], instanceTransforms: instances(x) });
    owner.prepare(id(), [0, 0], 1);
    const first = owner.prepareItem(deformed(0.25, 1), true);
    // First frame: the previous pose is seeded with the current one.
    expect(Array.from(first.previousMorphWeights!)).toEqual([0.25]);
    expect(first.previousInstanceTransforms![12]).toBe(1);
    const columns = first.instanceAttributes!.filter(attribute => attribute.shaderName.startsWith("a_a3dPrevInstance"));
    expect(columns.map(attribute => attribute.shaderName)).toEqual(["a_a3dPrevInstance0", "a_a3dPrevInstance1", "a_a3dPrevInstance2", "a_a3dPrevInstance3"]);
    // Column 3 holds each instance's translation.
    expect(Array.from(columns[3]!.data)).toEqual([1, 0, 0, 1, 101, 0, 0, 1]);
    const uniforms = new Map();
    bindVelocityUniforms?.(first, uniforms);
    expect(uniforms.get("a3d_u_reactive")).toBe(0);
    // A second pass of the same frame cannot advance or change the pose.
    expect(owner.prepareItem(deformed(0.25, 1), true).previousMorphWeights![0]).toBe(0.25);
    expect(() => owner.prepareItem(deformed(0.5, 1), true)).toThrow(/conflicting deformation or instance state/);
    owner.commit(1);

    owner.prepare(id(), [0, 0], 2);
    const second = owner.prepareItem(deformed(0.75, 4), true);
    expect(Array.from(second.previousMorphWeights!)).toEqual([0.25]);
    expect(second.previousInstanceTransforms![12]).toBe(1);
    expect(second.previousInstanceTransforms![28]).toBe(101);
    expect(Array.from(second.instanceAttributes!.find(attribute => attribute.shaderName === "a_a3dPrevInstance3")!.data)).toEqual([1, 0, 0, 1, 101, 0, 0, 1]);
    owner.commit(2);

    // A changed instance count has no correspondence: the pixels are reactive.
    owner.prepare(id(), [0, 0], 3);
    const resized = owner.prepareItem({ ...deformed(0.75, 4), instanceTransforms: matrixAt(4) }, true);
    const resizedUniforms = new Map();
    bindVelocityUniforms?.(resized, resizedUniforms);
    expect(resizedUniforms.get("a3d_u_reactive")).toBe(1);
    // Without a writable MRT the item is unchanged and deformation stays reactive.
    owner.reset("explicit-reset");
    owner.prepare(id(), [0, 0], 4);
    const noMrt = owner.prepareItem(deformed(0.75, 4), false);
    expect(noMrt.previousMorphWeights).toBeUndefined();
    expect(noMrt.instanceAttributes).toBeUndefined();
    const noMrtUniforms = new Map();
    bindVelocityUniforms?.(noMrt, noMrtUniforms);
    expect(noMrtUniforms.get("a3d_u_reactive")).toBe(1);
  });

  it("separates two owners and views, and resets or retires only the selected view", () => {
    const first = new MockRenderDevice(), other = new MockRenderDevice();
    setRendererQrFlags(v2Flags, first); setRendererQrFlags(v2Flags, other);
    const owner = new TemporalHistory(), secondOwner = new TemporalHistory();
    const a = owner.prepare(first, 8, 8, [], matrixAt(0), { viewId: "left", frameId: 1 });
    const b = owner.prepare(first, 8, 8, [], matrixAt(7), { viewId: "right", frameId: 1 });
    const c = secondOwner.prepare(other, 8, 8, [], matrixAt(9), { viewId: "left", frameId: 1 });
    owner.commit("left", 1); owner.commit("right", 1); secondOwner.commit("left", 1);
    expect(new Set([a.history, b.history, c.history]).size).toBe(3);
    owner.reset("camera-cut", "left");
    expect(owner.prepare(first, 8, 8, [], matrixAt(4), { viewId: "left", frameId: 2 }).historyValid).toBe(false);
    const right = owner.prepare(first, 8, 8, [], matrixAt(8), { viewId: "right", frameId: 2 });
    expect(right.historyValid).toBe(true);
    expect(right.v2!.previous[12]).toBe(7);
    expect(secondOwner.prepare(other, 8, 8, [], matrixAt(10), { viewId: "left", frameId: 2 }).v2!.previous[12]).toBe(9);
    owner.disposeView("left");
    expect(a.history.disposed).toBe(true);
    expect(b.history.disposed).toBe(false);
    owner.dispose(); secondOwner.dispose(); first.dispose(); other.dispose();
  });

  it("repeated preparation and commits cannot advance or swap a frame twice", () => {
    const device = new MockRenderDevice(); setRendererQrFlags(v2Flags, device);
    const owner = new TemporalHistory(), object = {};
    const options = { frameId: "one", viewId: "view", jitter: true };
    expect(() => owner.prepare(device, 8, 8, [], id(), { frameId: NaN })).toThrow(/IDs must be finite/);
    expect(() => owner.prepare(device, 8, 8, [], id(), { viewId: Infinity })).toThrow(/IDs must be finite/);
    const seed = owner.prepare(device, 8, 8, [item(object)], id(), options);
    expect(owner.prepare(device, 8, 8, [item(object)], id(), options)).toBe(seed);
    owner.commit("view", "one"); owner.commit("view", "one");
    expect(owner.prepare(device, 8, 8, [item(object)], id(), options)).toBe(seed);
    expect(() => owner.prepare(device, 8, 8, [item(object)], matrixAt(5), options)).toThrow(/changed its view/);
    expect(() => owner.prepare(device, 8, 8, [item(object, 5)], id(), options)).toThrow(/changed its view/);
    expect(() => owner.prepare(device, 8, 8, [item(object)], id(), { ...options, frameTime: 1 / 30 })).toThrow(/changed its view/);
    expect(() => owner.prepare(device, 8, 8, [item(object)], id(), { ...options, reset: true })).toThrow(/changed its view/);
    const next = owner.prepare(device, 8, 8, [item(object)], id(), { ...options, frameId: "two" });
    expect(next.history).toBe(seed.historyOutput);
    expect(next.historyFrames).toBe(1);
    expect(() => owner.prepare(device, 8, 8, [item(object)], id(), options)).toThrow(/cannot be resumed/);
    owner.commit("view", "two");
    const nearChanged = owner.prepare(device, 8, 8, [item(object)], id(), { ...options, frameId: "three", depthNear: -2 });
    expect(nearChanged.historyValid).toBe(false);
    expect(nearChanged.v2!.depthNear).toBe(-2);
    owner.dispose(); device.dispose();
  });

  it("plans the exact per-view raster jitter without changing targets or history", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "generation", { value: 1, writable: true });
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device);
    device.beginFrame(8, 8);
    const owner = new TemporalHistory(), key = {}, createTarget = vi.spyOn(device, "createRenderTarget");
    const options = { frameId: 1, viewId: "left", sceneKey: "scene", jitter: true };
    try {
      const left = owner.planFrame(device, 8, 8, matrixAt(2), options);
      const right = owner.planFrame(device, 8, 8, matrixAt(4), { ...options, viewId: "right" });
      expect(createTarget).not.toHaveBeenCalled();
      expect(device.drawCommands).toHaveLength(0);
      expect(left.jitterClip).toEqual([0, 0]);
      expect(owner.jitter(8, 8, "left")).toEqual([0, 0]);
      const initial = owner.preparePlanned(left, device, 8, 8, [item(key)], matrixAt(2), options);
      const other = owner.preparePlanned(right, device, 8, 8, [], matrixAt(4), { ...options, viewId: "right" });
      expect(initial.v2!.jitterClip).toEqual(left.jitterClip);
      expect(Array.from(initial.v2!.jittered)).toEqual(left.jittered);
      expect(other.v2!.jitterClip).toEqual(right.jitterClip);
      owner.commit("left", 1); owner.commit("right", 1);

      const nextOptions = { ...options, frameId: 2 };
      const allocations = createTarget.mock.calls.length;
      const next = owner.planFrame(device, 8, 8, matrixAt(3), nextOptions);
      expect(createTarget).toHaveBeenCalledTimes(allocations);
      expect(next.jitterClip).toEqual(temporalJitter(1, true, 8, 8));
      const prepared = owner.preparePlanned(next, device, 8, 8, [item(key)], matrixAt(3), nextOptions);
      expect(prepared.historyValid).toBe(true);
      expect(Array.from(prepared.v2!.jittered)).toEqual(next.jittered);
      expect(prepared.v2!.jitterClip).toEqual(next.jitterClip);
      owner.commit("left", 2);

      const resetOptions = { ...nextOptions, frameId: 3, reset: true };
      const reset = owner.planFrame(device, 8, 8, matrixAt(3), resetOptions);
      expect(reset.jitterClip).toEqual([0, 0]);
      expect(owner.preparePlanned(reset, device, 8, 8, [item(key)], matrixAt(3), resetOptions).historyValid).toBe(false);
      owner.commit("left", 3);
      const resizedOptions = { ...nextOptions, frameId: 4 };
      const resized = owner.planFrame(device, 16, 8, matrixAt(3), resizedOptions);
      expect(resized.jitterClip).toEqual([0, 0]);
      expect(owner.preparePlanned(resized, device, 16, 8, [item(key)], matrixAt(3), resizedOptions).historyValid).toBe(false);
    } finally { owner.dispose(); device.dispose(); }
  });

  it("shares one pending plan per view and cancels without touching GPU or history", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "generation", { value: 1, writable: true });
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device);
    device.beginFrame(8, 8);
    const owner = new TemporalHistory();
    const seedOptions = { viewId: "left", frameId: 1, jitter: true };
    try {
      const seed = owner.prepare(device, 8, 8, [], id(), seedOptions);
      owner.commit("left", 1);
      const createTarget = vi.spyOn(device, "createRenderTarget"), clear = vi.spyOn(device, "clear");
      const options = { ...seedOptions, frameId: 2 };
      const plan = owner.planFrame(device, 8, 8, matrixAt(3), options);
      expect(Object.isFrozen(plan)).toBe(true);
      expect(Object.isFrozen(plan.jittered)).toBe(true);
      expect(owner.planFrame(device, 8, 8, matrixAt(3), { ...options })).toBe(plan);
      expect(owner.planFrame(device, 8, 8, matrixAt(3), { ...options, reconstruction: "spatial", frameTime: 1 / 60,
        depthNear: 0, outputWidth: 99, outputHeight: 99 })).toBe(plan);
      expect(() => owner.assertPlanCurrent(plan, device, 8, 8, matrixAt(3), options)).not.toThrow();
      expect(() => owner.assertPlanCurrent(plan, device, 8, 8, matrixAt(4), options)).toThrow(/stale or belongs/);
      expect(() => owner.planFrame(device, 8, 8, matrixAt(4), options)).toThrow(/inputs changed within the same frame/);
      expect(() => owner.planFrame(device, 8, 8, matrixAt(3), { ...options, jitter: false })).toThrow(/inputs changed within the same frame/);
      expect(() => owner.planFrame(device, 8, 8, matrixAt(3), { ...options, frameId: 3 })).toThrow(/another temporal plan is pending/i);
      const otherView = owner.planFrame(device, 8, 8, id(), { ...options, viewId: "right" });
      expect(owner.cancelPlan(plan)).toBe(true);
      expect(owner.cancelPlan(plan)).toBe(false);
      expect(() => owner.assertPlanCurrent(plan, device, 8, 8, matrixAt(3), options)).toThrow(/stale or belongs/);
      expect(() => owner.preparePlanned(plan, device, 8, 8, [], matrixAt(3), options)).toThrow(/stale or belongs/);
      expect(() => owner.assertPlanCurrent(otherView, device, 8, 8, id(), { ...options, viewId: "right" })).not.toThrow();
      const replacement = owner.planFrame(device, 8, 8, matrixAt(3), options);
      expect(replacement).not.toBe(plan);
      expect(replacement.jitterClip).toEqual(plan.jitterClip);
      expect(owner.jitter(8, 8, "left")).toEqual(plan.jitterClip);
      expect(createTarget).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
      expect(device.drawCommands).toHaveLength(0);
      const prepared = owner.preparePlanned(replacement, device, 8, 8, [], matrixAt(3), options);
      expect(prepared.historyValid).toBe(true);
      expect(prepared.history).toBe(seed.historyOutput);
      expect(() => owner.assertPlanCurrent(replacement, device, 8, 8, matrixAt(3), options)).toThrow(/stale or belongs/);
      expect(() => owner.preparePlanned(replacement, device, 8, 8, [], matrixAt(3), options)).toThrow(/stale or belongs/);
    } finally { owner.dispose(); device.dispose(); }
  });

  it("invalidates pending plans on history reset and device frame changes without retaining them", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "generation", { value: 1, writable: true });
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device);
    device.beginFrame(8, 8);
    const owner = new TemporalHistory(), options = { viewId: "view", frameId: 1, jitter: true };
    const createTarget = vi.spyOn(device, "createRenderTarget"), clear = vi.spyOn(device, "clear");
    try {
      const first = owner.planFrame(device, 8, 8, id(), options);
      owner.reset("camera-cut", "view");
      expect(owner.cancelPlan(first)).toBe(false);
      expect(() => owner.assertPlanCurrent(first, device, 8, 8, id(), options)).toThrow(/stale or belongs/);
      const second = owner.planFrame(device, 8, 8, id(), options);
      device.endFrame(); device.beginFrame(8, 8);
      expect(() => owner.assertPlanCurrent(second, device, 8, 8, id(), options)).toThrow(/stale or belongs/);
      const third = owner.planFrame(device, 8, 8, id(), options);
      expect(third).not.toBe(second);
      expect(owner.cancelPlan(second)).toBe(false);
      expect(() => owner.assertPlanCurrent(third, device, 8, 8, id(), options)).not.toThrow();
      owner.disposeView("view");
      expect(() => owner.assertPlanCurrent(third, device, 8, 8, id(), options)).toThrow(/stale or belongs/);
      expect(createTarget).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
      expect(device.drawCommands).toHaveLength(0);
    } finally { owner.dispose(); device.dispose(); }
  });

  it("keeps the consumed plan tied to its exact prepared frame and live attachments", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "generation", { value: 1, writable: true });
    const flags = createTrustedQrFlags({ A3D_QR_POST: true });
    setRendererQrFlags(flags, device); device.beginFrame(8, 8);
    const owner = new TemporalHistory(), foreign = new TemporalHistory();
    const options = { viewId: "prepared", frameId: 1, jitter: true };
    try {
      const plan = owner.planFrame(device, 8, 8, id(), options);
      const prepared = owner.preparePlanned(plan, device, 8, 8, [], id(), options);
      expect(() => owner.assertPlanCurrent(plan, device, 8, 8, id(), options)).toThrow(/stale or belongs/);
      expect(() => owner.assertPreparedPlanCurrent(plan, prepared)).not.toThrow();
      expect(() => foreign.assertPreparedPlanCurrent(plan, prepared)).toThrow(/stale or belongs/);
      expect(() => owner.assertPreparedPlanCurrent(plan, { ...prepared })).toThrow(/stale or belongs/);
      let reads = 0;
      const target = prepared.history, color = Object.getOwnPropertyDescriptor(target, "colorTexture")!;
      Object.defineProperty(target, "colorTexture", { configurable: true, get() { reads++; throw new Error("attachment getter"); } });
      try { expect(() => owner.assertPreparedPlanCurrent(plan, prepared)).toThrow(/stale or belongs/); }
      finally { Object.defineProperty(target, "colorTexture", color); }
      expect(reads).toBe(0);
      const texture = target.colorTexture, disposed = Object.getOwnPropertyDescriptor(texture, "disposed")!;
      Object.defineProperty(texture, "disposed", { ...disposed, value: true });
      try { expect(() => owner.assertPreparedPlanCurrent(plan, prepared)).toThrow(/stale or belongs/); }
      finally { Object.defineProperty(texture, "disposed", disposed); }
      const jittered = prepared.v2!.jittered, saved = jittered[0]!;
      jittered[0] = saved + 1;
      try { expect(() => owner.assertPreparedPlanCurrent(plan, prepared)).toThrow(/stale or belongs/); }
      finally { jittered[0] = saved; }
      setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device);
      expect(() => owner.assertPreparedPlanCurrent(plan, prepared)).toThrow(/stale or belongs/);
      setRendererQrFlags(flags, device);
      expect(() => owner.assertPreparedPlanCurrent(plan, prepared)).toThrow(/stale or belongs/);
      owner.commit("prepared", 1);
      const nextOptions = { ...options, frameId: 2 };
      const nextPlan = owner.planFrame(device, 8, 8, id(), nextOptions);
      const nextPrepared = owner.preparePlanned(nextPlan, device, 8, 8, [], id(), nextOptions);
      device.endFrame(); device.beginFrame(8, 8);
      expect(() => owner.assertPreparedPlanCurrent(nextPlan, nextPrepared)).toThrow(/stale or belongs/);
    } finally { owner.dispose(); foreign.dispose(); device.dispose(); }
  });

  it("invalidates prepared plans when their view history advances, resets or retires", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "generation", { value: 1, writable: true });
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device); device.beginFrame(8, 8);
    const owner = new TemporalHistory();
    const prepare = (frameId: number) => {
      const options = { viewId: "v", frameId, jitter: true };
      const plan = owner.planFrame(device, 8, 8, id(), options);
      return { plan, options, bindings: owner.preparePlanned(plan, device, 8, 8, [], id(), options) };
    };
    try {
      const first = prepare(1);
      expect(() => owner.assertPreparedPlanCurrent(first.plan, first.bindings)).not.toThrow();
      owner.commit("v", 1);
      expect(() => owner.assertPreparedPlanCurrent(first.plan, first.bindings)).toThrow(/stale or belongs/);
      const second = prepare(2);
      owner.reset("camera-cut", "v");
      expect(() => owner.assertPreparedPlanCurrent(second.plan, second.bindings)).toThrow(/stale or belongs/);
      const third = prepare(3);
      owner.prepare(device, 8, 8, [], id(), third.options);
      expect(() => owner.assertPreparedPlanCurrent(third.plan, third.bindings)).toThrow(/stale or belongs/);
      owner.commit("v", 3);
      const fourth = prepare(4);
      owner.disposeView("v");
      expect(() => owner.assertPreparedPlanCurrent(fourth.plan, fourth.bindings)).toThrow(/stale or belongs/);
    } finally { owner.dispose(); device.dispose(); }
  });

  it("rejects stale or borrowed temporal plans before allocating or drawing", () => {
    const device = new MockRenderDevice(), other = new MockRenderDevice();
    Object.defineProperty(device, "generation", { value: 1, writable: true });
    Object.defineProperty(other, "generation", { value: 1, writable: true });
    device.beginFrame(8, 8); other.beginFrame(8, 8);
    const flags = createTrustedQrFlags({ A3D_QR_POST: true });
    setRendererQrFlags(flags, device); setRendererQrFlags(flags, other);
    const owner = new TemporalHistory(), foreign = new TemporalHistory();
    const opts = { viewId: "v", frameId: 1, jitter: true };
    const createTarget = vi.spyOn(device, "createRenderTarget");
    try {
      const first = owner.planFrame(device, 8, 8, id(), opts);
      expect(() => foreign.preparePlanned(first, device, 8, 8, [], id(), opts)).toThrow(/stale or belongs/);
      expect(() => owner.preparePlanned(first, other, 8, 8, [], id(), opts)).toThrow(/stale or belongs/);
      expect(createTarget).not.toHaveBeenCalled();
      const changed = owner.planFrame(device, 8, 8, id(), opts);
      expect(() => owner.preparePlanned(changed, device, 8, 8, [], matrixAt(1), opts)).toThrow(/stale or belongs/);
      const valid = owner.planFrame(device, 8, 8, id(), opts);
      const seeded = owner.preparePlanned(valid, device, 8, 8, [], id(), opts);
      owner.commit("v", 1);
      const changedTarget = owner.planFrame(device, 8, 8, id(), { ...opts, frameId: 2 });
      const width = Object.getOwnPropertyDescriptor(seeded.history, "width")!;
      let targetReads = 0;
      Object.defineProperty(seeded.history, "width", { configurable: true, get() { targetReads++; throw new Error("target getter"); } });
      try {
        expect(() => owner.preparePlanned(changedTarget, device, 8, 8, [], id(), { ...opts, frameId: 2 })).toThrow(/stale or belongs/);
        expect(targetReads).toBe(0);
      } finally { Object.defineProperty(seeded.history, "width", width); }
      const priorFrame = owner.planFrame(device, 8, 8, id(), { ...opts, frameId: 2 });
      device.endFrame(); device.beginFrame(8, 8);
      expect(() => owner.preparePlanned(priorFrame, device, 8, 8, [], id(), { ...opts, frameId: 2 })).toThrow(/stale or belongs/);
      const stale = owner.planFrame(device, 8, 8, id(), { ...opts, frameId: 2 });
      const calls = createTarget.mock.calls.length;
      owner.reset("camera-cut", "v");
      expect(() => owner.preparePlanned(stale, device, 8, 8, [], id(), { ...opts, frameId: 2 })).toThrow(/stale or belongs/);
      expect(createTarget).toHaveBeenCalledTimes(calls);
      expect(device.drawCommands).toHaveLength(0);
      const next = owner.planFrame(device, 8, 8, id(), { ...opts, frameId: 2 });
      const changedFlags = createTrustedQrFlags({ A3D_QR_POST: true });
      setRendererQrFlags(changedFlags, device);
      expect(() => owner.preparePlanned(next, device, 8, 8, [], id(), { ...opts, frameId: 2 })).toThrow(/stale or belongs/);
      setRendererQrFlags(flags, device);
      const rebound = owner.planFrame(device, 8, 8, id(), { ...opts, frameId: 2 });
      setRendererQrFlags(changedFlags, device); setRendererQrFlags(flags, device);
      expect(() => owner.assertPlanCurrent(rebound, device, 8, 8, id(), { ...opts, frameId: 2 })).toThrow(/stale or belongs/);
      const lost = owner.planFrame(device, 8, 8, id(), { ...opts, frameId: 2 });
      expect(lost).not.toBe(rebound);
      device.contextLost = true; device.contextLost = false;
      (device as MockRenderDevice & { generation: number }).generation++;
      expect(() => owner.preparePlanned(lost, device, 8, 8, [], id(), { ...opts, frameId: 2 })).toThrow(/stale or belongs/);
      setRendererQrFlags({ values: {}, on: () => true }, device);
      expect(() => owner.planFrame(device, 8, 8, id(), { ...opts, frameId: 2 })).toThrow(/stable v2/);
    } finally { owner.dispose(); foreign.dispose(); device.dispose(); other.dispose(); }
  });

  it("does not invoke option or matrix accessors while planning", () => {
    const device = new MockRenderDevice(); setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device);
    Object.defineProperty(device, "generation", { value: 1, writable: true });
    device.beginFrame(8, 8);
    const owner = new TemporalHistory();
    let calls = 0;
    const options = { frameId: 1, get jitter(): boolean { calls++; throw new Error("option getter"); } };
    const matrix = Array.from(identityMat4());
    Object.defineProperty(matrix, "3", { get() { calls++; throw new Error("matrix getter"); } });
    const velocity = device.createRenderTarget({ width: 8, height: 8 }), reactive = device.createRenderTarget({ width: 8, height: 8 });
    const width = Object.getOwnPropertyDescriptor(velocity, "width")!;
    try {
      expect(() => owner.planFrame(device, 8, 8, id(), options)).toThrow(/does not invoke option accessors/);
      expect(() => owner.planFrame(device, 8, 8, matrix, { frameId: 1 })).toThrow(/does not invoke matrix accessors/);
      Object.defineProperty(velocity, "width", { configurable: true, get() { calls++; throw new Error("target getter"); } });
      expect(() => owner.planFrame(device, 8, 8, id(), { frameId: 1, reconstruction: "temporal", velocity, reactive }))
        .toThrow(/does not invoke target accessors/);
      expect(calls).toBe(0);
      expect(device.drawCommands).toHaveLength(0);
    } finally { Object.defineProperty(velocity, "width", width); owner.dispose(); velocity.dispose(); reactive.dispose(); device.dispose(); }
  });

  it("rejects borrowed targets with disposed textures before allocating or drawing", () => {
    const device = new MockRenderDevice(); Object.defineProperty(device, "generation", { value: 1, writable: true });
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device); device.beginFrame(8, 8);
    const owner = new TemporalHistory();
    const velocity = device.createRenderTarget({ width: 8, height: 8 }), reactive = device.createRenderTarget({ width: 8, height: 8 });
    const createTarget = vi.spyOn(device, "createRenderTarget");
    velocity.colorTexture.dispose();
    try {
      expect(() => owner.planFrame(device, 8, 8, id(), { frameId: 1, reconstruction: "temporal", velocity, reactive }))
        .toThrow(/live target textures/);
      expect(createTarget).not.toHaveBeenCalled();
      expect(device.drawCommands).toHaveLength(0);
    } finally { owner.dispose(); velocity.dispose(); reactive.dispose(); device.dispose(); }
  });

  it("rejects an item accessor before it can reset planned history", () => {
    const device = new MockRenderDevice(); Object.defineProperty(device, "generation", { value: 1, writable: true });
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device);
    device.beginFrame(8, 8);
    const owner = new TemporalHistory();
    const first = { viewId: "reentrant", frameId: 1, jitter: true };
    try {
      owner.prepare(device, 8, 8, [], id(), first);
      owner.commit("reentrant", 1);
      const options = { ...first, frameId: 2 };
      const plan = owner.planFrame(device, 8, 8, id(), options);
      expect(plan.jitterClip).not.toEqual([0, 0]);
      let calls = 0;
      const changing = { get geometry() { calls++; owner.reset("camera-cut", "reentrant"); return triangle; } };
      expect(() => owner.preparePlanned(plan, device, 8, 8, [changing], id(), options)).toThrow(/does not invoke item accessors/);
      expect(calls).toBe(0);
      expect(owner.jitter(8, 8, "reentrant")).toEqual(plan.jitterClip);
      const next = owner.planFrame(device, 8, 8, id(), options);
      const list = [item({})];
      Object.defineProperty(list, "0", { get() { calls++; return item({}); } });
      expect(() => owner.preparePlanned(next, device, 8, 8, list, id(), options)).toThrow(/does not invoke item-list accessors/);
      expect(calls).toBe(0);
      expect(device.drawCommands).toHaveLength(0);
    } finally { owner.dispose(); device.dispose(); }
  });

  it("plans a render-size change without discarding temporal reconstruction history", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "generation", { value: 1, writable: true });
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device);
    device.beginFrame(8, 8);
    const owner = new TemporalHistory();
    const makeTarget = (size: number) => device.createRenderTarget({ width: size, height: size, format: "rgba16f" });
    const velocityA = makeTarget(8), reactiveA = makeTarget(8), velocityB = makeTarget(12), reactiveB = makeTarget(12);
    const common = { viewId: "scale", reconstruction: "temporal" as const, outputWidth: 16, outputHeight: 16, jitter: true };
    try {
      const defaultSizeOptions = { viewId: "defaults", frameId: 1, reconstruction: "temporal" as const, velocity: velocityA, reactive: reactiveA };
      const defaultSizePlan = owner.planFrame(device, 8, 8, id(), defaultSizeOptions);
      expect(owner.planFrame(device, 8, 8, id(), { ...defaultSizeOptions, outputWidth: 8, outputHeight: 8 })).toBe(defaultSizePlan);
      owner.cancelPlan(defaultSizePlan);
      const seedOptions = { ...common, frameId: 1, velocity: velocityA, reactive: reactiveA };
      const seed = owner.planFrame(device, 8, 8, id(), seedOptions);
      const initial = owner.preparePlanned(seed, device, 8, 8, [], id(), seedOptions);
      owner.commit("scale", 1);
      const nextOptions = { ...common, frameId: 2, velocity: velocityB, reactive: reactiveB };
      const next = owner.planFrame(device, 12, 12, id(), nextOptions);
      expect(next.jitterClip).toEqual(temporalJitter(1, true, 12, 12));
      const prepared = owner.preparePlanned(next, device, 12, 12, [], id(), nextOptions);
      expect(prepared.historyValid).toBe(true);
      expect(prepared.history).toBe(initial.historyOutput);
      expect(prepared.v2!.linZ).toBe(initial.v2!.linZOutput);
      expect(prepared.v2!.jitterClip).toEqual(next.jitterClip);
      expect(Array.from(prepared.v2!.jittered)).toEqual(next.jittered);
    } finally {
      owner.dispose(); velocityA.dispose(); reactiveA.dispose(); velocityB.dispose(); reactiveB.dispose(); device.dispose();
    }
  });

  it("keeps prior depth and display history alive across render-resolution changes", () => {
    const device = new MockRenderDevice(); setRendererQrFlags(v2Flags, device);
    const owner = new TemporalHistory();
    const makeInput = (w: number) => device.createRenderTarget({ width: w, height: w, format: "rgba16f" });
    const velocityA = makeInput(8), reactiveA = makeInput(8);
    const common = { viewId: "v", reconstruction: "temporal" as const, outputWidth: 16, outputHeight: 16 };
    const seed = owner.prepare(device, 8, 8, [], id(), { ...common, frameId: 1, velocity: velocityA, reactive: reactiveA });
    owner.commit("v", 1);
    const velocityB = makeInput(12), reactiveB = makeInput(12);
    const alias = { ...reactiveB, colorTexture: seed.historyOutput.colorTexture,
      colorTextures: [seed.historyOutput.colorTexture], dispose: () => {} };
    expect(() => owner.prepare(device, 12, 12, [], id(), { ...common, frameId: 2, velocity: velocityB, reactive: alias })).toThrow(/dimensions|aliases another temporal resource/);
    expect(() => owner.prepare(device, 8, 8, [], id(), { ...common, frameId: 1, velocity: velocityA, reactive: reactiveA })).toThrow(/cannot be resumed/);
    const resized = owner.prepare(device, 12, 12, [], id(), { ...common, frameId: 2, velocity: velocityB, reactive: reactiveB });
    expect(resized.historyValid).toBe(true);
    expect(resized.history).toBe(seed.historyOutput);
    expect(resized.v2!.linZ).toBe(seed.v2!.linZOutput);
    expect(resized.v2!.linZ.disposed).toBe(false);
    expect(resized.v2!.linZ.width).toBe(8);
    expect(resized.v2!.linZOutput.width).toBe(12);
    expect(resized.v2!.reactive).toBe(reactiveB);
    owner.commit("v", 2);
    const next = owner.prepare(device, 12, 12, [], id(), { ...common, frameId: 3, velocity: velocityB, reactive: reactiveB });
    expect(next.v2!.linZ).toBe(resized.v2!.linZOutput);
    expect(seed.v2!.linZ.disposed).toBe(true);
    owner.dispose();
    expect(velocityA.disposed || reactiveA.disposed || velocityB.disposed || reactiveB.disposed).toBe(false);
    velocityA.dispose(); reactiveA.dispose(); velocityB.dispose(); reactiveB.dispose(); device.dispose();
  });

  it("rejects absent or aliased reconstruction inputs and reports camera-only unsupported motion", () => {
    const device = new MockRenderDevice(); setRendererQrFlags(v2Flags, device);
    const owner = new TemporalHistory();
    const velocity = device.createRenderTarget({ width: 8, height: 8 });
    expect(() => owner.prepare(device, 8, 8, [], id(), { reconstruction: "temporal" })).toThrow(/requires populated/);
    expect(() => owner.prepare(device, 8, 8, [], id(), { velocity, reactive: velocity })).toThrow(/must not alias/);
    const morphed = { ...item({}), morphTargets: [{} as never], writesReactive: true };
    const frame = owner.prepare(device, 8, 8, [morphed], id(), { frameId: 1 });
    expect(frame.v2!.motionSource).toBe("camera");
    expect(frame.v2!.unsupportedMotion).toEqual(expect.arrayContaining(["morph-motion", "transparent-reactive", "object-motion", "previous-depth-approximation"]));
    expect(frame.v2!.reactive).toBeUndefined();
    expect(temporalCanAccumulate(true, frame.v2!.unsupportedMotion)).toBe(false);
    expect(temporalCanAccumulate(true, ["previous-depth-approximation"])).toBe(true);
    // Different wrappers for one texture are still the same attachment.
    const alias = { ...velocity, colorTexture: frame.historyOutput.colorTexture,
      colorTextures: [frame.historyOutput.colorTexture], dispose: () => {} };
    expect(() => owner.prepare(device, 8, 8, [], id(), { frameId: 2, reactive: alias })).toThrow(/aliases another temporal resource/);
    owner.dispose(); velocity.dispose(); device.dispose();
  });

  it("rejects in-place palette changes during repeated passes of the same frame", () => {
    const device = new MockRenderDevice(); setRendererQrFlags(v2Flags, device);
    const owner = new TemporalHistory(), key = {};
    const skinning = { jointCount: 1, matrices: id() };
    const skinned = { ...item(key), skinning };
    owner.prepare(device, 8, 8, [skinned], id(), { frameId: 1 });
    skinning.matrices[12] = 3;
    expect(() => owner.prepare(device, 8, 8, [skinned], id(), { frameId: 1 })).toThrow(/changed its view/);
    owner.dispose(); device.dispose();
  });

  it("reseeds after partial preparation or a disposed frame attachment", () => {
    const device = new MockRenderDevice(); setRendererQrFlags(v2Flags, device);
    const owner = new TemporalHistory(), key = {};
    owner.prepare(device, 8, 8, [item(key)], id(), { frameId: 1 });
    owner.commit(undefined, 1);
    const malformed = { ...item(key, 1), previousModelMatrix: new Float32Array(3) };
    expect(() => owner.prepare(device, 8, 8, [malformed], id(), { frameId: 2 })).toThrow(/finite mat4/);
    const retry = owner.prepare(device, 8, 8, [item(key, 2)], id(), { frameId: 2 });
    expect(retry.historyValid).toBe(false);
    expect(retry.v2!.coverage).toMatchObject({ items: 1, withVelocity: 0 });
    retry.historyOutput.dispose();
    expect(() => owner.commit(undefined, 2)).toThrow(/disposed attachment/);
    const next = owner.prepare(device, 8, 8, [item(key, 3)], id(), { frameId: 3 });
    expect(next.historyValid).toBe(false);
    expect(next.historyOutput.disposed).toBe(false);
    owner.dispose(); device.dispose();
  });
});

describe("temporal reconstruction math and native GPU bindings", () => {
  it("decodes standard and reversed depth, including infinite perspective and orthographic projections", () => {
    for (const convention of ["standard", "reversed"] as const) {
      const nearValue = convention === "standard" ? 0 : 1;
      const farValue = 1 - nearValue;
      expect(temporalLinearDepth(nearValue, 1, 100, "perspective", convention)).toBeCloseTo(1);
      expect(temporalLinearDepth(farValue, 1, 100, "perspective", convention)).toBeCloseTo(100);
      expect(temporalLinearDepth(nearValue, 1, 100, "orthographic", convention)).toBeCloseTo(1);
      expect(temporalLinearDepth(farValue, 1, 100, "orthographic", convention)).toBeCloseTo(100);
      expect(temporalLinearDepth(farValue, 1, Infinity, "perspective", convention)).toBe(Infinity);
    }
    expect(temporalLinearDepth(.25, -2, 2, "orthographic")).toBe(-1);
    expect(temporalLinearDepth(.75, -2, 2, "orthographic", "reversed")).toBe(-1);
    expect(() => temporalLinearDepth(.5, 0, 2, "perspective")).toThrow();
    expect(() => temporalLinearDepth(.5, 1, Infinity, "orthographic")).toThrow();
  });

  it("rejects empty depth between surfaces and reactive pixels, and uses prior raster jitter", () => {
    expect(temporalDepthAccepted(5, [1, 9])).toBe(false);
    expect(temporalDepthAccepted(1, [1.05, 9])).toBe(true);
    expect(temporalDepthAccepted(-1, [-1.05], .1, .001, -2)).toBe(true);
    expect(temporalDepthAccepted(-1, [3e38], .1, .001, -2)).toBe(false);
    expect(temporalDepthAccepted(3e38, [-1], .1, .001, -2)).toBe(false);
    expect(temporalDepthAccepted(-3, [-3], .1, .001, -2)).toBe(false);
    expect(temporalFeedbackWeight(.8, .95, 0, 1)).toBe(0);
    expect(temporalFeedbackWeight(.8, .95, 0, 0, true, false)).toBe(0);
    const result = temporalReprojection([.5, .5], [.1, .2], [.01, -.02], [-.03, .04]);
    expect(result.currentUv[0]).toBeCloseTo(.51);
    expect(result.previousUv[1]).toBeCloseTo(.3);
    expect(result.previousDepthUv[0]).toBeCloseTo(.37);
    expect(result.previousDepthUv[1]).toBeCloseTo(.34);
    expect(temporalReprojection([.05, .5], [.1, 0]).historyInBounds).toBe(false);
    expect(temporalJitter(0, false, 64, 64)).toEqual([0, 0]);
    expect(() => temporalJitter(1, true, 0, 64)).toThrow();
    for (const f of [0, .1, .5, .9, 1]) expect(temporalCubicWeights(f).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it("removes raster jitter before camera reprojection in both texture origins", () => {
    const previous = id(); previous[0] = 2; previous[5] = .5;
    const jittered = temporalCameraVelocity([.75, .6], [.1, .05], .3, previous);
    const unjittered = temporalCameraVelocity([.70, .575], [0, 0], .3, previous);
    expect(jittered[0]).toBeCloseTo(-.2, 12);
    expect(jittered[1]).toBeCloseTo(.0375, 12);
    expect(jittered[0]).toBeCloseTo(unjittered[0], 12);
    expect(jittered[1]).toBeCloseTo(unjittered[1], 12);
    const topLeft = temporalCameraVelocity([.75, .4], [.1, .05], .3, previous, "top-left");
    expect(topLeft[0]).toBeCloseTo(-.2, 12);
    expect(topLeft[1]).toBeCloseTo(-.0375, 12);
    expect(temporalCameraVelocity([.75, .6], [.1, .05], .3, id())).toEqual([0, 0]);
  });

  it("validates mixed-size GPU inputs and packs integer flags and top-left jitter bytes", () => {
    const device = new MockRenderDevice(); setRendererQrFlags(v2Flags, device);
    const owner = new TemporalHistory();
    const source = device.createRenderTarget({ width: 8, height: 8 });
    const velocity = device.createRenderTarget({ width: 8, height: 8 });
    const reactive = device.createRenderTarget({ width: 8, height: 8 });
    const frame = owner.prepare(device, 8, 8, [], id(), { reconstruction: "temporal", outputWidth: 16, outputHeight: 16, velocity, reactive });
    const options = { ...frame, v2: { ...frame.v2!, depthNear: -2, jitterClip: [0.02, 0.04] as const, previousJitterClip: [-0.06, 0.08] as const }, hasExpectedDepth: true };
    expect(() => validateWebGPUTemporalInputs(source, options)).not.toThrow();
    const packed = webgpuTaaResolveUniforms(options);
    const bytes = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
    expect(bytes.byteLength).toBe(48);
    expect(bytes.getInt32(0, true)).toBe(1);
    expect(bytes.getInt32(4, true)).toBe(0);
    expect(bytes.getInt32(20, true)).toBe(1);
    expect(bytes.getFloat32(24, true)).toBeCloseTo(.01);
    expect(bytes.getFloat32(28, true)).toBeCloseTo(-.02);
    expect(bytes.getFloat32(32, true)).toBeCloseTo(-.03);
    expect(bytes.getFloat32(36, true)).toBeCloseTo(-.04);
    expect(bytes.getFloat32(40, true)).toBe(-2);
    const blocked = webgpuTaaResolveUniforms({ ...options, historyValid: true, v2: { ...options.v2, unsupportedMotion: ["object-motion"] } });
    expect(new DataView(blocked.buffer, blocked.byteOffset, blocked.byteLength).getInt32(4, true)).toBe(0);
    expect(() => validateWebGPUTemporalInputs(source, { ...options, historyOutput: options.history })).toThrow(/alias/);
    owner.dispose(); source.dispose(); velocity.dispose(); reactive.dispose(); device.dispose();
  });

  it("uploads signed near depth and rejects unsupported history on the actual WebGL resolve path", () => {
    const device = new MockRenderDevice(); setRendererQrFlags(v2Flags, device);
    const create = device.createRenderTarget.bind(device);
    device.createRenderTarget = descriptor => Object.assign(create(descriptor), {
      framebuffer: {}, colorHandle: {}, depthTextureHandle: descriptor.depth ? {} : null
    });
    const uniforms = new Map<string, number[]>();
    const vectors = new Map<string, number[][]>();
    const depthHandles = new Map<unknown, unknown>();
    let boundFramebuffer: unknown;
    let failResolve = false, drawingResolve = false, failFinal = false, drawingNative = false, failDelete = false, deletedTextures = 0, drawCalls = 0, invalidations = 0;
    let phase: "taa" | "effect" = "taa";
    const methods: Record<string, (...args: any[]) => unknown> = {
      createVertexArray: () => ({}), createTexture: () => ({}), createShader: () => ({}), createProgram: () => ({}),
      getShaderParameter: () => true, getProgramParameter: () => true,
      getUniformLocation: (_program, name) => name,
      bindFramebuffer: (_target, framebuffer) => { boundFramebuffer = framebuffer; },
      uniform1i: (name, value) => { const values = uniforms.get(name) ?? []; values.push(value); uniforms.set(name, values); if (name === "u_hasHistory") { if (phase === "taa") drawingResolve = true; else drawingNative = true; } },
      uniform1f: (name, value) => { const values = uniforms.get(name) ?? []; values.push(value); uniforms.set(name, values); },
      uniform2f: (name, x, y) => { const values = vectors.get(name) ?? []; values.push([x, y]); vectors.set(name, values); },
      drawArrays: () => {
        drawCalls += 1;
        if (drawingResolve) { drawingResolve = false; if (failResolve) throw new Error("resolve failed"); }
        else if (phase === "effect" && drawingNative) drawingNative = false;
        else if (phase === "effect" && failFinal) throw new Error("presentation failed");
      },
      deleteProgram: () => { if (failDelete) throw new Error("program delete failed"); },
      deleteTexture: () => { deletedTextures += 1; }
    };
    const gl = new Proxy(methods, { get(target, prop: string) {
      if (prop in target) return target[prop];
      return /^[A-Z][A-Z0-9_]*$/.test(prop) ? 1 : () => undefined;
    } }) as unknown as WebGL2RenderingContext;
    const host = { gl, device, stateCache: { invalidate() { invalidations += 1; } }, resolveMultisampleTarget() {}, lifecycle: { bindOutput() {} },
      textureRegistry: { textures: depthHandles } } as unknown as WebGL2DeviceHost;
    const owner = new TemporalHistory(), key = {};
    owner.prepare(device, 8, 8, [item(key)], id(), { frameId: 1, depthNear: -2, jitter: true }); owner.commit(undefined, 1);
    const frame = owner.prepare(device, 8, 8, [item(key, 1)], id(), { frameId: 2, depthNear: -2, jitter: true });
    expect(frame.historyValid).toBe(true);
    expect(frame.v2!.unsupportedMotion).toContain("object-motion");
    const source = device.createRenderTarget({ width: 8, height: 8, depth: "texture" });
    const camera = { near: -2, far: 10, projection: "orthographic", viewProjectionMatrix: id(), previousViewProjectionMatrix: null, viewMatrix: id(), projectionMatrix: id(), position: [0, 0, 0] } as const;
    const pipeline = { antiAliasing: "taa", depthRange: { near: -2, far: 10, projection: "orthographic" }, exposure: 1, toneMapping: "aces", dither: false } as const;
    const scopeId = {};
    const token = postDiagnostics.begin(scopeId, "view", 2);
    const postContext = { source: {}, items: [], scopeId, viewId: "view", frameId: 2, diagnosticToken: token,
      sceneDepth: { texture: null, available: false, linearize: { near: -2, far: 10, orthographic: true } } };
    runV2HdrStages(host, source, pipeline, camera, frame, postContext);
    const supported = { ...frame, v2: { ...frame.v2!, unsupportedMotion: ["previous-depth-approximation"] } };
    runV2HdrStages(host, source, pipeline, camera, supported, postContext);
    expect(uniforms.get("u_hasHistory")).toEqual([0, 1]);
    expect(uniforms.get("u_depthNear")).toEqual([-2, -2]);
    expect(vectors.get("u_jitterClip")).toEqual(Array.from({ length: 4 }, () => [...frame.v2!.jitterClip]));
    expect(postDiagnostics.snapshotToken(token)?.stagesRan).toEqual(expect.arrayContaining(["S1:depth-prep"]));
    expect(postDiagnostics.snapshotToken(token)?.skipped).toEqual(expect.arrayContaining(["POSTPROCESS_MOTION_UNSUPPORTED:object-motion"]));
    expect(new DataView(webgpuTaaResolveUniforms(frame).buffer).getInt32(4, true)).toBe(0);
    expect(new DataView(webgpuTaaResolveUniforms(supported).buffer).getInt32(4, true)).toBe(1);
    expect(consumeTaaHistoryWritten(scopeId, "view", 2)).toBe(true);
    // Renderer-owned motion: exact previous depth in velocity.a reaches dilation and the resolve.
    expect(uniforms.get("u_hasExpectedDepth")!.every(value => value === 0)).toBe(true);
    const ownedDepthStart = uniforms.get("u_hasExpectedDepth")!.length;
    const owned = { ...supported, v2: { ...supported.v2!, motionSource: "object" as const, previousDepth: "object-velocity" as const } };
    runV2HdrStages(host, source, pipeline, camera, owned, postContext);
    expect(uniforms.get("u_hasExpectedDepth")!.slice(ownedDepthStart)).toEqual([1, 1]);
    expect(consumeTaaHistoryWritten(scopeId, "view", 2)).toBe(true);
    failResolve = true;
    expect(() => runV2HdrStages(host, source, pipeline, camera, supported, postContext)).toThrow("resolve failed");
    expect(consumeTaaHistoryWritten(scopeId, "view", 2)).toBe(false);
    failResolve = false;
    const borrowedHistory = runV2HdrStages(host, source, pipeline, camera, supported, postContext, { retainOutputLease: true });
    expect(borrowedHistory.target).toBe(supported.historyOutput);
    expect(borrowedHistory.outputLease).toBeUndefined();
    expect(consumeTaaHistoryWritten(scopeId, "view", 2)).toBe(true);
    let localPostFlag = false;
    const custom: PostPassDescriptor = { id: "deferred-velocity", owner: "prd03", flag: "A3D_QR_POST", insertAt: "before-tonemap", space: "linear-hdr",
      inputs: ["color", "velocity"], gpuOnly: true, fragment: { glsl: "void main() {}" },
      uniforms: (context) => { localPostFlag = context.flags.on("A3D_QR_POST"); return {}; }
    };
    const colorOnly: PostPassDescriptor = { ...custom, inputs: ["color"] };
    const retainedHdr = runV2HdrStages(host, source, { ...pipeline, antiAliasing: "off", customPasses: [colorOnly] }, camera, undefined, undefined, { retainOutputLease: true });
    expect(retainedHdr.outputLease?.target).toBe(retainedHdr.target);
    releaseV2Target(host, retainedHdr.target);
    const whileHdrRetained = acquireV2Target(host, { width: 8, height: 8, format: "rgba16f" });
    expect(whileHdrRetained).not.toBe(retainedHdr.target);
    releaseV2Target(host, whileHdrRetained);
    retainedHdr.outputLease!.release();

    const legacyHdr = runV2HdrStages(host, source, { ...pipeline, antiAliasing: "off", customPasses: [colorOnly] }, camera);
    expect(legacyHdr.outputLease).toBeUndefined();
    releaseV2Target(host, legacyHdr.target);
    const legacyReused = acquireV2Target(host, { width: 8, height: 8, format: "rgba16f" });
    expect(legacyReused).toBe(legacyHdr.target);
    releaseV2Target(host, legacyReused);

    const replacedHdr = acquireV2Target(host, { width: 8, height: 8, format: "rgba16f" });
    releaseV2Target(host, replacedHdr);
    const afterDepthPass: PostPassDescriptor = { ...colorOnly, id: "ao-replaces-custom", insertAt: "after-depth", uniforms: () => {
      expect(boundFramebuffer).toBe((replacedHdr as unknown as { framebuffer: unknown }).framebuffer);
      return {};
    } };
    const aoResult = runV2HdrStages(host, source, { ...pipeline, antiAliasing: "off", ao: {}, customPasses: [afterDepthPass] }, camera);
    expect(aoResult.target).not.toBe(replacedHdr);
    const recoveredAfterAo = acquireV2Target(host, { width: 8, height: 8, format: "rgba16f" });
    expect(recoveredAfterAo).toBe(replacedHdr);
    releaseV2Target(host, recoveredAfterAo);
    releaseV2Target(host, aoResult.target);

    const deferred = runV2HdrStages(host, source, { ...pipeline, antiAliasing: "off", customPasses: [custom] }, camera, frame, undefined, { deferBeforeTonemap: true }).afterBloom!;
    const deferredOutput = deferred.run({ colorHandle: (source as unknown as { colorHandle: WebGLTexture }).colorHandle, width: 8, height: 8 });
    expect(localPostFlag).toBe(true);
    // A target-only callback from an older owner must not release this
    // explicitly retained deferred result while the stage still owns it.
    releaseV2Target(host, deferredOutput as unknown as RenderTarget);
    const whileDeferred = acquireV2Target(host, { width: 8, height: 8, format: "rgba16f" });
    expect(whileDeferred).not.toBe(deferredOutput);
    releaseV2Target(host, whileDeferred);
    deferred.release();
    const reused = acquireV2Target(host, { width: 8, height: 8, format: "rgba16f" });
    deferred.release();
    const concurrent = acquireV2Target(host, { width: 8, height: 8, format: "rgba16f" });
    expect(concurrent).not.toBe(reused);
    expect(() => deferred.run({ colorHandle: (source as unknown as { colorHandle: WebGLTexture }).colorHandle, width: 8, height: 8 })).toThrow("POSTPROCESS_DEFERRED_STAGE_RELEASED");
    releaseV2Target(host, reused); releaseV2Target(host, concurrent);

    const hdrScratch = acquireV2Target(host, { width: 8, height: 8, format: "rgba16f" });
    releaseV2Target(host, hdrScratch);
    let selfReleasingStage: DeferredAfterBloomStage | undefined;
    let requestedRelease = false;
    const selfReleasingPass: PostPassDescriptor = { ...colorOnly, id: "release-during-draw", uniforms: () => {
      expect(boundFramebuffer).toBe((hdrScratch as unknown as { framebuffer: unknown }).framebuffer);
      selfReleasingStage!.release();
      requestedRelease = true;
      return {};
    } };
    selfReleasingStage = runV2HdrStages(host, source, { ...pipeline, antiAliasing: "off", customPasses: [selfReleasingPass] }, camera, undefined, undefined, { deferBeforeTonemap: true }).afterBloom!;
    expect(() => selfReleasingStage!.run({ colorHandle: (source as unknown as { colorHandle: WebGLTexture }).colorHandle, width: 8, height: 8 })).toThrow("POSTPROCESS_DEFERRED_STAGE_RELEASED");
    expect(requestedRelease).toBe(true);
    const recoveredHdr = acquireV2Target(host, { width: 8, height: 8, format: "rgba16f" });
    expect(recoveredHdr).toBe(hdrScratch);
    releaseV2Target(host, recoveredHdr);
    selfReleasingStage.release();

    const ldr = device.createRenderTarget({ width: 8, height: 8, format: "rgba8" });
    const oldDisplay = acquireV2Target(host, { width: 8, height: 8, format: "rgba8" });
    releaseV2Target(host, oldDisplay);
    let protectedDisplay = false;
    const displayPass: PostPassDescriptor = { ...colorOnly, id: "display-stale-release", insertAt: "after-tonemap", space: "display", uniforms: () => {
      expect(boundFramebuffer).toBe((oldDisplay as unknown as { framebuffer: unknown }).framebuffer);
      releaseV2Target(host, oldDisplay);
      const other = acquireV2Target(host, { width: 8, height: 8, format: "rgba8" });
      expect(other).not.toBe(oldDisplay);
      releaseV2Target(host, other);
      protectedDisplay = true;
      return {};
    } };
    runV2LdrTail(host, ldr, { ...pipeline, antiAliasing: "off", customPasses: [displayPass] }, undefined);
    expect(protectedDisplay).toBe(true);

    const gradeScratch = acquireV2Target(host, { width: 8, height: 8, format: "rgba8" });
    releaseV2Target(host, gradeScratch);
    const depthScratch = acquireV2Target(host, { width: 8, height: 8, format: "rgba32f" });
    releaseV2Target(host, depthScratch);
    if (!source.depthTexture) throw new Error("Expected a depth texture for the failure regression");
    depthHandles.set(source.depthTexture, {});
    const failingPass: PostPassDescriptor = { ...displayPass, id: "display-failure-cleanup", inputs: ["color", "depth"],
      uniforms: () => { throw new Error("custom display failure"); } };
    const depthContext = { ...postContext, sceneDepth: { texture: source.depthTexture, available: true,
      linearize: { near: -2, far: 10, orthographic: true } } };
    const beforeCustomFailure = invalidations;
    expect(() => runV2LdrTail(host, ldr, { ...pipeline, antiAliasing: "off", vignette: { intensity: 0.2 }, customPasses: [failingPass] }, undefined, depthContext)).toThrow("custom display failure");
    expect(invalidations - beforeCustomFailure).toBe(1);
    const recoveredGrade = acquireV2Target(host, { width: 8, height: 8, format: "rgba8" });
    const recoveredDepth = acquireV2Target(host, { width: 8, height: 8, format: "rgba32f" });
    expect(recoveredGrade).toBe(gradeScratch);
    expect(recoveredDepth).toBe(depthScratch);
    expect(source.disposed).toBe(false);
    expect(ldr.disposed).toBe(false);
    releaseV2Target(host, recoveredGrade);
    releaseV2Target(host, recoveredDepth);

    let drawsAtDisposal = -1;
    const disposedPass: PostPassDescriptor = { ...displayPass, id: "dispose-during-uniforms", uniforms: () => {
      drawsAtDisposal = drawCalls;
      disposeNativePostEffects(host);
      return {};
    } };
    expect(() => runV2LdrTail(host, ldr, { ...pipeline, antiAliasing: "off", customPasses: [disposedPass] }, undefined)).toThrow("POSTPROCESS_STATE_INVALIDATED");
    expect(drawsAtDisposal).toBeGreaterThanOrEqual(0);
    expect(drawCalls).toBe(drawsAtDisposal);
    expect(source.disposed).toBe(false);
    expect(ldr.disposed).toBe(false);

    phase = "effect";
    const afterimage = { ...pipeline, antiAliasing: "off", nativeEffects: [{ kind: "afterimage", decay: .5 }] } as const;
    const previousValues = uniforms.get("u_hasHistory")!.length;
    const frameContext = (frameId: number) => ({ ...postContext, frameId, diagnosticToken: postDiagnostics.begin(scopeId, "view", frameId) });
    runV2LdrTail(host, ldr, afterimage, undefined, frameContext(1));
    runV2LdrTail(host, ldr, afterimage, undefined, frameContext(2));
    failFinal = true;
    const beforeFinalFailure = invalidations;
    expect(() => runV2LdrTail(host, ldr, afterimage, undefined, frameContext(2))).toThrow("presentation failed");
    expect(invalidations - beforeFinalFailure).toBe(1);
    failFinal = false;
    runV2LdrTail(host, ldr, afterimage, undefined, frameContext(3));
    expect(uniforms.get("u_hasHistory")!.slice(previousValues)).toEqual([0, 1, 1, 0]);
    failDelete = true;
    expect(() => disposeNativePostEffects(host)).toThrow("Native post effect disposal failed");
    expect(deletedTextures).toBeGreaterThan(0);
    // Failed program deletions remain queued while the failure persists.
    expect(() => disposeNativePostEffects(host)).toThrow("Native post effect disposal failed");
    failDelete = false;
    expect(() => disposeNativePostEffects(host)).not.toThrow();
    expect(() => disposeNativePostEffects(host)).not.toThrow();
    postDiagnostics.resetScope(scopeId); owner.dispose(); source.dispose(); ldr.dispose(); device.dispose();
  });
});

describe("renderer-owned object motion", () => {
  const translate = (x: number, y = 0, z = 0) => { const out = id(); out[12] = x; out[13] = y; out[14] = z; return out; };
  const mul = (a: ArrayLike<number>, b: ArrayLike<number>) => Float32Array.from(multiplyMat4(Array.from(a) as never, Array.from(b) as never));
  const apply = (m: ArrayLike<number>, p: readonly number[]) => [0, 1, 2, 3].map(r => m[r]! * p[0]! + m[4 + r]! * p[1]! + m[8 + r]! * p[2]! + m[12 + r]! * (p[3] ?? 1));
  const skinned = () => {
    const buffer = new VertexBuffer(VertexFormat.P3J4W4, 3);
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]].forEach((p, v) => {
      buffer.setAttribute(v, "position", p); buffer.setAttribute(v, "joints", [0, 1, 0, 0]); buffer.setAttribute(v, "weights", [0.5, 0.5, 0, 0]);
    });
    return new Geometry(buffer, null, "triangles");
  };

  it("compiles the motion program and deforms the current and previous pose independently", () => {
    const executable = spawnSync("glslangValidator", ["--version"], { stdio: "ignore" });
    if (!executable.error) {
      const dir = mkdtempSync(join(tmpdir(), "aura-object-motion-"));
      try {
        for (const [stage, ext] of [["vertex", "vert"], ["fragment", "frag"]] as const) {
          const path = join(dir, `motion.${ext}`);
          writeFileSync(path, OBJECT_MOTION_SHADER[stage]);
          const compiled = spawnSync("glslangValidator", ["-S", ext, path], { encoding: "utf8" });
          expect(compiled.status, compiled.stdout + compiled.stderr).toBe(0);
        }
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    if (process.env.A3D_REQUIRE_GLSLANG === "1") expect(executable.error).toBeUndefined();
    // Morph (weights 0.5 now, 0.25 before) then skin (joint 1 moved +2 x now, +1 x before).
    const geometry = skinned();
    const palette = new Float32Array([...id(), ...translate(2)]);
    const previousPalette = new Float32Array([...id(), ...translate(1)]);
    const morphTargets = [{ positions: [[0, 0, 4], [0, 0, 4], [0, 0, 4]] as [number, number, number][] }];
    const deformed = deformObjectMotionGeometry({ geometry, skinning: { jointCount: 2, matrices: palette }, morphTargets, morphWeights: [0.5] },
      { previousMorphWeights: Float32Array.of(0.25), previousJointMatrices: previousPalette })!;
    const data = Array.from(deformed.vertexBuffer.floats);
    // vertex 1: rest (1,0,0); current: +z 2, skin x + 0.5*2; previous: +z 1, x + 0.5*1.
    expect(data.slice(6, 12)).toEqual([2, 0, 2, 1.5, 0, 1]);
    expect(data.slice(0, 6)).toEqual([1, 0, 2, 0.5, 0, 1]);
    deformed.dispose(); geometry.dispose();
  });

  it("commits the previous projection with the view-projection and clears it on reset", () => {
    const history = new VelocityHistory();
    const first = Float32Array.from(perspectiveMat4(1, 1, 0.5, 50));
    const second = Float32Array.from(perspectiveMat4(0.8, 1, 0.5, 50, { mode: "reversed" }));
    const a = history.prepare(id(), [0, 0], 1, first);
    expect(Array.from(a.previousProjection!)).toEqual(Array.from(first));
    history.commit(1);
    const b = history.prepare(id(), [0, 0], 2, second);
    expect(Array.from(b.projection!)).toEqual(Array.from(second));
    expect(Array.from(b.previousProjection!)).toEqual(Array.from(first));
    expect(() => history.prepare(id(), [0, 0], 2, first)).toThrow(/projection/);
    history.commit(2);
    history.reset("camera-cut");
    expect(Array.from(history.prepare(id(), [0, 0], 3, first).previousProjection!)).toEqual(Array.from(first));
    expect(history.prepare(id(), [0, 0], 3, first).previous).toEqual(id());
  });

  it("owns per-view velocity and reactive surfaces with exact previous depth for every content kind", () => {
    const device = new MockRenderDevice(); setRendererQrFlags(v2Flags, device);
    device.beginFrame(8, 8);
    const owner = new TemporalHistory();
    const projection = Float32Array.from(perspectiveMat4(1, 1, 0.25, Infinity, { mode: "reversed", clipRange: "zero-to-one" }));
    const view0 = translate(0, 0, -5), view1 = translate(-0.5, 0, -6);
    const keys = { rigid: {}, instanced: {}, skinned: {}, glass: {} };
    const glass = new Material({ shaderKey: "unlit", renderState: { blend: true, depthWrite: false } });
    const skin = skinned();
    const scene = (x: number, joint: number) => [
      { geometry: triangle, label: "same", modelMatrix: translate(x), temporalObjectKey: keys.rigid },
      { geometry: triangle, label: "same", temporalObjectKey: keys.instanced, instanceTransforms: new Float32Array([...translate(x), ...translate(-x)]) },
      { geometry: skin, label: "same", temporalObjectKey: keys.skinned, skinning: { jointCount: 2, matrices: new Float32Array([...id(), ...translate(joint)]) } },
      { geometry: triangle, label: "glass", temporalObjectKey: keys.glass, material: glass }
    ];
    const options = (frameId: number) => ({ viewId: "left", frameId, reconstruction: "temporal" as const, motion: "renderer" as const,
      projection, outputWidth: 8, outputHeight: 8, depthNear: 0.25 });
    const vp0 = mul(projection, view0), vp1 = mul(projection, view1);
    try {
      const o1 = options(1);
      const firstItems = scene(0, 0);
      const first = owner.prepare(device, 8, 8, firstItems, vp0, o1);
      expect(first.velocity.label).toBe("renderer-temporal-object-velocity");
      expect(first.v2!.reactive!.label).toBe("renderer-temporal-reactive");
      expect(first.v2!.motionSource).toBe("object");
      expect(first.v2!.previousDepth).toBe("object-velocity");
      expect(first.v2!.unsupportedMotion).toEqual([]);
      // A repeated pass of the same frame keeps the same owned surfaces.
      expect(owner.prepare(device, 8, 8, firstItems, vp0, o1).velocity).toBe(first.velocity);
      owner.commit("left", 1);
      const second = owner.prepare(device, 8, 8, scene(1, 2), vp1, options(2));
      expect(second.velocity).toBe(first.velocity);
      expect(second.v2!.reactive).toBe(first.v2!.reactive);
      expect(second.historyValid).toBe(true);
      expect(temporalCanAccumulate(true, second.v2!.unsupportedMotion)).toBe(true);
      // Previous linear depth of the rigid triangle's origin: view0 at z = -5 => 5.
      const velocityMaterials = (owner as unknown as { views: Map<unknown, { materials: Material[] }> }).views.get("left")!.materials
        .filter(material => material.getParameter("u_a3dMotionPass") === 0);
      const rigid = velocityMaterials.find(material => material.getParameter("u_a3dMotionDeformed") === 0
        && Array.from(material.getParameter("u_a3dMotionCurrent") as Float32Array).every((value, index) =>
          Math.abs(value - mul(vp1, translate(1))[index]!) < 1e-5))!;
      expect(rigid.getParameter("u_a3dMotionExactDepth")).toBe(1);
      const previousView = rigid.getParameter("u_a3dMotionPreviousView") as Float32Array;
      const viewPoint = apply(previousView, [0, 0, 0]);
      expect(-viewPoint[2]! / viewPoint[3]!).toBeCloseTo(5, 4);
      // The skinned draw reprojects its previous palette (joint moved 0 -> 2).
      expect(velocityMaterials.some(material => material.getParameter("u_a3dMotionDeformed") === 1)).toBe(true);
      // Views are isolated and retire their own surfaces.
      const right = owner.prepare(device, 8, 8, scene(0, 0), vp0, { ...o1, viewId: "right" });
      expect(right.velocity).not.toBe(first.velocity);
      owner.disposeView("right");
      expect(right.velocity.disposed).toBe(true);
      expect(first.velocity.disposed).toBe(false);
      expect(() => owner.prepare(device, 8, 8, [], vp1, { ...o1, frameId: 3, velocity: first.velocity }))
        .toThrow(/replaces borrowed/);
    } finally {
      owner.dispose(); skin.dispose(); device.dispose();
    }
  });

  it("reprojects batched members with their own previous transforms", () => {
    const device = new MockRenderDevice(); setRendererQrFlags(v2Flags, device);
    device.beginFrame(8, 8);
    const owner = new TemporalHistory();
    const memberKeys = [{}, {}];
    const carrier = (x: number) => {
      const members = memberKeys.map((key, index) => ({ geometry: triangle, label: "member", modelMatrix: translate(x * (index + 1)), temporalObjectKey: key }));
      const batch = { geometry: triangle, label: "batch", temporalObjectKey: memberKeys };
      rememberBatchMembers(batch, members);
      return batch;
    };
    try {
      owner.prepare(device, 8, 8, [carrier(0)], id(), { viewId: "b", frameId: 1, motion: "renderer", projection: id() });
      owner.commit("b", 1);
      owner.prepare(device, 8, 8, [carrier(1)], id(), { viewId: "b", frameId: 2, motion: "renderer", projection: id() });
      const velocity = (owner as unknown as { views: Map<unknown, { materials: Material[] }> }).views.get("b")!.materials
        .filter(material => material.getParameter("u_a3dMotionPass") === 0);
      // Each member's current transform is paired with its own previous one (both were at the origin).
      const currents = velocity.map(material => (material.getParameter("u_a3dMotionCurrent") as Float32Array)[12]).sort();
      expect(currents).toEqual([1, 2]);
      for (const material of velocity) expect((material.getParameter("u_a3dMotionPrevious") as Float32Array)[12]).toBe(0);
    } finally { owner.dispose(); device.dispose(); }
  });
});
