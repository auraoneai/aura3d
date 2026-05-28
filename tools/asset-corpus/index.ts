import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { addAsset, validateAssets } from "../../packages/aura3d-cli/src/index";
import { writeReport, type ReleaseCheck } from "../check-common";

interface CorpusCase {
  readonly id: string;
  readonly file: string;
  readonly name: string;
  readonly setup: (projectDir: string) => void;
  readonly expect: "success" | "failure";
  readonly expectedMessage?: string;
  readonly source?: CorpusSourceNote;
  readonly verify?: (projectDir: string) => string | undefined;
}

interface CorpusResult {
  readonly id: string;
  readonly expect: "success" | "failure";
  readonly pass: boolean;
  readonly message: string;
  readonly source?: CorpusSourceNote;
  readonly verifyMessage?: string;
}

interface CorpusSourceNote {
  readonly kind: "generated" | "pinned-local-fixture";
  readonly source: string;
  readonly license: string;
  readonly notes: string;
}

const workspace = resolve("tests/reports/asset-corpus-workspace");
rmSync(workspace, { recursive: true, force: true });
mkdirSync(workspace, { recursive: true });
writeFileSync(resolve(workspace, "package.json"), JSON.stringify({ type: "module", scripts: { build: "echo asset-corpus-build" } }, null, 2));

