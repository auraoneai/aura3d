import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WebGPU public fallback docs", () => {
  it("documents unavailable runtime, missing adapter, device request, and canvas presentation errors", () => {
    const docs = readFileSync("docs/rendering/webgpu-fallback.md", "utf8");

    expect(docs).toContain("does not silently replace a failed WebGPU request");
    expect(docs).toContain("WEBGPU_RUNTIME_MISSING");
    expect(docs).toContain("WEBGPU_ADAPTER_MISSING");
    expect(docs).toContain("WEBGPU_DEVICE_REQUEST_FAILED");
    expect(docs).toContain("WEBGPU_CANVAS_CONTEXT_MISSING");
    expect(docs).toContain("WEBGPU_CANVAS_CONTEXT_INVALID");
    expect(docs).toContain("does not claim full real-hardware WebGPU support");
  });

  it("documents real-device matrix evidence separately from injected adapter evidence", () => {
    const docs = readFileSync("docs/rendering/webgpu-hardware-matrix.md", "utf8");

    expect(docs).toContain("tests/browser/webgpu-real-device.spec.ts");
    expect(docs).toContain("tests/reports/webgpu-hardware-matrix.json");
    expect(docs).toContain("uses `navigator.gpu` directly");
    expect(docs).toContain("they are not real hardware evidence");
    expect(docs).toContain("Public claims must not say \"full WebGPU support\"");
    expect(docs).toContain("browser user agent");
    expect(docs).toContain("operating system platform and release");
  });
});
