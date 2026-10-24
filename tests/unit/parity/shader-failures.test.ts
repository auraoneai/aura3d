import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearShaderFailures,
  ForwardPass,
  formatShaderFailure,
  Geometry,
  getShaderFailures,
  MockRenderDevice,
  parseShaderLog,
  reportShaderFailure,
  RenderDeviceError,
  setShaderFailureMode,
  UnlitMaterial
} from "../../../packages/rendering/src";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial.js";
import { rethrowShaderFailure, snapshotDiagnostics } from "../../../packages/engine/src/agent-api/diagnostics.js";
import { AuraRuntimeError } from "../../../packages/engine/src/agent-api/compiler/errors.js";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const BROKEN = "float dup = 2.0; // BROKEN_LINE";

const brokenSpec = (): AuraCustomMaterialSpec => ({
  glsl: {
    fragment: `out vec4 outColor;\nvoid main() {\n  float dup = 1.0;\n  ${BROKEN}\n  outColor = vec4(dup, 0.0, 1.0, 1.0);\n}`
  }
});

type Failure = { readonly code: string; readonly details: Record<string, unknown> };

/** Models a driver that rejects any program whose fragment source carries the BROKEN_LINE token. */
class FailingDevice extends MockRenderDevice {
  constructor(private readonly failure: (sources: Parameters<MockRenderDevice["createShaderProgram"]>[0]) => Failure | undefined) {
    super();
  }
  override createShaderProgram(...args: Parameters<MockRenderDevice["createShaderProgram"]>) {
    const failure = this.failure(args[0]);
    if (failure) throw new RenderDeviceError(`injected ${failure.code}`, failure.code, failure.details);
    return super.createShaderProgram(...args);
  }
}

const compileFailure = (sources: { readonly fragment: string; readonly label: string }): Failure | undefined => {
  if (!sources.fragment.includes("BROKEN_LINE")) return undefined;
  const line = sources.fragment.split("\n").findIndex((row) => row.includes("BROKEN_LINE")) + 1;
  return { code: "SHADER_COMPILE_FAILED", details: { label: sources.label, stage: "fragment", log: `ERROR: 0:${line}: 'dup' : redefinition\nERROR: 0:${line + 1}: 'x' : undeclared identifier` } };
};

function drawFrame(device: MockRenderDevice, frames = 1): void {
  const broken = createCustomShaderMaterial(brokenSpec());
  const pass = new ForwardPass({
    items: [
      { geometry: Geometry.triangle(), material: broken, modelMatrix: IDENTITY, label: "broken-item" },
      { geometry: Geometry.triangle(), material: new UnlitMaterial(), modelMatrix: IDENTITY, label: "valid-item" }
    ]
  });
  for (let frame = 0; frame < frames; frame += 1) {
    device.beginFrame(8, 8);
    pass.execute({ device, width: 8, height: 8 });
    device.endFrame();
  }
}

