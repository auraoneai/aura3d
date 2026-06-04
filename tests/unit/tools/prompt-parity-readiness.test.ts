import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectPromptParityReadiness } from "../../../tools/prompt-parity-readiness/index";

describe("prompt parity readiness", () => {
  it("names weak prompt helper failures", () => {
    const repoRoot = createRepo({
      "packages/engine/src/index.ts": `export * from "./agent-api/index.js";`,
      "packages/engine/src/agent-api/index.ts": `export const createAuraApp = () => {};
export const scene = {};
export const prefabs = {};
`,
      "benchmark/prompts/01-physics-playground.md": "# Prompt 01",
      "benchmark/runs/round-13/codex-aura3d/prompt-01/run-metadata.json": JSON.stringify({
        agent: "Codex",
        library: "Aura3D",
        promptFile: "benchmark/prompts/01-physics-playground.md"
      }),
      "benchmark/runs/round-13/codex-aura3d/prompt-01/source/src/main.ts": `import { createAuraApp, scene } from "@aura3d/engine";
createAuraApp("#app", { scene });
`
    });

    const report = collectPromptParityReadiness({
      repoRoot,
      target: "benchmark/runs/round-13",
      reportPath: "tests/reports/prompt-parity-readiness.json"
    });

    expect(report.pass).toBe(false);
    expect(report.weakPromptHelpers).toEqual([
      expect.objectContaining({
        promptId: "prompt-01",
        helper: "prefabs.physicsPlayground or public physics helper",
        detail: expect.stringContaining("prompt-01 is weak")
      })
    ]);
  });

  it("surfaces source audit failures in readiness report", () => {
    const repoRoot = createRepo({
      "packages/engine/src/index.ts": `export * from "./agent-api/index.js";`,
      "packages/engine/src/agent-api/index.ts": `export const createAuraApp = () => {};
export const scene = {};
export const prefabs = {};
`,
      "benchmark/prompts/01-physics-playground.md": "# Prompt 01",
      "benchmark/runs/round-13/codex-aura3d/prompt-01/run-metadata.json": JSON.stringify({
        agent: "Codex",
        library: "Aura3D",
        promptFile: "benchmark/prompts/01-physics-playground.md"
      }),
      "benchmark/runs/round-13/codex-aura3d/prompt-01/source/src/main.ts": `import { createAuraApp, PhysicsWorld, Shape, PhysicsDebugAdapter, prefabs } from "@aura3d/engine";
createAuraApp("#app", { scene: prefabs.physicsPlayground() });
`
    });

    const report = collectPromptParityReadiness({
      repoRoot,
      target: "benchmark/runs/round-13",
      reportPath: "tests/reports/prompt-parity-readiness.json"
    });

    expect(report.pass).toBe(false);
    expect(report.unavailablePublicImports.map((entry) => entry.symbol)).toEqual([
      "PhysicsDebugAdapter",
      "PhysicsWorld",
      "Shape"
    ]);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "source-audit:codex-aura3d/prompt-01",
          pass: false,
          detail: expect.stringContaining("PhysicsWorld")
        }),
        expect.objectContaining({
          id: "prompt-helper:codex-aura3d/prompt-01",
          pass: true
        })
      ])
    );
  });

  it("passes for focused generated Aura sources and writes the configured report", () => {
    const repoRoot = createRepo({
      "packages/engine/src/index.ts": `export * from "./agent-api/index.js";`,
      "packages/engine/src/agent-api/index.ts": `export const createAuraApp = () => {};
export const scene = {};
export const prefabs = {};
export const model = {};
export const defineAuraAssets = {};
`,
      "benchmark/prompts/10-product-viewer-sneaker.md": "# Prompt 10",
      "benchmark/runs/round-13/codex-aura3d/prompt-10/run-metadata.json": JSON.stringify({
        agent: "Codex",
        library: "Aura3D",
        promptFile: "benchmark/prompts/10-product-viewer-sneaker.md"
      }),
      "benchmark/runs/round-13/codex-aura3d/prompt-10/source/src/aura-assets.ts": `import { defineAuraAssets } from "@aura3d/engine";
export const assets = defineAuraAssets({
  sneaker: { type: "model", format: "glb", url: "/benchmark/assets/sneaker.glb" }
} as const);
`,
      "benchmark/runs/round-13/codex-aura3d/prompt-10/source/src/main.ts": `import { createAuraApp, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";
createAuraApp("#app", { scene: scene().add(model(assets.sneaker)) });
`
    });

    const report = collectPromptParityReadiness({
      repoRoot,
      target: "benchmark/runs/round-13",
      reportPath: "tests/reports/prompt-parity-readiness.json"
    });

    const reportPath = join(repoRoot, "tests/reports/prompt-parity-readiness.json");
    mkdirSync(join(reportPath, ".."), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

    expect(report.pass).toBe(true);
    expect(report.unsafeAssetReferences).toEqual([]);
    expect(JSON.parse(readFileSync(reportPath, "utf8")).schema).toBe("a3d-prompt-parity-readiness");
  });
});

function createRepo(files: Record<string, string>) {
  const repoRoot = mkdtempSync(join(tmpdir(), "a3d-readiness-"));
  for (const [rel, text] of Object.entries(files)) {
    const path = join(repoRoot, rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text);
  }
  return repoRoot;
}
