import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const docs = [
  "renderer-architecture.md",
  "webgl2-backend.md",
  "webgpu-backend.md",
  "gltf-pipeline.md",
  "pbr-materials.md",
  "hdr-ibl.md",
  "shadows.md",
  "postprocess.md",
  "animation.md",
  "asset-pipeline.md",
  "threejs-parity.md",
  "visual-quality-gates.md",
  "product-workflows.md",
  "api-reference.md",
  "getting-started.md",
  "templates.md",
  "examples.md",
  "known-gaps.md",
  "blocked-claims.md",
  "release-notes.md"
];
const docPath = (doc: string) => resolve("docs/project", `production-runtime-roadmap-${doc}`);

describe("V6 docs and claims", () => {
  it("contains every required V6 doc", () => {
    for (const doc of docs) {
      const path = docPath(doc);
      expect(existsSync(path), doc).toBe(true);
      expect(readFileSync(path, "utf8").trim().length, doc).toBeGreaterThan(120);
    }
  });

  it("documents proof-backed workflows without claiming full replacement", () => {
    const joined = docs.map((doc) => readFileSync(docPath(doc), "utf8")).join("\n");
    expect(joined).toContain("@galileo3d/engine/workflows/production");
    expect(joined).toContain("WebGL2");
    expect(joined).toContain("HDR");
    expect(joined).toContain("Three.js");
    expect(joined).toContain("blocked");
    expect(joined).not.toMatch(/full Three\.js replacement is complete/i);
    expect(joined).not.toMatch(/full WebGPU parity is complete/i);
  });
});
