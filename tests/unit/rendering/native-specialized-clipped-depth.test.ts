import { describe, expect, it } from "vitest";
import { invertMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { DepthPass } from "../../../packages/rendering/src/DepthPass";
import { negotiateDepthConvention } from "../../../packages/rendering/src/DepthConvention";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import { MockRenderDevice, type DrawCommand } from "../../../packages/rendering/src/RenderDevice";
import { ScreenSpaceLineMaterial } from "../../../packages/rendering/src/ScreenSpaceLineMaterial";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";

/** Record each depth draw's vertex positions and indices while its transient buffers are alive. */
function recordingDevice() {
  const device = new MockRenderDevice();
  const draws: { command: DrawCommand; positions: number[][]; indices: number[] }[] = [];
  const draw = device.draw.bind(device);
  device.draw = (command: DrawCommand) => {
    const bytes = device.readBuffer(command.vertexBuffer);
    const stride = command.vertexFormat?.streams[0]?.stride ?? command.vertexFormat!.stride;
    const floats = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const positions = Array.from({ length: bytes.byteLength / stride }, (_, vertex) =>
      Array.from(floats.slice(vertex * stride / 4, vertex * stride / 4 + 3)));
    let indices: number[] = [];
    if (command.indexBuffer) {
      const raw = device.readBuffer(command.indexBuffer);
      indices = Array.from(command.indexType === "uint32"
        ? new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)
        : new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2)).slice(command.firstIndex ?? 0, (command.firstIndex ?? 0) + (command.indexCount ?? 0));
    }
    draws.push({ command, positions, indices });
    draw(command);
  };
  return { device, draws };
}

function pointGeometry(points: readonly (readonly [number, number, number])[]): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3, points.length);
  points.forEach((point, index) => vertices.setAttribute(index, "position", [...point]));
  return new Geometry(vertices, null, "points");
}

function transform(matrix: ArrayLike<number>, [x, y, z]: readonly number[]): number[] {
  return [0, 1, 2].map((row) => matrix[row]! * x! + matrix[row + 4]! * y! + matrix[row + 8]! * z! + matrix[row + 12]!);
}

const shadowGroup = (plane: readonly [number, number, number, number], space: "world" | "local" = "world") =>
  ({ planes: [plane], clipShadows: true, ...(space === "local" ? { space } : {}) });

