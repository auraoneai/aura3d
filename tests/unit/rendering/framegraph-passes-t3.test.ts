import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { DepthPrepass } from "../../../packages/rendering/src/production-runtime/passes/DepthPrepass.js";
import { OpaquePass } from "../../../packages/rendering/src/production-runtime/passes/OpaquePass.js";
import { ShadowPass } from "../../../packages/rendering/src/production-runtime/passes/ShadowPass.js";
import { SkyboxPass } from "../../../packages/rendering/src/production-runtime/passes/SkyboxPass.js";
import { ToneMappingPass } from "../../../packages/rendering/src/production-runtime/passes/ToneMappingPass.js";
import { TransparentPass } from "../../../packages/rendering/src/production-runtime/passes/TransparentPass.js";
import {
  PRODUCTION_PASS_ORDER,
  validatePassOrder,
  validatePassResourceFlow
} from "../../../packages/rendering/src/production-runtime/passes/FramegraphTopology.js";

import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { ToneMappingPass as NativeToneMappingPass } from "../../../packages/rendering/src/PostProcessPass";
import { FrameGraph } from "../../../packages/rendering/src/production-runtime/framegraph/FrameGraph";
import type { RenderPass, RenderPassExecutionContext, FrameGraphResource } from "../../../packages/rendering/src/production-runtime/framegraph/RenderPass";

function executionContext(pass: RenderPass, frameIndex = 7): RenderPassExecutionContext {
  const device = new MockRenderDevice();
  device.beginFrame(1280, 720);
  const resources = new Map<string, FrameGraphResource>(pass.reads.map(name => [name, { value: name, frameIndex }]));
  return { frameIndex, width: 1280, height: 720, device, resources,
    commands: new Map([[pass.id, (bindings) => {
      for (const name of pass.reads) bindings.read(name);
      for (const name of pass.writes) bindings.write(name, { value: name, frameIndex });
      return { name: 'clear-test-double', reads: [], writes: [], execute(context) { context.device.clear([1, 0, 0, 1]); } };
    }]]) };
}

const CONTEXT = { frameIndex: 7, width: 1280, height: 720 };

function canonicalPasses() {
  return [
    new DepthPrepass(),
    new ShadowPass(),
    new SkyboxPass(),
    new OpaquePass(),
    new TransparentPass(),
    new ToneMappingPass()
  ];
}

describe("T3 framegraph adapters dispatch canonical native work", () => {
  test("every adapter executes device commands and publishes its bound resources", () => {
    for (const pass of canonicalPasses()) {
      assert.ok(pass.reads.length > 0, `${pass.id} reads`);
      assert.ok(pass.writes.length > 0, `${pass.id} writes`);
      assert.equal(pass.executionCount, 0);
      const context = executionContext(pass);
      pass.execute(context);
      assert.deepEqual(Array.from(context.device!.readPixels(0, 0, 1, 1)), [255, 0, 0, 255]);
      assert.ok(pass.writes.every(name => context.resources!.has(name)));
      context.device!.dispose();
      const next = executionContext(pass, 8);
      pass.execute(next);
      next.device!.dispose();
      assert.equal(pass.executionCount, 2);
      assert.equal(pass.lastExecutedFrame, 8);
    }
  });

  test('published ACES filmic spelling uses native ACES without dropping other operators', () => {
    assert.equal(new ToneMappingPass({ operator: 'aces-filmic' }).nativeOperator, 'aces');
    assert.equal(new ToneMappingPass({ operator: 'reinhard' }).nativeOperator, 'reinhard');
    assert.equal(new ToneMappingPass({ operator: 'neutral' }).nativeOperator, 'neutral');
  });

  test("options validation fails closed per pass", () => {
    assert.throws(() => new DepthPrepass({ depthResource: "  " }), /non-empty/);
    assert.throws(() => new ShadowPass({ maxShadowCasters: 0 }), /positive integer/);
    assert.throws(() => new OpaquePass({ lightingResource: "" }), /non-empty/);
    assert.throws(() => new TransparentPass({ maxTransparentItems: -1 }), /positive integer/);
    assert.throws(() => new SkyboxPass({ skyResource: "" }), /non-empty/);
    assert.throws(() => new ToneMappingPass({ exposure: 0 }), /exposure/);
    assert.throws(() => new ToneMappingPass({ operator: "bogus" as never }), /operator/);
    const tone = new ToneMappingPass({ exposure: 1.2, operator: "reinhard" });
    assert.equal(tone.exposure, 1.2);
    assert.equal(tone.operator, "reinhard");
  });

  test("execute rejects invalid contexts; disabled passes skip bookkeeping", () => {
    const pass = new OpaquePass();
    assert.throws(() => pass.execute({ frameIndex: -1, width: 8, height: 8 }), /frameIndex/);
    assert.throws(() => pass.execute({ frameIndex: 0, width: 0, height: 8 }), /width/);
    assert.throws(() => pass.execute({ frameIndex: 0, width: 8, height: Number.NaN }), /height/);
    const disabled = new SkyboxPass({ enabled: false });
    disabled.execute(CONTEXT);
    assert.equal(disabled.executionCount, 0);
  });

  test("resource validation names the missing input", () => {
    const pass = new ShadowPass();
    assert.throws(() => pass.validateResources(["scene.casters"]), /shadow\.maps/);
    pass.validateResources(["scene.casters", "shadow.maps"]);
  });

  test("canonical order validates; missing/misordered/undocumented fail", () => {
    const passes = canonicalPasses();
    assert.deepEqual(
      passes.map((pass) => pass.id),
      [...PRODUCTION_PASS_ORDER]
    );
    assert.deepEqual(validatePassOrder(passes), []);
    assert.deepEqual(validatePassResourceFlow(passes), []);
    assert.ok(validatePassOrder(passes.slice(1)).some((error) => error.includes("Missing production pass: DepthPrepass")));
    assert.ok(validatePassOrder([...passes].reverse()).some((error) => error.includes("Misordered")));
    assert.ok(
      validatePassOrder([...passes, { id: "MysteryPass", kind: "opaque", reads: [], writes: [] }]).some((error) =>
        error.includes("Undocumented production pass")
      )
    );
  });

  test("Skybox survivors feed D3 sky; Shadow survivors feed B1", () => {
    const sky = new SkyboxPass();
    const shadow = new ShadowPass();
    assert.ok(sky.reads.includes("environment.sky"), "sky reads the D3 environment resource");
    assert.ok(shadow.writes.includes("shadow.mask"), "shadow writes the B1 mask resource");
    assert.ok(new OpaquePass().reads.includes("shadow.mask"), "opaque consumes the B1 mask");
  });
});


