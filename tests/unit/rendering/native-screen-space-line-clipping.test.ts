import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clippingRetainsPoint, createClippingBinding } from "../../../packages/rendering/src/ClippingPlanes";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME } from "../../../packages/rendering/src/ShaderLibraryCore";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { createClippedScreenSpaceLineShader, LINE_CLIP_INVERSE_TRANSFORM } from "../../../packages/rendering/src/forward/ScreenSpaceLineClipping";
import { invertMat4, multiplyMat4, type Mat4 } from "../../../packages/scene/src/MathTypes";

const baseSource = () => createDefaultShaderLibrary().compileSource(DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME);
const hasCommand = (name: string) => spawnSync(name, ["--version"], { stdio: "ignore" }).status === 0;

async function nativeModules(): Promise<string[]> {
  const modules: string[] = [];
  const native: WebGPUDeviceLike = {
    queue: { writeBuffer() {}, submit() {} },
    createBuffer() { return { destroy() {} }; },
    createShaderModule(descriptor) { modules.push(descriptor.code); return {}; },
    destroy() {}
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
  try { device.createShaderProgram(createClippedScreenSpaceLineShader(baseSource())); }
  finally { device.dispose(); }
  return modules;
}

function transform(matrix: Mat4, vector: readonly number[]): number[] {
  return Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (_, column) => matrix[column * 4 + row]! * vector[column]!).reduce((a, b) => a + b, 0));
}

function pointFromHomogeneous(value: readonly number[]): [number, number, number] {
  return [value[0]! / value[3]!, value[1]! / value[3]!, value[2]! / value[3]!];
}

