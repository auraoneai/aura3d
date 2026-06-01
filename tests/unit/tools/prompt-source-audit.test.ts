import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditPromptSource } from "../../../benchmark/runner/prompt-source-audit.mjs";

const publicRootExports = [
  "camera",
  "createAuraApp",
  "defineAuraAssets",
  "interactions",
  "lights",
  "model",
  "prefabs",
  "scene"
];

describe("prompt source audit", () => {
  it("records unavailable public root imports separately", () => {
    const { promptDir, sourceDir } = createSource({
      "src/main.ts": `import { createAuraApp, PhysicsWorld, Shape as PhysicsShape, PhysicsDebugAdapter } from "@aura3d/engine";
createAuraApp("#app", {});
`
    });

    const audit = auditPromptSource({
      promptDir,
      sourceDir,
      promptFile: "benchmark/prompts/01-physics-playground.md",
      publicRootExports
    });

    expect(audit.pass).toBe(false);
    expect(audit.unavailablePublicImports.map((entry) => entry.symbol)).toEqual([
      "PhysicsDebugAdapter",
      "PhysicsWorld",
      "Shape"
    ]);
    expect(audit.nonPublicSubpathImports).toEqual([]);
    expect(JSON.parse(readFileSync(join(promptDir, "source-audit.json"), "utf8")).unavailablePublicImports).toHaveLength(3);
  });

  it("rejects non-public Aura subpath imports", () => {
    const { promptDir, sourceDir } = createSource({
      "src/main.ts": `import { PhysicsWorld } from "@aura3d/engine/physics";
import { createAuraApp } from "@aura3d/engine";
`
    });

    const audit = auditPromptSource({
      promptDir,
      sourceDir,
      promptFile: "benchmark/prompts/01-physics-playground.md",
      publicRootExports
    });

    expect(audit.pass).toBe(false);
    expect(audit.nonPublicSubpathImports).toEqual([
      expect.objectContaining({
        specifier: "@aura3d/engine/physics",
        file: "src/main.ts"
      })
    ]);
    expect(audit.unavailablePublicImports).toEqual([]);
  });

  it("allows type-only named imports without treating type as a default import", () => {
    const { promptDir, sourceDir } = createSource({
      "src/main.ts": `import type { createAuraApp } from "@aura3d/engine";
const target: typeof createAuraApp | null = null;
`
    });

    const audit = auditPromptSource({
      promptDir,
      sourceDir,
      promptFile: "benchmark/prompts/01-physics-playground.md",
      publicRootExports
    });

    expect(audit.pass).toBe(true);
    expect(audit.unavailablePublicImports).toEqual([]);
  });

  it("rejects prompt 10 unsafeModelUrl, string model ids, and hard-coded model URLs in app code", () => {
    const { promptDir, sourceDir } = createSource({
      "src/aura-assets.ts": `import { defineAuraAssets } from "@aura3d/engine";
export const assets = defineAuraAssets({
  sneaker: { type: "model", format: "glb", url: "/benchmark/assets/sneaker.glb" }
} as const);
`,
      "src/main.ts": `import { createAuraApp, model, unsafeModelUrl } from "@aura3d/engine";
const url = "https://example.com/fake-sneaker.glb";
model("sneaker");
model(unsafeModelUrl("/aura-assets/sneaker.abcdef12.glb"));
createAuraApp("#app", {});
`
    });

    const audit = auditPromptSource({
      promptDir,
      sourceDir,
      promptFile: "benchmark/prompts/10-product-viewer-sneaker.md",
      publicRootExports: [...publicRootExports, "unsafeModelUrl"]
    });

    expect(audit.pass).toBe(false);
    expect(audit.unsafeAssetReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "remoteModelUrl", value: "https://example.com/fake-sneaker.glb" }),
        expect.objectContaining({ kind: "stringModelAssetId", value: "sneaker" }),
        expect.objectContaining({ kind: "unsafeModelUrl" }),
        expect.objectContaining({ kind: "hardCodedModelUrl", value: "/aura-assets/sneaker.abcdef12.glb" })
      ])
    );
    expect(audit.unsafeAssetReferences.some((entry) => entry.file === "src/aura-assets.ts")).toBe(false);
  });

  it("allows public root imports and typed prompt 10 assets", () => {
    const { promptDir, sourceDir } = createSource({
      "src/aura-assets.ts": `import { defineAuraAssets } from "@aura3d/engine";
export const assets = defineAuraAssets({
  sneaker: { type: "model", format: "glb", url: "/benchmark/assets/sneaker.glb" }
} as const);
`,
      "src/main.ts": `import { createAuraApp, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";
createAuraApp("#app", { scene: scene().add(model(assets.sneaker)) });
`
    });

    const audit = auditPromptSource({
      promptDir,
      sourceDir,
      promptFile: "benchmark/prompts/10-product-viewer-sneaker.md",
      publicRootExports
    });

    expect(audit.pass).toBe(true);
    expect(audit.unavailablePublicImports).toEqual([]);
    expect(audit.nonPublicSubpathImports).toEqual([]);
    expect(audit.unsafeAssetReferences).toEqual([]);
  });
});

function createSource(files: Record<string, string>) {
  const promptDir = mkdtempSync(join(tmpdir(), "a3d-source-audit-"));
  const sourceDir = join(promptDir, "source");
  for (const [rel, text] of Object.entries(files)) {
    const path = join(sourceDir, rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text);
  }
  return { promptDir, sourceDir };
}