describe("R06 native resource execution", () => {
  test("tone adapter dispatches native tone mapping into the exact target", () => {
    const device = new MockRenderDevice();
    device.beginFrame(1, 1);
    const source = device.createRenderTarget({ width: 1, height: 1 });
    const output = device.createRenderTarget({ width: 1, height: 1 });
    device.setRenderTarget(source); device.clear([1, 0.25, 0, 1]);
    const resources = new Map<string, FrameGraphResource>([['hdr.color', { value: source, frameIndex: 0 }]]);
    const pass = new ToneMappingPass({ exposure: 2, operator: 'reinhard' });
    pass.execute({ frameIndex: 0, width: 1, height: 1, device, resources,
      commands: new Map([[pass.id, bindings => new NativeToneMappingPass({
        source: bindings.read('hdr.color'),
        target: bindings.write('ldr.output', { value: output, frameIndex: 0 }),
        exposure: pass.exposure, operator: pass.nativeOperator, gamma: 1
      })]]) });
    device.setRenderTarget(output);
    assert.deepEqual(Array.from(device.readPixels(0, 0, 1, 1)), [170, 85, 0, 255]);
    assert.equal(resources.get('ldr.output')?.value, output);
    device.dispose();
  });

  test("missing native binding, stale and undeclared resources fail before commands", () => {
    const pass = new OpaquePass();
    assert.throws(() => pass.execute(CONTEXT), /native device/);
    const context = executionContext(pass);
    context.resources!.set(pass.reads[0]!, { value: {}, frameIndex: 6 });
    assert.throws(() => pass.execute(context), /stale resource/);
    assert.equal(pass.executionCount, 0);
    assert.equal(context.resources!.has('hdr.color'), false, 'failed in-place output invalidated');
    for (const name of pass.reads) context.resources!.set(name, { value: {}, frameIndex: 7 });
    assert.throws(() => pass.execute({ ...context, commands: new Map([[pass.id, bindings => {
      bindings.read('not-declared'); throw new Error('unreachable');
    }]]) }), /undeclared read/);
    context.device!.dispose();
  });

  test("canonical graph sorts dependencies and refuses absent or disabled producers", () => {
    const graph = new FrameGraph();
    for (const pass of canonicalPasses().reverse()) graph.addPass(pass);
    assert.deepEqual(graph.compile().map(pass => pass.id), [...PRODUCTION_PASS_ORDER]);
    const missing = new FrameGraph();
    for (const pass of canonicalPasses().filter(pass => pass.id !== 'SkyboxPass')) missing.addPass(pass);
    assert.throws(() => missing.compile(), /missing producer/);
    const disabled = new FrameGraph().addPass(new SkyboxPass({ enabled: false })).addPass(new OpaquePass());
    assert.throws(() => disabled.compile(), /missing producer/);
  });

  test("cyclic arbitrary dependencies fail in canonical RenderGraph", () => {
    const graph = new FrameGraph();
    graph.addPass({ id: 'a', kind: 'opaque', reads: ['b'], writes: ['a'], execute() {} });
    graph.addPass({ id: 'b', kind: 'opaque', reads: ['a'], writes: ['b'], execute() {} });
    assert.throws(() => graph.compile([]), /cycle/);
  });
});

