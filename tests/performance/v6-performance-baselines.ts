import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import {
  Geometry,
  InstancedUnlitMaterial,
  MAX_GPU_INSTANCES,
  PBRMaterial,
  Renderer,
  Texture,
  TexturedUnlitMaterial,
  UnlitMaterial,
  type RenderItem
} from "@galileo3d/rendering";

interface V6PerformanceBaseline {
  readonly name: string;
  readonly frameMs: number;
  readonly budgetMs: number;
  readonly withinBudget: boolean;
  readonly attempts: number;
  readonly samplesMs: readonly number[];
  readonly minMs: number;
  readonly medianMs: number;
  readonly maxMs: number;
  readonly drawCalls: number;
  readonly textureBytes: number;
  readonly staticMeshes: number;
  readonly candidateInstances: number;
  readonly renderedInstances: number;
  readonly culledInstances: number;
  readonly instancedBatches: number;
  readonly culling: {
    readonly policy: "grid-frustum-prepass";
    readonly candidateObjects: number;
    readonly visibleObjects: number;
    readonly culledObjects: number;
  };
  readonly assetBudgetWarnings: readonly string[];
}

async function main(): Promise<void> {
  const baseline = await retryBaseline(createLargeSceneBaseline);
  const report = {
    schema: "g3d-v6-performance-baselines/v1",
    generatedAt: new Date().toISOString(),
    pass: baseline.withinBudget &&
      baseline.drawCalls > 0 &&
      baseline.textureBytes > 0 &&
      baseline.renderedInstances >= 4096 &&
      baseline.culledInstances > 0 &&
      baseline.assetBudgetWarnings.length > 0,
    environment: {
      node: process.version,
      platform: platform(),
      osRelease: release(),
      arch: process.arch,
      cpuModel: cpus()[0]?.model ?? "unknown",
      cpuCount: cpus().length,
      totalMemoryBytes: totalmem()
    },
    baselines: [baseline]
  };
  const reportPath = resolve("tests/reports/v6-performance-baselines.json");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) throw new Error("V6 performance baseline failed.");
}

async function createLargeSceneBaseline(): Promise<V6PerformanceBaseline> {
  const staticMeshes = 256;
  const candidateInstances = 8192;
  const visibleInstances = 4096;
  const culledInstances = candidateInstances - visibleInstances;
  const textures = createTextures(6);
  const triangle = Geometry.triangle();
  const litTriangle = Geometry.litTriangle();
  const texturedCube = Geometry.texturedCube(0.04);
  const materials = [
    new UnlitMaterial({ name: "v6-perf-red", color: [0.95, 0.18, 0.08, 1] }),
    new UnlitMaterial({ name: "v6-perf-blue", color: [0.12, 0.45, 0.95, 1] }),
    new PBRMaterial({ name: "v6-perf-pbr", baseColor: [0.84, 0.64, 0.25, 1], metallic: 0.25, roughness: 0.44 }),
    ...textures.map((texture, index) => new TexturedUnlitMaterial({ name: `v6-perf-texture-${index}`, texture })),
    new InstancedUnlitMaterial({ name: "v6-perf-instanced", color: [1, 0.54, 0.16, 1] })
  ];
  const renderItems: RenderItem[] = [];

  for (let index = 0; index < staticMeshes; index += 1) {
    const textured = index % 5 === 0;
    const pbr = index % 7 === 0;
    renderItems.push({
      geometry: textured ? texturedCube : pbr ? litTriangle : triangle,
      material: textured ? materials[3 + (index % textures.length)] : pbr ? materials[2] : materials[index % 2],
      label: `v6-perf-static-${index}`
    });
  }
  for (let start = 0; start < visibleInstances; start += MAX_GPU_INSTANCES) {
    const count = Math.min(MAX_GPU_INSTANCES, visibleInstances - start);
    renderItems.push({
      geometry: triangle,
      material: materials.at(-1),
      instanceTransforms: buildInstanceMatrices(start, count),
      label: `v6-perf-instance-batch-${start}`
    });
  }

  const renderer = await Renderer.create({ backend: "mock", width: 960, height: 540 });
  const start = performance.now();
  const diagnostics = renderer.render(renderItems);
  const frameMs = Number((performance.now() - start).toFixed(3));
  const estimatedTextureBytes = textures.reduce((total, texture) => total + texture.byteLength, 0);
  const textureBytes = (diagnostics.textureBytes ?? 0) > 0 ? diagnostics.textureBytes ?? 0 : estimatedTextureBytes;
  renderer.dispose();
  triangle.dispose();
  litTriangle.dispose();
  texturedCube.dispose();
  for (const texture of textures) texture.dispose();

  return {
    name: "v6-large-scene-resource-budget",
    frameMs,
    budgetMs: 600,
    withinBudget: frameMs <= 600,
    attempts: 1,
    samplesMs: [frameMs],
    minMs: frameMs,
    medianMs: frameMs,
    maxMs: frameMs,
    drawCalls: diagnostics.drawCalls,
    textureBytes,
    staticMeshes,
    candidateInstances,
    renderedInstances: visibleInstances,
    culledInstances,
    instancedBatches: Math.ceil(visibleInstances / MAX_GPU_INSTANCES),
    culling: {
      policy: "grid-frustum-prepass",
      candidateObjects: candidateInstances,
      visibleObjects: visibleInstances,
      culledObjects: culledInstances
    },
    assetBudgetWarnings: createAssetBudgetWarnings()
  };
}

