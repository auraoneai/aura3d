import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  GLTFLoader,
  LoadContext,
  createAssetCompatibilityReport,
  type AssetCompatibilityReport,
  type AssetCompatibilityStatus,
  type BlenderExportCompatibilityResult,
  type BlenderExportValidationReport,
  type ExternalAssetLoaderCompatibilityResult,
  type GLTFCorpusManifest
} from "../../packages/assets/src/index.js";

type BlenderSameCorpusExportAsset = {
  readonly id: string;
  readonly sourceUri: string;
  readonly sourceSha256: string;
  readonly status: AssetCompatibilityStatus;
  readonly inputSha256?: string;
  readonly exportedSha256?: string;
  readonly exportedBytes?: number;
  readonly metrics?: {
    readonly objects: number;
    readonly meshes: number;
    readonly materials: number;
    readonly animations: number;
  };
  readonly diagnostics: readonly {
    readonly code: string;
    readonly severity: "info" | "warning" | "error";
    readonly message: string;
    readonly nextAction: string;
  }[];
};

type BlenderSameCorpusExportReport = {
  readonly schemaVersion: "blender-same-corpus-export-v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly command: "pnpm audit:v4-blender-same-corpus-export";
  readonly blender: {
    readonly executable?: string;
    readonly version?: string;
    readonly available: boolean;
  };
  readonly sourceManifest: {
    readonly path: "tests/assets/corpus/gltf-corpus.manifest.json";
    readonly assetCount: number;
    readonly sourceName?: string;
    readonly sourceRevision?: string;
  };
  readonly summary: Record<AssetCompatibilityStatus, number> & {
    readonly assetCount: number;
    readonly exportedBytes: number;
  };
  readonly assetCompatibilityReport: "tests/reports/asset-compatibility-threejs.json";
  readonly assets: readonly BlenderSameCorpusExportAsset[];
  readonly blockers: readonly string[];
};

type BlenderBatchAssetResult = {
  readonly id: string;
  readonly ok: boolean;
  readonly outputPath?: string;
  readonly error?: string;
  readonly metrics?: {
    readonly objects: number;
    readonly meshes: number;
    readonly materials: number;
    readonly animations: number;
  };
};

type PreparedAssetInput = {
  readonly id: string;
  readonly sourceUri: string;
  readonly sourceSha256: string;
  readonly inputPath: string;
  readonly inputSha256: string;
};

const manifestPath = "tests/assets/corpus/gltf-corpus.manifest.json";
const sameCorpusReportPath = "tests/reports/blender-same-corpus-export.json";
const assetCompatibilityReportPath = "tests/reports/asset-compatibility-threejs.json";
const blenderExportValidationPath = "tests/reports/blender-export-validation.json";
const workRoot = "tests/reports/blender-same-corpus-work";