describe('R06 concrete native bindings', () => {
  test('six stages issue native draws on borrowed targets without another owner', async () => {
    const { createNativeFrameGraphBindings } = await import('../../../packages/rendering/src/production-runtime/framegraph/NativeFrameGraphBindings');
    const { Geometry } = await import('../../../packages/rendering/src/Geometry');
    const { UnlitMaterial } = await import('../../../packages/rendering/src/UnlitMaterial');
    const { Texture } = await import('../../../packages/rendering/src/Texture');
    const { TextureBinding } = await import('../../../packages/rendering/src/TextureBinding');
    const { ShadowMap } = await import('../../../packages/rendering/src/ShadowMap');
    const { DirectionalLight } = await import('@aura3d/scene');
    const device = new MockRenderDevice();
    const color = device.createRenderTarget({ width: 16, height: 16, depth: true });
    const output = device.createRenderTarget({ width: 16, height: 16 });
    const shadowTarget = device.createRenderTarget({ width: 16, height: 16, depth: true });
    const geometry = Geometry.triangle();
    const material = new UnlitMaterial();
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([20, 40, 60, 255]) });
    const shadowMap = new ShadowMap({ size: 16 });
    const light = new DirectionalLight(); light.castsShadow = true;
    const item = { geometry, material };
    const options = { frameIndex: 0, colorTarget: color, outputTarget: output, geometry: [item],
      shadow: { light, casters: [item], shadowMap, renderTarget: shadowTarget },
      sky: { projection: 'equirect' as const, texture: new TextureBinding({ name: 'sky', texture }) },
      opaque: { items: [item] }, transparent: { items: [item] }
    };
    try {
      assert.throws(() => createNativeFrameGraphBindings({ ...options, outputTarget: color }), /separate source/);
      const bindings = createNativeFrameGraphBindings(options);
      const passes = canonicalPasses();
      const graph = new FrameGraph(); for (const pass of [...passes].reverse()) graph.addPass(pass);
      device.beginFrame(16, 16);
      graph.execute({ frameIndex: 0, width: 16, height: 16, device, ...bindings });
      assert.deepEqual(passes.map(pass => pass.executionCount), [1, 1, 1, 1, 1, 1]);
      assert.equal(bindings.resources.get('linear-depth')?.value, color);
      assert.equal(bindings.resources.get('hdr.color')?.value, color);
      assert.equal(bindings.resources.get('ldr.output')?.value, output);
      assert.ok(device.getDiagnostics().drawCalls >= 5, 'native depth, shadow, sky and both forward draws');
      assert.ok([color, output, shadowTarget].every(target => !target.disposed));
      device.endFrame();
      const stale = createNativeFrameGraphBindings(options);
      assert.throws(() => graph.execute({ frameIndex: 1, width: 16, height: 16, device, ...stale }), /stale resource/);
      assert.equal(stale.resources.has('ldr.output'), false);
      const resized = createNativeFrameGraphBindings({ ...options, frameIndex: 1 });
      assert.throws(() => graph.execute({ frameIndex: 1, width: 32, height: 32, device, ...resized }), /size mismatch/);
      assert.equal(resized.resources.has('ldr.output'), false);
      // Resolve the replacement shadow resource, never a matrix captured at factory creation.
      const rebound = createNativeFrameGraphBindings({ ...options, frameIndex: 2 });
      const lightMatrix = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1];
      rebound.resources.set('shadow.maps', { frameIndex: 2, value: { ...options.shadow, viewProjectionMatrix: lightMatrix } });
      device.beginFrame(16, 16);
      graph.execute({ frameIndex: 2, width: 16, height: 16, device, ...rebound });
      assert.equal((rebound.resources.get('shadow.mask')?.value as { lightMatrix: unknown }).lightMatrix, lightMatrix);
      device.endFrame();
      // Disposing a supplied target after binding must never trigger native fallback allocation.
      const disposed = createNativeFrameGraphBindings({ ...options, frameIndex: 3 });
      shadowTarget.dispose();
      const beforeTargets = device.getDiagnostics().renderTargets;
      device.beginFrame(16, 16);
      assert.throws(() => graph.execute({ frameIndex: 3, width: 16, height: 16, device, ...disposed }), /shadow resources are disposed/);
      assert.equal(disposed.resources.has('ldr.output'), false);
      assert.equal(device.getDiagnostics().renderTargets, beforeTargets);
      assert.equal(color.disposed, false);
      assert.equal(output.disposed, false);
      device.endFrame();
    } finally {
      material.dispose(); geometry.dispose(); texture.dispose(); shadowMap.dispose();
      color.dispose(); output.dispose(); shadowTarget.dispose(); device.dispose();
    }
  });
});
