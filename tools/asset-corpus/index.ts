import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  readonly verify?: (projectDir: string) => string | undefined;
}

interface CorpusResult {
  readonly id: string;
  readonly expect: "success" | "failure";
  readonly pass: boolean;
  readonly message: string;
  readonly verifyMessage?: string;
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
    id: "gltf-missing-bin",
    file: "assets/missing-bin/model.gltf",
    name: "missingBin",
    setup: (dir) => writeAsset(dir, "assets/missing-bin/model.gltf", Buffer.from(JSON.stringify(createGltfJson("missingBin", "missing.bin"), null, 2))),
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
      verifyMessage
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: testCase.id,
      expect: testCase.expect,
      pass: testCase.expect === "failure" && (!testCase.expectedMessage || message.includes(testCase.expectedMessage)),
      message
    };
  }
}

function writeAsset(projectDir: string, path: string, contents: Buffer): void {
  const fullPath = resolve(projectDir, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents);
}

function createGltfJson(name: string, bin: string): Record<string, unknown> {
  return {
    asset: { version: "2.0", generator: "Aura3D asset corpus" },
    buffers: [{ uri: bin, byteLength: 4 }],
    materials: [{ name }],
    accessors: [{ min: [-1, -1, -1], max: [1, 1, 1] }]
  };
}

function createMinimalGlb(name: string, targetSize = 0): Buffer {
  const json = JSON.stringify({
    asset: { version: "2.0", generator: "Aura3D asset corpus" },
    materials: [{ name }],
    accessors: [{ min: [-1, -1, -1], max: [1, 1, 1] }]
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

function writeAssetCorpusMarkdown(results: readonly CorpusResult[], warnings: readonly string[]): void {
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
    "## Remaining External Corpus Work",
    "",
    "- Add licensed wild GLBs from Sketchfab CC0, Poly Haven, Meshy, Blender exports, Draco, and KTX2-heavy assets.",
    "- Run the same add/validate/typegen/render flow against that external corpus before stable release confidence.",
    ""
  ];
  mkdirSync("docs/project", { recursive: true });
  writeFileSync("docs/project/asset-corpus-results.md", lines.join("\n"));
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
