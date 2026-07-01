import { createHash } from "node:crypto";
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

  test("release deploy check runs source and release asset gates for selected assets", () => {
    const projectDir = createProject();
    mkdirSync(join(projectDir, "src"), { recursive: true });
    writeFileSync(join(projectDir, "assets", "robot.gltf"), JSON.stringify({
      asset: { version: "2.0" },
      materials: [{ name: "body" }],
      images: [{ uri: "color.png" }],
      accessors: [{ min: [-1, 0, -1], max: [1, 2, 1] }]
    }));
    writeFileSync(join(projectDir, "assets", "color.png"), "texture");
    addAsset({
      projectDir,
      file: "assets/robot.gltf",
      name: "robot",
      license: "CC0-1.0",
      licenseName: "CC0 1.0 Universal",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Fixture Author",
      sourcePage: "https://example.test/robot",
      downloadUrl: "https://example.test/robot.gltf",
      sourceUrl: "https://example.test/robot",
      sourceFamily: "test-fixture",
      retrievedAt: "2026-06-20T00:00:00.000Z"
    });
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import { model } from "@aura3d/engine";
      import { assets } from "./aura-assets";
      model(assets.robot);
      model("robot");
    `);

    const result = checkDeploy({
      projectDir,
      distDir: "dist",
      release: true,
      source: "src",
      assetIds: ["robot"]
    });
    const output = [...result.failures, ...result.warnings].join("\n");

    expect(result.ok).toBe(false);
    expect(result.manifest.assets.map((asset) => asset.id)).toEqual(["robot"]);
    expect(result.source?.files).toEqual(["src/main.ts"]);
    expect(output).toContain("robot: release primary model quality grade missing or ungraded.");
    expect(output).toContain("robot: release primary model missing intended role.");
    expect(output).toContain("robot: release primary model missing suitability reason.");
    expect(output).toContain("robot: release primary model missing renderedProbe evidence.");
    expect(output).toContain('raw model string id "robot"');
  });

  test("source deploy check supports procedural routes with no selected assets", () => {
    const projectDir = createProject();
    const assetBytes = "decor";
    const assetHash = `sha256-${createHash("sha256").update(assetBytes).digest("hex")}`;
    mkdirSync(join(projectDir, "public", "aura-assets"), { recursive: true });
    mkdirSync(join(projectDir, "src"), { recursive: true });
    writeFileSync(join(projectDir, "public", "aura-assets", "decor.12345678.glb"), assetBytes);
    writeFileSync(join(projectDir, "src", "aura-assets.ts"), "export const assets = {} as const;\n");
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import { game, primitives } from "@aura3d/engine";
      game.fallingBlocks({ id: "blockfall" });
      const sourceEvidence = { claimBoundary: "procedural Aura3D falling-block board with retained route-primary proof." };
      primitives.box({ name: "procedural board" });
    `);
    writeFileSync(join(projectDir, "aura.assets.json"), JSON.stringify({
      schema: "aura3d.assets/1.0",
      assetBasePath: "/aura-assets/",
      outputDir: "public/aura-assets",
      typegen: "src/aura-assets.ts",
      assets: [{
        id: "decor",
        type: "model",
        format: "glb",
        source: "assets/decor.glb",
        outputPath: "public/aura-assets/decor.12345678.glb",
        url: "/aura-assets/decor.12345678.glb",
        hash: assetHash,
        sizeBytes: assetBytes.length,
        materials: [],
        animations: [],
        textures: []
      }]
    }));

    const result = checkDeploy({
      projectDir,
      distDir: "dist",
      source: "src",
      assetIds: []
    });

    expect(result.ok).toBe(true);
    expect(result.manifest.assets).toEqual([]);
    expect(result.source?.typedAssetUsages).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

function createProject(): string {
  const projectDir = join(tmpdir(), `aura3d-deploy-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(projectDir, "assets"), { recursive: true });
  writeFileSync(join(projectDir, "package.json"), JSON.stringify({ type: "module" }));
  return projectDir;
}
