import { afterEach, describe, expect, it, vi } from "vitest";
import type { QrFlagName, QrFlags, QrFlagValue } from "@aura3d/rendering/contracts";
import { raycast } from "../../../packages/engine/src/agent-api/SceneQueries";
import { createRuntimeNodeHandle, setRuntimeQueryRenderItems } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { applyMorphTargets, computeMorphTargetEnvelopeBounds, computeMorphTargetWeightedBounds, type MorphTargetDelta } from "../../../packages/rendering/src/MorphTarget";
import { computeGeometryJointLocalBounds, computeSkinnedGeometryBounds, computeSkinnedGeometryBoundsFromJointBoxes, computeSkinnedMorphTargetEnvelopeBounds, computeSkinnedMorphTargetWeightedBounds } from "../../../packages/rendering/src/SkinningBounds";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { isTextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { SkinningPaletteUploadManager, releaseMorphScratchGeometry, resolveRenderGeometry, validateSkinningGeometryContract } from "../../../packages/rendering/src/forward/Deform";
import type { Material } from "../../../packages/rendering/src/Material";
import type { RenderShaderProgram, UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { skinnedItemLocalBounds } from "../../../packages/rendering/src/renderer/SkinnedBounds";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { SkinnedLitMaterial } from "../../../packages/rendering/src/SkinnedLitMaterial";
import { skinningPaletteCache } from "../../../packages/rendering/src/lanes/prd06";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import "../../../packages/rendering/src/lanes/prd06";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";

function flags(on: boolean): QrFlags {
  return {
    values: on ? { A3D_QR_ANIMATION: true } : {},
    on(name: QrFlagName): boolean { return on && name === "A3D_QR_ANIMATION"; }
  } as QrFlags & { values: Partial<Record<QrFlagName, QrFlagValue>> };
}

const palette = {
  jointCount: 2,
  extraInfluences: true,
  matrices: new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 2, 1
  ])
};

const lift: MorphTargetDelta = {
  positions: [[0, 0, 0.5], [0, 0, 0.5], [0, 0, 0.5]],
  tangents: [[0, 1, 0], [0, 1, 0], [0, 1, 0]]
};

function separatedGeometry(): Geometry {
  const format = new VertexFormat([
    { semantic: "uv", components: 2, offset: 2, type: "uint16", normalized: true },
    { semantic: "position", components: 3, offset: 2, type: "int16", normalized: true, bufferSlot: 1 },
    { semantic: "joints", components: 4, offset: 2, type: "uint8", integer: true, bufferSlot: 2 },
    { semantic: "weights", components: 4, offset: 2, type: "uint8", normalized: true, bufferSlot: 3 },
    { semantic: "joints1", components: 4, offset: 0, type: "uint8", integer: true, bufferSlot: 4 },
    { semantic: "weights1", components: 4, offset: 4, type: "uint8", normalized: true, bufferSlot: 4 },
    { semantic: "normal", components: 3, offset: 0, type: "int8", normalized: true, bufferSlot: 5 },
    { semantic: "tangent", components: 4, offset: 4, type: "int8", normalized: true, bufferSlot: 5 },
    { semantic: "custom:instanceValue", components: 1, offset: 0, shaderLocation: 14, bufferSlot: 6 }
  ], 8, [
    { slot: 1, stride: 8 }, { slot: 2, stride: 8 }, { slot: 3, stride: 8 },
    { slot: 4, stride: 8 }, { slot: 5, stride: 8 },
    { slot: 6, stride: 4, stepMode: "instance", divisor: 1 }
  ]);
  const streams = format.streams.map((stream) => new VertexBuffer(format, stream.stepMode === "instance" ? 2 : 3, stream.slot));
  const position = [[0, 0, 0], [32767, 0, 0], [0, 32767, 0]];
  const uvs = [[0, 0], [65535, 0], [0, 65535]];
  for (let i = 0; i < 3; i += 1) {
    streams[0]!.setAttribute(i, "uv", uvs[i]!);
    streams[1]!.setAttribute(i, "position", position[i]!);
    streams[2]!.setAttribute(i, "joints", [0, 0, 0, 0]);
    streams[3]!.setAttribute(i, "weights", [128, 0, 0, 0]);
    streams[4]!.setAttribute(i, "joints1", [1, 0, 0, 0]);
    streams[4]!.setAttribute(i, "weights1", [127, 0, 0, 0]);
    streams[5]!.setAttribute(i, "normal", [-128, 0, 0]);
    streams[5]!.setAttribute(i, "tangent", [127, 0, 0, -127]);
  }
  streams[6]!.setAttribute(0, "custom:instanceValue", [4]);
  streams[6]!.setAttribute(1, "custom:instanceValue", [9]);
  return new Geometry(streams[0]!, new IndexBuffer([0, 1, 2], 3), "triangles", undefined, streams.slice(1));
}

