import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditPromptAssetPaths } from "../../../benchmark/runner/prompt-asset-audit.mjs";

const PROMPT_10 = "benchmark/prompts/10-product-viewer-sneaker.md";
const CANONICAL_ASSET = Buffer.from("fake sneaker glb");
const CANONICAL_HASH = createHash("sha256").update(CANONICAL_ASSET).digest("hex");
const CANONICAL_PREFIX = CANONICAL_HASH.slice(0, 8);
const CANONICAL_AURA_URL = `/aura-assets/sneaker.${CANONICAL_PREFIX}.glb`;

describe("prompt asset audit", () => {
  it("allows a typed Aura CLI generated sneaker asset with source evidence", () => {
    const { promptDir, repoRoot } = createPromptDir({
      auraAssets: `import { defineAuraAssets } from "@aura3d/engine";
export const assets = defineAuraAssets({
  sneaker: { type: "model", format: "glb", url: "${CANONICAL_AURA_URL}", hash: "sha256-${CANONICAL_HASH}" }
} as const);
`,
      main: `import { createAuraApp, scene, model } from "@aura3d/engine";
import { assets } from "./aura-assets";
createAuraApp("#app", { scene: scene().add(model(assets.sneaker)) });
`
    });

    const audit = auditPromptAssetPaths({ promptDir, promptFile: PROMPT_10, repoRoot, library: "Aura3D" });

    expect(audit.invented).toEqual([]);
    expect(audit.inventedAssetPaths).toBe(0);
    expect(audit.allowed.map((entry) => entry.normalized)).toContain(`aura-assets/sneaker.${CANONICAL_PREFIX}.glb`);
    expect(audit.typedAuraEvidence).toMatchObject({
      library: "Aura3D",
      hasAuraAssetsModule: true,
      auraAssetsUsesDefineAuraAssets: true,
      auraAssetsContainsManifestHash: true,
      auraAssetsContainsManifestUrl: true,
      manifestSchema: "aura3d.assets/1.0",
      manifestTypegen: "src/aura-assets.ts",
      manifestAssetBasePath: "/aura-assets/",
      manifestOutputDir: "public/aura-assets",
      manifestSneakerUrl: CANONICAL_AURA_URL,
      manifestSneakerHash: `sha256-${CANONICAL_HASH}`,
      manifestSneakerOutputPath: `public/aura-assets/sneaker.${CANONICAL_PREFIX}.glb`,
      manifestSneakerSource: "public/benchmark/assets/sneaker.glb",
      manifestSourceHash: `sha256-${CANONICAL_HASH}`,
      manifestOutputHash: `sha256-${CANONICAL_HASH}`,
      hasSneakerEntry: true,
      importsGeneratedAssets: true,
      usesTypedSneakerAsset: true,
      usesUnsafeModelUrl: false
    });
    expect(audit.typedAuraEvidence?.manifestMatchesCanonicalAsset).toBe(true);
    expect(JSON.parse(readFileSync(join(promptDir, "asset-audit.json"), "utf8")).invented).toEqual([]);
  });

  it("allows typed Aura evidence from metadata.library", () => {
    const { promptDir, repoRoot } = createPromptDir({
      auraAssets: `import { defineAuraAssets } from "@aura3d/engine";
export const assets = defineAuraAssets({
  sneaker: { type: "model", format: "glb", url: "${CANONICAL_AURA_URL}", hash: "sha256-${CANONICAL_HASH}" }
} as const);
`,
      main: `import { createAuraApp, scene, model } from "@aura3d/engine";
import { assets } from "./aura-assets";
createAuraApp("#app", { scene: scene().add(model(assets.sneaker)) });
`
    });

    const audit = auditPromptAssetPaths({ promptDir, promptFile: PROMPT_10, repoRoot, metadata: { library: "Aura3D" } });

    expect(audit.inventedAssetPaths).toBe(0);
    expect(audit.typedAuraEvidence?.library).toBe("Aura3D");
  });

  it("rejects typed Aura generated paths when the library is omitted", () => {
    const { promptDir, repoRoot } = createPromptDir({
      auraAssets: `import { defineAuraAssets } from "@aura3d/engine";
export const assets = defineAuraAssets({
  sneaker: { type: "model", format: "glb", url: "${CANONICAL_AURA_URL}", hash: "sha256-${CANONICAL_HASH}" }
} as const);
`,
      main: `import { createAuraApp, scene, model } from "@aura3d/engine";
import { assets } from "./aura-assets";
createAuraApp("#app", { scene: scene().add(model(assets.sneaker)) });
`
    });

    const audit = auditPromptAssetPaths({ promptDir, promptFile: PROMPT_10, repoRoot });

    expect(audit.typedAuraEvidence?.library).toBeNull();
    expect(audit.inventedUnique).toContain(`aura-assets/sneaker.${CANONICAL_PREFIX}.glb`);
    expect(audit.inventedAssetPaths).toBe(1);
  });

  it("rejects hard-coded generated Aura URLs outside src/aura-assets.ts", () => {
    const { promptDir, repoRoot } = createPromptDir({
      auraAssets: `import { defineAuraAssets } from "@aura3d/engine";
export const assets = defineAuraAssets({
  sneaker: { type: "model", format: "glb", url: "${CANONICAL_AURA_URL}", hash: "sha256-${CANONICAL_HASH}" }
} as const);
`,
      main: `import { createAuraApp, scene, model } from "@aura3d/engine";
import { assets } from "./aura-assets";
const hardcoded = "${CANONICAL_AURA_URL}";
createAuraApp("#app", { scene: scene().add(model(assets.sneaker)) });
`
    });

    const audit = auditPromptAssetPaths({ promptDir, promptFile: PROMPT_10, repoRoot, library: "Aura3D" });

    expect(audit.invented).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "src/main.ts",
          normalized: `aura-assets/sneaker.${CANONICAL_PREFIX}.glb`
        })
      ])
    );
    expect(audit.inventedAssetPaths).toBe(1);
  });

  it("rejects a hard-coded unsafeModelUrl hashed sneaker path", () => {
    const { promptDir, repoRoot } = createPromptDir({
      auraAssets: `import { defineAuraAssets } from "@aura3d/engine";
export const assets = defineAuraAssets({
  sneaker: { type: "model", format: "glb", url: "${CANONICAL_AURA_URL}", hash: "sha256-${CANONICAL_HASH}" }
} as const);`,
      main: `import { createAuraApp, scene, unsafeModelUrl, model } from "@aura3d/engine";
createAuraApp("#app", { scene: scene().add(model(unsafeModelUrl("${CANONICAL_AURA_URL}"))) });
`
    });

    const audit = auditPromptAssetPaths({ promptDir, promptFile: PROMPT_10, repoRoot, library: "Aura3D" });

    expect(audit.invented.map((entry) => entry.normalized)).toContain(`aura-assets/sneaker.${CANONICAL_PREFIX}.glb`);
    expect(audit.failures.join(" ")).toContain("unsafeModelUrl");
  });

  it("allows the direct provided benchmark sneaker asset path", () => {
    const { promptDir, repoRoot } = createPromptDir({
      auraAssets: "",
      main: `const sneakerUrl = "/benchmark/assets/sneaker.glb";`
    });

    const audit = auditPromptAssetPaths({ promptDir, promptFile: PROMPT_10, repoRoot });

    expect(audit.invented).toEqual([]);
    expect(audit.allowed.map((entry) => entry.normalized)).toContain("benchmark/assets/sneaker.glb");
  });

  it("rejects direct benchmark sneaker paths when the canonical prompt asset is missing", () => {
    const { promptDir, repoRoot } = createPromptDir({
      auraAssets: "",
      main: `const sneakerUrl = "/benchmark/assets/sneaker.glb";`
    }, { writeCanonicalAsset: false });

    const audit = auditPromptAssetPaths({ promptDir, promptFile: PROMPT_10, repoRoot });

    expect(audit.invented.map((entry) => entry.normalized)).toContain("benchmark/assets/sneaker.glb");
    expect(audit.failures.join(" ")).toContain("canonical prompt asset missing");
  });

  it("rejects unrelated Aura asset GLB paths", () => {
    const { promptDir, repoRoot } = createPromptDir({
      auraAssets: `export const assets = { shoe: { type: "model", format: "glb", url: "/aura-assets/shoe.abcdef12.glb" } };`,
      main: `const shoe = "/aura-assets/shoe.abcdef12.glb";`
    });

    const audit = auditPromptAssetPaths({ promptDir, promptFile: PROMPT_10, repoRoot });

    expect(audit.invented.map((entry) => entry.normalized)).toContain("aura-assets/shoe.abcdef12.glb");
  });

  it("rejects a hashed sneaker path without typed generated asset usage", () => {
    const { promptDir, repoRoot } = createPromptDir({
      auraAssets: "",
      main: `const url = "${CANONICAL_AURA_URL}";`
    });

    const audit = auditPromptAssetPaths({ promptDir, promptFile: PROMPT_10, repoRoot });

    expect(audit.invented.map((entry) => entry.normalized)).toContain(`aura-assets/sneaker.${CANONICAL_PREFIX}.glb`);
    expect(audit.typedAuraEvidence?.hasAuraAssetsModule).toBe(false);
  });

  it("rejects arbitrary generated sneaker filename hashes", () => {
    const fakeUrl = "/aura-assets/sneaker.abcdef12.glb";
    const { promptDir, repoRoot } = createPromptDir({
      auraAssets: `import { defineAuraAssets } from "@aura3d/engine";
export const assets = defineAuraAssets({
  sneaker: { type: "model", format: "glb", url: "${fakeUrl}", hash: "sha256-${CANONICAL_HASH}" }
} as const);
`,
      main: `import { createAuraApp, scene, model } from "@aura3d/engine";
import { assets } from "./aura-assets";
createAuraApp("#app", { scene: scene().add(model(assets.sneaker)) });
`
    }, { forceAuraUrl: fakeUrl });

    const audit = auditPromptAssetPaths({ promptDir, promptFile: PROMPT_10, repoRoot, library: "Aura3D" });

    expect(audit.invented.map((entry) => entry.normalized)).toContain("aura-assets/sneaker.abcdef12.glb");
    expect(audit.typedAuraEvidence?.manifestMatchesCanonicalAsset).toBe(false);
  });

  it("rejects typed Aura generated paths for non-Aura3D submissions", () => {
    const { promptDir, repoRoot } = createPromptDir({
      auraAssets: `import { defineAuraAssets } from "@aura3d/engine";
export const assets = defineAuraAssets({
  sneaker: { type: "model", format: "glb", url: "${CANONICAL_AURA_URL}", hash: "sha256-${CANONICAL_HASH}" }
} as const);
`,
      main: `import { createAuraApp, scene, model } from "@aura3d/engine";
import { assets } from "./aura-assets";
createAuraApp("#app", { scene: scene().add(model(assets.sneaker)) });
`
    });

    const audit = auditPromptAssetPaths({ promptDir, promptFile: PROMPT_10, repoRoot, library: "Three.js" });

    expect(audit.invented.map((entry) => entry.normalized)).toContain(`aura-assets/sneaker.${CANONICAL_PREFIX}.glb`);
  });

  it("counts repeated invented paths once in inventedAssetPaths", () => {
    const { promptDir, repoRoot } = createPromptDir({
      auraAssets: "",
      main: `const first = "/models/fake.gltf"; const second = "/models/fake.gltf";`
    });

    const audit = auditPromptAssetPaths({ promptDir, promptFile: PROMPT_10, repoRoot });

    expect(audit.invented.filter((entry) => entry.normalized === "models/fake.gltf")).toHaveLength(2);
    expect(audit.inventedUnique).toContain("models/fake.gltf");
    expect(audit.inventedAssetPaths).toBe(1);
  });

  for (const ext of ["gltf", "obj", "fbx", "usdz", "usd", "dae"]) {
    it(`rejects invented source .${ext} model paths`, () => {
      const { promptDir, repoRoot } = createPromptDir({
        auraAssets: "",
        main: `const modelUrl = "/models/fake.${ext}";`
      });

      const audit = auditPromptAssetPaths({ promptDir, promptFile: PROMPT_10, repoRoot });

      expect(audit.inventedUnique).toContain(`models/fake.${ext}`);
      expect(audit.inventedAssetPaths).toBe(1);
    });
  }

  it("rejects remote model URLs and normalizes query/hash suffixes", () => {
    const { promptDir, repoRoot } = createPromptDir({
      auraAssets: "",
      main: `const remote = "https://cdn.example.com/models/fake.glb?cache=1#v";`
    });

    const audit = auditPromptAssetPaths({ promptDir, promptFile: PROMPT_10, repoRoot });

    expect(audit.inventedUnique).toContain("https://cdn.example.com/models/fake.glb");
    expect(audit.inventedAssetPaths).toBe(1);
  });

  it("records string asset ids as invalid typed Aura evidence", () => {
    const { promptDir, repoRoot } = createPromptDir({
      auraAssets: "",
      main: `import { model } from "@aura3d/engine"; model("product");`
    });

    const audit = auditPromptAssetPaths({ promptDir, promptFile: PROMPT_10, repoRoot });

    expect(audit.inventedAssetPaths).toBe(0);
    expect(audit.typedAuraEvidence?.usesStringAssetId).toBe(true);
    expect(audit.failures.join(" ")).toContain("not valid typed Aura asset evidence");
  });

  it("rejects unrelated copied public GLB files", () => {
    const { promptDir, repoRoot, sourceDir } = createPromptDir({
      auraAssets: "",
      main: `const sneakerUrl = "/benchmark/assets/sneaker.glb";`
    });
    mkdirSync(join(sourceDir, "public", "models"), { recursive: true });
    writeFileSync(join(sourceDir, "public", "models", "shoe.glb"), Buffer.from("invented shoe"));

    const audit = auditPromptAssetPaths({ promptDir, promptFile: PROMPT_10, repoRoot });

    expect(audit.invented.map((entry) => entry.normalized)).toContain("models/shoe.glb");
  });

  it("allows runner-copied public benchmark fixture when the hash matches", () => {
    const { promptDir, repoRoot } = createPromptDir({
      auraAssets: "",
      main: `const sneakerUrl = "/benchmark/assets/sneaker.glb";`
    });

    const audit = auditPromptAssetPaths({ promptDir, promptFile: PROMPT_10, repoRoot });

    expect(audit.invented).toEqual([]);
    expect(audit.allowed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "public-file", normalized: "benchmark/assets/sneaker.glb" })
      ])
    );
  });
});

