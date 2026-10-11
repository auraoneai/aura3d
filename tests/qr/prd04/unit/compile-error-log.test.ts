/**
 * compile-error-log.test.ts: remote GPU runs only reported "generated program
 * failed to compile: WebGL shader compile failed". `describeCompileError`
 * carries the driver info log (RenderDeviceError.details.log) into the cache's
 * error text, which the strict throw and C-36 degradation then show.
 */
import { describe, expect, it } from "vitest";
import { describeCompileError } from "../../../../packages/rendering/src/program/ProgramCache";
import { RenderDeviceError } from "../../../../packages/rendering/src/RenderDevice";

describe("describeCompileError", () => {
  it("appends the driver info log and stage", () => {
    const error = new RenderDeviceError("WebGL shader compile failed", "SHADER_COMPILE_FAILED", { log: "ERROR: 0:212: 'v_uv' : undeclared identifier\n", stage: 35632 });
    expect(describeCompileError(error)).toBe("WebGL shader compile failed [stage 35632]: ERROR: 0:212: 'v_uv' : undeclared identifier");
  });

  it("keeps the plain message without a log, and stringifies non-errors", () => {
    expect(describeCompileError(new Error("boom"))).toBe("boom");
    expect(describeCompileError("x")).toBe("x");
  });

  it("truncates very long logs", () => {
    const error = new RenderDeviceError("WebGL shader compile failed", "SHADER_COMPILE_FAILED", { log: "E".repeat(5000) });
    expect(describeCompileError(error).length).toBeLessThan(1300);
  });
});