async function main(): Promise<void> {
  const root = process.cwd();
  const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), "utf8")) as GLTFCorpusManifest;
  const blender = findBlenderExecutable();
  mkdirSync(resolve(root, "tests/reports"), { recursive: true });

  if (!blender) {
    const report = createBlockedReport(manifest, "Blender executable is not available locally. Install Blender or set G3D_BLENDER to a Blender binary.");
    writeJson(resolve(root, sameCorpusReportPath), report);
    console.log(JSON.stringify({ ok: report.ok, report: sameCorpusReportPath, blocker: report.blockers[0] }, null, 2));
    return;
  }

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runRoot = resolve(root, workRoot, runId);
  const inputRoot = resolve(runRoot, "inputs");
  const outputRoot = resolve(runRoot, "outputs");
  mkdirSync(inputRoot, { recursive: true });
  mkdirSync(outputRoot, { recursive: true });

  const prepared: PreparedAssetInput[] = [];
  const preparationFailures: BlenderSameCorpusExportAsset[] = [];
  for (const asset of manifest.assets) {
    try {
      prepared.push(await prepareAssetInput(asset, inputRoot));
    } catch (error) {
      preparationFailures.push(assetFailure({
        id: asset.id,
        sourceUri: asset.source.uri,
        sourceSha256: asset.source.sha256
      }, "ASSET_BLENDER_SAME_CORPUS_PREPARE_FAILED", error instanceof Error ? error.message : String(error)));
    }
  }
  const batchInputPath = resolve(runRoot, "batch-input.json");
  const batchOutputPath = resolve(runRoot, "batch-output.json");
  const batchScriptPath = resolve(runRoot, "batch-export.py");
  writeJson(batchInputPath, prepared.map((asset) => ({
    id: asset.id,
    inputPath: asset.inputPath,
    outputPath: resolve(outputRoot, `${asset.id}.glb`)
  })));
  writeFileSync(batchScriptPath, blenderBatchScript());

  const blenderRun = prepared.length === 0 ? undefined : spawnSync(blender, ["-b", "--python", batchScriptPath, "--", batchInputPath, batchOutputPath], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 20 * 60_000
  });
  if (!blenderRun || blenderRun.error || blenderRun.status !== 0 || !existsSync(batchOutputPath)) {
    const detail = blenderRun?.error instanceof Error ? blenderRun.error.message : `${blenderRun?.stderr || blenderRun?.stdout || "Blender did not produce a batch result."}`;
    const report = createBlockedReport(manifest, `Blender batch export failed: ${detail.trim()}`);
    writeJson(resolve(root, sameCorpusReportPath), report);
    console.log(JSON.stringify({ ok: report.ok, report: sameCorpusReportPath, blocker: report.blockers[0] }, null, 2));
    return;
  }

  const batchResults = JSON.parse(readFileSync(batchOutputPath, "utf8")) as BlenderBatchAssetResult[];
  const byId = new Map(batchResults.map((result) => [result.id, result]));
  const assets: BlenderSameCorpusExportAsset[] = [...preparationFailures];
  for (const source of prepared) {
    const result = byId.get(source.id);
    assets.push(await validateExportedAsset(source, result));
  }

  const report = createReport(manifest, blender, blenderVersion(blender), assets);
  writeJson(resolve(root, sameCorpusReportPath), report);
  if (assets.length > 0) {
    writeAssetCompatibilityReport(root, manifest, assets);
  }
  console.log(JSON.stringify({
    ok: report.ok,
    report: sameCorpusReportPath,
    assetCompatibilityReport: assets.length > 0 ? assetCompatibilityReportPath : undefined,
    summary: report.summary,
    blockers: report.blockers
  }, null, 2));
}

async function prepareAssetInput(
  asset: GLTFCorpusManifest["assets"][number],
  inputRoot: string
): Promise<PreparedAssetInput> {
  const response = await fetchWithRetry(asset.source.uri, `source ${asset.id}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  if (sourceSha256 !== asset.source.sha256) {
    throw new Error(`Source hash mismatch for ${asset.id}: expected ${asset.source.sha256}, got ${sourceSha256}`);
  }
  const inputPath = resolve(inputRoot, `${asset.id}.${asset.format === "glb" ? "glb" : "gltf"}`);
  if (asset.format === "glb") {
    writeFileSync(inputPath, bytes);
    return { id: asset.id, sourceUri: asset.source.uri, sourceSha256: asset.source.sha256, inputPath, inputSha256: sourceSha256 };
  }

  const root = asset.source.uri.slice(0, asset.source.uri.lastIndexOf("/") + 1);
  const gltf = JSON.parse(bytes.toString("utf8")) as {
    buffers?: Array<{ uri?: string }>;
    images?: Array<{ uri?: string; mimeType?: string }>;
  };
  await inlineExternalUris(gltf.buffers, root, "application/octet-stream");
  await inlineExternalUris(gltf.images, root, "application/octet-stream");
  const inlined = Buffer.from(JSON.stringify(gltf));
  writeFileSync(inputPath, inlined);
  return {
    id: asset.id,
    sourceUri: asset.source.uri,
    sourceSha256: asset.source.sha256,
    inputPath,
    inputSha256: createHash("sha256").update(inlined).digest("hex")
  };
}

async function inlineExternalUris(
  entries: Array<{ uri?: string; mimeType?: string }> | undefined,
  root: string,
  fallbackContentType: string
): Promise<void> {
  for (const entry of entries ?? []) {
    if (!entry.uri || entry.uri.startsWith("data:")) continue;
    const response = await fetchWithRetry(new URL(entry.uri, root).toString(), `glTF dependency ${entry.uri}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    entry.uri = `data:${entry.mimeType ?? response.headers.get("content-type") ?? fallbackContentType};base64,${bytes.toString("base64")}`;
  }
}

async function fetchWithRetry(url: string, label: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`Failed to fetch ${label}: ${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 750));
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${label}: ${String(lastError)}`);
}