const cases: CorpusCase[] = [
  {
    id: "valid-small-glb",
    file: "assets/valid-small.glb",
    name: "validSmall",
    setup: (dir) => writeAsset(dir, "assets/valid-small.glb", createMinimalGlb("validSmall")),
    expect: "success"
  },
  {
    id: "large-glb-warning",
    file: "assets/large.glb",
    name: "largeModel",
    setup: (dir) => writeAsset(dir, "assets/large.glb", createMinimalGlb("largeModel", 26 * 1024 * 1024)),
    expect: "success",
    verify: (dir) => {
      const validation = validateAssets({ projectDir: dir });
      return validation.warnings.some((warning) => warning.includes("asset exceeds 25 MB")) ? undefined : "large asset warning missing";
    }
  },
  {
    id: "gltf-external-bin",
    file: "assets/external/model.gltf",
    name: "externalBin",
    setup: (dir) => {
      writeAsset(dir, "assets/external/model.bin", Buffer.from([0, 1, 2, 3]));
      writeAsset(dir, "assets/external/model.gltf", Buffer.from(JSON.stringify(createGltfJson("externalBin", "model.bin"), null, 2)));
    },
    expect: "success",
    verify: (dir) => statSync(resolve(dir, "public/aura-assets/model.bin")).isFile() ? undefined : "external bin was not copied"
  },
  {
    id: "gltf-external-texture",
    file: "assets/external-texture/model.gltf",
    name: "externalTexture",
    setup: (dir) => {
      writeAsset(dir, "assets/external-texture/model.bin", Buffer.from([0, 1, 2, 3]));
      writeAsset(dir, "assets/external-texture/albedo.png", minimalPng());
      writeAsset(dir, "assets/external-texture/model.gltf", Buffer.from(JSON.stringify(createGltfJson("externalTexture", "model.bin", ["albedo.png"]), null, 2)));
    },
    expect: "success",
    verify: (dir) => statSync(resolve(dir, "public/aura-assets/albedo.png")).isFile() ? undefined : "external texture was not copied"
  },
  {
    id: "gltf-missing-bin",
    file: "assets/missing-bin/model.gltf",
    name: "missingBin",
    setup: (dir) => writeAsset(dir, "assets/missing-bin/model.gltf", Buffer.from(JSON.stringify(createGltfJson("missingBin", "missing.bin"), null, 2))),
    expect: "failure",
    expectedMessage: "referenced asset file missing"
  },
  {
    id: "gltf-missing-texture",
    file: "assets/missing-texture/model.gltf",
    name: "missingTexture",
    setup: (dir) => {
      writeAsset(dir, "assets/missing-texture/model.bin", Buffer.from([0, 1, 2, 3]));
      writeAsset(dir, "assets/missing-texture/model.gltf", Buffer.from(JSON.stringify(createGltfJson("missingTexture", "model.bin", ["missing.png"]), null, 2)));
    },
    expect: "failure",
    expectedMessage: "referenced asset file missing"
  },
  {
    id: "glb-missing-external-texture",
    file: "assets/missing-texture.glb",
    name: "glbMissingTexture",
    setup: (dir) => writeAsset(dir, "assets/missing-texture.glb", createMinimalGlb("glbMissingTexture", 0, { images: [{ uri: "missing.png", name: "missing texture" }] })),
    expect: "failure",
    expectedMessage: "referenced asset file missing"
  },
  {
    id: "malformed-glb",
    file: "assets/broken.glb",
    name: "broken",
    setup: (dir) => writeAsset(dir, "assets/broken.glb", Buffer.from("not-a-glb")),
    expect: "failure",
    expectedMessage: "Invalid GLB header"
  },
  {
    id: "file-extension-lies",
    file: "assets/not-really-a-model.glb",
    name: "extensionLies",
    setup: (dir) => writeAsset(dir, "assets/not-really-a-model.glb", Buffer.from(JSON.stringify({ asset: { version: "2.0" } }))),
    expect: "failure",
    expectedMessage: "Invalid GLB header"
  },
  {
    id: "unsupported-extension",
    file: "assets/readme.txt",
    name: "readme",
    setup: (dir) => writeAsset(dir, "assets/readme.txt", Buffer.from("not supported")),
    expect: "failure",
    expectedMessage: "Unsupported Aura3D asset format"
  },
  {
    id: "file-with-spaces",
    file: "assets/file with spaces.glb",
    name: "fileWithSpaces",
    setup: (dir) => writeAsset(dir, "assets/file with spaces.glb", createMinimalGlb("fileWithSpaces")),
    expect: "success"
  },
  {
    id: "unicode-file-name",
    file: "assets/unicode-模型.glb",
    name: "unicodeModel",
    setup: (dir) => writeAsset(dir, "assets/unicode-模型.glb", createMinimalGlb("unicodeModel")),
    expect: "success"
  },
  {
    id: "duplicate-asset-id",
    file: "assets/dupe-b.glb",
    name: "duplicateModel",
    setup: (dir) => {
      writeAsset(dir, "assets/dupe-a.glb", createMinimalGlb("duplicateA"));
      writeAsset(dir, "assets/dupe-b.glb", createMinimalGlb("duplicateB"));
      addAsset({ projectDir: dir, file: "assets/dupe-a.glb", name: "duplicateModel" });
    },
    expect: "success",
    verify: (dir) => {
      const validation = validateAssets({ projectDir: dir });
      const duplicates = validation.manifest.assets.filter((asset) => asset.id === "duplicateModel");
      return duplicates.length === 1 ? undefined : `duplicate asset id count ${duplicates.length}`;
    }
  },
  {
    id: "nested-directory-asset",
    file: "assets/nested/deep/model.glb",
    name: "nestedModel",
    setup: (dir) => writeAsset(dir, "assets/nested/deep/model.glb", createMinimalGlb("nestedModel")),
    expect: "success"
  },
  {
    id: "ktx2-texture-extension",
    file: "assets/texture.ktx2",
    name: "ktxTexture",
    setup: (dir) => writeAsset(dir, "assets/texture.ktx2", Buffer.from("ktx2-placeholder")),
    expect: "success"
  },
  {
    id: "real-khronos-duck-glb",
    file: "assets/real/duck.glb",
    name: "realDuck",
    setup: (dir) => copyFixture(dir, "fixtures/asset-corpus/duck.glb", "assets/real/duck.glb"),
    expect: "success",
    source: {
      kind: "pinned-local-fixture",
      source: "fixtures/asset-corpus/duck.glb",
      license: "Khronos glTF Sample Assets metadata; local fixture used for importer validation only",
      notes: "Small real GLB fixture used to verify the CLI handles non-synthetic product/prop assets."
    },
    verify: (dir) => {
      const asset = validateAssets({ projectDir: dir }).manifest.assets.find((entry) => entry.id === "realDuck");
      return asset?.format === "glb" && Number(asset.bounds?.[0] ?? 0) > 0 ? undefined : "real duck GLB metadata missing";
    }
  },
  {
    id: "real-damaged-helmet-glb",
    file: "assets/real/damaged-helmet.glb",
    name: "damagedHelmet",
    setup: (dir) => copyFixture(dir, "fixtures/asset-corpus/damaged-helmet.glb", "assets/real/damaged-helmet.glb"),
    expect: "success",
    source: {
      kind: "pinned-local-fixture",
      source: "fixtures/asset-corpus/damaged-helmet.glb",
      license: "Khronos glTF Sample Assets metadata; local fixture used for importer validation only",
      notes: "Textured PBR GLB fixture used to verify real-material metadata, typed refs, and validation."
    },
    verify: (dir) => {
      const asset = validateAssets({ projectDir: dir }).manifest.assets.find((entry) => entry.id === "damagedHelmet");
      return asset && asset.materials.length > 0 && asset.textures.length > 0 ? undefined : "damaged helmet materials/textures were not detected";
    }
  },
  {
    id: "real-antique-camera-product-glb",
    file: "assets/real/antique-camera.glb",
    name: "antiqueCamera",
    setup: (dir) => copyFixture(dir, "fixtures/asset-corpus/antique-camera.glb", "assets/real/antique-camera.glb"),
    expect: "success",
    source: {
      kind: "pinned-local-fixture",
      source: "fixtures/asset-corpus/antique-camera.glb",
      license: "Khronos glTF Sample Assets license metadata; local fixture used for importer validation only",
      notes: "Large product-form GLB fixture used to verify typed refs and validation on a realistic inspectable object."
    },
    verify: (dir) => {
      const asset = validateAssets({ projectDir: dir }).manifest.assets.find((entry) => entry.id === "antiqueCamera");
      return asset?.format === "glb" && Number(asset.bounds?.[0] ?? 0) > 0 ? undefined : "antique camera product metadata missing";
    }
  },
  {
    id: "real-boom-box-cc0-product-glb",
    file: "assets/real/boom-box.glb",
    name: "boomBox",
    setup: (dir) => copyFixture(dir, "fixtures/asset-corpus/boom-box.glb", "assets/real/boom-box.glb"),
    expect: "success",
    source: {
      kind: "pinned-local-fixture",
      source: "fixtures/asset-corpus/boom-box.glb",
      license: "CC0-1.0",
      notes: "CC0 Khronos Boom Box fixture used to verify a larger textured product asset through add/validate/typegen."
    },
    verify: (dir) => {
      const asset = validateAssets({ projectDir: dir }).manifest.assets.find((entry) => entry.id === "boomBox");
      return asset && asset.materials.length > 0 && asset.textures.length > 0 ? undefined : "boom box materials/textures were not detected";
    }
  },
  {
    id: "real-avocado-cc0-organic-glb",
    file: "assets/real/avocado.glb",
    name: "avocado",
    setup: (dir) => copyFixture(dir, "fixtures/asset-corpus/avocado.glb", "assets/real/avocado.glb"),
    expect: "success",
    source: {
      kind: "pinned-local-fixture",
      source: "fixtures/asset-corpus/avocado.glb",
      license: "CC0-1.0",
      notes: "CC0 Khronos Avocado fixture used to verify an organic PBR asset with texture metadata."
    },
    verify: (dir) => {
      const asset = validateAssets({ projectDir: dir }).manifest.assets.find((entry) => entry.id === "avocado");
      return asset && asset.materials.length > 0 && asset.textures.length > 0 ? undefined : "avocado materials/textures were not detected";
    }
  },
  {
    id: "real-clear-coat-material-glb",
    file: "assets/real/clear-coat-test.glb",
    name: "clearCoatTest",
    setup: (dir) => copyFixture(dir, "fixtures/asset-corpus/clear-coat-test.glb", "assets/real/clear-coat-test.glb"),
    expect: "success",
    source: {
      kind: "pinned-local-fixture",
      source: "fixtures/asset-corpus/clear-coat-test.glb",
      license: "Khronos glTF Sample Assets license metadata; local fixture used for importer validation only",
      notes: "Clearcoat material-extension fixture used to verify metadata extraction on non-basic PBR material coverage."
    },
    verify: (dir) => {
      const asset = validateAssets({ projectDir: dir }).manifest.assets.find((entry) => entry.id === "clearCoatTest");
      return asset && asset.materials.length > 0 ? undefined : "clear coat material metadata missing";
    }
  },
  {
    id: "real-sheen-material-grid-glb",
    file: "assets/real/sheen-test-grid.glb",
    name: "sheenGrid",
    setup: (dir) => copyFixture(dir, "fixtures/asset-corpus/sheen-test-grid.glb", "assets/real/sheen-test-grid.glb"),
    expect: "success",
    source: {
      kind: "pinned-local-fixture",
      source: "fixtures/asset-corpus/sheen-test-grid.glb",
      license: "Khronos glTF Sample Assets license metadata; local fixture used for importer validation only",
      notes: "Sheen material-extension grid used to verify metadata extraction on non-basic PBR material coverage."
    },
    verify: (dir) => {
      const asset = validateAssets({ projectDir: dir }).manifest.assets.find((entry) => entry.id === "sheenGrid");
      return asset && asset.materials.length > 0 ? undefined : "sheen material metadata missing";
    }
  },
  {
    id: "real-khronos-fox-animation-glb",
    file: "assets/real/Fox.glb",
    name: "foxAnimation",
    setup: (dir) => copyFixture(dir, "tests/assets/corpus/khronos/Fox/Fox.glb", "assets/real/Fox.glb"),
    expect: "success",
    source: {
      kind: "pinned-local-fixture",
      source: "tests/assets/corpus/khronos/Fox/Fox.glb",
      license: "CC-BY-4.0",
      notes: "Pinned Khronos animated/skinned character fixture with source details in tests/assets/corpus/khronos/Fox/README.md."
    },
    verify: (dir) => {
      const asset = validateAssets({ projectDir: dir }).manifest.assets.find((entry) => entry.id === "foxAnimation");
      return asset && asset.animations.length > 0 ? undefined : "fox animation clips were not detected";
    }
  },
  {
    id: "real-blender-export-gltf",
    file: "assets/real/blender-primitives.gltf",
    name: "blenderPrimitives",
    setup: (dir) => copyFixture(dir, "tests/assets/corpus/blender/vulkan-samples/primitives.gltf", "assets/real/blender-primitives.gltf"),
    expect: "success",
    source: {
      kind: "pinned-local-fixture",
      source: "tests/assets/corpus/blender/vulkan-samples/primitives.gltf",
      license: "Apache-2.0",
      notes: "Pinned Blender-exported Vulkan Samples fixture; source manifest is tests/assets/corpus/blender/blender-export-fixtures.manifest.json."
    },
    verify: (dir) => {
      const asset = validateAssets({ projectDir: dir }).manifest.assets.find((entry) => entry.id === "blenderPrimitives");
      return asset?.format === "gltf" && (asset.materials.length > 0 || Number(asset.bounds?.[0] ?? 0) > 0) ? undefined : "Blender glTF metadata missing";
    }
  },
  {
    id: "real-ktx2-texture",
    file: "assets/real/Rib_N.ktx2",
    name: "ribNormalKtx2",
    setup: (dir) => copyFixture(dir, "tests/assets/corpus/ktx2/Rib_N.ktx2", "assets/real/Rib_N.ktx2"),
    expect: "success",
    source: {
      kind: "pinned-local-fixture",
      source: "tests/assets/corpus/ktx2/Rib_N.ktx2",
      license: "local repository fixture; source review required before product use",
      notes: "Real KTX2 texture fixture used to prove the asset CLI handles KTX2 file typegen/validation."
    }
  }
];

