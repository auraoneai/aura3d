import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import {
  Geometry,
  InstancedUnlitMaterial,
  MAX_GPU_INSTANCES,
  NormalMappedPBRMaterial,
  PBRMaterial,
  Renderer,
  Texture,
  TexturedPBRMaterial,
  TexturedUnlitMaterial,
  UnlitMaterial,
  type RenderItem
} from "@aura3d/rendering";

interface RenderingBudget {
  readonly name: string;
  readonly frameMs: number;
  readonly budgetMs: number;
  readonly withinBudget: boolean;
  readonly attempts: number;
  readonly minMs: number;
  readonly medianMs: number;
  readonly maxMs: number;
  readonly samplesMs: readonly number[];
  readonly drawCalls: number;
  readonly buffers: number;
  readonly shaders: number;
  readonly staticMeshes?: number;
  readonly instances?: number;
  readonly instancedBatches?: number;
  readonly materials?: number;
  readonly textures?: number;
}

async function main(): Promise<void> {
  const budgets = [
    await retryRenderingBudget(largeSceneBudget),
    await retryRenderingBudget(materialMatrixBudget)
  ];
  const report = {
    generatedAt: new Date().toISOString(),
    suite: "rendering-frame-budgets",
    environment: {
      node: process.version,
      platform: platform(),
      osRelease: release(),
      arch: process.arch,
      cpuModel: cpus()[0]?.model ?? "unknown",
      cpuCount: cpus().length,
      totalMemoryBytes: totalmem()
    },
    status: budgets.every((budget) => budget.withinBudget) ? "pass" : "fail",
    budgets
  };

  const reportPath = resolve("tests/reports/rendering-frame-budgets.json");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));

  if (report.status !== "pass") {
    throw new Error(`Rendering frame budget failed for ${budgets.filter((budget) => !budget.withinBudget).map((budget) => budget.name).join(", ")}`);
  }
}

async function largeSceneBudget(): Promise<RenderingBudget> {
  const staticMeshes = 5_000;
  const instances = 10_000;
  const textures = createTextures(8);
  const geometry = Geometry.triangle();
  const litGeometry = Geometry.litTriangle();
  const texturedGeometry = Geometry.texturedCube(0.04);
  const materials = [
    new UnlitMaterial({ name: "large-red", color: [0.95, 0.16, 0.08, 1] }),
    new UnlitMaterial({ name: "large-blue", color: [0.1, 0.48, 0.95, 1] }),
    new UnlitMaterial({ name: "large-green", color: [0.1, 0.76, 0.38, 1] }),
    new PBRMaterial({ name: "large-pbr-brass", baseColor: [0.88, 0.66, 0.28, 1], metallic: 0.2, roughness: 0.42 }),
    new PBRMaterial({ name: "large-pbr-cyan", baseColor: [0.16, 0.78, 0.9, 1], metallic: 0.05, roughness: 0.68 }),
    ...textures.map((texture, index) => new TexturedUnlitMaterial({ name: `large-textured-${index}`, texture })),
    new InstancedUnlitMaterial({ name: "large-instanced-warm", color: [1, 0.52, 0.14, 1] }),
    new InstancedUnlitMaterial({ name: "large-instanced-cool", color: [0.18, 0.86, 1, 1] })
  ];
  const renderItems: RenderItem[] = [];

  for (let index = 1; index < staticMeshes; index += 1) {
    const textured = index % 11 === 0;
    const pbr = index % 13 === 0;
    renderItems.push({
      geometry: textured ? texturedGeometry : pbr ? litGeometry : geometry,
      material: textured ? materials[5 + (index % textures.length)] : pbr ? materials[3 + (index % 2)] : materials[index % 3],
      label: `large-scene-static-${index}`
    });
  }

  for (let start = 0; start < instances; start += MAX_GPU_INSTANCES) {
    const count = Math.min(MAX_GPU_INSTANCES, instances - start);
    renderItems.push({
      geometry,
      material: materials[13 + (Math.floor(start / MAX_GPU_INSTANCES) % 2)],
      instanceTransforms: buildInstanceMatrices(start, count),
      label: `large-scene-instance-${start}`
    });
  }

  renderItems.push({ geometry, material: materials[0], label: "large-scene-center-probe" });
  const renderer = await Renderer.create({ backend: "mock", width: 640, height: 360 });
  const start = performance.now();
  const diagnostics = renderer.render(renderItems);
  const frameMs = performance.now() - start;
  renderer.dispose();
  geometry.dispose();
  litGeometry.dispose();
  texturedGeometry.dispose();
  for (const texture of textures) texture.dispose();

  return withBudget({
    name: "rendering-large-scene-frame",
    frameMs: Number(frameMs.toFixed(3)),
    drawCalls: diagnostics.drawCalls,
    buffers: diagnostics.buffers,
    shaders: diagnostics.shaders,
    staticMeshes,
    instances,
    instancedBatches: Math.ceil(instances / MAX_GPU_INSTANCES),
    materials: materials.length,
    textures: textures.length
  }, 1_500);
}

