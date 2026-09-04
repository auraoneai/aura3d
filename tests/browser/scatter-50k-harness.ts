import { camera, createAuraApp, instances, material, primitives, scene } from "@aura3d/engine";
import type { AuraTransformSpec } from "@aura3d/engine";
import { enforceFrameBudget, planScatterInstances, scatterWindOffset } from "@aura3d/rendering";

/**
 * PART D2 50k-instance scatter scene (muse3jsparity-PRD).
 *
 * 60,000 seeded candidates over a 140 x 120 field, distance-sorted from the
 * camera: the nearest 50,000 (plan budget) are admitted, the far 10,000 are
 * culled. Wind is the `scatterWindOffset` gust field evaluated at two probe
 * times (calm t=0 vs gust t=1.2s); the A/B screenshots are the wind proof.
 * The frame budget (`enforceFrameBudget` over measured draws, 12-tris/box
 * computed triangles, zero texture maps) is the hold-budget proof, with the
 * measured frame-time distribution retained. Camera looks down-field so
 * behind-camera instances exercise the engine frustum path too.
 *
 * Pre-declared budget caps: maxDraws 32, maxTriangles 2,000,000,
 * maxTextures 16. Pre-declared fps floor: median frame <= 50ms.
 */

const SEED = 1337;
const CANDIDATE_COUNT = 60000;
const INSTANCE_BUDGET = 50000;
const DENSITY_MEAN = 0.6;
const WIND_STRENGTH = 0.35;
const CULL_DISTANCE = 120;
const SHADOW_CASTER_FRACTION = 0.25;
const FIELD_X = 70;
const FIELD_Z = 60;
const CAMERA: readonly [number, number, number] = [0, 8, 44];
const TARGET: readonly [number, number, number] = [0, 0.5, -30];
/**
 * Per-layer wind display amplitudes: the fixture gust field is centimeter
 * scale, so it is scaled to vegetation height here (grass blades 0.9 tall
 * sway up to ~0.07, shrubs 1.5 tall up to ~0.09 — 5-10% of layer height).
 * Gust frequencies/phases are untouched.
 */
const GRASS_AMPLITUDE = 3;
const SHRUB_AMPLITUDE = 8;
const SHRUB_RESPONSE = 0.45;
const MAX_DRAWS = 32;
const MAX_TRIANGLES = 2000000;
const MAX_TEXTURES = 16;
const TRIS_PER_BOX = 12;
const MEDIAN_FRAME_MS_CEILING = 50;

interface ScatterFrameSample {
  readonly frames: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}

interface Scatter50kResult {
  readonly status: "ready" | "error" | "waiting";
  readonly plan?: {
    readonly admittedInstances: number;
    readonly culledInstances: number;
    readonly meshInstances: number;
    readonly impostorInstances: number;
    readonly shadowCasters: number;
    readonly windStrength: number;
    readonly withinBudget: boolean;
  };
  readonly admission?: {
    readonly candidates: number;
    readonly submitted: number;
    readonly culled: number;
    readonly maxSubmittedDistance: number;
    readonly minShedDistance: number;
    readonly cullDistance: number;
    readonly grassInstances: number;
    readonly shrubInstances: number;
  };
  readonly wind?: {
    readonly calmTime: number;
    readonly gustTime: number;
    readonly changedPixels: number;
    readonly maxGrassOffset: number;
    readonly maxShrubOffset: number;
    readonly grassAmplitude: number;
    readonly shrubAmplitude: number;
  };
  readonly budget?: {
    readonly draws: number;
    readonly triangles: number;
    readonly trianglesComputed: boolean;
    readonly trisPerInstance: number;
    readonly textures: number;
    readonly overBudget: boolean;
    readonly lodBias: number;
    readonly shedDraws: number;
  };
  readonly runtime?: {
    readonly drawCalls: number;
    readonly fps: number;
    readonly backend: string;
    readonly frustumTestedObjects: number;
    readonly culledObjects: number;
    readonly visibleObjects: number;
    readonly nativeInstancedSubmissions: number;
  };
  readonly frames?: ScatterFrameSample;
  readonly foregroundPixels?: number;
  readonly checksum?: number;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_SCATTER_50K__?: Scatter50kResult;
  }
}

window.__AURA3D_SCATTER_50K__ = { status: "waiting" };

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function waitForFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (remaining: number): void => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}

void runScatter().catch((error: unknown) => {
  window.__AURA3D_SCATTER_50K__ = {
    status: "error",
    error: error instanceof Error ? (error.stack ?? error.message) : String(error),
  };
});

