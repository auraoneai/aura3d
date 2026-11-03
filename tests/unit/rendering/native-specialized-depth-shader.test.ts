import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClippedScreenSpaceLineShader } from "../../../packages/rendering/src/forward/ScreenSpaceLineClipping.js";
import { assertSpecializedLineDepthClipRange, createSpecializedLineDepthShader, SPECIALIZED_POINT_DEPTH_REPROJECTION_WGSL } from "../../../packages/rendering/src/shadows/SpecializedDepthShader.js";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary.js";
import { DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME } from "../../../packages/rendering/src/ShaderLibraryCore.js";
import { reflectShaderSources } from "../../../packages/rendering/src/ShaderReflection.js";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice.js";
import { invertMat4, type Mat4 } from "../../../packages/scene/src/MathTypes.js";

const hasCommand = (name: string) => spawnSync(name, ["--version"], { stdio: "ignore" }).status === 0;

function lineSources() {
  return createDefaultShaderLibrary().compileSource(DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME);
}

function transform(matrix: Mat4, value: readonly number[]): number[] {
  return Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (_, column) => matrix[column * 4 + row]! * value[column]!).reduce((left, right) => left + right, 0));
}

describe("staged point-quad depth reprojection", () => {
  it("requires a usable world divisor and finite light clip before reporting a valid corner", () => {
    const source = SPECIALIZED_POINT_DEPTH_REPROJECTION_WGSL;
    expect(source).toContain("worldH.w >= 1e-8");
    expect(source).toContain("worldH.xyz / worldH.w");
    expect(source).toContain("depthViewProjection * vec4f(world, 1.0)");
    expect(source).toContain("!all(abs(depthClip) < vec4f(1e30))");
    expect(source).toContain("vec4f(2.0, 2.0, 2.0, 1.0), vec3f(0.0), 1.0");
    expect(source).toContain("result.invalid = 0.0");
    expect(source).toContain("select((depthClip.z + depthClip.w) * 0.5, depthClip.z, depthZeroToOne)");
    // Visibility, clipping and coverage belong to the consuming stages.
    expect(source).not.toContain("discard");
    expect(source).not.toContain("textureSample");
  });

  it("maps an expanded perspective corner into a distinct depth camera", () => {
    // Hand-checkable perspective scene and an oblique orthographic depth camera.
    const scene: Mat4 = [1.5, 0, 0, 0, 0, 2, 0, 0, 0, 0, -11 / 9, -1, 0, 0, -20 / 9, 0];
    const light: Mat4 = [0.5, 0, 0, 0, 0, 0.5, 0, 0, 0.25, 0, 0.25, 0, 0, 0, 2, 1];
    const center = transform(scene, [1, 2, -6, 1]);
    // The top-right corner of a 20-pixel point in a 400-by-200 viewport.
    const expanded = [center[0]! + center[3]! * 20 / 400, center[1]! + center[3]! * 20 / 200, center[2]!, center[3]!];
    const worldH = transform(invertMat4(scene), expanded);
    const world = worldH.slice(0, 3).map((value) => value / worldH[3]!);
    expect(world[0]).toBeCloseTo(1.2);
    expect(world[1]).toBeCloseTo(2.3);
    expect(world[2]).toBeCloseTo(-6);
    const depth = transform(light, [...world, 1]);
    expect(depth[0]).toBeCloseTo(-0.9);
    expect(depth[1]).toBeCloseTo(1.15);
    expect(depth[2]).toBeCloseTo(0.5);
    expect((depth[2]! + depth[3]!) * 0.5).toBeCloseTo(0.75);
  });

  it.runIf(hasCommand("naga"))("validates the reprojection module offline", () => {
    const dir = mkdtempSync(join(tmpdir(), "aura3d-point-depth-wgsl-"));
    try {
      const path = join(dir, "point-depth.wgsl");
      writeFileSync(path, SPECIALIZED_POINT_DEPTH_REPROJECTION_WGSL);
      expect(() => execFileSync("naga", [path], { encoding: "utf8" })).not.toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("specialized clipped line depth source", () => {
  it("preflights depth projection ranges against the actual backend", () => {
    expect(() => assertSpecializedLineDepthClipRange("webgl2", "minus-one-to-one")).not.toThrow();
    expect(() => assertSpecializedLineDepthClipRange("webgpu", "minus-one-to-one")).not.toThrow();
    expect(() => assertSpecializedLineDepthClipRange("webgpu", "zero-to-one")).not.toThrow();
    expect(() => assertSpecializedLineDepthClipRange("webgl2", "zero-to-one"))
      .toThrow(/does not match the backend clip range/);
  });

  it.each([false, true])("retains forward coverage while projecting expanded world corners (logarithmic=%s)", (logarithmic) => {
    const forward = createClippedScreenSpaceLineShader(lineSources());
    const depth = createSpecializedLineDepthShader(forward, { logarithmic });
    const native = depth.webgpu!;
    expect(depth.label).toBe(`${forward.label}:depth${logarithmic ? ":log" : ""}`);

    // Scene-camera near clipping and width expansion happen before the light
    // projection. Its input is the expanded world position, not the segment
    // endpoint or the shadow target's viewport dimensions.
    const worldPosition = depth.vertex.indexOf("v_a3dLineClipWorld = a3dLineWorld");
    const lightProjection = depth.vertex.indexOf("u_a3dDepthViewProjection * vec4(v_a3dLineClipWorld");
    expect(worldPosition).toBeGreaterThan(depth.vertex.indexOf("nearStart = originalStart.z + originalStart.w"));
    expect(lightProjection).toBeGreaterThan(worldPosition);
    expect(depth.vertex).toContain("u_a3dDepthViewProjection * vec4(v_a3dLineClipWorld, 1.0)");
    expect(native.vertex).toContain("aura.u_a3dDepthViewProjection * vec4f(out.clipWorld, 1.0)");
    expect(native.vertex).toContain("select((a3dDepthClip.z + a3dDepthClip.w) * 0.5, a3dDepthClip.z, aura.u_a3dClipRange > 0.5)");
    expect(depth.vertex).toContain("v_a3dLineClipInvalid > 0.0 || !all(lessThan(abs(a3dDepthClip), vec4(1e30)))");
    expect(depth.vertex).toContain("gl_Position = vec4(2.0, 2.0, 2.0, 1.0)");
    expect(native.vertex).toContain("out.clipInvalid > 0.0 || !all(abs(a3dDepthClip) < vec4f(1e30))");
    expect(native.vertex).toContain("out.position = vec4f(2.0, 2.0, 2.0, 1.0)");
    expect(depth.fragment).toContain("if (v_a3dLineClipInvalid > 0.0) discard;");
    expect(native.fragment).toContain("if (clipInvalid > 0.0) { discard; }");

    // A dashed or rounded line must leave the same holes in the depth output;
    // clipping is evaluated with the two groups before depth is written.
    for (const source of [depth.fragment, native.fragment]) {
      expect(source).toContain("a3dLineIsClipped");
      expect(source).toContain("u_lineDashOffset");
      expect(source).toContain("u_lineRoundCaps");
      expect(source).toContain("discard");
    }
    expect(depth.fragment).not.toContain("outColor = u_baseColor * v_lineColor");
    expect(native.fragment).not.toContain("return aura.u_baseColor * color");
    expect(depth.fragment).toContain(logarithmic ? "gl_FragDepth = a3dDepth" : "gl_FragCoord.z");
    expect(native.fragment).toContain(logarithmic ? "@builtin(frag_depth)" : "a3dDepthFragmentPosition.z");

    const names = new Set(depth.portableBindings!.map((binding) => binding.name));
    for (const name of ["u_a3dDepthViewProjection", "u_a3dClipRange", "u_a3dClipInverseLineTransform", "u_a3dClipPlanes", "u_a3dClipGroups"]) {
      expect(names.has(name)).toBe(true);
    }
    expect(names.has("u_a3dLogDepthView")).toBe(logarithmic);
    expect(names.has("u_a3dLogDepthRange")).toBe(logarithmic);
    const reflection = reflectShaderSources(depth);
    expect(reflection.uniforms.has("u_a3dDepthViewProjection")).toBe(true);
    expect(reflection.uniforms.has("u_a3dClipPlanes")).toBe(true);
    expect(reflection.uniforms.has("u_a3dLogDepthView")).toBe(logarithmic);

    // Source construction does not mutate the forward program shared by other draws.
    expect(forward.vertex).not.toContain("u_a3dDepthViewProjection");
    expect(forward.fragment).toContain("outColor = u_baseColor * v_lineColor");
  });

  it("rejects absent, stale, or already transformed contracts instead of returning a partial shader", () => {
    const source = lineSources();
    expect(() => createSpecializedLineDepthShader(source)).toThrow(/clipped forward/);
    const forward = createClippedScreenSpaceLineShader(source);
    const staleVertex = { ...forward, vertex: forward.vertex.replace("  v_lineCapFraction = capFraction;", "") };
    expect(() => createSpecializedLineDepthShader(staleVertex)).toThrow(/incompatible GLSL expanded position/);
    const missingInvalidDiscard = { ...forward, fragment: forward.fragment.replace("if (v_a3dLineClipInvalid > 0.0) discard;", "") };
    expect(() => createSpecializedLineDepthShader(missingInvalidDiscard)).toThrow(/clipped forward/);
    const staleNative = { ...forward, webgpu: { ...forward.webgpu!, vertex: forward.webgpu!.vertex.replaceAll("out.clipWorld", "out.noWorld") } };
    expect(() => createSpecializedLineDepthShader(staleNative)).toThrow(/clipped forward WGSL/);
    const incompatibleBindings = { ...forward, portableBindings: [...forward.portableBindings!, { name: "u_a3dClipRange", kind: "float" as const }] };
    expect(() => createSpecializedLineDepthShader(incompatibleBindings)).toThrow(/binding already exists/);
    const first = createSpecializedLineDepthShader(forward);
    expect(() => createSpecializedLineDepthShader(first)).toThrow(/clipped forward/);
  });

  it.runIf(hasCommand("glslangValidator"))("links both depth variants offline", () => {
    const dir = mkdtempSync(join(tmpdir(), "aura3d-line-depth-"));
    try {
      const forward = createClippedScreenSpaceLineShader(lineSources());
      for (const logarithmic of [false, true]) {
        const depth = createSpecializedLineDepthShader(forward, { logarithmic });
        const vertex = join(dir, "line.vert"), fragment = join(dir, "line.frag");
        writeFileSync(vertex, depth.vertex); writeFileSync(fragment, depth.fragment);
        const output = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
        expect(output).toContain("u_a3dDepthViewProjection");
        expect(output).toContain("u_a3dClipPlanes");
        if (logarithmic) expect(output).toContain("u_a3dLogDepthView");
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("supplies the native binding layout to the WebGPU device adapter", async () => {
    const modules: string[] = [];
    const native: WebGPUDeviceLike = {
      queue: { writeBuffer() {}, submit() {} },
      createBuffer() { return { destroy() {} }; },
      createShaderModule(descriptor) { modules.push(descriptor.code); return {}; },
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
    try {
      const forward = createClippedScreenSpaceLineShader(lineSources());
      device.createShaderProgram(createSpecializedLineDepthShader(forward, { logarithmic: true }));
      expect(modules).toHaveLength(2);
      for (const module of modules) {
        expect(module).toContain("u_a3dDepthViewProjection: mat4x4<f32>");
        expect(module).toContain("u_a3dLogDepthRange: vec2<f32>");
      }
    } finally { device.dispose(); }
  });
});