function createPromptDir(files: { readonly auraAssets: string; readonly main: string }, options: { readonly forceAuraUrl?: string; readonly writeCanonicalAsset?: boolean } = {}) {
  const repoRoot = mkdtempSync(join(tmpdir(), "aura3d-prompt-asset-audit-repo-"));
  mkdirSync(join(repoRoot, "benchmark", "assets"), { recursive: true });
  if (options.writeCanonicalAsset !== false) {
    writeFileSync(join(repoRoot, "benchmark", "assets", "sneaker.glb"), CANONICAL_ASSET);
  }

  const promptDir = mkdtempSync(join(tmpdir(), "aura3d-prompt-asset-audit-"));
  const sourceDir = join(promptDir, "source");
  const srcDir = join(sourceDir, "src");
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(join(sourceDir, "public", "benchmark", "assets"), { recursive: true });
  writeFileSync(join(sourceDir, "public", "benchmark", "assets", "sneaker.glb"), CANONICAL_ASSET);
  const auraUrl = options.forceAuraUrl ?? CANONICAL_AURA_URL;
  const auraFileName = auraUrl.split("/").pop() ?? `sneaker.${CANONICAL_PREFIX}.glb`;
  if (files.auraAssets.includes("/aura-assets/sneaker.")) {
    mkdirSync(join(sourceDir, "public", "aura-assets"), { recursive: true });
    writeFileSync(join(sourceDir, "public", "aura-assets", auraFileName), CANONICAL_ASSET);
    writeFileSync(join(sourceDir, "aura.assets.json"), `${JSON.stringify({
      schema: "aura3d.assets/1.0",
      assetBasePath: "/aura-assets/",
      outputDir: "public/aura-assets",
      typegen: "src/aura-assets.ts",
      assets: [{
        id: "sneaker",
        type: "model",
        format: "glb",
        source: "public/benchmark/assets/sneaker.glb",
        outputPath: `public/aura-assets/${auraFileName}`,
        url: auraUrl,
        hash: `sha256-${CANONICAL_HASH}`
      }]
    }, null, 2)}\n`);
  }
  if (files.auraAssets) writeFileSync(join(srcDir, "aura-assets.ts"), files.auraAssets);
  writeFileSync(join(srcDir, "main.ts"), files.main);
  return { promptDir, repoRoot, sourceDir };
}