describe("screen-space line clipping source contract", () => {
  it("preserves the unclipped stages while adding a separately reflected clip variant", () => {
    const source = baseSource();
    const before = JSON.stringify(source);
    const clipped = createClippedScreenSpaceLineShader(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(clipped.label).toBe(`${source.label}:clipped`);
    expect(clipped.marker).toBe(source.marker);
    expect(source.vertex).not.toContain(LINE_CLIP_INVERSE_TRANSFORM);
    expect(source.fragment).not.toContain("a3dLineIsClipped");

    for (const invariant of [
      "nearStart = originalStart.z + originalStart.w",
      "float t = mix(startT, endT, along)",
      "v_lineColor = mix(colorStart, colorEnd, t)",
      "v_lineDistance = mix(distanceStart, distanceEnd, t)",
      "float capAtEndpoint = along > 0.5",
      "vec3 towardEye = abs(u_projectionMatrix[3][3]) > 0.5",
      "gl_Position = u_projectionMatrix * viewAnchor",
      "gl_Position = clipAnchor"
    ]) expect(clipped.vertex).toContain(invariant);
    for (const invariant of ["mod(v_lineDistance + u_lineDashOffset, period)", "outside * outside + v_lineCap.x * v_lineCap.x", "u_baseColor * v_lineColor"]) {
      expect(clipped.fragment).toContain(invariant);
    }
    expect(clipped.vertex.indexOf("u_a3dClipInverseLineTransform * gl_Position"))
      .toBeGreaterThan(clipped.vertex.indexOf("gl_Position = clipAnchor"));
    expect(clipped.vertex).toContain("vec3 a3dLineLocal = a3dLineLocalH.xyz / a3dLineLocalH.w");
    expect(clipped.vertex).toContain("u_modelMatrix * vec4(a3dLineLocal, 1.0)");
    expect(clipped.vertex).toContain("v_a3dLineClipInvalid = 1.0");
    expect(clipped.vertex).toContain("v_a3dLineClipInvalid = 0.0");
    expect(clipped.fragment).toContain("if (v_a3dLineClipInvalid > 0.0) discard;");
    expect(clipped.fragment).toContain("dot(u_a3dClipPlanes[planeIndex], vec4(point, 1.0)) >= 0.0");
    expect(clipped.fragment).toContain("retained = unionMode ? retained || inside : retained && inside");

    const device = new MockRenderDevice();
    try {
      const program = device.createShaderProgram(clipped);
      for (const name of [LINE_CLIP_INVERSE_TRANSFORM, "u_a3dClipPlanes", "u_a3dClipGroups", "u_a3dClipGroupCount"]) {
        expect(program.reflection.uniforms.has(name)).toBe(true);
      }
      expect(program.reflection.uniformDetails.get("u_a3dClipPlanes")?.arraySize).toBe(8);
      expect(program.reflection.uniformDetails.get("u_a3dClipGroups")?.arraySize).toBe(2);
    } finally { device.dispose(); }
  });

  it("builds native WebGPU stages with the fixed clipping packet and GL-depth unprojection", async () => {
    const modules = await nativeModules();
    expect(modules).toHaveLength(2);
    const vertex = modules.find((code) => code.includes("fn vs_main"))!;
    const fragment = modules.find((code) => code.includes("fn fs_main"))!;
    for (const code of modules) {
      expect(code).toContain("u_a3dClipInverseLineTransform: mat4x4<f32>");
      expect(code).toContain("u_a3dClipPlanes: array<vec4<f32>, 8>");
      expect(code).toContain("u_a3dClipGroups: array<vec4<f32>, 2>");
    }
    expect(vertex.indexOf("aura.u_a3dClipInverseLineTransform * clip"))
      .toBeLessThan(vertex.indexOf("(clip.z + clip.w) * 0.5"));
    expect(vertex).toContain("let a3dLineLocal = a3dLineLocalH.xyz / a3dLineLocalH.w");
    expect(vertex).toContain("aura.u_modelMatrix * vec4f(a3dLineLocal, 1.0)");
    expect(vertex).toContain("out.clipInvalid = 1.0");
    expect(vertex).toContain("out.clipInvalid = 0.0");
    expect(vertex).toContain("nearStart = start.z + start.w");
    expect(vertex).toContain("out.color = mix(mix(color, otherColor, along)");
    expect(fragment).toContain("@location(4) clipLocal: vec3f, @location(5) clipWorld: vec3f");
    expect(fragment).toContain("@location(6) clipInvalid: f32");
    expect(fragment).toContain("if (clipInvalid > 0.0) { discard; }");
    expect(fragment).toContain("if (a3dLineIsClipped(clipLocal, clipWorld)) { discard; }");
    expect(fragment).toContain("aura.u_lineDashOffset");
    expect(fragment).toContain("aura.u_lineRoundCaps");
    expect(fragment).toContain("aura.u_baseColor * color");
  });

  it("rejects mismatched or modified stage contracts rather than dropping clipping", () => {
    const source = baseSource();
    expect(() => createClippedScreenSpaceLineShader({ ...source, label: "other" })).toThrow(/native screen-space line shader contract/);
    expect(() => createClippedScreenSpaceLineShader({ ...source, vertex: source.vertex.replace("gl_Position = clipAnchor", "gl_Position = clipAnchorChanged")
      .replace("  v_lineCapFraction = capFraction;", "  v_lineCapFraction = capChanged;") })).toThrow(/expanded corner/);
    expect(() => createClippedScreenSpaceLineShader({ ...source, portableBindings: [...source.portableBindings!, { name: LINE_CLIP_INVERSE_TRANSFORM, kind: "mat4" }] })).toThrow(/already exist/);
    expect(() => createClippedScreenSpaceLineShader({ ...source, webgpu: undefined })).toThrow(/native screen-space line shader contract/);
  });

  it("reconstructs distinct expanded corners through a perspective camera and object transform", () => {
    // Perspective GL projection and a nonuniformly scaled, translated line.
    const projection: Mat4 = [1.5, 0, 0, 0, 0, 2, 0, 0, 0, 0, -11 / 9, -1, 0, 0, -20 / 9, 0];
    const view: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -6, 1];
    const model: Mat4 = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 1, 2, 0, 1];
    const transformToClip = multiplyMat4(multiplyMat4(projection, view), model);
    const inverse = invertMat4(transformToClip);
    const center = transform(transformToClip, [0, 0, 0, 1]);
    const binding = createClippingBinding({
      global: { planes: [[1, 0, 0, -1]] },
      material: { planes: [[1, 0, 0, 0], [0, 1, 0, -2]], space: "local", combine: "union" }
    });
    const retained: boolean[] = [];
    for (const side of [-1, 0, 1]) {
      // Screen-space expansion is applied to xy while preserving clip z and w.
      const corner = [...center];
      corner[0] += side * 0.1 * center[3]!;
      const local = pointFromHomogeneous(transform(inverse, corner));
      const world = pointFromHomogeneous(transform(model, [...local, 1]));
      expect(local[0]).toBeCloseTo(side * 0.2, 6);
      expect(world[0]).toBeCloseTo(1 + side * 0.4, 6);
      retained.push(clippingRetainsPoint(binding, world, local));
    }
    expect(retained).toEqual([false, true, true]);
  });

  it("keeps near-plane crossings finite and reconstructs their expanded endpoints", () => {
    const projection: Mat4 = [1.5, 0, 0, 0, 0, 2, 0, 0, 0, 0, -11 / 9, -1, 0, 0, -20 / 9, 0];
    const view: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -6, 1];
    const mvp = multiplyMat4(projection, view);
    const inverse = invertMat4(mvp);
    // A view-space line from z=-0.5 to z=-2 crosses the near plane z=-1.
    const start = transform(mvp, [0, 0, 5.5, 1]);
    const end = transform(mvp, [1, 0, 4, 1]);
    const nearStart = start[2]! + start[3]!;
    const nearEnd = end[2]! + end[3]!;
    expect(nearStart).toBeLessThan(0);
    expect(nearEnd).toBeGreaterThan(0);
    const crossing = nearStart / (nearStart - nearEnd);
    expect(crossing).toBeCloseTo(1 / 3, 7);
    const clipped = start.map((value, index) => value + crossing * (end[index]! - value));
    for (const side of [-1, 1]) {
      const corner = [...clipped];
      corner[0] += side * 0.2 * corner[3]!;
      const localH = transform(inverse, corner);
      expect(localH.every(Number.isFinite)).toBe(true);
      expect(localH[3]).toBeCloseTo(1, 7);
      const local = pointFromHomogeneous(localH);
      expect(local[0]).toBeCloseTo(1 / 3 + side * 0.2 / 1.5, 7);
      expect(local[2]).toBeCloseTo(5, 7);
    }
  });

  it("reconstructs world-width expansion for perspective and orthographic views", () => {
    const perspective: Mat4 = [1.5, 0, 0, 0, 0, 2, 0, 0, 0, 0, -11 / 9, -1, 0, 0, -20 / 9, 0];
    const orthographic: Mat4 = [0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, -2 / 9, 0, 0, 0, -11 / 9, 1];
    const view: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -6, 1];
    const model: Mat4 = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 1, 2, 0, 1];
    const binding = createClippingBinding({ global: { planes: [[0, 1, 0, -2]] } });
    // For the horizontal segment the orthographic side is [0,-1,0].
    // The perspective-facing side is [0,-3,-1]/sqrt(10).
    const cases: readonly [Mat4, readonly [number, number, number]][] = [
      [orthographic, [0, -1, 0]], [perspective, [0, -3 / Math.sqrt(10), -1 / Math.sqrt(10)]]
    ];
    for (const [projection, sideVector] of cases) {
      const inverse = invertMat4(multiplyMat4(multiplyMat4(projection, view), model));
      const retained: boolean[] = [];
      for (const side of [-1, 1]) {
        const viewCorner = [1, 2 + side * sideVector[1] * 0.5, -6 + side * sideVector[2] * 0.5, 1];
        const local = pointFromHomogeneous(transform(inverse, transform(projection, viewCorner)));
        const world = pointFromHomogeneous(transform(model, [...local, 1]));
        expect(world[0]).toBeCloseTo(1, 7);
        expect(world[1]).toBeCloseTo(viewCorner[1]!, 7);
        expect(world[2]).toBeCloseTo(viewCorner[2]! + 6, 7);
        retained.push(clippingRetainsPoint(binding, world, local));
      }
      expect(retained).toEqual([true, false]);
    }
  });

  it("guards nonpositive, near-zero and nonfinite homogeneous coordinates before division", () => {
    const shader = createClippedScreenSpaceLineShader(baseSource());
    for (const stage of [shader.vertex, shader.webgpu!.vertex]) {
      expect(stage).toContain("a3dLineLocalH.w >= 1e-8");
      expect(stage.indexOf("a3dLineLocalH.w >= 1e-8")).toBeLessThan(stage.indexOf("a3dLineLocalH.xyz / a3dLineLocalH.w"));
      expect(stage).toContain("abs(a3dLineWorld)");
    }
    // Negative w reverses clip half-spaces after normalization; reject it too.
    const safe = (homogeneous: readonly number[]) =>
      homogeneous.every((component) => Number.isFinite(component) && Math.abs(component) < 1e30) && homogeneous[3]! >= 1e-8;
    expect([0, 1e-9, -1e-9, -1e-8, -1, Infinity, NaN].map((w) => safe([1, 2, 3, w]))).toEqual([false, false, false, false, false, false, false]);
    expect([1e-8, 1].map((w) => safe([1, 2, 3, w]))).toEqual([true, true]);
    expect(safe([Infinity, 2, 3, 1])).toBe(false);
    expect(safe([NaN, 2, 3, 1])).toBe(false);
    expect(safe([1e30, 2, 3, 1])).toBe(false);
  });

  it.runIf(hasCommand("glslangValidator"))("links both clipped GLSL stages offline", () => {
    const source = createClippedScreenSpaceLineShader(baseSource());
    const dir = mkdtempSync(join(tmpdir(), "aura3d-line-clip-"));
    try {
      const vertex = join(dir, "line.vert"), fragment = join(dir, "line.frag");
      writeFileSync(vertex, source.vertex); writeFileSync(fragment, source.fragment);
      const output = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
      expect(output).toContain("u_a3dClipPlanes");
      expect(output).toContain("u_a3dClipGroups");
      expect(output).toContain(LINE_CLIP_INVERSE_TRANSFORM);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.runIf(hasCommand("naga"))("validates both expanded WGSL stages offline", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aura3d-line-clip-wgsl-"));
    try {
      for (const [index, module] of (await nativeModules()).entries()) {
        const path = join(dir, `${index}.wgsl`);
        writeFileSync(path, module);
        expect(() => execFileSync("naga", [path], { encoding: "utf8" })).not.toThrow();
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