async function materialMatrixBudget(): Promise<RenderingBudget> {
  const baseColorTexture = createTextures(1, "srgb")[0]!;
  const emissiveTexture = createTextures(1, "srgb")[0]!;
  const linearTextures = createTextures(4, "linear");
  const textures = [baseColorTexture, emissiveTexture, ...linearTextures];
  const triangle = Geometry.triangle();
  const litTriangle = Geometry.litTriangle();
  const texturedCube = Geometry.texturedCube(0.1);
  const materials = [
    new UnlitMaterial({ name: "matrix-base-color", color: [0.92, 0.14, 0.08, 1] }),
    new PBRMaterial({ name: "matrix-metallic", baseColor: [0.96, 0.72, 0.22, 1], metallic: 0.9, roughness: 0.28 }),
    new NormalMappedPBRMaterial({ name: "matrix-normal", normalTexture: linearTextures[0]!, normalScale: 1 }),
    new TexturedPBRMaterial({
      name: "matrix-textured-pbr",
      baseColorTexture,
      normalTexture: linearTextures[1]!,
      metallicRoughnessTexture: linearTextures[2]!,
      occlusionTexture: linearTextures[2]!,
      emissiveTexture,
      emissiveStrength: 0.5
    }),
    new UnlitMaterial({
      name: "matrix-alpha-blend",
      color: [0.7, 0.2, 0.95, 0.55],
      renderState: { blend: true, depthWrite: false, cullMode: "none" }
    })
  ];
  const renderItems: RenderItem[] = materials.map((material, index) => ({
    geometry: index >= 2 ? texturedCube : index === 1 ? litTriangle : triangle,
    material,
    label: `material-matrix-${index}`
  }));
  const renderer = await Renderer.create({ backend: "mock", width: 960, height: 540 });
  const start = performance.now();
  const diagnostics = renderer.render(renderItems);
  const frameMs = performance.now() - start;
  renderer.dispose();
  triangle.dispose();
  litTriangle.dispose();
  texturedCube.dispose();
  for (const texture of textures) texture.dispose();

  return withBudget({
    name: "rendering-material-matrix-frame",
    frameMs: Number(frameMs.toFixed(3)),
    drawCalls: diagnostics.drawCalls,
    buffers: diagnostics.buffers,
    shaders: diagnostics.shaders,
    materials: materials.length,
    textures: textures.length
  }, 150);
}

async function retryRenderingBudget(createBudget: () => Promise<RenderingBudget>, attempts = 3): Promise<RenderingBudget> {
  const samples: RenderingBudget[] = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    samples.push(await createBudget());
  }
  const sorted = samples.map((sample) => sample.frameMs).sort((left, right) => left - right);
  const medianMs = sorted[Math.floor(sorted.length / 2)] ?? samples[0]?.frameMs ?? 0;
  const median = samples.reduce((current, candidate) => (
    Math.abs(candidate.frameMs - medianMs) < Math.abs(current.frameMs - medianMs) ? candidate : current
  ));
  const minMs = sorted[0] ?? median.frameMs;
  const maxMs = sorted.at(-1) ?? median.frameMs;

  return {
    ...median,
    attempts,
    minMs: Number(minMs.toFixed(3)),
    medianMs: Number(medianMs.toFixed(3)),
    maxMs: Number(maxMs.toFixed(3)),
    samplesMs: samples.map((sample) => sample.frameMs)
  };
}

function withBudget(
  budget: Omit<RenderingBudget, "attempts" | "minMs" | "medianMs" | "maxMs" | "samplesMs" | "budgetMs" | "withinBudget">,
  budgetMs: number
): RenderingBudget {
  return {
    ...budget,
    budgetMs,
    withinBudget: budget.frameMs <= budgetMs,
    attempts: 1,
    minMs: budget.frameMs,
    medianMs: budget.frameMs,
    maxMs: budget.frameMs,
    samplesMs: [budget.frameMs]
  };
}

function createTextures(count: number, colorSpace: "linear" | "srgb" = "srgb"): Texture[] {
  return Array.from({ length: count }, (_, index) => {
    const data = new Uint8Array(4 * 4 * 4);
    for (let pixel = 0; pixel < 16; pixel += 1) {
      const offset = pixel * 4;
      data.set([
        (64 + index * 31 + pixel * 7) % 255,
        (128 + index * 17 + pixel * 11) % 255,
        (192 + index * 13 + pixel * 5) % 255,
        255
      ], offset);
    }
    return new Texture({ width: 4, height: 4, data, colorSpace, label: `rendering-budget-texture-${colorSpace}-${index}` });
  });
}

function buildInstanceMatrices(start: number, count: number): Float32Array {
  const output = new Float32Array(count * 16);
  for (let index = 0; index < count; index += 1) {
    output.set(identityMatrix(), index * 16);
  }
  return output;
}

function identityMatrix(): readonly number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
}

await main();
