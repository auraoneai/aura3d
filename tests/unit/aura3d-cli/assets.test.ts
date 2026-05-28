import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { addAsset, initAgentFiles, listAssets, validateAssets } from "../../../packages/aura3d-cli/src";

describe("@aura3d/cli assets", () => {
  test("adds a glTF asset, writes manifest, and generates typed imports", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "robot.gltf"), JSON.stringify({
      asset: { version: "2.0" },
      materials: [{ name: "body" }],
      animations: [{ name: "idle" }],
      images: [{ uri: "color.png" }],
      accessors: [{ min: [-1, 0, -1], max: [1, 2, 1] }]
    }));
    writeFileSync(join(projectDir, "assets", "color.png"), "texture");
    const result = addAsset({ projectDir, file: "assets/robot.gltf", name: "robot" });
    expect(result.ok).toBe(true);
    expect(listAssets({ projectDir })[0]).toMatchObject({ id: "robot", format: "gltf", bounds: [2, 2, 2] });
    expect(readFileSync(join(projectDir, "src", "aura-assets.ts"), "utf8")).toContain("defineAuraAssets");
    expect(validateAssets({ projectDir }).ok).toBe(true);
  });

  test("writes agent instruction files", () => {
    const projectDir = createProject();
    const written = initAgentFiles({ projectDir, agent: "all" });
    expect(written.map((path) => path.replace(projectDir, ""))).toEqual([
      "/AGENTS.md",
      "/.claude/CLAUDE.md",
      "/.cursor/rules/aura3d.mdc",
      "/.github/copilot-instructions.md"
    ]);
  });
});

function createProject(): string {
  const projectDir = join(tmpdir(), `aura3d-cli-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(projectDir, "assets"), { recursive: true });
  writeFileSync(join(projectDir, "package.json"), JSON.stringify({ type: "module" }));
  return projectDir;
}
