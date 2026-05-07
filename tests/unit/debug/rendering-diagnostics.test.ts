import { describe, expect, it } from "vitest";
import {
  Geometry,
  MockRenderDevice,
  UnlitMaterial,
  createDefaultShaderLibrary,
  DEFAULT_UNLIT_SHADER_NAME
} from "../../../packages/rendering/src";
import {
  DrawCallTracker,
  MaterialDiagnostics,
  RenderStateInspector,
  RenderStateLeakError,
  ShaderDiagnosticError,
  ShaderDiagnostics
} from "../../../packages/debug/src";

describe("rendering diagnostics", () => {
  it("flags zero draw-call frames", () => {
    const tracker = new DrawCallTracker();
    tracker.beginFrame();

    expect(tracker.capture().zeroDrawCallFailure).toBe(true);
  });

  it("records draw-call classification", () => {
    const device = new MockRenderDevice();
    const geometry = Geometry.triangle();
    const vertexBuffer = geometry.vertexBuffer.upload(device);
    const indexBuffer = geometry.indexBuffer?.upload(device);
    const tracker = new DrawCallTracker();
    tracker.beginFrame();
    tracker.record({
      label: "triangle",
      topology: "triangles",
      vertexBuffer,
      vertexCount: 3,
      indexBuffer,
      indexType: geometry.indexBuffer?.type,
      indexCount: geometry.indexBuffer?.count
    });

    expect(tracker.capture().records[0]).toMatchObject({ label: "triangle", indexed: true, count: 3 });
  });

  it("detects render state leaks", () => {
    const inspector = new RenderStateInspector();
    const before = new Map([["blend", false]]);
    const after = new Map([["blend", true]]);

    expect(() => inspector.assertNoLeak(before, after)).toThrow(RenderStateLeakError);
  });

  it("throws on shader marker mismatches", () => {
    const report = new ShaderDiagnostics().inspectSources({
      label: "wrong",
      marker: "@expected",
      vertex: "// @expected",
      fragment: "// @actual"
    });

    expect(() => new ShaderDiagnostics().assertMarker(report)).toThrow(ShaderDiagnosticError);
  });

  it("reports material binding failures", () => {
    const device = new MockRenderDevice();
    const shader = device.createShaderProgram({
      label: "bad",
      marker: "@bad",
      vertex: "// @bad\nin vec3 a_position; void main() {}",
      fragment: "// @bad\nvoid main() {}"
    });

    const report = new MaterialDiagnostics().inspect(new UnlitMaterial(), shader);

    expect(report.valid).toBe(false);
    expect(report.diagnostics.join("\n")).toContain("Missing shader uniform");
  });

  it("reports valid material bindings", () => {
    const device = new MockRenderDevice();
    const library = createDefaultShaderLibrary();
    const shader = device.createShaderProgram(library.compileSource(DEFAULT_UNLIT_SHADER_NAME));

    const report = new MaterialDiagnostics().inspect(new UnlitMaterial(), shader);

    expect(report.valid).toBe(true);
    expect(report.uniforms).toContain("u_baseColor");
  });
});
