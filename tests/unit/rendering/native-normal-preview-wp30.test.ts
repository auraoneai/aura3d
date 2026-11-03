import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Matrix4 } from "@aura3d/math";
import { clipping, material, primitives } from "../../../packages/engine/src/public/index";
import { createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { ForwardPass } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PortableShaderMaterial } from "../../../packages/rendering/src/PortableShaderMaterial";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, type WebGPUDeviceLike, type WebGPURenderPipelineDescriptorLike } from "../../../packages/rendering/src/WebGPUDevice";

type Vec3 = readonly [number, number, number];
type Side = "front" | "back" | "double";
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const model = [0, 2, 0, 0, -3, 0, 0, 0, 0, 0, 4, 0, 5, -2, 1, 1] as const;
const mirrored = [0, -2, 0, 0, -3, 0, 0, 0, 0, 0, 4, 0, 5, -2, 1, 1] as const;
// A rotated, scaled view also catches using view directly instead of its inverse transpose.
const view = [0, 0, -1, 0, 0, 2, 0, 0, 1, 0, 0, 0, 7, -2, 11, 1] as const;
const hasNaga = spawnSync("naga", ["--version"], { stdio: "ignore" }).status === 0;

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const direction = (m: ArrayLike<number>, v: Vec3): Vec3 => [
  m[0]! * v[0] + m[4]! * v[1] + m[8]! * v[2],
  m[1]! * v[0] + m[5]! * v[1] + m[9]! * v[2],
  m[2]! * v[0] + m[6]! * v[1] + m[10]! * v[2]
];
const column = (m: ArrayLike<number>, index: number): Vec3 => [m[index * 4]!, m[index * 4 + 1]!, m[index * 4 + 2]!];
const determinant = (m: ArrayLike<number>): number => dot(column(m, 0), cross(column(m, 1), column(m, 2)));
const unit = (v: Vec3): Vec3 => {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
};
const rgb = (v: Vec3): Vec3 => [v[0] * 0.5 + 0.5, v[1] * 0.5 + 0.5, v[2] * 0.5 + 0.5];
const negate = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
const expectVec = (actual: readonly number[], expected: readonly number[]): void => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 6));
};

interface BoundDraw {
  readonly model: Float32Array;
  readonly normal: Float32Array;
  readonly view: Float32Array;
  readonly projection: Float32Array;
  readonly cull: string | undefined;
}

/** Replays the shader equation on the actual matrix packet, not on fabricated uniforms. */
function boundPreview(draw: BoundDraw, localNormal: Vec3, frontFacing: boolean): Vec3 {
  const viewDet = determinant(draw.view);
  const modelDet = determinant(draw.model);
  if (!(Math.abs(viewDet) > 1e-12 && Math.abs(viewDet) < 3e38 &&
        Math.abs(modelDet) > 1e-12 && Math.abs(modelDet) < 3e38)) return [0.5, 0.5, 0.5];
  const [a, b, c] = [column(draw.view, 0), column(draw.view, 1), column(draw.view, 2)];
  const [c0, c1, c2] = [cross(b!, c!), cross(c!, a!), cross(a!, b!)];
  const n = direction(draw.normal, localNormal);
  const sign = viewDet < 0 ? -1 : 1;
  const transformed: Vec3 = [
    sign * (c0[0] * n[0] + c1[0] * n[1] + c2[0] * n[2]),
    sign * (c0[1] * n[0] + c1[1] * n[1] + c2[1] * n[2]),
    sign * (c0[2] * n[0] + c1[2] * n[1] + c2[2] * n[2])
  ];
  const largest = Math.max(...transformed.map(Math.abs));
  if (!(largest > 0) || !transformed.every((v) => Number.isFinite(v) && Math.abs(v) <= 3e38)) return [0.5, 0.5, 0.5];
  const scaled: Vec3 = [transformed[0] / largest, transformed[1] / largest, transformed[2] / largest];
  const faceNormal = frontFacing ? unit(scaled) : negate(unit(scaled));
  return rgb(faceNormal);
}

