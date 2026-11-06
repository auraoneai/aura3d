import { describe, expect, it } from "vitest";
import { identityMat4 } from "@aura3d/scene";
import { DepthPass } from "../../../packages/rendering/src/DepthPass";
import { negotiateDepthConvention } from "../../../packages/rendering/src/DepthConvention";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { Material } from "../../../packages/rendering/src/Material";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { createLeanCoreShaderLibrary, DEFAULT_DEPTH_SHADER_NAME, DEFAULT_UNLIT_SHADER_NAME } from "../../../packages/rendering/src/ShaderLibraryCore";
import { precompilePrd02DepthVariants, prd02DepthProgram, prd02DepthVariantDefines, prd02DepthWgsl, registerPrd02DepthShader } from "../../../packages/rendering/src/shadows/Prd02DepthShaderLibrary";
import type { ShadowCasterVariantKey } from "../../../packages/rendering/src/contracts/shadows";
import {
  classifyClippingBounds,
  clippingRetainsPoint,
  createClippingBinding,
  createClippingUniforms,
  normalizeClippingPlane,
  transformClippingPlane,
  validateClippingGroup,
  type ClippingPlane
} from "../../../packages/rendering/src/ClippingPlanes";
import { clipping } from "../../../packages/engine/src/agent-api/nodes/clipping";
import { createArchitectureKit } from "../../../packages/engine/src/agent-api/ApplicationKits";
import { placedBounds } from "../../../packages/engine/src/agent-api/SpatialAnchoring";

const worldTransform = [
  0, 2, 0, 0,
  -3, 0, 0, 0,
  0, 0, 4, 0,
  10, 20, 30, 1
];

function expectPlane(actual: ClippingPlane, expected: ClippingPlane): void {
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 10));
}

