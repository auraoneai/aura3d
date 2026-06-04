import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { addAsset, checkDeploy } from "../../../packages/aura3d-cli/src";

describe("@aura3d/cli deployment", () => {
  test("fails missing hashed assets before upload", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "robot.gltf"), JSON.stringify({ asset: { version: "2.0" } }));
    addAsset({ projectDir, file: "assets/robot.gltf", name: "robot", outputDir: "public/aura-assets", publicPath: "/cdn/aura-assets/" });
    const result = checkDeploy({ projectDir, distDir: "dist" });
    expect(result.ok).toBe(true);
    mkdirSync(join(projectDir, "public", "aura-assets"), { recursive: true });
  });

  test("reports missing manifest outputs", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "aura.assets.json"), JSON.stringify({
      schema: "aura3d.assets/1.0",
      assetBasePath: "/aura-assets/",
      outputDir: "public/aura-assets",
      typegen: "src/aura-assets.ts",
      assets: [{
        id: "missing",
        type: "model",
        format: "glb",
        source: "assets/missing.glb",
        outputPath: "public/aura-assets/missing.12345678.glb",
        url: "/aura-assets/missing.12345678.glb",
        hash: "sha256-missing",
        sizeBytes: 0,
        materials: [],
        animations: [],
        textures: [],
        warnings: []
      }]
    }));
    const result = checkDeploy({ projectDir });
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("missing");
  });
});

function createProject(): string {
  const projectDir = join(tmpdir(), `aura3d-deploy-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(projectDir, "assets"), { recursive: true });
  writeFileSync(join(projectDir, "package.json"), JSON.stringify({ type: "module" }));
  return projectDir;
}
