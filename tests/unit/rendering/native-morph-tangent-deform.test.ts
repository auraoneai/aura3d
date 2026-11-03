import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { applyGpuMorphUniforms, releaseMorphScratchGeometry, resolveRenderGeometry } from "../../../packages/rendering/src/forward/Deform";
import { releaseMorphTargetTexture } from "../../../packages/rendering/src/shaders/deform/forwardFeature";
import { rendererQrFlags, setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import type { MorphTargetDelta } from "../../../packages/rendering/src/MorphTarget";
import type { RenderShaderProgram, UniformValue } from "../../../packages/rendering/src/RenderDevice";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import "../../../packages/rendering/src/lanes/prd06";

const positions = [[0.25, 0, 0], [0, 0.25, 0], [0, 0, 0.25]] as const;
const tangents = [[0, 1, 0], [0, 1, 0], [0, 1, 0]] as const;
const normals = [[0, 1, 0], [0, 1, 0], [0, 1, 0]] as const;

function makeGeometry(withTangent = true, withNormal = false): Geometry {
  const descriptors = [
    { semantic: "position" as const, components: 3 as const, offset: 0 },
    ...(withNormal ? [{ semantic: "normal" as const, components: 3 as const, offset: 12 }] : []),
    ...(withTangent ? [{ semantic: "tangent" as const, components: 4 as const, offset: withNormal ? 24 : 12 }] : [])
  ];
  const format = new VertexFormat(descriptors);
  const buffer = new VertexBuffer(format, 3);
  for (let i = 0; i < 3; i += 1) {
    buffer.setAttribute(i, "position", [i, 0, 0]);
    if (withNormal) buffer.setAttribute(i, "normal", [0, 0, 1]);
    if (withTangent) buffer.setAttribute(i, "tangent", [1, 0, 0, -1]);
  }
  return new Geometry(buffer);
}

function shader(...names: string[]): RenderShaderProgram {
  return { reflection: { uniforms: new Set(names), uniformDetails: new Map() } } as unknown as RenderShaderProgram;
}

const legacyShader = () => shader("u_morphPositionDeltas", "u_morphWeights", "u_morphTargetCount", "u_morphUsesTexture");
const textureShader = () => shader("u_morphTexture", "u_morphActiveCount", "u_morphStride", "u_morphTexWidth", "u_morphActiveIndex4", "u_morphActiveWeight4");
const item = (geometry: Geometry, targets: readonly MorphTargetDelta[], weights: readonly number[]): RenderItem => ({
  geometry, morphTargets: targets, morphWeights: weights
});
const flags = (enabled: boolean) => ({
  values: { A3D_QR_ANIMATION_GPU_MORPH: enabled },
  on: (name: string) => enabled && name === "A3D_QR_ANIMATION_GPU_MORPH"
}) as QrFlags;

let previousFlags: QrFlags;
beforeEach(() => { previousFlags = rendererQrFlags(); });
afterEach(() => setRendererQrFlags(previousFlags));

describe("morph tangent deformation routing", () => {
  it("uses a real CPU tangent/position deformation when the legacy shader has no tangent uniform", () => {
    const geometry = makeGeometry();
    const targets = [{ positions, tangents }];
    const renderItem = item(geometry, targets, [0.5]);
    const uniforms = new Map<string, UniformValue>([["u_morphTargetCount", 4], ["u_morphUsesTexture", 1]]);
    let deformed: Geometry | undefined;
    try {
      expect(applyGpuMorphUniforms(renderItem, legacyShader(), uniforms)).toBe(false);
      expect(uniforms.get("u_morphTargetCount")).toBe(0);
      expect(uniforms.get("u_morphUsesTexture")).toBe(0);
      deformed = resolveRenderGeometry(renderItem);
      expect(deformed).not.toBe(geometry);
      expect(deformed.getAttributeBuffer("position").getAttribute(0, "position")[0]).toBeCloseTo(0.125);
      const tangent = deformed.getAttributeBuffer("tangent").getAttribute(0, "tangent");
      expect(tangent[0]).toBeCloseTo(1 / Math.sqrt(1.25));
      expect(tangent[1]).toBeCloseTo(0.5 / Math.sqrt(1.25));
      expect(tangent[3]).toBe(-1);
      expect(geometry.getAttributeBuffer("tangent").getAttribute(0, "tangent")).toEqual([1, 0, 0, -1]);
      expect(tangents[0]).toEqual([0, 1, 0]);
    } finally {
      deformed?.dispose();
      releaseMorphScratchGeometry(geometry);
      geometry.dispose();
    }
  });

  it("retains the legacy uniform path for zero-weight tangent data without a tangent base", () => {
    const geometry = makeGeometry(false);
    const uniforms = new Map<string, UniformValue>();
    try {
      expect(applyGpuMorphUniforms(item(geometry, [{ positions, tangents }], [0]), legacyShader(), uniforms)).toBe(true);
      expect(uniforms.get("u_morphTargetCount")).toBe(1);
      expect(Array.from(uniforms.get("u_morphWeights") as Float32Array)).toEqual([0, 0, 0, 0]);
    } finally { geometry.dispose(); }
  });

  it("keeps position-only legacy GPU morphing and its uniform values", () => {
    const geometry = makeGeometry(false);
    const uniforms = new Map<string, UniformValue>();
    try {
      expect(applyGpuMorphUniforms(item(geometry, [{ positions }], [0.75]), legacyShader(), uniforms)).toBe(true);
      expect(uniforms.get("u_morphTargetCount")).toBe(1);
      expect((uniforms.get("u_morphPositionDeltas") as Float32Array)[0]).toBeCloseTo(0.25);
      expect((uniforms.get("u_morphWeights") as Float32Array)[0]).toBeCloseTo(0.75);
    } finally { geometry.dispose(); }
  });

  it("falls back for active normal deltas when the legacy shader cannot receive them", () => {
    const geometry = makeGeometry(false, true);
    const renderItem = item(geometry, [{ positions, normals }], [1]);
    const uniforms = new Map<string, UniformValue>();
    let deformed: Geometry | undefined;
    try {
      expect(applyGpuMorphUniforms(renderItem, legacyShader(), uniforms)).toBe(false);
      expect(uniforms.get("u_morphTargetCount")).toBe(0);
      deformed = resolveRenderGeometry(renderItem);
      const normal = deformed.getAttributeBuffer("normal").getAttribute(0, "normal");
      expect(normal[1]).toBeCloseTo(Math.SQRT1_2);
      expect(normal[2]).toBeCloseTo(Math.SQRT1_2);
      expect(geometry.getAttributeBuffer("normal").getAttribute(0, "normal")).toEqual([0, 0, 1]);
    } finally {
      deformed?.dispose();
      releaseMorphScratchGeometry(geometry);
      geometry.dispose();
    }
  });

  it("keeps normal deltas on a legacy shader that declares their uniform", () => {
    const geometry = makeGeometry(false, true);
    const uniforms = new Map<string, UniformValue>();
    try {
      expect(applyGpuMorphUniforms(item(geometry, [{ positions, normals }], [1]),
        shader("u_morphPositionDeltas", "u_morphWeights", "u_morphTargetCount", "u_morphNormalDeltas"), uniforms)).toBe(true);
      expect((uniforms.get("u_morphNormalDeltas") as Float32Array)[1]).toBe(1);
    } finally { geometry.dispose(); }
  });

  it.each(["normal", "tangent"] as const)("rejects active %s deltas with no compatible base stream", (semantic) => {
    const geometry = makeGeometry(false, false);
    const target = semantic === "normal" ? { positions, normals } : { positions, tangents };
    const renderItem = item(geometry, [target], [1]);
    const uniforms = new Map<string, UniformValue>();
    try {
      expect(() => applyGpuMorphUniforms(renderItem, legacyShader(), uniforms)).toThrow(/compatible per-vertex base/);
      expect(() => resolveRenderGeometry(renderItem)).toThrow(/compatible per-vertex base/);
      expect(uniforms.size).toBe(0);
    } finally { geometry.dispose(); }
  });

  it("rejects instance-rate tangents before either GPU binding or CPU allocation", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "tangent", components: 4, offset: 0, bufferSlot: 1 }
    ], 12, [{ slot: 1, stride: 16, stepMode: "instance" }]);
    const vertices = new VertexBuffer(format, 3);
    const instances = new VertexBuffer(format, 1, 1);
    const geometry = new Geometry(vertices, null, "triangles", undefined, [instances]);
    const renderItem = item(geometry, [{ positions, tangents }], [1]);
    try {
      expect(() => applyGpuMorphUniforms(renderItem, legacyShader(), new Map())).toThrow(/per-vertex base tangent/);
      expect(() => resolveRenderGeometry(renderItem)).toThrow(/per-vertex base tangent/);
    } finally { geometry.dispose(); }
  });

  it.each([
    ["short", [[0, 1, 0]]],
    ["non-finite", [[0, 1, 0], [0, Number.NaN, 0], [0, 1, 0]]],
    ["wrong width", [[0, 1, 0], [0, 1], [0, 1, 0]]]
  ])("rejects malformed active tangent deltas (%s) before binding", (_name, malformed) => {
    const geometry = makeGeometry();
    const renderItem = item(geometry, [{ positions, tangents: malformed } as unknown as MorphTargetDelta], [1]);
    const uniforms = new Map<string, UniformValue>();
    try {
      expect(() => applyGpuMorphUniforms(renderItem, legacyShader(), uniforms)).toThrow(/morph tangents/);
      expect(() => resolveRenderGeometry(renderItem)).toThrow(/morph tangents/);
      expect(uniforms.size).toBe(0);
    } finally { geometry.dispose(); }
  });

  it("neutralizes generated morph uniforms when the texture path falls back to CPU", () => {
    setRendererQrFlags(flags(false));
    const geometry = makeGeometry();
    const renderItem = item(geometry, [{ positions, tangents }], [1]);
    const uniforms = new Map<string, UniformValue>([["u_morphActiveCount", 3]]);
    try {
      expect(applyGpuMorphUniforms(renderItem, textureShader(), uniforms)).toBe(false);
      expect(uniforms.get("u_morphActiveCount")).toBe(0);
    } finally {
      releaseMorphTargetTexture(geometry);
      geometry.dispose();
    }
  });

  it("retains the generated texture path for a supported active tangent", () => {
    setRendererQrFlags(flags(true));
    const geometry = makeGeometry();
    const uniforms = new Map<string, UniformValue>();
    try {
      expect(applyGpuMorphUniforms(item(geometry, [{ positions, tangents }], [1]), textureShader(), uniforms)).toBe(true);
      expect(uniforms.get("u_morphStride")).toBe(3);
      expect(uniforms.get("u_morphActiveCount")).toBe(1);
      expect(uniforms.has("u_morphTexture")).toBe(true);
    } finally {
      releaseMorphTargetTexture(geometry);
      geometry.dispose();
    }
  });
});