afterEach(() => setRendererQrFlags(flags(false)));

describe("CPU deformation of normalized multi-stream geometry", () => {
  it("validates decoded weights and computes skinned bounds using both influence sets", () => {
    const geometry = separatedGeometry();
    try {
      expect(geometry.getAttributeBuffer("weights").getAttribute(0, "weights")).toEqual([128, 0, 0, 0]);
      expect(() => validateSkinningGeometryContract({ geometry } as RenderItem, palette)).not.toThrow();
      const bounds = computeSkinnedGeometryBounds(geometry, palette);
      expect(bounds.min[2]).toBeCloseTo(254 / 255);
      expect(bounds.max[0]).toBeCloseTo(1);
      expect(bounds.max[1]).toBeCloseTo(1);
      const withoutExtra = computeSkinnedGeometryBounds(geometry, { ...palette, extraInfluences: false });
      expect(withoutExtra.max[0]).toBeCloseTo(128 / 255);

      const first = computeGeometryJointLocalBounds(geometry, 2);
      expect(computeGeometryJointLocalBounds(geometry, 2)).toBe(first);
      expect(first[6]).toBe(0);
      expect(first[9]).toBe(1);
      geometry.getAttributeBuffer("position").setAttribute(1, "position", [16384, 0, 0]);
      const updated = computeGeometryJointLocalBounds(geometry, 2);
      expect(updated).not.toBe(first);
      expect(updated[9]).toBeCloseTo(16384 / 32767);
      geometry.getAttributeBuffer("weights1").setAttribute(0, "weights1", [1, 0, 0, 0]);
      geometry.getAttributeBuffer("weights1").setAttribute(1, "weights1", [0, 0, 0, 0]);
      geometry.getAttributeBuffer("weights1").setAttribute(2, "weights1", [0, 0, 0, 0]);
      const tinyInfluence = computeGeometryJointLocalBounds(geometry, 2);
      expect(Array.from(tinyInfluence.slice(6, 12))).toEqual([0, 0, 0, 0, 0, 0]);
    } finally { geometry.dispose(); }
  });

  it("revalidates edited skin weights and never caches a failed validation as successful", () => {
    setRendererQrFlags(flags(true));
    const geometry = separatedGeometry();
    const manager = new SkinningPaletteUploadManager();
    const item = { geometry } as RenderItem;
    const shader = { reflection: { uniforms: new Set(["u_jointMatrices", "u_jointCount"]) } } as unknown as RenderShaderProgram;
    const material = { name: "skin" } as Material;
    const uniforms = new Map<string, UniformValue>();
    try {
      manager.beginFrame();
      manager.bind(item, palette, material, shader, uniforms);
      expect(manager.diagnostics().submissions).toBe(1);
      geometry.getAttributeBuffer("weights").setAttribute(0, "weights", [0, 0, 0, 0]);
      geometry.getAttributeBuffer("weights1").setAttribute(0, "weights1", [0, 0, 0, 0]);
      manager.bind(item, palette, material, shader, uniforms);
      manager.bind(item, palette, material, shader, uniforms);
      expect(manager.diagnostics().submissions).toBe(1);
      expect(manager.diagnostics().cpuFallbackCount).toBe(2);
      geometry.getAttributeBuffer("weights").setAttribute(0, "weights", [128, 0, 0, 0]);
      geometry.getAttributeBuffer("weights1").setAttribute(0, "weights1", [127, 0, 0, 0]);
      manager.bind(item, palette, material, shader, uniforms);
      expect(manager.diagnostics().submissions).toBe(2);
    } finally { geometry.dispose(); }
  });

  it("hands off only transient palette textures and disposes them if validation fails", () => {
    const geometry = separatedGeometry();
    const manager = new SkinningPaletteUploadManager();
    const item = { geometry } as RenderItem;
    const shader = { reflection: { uniforms: new Set(["u_jointMatrices", "u_jointCount", "u_jointPaletteTexture", "u_jointPaletteMode"]) } } as unknown as RenderShaderProgram;
    const material = { name: "skin" } as Material;
    const largePalette = { jointCount: 97, matrices: new Float32Array(97 * 16) };
    try {
      setRendererQrFlags(flags(false));
      manager.beginFrame();
      const uniforms = new Map<string, UniformValue>();
      expect(manager.bind(item, palette, material, shader, uniforms)).toBeUndefined();
      const transient = manager.bind(item, largePalette, material, shader, uniforms);
      expect(transient).toBe(uniforms.get("u_jointPaletteTexture"));
      expect(transient?.texture?.disposed).toBe(false);
      transient?.texture?.dispose();
      expect(transient?.texture?.disposed).toBe(true);

      geometry.getAttributeBuffer("weights").setAttribute(0, "weights", [0, 0, 0, 0]);
      geometry.getAttributeBuffer("weights1").setAttribute(0, "weights1", [0, 0, 0, 0]);
      const invalidUniforms = new Map<string, UniformValue>();
      expect(() => manager.bind(item, largePalette, material, shader, invalidUniforms)).toThrow(/weights must sum/);
      const invalidBinding = invalidUniforms.get("u_jointPaletteTexture");
      expect(isTextureBinding(invalidBinding) && invalidBinding.texture?.disposed).toBe(true);

      geometry.getAttributeBuffer("weights").setAttribute(0, "weights", [128, 0, 0, 0]);
      geometry.getAttributeBuffer("weights1").setAttribute(0, "weights1", [127, 0, 0, 0]);
      setRendererQrFlags(flags(true));
      const paletteKey = {};
      const cachedUniforms = new Map<string, UniformValue>();
      const cachedPalette = { ...largePalette, paletteKey };
      expect(manager.bind(item, cachedPalette, material, shader, cachedUniforms)).toBeUndefined();
      const cachedBinding = cachedUniforms.get("u_jointPaletteTexture");
      expect(isTextureBinding(cachedBinding) && cachedBinding.texture?.disposed).toBe(false);
      manager.releasePalette(paletteKey);
      expect(isTextureBinding(cachedBinding) && cachedBinding.texture?.disposed).toBe(true);
    } finally { manager.releaseAllPalettes(); geometry.dispose(); }
  });

  it("validates generated palettes on every draw, even after geometry is cached", () => {
    const geometry = separatedGeometry();
    const manager = new SkinningPaletteUploadManager();
    const item = { geometry } as RenderItem;
    const matrices = new Float32Array(palette.matrices);
    const binding = { ...palette, matrices };
    try {
      expect(() => manager.validateGenerated(item, binding)).not.toThrow();
      expect(() => manager.validateGenerated(item, { ...binding, jointCount: 0 })).toThrow(/jointCount/);
      expect(() => manager.validateGenerated(item, { ...binding, jointCount: 1025 })).toThrow(/jointCount/);
      expect(() => manager.validateGenerated(item, { ...binding, jointCount: 1.5 })).toThrow(/jointCount/);
      expect(() => manager.validateGenerated(item, { ...binding, matrices: matrices.subarray(0, 16) })).toThrow(/palette length/);
      matrices[0] = NaN;
      expect(() => manager.validateGenerated(item, binding)).toThrow(/finite/);
      matrices[0] = 1;
      expect(() => manager.validateGenerated(item, binding)).not.toThrow();
      geometry.getAttributeBuffer("weights").setAttribute(0, "weights", [0, 0, 0, 0]);
      geometry.getAttributeBuffer("weights1").setAttribute(0, "weights1", [0, 0, 0, 0]);
      expect(() => manager.validateGenerated(item, binding)).toThrow(/weights must sum/);
      geometry.getAttributeBuffer("weights").setAttribute(0, "weights", [128, 0, 0, 0]);
      geometry.getAttributeBuffer("weights1").setAttribute(0, "weights1", [127, 0, 0, 0]);
      expect(() => manager.validateGenerated(item, binding)).not.toThrow();
    } finally { geometry.dispose(); }
  });

  it("validates generated influence parity and every shader-fetched joint independently of legacy caching", () => {
    const geometry = separatedGeometry();
    const manager = new SkinningPaletteUploadManager();
    const item = { geometry } as RenderItem;
    const shader = { reflection: { uniforms: new Set(["u_jointMatrices", "u_jointCount"]) } } as unknown as RenderShaderProgram;
    const material = { name: "skin" } as Material;
    try {
      geometry.getAttributeBuffer("joints").setAttribute(0, "joints", [0, 2, 0, 0]);
      setRendererQrFlags(flags(false));
      manager.beginFrame();
      // Legacy validation tolerates an out-of-range joint with zero weight.
      expect(() => manager.bind(item, palette, material, shader, new Map<string, UniformValue>())).not.toThrow();
      // Generated shaders still fetch every lane, so their stricter cache is independent.
      expect(() => manager.validateGenerated(item, palette)).toThrow(/joint indices/);
      geometry.getAttributeBuffer("joints").setAttribute(0, "joints", [0, 0, 0, 0]);
      expect(() => manager.validateGenerated(item, palette)).not.toThrow();
      expect(() => manager.validateGenerated(item, { ...palette, extraInfluences: false })).toThrow(/influence sets/);
      expect(() => manager.validateGenerated({ geometry, instanceCount: 0 } as RenderItem, palette)).toThrow(/instance count/);
    } finally { geometry.dispose(); }
    const four = new VertexBuffer(VertexFormat.P3J4W4, 1);
    four.setAttribute(0, "position", [0, 0, 0]);
    four.setAttribute(0, "joints", [0, 0, 0, 0]);
    four.setAttribute(0, "weights", [1, 0, 0, 0]);
    const fourGeometry = new Geometry(four);
    try {
      const fourItem = { geometry: fourGeometry } as RenderItem;
      expect(() => manager.validateGenerated(fourItem, { ...palette, extraInfluences: false })).not.toThrow();
      expect(() => manager.validateGenerated(fourItem, palette)).toThrow(/influence sets/);
    } finally { fourGeometry.dispose(); }
  });

  it("rejects edited geometry and palettes before generated ForwardPass palette binding or drawing", async () => {
    const animation = resolveQrFlags({ env: { A3D_QR: "animation" } });
    setRendererQrFlags(animation);
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16, qrFlags: animation });
    const vertices = new VertexBuffer(VertexFormat.P3N3J4W4, 3);
    [[-1, -1, 0], [3, -1, 0], [-1, 3, 0]].forEach((position, index) => {
      vertices.setAttribute(index, "position", position);
      vertices.setAttribute(index, "normal", [0, 0, 1]);
      vertices.setAttribute(index, "joints", [0, 0, 0, 0]);
      vertices.setAttribute(index, "weights", [1, 0, 0, 0]);
    });
    const geometry = new Geometry(vertices);
    const skinning = { jointCount: 1, matrices: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) };
    const item = { geometry, skinning, material: new SkinnedLitMaterial({}), label: "generated-validation" } as RenderItem;
    type CapturedCommand = { shader: { reflection: { uniforms: Set<string> } }; uniforms?: Map<string, unknown> };
    const device = (renderer as unknown as { device: { draw(command: CapturedCommand): void } }).device;
    const draw = device.draw.bind(device);
    const generatedDraws: CapturedCommand[] = [];
    device.draw = (command) => { if (command.shader.reflection.uniforms.has("u_boneTexture")) generatedDraws.push(command); draw(command); };
    const uploads = vi.spyOn(skinningPaletteCache, "upload");
    try {
      renderer.render([item]);
      expect(generatedDraws).toHaveLength(1);
      expect(generatedDraws[0]!.uniforms?.get("u_boneTexture")).toBeDefined();
      const completedUploads = uploads.mock.calls.length;
      expect(completedUploads).toBeGreaterThan(0);
      vertices.setAttribute(0, "weights", [0, 0, 0, 0]);
      expect(() => renderer.render([item])).toThrow(/weights must sum/);
      expect(generatedDraws).toHaveLength(1);
      expect(uploads).toHaveBeenCalledTimes(completedUploads);
      vertices.setAttribute(0, "weights", [1, 0, 0, 0]);
      skinning.matrices[0] = NaN;
      expect(() => renderer.render([item])).toThrow(/finite/);
      expect(generatedDraws).toHaveLength(1);
      expect(uploads).toHaveBeenCalledTimes(completedUploads);
      skinning.matrices[0] = 1;
      const missingSkin = Geometry.litTriangle();
      try {
        expect(() => renderer.render([{ ...item, geometry: missingSkin }])).toThrow(/joints and weights|skinn/i);
        expect(generatedDraws).toHaveLength(1);
        expect(uploads).toHaveBeenCalledTimes(completedUploads);
      } finally { missingSkin.dispose(); }
    } finally {
      uploads.mockRestore();
      skinningPaletteCache.release(skinning);
      geometry.dispose();
      renderer.dispose();
    }
  });

  it("promotes morphed integer values to floats and retains independent typed and instance streams", () => {
    const geometry = separatedGeometry();
    geometry.drawRange = { start: 0, count: 3 };
    geometry.groups = [{ start: 0, count: 3, materialIndex: 2 }];
    const morphed = applyMorphTargets(geometry, [lift], [0.5]);
    try {
      expect(morphed.vertexBuffer.format.getAttribute("position").type).toBe("float32");
      expect(morphed.vertexBuffer.format.getAttribute("normal").type).toBe("float32");
      expect(morphed.vertexBuffer.format.getAttribute("weights").type).toBe("uint8");
      expect(morphed.getAttributeBuffer("position").getAttribute(1, "position")).toEqual([1, 0, 0.25]);
      expect(morphed.getAttributeBuffer("normal").getAttribute(0, "normal")).toEqual([-1, 0, 0]);
      const tangent = morphed.getAttributeBuffer("tangent").getAttribute(0, "tangent");
      expect(tangent[0]).toBeCloseTo(2 / Math.sqrt(5));
      expect(tangent[1]).toBeCloseTo(1 / Math.sqrt(5));
      expect(tangent[3]).toBe(-1);
      expect(morphed.getAttributeBuffer("weights").getAttribute(0, "weights")).toEqual([128, 0, 0, 0]);
      expect(morphed.getAttributeBuffer("custom:instanceValue").getAttribute(1, "custom:instanceValue")).toEqual([9]);
      expect(morphed.drawRange).toEqual(geometry.drawRange);
      expect(morphed.groups).toEqual(geometry.groups);
      expect(geometry.getAttributeBuffer("position").getAttribute(1, "position")).toEqual([32767, 0, 0]);
      expect(computeMorphTargetEnvelopeBounds(geometry, [lift]).max[2]).toBe(0.5);
      expect(computeMorphTargetWeightedBounds(geometry, [lift], [0.5]).min[2]).toBe(0.25);
      expect(computeSkinnedMorphTargetWeightedBounds(geometry, palette, [lift], [0.5]).min[2]).toBeCloseTo(0.25 + 254 / 255);
    } finally { morphed.dispose(); geometry.dispose(); }
  });

  it("keeps joint boxes conservative when quantized weights do not sum exactly to one", () => {
    const geometry = separatedGeometry();
    const matrices = new Float32Array(palette.matrices);
    matrices[12] = 10;
    matrices[28] = 10;
    const binding = { ...palette, matrices };
    try {
      for (let i = 0; i < 3; i += 1) geometry.getAttributeBuffer("weights1").setAttribute(i, "weights1", [126, 0, 0, 0]);
      const exact = computeSkinnedGeometryBounds(geometry, binding);
      const enclosing = computeSkinnedGeometryBoundsFromJointBoxes(geometry, binding);
      expect(exact.min[0]).toBeCloseTo(10 * 254 / 255);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(enclosing.min[axis]!).toBeLessThanOrEqual(exact.min[axis]! + 1e-6);
        expect(enclosing.max[axis]!).toBeGreaterThanOrEqual(exact.max[axis]! - 1e-6);
      }
    } finally { geometry.dispose(); }
  });

  it("invalidates rendered skinning bounds when streams, influence mode or geometry change", () => {
    for (const useJointBoxes of [false, true]) {
      setRendererQrFlags(flags(useJointBoxes));
      const first = separatedGeometry();
      const other = separatedGeometry();
      const binding = { ...palette, paletteKey: {} };
      try {
        const initial = skinnedItemLocalBounds(first, binding);
        expect(skinnedItemLocalBounds(first, binding)).toBe(initial);
        first.getAttributeBuffer("position").setAttribute(1, "position", [16384, 0, 0]);
        const moved = skinnedItemLocalBounds(first, binding);
        expect(moved).not.toBe(initial);
        expect(moved.max[0]).toBeCloseTo(16384 / 32767);
        first.getAttributeBuffer("weights1").setAttribute(0, "weights1", [126, 0, 0, 0]);
        const reweighted = skinnedItemLocalBounds(first, binding);
        expect(reweighted).not.toBe(moved);
        expect(skinnedItemLocalBounds(first, { ...binding, extraInfluences: false })).not.toBe(reweighted);
        // A palette key can be reused for a second mesh, but never its bounds.
        const otherBounds = skinnedItemLocalBounds(other, binding);
        expect(otherBounds.max[0]).toBeCloseTo(1);
        expect(otherBounds).not.toBe(reweighted);
      } finally { first.dispose(); other.dispose(); }
    }
  });

  it("keeps persistent scratch streams, topology and bounds current after edits", () => {
    setRendererQrFlags(flags(true));
    const geometry = separatedGeometry();
    const targets = [lift];
    const item = { geometry, morphTargets: targets, morphWeights: [0.5] } as RenderItem;
    try {
      const first = resolveRenderGeometry(item);
      const positionBuffer = first.getAttributeBuffer("position");
      geometry.getAttributeBuffer("position").setAttribute(1, "position", [16384, 0, 0]);
      geometry.getAttributeBuffer("custom:instanceValue").setAttribute(1, "custom:instanceValue", [12]);
      geometry.indexBuffer!.setIndices(0, [2, 1, 0]);
      geometry.drawRange = { start: 0, count: 0 };
      const second = resolveRenderGeometry({ ...item, morphWeights: [4] });
      expect(second).toBe(first);
      expect(second.getAttributeBuffer("position")).toBe(positionBuffer);
      expect(positionBuffer.getAttribute(1, "position")[0]).toBeCloseTo(16384 / 32767);
      expect(positionBuffer.getAttribute(1, "position")[2]).toBe(2);
      expect(second.bounds.max[2]).toBe(2);
      expect(second.getAttributeBuffer("custom:instanceValue").getAttribute(1, "custom:instanceValue")).toEqual([12]);
      expect(Array.from(second.indexBuffer!.data)).toEqual([2, 1, 0]);
      expect(second.drawRange).toEqual({ start: 0, count: 0 });
    } finally { releaseMorphScratchGeometry(geometry); geometry.dispose(); }
  });

  it("uses all transformed envelope corners for rotated skinning", () => {
    const geometry = separatedGeometry();
    const rotated = { ...palette, matrices: new Float32Array([
      0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
      0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1
    ]) };
    const target: MorphTargetDelta = { positions: [[1, 2, 0], [1, 2, 0], [1, 2, 0]] };
    try {
      const envelope = computeSkinnedMorphTargetEnvelopeBounds(geometry, rotated, [target]);
      const weighted = computeSkinnedMorphTargetWeightedBounds(geometry, rotated, [target], [1]);
      expect(envelope.min[0]).toBeLessThanOrEqual(weighted.min[0]);
      expect(envelope.max[0]).toBeGreaterThanOrEqual(weighted.max[0]);
      expect(envelope.min[1]).toBeLessThanOrEqual(weighted.min[1]);
      expect(envelope.max[1]).toBeGreaterThanOrEqual(weighted.max[1]);
      expect(envelope.min[0]).toBeCloseTo(-3);
      expect(envelope.max[1]).toBeCloseTo(2);
    } finally { geometry.dispose(); }
  });

  it("raycasts the submitted streams with skin, morph, UV, instances and live matrices", () => {
    const geometry = separatedGeometry();
    const handle = createRuntimeNodeHandle({ kind: "model", name: "actor", asset: {} as never, castShadow: true, receiveShadow: true, visible: true } as never, { id: "actor" });
    const instances = new Float32Array([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0, 1, 1
    ]);
    try {
      setRuntimeQueryRenderItems(handle, [{ geometry, skinning: palette, morphTargets: [lift], morphWeights: [0.5], instanceTransforms: instances }]);
      const ray = { origin: [2.25, 0.25, 5] as const, direction: [0, 0, -1] as const };
      const [hit] = raycast(ray, { handles: [handle], mode: "mesh" });
      expect(hit?.instanceId).toBe(1);
      expect(hit?.distance).toBeCloseTo(5 - 1 - 0.25 - 254 / 255);
      expect(hit?.uv?.[0]).toBeCloseTo(0.25);
      expect(hit?.uv?.[1]).toBeCloseTo(0.25);
      instances[28] = 3;
      expect(raycast(ray, { handles: [handle], mode: "mesh" })).toEqual([]);
      expect(raycast({ ...ray, origin: [3.25, 0.25, 5] }, { handles: [handle], mode: "mesh" })[0]?.instanceId).toBe(1);
    } finally { geometry.dispose(); }
  });

  it("reads instance-rate attributes at their divisor when resolving hit UVs", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "uv", components: 2, offset: 0, type: "uint8", normalized: true, bufferSlot: 1 }
    ], 12, [{ slot: 1, stride: 2, stepMode: "instance", divisor: 2 }]);
    const positions = new VertexBuffer(format, 3);
    const uvs = new VertexBuffer(format, 2, 1);
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]].forEach((position, index) => positions.setAttribute(index, "position", position));
    uvs.setAttribute(0, "uv", [0, 0]);
    uvs.setAttribute(1, "uv", [255, 128]);
    const geometry = new Geometry(positions, new IndexBuffer([0, 1, 2], 3), "triangles", undefined, [uvs]);
    const handle = createRuntimeNodeHandle({ kind: "model", name: "instances", asset: {} as never, castShadow: true, receiveShadow: true, visible: true } as never, { id: "instances" });
    const transforms = Float32Array.from([0, 2, 4].flatMap((x) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1]));
    try {
      setRuntimeQueryRenderItems(handle, [{ geometry, instanceTransforms: transforms }]);
      const hit = raycast({ origin: [4.25, 0.25, 5], direction: [0, 0, -1] }, { handles: [handle], mode: "mesh" })[0];
      expect(hit?.instanceId).toBe(2);
      expect(hit?.uv?.[0]).toBeCloseTo(1);
      expect(hit?.uv?.[1]).toBeCloseTo(128 / 255);
      // Instance streams can drive multiple draws without matrix attributes.
      setRuntimeQueryRenderItems(handle, [{ geometry, instanceCount: 3 }]);
      const hits = raycast({ origin: [0.25, 0.25, 5], direction: [0, 0, -1] }, { handles: [handle], mode: "mesh" });
      expect(hits.map((entry) => entry.instanceId)).toEqual([0, 1, 2]);
      expect(hits[2]?.uv?.[0]).toBeCloseTo(1);
      expect(hits[2]?.uv?.[1]).toBeCloseTo(128 / 255);
    } finally { geometry.dispose(); }
  });

  it("uses instance-rate joints and weights for validation, bounds and mesh hits", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "joints", components: 4, offset: 0, type: "uint8", integer: true, bufferSlot: 1 },
      { semantic: "weights", components: 4, offset: 4, type: "uint8", normalized: true, bufferSlot: 1 }
    ], 12, [{ slot: 1, stride: 8, stepMode: "instance", divisor: 1 }]);
    const positions = new VertexBuffer(format, 3);
    const influence = new VertexBuffer(format, 2, 1);
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]].forEach((point, index) => positions.setAttribute(index, "position", point));
    influence.setAttribute(0, "joints", [0, 0, 0, 0]);
    influence.setAttribute(1, "joints", [1, 0, 0, 0]);
    influence.setAttribute(0, "weights", [255, 0, 0, 0]);
    influence.setAttribute(1, "weights", [255, 0, 0, 0]);
    const geometry = new Geometry(positions, new IndexBuffer([0, 1, 2], 3), "triangles", undefined, [influence]);
    const handle = createRuntimeNodeHandle({ kind: "model", name: "skinned-instances", asset: {} as never, castShadow: true, receiveShadow: true, visible: true } as never, { id: "skinned-instances" });
    try {
      expect(() => validateSkinningGeometryContract({ geometry, instanceCount: 2 } as RenderItem, palette)).not.toThrow();
      const exact = computeSkinnedGeometryBounds(geometry, palette);
      const enclosing = computeSkinnedGeometryBoundsFromJointBoxes(geometry, palette);
      expect(exact.min[2]).toBe(0);
      expect(exact.max[2]).toBe(2);
      expect(enclosing.min[2]).toBeLessThanOrEqual(exact.min[2]);
      expect(enclosing.max[2]).toBeGreaterThanOrEqual(exact.max[2]);
      const morphed = applyMorphTargets(geometry, [lift], [0.5]);
      try { expect(computeSkinnedGeometryBounds(morphed, palette).max[2]).toBe(2.25); }
      finally { morphed.dispose(); }
      setRuntimeQueryRenderItems(handle, [{ geometry, instanceCount: 2, skinning: palette }]);
      const hits = raycast({ origin: [0.25, 0.25, 5], direction: [0, 0, -1] }, { handles: [handle], mode: "mesh" });
      expect(hits.map((hit) => [hit.instanceId, hit.distance])).toEqual([[1, 3], [0, 5]]);
      setRendererQrFlags(flags(true));
      influence.setAttribute(1, "weights", [0, 0, 0, 0]);
      const manager = new SkinningPaletteUploadManager();
      const shader = { reflection: { uniforms: new Set(["u_jointMatrices", "u_jointCount"]) } } as unknown as RenderShaderProgram;
      const material = { name: "skin" } as Material;
      manager.beginFrame();
      manager.bind({ geometry, instanceCount: 1 } as RenderItem, palette, material, shader, new Map<string, UniformValue>());
      manager.bind({ geometry, instanceCount: 2 } as RenderItem, palette, material, shader, new Map<string, UniformValue>());
      expect(manager.diagnostics().submissions).toBe(1);
      expect(manager.diagnostics().cpuFallbackCount).toBe(1);
    } finally { geometry.dispose(); }
  });

  it("rejects active per-vertex deltas on an instance-rate morph attribute", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "normal", components: 3, offset: 0, type: "int8", normalized: true, bufferSlot: 1 }
    ], 12, [{ slot: 1, stride: 3, stepMode: "instance" }]);
    const positions = new VertexBuffer(format, 3);
    const normal = new VertexBuffer(format, 1, 1);
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]].forEach((point, index) => positions.setAttribute(index, "position", point));
    normal.setAttribute(0, "normal", [0, 0, 127]);
    const geometry = new Geometry(positions, null, "triangles", undefined, [normal]);
    const target: MorphTargetDelta = { normals: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
    try {
      const inactive = applyMorphTargets(geometry, [target], [0]);
      try { expect(inactive.getAttributeBuffer("normal").getDecodedAttribute(0, "normal")).toEqual([0, 0, 1]); }
      finally { inactive.dispose(); }
      expect(() => applyMorphTargets(geometry, [target], [1])).toThrow(/per-vertex attribute/);
      expect(geometry.getAttributeBuffer("normal").getAttribute(0, "normal")).toEqual([0, 0, 127]);
    } finally { geometry.dispose(); }
  });

  it("rejects a morph that would change an integer shader input into a float", () => {
    const format = new VertexFormat([{ semantic: "position", components: 3, offset: 0, type: "int16", integer: true }], 6);
    const positions = new VertexBuffer(format, 3);
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]].forEach((point, index) => positions.setAttribute(index, "position", point));
    const geometry = new Geometry(positions);
    try {
      expect(() => applyMorphTargets(geometry, [lift], [1])).toThrow(/integer shader input/);
      expect(positions.getAttribute(1, "position")).toEqual([1, 0, 0]);
    } finally { geometry.dispose(); }
  });
});