describe("clipped point depth", () => {
  it.each(["depth", "shadow"] as const)("submits only points whose source centre is retained (%s pass)", (clippingPass) => {
    const { device, draws } = recordingDevice();
    const geometry = pointGeometry([[-1, 0, 0], [0.5, 0, 0], [2, 1, 0], [-0.25, 3, 0]]);
    const material = new UnlitMaterial({ pointSize: 9 });
    try {
      device.beginFrame(8, 8);
      // World x >= 0 keeps the second and third points only.
      new DepthPass({ clippingPass, globalClipping: shadowGroup([1, 0, 0, 0]), casters: [{ geometry, material }] })
        .execute({ device, width: 8, height: 8 });
      expect(draws).toHaveLength(1);
      expect(draws[0]!.command.topology).toBe("points");
      expect(draws[0]!.indices).toEqual([1, 2]);
      // The point centres were removed on the CPU; the draw has no fragment clip.
      expect(draws[0]!.command.uniforms!.get("u_a3dClipGroupCount")).toBe(0);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
    expect(device.getDiagnostics().buffers).toBe(0);
  });

  it("clips local groups in object space and world groups after the model transform", () => {
    const { device, draws } = recordingDevice();
    const geometry = pointGeometry([[-1, 0, 0], [1, 0, 0], [1, 5, 0]]);
    const material = new UnlitMaterial();
    // Translate +3 in x: every point is at world x >= 2, but local x >= 0 keeps
    // only the last two, and world y <= 1 then drops the final point.
    const modelMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 0, 0, 1];
    try {
      device.beginFrame(8, 8);
      new DepthPass({ clippingPass: "shadow", globalClipping: shadowGroup([0, -1, 0, 1]),
        casters: [{ geometry, material, modelMatrix, materialClipping: shadowGroup([1, 0, 0, 0], "local") }] })
        .execute({ device, width: 8, height: 8 });
      expect(draws.map((draw) => draw.indices)).toEqual([[1]]);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("respects the item draw range and submits nothing when every point is clipped", () => {
    const { device, draws } = recordingDevice();
    const geometry = pointGeometry([[1, 0, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0]]);
    const material = new UnlitMaterial();
    try {
      device.beginFrame(8, 8);
      new DepthPass({ clippingPass: "shadow", globalClipping: shadowGroup([1, 0, 0, 0]),
        casters: [{ geometry, material, drawRange: { start: 1, count: 2 } }] }).execute({ device, width: 8, height: 8 });
      expect(draws.map((draw) => draw.indices)).toEqual([[1, 2]]);
      new DepthPass({ clippingPass: "shadow", globalClipping: shadowGroup([-1, 0, 0, 0]),
        casters: [{ geometry, material }] }).execute({ device, width: 8, height: 8 });
      expect(draws).toHaveLength(1);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects instanced and deformed clipped points before drawing", () => {
    const { device, draws } = recordingDevice();
    const geometry = pointGeometry([[1, 0, 0]]);
    const material = new UnlitMaterial();
    try {
      device.beginFrame(8, 8);
      const instanced = { geometry, material, instanceTransforms: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
      expect(() => new DepthPass({ clippingPass: "shadow", globalClipping: shadowGroup([1, 0, 0, 0]), casters: [instanced] })
        .execute({ device, width: 8, height: 8 })).toThrowError(expect.objectContaining({ code: "DEPTH_CLIPPING_SPECIALIZED_GEOMETRY_UNSUPPORTED" }));
      expect(draws).toHaveLength(0);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });
});

describe("clipped billboard sprite depth", () => {
  const quad = () => {
    const vertices = new VertexBuffer(VertexFormat.P3, 4);
    [[-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]].forEach((p, i) => vertices.setAttribute(i, "position", p));
    return new Geometry(vertices, null, "triangles");
  };
  // Camera at z = 5 looking down -z; a perspective projection (P[11] = -1).
  const view: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -5, 1];
  const projection: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -1, 0, 0, -0.2, 0];
  const model: Mat4 = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 1, 2, 0, 1];

  function sprite(attenuation: boolean) {
    const base = new UnlitMaterial({ spriteMode: true, spriteRotation: Math.PI / 2, spriteSizeAttenuation: attenuation });
    return { base, material: new MaterialInstance(base) };
  }

  it.each([
    // Hand-derived: corner (0.5, 0.5) scales to (1, 1.5), rotates by 90 deg to
    // (-1.5, 1), offsets the view-space centre (1, 2, -5) and maps back to the
    // object space of the model.
    { attenuation: true, corner: [-0.75, 1 / 3, 0] },
    // Without attenuation a perspective sprite scales by -viewZ = 5.
    { attenuation: false, corner: [-3.75, 5 / 3, 0] }
  ])("expands the billboard from the raster camera and clips the corners per fragment (attenuation=$attenuation)", ({ attenuation, corner }) => {
    const { device, draws } = recordingDevice();
    const geometry = quad();
    const { base, material } = sprite(attenuation);
    const local = shadowGroup([1, 0, 0, 0], "local");
    try {
      device.beginFrame(8, 8);
      new DepthPass({ clippingPass: "shadow", casters: [{ geometry, material, modelMatrix: model, materialClipping: local,
        clippingRasterCamera: { viewMatrix: view, projectionMatrix: projection } }] }).execute({ device, width: 8, height: 8 });
      expect(draws).toHaveLength(1);
      const draw = draws[0]!;
      draw.positions[2]!.forEach((value, index) => expect(value).toBeCloseTo(corner[index]!, 5));
      // Every expanded world corner lies in the camera-facing plane through the sprite centre.
      for (const position of draw.positions) expect(transform(model, position)[2]).toBeCloseTo(0, 5);
      expect(draw.command.uniforms!.get("u_a3dClipGroupCount")).toBe(1);
      expect(Array.from(draw.command.uniforms!.get("u_a3dClipModel") as ArrayLike<number>)).toEqual(model);
      expect(draw.command.shader!.reflection.uniforms.has("u_a3dClipPlanes")).toBe(true);
      device.endFrame();
    } finally { geometry.dispose(); base.dispose(); device.dispose(); }
    expect(device.getDiagnostics().buffers).toBe(0);
  });

  it("emits world corners for a singular model with world-only clipping and rejects it for local clipping", () => {
    const { device, draws } = recordingDevice();
    const geometry = quad();
    const { base, material } = sprite(true);
    const singular: Mat4 = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 1, 2, 0, 1];
    const rasterCamera = { viewMatrix: view, projectionMatrix: projection };
    try {
      device.beginFrame(8, 8);
      new DepthPass({ clippingPass: "shadow", globalClipping: shadowGroup([1, 0, 0, 0]),
        casters: [{ geometry, material, modelMatrix: singular, clippingRasterCamera: rasterCamera }] }).execute({ device, width: 8, height: 8 });
      expect(draws).toHaveLength(1);
      [-0.5, 3, 0].forEach((value, index) => expect(draws[0]!.positions[2]![index]).toBeCloseTo(value, 5));
      expect(Array.from(draws[0]!.command.uniforms!.get("u_a3dClipModel") as ArrayLike<number>)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      expect(() => new DepthPass({ clippingPass: "shadow", casters: [{ geometry, material, modelMatrix: singular,
        materialClipping: shadowGroup([1, 0, 0, 0], "local"), clippingRasterCamera: rasterCamera }] }).execute({ device, width: 8, height: 8 }))
        .toThrowError(expect.objectContaining({ code: "DEPTH_CLIPPING_SPRITE_TRANSFORM" }));
      expect(draws).toHaveLength(1);
      device.endFrame();
    } finally { geometry.dispose(); base.dispose(); device.dispose(); }
  });

  it("requires the raster camera that drew the sprite before any draw", () => {
    const { device, draws } = recordingDevice();
    const geometry = quad();
    const { base, material } = sprite(true);
    try {
      device.beginFrame(8, 8);
      expect(() => new DepthPass({ clippingPass: "shadow", globalClipping: shadowGroup([1, 0, 0, 0]), casters: [{ geometry, material }] })
        .execute({ device, width: 8, height: 8 })).toThrowError(expect.objectContaining({ code: "DEPTH_CLIPPING_RASTER_CAMERA_REQUIRED" }));
      expect(draws).toHaveLength(0);
      device.endFrame();
    } finally { geometry.dispose(); base.dispose(); device.dispose(); }
  });
});

describe("clipped screen-space line depth", () => {
  const view: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -5, 1];
  const projection: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.02, -1, 0, 0, -0.202, 0];
  const lightViewProjection: Mat4 = [0.1, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, -0.1, 0, 0, 0, 0, 1];
  const model: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.5, 0, 0, 1];

  function lineItem(material: ScreenSpaceLineMaterial, geometry: Geometry, camera = true): RenderItem {
    return { geometry, material, modelMatrix: model, label: "clipped-line",
      ...(camera ? { clippingRasterCamera: { viewMatrix: view, projectionMatrix: projection } } : {}) };
  }

  it.each([false, true])("keeps the forward scene-camera expansion and projects into the pass camera (logarithmic=%s)", (logarithmic) => {
    const { device, draws } = recordingDevice();
    const geometry = Geometry.screenSpaceLineSegments([{ start: [-1, 0, 0], end: [1, 0, 0] }, { start: [1, 0, 0], end: [1, 1, 0] }]);
    const material = new ScreenSpaceLineMaterial({ width: 6 });
    try {
      device.beginFrame(8, 8);
      new DepthPass({
        shaderLibrary: createDefaultShaderLibrary(), clippingPass: "depth", globalClipping: shadowGroup([1, 0, 0, 0]),
        viewProjectionMatrix: lightViewProjection, casters: [lineItem(material, geometry)],
        ...(logarithmic ? {
          depthConvention: negotiateDepthConvention({ mode: "logarithmic" }, { clipRange: "minus-one-to-one", reversed: true, logarithmic: true }),
          depthViewMatrix: view, depthRange: { near: 0.1, far: 10 }
        } : {})
      }).execute({ device, width: 8, height: 8 });
      expect(draws).toHaveLength(1);
      const { command } = draws[0]!;
      expect(command.shader!.label).toBe(`aura3d/screen-space-line:clipped:depth${logarithmic ? ":log" : ""}`);
      expect(command.indexCount).toBe(12);
      const uniforms = command.uniforms!;
      expect(Array.from(uniforms.get("u_a3dDepthViewProjection") as ArrayLike<number>)).toEqual(lightViewProjection);
      expect(Array.from(uniforms.get("u_viewMatrix") as ArrayLike<number>)).toEqual(view);
      expect(Array.from(uniforms.get("u_projectionMatrix") as ArrayLike<number>)).toEqual(projection);
      const mvp = multiplyMat4(multiplyMat4(projection, view), model);
      Array.from(uniforms.get("u_modelViewProjection") as ArrayLike<number>).forEach((value, index) => expect(value).toBeCloseTo(mvp[index]!, 6));
      const inverse = invertMat4(mvp);
      Array.from(uniforms.get("u_a3dClipInverseLineTransform") as ArrayLike<number>).forEach((value, index) => expect(value).toBeCloseTo(inverse[index]!, 5));
      expect(uniforms.get("u_lineWidth")).toBe(6);
      expect(uniforms.get("u_a3dClipGroupCount")).toBe(1);
      expect(uniforms.get("u_a3dClipRange")).toBe(0);
      expect(uniforms.has("u_a3dLogDepthRange")).toBe(logarithmic);
      expect(command.renderState?.cullMode).toBe("none");
      expect(command.renderState?.depthWrite).toBe(true);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("fails closed without a raster camera, an authenticated line source or the built-in line material", () => {
    const { device, draws } = recordingDevice();
    const geometry = Geometry.screenSpaceLineSegments([{ start: [-1, 0, 0], end: [1, 0, 0] }]);
    const material = new ScreenSpaceLineMaterial({ width: 3 });
    try {
      device.beginFrame(8, 8);
      const run = (item: RenderItem, shaderLibrary = createDefaultShaderLibrary()) => () =>
        new DepthPass({ shaderLibrary, clippingPass: "shadow", globalClipping: shadowGroup([1, 0, 0, 0]), casters: [item] })
          .execute({ device, width: 8, height: 8 });
      expect(run(lineItem(material, geometry, false))).toThrowError(expect.objectContaining({ code: "DEPTH_CLIPPING_RASTER_CAMERA_REQUIRED" }));
      expect(run(lineItem(material, geometry), createLeanCoreShaderLibrary())).toThrowError(expect.objectContaining({ code: "DEPTH_CLIPPING_PROGRAM_UNSUPPORTED" }));
      expect(run({ ...lineItem(material, geometry), instanceTransforms: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }))
        .toThrowError(expect.objectContaining({ code: "DEPTH_CLIPPING_SPECIALIZED_GEOMETRY_UNSUPPORTED" }));
      expect(draws).toHaveLength(0);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });
});