describe("clipping planes", () => {
  it("normalizes signed distances safely and rejects zero, malformed and nonfinite planes", () => {
    expectPlane(normalizeClippingPlane([0, 3, 4, -10]), [0, 0.6, 0.8, -2]);
    expectPlane(normalizeClippingPlane([1e308, 1e308, 0, 1e308]), [Math.SQRT1_2, Math.SQRT1_2, 0, Math.SQRT1_2]);
    expectPlane(normalizeClippingPlane([Number.MIN_VALUE, 0, 0, 0]), [1, 0, 0, 0]);
    for (const plane of [[0, 0, 0, 1], [1, 0, NaN, 1], [Infinity, 0, 0, 0], [1, 2, 3]] as unknown as ClippingPlane[]) {
      expect(() => normalizeClippingPlane(plane)).toThrow();
    }
    expect(() => normalizeClippingPlane([Number.MIN_VALUE, 0, 0, 1])).toThrow(/range/);
    expect(() => validateClippingGroup({ planes: [[1, 0, 0, 0]], space: "local" }, "global")).toThrow(/world/);
    expect(() => validateClippingGroup({ planes: [], combine: "xor" as never }, "material")).toThrow(/combination/);
    expect(() => validateClippingGroup({ planes: [], clipShadows: 1 as never }, "material")).toThrow(/boolean/);
  });

  it("uses inverse-transpose normals for translation, rotation, shear and reflected scales", () => {
    expectPlane(transformClippingPlane([1, 0, 0, -1], worldTransform), [0, 1, 0, -22]);
    expectPlane(transformClippingPlane([0, 1, 0, -1], worldTransform), [-1, 0, 0, 7]);
    const shear = [1, 0, 0, 0, 2, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expectPlane(transformClippingPlane([1, 0, 0, 0], shear), [1 / Math.sqrt(5), -2 / Math.sqrt(5), 0, 0]);
    const reflected = [-2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 0, 0, 1];
    expectPlane(transformClippingPlane([1, 0, 0, 0], reflected), [-1, 0, 0, 3]);
    expect(() => transformClippingPlane([1, 0, 0, 0], new Array(16).fill(0))).toThrow(/affine/);
    const singular = [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(() => transformClippingPlane([1, 0, 0, 0], singular)).toThrow(/singular/);
  });

  it("composes global and material groups and respects boundary inclusion", () => {
    const group = {
      planes: [[1, 0, 0, 0], [0, 1, 0, 0]] as const,
      combine: "intersection" as const
    };
    const intersection = createClippingBinding({ global: group });
    expect(clippingRetainsPoint(intersection, [0, 0, 0])).toBe(true);
    expect(clippingRetainsPoint(intersection, [1, -1, 0])).toBe(false);
    const union = createClippingBinding({ global: { ...group, combine: "union" } });
    expect(clippingRetainsPoint(union, [1, -1, 0])).toBe(true);
    expect(clippingRetainsPoint(union, [-1, -1, 0])).toBe(false);
    const combined = createClippingBinding({ global: { ...group, combine: "union" }, material: { planes: [[0, 0, 1, -1]] } });
    expect(clippingRetainsPoint(combined, [1, -1, 1])).toBe(true);
    expect(clippingRetainsPoint(combined, [1, -1, 0])).toBe(false);
    expect(clippingRetainsPoint(combined, [-1, -1, 1])).toBe(false);
    expect(createClippingBinding({ global: { planes: [], combine: "union" } }).groups).toHaveLength(0);
  });

  it("preserves local coordinates for instanced geometry and uses identical forward/depth bindings", () => {
    const material = { planes: [[1, 0, 0, 0]] as const, space: "local" as const, clipShadows: true };
    for (const primitive of ["mesh", "line", "point", "sprite"] as const) {
      for (const backend of ["webgl2", "webgpu"] as const) {
        const forward = createClippingBinding({ material, primitive, backend });
        const depth = createClippingBinding({ material, primitive, backend, pass: "depth" });
        expect(forward.planes).toEqual(depth.planes);
        expect(forward.groups).toEqual(depth.groups);
        // Two instances may have different local positions at the same world
        // point; local planes are not prematurely transformed once per batch.
        expect(clippingRetainsPoint(forward, [2, 0, 0], [1, 0, 0])).toBe(true);
        expect(clippingRetainsPoint(forward, [2, 0, 0], [-1, 0, 0])).toBe(false);
        expect(() => clippingRetainsPoint(forward, [2, 0, 0])).toThrow(/local point/);
      }
    }
  });

  it("includes only opted-in shadow groups and rejects backend limits instead of truncating", () => {
    const global = { planes: [[1, 0, 0, 0]] as const, clipShadows: false };
    const material = { planes: [[0, 1, 0, 0]] as const, clipShadows: true };
    const forward = createClippingBinding({ global, material, maxPlanes: 2 });
    const shadow = createClippingBinding({ global, material, maxPlanes: 1, pass: "shadow" });
    expect(forward.groups.map((group) => group.scope)).toEqual(["global", "material"]);
    expect(shadow.groups.map((group) => group.scope)).toEqual(["material"]);
    expect(clippingRetainsPoint(shadow, [-1, 1, 0])).toBe(true);
    expect(clippingRetainsPoint(shadow, [1, -1, 0])).toBe(false);
    expect(() => createClippingBinding({ global, material, maxPlanes: 1, backend: "webgpu" })).toThrow(/webgpu limit of 1/);
    expect(() => createClippingBinding({ global, maxPlanes: -1 })).toThrow(/limit/);
    expect(() => createClippingBinding({ global: { planes: [[1, 0, 0, 1e100]] } })).toThrow(/GPU float/);
    expect(() => createClippingBinding({ global, primitive: "triangles" as never })).toThrow(/primitive/);
  });

  it("packs the shared shader layout, clearing inactive slots after updates", () => {
    const global = { planes: [[1, 0, 0, -2]] as const };
    const material = { planes: [[0, 1, 0, 0], [0, 0, 1, 3]] as const, combine: "union" as const, space: "local" as const };
    const first = createClippingUniforms(createClippingBinding({ global, material }));
    expect(first.get("u_a3dClipGroupCount")).toBe(2);
    expect(Array.from(first.get("u_a3dClipGroups") as Float32Array)).toEqual([0, 1, 0, 0, 1, 2, 1, 1]);
    const planes = first.get("u_a3dClipPlanes") as Float32Array;
    expect(planes.length).toBe(32);
    expect(Array.from(planes.slice(0, 12))).toEqual([1, 0, 0, -2, 0, 1, 0, 0, 0, 0, 1, 3]);
    expect(Array.from(planes.slice(12)).every((value) => value === 0)).toBe(true);
    const next = createClippingUniforms(createClippingBinding({ global }));
    expect(Array.from(next.get("u_a3dClipGroups") as Float32Array)).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
    expect(Array.from((next.get("u_a3dClipPlanes") as Float32Array).slice(4)).every((value) => value === 0)).toBe(true);
  });

  it("classifies world bounds conservatively for intersection, union, and local planes", () => {
    const xPositive = { planes: [[1, 0, 0, 0]] as const };
    const world = createClippingBinding({ global: xPositive });
    expect(classifyClippingBounds(world, { min: [1, -1, -1], max: [2, 1, 1] })).toBe("inside");
    expect(classifyClippingBounds(world, { min: [-2, -1, -1], max: [-1, 1, 1] })).toBe("outside");
    expect(classifyClippingBounds(world, { min: [-1, -1, -1], max: [1, 1, 1] })).toBe("intersecting");
    const union = createClippingBinding({ material: { planes: [[1, 0, 0, 0], [0, 1, 0, 0]], combine: "union" } });
    expect(classifyClippingBounds(union, { min: [-2, -2, 0], max: [-1, -1, 1] })).toBe("outside");
    expect(classifyClippingBounds(union, { min: [1, -2, 0], max: [2, -1, 1] })).toBe("inside");
    expect(classifyClippingBounds(union, { min: [-1, -1, 0], max: [1, 1, 1] })).toBe("intersecting");
    const local = createClippingBinding({ material: { ...xPositive, space: "local" } });
    expect(classifyClippingBounds(local, { min: [9, 21, 29], max: [11, 22, 31] }, worldTransform)).toBe("inside");
    expect(classifyClippingBounds(local, { min: [9, 18, 29], max: [11, 19, 31] }, worldTransform)).toBe("outside");
    expect(() => classifyClippingBounds(local, { min: [0, 0, 0], max: [1, 1, 1] })).toThrow(/transform/);
    expect(() => classifyClippingBounds(world, { min: [1, 0, 0], max: [0, 1, 1] })).toThrow(/ordered/);
  });

  it("updates live groups atomically, isolates arrays, serializes snapshots and disposes safely", () => {
    const initial: [number, number, number, number] = [2, 0, 0, -2];
    const group = clipping.material({ planes: [initial], space: "local" });
    initial[3] = 100;
    expect(group.planes).toEqual([[1, 0, 0, -1]]);
    (group.planes[0] as unknown as number[])[3] = 100;
    expect(group.planes[0][3]).toBe(-1);
    group.update({ planes: [[0, 2, 0, -4]], combine: "union", clipShadows: true });
    expect(group.revision).toBe(1);
    expect(group.snapshot()).toMatchObject({ kind: "aura-clip-group", scope: "material", planes: [[0, 1, 0, -2]], combine: "union", enabled: true });
    const before = JSON.stringify(group);
    expect(() => group.update({ planes: [[0, 0, 0, 1]], enabled: false })).toThrow();
    expect(JSON.stringify(group)).toBe(before);
    group.setEnabled(false).setEnabled(false);
    expect(group.revision).toBe(2);
    expect(createClippingBinding({ material: group }).groups).toHaveLength(0);
    group.setEnabled(true);
    expect(createClippingBinding({ material: group, pass: "shadow" }).groups).toHaveLength(1);
    expect(() => createClippingBinding({ global: group })).toThrow(/global/);
    group.dispose();
    group.dispose();
    expect(group.snapshot()).toMatchObject({ enabled: false, disposed: true, revision: 4 });
    expect(createClippingBinding({ material: group.snapshot() }).groups).toHaveLength(0);
    expect(() => group.setEnabled(true)).toThrow(/disposed/);
  });

  it("exposes an architecture section as a stable live scene group", () => {
    const bounds = placedBounds({ position: [0, 0, 0], size: [8, 6, 8], floorY: 0 });
    const kit = createArchitectureKit({ bounds, spaces: [], moods: [] });
    const original = kit.frame().clipping;
    expect(original.scope).toBe("global");
    expect(original.enabled).toBe(false);
    const section = kit.setSection({ planes: [[1, 0, 0, 0]], clipShadows: true });
    expect(section.clipping).toBe(original);
    expect(original.enabled).toBe(true);
    expect(clippingRetainsPoint(createClippingBinding({ global: original }), [1, 0, 0])).toBe(true);
    expect(clippingRetainsPoint(createClippingBinding({ global: original }), [-1, 0, 0])).toBe(false);
    expect(createClippingBinding({ global: original, pass: "shadow" }).groups).toHaveLength(1);
    expect(kit.setSection(undefined).clipping).toBe(original);
    expect(original.enabled).toBe(false);
    expect(kit.reset().clipping).toBe(original);
    expect(original.enabled).toBe(false);
    expect(kit.capabilities.supported).toContain("clipping/section views");
    expect(kit.capabilities.unsupported.map((entry) => entry.capability)).toContain("measurement");
    expect(kit.capabilities.unsupported.map((entry) => entry.capability)).not.toContain("clipping/section views");
  });

  it("reset restores an authored initial architecture section", () => {
    const bounds = placedBounds({ position: [0, 0, 0], size: [8, 6, 8], floorY: 0 });
    const kit = createArchitectureKit({
      bounds, spaces: [], moods: [],
      section: { planes: [[0, 2, 0, -4]], clipShadows: true, combine: "union" }
    });
    const section = kit.frame().clipping;
    kit.setSection({ planes: [[1, 0, 0, 10]] });
    kit.setSection(undefined);
    expect(kit.reset().clipping).toBe(section);
    expect(section.snapshot()).toMatchObject({ planes: [[0, 1, 0, -2]], clipShadows: true, combine: "union", enabled: true });
    expect(clippingRetainsPoint(createClippingBinding({ global: section }), [0, 3, 0])).toBe(true);
    expect(clippingRetainsPoint(createClippingBinding({ global: section }), [0, 1, 0])).toBe(false);
  });
});

describe("depth and shadow clipping submissions", () => {
  it("binds live global and material groups and reuses a program after plane updates", () => {
    const device = new MockRenderDevice();
    const global = clipping.global({ planes: [[1, 0, 0, 0]], clipShadows: true });
    const local = clipping.material({ planes: [[0, 1, 0, -2]], space: "local", combine: "union" });
    const library = createLeanCoreShaderLibrary();
    const geometry = Geometry.triangle();
    const pass = new DepthPass({ casters: [{ geometry, label: "section" }], shaderLibrary: library, globalClipping: global, materialClippingFor: () => local, clippingPass: "depth" });
    device.beginFrame(32, 32);
    pass.execute({ device, width: 32, height: 32 });
    const first = device.drawCommands[0]!;
    expect(first.uniforms?.get("u_a3dClipGroupCount")).toBe(2);
    expect(Array.from(first.uniforms?.get("u_a3dClipGroups") as Float32Array)).toEqual([0, 1, 0, 0, 1, 1, 1, 1]);
    expect(Array.from(first.uniforms?.get("u_a3dClipPlanes") as Float32Array).slice(0, 8)).toEqual([1, 0, 0, 0, 0, 1, 0, -2]);
    expect(first.shader?.reflection.uniforms.has("u_a3dClipModel")).toBe(true);
    global.update({ planes: [[1, 0, 0, -3]] });
    pass.execute({ device, width: 32, height: 32 });
    const second = device.drawCommands[1]!;
    expect(second.shader?.id).toBe(first.shader?.id);
    expect(Array.from(second.uniforms?.get("u_a3dClipPlanes") as Float32Array).slice(0, 4)).toEqual([1, 0, 0, -3]);
    expect(Array.from(first.uniforms?.get("u_a3dClipPlanes") as Float32Array).slice(0, 4)).toEqual([1, 0, 0, 0]);
    device.endFrame();
  });

  it("keeps configured shader programs per device and retires them on library revision", () => {
    const firstDevice = new MockRenderDevice();
    const secondDevice = new MockRenderDevice();
    const library = createLeanCoreShaderLibrary();
    const global = clipping.global({ planes: [[1, 0, 0, 0]] });
    const pass = new DepthPass({ casters: [{ geometry: Geometry.triangle() }], shaderLibrary: library, globalClipping: global, clippingPass: "depth" });
    firstDevice.beginFrame(8, 8); secondDevice.beginFrame(8, 8);
    pass.execute({ device: firstDevice, width: 8, height: 8 });
    pass.execute({ device: secondDevice, width: 8, height: 8 });
    const first = firstDevice.drawCommands[0]!.shader!;
    const second = secondDevice.drawCommands[0]!.shader!;
    expect(first).not.toBe(second);
    library.registerChunk("clip-cache-revision", "// shader source changed");
    pass.execute({ device: firstDevice, width: 8, height: 8 });
    expect(first.disposed).toBe(true);
    expect(second.disposed).toBe(false);
    pass.execute({ device: secondDevice, width: 8, height: 8 });
    expect(second.disposed).toBe(true);
    firstDevice.endFrame(); secondDevice.endFrame();
  });

  it("only clips shadows with opt-in and applies the negotiated depth comparison", () => {
    const device = new MockRenderDevice();
    const global = clipping.global({ planes: [[1, 0, 0, 0]], clipShadows: false });
    const local = clipping.material({ planes: [[0, 1, 0, 0]], clipShadows: true });
    const depth = negotiateDepthConvention({ mode: "reversed" }, { clipRange: "zero-to-one", reversed: true, logarithmic: false });
    device.beginFrame(8, 8);
    new DepthPass({ casters: [{ geometry: Geometry.triangle() }], globalClipping: global, materialClippingFor: () => local, depthConvention: depth }).execute({ device, width: 8, height: 8 });
    const draw = device.drawCommands[0]!;
    expect(draw.renderState?.depthCompareV2).toBe("greater-equal");
    expect(draw.uniforms?.get("u_a3dClipGroupCount")).toBe(1);
    expect(Array.from(draw.uniforms?.get("u_a3dClipPlanes") as Float32Array).slice(0, 4)).toEqual([0, 1, 0, 0]);
    device.endFrame();
  });

  it("binds per-pass logarithmic view and range and rejects missing range before drawing", () => {
    const device = new MockRenderDevice();
    const convention = negotiateDepthConvention({ mode: "logarithmic" }, { clipRange: "minus-one-to-one", reversed: false, logarithmic: true });
    const view = identityMat4();
    const caster = { geometry: Geometry.triangle() };
    device.beginFrame(8, 8);
    expect(() => new DepthPass({ casters: [caster], depthConvention: convention }).execute({ device, width: 8, height: 8 })).toThrow(/logarithmic/i);
    expect(device.drawCommands).toHaveLength(0);
    new DepthPass({ casters: [caster], depthConvention: convention, depthViewMatrix: view, depthRange: { near: 0.5, far: 1000 } }).execute({ device, width: 8, height: 8 });
    const draw = device.drawCommands[0]!;
    expect(draw.uniforms?.get("u_a3dLogDepthRange")).toEqual([0.5, 1000]);
    expect(Array.from(draw.uniforms?.get("u_a3dLogDepthView") as Float32Array | number[])).toEqual(view);
    expect(draw.shader?.reflection.uniforms.has("u_a3dLogDepthRange")).toBe(true);
    device.endFrame();
  });

  it("preserves per-instance matrices and clip uniforms in the depth variant", () => {
    const device = new MockRenderDevice();
    const instance = new Float32Array([...identityMat4(), ...identityMat4()]);
    instance[28] = 5;
    const global = clipping.global({ planes: [[1, 0, 0, 0]], clipShadows: true });
    device.beginFrame(8, 8);
    new DepthPass({ casters: [{ geometry: Geometry.triangle(), instanceTransforms: instance }], globalClipping: global }).execute({ device, width: 8, height: 8 });
    const draw = device.drawCommands[0]!;
    expect(draw.instanceCount).toBe(2);
    expect(Array.from(draw.uniforms?.get("u_instanceMatrices") as Float32Array)).toEqual(Array.from(instance));
    expect(draw.uniforms?.get("u_a3dClipGroupCount")).toBe(1);
    expect(draw.shader?.reflection.uniforms.has("u_a3dClipPlanes")).toBe(true);
    device.endFrame();
  });

  it("submits morphed positions rather than the original or a shadow proxy", () => {
    const device = new MockRenderDevice();
    const geometry = Geometry.triangle();
    const base = geometry.vertexBuffer.getAttribute(0, "position");
    let submitted: number[] = [];
    const draw = device.draw.bind(device);
    device.draw = (command) => {
      const bytes = device.readBuffer(command.vertexBuffer);
      submitted = Array.from(new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4));
      draw(command);
    };
    device.beginFrame(8, 8);
    new DepthPass({ casters: [{
      geometry,
      shadowGeometry: Geometry.cube(),
      morphTargets: [{ positions: [[2, 0, 0], [0, 0, 0], [0, 0, 0]] }],
      morphWeights: [0.5]
    }] }).execute({ device, width: 8, height: 8 });
    expect(submitted[0]).toBeCloseTo(base[0] + 1);
    expect(submitted[1]).toBeCloseTo(base[1]);
    expect(device.drawCommands[0]!.vertexCount).toBe(3);
    device.endFrame();
  });

  it("binds and releases a large eight-influence skinning palette in the depth draw", () => {
    const device = new MockRenderDevice();
    const vertices = new VertexBuffer(VertexFormat.P3J8W8, 3);
    for (let i = 0; i < 3; i += 1) {
      vertices.setAttribute(i, "position", [i === 1 ? 1 : 0, i === 2 ? 1 : 0, 0]);
      vertices.setAttribute(i, "joints", [0, 0, 0, 0]);
      vertices.setAttribute(i, "weights", [0.5, 0, 0, 0]);
      vertices.setAttribute(i, "joints1", [96, 0, 0, 0]);
      vertices.setAttribute(i, "weights1", [0.5, 0, 0, 0]);
    }
    const palette = new Float32Array(97 * 16);
    for (let joint = 0; joint < 97; joint += 1) palette.set(identityMat4(), joint * 16);
    let paletteBinding: TextureBinding | undefined;
    const draw = device.draw.bind(device);
    device.draw = (command) => {
      paletteBinding = command.uniforms?.get("u_jointPaletteTexture") as TextureBinding;
      expect(paletteBinding.texture?.disposed).toBe(false);
      expect(command.uniforms?.get("u_jointPaletteMode")).toBe(1);
      expect(command.shader?.reflection.attributes.has("a_joints1")).toBe(true);
      draw(command);
    };
    device.beginFrame(8, 8);
    new DepthPass({ casters: [{
      geometry: new Geometry(vertices, null, "triangles"),
      skinning: { jointCount: 97, matrices: palette, extraInfluences: true }
    }] }).execute({ device, width: 8, height: 8 });
    expect(paletteBinding?.texture?.disposed).toBe(true);
    device.endFrame();
  });

  it("selects an alpha-test depth shader even without a custom variant resolver", () => {
    const device = new MockRenderDevice();
    const geometry = Geometry.triangle();
    // Masked depth must reproduce the forward program's alpha, so it runs for
    // the stock forward shaders; an unknown legacy program fails closed.
    const material = new Material({ shaderKey: DEFAULT_UNLIT_SHADER_NAME, parameters: { u_alphaCutoff: 0.4 } });
    const unknown = new Material({ shaderKey: "probe", parameters: { u_alphaCutoff: 0.4 } });
    device.beginFrame(8, 8);
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_STRICT: true }), device);
    expect(() => new DepthPass({ casters: [{ geometry, material: unknown }] }).execute({ device, width: 8, height: 8 }))
      .toThrow(expect.objectContaining({ code: "DEPTH_ALPHA_FORWARD_PROGRAM_UNSUPPORTED" }));
    expect(device.drawCommands).toHaveLength(0);
    // Outside strict mode the same caster is drawn as an opaque caster (one-time DEPTH_ALPHA_MASK_DEGRADED warning).
    setRendererQrFlags(createTrustedQrFlags({}), device);
    new DepthPass({ casters: [{ geometry, material: unknown }] }).execute({ device, width: 8, height: 8 });
    expect(device.drawCommands).toHaveLength(1);
    device.drawCommands.length = 0;
    new DepthPass({ casters: [{ geometry, material }] }).execute({ device, width: 8, height: 8 });
    expect(device.drawCommands).toHaveLength(1);
    const draw = device.drawCommands[0]!;
    expect(draw.shader?.reflection.uniforms.has("u_alphaCutoff")).toBe(true);
    expect(draw.uniforms?.get("u_alphaCutoff")).toBe(0.4);
    device.endFrame();
  });

  it("composes variant shaders and native bindings for eight-influence instancing", () => {
    const key: ShadowCasterVariantKey = {
      skinning: 8, skinningTexture: false, morphTargets: false, instanced: true, batched: false,
      alphaTest: false, alphaHash: false, doubleSided: false,
      features: { "a3d.clipping": true, "a3d.logarithmicDepth": true, "prd02.depthInstanceAttr": true }
    };
    const library = createLeanCoreShaderLibrary();
    registerPrd02DepthShader(library);
    const defines = prd02DepthVariantDefines(key);
    expect(defines).toMatchObject({ A3D_DEPTH_SKINNED: 1, A3D_DEPTH_EIGHT_INFLUENCES: 1, A3D_DEPTH_CLIPPING: 1, A3D_DEPTH_LOGARITHMIC: 1 });
    // The attribute feature is normally registered by the shadow system.
    defines.A3D_DEPTH_INSTANCE_ATTR = 1;
    const source = library.compileSource("aura3d/prd02-depth", { defines });
    expect(source.vertex).toContain("layout(location = 8) in vec4 a_joints1");
    expect(source.vertex).toContain("layout(location = 10) in vec4 a_instanceMatrix0");
    expect(source.vertex).toContain("a3dSkinMatrix8(a_joints, a_weights, a_joints1, a_weights1)");
    expect(source.fragment).toContain("gl_FragDepth = clamp(a3dLogDepth");
    const native = prd02DepthWgsl(key);
    expect(native.portableBindings).toEqual(expect.arrayContaining([
      { name: "u_a3dClipPlanes", kind: "vec4", arrayLength: 8 },
      { name: "u_a3dClipGroups", kind: "vec4", arrayLength: 2 },
      { name: "u_jointMatrices", kind: "mat4", arrayLength: 96 }
    ]));
    expect(native.webgpu.vertex).toContain("@location(8) joints1");
    expect(native.webgpu.vertex).toContain("@location(10) instance0");
    expect(native.webgpu.fragment).toContain("@builtin(frag_depth)");
    const program = prd02DepthProgram(new MockRenderDevice(), library, key);
    expect(program.reflection.uniforms.has("u_a3dClipPlanes")).toBe(true);
    const lean = library.compileSource(DEFAULT_DEPTH_SHADER_NAME, { defines: { A3D_DEPTH_CLIPPING: 1, A3D_DEPTH_LOGARITHMIC: 1 } });
    expect(lean.fragment).toContain("gl_FragDepth");
  });

  it("hands clipping arrays and logarithmic depth to the native-shaped WebGPU shader path", async () => {
    const modules: string[] = [];
    const native: WebGPUDeviceLike = {
      queue: { writeBuffer() {}, submit() {} },
      createBuffer() { return { destroy() {} }; },
      createShaderModule({ code }) { modules.push(code); return {}; },
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
    try {
      const library = createLeanCoreShaderLibrary();
      registerPrd02DepthShader(library);
      const key: ShadowCasterVariantKey = {
        skinning: 0, skinningTexture: false, morphTargets: false, instanced: false,
        batched: false, alphaTest: false, alphaHash: false, doubleSided: false,
        features: { "a3d.clipping": true, "a3d.logarithmicDepth": true }
      };
      prd02DepthProgram(device, library, key);
      expect(modules).toHaveLength(2);
      expect(modules[0]).toContain("u_a3dClipPlanes: array<vec4<f32>, 8>");
      expect(modules[0]).toContain("u_a3dClipGroups: array<vec4<f32>, 2>");
      expect(modules[1]).toContain("@builtin(frag_depth)");
      expect(modules[1]).toContain("aura.u_a3dLogDepthRange");
    } finally { device.dispose(); }
  });

  it("submits a clipped depth draw with real packed uniforms to an injected WebGPU device", async () => {
    const writes: Uint8Array[] = [];
    const modules: string[] = [];
    let draws = 0;
    const native: WebGPUDeviceLike = {
      queue: {
        writeBuffer(_buffer, _offset, data) {
          const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          writes.push(bytes.slice());
        },
        submit() {}
      },
      createBuffer() { return { destroy() {} }; },
      createTexture() { return { createView: () => ({}), destroy() {} }; },
      createShaderModule({ code }) { modules.push(code); return {}; },
      createRenderPipeline() { return { getBindGroupLayout: () => ({}) }; },
      createBindGroup() { return {}; },
      createCommandEncoder() { return {
        beginRenderPass: () => ({ setPipeline() {}, setVertexBuffer() {}, setIndexBuffer() {}, setBindGroup() {}, draw() { draws += 1; }, drawIndexed() { draws += 1; }, end() {} }),
        finish: () => ({})
      }; },
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
    try {
      const target = device.createRenderTarget({ width: 8, height: 8, depth: true });
      device.beginFrame(8, 8);
      device.setRenderTarget(target);
      new DepthPass({ casters: [{ geometry: Geometry.triangle() }], globalClipping: clipping.global({ planes: [[1, 0, 0, -2]] }), clippingPass: "depth" })
        .execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(draws).toBe(1);
      expect(modules.some((code) => code.includes("aura.u_a3dClipPlanes[p]"))).toBe(true);
      const floats = writes.filter((bytes) => bytes.byteLength % 4 === 0).map((bytes) => Array.from(new Float32Array(bytes.buffer)));
      expect(floats.some((values) => values.some((value, index) => value === 1 && values[index + 1] === 0 && values[index + 2] === 0 && values[index + 3] === -2))).toBe(true);
    } finally { device.dispose(); }
  });

  it("chooses a clip-range-aware native depth program even without clipping", async () => {
    const modules: string[] = [];
    const native: WebGPUDeviceLike = {
      queue: { writeBuffer() {}, submit() {} },
      createBuffer() { return { destroy() {} }; },
      createShaderModule({ code }) { modules.push(code); return {}; },
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
    try {
      const convention = negotiateDepthConvention({}, { clipRange: "zero-to-one", reversed: false, logarithmic: false });
      device.beginFrame(8, 8);
      new DepthPass({ casters: [{ geometry: Geometry.triangle() }], depthConvention: convention }).execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(modules.some((code) => code.includes("aura.u_a3dClipRange > 0.5"))).toBe(true);
    } finally { device.dispose(); }
  });

  it("isolates depth program caches by shader library and retires stale revisions", async () => {
    const device = new MockRenderDevice();
    const firstLibrary = createLeanCoreShaderLibrary();
    const secondLibrary = createLeanCoreShaderLibrary();
    registerPrd02DepthShader(firstLibrary);
    registerPrd02DepthShader(secondLibrary);
    const key: ShadowCasterVariantKey = {
      skinning: 0, skinningTexture: false, morphTargets: false, instanced: false,
      batched: false, alphaTest: false, alphaHash: false, doubleSided: false,
      features: { "a3d.clipping": true }
    };
    const first = prd02DepthProgram(device, firstLibrary, key);
    const second = prd02DepthProgram(device, secondLibrary, key);
    expect(first).not.toBe(second);
    await precompilePrd02DepthVariants(device, secondLibrary, new Map([["caller-name", { key, features: [] }]]));
    expect(prd02DepthProgram(device, secondLibrary, key)).toBe(second);
    firstLibrary.registerChunk("native-test-revision", "// a changed shader dependency");
    const replacement = prd02DepthProgram(device, firstLibrary, key);
    expect(replacement).not.toBe(first);
    expect(first.disposed).toBe(true);
    expect(second.disposed).toBe(false);
  });
});