describe("custom shader compile/link failures are loud and non-fatal", () => {
  let errors: string[];
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    clearShaderFailures();
    setShaderFailureMode(undefined);
    errors = [];
    errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { errors.push(args.join(" ")); });
  });
  afterEach(() => {
    errorSpy.mockRestore();
    clearShaderFailures();
    setShaderFailureMode(undefined);
  });

  it("(1) a compile failure is recorded with code, material, stage, driver log and the offending source lines; the other draw still renders", () => {
    const device = new FailingDevice(compileFailure);
    expect(() => drawFrame(device)).not.toThrow();
    expect(device.drawCommands.filter((command) => command.label === "valid-item")).toHaveLength(1);
    expect(device.drawCommands.filter((command) => command.label === "broken-item")).toHaveLength(0);
    const [record] = getShaderFailures();
    expect(record).toBeDefined();
    expect(record!.code).toBe("CUSTOM_SHADER_COMPILE_FAILED");
    expect(record!.stage).toBe("fragment");
    expect(record!.mode).toBe("skip");
    expect(record!.log).toContain("redefinition");
    const first = record!.locations[0]!;
    expect(first.message).toContain("redefinition");
    const flagged = first.window.filter((row) => row.error);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.text).toContain("BROKEN_LINE");
    expect(first.window.length).toBeGreaterThanOrEqual(5);
    // mapped back to the author's own source: BROKEN_LINE is line 4 of the authored fragment
    expect(first.authoredLine).toBe(4);
    expect(formatShaderFailure(record!)).toContain("CUSTOM_SHADER_COMPILE_FAILED");
    expect(formatShaderFailure(record!)).toContain("redefinition");
  });

  it("(1) console.error appears once per material across many frames, and the failed program is not recompiled every frame", () => {
    let attempts = 0;
    const device = new FailingDevice((sources) => { const failure = compileFailure(sources); if (failure) attempts += 1; return failure; });
    drawFrame(device, 5);
    expect(errors.filter((line) => line.includes("CUSTOM_SHADER_COMPILE_FAILED"))).toHaveLength(1);
    expect(errors[0]).toContain("BROKEN_LINE");
    expect(attempts).toBe(1);
    expect(getShaderFailures()[0]!.count).toBe(1);
  });

  it("(1) a link failure and a WGSL-missing failure get their own stable codes", () => {
    const link = new FailingDevice((sources) => (sources.fragment.includes("BROKEN_LINE") ? { code: "SHADER_LINK_FAILED", details: { label: sources.label, log: "ERROR: Varyings with the same name but different type, or statically used varyings in fragment shader are not declared in vertex shader: vShade" } } : undefined));
    drawFrame(link);
    expect(getShaderFailures()[0]).toMatchObject({ code: "CUSTOM_SHADER_LINK_FAILED", stage: "link" });
    clearShaderFailures();
    const wgsl = new FailingDevice((sources) => (sources.fragment.includes("BROKEN_LINE") ? { code: "WGSL_PROGRAM_MISSING", details: { marker: "@aura3d-portable:test", label: sources.label } } : undefined));
    drawFrame(wgsl);
    const [record] = getShaderFailures();
    expect(record).toMatchObject({ code: "CUSTOM_SHADER_WGSL_MISSING" });
    expect(record!.message).toContain("WebGPU");
    expect(wgsl.drawCommands.filter((command) => command.label === "valid-item")).toHaveLength(1);
  });

  it("(2) strict mode throws, and the engine maps it to AuraRuntimeError('custom-shader-compile-failed')", () => {
    setShaderFailureMode("throw");
    const device = new FailingDevice(compileFailure);
    let thrown: unknown;
    try { drawFrame(device); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(RenderDeviceError);
    expect((thrown as RenderDeviceError).code).toBe("CUSTOM_SHADER_COMPILE_FAILED");
    try { rethrowShaderFailure(thrown); } catch (error) {
      expect(error).toBeInstanceOf(AuraRuntimeError);
      expect((error as AuraRuntimeError).code).toBe("custom-shader-compile-failed");
      expect((error as AuraRuntimeError).message).toContain("redefinition");
    }
    expect(() => rethrowShaderFailure(new Error("unrelated"))).toThrow("unrelated");
  });

  it("(3) magenta mode draws the failed item with a flat debug material instead of dropping it; skip drops only that item", () => {
    setShaderFailureMode("magenta");
    const device = new FailingDevice(compileFailure);
    drawFrame(device);
    expect(device.drawCommands.filter((command) => command.label === "broken-item")).toHaveLength(1);
    expect(device.drawCommands.filter((command) => command.label === "valid-item")).toHaveLength(1);
    expect(getShaderFailures()[0]!.mode).toBe("magenta");
  });

  it("(3) ?diag=1 selects magenta by default, otherwise the default is skip", () => {
    const original = (globalThis as { location?: unknown }).location;
    try {
      (globalThis as { location?: unknown }).location = { search: "?diag=1" };
      const device = new FailingDevice(compileFailure);
      drawFrame(device);
      expect(getShaderFailures()[0]!.mode).toBe("magenta");
    } finally {
      if (original === undefined) delete (globalThis as { location?: unknown }).location;
      else (globalThis as { location?: unknown }).location = original;
    }
  });

  it("diagnostics(): failures appear once in errors (so route health reports error) and as structured shaderFailures", () => {
    drawFrame(new FailingDevice(compileFailure));
    const report = snapshotDiagnostics({ backend: "webgl2", fps: 60, drawCalls: 1, renderSize: [8, 8], assets: [], warnings: [], errors: ["earlier"] } as never);
    expect(report.errors[0]).toBe("earlier");
    expect(report.errors.filter((line) => line.startsWith("CUSTOM_SHADER_COMPILE_FAILED"))).toHaveLength(1);
    expect(report.shaderFailures?.[0]?.code).toBe("CUSTOM_SHADER_COMPILE_FAILED");
    clearShaderFailures();
    const clean = snapshotDiagnostics({ backend: "webgl2", fps: 60, drawCalls: 1, renderSize: [8, 8], assets: [], warnings: [], errors: [] } as never);
    expect(clean.errors).toEqual([]);
    expect(clean.shaderFailures).toBeUndefined();
  });

  it("post-pass style reports (effects.shaderPass) are recorded and logged once with a consequence line", () => {
    const report = () => reportShaderFailure(
      { code: "SHADER_COMPILE_FAILED", details: { stage: "fragment", log: "ERROR: 0:3: 'q' : undeclared identifier" } },
      { name: "post:grade", shaderKey: "post:grade" },
      { vertex: "void main(){}", fragment: "void main(){\n  float a = 1.0;\n  q = a;\n}" },
      "skip",
      "The post stage falls back to the legacy chain; the failing pass is not applied."
    );
    report();
    report();
    const [record] = getShaderFailures();
    expect(record).toMatchObject({ code: "CUSTOM_SHADER_COMPILE_FAILED", material: "post:grade", stage: "fragment", count: 2 });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("falls back to the legacy chain");
    expect(errors[0]).toContain("q = a;");
  });

  it("parses ANGLE/Mesa and NVIDIA info-log formats and ignores warnings", () => {
    expect(parseShaderLog("WARNING: 0:2: 'x' : unused\nERROR: 0:12: 'u_time' : redefinition\n")).toEqual([{ line: 12, message: "'u_time' : redefinition" }]);
    expect(parseShaderLog("0(7) : error C1008: undefined variable \"y\"")).toEqual([{ line: 7, message: "undefined variable \"y\"" }]);
    expect(parseShaderLog("")).toEqual([]);
  });
});
