import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { addAsset, checkDeploy, doctor, validateAssets, writeAssetManifest } from "../../packages/aura3d-cli/src/index";
import { createA3DProject } from "../../packages/create-aura3d/src/index";
import { writeReport, type ReleaseCheck } from "../check-common";

interface ErrorCase {
  readonly id: string;
  readonly run: () => unknown;
  readonly expectedTerms: readonly string[];
}

const outRoot = resolve("tests/reports/error-message-quality-workspace");
rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

const cases: ErrorCase[] = [
  {
    id: "missing-asset-file",
    run: () => addAsset({ projectDir: outRoot, file: "missing.glb", name: "missing" }),
    expectedTerms: ["does not exist", "Suggested fix"]
  },
  {
    id: "invalid-template-name",
    run: () => createA3DProject({ targetDir: resolve(outRoot, "bad-template"), template: "bad-template" as never }),
    expectedTerms: ["Unknown create-aura3d template", "Available templates"]
  },
  {
    id: "malformed-asset-manifest",
    run: () => {
      writeFileSync(resolve(outRoot, "aura.assets.json"), "{\"schema\":\"bad\"}\n");
      return validateAssets({ projectDir: outRoot });
    },
    expectedTerms: ["Unsupported Aura3D asset manifest schema"]
  },
  {
    id: "missing-package-json-doctor",
    run: () => {
      writeAssetManifest(outRoot, { schema: "aura3d.assets/1.0", assetBasePath: "/aura-assets/", outputDir: "public/aura-assets", typegen: "src/aura-assets.ts", assets: [] });
      return doctor({ projectDir: outRoot });
    },
    expectedTerms: ["Missing package.json"]
  },
  {
    id: "missing-dist-deploy-check",
    run: () => {
      const assetPath = resolve(outRoot, "model.glb");
      writeFileSync(assetPath, createMinimalGlb("model"));
      addAsset({ projectDir: outRoot, file: "model.glb", name: "model" });
      rmSync(resolve(outRoot, "public"), { recursive: true, force: true });
      return checkDeploy({ projectDir: outRoot, distDir: "dist" });
    },
    expectedTerms: ["Deploy check missing hashed asset", "model"]
  }
];

const results = cases.map((testCase) => {
  try {
    const value = testCase.run();
    if (typeof value === "object" && value && "ok" in value && (value as { ok?: unknown }).ok === false) {
      const messages = ((value as { messages?: readonly string[] }).messages ?? []).join("\n");
      return {
        id: testCase.id,
        pass: testCase.expectedTerms.every((term) => messages.includes(term)),
        message: messages,
        expectedTerms: testCase.expectedTerms
      };
    }
    return {
      id: testCase.id,
      pass: false,
      message: "case did not fail",
      expectedTerms: testCase.expectedTerms
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: testCase.id,
      pass: testCase.expectedTerms.every((term) => message.includes(term)),
      message,
      expectedTerms: testCase.expectedTerms
    };
  }
});

const checks: ReleaseCheck[] = results.map((result) => ({
  id: result.id,
  pass: result.pass && !/^\s*at\s+/m.test(result.message),
  detail: result.pass ? "expected actionable error terms found without stack trace" : `message=${result.message}; expected=${result.expectedTerms.join(", ")}`
}));

writeReport("tests/reports/error-message-quality.json", "aura3d-error-message-quality", checks, { results });

function createMinimalGlb(name: string): Buffer {
  const json = JSON.stringify({
    asset: { version: "2.0", generator: "Aura3D error-quality fixture" },
    materials: [{ name }],
    accessors: [{ min: [-1, -1, -1], max: [1, 1, 1] }]
  });
  const jsonPadding = (4 - (Buffer.byteLength(json) % 4)) % 4;
  const jsonChunk = Buffer.from(json + " ".repeat(jsonPadding));
  const totalLength = 12 + 8 + jsonChunk.length;
  const header = Buffer.alloc(20);
  header.write("glTF", 0, "utf8");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  header.writeUInt32LE(jsonChunk.length, 12);
  header.write("JSON", 16, "utf8");
  return Buffer.concat([header, jsonChunk]);
}