function captureDraw(side: Side, modelMatrix: readonly number[], viewMatrix: readonly number[], projection = identity): BoundDraw {
  const resource = createProductionRuntimePrimitiveEntries([
    primitives.box({ material: material.normal({ side }) }).toJSON()
  ])[0]!.resources[0]!;
  const device = new MockRenderDevice();
  try {
    device.beginFrame(8, 8);
    new ForwardPass({
      items: [{ geometry: resource.geometry, material: resource.material, modelMatrix }],
      cameraViewMatrix: viewMatrix,
      customFrameCamera: { viewMatrix, projectionMatrix: projection }
    }).execute({ device, width: 8, height: 8 });
    expect(device.drawCommands).toHaveLength(1);
    const draw = device.drawCommands[0]!;
    const matrix = (name: string) => new Float32Array(draw.uniforms!.get(name) as Float32Array);
    return {
      model: matrix("u_modelMatrix"), normal: matrix("u_normalMatrix"),
      view: matrix("u_viewMatrix"), projection: matrix("u_projectionMatrix"),
      cull: draw.renderState?.cullMode
    };
  } finally {
    resource.geometry.dispose();
    resource.material.dispose();
    device.dispose();
  }
}

describe("WP-30 normal preview transforms and draws", () => {
  it("uses the real forward packet and inverse-transpose normals for rotated nonuniform transforms", () => {
    const draw = captureDraw("front", model, view);
    expect(Array.from(draw.model)).toEqual([...model]);
    expect(Array.from(draw.view)).toEqual([...view]);
    expect(Array.from(draw.projection)).toEqual([...identity]);
    expect(draw.cull).toBe("back");

    const tangentA: Vec3 = [1, 1, 0], tangentB: Vec3 = [0, 1, 1];
    const localNormal = cross(tangentA, tangentB);
    // Independent reference: transform tangents and take their geometric cross product.
    const a = direction(view, direction(model, tangentA));
    const b = direction(view, direction(model, tangentB));
    const expectedNormal = unit(cross(a, b));
    expectVec(boundPreview(draw, localNormal, true), rgb(expectedNormal));
    const incorrect = unit(direction(view, direction(model, localNormal)));
    expect(Math.abs(dot(incorrect, expectedNormal))).toBeLessThan(0.99);
  });

  it("orients both faces and swaps culling correctly for a reflected model", () => {
    const tangentA: Vec3 = [1, 1, 0], tangentB: Vec3 = [0, 1, 1];
    const normal = cross(tangentA, tangentB);
    for (const matrix of [model, mirrored]) {
      const reflected = determinant(matrix) < 0;
      const geometric = unit(cross(direction(view, direction(matrix, tangentA)), direction(view, direction(matrix, tangentB))));
      const outward = reflected ? negate(geometric) : geometric;
      for (const [side, normalCull, reflectedCull] of [
        ["front", "back", "front"], ["back", "front", "back"], ["double", "none", "none"]
      ] as const) {
        const draw = captureDraw(side, matrix, view);
        expect(draw.cull).toBe(reflected ? reflectedCull : normalCull);
        // Reflection flips GPU winding; the renderer also signs u_normalMatrix.
        const logicalFrontFacing = !reflected;
        const front = boundPreview(draw, normal, logicalFrontFacing);
        const back = boundPreview(draw, normal, !logicalFrontFacing);
        expectVec(front, rgb(outward));
        expectVec(back, rgb(negate(outward)));
        expectVec(front.map((value, index) => value + back[index]!), [1, 1, 1]);
      }
    }
  });

  it("normalizes after interpolation and maps degenerate directions to neutral gray", () => {
    const scale = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1];
    const draw = captureDraw("double", scale, identity);
    const interpolated: Vec3 = [0.2, 0.3, 0.5];
    expectVec(boundPreview(draw, interpolated, true), rgb(unit([0.1, 0.3, 0.125])));
    expectVec(boundPreview(draw, [0, 0, 0], true), [0.5, 0.5, 0.5]);
    expectVec(boundPreview(draw, [1e30, 0, 0], true), [1, 0.5, 0.5]);
    expectVec(boundPreview(captureDraw("double", [0, ...identity.slice(1)], identity), [1, 0, 0], true), [0.5, 0.5, 0.5]);
    expectVec(boundPreview(captureDraw("double", [1e-13, ...identity.slice(1)], identity), [1, 0, 0], true), [0.5, 0.5, 0.5]);
    expectVec(boundPreview(captureDraw("double", identity, [0, ...identity.slice(1)]), [1, 0, 0], true), [0.5, 0.5, 0.5]);

    const source = material.normal().custom!;
    expect(source.glsl.vertex).toContain("abs(modelDet) > 1.0e-12");
    expect(source.glsl.vertex).toContain("abs(viewDet) > 1.0e-12");
    expect(source.glsl.vertex).not.toMatch(/\bnormalize\s*\(/);
    expect(source.glsl.fragment).toContain("largest > 0.0");
    expect(source.wgsl?.vertex).toContain("abs(modelDet) > 1.0e-12");
    expect(source.wgsl?.vertex).not.toMatch(/\bnormalize\s*\(/);
    expect(source.wgsl?.fragment).toContain("largest > 0.0");
  });

  it("maps the standard GL camera near/far clip range into WebGPU's zero-to-one range", () => {
    const projection = Matrix4.perspective(Math.PI / 2, 1, 1, 100).elements;
    const ndc = (z: number) => {
      const clipZ = projection[10]! * z + projection[14]!;
      const clipW = projection[11]! * z + projection[15]!;
      return [(clipZ / clipW), (0.5 * clipZ + 0.5 * clipW) / clipW];
    };
    expectVec(ndc(-1), [-1, 0]);
    expectVec(ndc(-100), [1, 1]);
    expect(material.normal().custom!.wgsl!.vertex).toContain("clip.z * 0.5 + clip.w * 0.5");
  });

  it("requires a normal attribute and rejects clipping instead of silently drawing without it", () => {
    const resource = createProductionRuntimePrimitiveEntries([
      primitives.box({ material: material.normal() }).toJSON()
    ])[0]!.resources[0]!;
    const missingNormals = new Geometry(new VertexBuffer(VertexFormat.P3, 3), null, "triangles");
    const planes = clipping.global({ planes: [[1, 0, 0, 0]] });
    const device = new MockRenderDevice();
    try {
      device.beginFrame(8, 8);
      try {
        new ForwardPass({ items: [{ geometry: missingNormals, material: resource.material }] })
          .execute({ device, width: 8, height: 8 });
        throw new Error("missing-normal geometry unexpectedly drew");
      } catch (error) {
        expect(error).toMatchObject({
          code: "RENDER_ITEM_GEOMETRY_MATERIAL_CONTRACT",
          details: { missingAttributes: ["a_normal"] }
        });
      }
      expect(() => new ForwardPass({
        items: [{ geometry: resource.geometry, material: resource.material }], globalClipping: planes
      }).execute({ device, width: 8, height: 8 })).toThrow(/clipping/i);
      expect(device.drawCommands).toHaveLength(0);
    } finally {
      planes.dispose();
      missingNormals.dispose();
      resource.geometry.dispose();
      resource.material.dispose();
      device.dispose();
    }
  });

  it.runIf(spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0)(
    "links the fully assembled GLSL ES stages", () => {
      const resource = createProductionRuntimePrimitiveEntries([
        primitives.box({ material: material.normal() }).toJSON()
      ])[0]!.resources[0]!;
      const compiled = resource.material as PortableShaderMaterial;
      const directory = mkdtempSync(join(tmpdir(), "aura3d-normal-preview-"));
      try {
        const vertex = join(directory, "normal.vert"), fragment = join(directory, "normal.frag");
        writeFileSync(vertex, compiled.sources.glsl.vertex);
        writeFileSync(fragment, compiled.sources.glsl.fragment);
        const reflection = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
        for (const name of ["a_position", "a_normal", "u_modelMatrix", "u_normalMatrix", "u_viewMatrix", "u_projectionMatrix"]) {
          expect(reflection).toContain(name);
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
        resource.geometry.dispose();
        resource.material.dispose();
      }
    }
  );

  it("submits the paired WGSL and real matrix bytes through a native-shaped WebGPU mock", async () => {
    const modules: string[] = [];
    const pipelines: WebGPURenderPipelineDescriptorLike[] = [];
    const writes: Uint8Array[] = [];
    let draws = 0;
    const native: WebGPUDeviceLike = {
      queue: {
        writeBuffer(buffer, _offset, data) {
          if (!(buffer as { label?: string }).label?.endsWith("-portable-uniforms")) return;
          const bytes = data instanceof ArrayBuffer
            ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          writes.push(bytes.slice());
        },
        submit() {},
        onSubmittedWorkDone: async () => {}
      },
      createBuffer({ label, size, usage }) { return { label, size, usage, destroy() {} }; },
      createTexture({ label }) { return { label, createView: () => ({}), destroy() {} }; },
      createSampler() { return {}; },
      createShaderModule({ code }) { modules.push(code); return {}; },
      createBindGroupLayout() { return {}; },
      createPipelineLayout() { return {}; },
      createRenderPipeline(descriptor) { pipelines.push(descriptor); return { getBindGroupLayout: () => ({}) }; },
      createBindGroup() { return {}; },
      createCommandEncoder() {
        return {
          beginRenderPass: () => ({
            setPipeline() {}, setVertexBuffer() {}, setIndexBuffer() {}, setBindGroup() {},
            draw() { draws += 1; }, drawIndexed() { draws += 1; }, end() {}
          }),
          finish: () => ({})
        };
      },
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
    const target = device.createRenderTarget({ width: 8, height: 8, depth: false, label: "normal-preview-target" });
    const resource = createProductionRuntimePrimitiveEntries([
      primitives.box({ material: material.normal({ side: "back" }) }).toJSON()
    ])[0]!.resources[0]!;
    const projection = Matrix4.perspective(Math.PI / 2, 1, 1, 100).elements;
    try {
      device.beginFrame(8, 8);
      device.setRenderTarget(target);
      new ForwardPass({
        items: [{ geometry: resource.geometry, material: resource.material, modelMatrix: model }],
        cameraViewMatrix: view,
        customFrameCamera: { viewMatrix: view, projectionMatrix: projection }
      }).execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(draws).toBe(1);
      expect(pipelines.some((pipeline) => pipeline.primitive.cullMode === "front")).toBe(true);
      expect(pipelines.flatMap((pipeline) => pipeline.vertex.buffers ?? [])
        .flatMap((buffer) => buffer?.attributes.map((attribute) => attribute.shaderLocation) ?? []))
        .toEqual(expect.arrayContaining([0, 1]));
      expect(modules.some((source) => source.includes("@group(0) @binding(0)") &&
        source.includes("clip.z * 0.5 + clip.w * 0.5") && source.includes("u_normalMatrix"))).toBe(true);
      expect(modules.some((source) => source.includes("@builtin(front_facing)") && source.includes("inverseSqrt"))).toBe(true);
      expect(writes).toHaveLength(1);
      const values = new Float32Array(writes[0]!.buffer, writes[0]!.byteOffset, writes[0]!.byteLength / 4);
      // Portable layout: MVP, model, normal, view, projection; all are mat4.
      expect(Array.from(values.slice(16, 32))).toEqual([...model]);
      expect(Array.from(values.slice(48, 64))).toEqual([...view]);
      expect(Array.from(values.slice(64, 80))).toEqual(Array.from(new Float32Array(projection)));
      expect(values[32]).toBeCloseTo(0);
      expect(values[33]).toBeCloseTo(0.5);
    } finally {
      resource.geometry.dispose();
      resource.material.dispose();
      target.dispose();
      device.dispose();
    }
  });

  it.runIf(process.env.A3D_REQUIRE_NAGA === "1")("requires Naga when the source gate requests WGSL validation", () => {
    expect(hasNaga).toBe(true);
  });

  it.runIf(hasNaga)(
    "validates the device-injected WGSL stages with the offline Naga compiler", async () => {
      const modules: string[] = [];
      const native: WebGPUDeviceLike = {
        queue: { writeBuffer() {}, submit() {} },
        createBuffer({ size, usage }) { return { size, usage, destroy() {} }; },
        createShaderModule({ code }) { modules.push(code); return {}; },
        destroy() {}
      };
      const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
      const resource = createProductionRuntimePrimitiveEntries([
        primitives.box({ material: material.normal() }).toJSON()
      ])[0]!.resources[0]!;
      const directory = mkdtempSync(join(tmpdir(), "aura3d-normal-wgsl-"));
      try {
        expect((resource.material as PortableShaderMaterial).compile(device).ok).toBe(true);
        expect(modules).toHaveLength(2);
        for (const [index, code] of modules.entries()) {
          const path = join(directory, `normal-${index}.wgsl`);
          writeFileSync(path, code);
          expect(() => execFileSync("naga", [path], { encoding: "utf8" })).not.toThrow();
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
        resource.geometry.dispose();
        resource.material.dispose();
        device.dispose();
      }
    }
  );
});