async function runScatter(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#scatter");
  if (!canvas) throw new Error("Scatter canvas is missing.");

  const plan = planScatterInstances({
    instanceBudget: INSTANCE_BUDGET,
    densityMapMean: DENSITY_MEAN,
    windStrength: WIND_STRENGTH,
    cullDistance: CULL_DISTANCE,
    shadowCasterFraction: SHADOW_CASTER_FRACTION,
    candidateInstances: CANDIDATE_COUNT,
  });

  // Deterministic candidates, distance-sorted: nearest BUDGET admit.
  const random = mulberry32(SEED);
  const candidates = Array.from({ length: CANDIDATE_COUNT }, () => {
    const x = (random() * 2 - 1) * FIELD_X;
    const z = (random() * 2 - 1) * FIELD_Z;
    const distance = Math.hypot(x - CAMERA[0], z - CAMERA[2]);
    return { x, z, distance };
  }).sort((a, b) => a.distance - b.distance);
  const admitted = candidates.slice(0, plan.admittedInstances);
  const shed = candidates.slice(plan.admittedInstances);
  const maxSubmittedDistance = admitted[admitted.length - 1]!.distance;
  const minShedDistance = shed[0]!.distance;

  const grass = admitted.filter((_, index) => index % 5 < 3);
  const shrubs = admitted.filter((_, index) => index % 5 >= 3);

  const buildTransforms = (
    list: readonly { readonly x: number; readonly z: number }[],
    time: number,
    response: number,
    amplitude: number,
    blade: boolean
  ): AuraTransformSpec[] =>
    list.map(({ x, z }) => {
      const sway = scatterWindOffset(x, z, time, WIND_STRENGTH, response, amplitude);
      return {
        position: [x + sway.x, blade ? 0.45 : 0.75, z + sway.z] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: blade
          ? ([0.09, 0.9, 0.09] as [number, number, number])
          : ([0.9, 1.5, 0.9] as [number, number, number]),
      };
    });

  const mount = (time: number) =>
    createAuraApp(canvas, {
      scene: scene()
        .background("#0b1a24")
        .add(
          primitives
            .plane({
              name: "scatter ground",
              material: material.pbr({ name: "scatter soil", color: "#1d2f24", roughness: 0.95, metallic: 0 }),
            })
            .position(0, 0, 0)
            .rotate(-Math.PI / 2, 0, 0)
            .scale([FIELD_X * 2 + 20, 1, FIELD_Z * 2 + 20])
        )
        .add(
          instances.box({
            name: "scatter grass blades",
            transforms: buildTransforms(grass, time, 1, GRASS_AMPLITUDE, true),
            material: material.emissive({
              name: "scatter grass",
              color: "#3f9e4d",
              emissive: "#2a7a38",
              emissiveIntensity: 0.55,
            }),
          })
        )
        .add(
          instances.box({
            name: "scatter shrubs",
            transforms: buildTransforms(shrubs, time, SHRUB_RESPONSE, SHRUB_AMPLITUDE, false),
            material: material.emissive({
              name: "scatter shrubs",
              color: "#2f6d62",
              emissive: "#1f5c55",
              emissiveIntensity: 0.5,
            }),
          })
        )
        .camera(camera.perspective({ position: [...CAMERA], target: [...TARGET], fov: 55 })),
      pixelRatio: 1,
      resize: false,
    });

  // Wind A/B: calm mount vs gust mount, pixel-compared in-page.
  const calmApp = mount(0);
  await waitForFrames(8);
  if (calmApp.diagnostics().errors.length > 0) throw new Error(calmApp.diagnostics().errors.join("\n"));
  const calmUrl = calmApp.screenshot().dataUrl;
  calmApp.dispose();

  const gustApp = mount(1.2);
  await waitForFrames(8);
  const gustDiagnostics = gustApp.diagnostics();
  if (gustDiagnostics.errors.length > 0) throw new Error(gustDiagnostics.errors.join("\n"));
  const gustUrl = gustApp.screenshot().dataUrl;

  const comparison = await compareScreenshots(calmUrl, gustUrl);
  const gustPixels = await analyzeForeground(gustUrl);
  let maxGrassOffset = 0;
  let maxShrubOffset = 0;
  for (const { x, z } of grass) {
    const sway = scatterWindOffset(x, z, 1.2, WIND_STRENGTH, 1, GRASS_AMPLITUDE);
    maxGrassOffset = Math.max(maxGrassOffset, Math.hypot(sway.x, sway.z));
  }
  for (const { x, z } of shrubs) {
    const sway = scatterWindOffset(x, z, 1.2, WIND_STRENGTH, SHRUB_RESPONSE, SHRUB_AMPLITUDE);
    maxShrubOffset = Math.max(maxShrubOffset, Math.hypot(sway.x, sway.z));
  }

  // Frame-time distribution on the gust scene (render cost, static camera).
  const samples: number[] = [];
  let previous = await new Promise<number>((resolveFrame) => requestAnimationFrame(resolveFrame));
  for (let frame = 0; frame < 90; frame += 1) {
    const current = await new Promise<number>((resolveFrame) => requestAnimationFrame(resolveFrame));
    samples.push(current - previous);
    previous = current;
  }
  samples.sort((a, b) => a - b);
  const frames: ScatterFrameSample = {
    frames: samples.length,
    p50Ms: Number(samples[Math.floor(samples.length * 0.5)]!.toFixed(3)),
    p95Ms: Number(samples[Math.floor(samples.length * 0.95)]!.toFixed(3)),
    maxMs: Number(samples[samples.length - 1]!.toFixed(3)),
  };

  const latest = gustApp.diagnostics();
  const runtime = latest.renderer?.runtime;
  const draws = latest.drawCalls;
  const triangles = plan.admittedInstances * TRIS_PER_BOX;
  const budget = enforceFrameBudget({
    draws,
    triangles,
    textures: 0,
    maxDraws: MAX_DRAWS,
    maxTriangles: MAX_TRIANGLES,
    maxTextures: MAX_TEXTURES,
  });

  window.__AURA3D_SCATTER_50K__ = {
    status: "ready",
    plan: {
      admittedInstances: plan.admittedInstances,
      culledInstances: plan.culledInstances,
      meshInstances: plan.meshInstances,
      impostorInstances: plan.impostorInstances,
      shadowCasters: plan.shadowCasters,
      windStrength: plan.windStrength,
      withinBudget: plan.withinBudget,
    },
    admission: {
      candidates: CANDIDATE_COUNT,
      submitted: admitted.length,
      culled: CANDIDATE_COUNT - admitted.length,
      maxSubmittedDistance: Number(maxSubmittedDistance.toFixed(3)),
      minShedDistance: Number(minShedDistance.toFixed(3)),
      cullDistance: CULL_DISTANCE,
      grassInstances: grass.length,
      shrubInstances: shrubs.length,
    },
    wind: {
      calmTime: 0,
      gustTime: 1.2,
      changedPixels: comparison.changedPixels,
      maxGrassOffset: Number(maxGrassOffset.toFixed(5)),
      maxShrubOffset: Number(maxShrubOffset.toFixed(5)),
      grassAmplitude: GRASS_AMPLITUDE,
      shrubAmplitude: SHRUB_AMPLITUDE,
    },
    budget: {
      draws,
      triangles,
      trianglesComputed: true,
      trisPerInstance: TRIS_PER_BOX,
      textures: 0,
      overBudget: budget.overBudget,
      lodBias: budget.lodBias,
      shedDraws: budget.shedDraws,
    },
    runtime: {
      drawCalls: draws,
      fps: latest.fps,
      backend: latest.backend,
      frustumTestedObjects: runtime?.frustumTestedObjects ?? -1,
      culledObjects: runtime?.culledObjects ?? -1,
      visibleObjects: runtime?.visibleObjects ?? -1,
      nativeInstancedSubmissions: runtime?.nativeInstancedSubmissions ?? -1,
    },
    frames,
    foregroundPixels: gustPixels.foregroundPixels,
    checksum: gustPixels.checksum,
  };
  gustApp.dispose();
}

async function loadImage(dataUrl: string): Promise<ImageData> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2d pixel analysis context is unavailable.");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function compareScreenshots(aUrl: string, bUrl: string): Promise<{ readonly changedPixels: number }> {
  const a = await loadImage(aUrl);
  const b = await loadImage(bUrl);
  if (a.width !== b.width || a.height !== b.height) throw new Error("Wind A/B captures differ in size.");
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.abs(a.data[i]! - b.data[i]!) +
        Math.abs(a.data[i + 1]! - b.data[i + 1]!) +
        Math.abs(a.data[i + 2]! - b.data[i + 2]!) >
      12
    ) {
      changed += 1;
    }
  }
  return { changedPixels: changed };
}

async function analyzeForeground(dataUrl: string): Promise<{ readonly foregroundPixels: number; readonly checksum: number }> {
  const image = await loadImage(dataUrl);
  let foreground = 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i]!;
    const g = image.data[i + 1]!;
    const b = image.data[i + 2]!;
    // Background is #0b1a24 (11, 26, 36).
    if (Math.abs(r - 11) + Math.abs(g - 26) + Math.abs(b - 36) > 60) foreground += 1;
    hash ^= r;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return { foregroundPixels: foreground, checksum: hash >>> 0 };
}