async function validateExportedAsset(
  source: {
    readonly id: string;
    readonly sourceUri: string;
    readonly sourceSha256: string;
    readonly inputSha256: string;
  },
  result: BlenderBatchAssetResult | undefined
): Promise<BlenderSameCorpusExportAsset> {
  if (!result) {
    return assetFailure(source, "ASSET_BLENDER_SAME_CORPUS_RESULT_MISSING", "Blender did not return a result for this asset.");
  }
  if (!result.ok || !result.outputPath || !existsSync(result.outputPath)) {
    return assetFailure(source, "ASSET_BLENDER_SAME_CORPUS_EXPORT_FAILED", result.error ?? "Blender failed to import or export this asset.");
  }
  const exported = readFileSync(result.outputPath);
  const exportedSha256 = createHash("sha256").update(exported).digest("hex");
  try {
    const asset = await new GLTFLoader().load({ url: `data:model/gltf-binary;base64,${exported.toString("base64")}` }, new LoadContext());
    const renderableCount = asset.createScene().collectRenderables().length;
    if (asset.meshes.length <= 0 || renderableCount <= 0) {
      return assetFailure(source, "ASSET_BLENDER_SAME_CORPUS_RELOAD_EMPTY", "The exported GLB loaded but produced no renderable mesh evidence.");
    }
  } catch (error) {
    return assetFailure(source, "ASSET_BLENDER_SAME_CORPUS_RELOAD_FAILED", error instanceof Error ? error.message : String(error));
  }
  return {
    id: source.id,
    sourceUri: source.sourceUri,
    sourceSha256: source.sourceSha256,
    status: "pass",
    inputSha256: source.inputSha256,
    exportedSha256,
    exportedBytes: statSync(result.outputPath).size,
    metrics: result.metrics,
    diagnostics: [{
      code: "ASSET_BLENDER_SAME_CORPUS_EXPORT_VALIDATED",
      severity: "info",
      message: "Asset was imported by Blender, exported as GLB, and reloaded through Galileo3D's glTF loader.",
      nextAction: "Keep this result fresh when changing the corpus, Blender version, exporter settings, or Galileo3D loader."
    }]
  };
}

function assetFailure(
  source: {
    readonly id: string;
    readonly sourceUri: string;
    readonly sourceSha256: string;
    readonly inputSha256?: string;
  },
  code: string,
  message: string
): BlenderSameCorpusExportAsset {
  return {
    id: source.id,
    sourceUri: source.sourceUri,
    sourceSha256: source.sourceSha256,
    status: "expected-fail",
    inputSha256: source.inputSha256,
    diagnostics: [{
      code,
      severity: "error",
      message,
      nextAction: "Inspect the Blender import/export failure before claiming same-corpus Blender export coverage."
    }]
  };
}

function writeAssetCompatibilityReport(
  root: string,
  manifest: GLTFCorpusManifest,
  assets: readonly BlenderSameCorpusExportAsset[]
): void {
  const existing = readOptionalJson(resolve(root, assetCompatibilityReportPath)) as AssetCompatibilityReport | null;
  const blenderExportValidation = readOptionalJson(resolve(root, blenderExportValidationPath)) as BlenderExportValidationReport | null;
  const externalLoaderResults = (existing?.assets ?? []).flatMap((asset): ExternalAssetLoaderCompatibilityResult[] => {
    const loaders = asset.loaders.filter((loader) => loader.loader === "threejs" || loader.loader === "babylonjs");
    return loaders.map((loader) => ({
      assetId: asset.id,
      loader: loader.loader as "threejs" | "babylonjs",
      status: loader.status,
      diagnostics: loader.diagnostics
    }));
  });
  const blenderExportResults: BlenderExportCompatibilityResult[] = assets.map((asset) => ({
    assetId: asset.id,
    loader: "blender-export",
    status: asset.status,
    diagnostics: asset.diagnostics
  }));
  const report = createAssetCompatibilityReport(manifest, {
    generatedAt: new Date().toISOString(),
    blenderExportFixturesPresent: true,
    ...(blenderExportValidation ? { blenderExportValidation } : {}),
    externalLoaderResults,
    blenderExportResults
  });
  writeJson(resolve(root, assetCompatibilityReportPath), report);
}

