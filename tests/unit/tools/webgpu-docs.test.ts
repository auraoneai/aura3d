import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * QR-11 Phase 1 (`d7de114d3`, PRD-11 §6.2 freeze) rewrote both pages to the freeze status line: the
 * fallback-code walkthrough and the real-device matrix write-up were removed with the WebGPU CPU
 * rasterizer and facades. The claim boundary those pages carried is what stays checked here:
 * WebGPU is an experimental probe, WebGL2 is the only shipping backend, and nothing claims full or
 * visual-parity WebGPU support. (docs/project/status/retired-tests.md, "ACR unit shard 5" section.)
 */
describe("WebGPU public fallback docs", () => {
  for (const page of ["docs/rendering/webgpu-fallback.md", "docs/rendering/webgpu-hardware-matrix.md"]) {
    it(`${page} states the experimental freeze and makes no full-support claim`, () => {
      const docs = readFileSync(page, "utf8");
      expect(docs).toContain("WebGPU is a frozen experimental probe device");
      expect(docs).toContain("WebGL2 is the only shipping backend");
      expect(docs).toContain("carries no visual-parity claim");
      expect(docs).not.toMatch(/full (real-hardware )?WebGPU support(?! is not)/i);
    });
  }
});