const results: CorpusResult[] = cases.map(runCase);
const checks: ReleaseCheck[] = results.map((result) => ({
  id: result.id,
  pass: result.pass,
  detail: result.pass ? result.message : `${result.message}${result.verifyMessage ? `; ${result.verifyMessage}` : ""}`
}));

const validation = validateAssets({ projectDir: workspace });
checks.push({
  id: "asset-corpus-final-validation",
  pass: validation.ok,
  detail: validation.ok ? `${validation.manifest.assets.length} generated assets validate` : validation.messages.join("; ")
});
checks.push({
  id: "asset-corpus-typegen-created",
  pass: statSync(resolve(workspace, "src/aura-assets.ts")).isFile(),
  detail: "src/aura-assets.ts generated"
});

writeAssetCorpusMarkdown(results, validation.warnings);
writeReport("tests/reports/asset-corpus.json", "aura3d-asset-corpus", checks, {
  workspace,
  results,
  warnings: validation.warnings,
  manifest: validation.manifest
});

function runCase(testCase: CorpusCase): CorpusResult {
  try {
    testCase.setup(workspace);
    const result = addAsset({ projectDir: workspace, file: testCase.file, name: testCase.name });
    const verifyMessage = testCase.verify?.(workspace);
    const pass = testCase.expect === "success" && result.ok && !verifyMessage;
    return {
      id: testCase.id,
      expect: testCase.expect,
      pass,
      message: result.messages.join("; "),
      source: testCase.source,
      verifyMessage
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: testCase.id,
      expect: testCase.expect,
      pass: testCase.expect === "failure" && (!testCase.expectedMessage || message.includes(testCase.expectedMessage)),
      message,
      source: testCase.source
    };
  }
}