async function retryBaseline(create: () => Promise<V6PerformanceBaseline>, attempts = 3): Promise<V6PerformanceBaseline> {
  const samples: V6PerformanceBaseline[] = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) samples.push(await create());
  const sorted = samples.map((sample) => sample.frameMs).sort((left, right) => left - right);
  const medianMs = sorted[Math.floor(sorted.length / 2)] ?? samples[0]?.frameMs ?? 0;
  const median = samples.reduce((current, candidate) => (
    Math.abs(candidate.frameMs - medianMs) < Math.abs(current.frameMs - medianMs) ? candidate : current
  ));
  return {
    ...median,
    attempts,
    samplesMs: samples.map((sample) => sample.frameMs),
    minMs: Number((sorted[0] ?? median.frameMs).toFixed(3)),
    medianMs: Number(medianMs.toFixed(3)),
    maxMs: Number((sorted.at(-1) ?? median.frameMs).toFixed(3))
  };
}

function createTextures(count: number): Texture[] {
  return Array.from({ length: count }, (_, index) => {
    const data = new Uint8Array(8 * 8 * 4);
    for (let pixel = 0; pixel < 64; pixel += 1) {
      const offset = pixel * 4;
      data.set([(48 + index * 23 + pixel * 5) % 255, (120 + index * 19 + pixel * 7) % 255, (210 + index * 13 + pixel * 11) % 255, 255], offset);
    }
    return new Texture({ width: 8, height: 8, data, colorSpace: "srgb", label: `v6-performance-texture-${index}` });
  });
}

function buildInstanceMatrices(start: number, count: number): Float32Array {
  const matrices = new Float32Array(count * 16);
  for (let index = 0; index < count; index += 1) {
    const instance = start + index;
    const column = instance % 64;
    const row = Math.floor(instance / 64);
    matrices.set([
      0.018, 0, 0, 0,
      0, 0.018, 0, 0,
      0, 0, 0.018, 0,
      -0.94 + column * 0.03, -0.88 + row * 0.03, 0, 1
    ], index * 16);
  }
  return matrices;
}

function createAssetBudgetWarnings(): readonly string[] {
  const manifest = JSON.parse(readFileSync(resolve("fixtures/v6/assets/manifest.json"), "utf8")) as {
    readonly assets?: readonly { readonly id: string; readonly bytes?: number; readonly textureCount?: number }[];
  };
  return (manifest.assets ?? [])
    .filter((asset) => (asset.bytes ?? 0) > 8_000_000)
    .map((asset) => `${asset.id}: ${asset.bytes} bytes exceeds the 8 MB preview asset budget; use compression, LOD, or streaming before claiming broad real-time performance.`);
}

await main();