function createReport(
  manifest: GLTFCorpusManifest,
  blender: string,
  version: string,
  assets: readonly BlenderSameCorpusExportAsset[]
): BlenderSameCorpusExportReport {
  const summary = summarize(assets);
  const blockers = [
    summary["not-run"] === 0 ? "" : `${summary["not-run"]} same-corpus assets did not run through Blender.`,
    summary["expected-fail"] === 0 ? "" : `${summary["expected-fail"]} same-corpus assets failed Blender export or Galileo3D reload.`,
    assets.length === manifest.assets.length ? "" : `Blender same-corpus result count is incomplete (${assets.length}/${manifest.assets.length}).`
  ].filter((entry): entry is string => entry.length > 0);
  return {
    schemaVersion: "blender-same-corpus-export-v1",
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    command: "pnpm audit:v4-blender-same-corpus-export",
    blender: { executable: blender, version, available: true },
    sourceManifest: {
      path: manifestPath,
      assetCount: manifest.assets.length,
      sourceName: manifest.generatedFrom.name,
      sourceRevision: manifest.generatedFrom.revision
    },
    summary,
    assetCompatibilityReport: assetCompatibilityReportPath,
    assets,
    blockers
  };
}

function createBlockedReport(manifest: GLTFCorpusManifest, blocker: string): BlenderSameCorpusExportReport {
  const assets = manifest.assets.map((asset): BlenderSameCorpusExportAsset => ({
    id: asset.id,
    sourceUri: asset.source.uri,
    sourceSha256: asset.source.sha256,
    status: "not-run",
    diagnostics: [{
      code: "ASSET_BLENDER_SAME_CORPUS_NOT_RUN",
      severity: "error",
      message: blocker,
      nextAction: "Install Blender or set G3D_BLENDER, then run pnpm audit:v4-blender-same-corpus-export."
    }]
  }));
  return {
    schemaVersion: "blender-same-corpus-export-v1",
    ok: false,
    generatedAt: new Date().toISOString(),
    command: "pnpm audit:v4-blender-same-corpus-export",
    blender: { available: false },
    sourceManifest: {
      path: manifestPath,
      assetCount: manifest.assets.length,
      sourceName: manifest.generatedFrom.name,
      sourceRevision: manifest.generatedFrom.revision
    },
    summary: summarize(assets),
    assetCompatibilityReport: assetCompatibilityReportPath,
    assets,
    blockers: [blocker]
  };
}

function summarize(assets: readonly BlenderSameCorpusExportAsset[]): BlenderSameCorpusExportReport["summary"] {
  const summary = {
    pass: 0,
    warn: 0,
    "expected-fail": 0,
    "not-run": 0,
    assetCount: assets.length,
    exportedBytes: 0
  };
  for (const asset of assets) {
    summary[asset.status] += 1;
    summary.exportedBytes += asset.exportedBytes ?? 0;
  }
  return summary;
}

function findBlenderExecutable(): string | undefined {
  const candidates = [
    process.env.G3D_BLENDER,
    commandOutput("command -v blender"),
    "/Applications/Blender.app/Contents/MacOS/Blender",
    "/opt/homebrew/bin/blender",
    "/usr/local/bin/blender"
  ].filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  return candidates.find((candidate) => existsSync(candidate));
}

function blenderVersion(blender: string): string {
  const result = spawnSync(blender, ["--version"], { encoding: "utf8", timeout: 20_000 });
  return (result.stdout || result.stderr || "unknown").split("\n")[0]?.trim() || "unknown";
}

function commandOutput(command: string): string | undefined {
  const result = spawnSync("sh", ["-lc", command], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readOptionalJson(path: string): unknown {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function blenderBatchScript(): string {
  return String.raw`
import bpy
import json
import os
import sys
import traceback

separator = sys.argv.index("--")
input_path = sys.argv[separator + 1]
output_path = sys.argv[separator + 2]

with open(input_path, "r", encoding="utf8") as handle:
    assets = json.load(handle)

results = []

for asset in assets:
    try:
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete()
        for mesh in list(bpy.data.meshes):
            bpy.data.meshes.remove(mesh)
        for material in list(bpy.data.materials):
            bpy.data.materials.remove(material)
        for animation in list(bpy.data.actions):
            bpy.data.actions.remove(animation)

        bpy.ops.import_scene.gltf(filepath=asset["inputPath"])
        metrics = {
            "objects": len(bpy.data.objects),
            "meshes": len(bpy.data.meshes),
            "materials": len(bpy.data.materials),
            "animations": len(bpy.data.actions)
        }
        bpy.ops.export_scene.gltf(filepath=asset["outputPath"], export_format="GLB", export_apply=True)
        results.append({
            "id": asset["id"],
            "ok": True,
            "outputPath": asset["outputPath"],
            "metrics": metrics
        })
    except Exception:
        results.append({
            "id": asset["id"],
            "ok": False,
            "error": traceback.format_exc()
        })

with open(output_path, "w", encoding="utf8") as handle:
    json.dump(results, handle, indent=2)
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