function writeAsset(projectDir: string, path: string, contents: Buffer): void {
  const fullPath = resolve(projectDir, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents);
}

function copyFixture(projectDir: string, source: string, target: string): void {
  if (!existsSync(source)) throw new Error(`Missing pinned fixture: ${source}`);
  writeAsset(projectDir, target, readFileSync(source));
}

function createGltfJson(name: string, bin: string, images: readonly string[] = []): Record<string, unknown> {
  return {
    asset: { version: "2.0", generator: "Aura3D asset corpus" },
    buffers: [{ uri: bin, byteLength: 4 }],
    materials: [{ name }],
    images: images.map((uri) => ({ uri })),
    accessors: [{ min: [-1, -1, -1], max: [1, 1, 1] }]
  };
}

function createMinimalGlb(name: string, targetSize = 0, extra: Record<string, unknown> = {}): Buffer {
  const json = JSON.stringify({
    asset: { version: "2.0", generator: "Aura3D asset corpus" },
    materials: [{ name }],
    accessors: [{ min: [-1, -1, -1], max: [1, 1, 1] }],
    ...extra
  });
  const jsonPadding = (4 - (Buffer.byteLength(json) % 4)) % 4;
  const jsonChunk = Buffer.from(json + " ".repeat(jsonPadding));
  const padding = Math.max(0, targetSize - (12 + 8 + jsonChunk.length));
  const totalLength = 12 + 8 + jsonChunk.length + padding;
  const header = Buffer.alloc(20);
  header.write("glTF", 0, "utf8");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  header.writeUInt32LE(jsonChunk.length, 12);
  header.write("JSON", 16, "utf8");
  return Buffer.concat([header, jsonChunk, Buffer.alloc(padding)]);
}

