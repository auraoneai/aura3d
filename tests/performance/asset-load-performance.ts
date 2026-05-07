import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AssetManager, GLTFLoader, type GLTFAsset } from "@galileo3d/assets";

interface LoadSample {
  readonly name: string;
  readonly assetCount: number;
  readonly meshCount: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly elapsedMs: number;
  readonly averageLoadMs: number;
  readonly budgetMs: number;
  readonly withinBudget: boolean;
}

interface AssetLoadPerformanceReport {
  readonly schemaVersion: "asset-load-performance-v1";
  readonly generatedAt: string;
  readonly environment: {
    readonly runtime: string;
    readonly node: string;
    readonly platform: NodeJS.Platform;
  };
  readonly corpusEvidence: {
    readonly classifiedExternalAssets: number;
    readonly pass: number;
    readonly warn: number;
    readonly expectedFail: number;
    readonly note: string;
  };
  readonly samples: readonly LoadSample[];
  readonly summary: {
    readonly status: "pass" | "fail";
    readonly totalAssetsLoaded: number;
    readonly slowestAverageLoadMs: number;
  };
}

const coldLoadBudgetMs = 750;
const repeatedLoadBudgetMs = 1_000;

async function main(): Promise<void> {
  const cold = await measure("asset-corpus-11-inline-cold-loads", 11, coldLoadBudgetMs);
  const repeated = await measure("asset-corpus-32-inline-repeated-loads", 32, repeatedLoadBudgetMs);
  const samples = [cold, repeated];
  const report: AssetLoadPerformanceReport = {
    schemaVersion: "asset-load-performance-v1",
    generatedAt: new Date().toISOString(),
    environment: {
      runtime: "node",
      node: process.version,
      platform: process.platform,
    },
    corpusEvidence: {
      classifiedExternalAssets: 11,
      pass: 8,
      warn: 1,
      expectedFail: 2,
      note: "Performance timing uses deterministic local inline glTF fixtures through public AssetManager and GLTFLoader APIs; it does not claim 100 external assets.",
    },
    samples,
    summary: {
      status: samples.every((sample) => sample.withinBudget) ? "pass" : "fail",
      totalAssetsLoaded: samples.reduce((sum, sample) => sum + sample.assetCount, 0),
      slowestAverageLoadMs: Number(Math.max(...samples.map((sample) => sample.averageLoadMs)).toFixed(3)),
    },
  };

  const reportPath = resolve("tests/reports/asset-load-performance.json");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));

  if (report.summary.status !== "pass") {
    process.exitCode = 1;
  }
}

async function measure(name: string, assetCount: number, budgetMs: number): Promise<LoadSample> {
  const manager = new AssetManager();
  manager.register(new GLTFLoader());
  const handles = [];
  let meshCount = 0;
  let vertexCount = 0;
  let indexCount = 0;
  const start = performance.now();

  for (let index = 0; index < assetCount; index += 1) {
    const handle = await manager.load<GLTFAsset>(createTriangleGltfDataUri(index), { type: "gltf" });
    handles.push(handle);
    meshCount += handle.value.meshes.length;
    vertexCount += handle.value.meshes.reduce((sum, mesh) => sum + mesh.geometry.vertexCount, 0);
    indexCount += handle.value.meshes.reduce((sum, mesh) => sum + mesh.geometry.indexCount, 0);
  }

  for (const handle of handles) {
    await manager.release(handle);
  }

  const elapsedMs = Number((performance.now() - start).toFixed(3));
  return {
    name,
    assetCount,
    meshCount,
    vertexCount,
    indexCount,
    elapsedMs,
    averageLoadMs: Number((elapsedMs / assetCount).toFixed(3)),
    budgetMs,
    withinBudget: elapsedMs <= budgetMs,
  };
}

function createTriangleGltfDataUri(seed: number): string {
  const xOffset = (seed % 7) * 0.005;
  const positions = floatBytes([-0.5 + xOffset, -0.5, 0, 0.5 + xOffset, -0.5, 0, xOffset, 0.5, 0]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, indices);
  const gltf = {
    asset: { version: "2.0", generator: "Galileo3D asset load performance fixture" },
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5 + xOffset, -0.5, 0], max: [0.5 + xOffset, 0.5, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    meshes: [{ name: `performance-triangle-${seed}`, primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function floatBytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  new Float32Array(bytes.buffer).set(values);
  return bytes;
}

function uint16Bytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2);
  new Uint16Array(bytes.buffer).set(values);
  return bytes;
}

function concatBytes(...chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function bytesDataUri(bytes: Uint8Array): string {
  return `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`;
}

await main();