function minimalPng(): Buffer {
  return Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082", "hex");
}

function writeAssetCorpusMarkdown(results: readonly CorpusResult[], warnings: readonly string[]): void {
  const sourceNotes = results.filter((result) => result.source);
  const lines = [
    "# Asset Corpus Results",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| Case | Expected | Result | Message |",
    "|---|---|---:|---|",
    ...results.map((result) => `| \`${result.id}\` | ${result.expect} | ${result.pass ? "pass" : "fail"} | ${escapeTable(result.message)} |`),
    "",
    "## Warnings",
    "",
    ...(warnings.length > 0 ? warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
    "## Source And License Notes",
    "",
    ...(sourceNotes.length > 0
      ? sourceNotes.map((result) => `- \`${result.id}\`: ${result.source!.source}; ${result.source!.license}; ${result.source!.notes}`)
      : ["- Synthetic generated fixtures only."]),
    "",
    "## Remaining External Corpus Work",
    "",
    "- The asset corpus now covers generated/adversarial assets plus selected pinned Khronos, product-form, material-extension, Blender-export, animation, textured-PBR, and KTX2 local fixtures.",
    "- Still add separately licensed wild assets from Sketchfab CC0, Poly Haven, and Meshy exports before stable release confidence.",
    "- Run the same add/validate/typegen/render flow against that external wild corpus before claiming broad asset compatibility.",
    ""
  ];
  mkdirSync("docs/project", { recursive: true });
  writeFileSync("docs/project/asset-corpus-results.md", lines.join("\n"));
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
