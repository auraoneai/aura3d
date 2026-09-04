import { type CollectedLight } from "./LightCollector";
import { Sampler } from "./Sampler";
import { Texture } from "./Texture";
import { TextureBinding } from "./TextureBinding";

export const CLUSTER_TILE_SIZE = 64;
export const MAX_LIGHTS_PER_CLUSTER = 64;

export type ClusteredForwardFallbackPolicy = "none" | "nearest-observer" | "input-order-no-observer";

export interface ClusteredForwardLightingOptions {
  /**
   * World-space reference point for the nearest-N over-budget policy (normally
   * the camera position). When omitted, over-budget clusters keep input order
   * and the diagnostics record `input-order-no-observer` so the weaker policy
   * is visible instead of silent.
   */
  readonly observerPosition?: readonly [number, number, number];
  /**
   * Warning sink for the over-budget fallback. A custom sink is always called
   * when the fallback applies; the default `console.warn` is deduplicated per
   * grid configuration so per-frame clustered builds do not spam the console.
   */
  readonly onWarning?: (message: string) => void;
}

export interface ClusteredForwardLightingDiagnostics {
  readonly source: "createClusteredForwardLighting";
  readonly mode: "screen-tile-texture-grid";
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly clusterCount: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly requestedLightCount: number;
  readonly indexedLightCount: number;
  readonly maxLightsPerCluster: number;
  readonly maxIndexedLightsInCluster: number;
  readonly totalLightReferences: number;
  readonly culledLightCount: number;
  readonly droppedLightCount: number;
  readonly overBudgetClusterCount: number;
  readonly maxRequestedLightsInCluster: number;
  readonly requestedPerCluster: readonly number[];
  readonly indexedPerCluster: readonly number[];
  readonly fallbackPolicy: ClusteredForwardFallbackPolicy;
  readonly warnings: readonly string[];
}

export interface ClusteredForwardLightingResources {
  readonly lightData: TextureBinding;
  readonly lightIndices: TextureBinding;
  readonly diagnostics: ClusteredForwardLightingDiagnostics;
  dispose(): void;
}

export function createClusteredForwardLighting(
  lights: readonly CollectedLight[],
  viewportWidth: number,
  viewportHeight: number,
  viewProjectionMatrix?: Float32Array | readonly number[],
  options: ClusteredForwardLightingOptions = {}
): ClusteredForwardLightingResources {
  if (!Number.isInteger(viewportWidth) || viewportWidth <= 0 || !Number.isInteger(viewportHeight) || viewportHeight <= 0) {
    throw new RangeError("Clustered-forward viewport dimensions must be positive integers.");
  }
  if (viewProjectionMatrix && viewProjectionMatrix.length < 16) {
    throw new RangeError("Clustered-forward view-projection matrix must contain 16 values.");
  }
  const observerPosition = options.observerPosition;
  if (
    observerPosition !== undefined &&
    (observerPosition.length !== 3 || observerPosition.some((component) => !Number.isFinite(component)))
  ) {
    throw new RangeError("Clustered-forward observerPosition must be three finite numbers.");
  }
  const gridWidth = Math.max(1, Math.ceil(viewportWidth / CLUSTER_TILE_SIZE));
  const gridHeight = Math.max(1, Math.ceil(viewportHeight / CLUSTER_TILE_SIZE));
  const clusterCount = gridWidth * gridHeight;
  const lightPixels = new Float32Array(Math.max(1, lights.length) * 6 * 4);
  for (const [index, light] of lights.entries()) {
    const offset = index * 24;
    lightPixels.set([light.color[0], light.color[1], light.color[2], light.intensity], offset);
    lightPixels.set([light.position[0], light.position[1], light.position[2], light.range], offset + 4);
    lightPixels.set([light.direction[0], light.direction[1], light.direction[2], lightKind(light.kind)], offset + 8);
    lightPixels.set([
      light.kind === "rect-area" ? light.width ?? 1 : light.spotAngle,
      light.kind === "rect-area" ? light.height ?? 1 : light.penumbra,
      light.castsShadow && light.kind !== "rect-area" ? 1 : 0,
      light.layerMask
    ], offset + 12);
    lightPixels.set([...(light.right ?? [1, 0, 0]), 0], offset + 16);
    lightPixels.set([...(light.up ?? [0, 1, 0]), 0], offset + 20);
  }
  const indexPixels = new Float32Array(MAX_LIGHTS_PER_CLUSTER * clusterCount * 4);
  const clusterLists = Array.from({ length: clusterCount }, () => [] as number[]);
  const culledLights = new Set<number>();
  for (const [lightIndex, light] of lights.entries()) {
    const bounds = light.kind === "directional" || !viewProjectionMatrix
      ? { minX: 0, maxX: gridWidth - 1, minY: 0, maxY: gridHeight - 1 }
      : projectedLightTileBounds(light, viewProjectionMatrix, viewportWidth, viewportHeight, gridWidth, gridHeight);
    if (!bounds) {
      culledLights.add(lightIndex);
      continue;
    }
    for (let tileY = bounds.minY; tileY <= bounds.maxY; tileY += 1) {
      for (let tileX = bounds.minX; tileX <= bounds.maxX; tileX += 1) {
        clusterLists[tileY * gridWidth + tileX]!.push(lightIndex);
      }
    }
  }
  const referencedLights = new Set<number>();
  let totalLightReferences = 0;
  let maxIndexedLightsInCluster = 0;
  let overBudgetClusterCount = 0;
  let maxRequestedLightsInCluster = 0;
  let fallbackPolicy: ClusteredForwardFallbackPolicy = "none";
  const requestedPerCluster: number[] = [];
  const indexedPerCluster: number[] = [];
  for (let cluster = 0; cluster < clusterCount; cluster += 1) {
    const candidates = clusterLists[cluster]!;
    requestedPerCluster.push(candidates.length);
    maxRequestedLightsInCluster = Math.max(maxRequestedLightsInCluster, candidates.length);
    // Over-budget clusters keep at most MAX_LIGHTS_PER_CLUSTER entries. With an
    // observer the survivors are the nearest N by emitter distance (stable
    // tie-break on input order); without one the input order is kept and the
    // weaker policy is recorded in diagnostics instead of applied silently.
    const selected = candidates.length > MAX_LIGHTS_PER_CLUSTER
      ? ((): readonly number[] => {
        overBudgetClusterCount += 1;
        fallbackPolicy = observerPosition ? "nearest-observer" : "input-order-no-observer";
        return observerPosition
          ? nearestLightIndicesFirst(candidates, lights, observerPosition).slice(0, MAX_LIGHTS_PER_CLUSTER)
          : candidates.slice(0, MAX_LIGHTS_PER_CLUSTER);
      })()
      : candidates;
    indexedPerCluster.push(selected.length);
    maxIndexedLightsInCluster = Math.max(maxIndexedLightsInCluster, selected.length);
    totalLightReferences += selected.length;
    for (const [index, lightIndex] of selected.entries()) {
      const offset = (cluster * MAX_LIGHTS_PER_CLUSTER + index) * 4;
      indexPixels[offset] = lightIndex;
      indexPixels[offset + 1] = selected.length;
      referencedLights.add(lightIndex);
    }
  }
  const warnings: string[] = [];
  if (overBudgetClusterCount > 0) {
    const basis = observerPosition
      ? `nearest ${MAX_LIGHTS_PER_CLUSTER} to the observer per over-budget cluster`
      : `first ${MAX_LIGHTS_PER_CLUSTER} in input order per over-budget cluster (no observerPosition supplied; pass the camera position for distance-ranked fallback)`;
    warnings.push(
      `Clustered-forward light budget exceeded: ${overBudgetClusterCount} of ${clusterCount} clusters ` +
      `requested more than ${MAX_LIGHTS_PER_CLUSTER} lights (peak ${maxRequestedLightsInCluster}); kept the ${basis}.`
    );
    emitClusteredForwardWarning(warnings[0]!, options.onWarning, gridWidth, gridHeight, maxRequestedLightsInCluster, fallbackPolicy);
  }
  const lightTexture = new Texture({
    width: 6,
    height: Math.max(1, lights.length),
    format: "rgba32f",
    colorSpace: "linear",
    label: "clustered-forward-light-data",
    mipLevels: [{ width: 6, height: Math.max(1, lights.length), data: lightPixels }]
  });
  const indexTexture = new Texture({
    width: MAX_LIGHTS_PER_CLUSTER,
    height: clusterCount,
    format: "rgba32f",
    colorSpace: "linear",
    label: "clustered-forward-light-indices",
    mipLevels: [{ width: MAX_LIGHTS_PER_CLUSTER, height: clusterCount, data: indexPixels }]
  });
  const sampler = new Sampler({
    minFilter: "nearest",
    magFilter: "nearest",
    addressU: "clamp-to-edge",
    addressV: "clamp-to-edge"
  });
  return {
    lightData: new TextureBinding({ name: "u_clusterLightData", texture: lightTexture, sampler, required: true }),
    lightIndices: new TextureBinding({ name: "u_clusterLightIndices", texture: indexTexture, sampler, required: true }),
    diagnostics: {
      source: "createClusteredForwardLighting",
      mode: "screen-tile-texture-grid",
      gridWidth,
      gridHeight,
      clusterCount,
      viewportWidth,
      viewportHeight,
      requestedLightCount: lights.length,
      indexedLightCount: referencedLights.size,
      maxLightsPerCluster: MAX_LIGHTS_PER_CLUSTER,
      maxIndexedLightsInCluster,
      totalLightReferences,
      culledLightCount: culledLights.size,
      droppedLightCount: lights.length - culledLights.size - referencedLights.size,
      overBudgetClusterCount,
      maxRequestedLightsInCluster,
      requestedPerCluster,
      indexedPerCluster,
      fallbackPolicy,
      warnings
    },
    dispose() {
      lightTexture.dispose();
      indexTexture.dispose();
    }
  };
}

function projectedLightTileBounds(
  light: CollectedLight,
  matrix: Float32Array | readonly number[],
  viewportWidth: number,
  viewportHeight: number,
  gridWidth: number,
  gridHeight: number
): { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number } | null {
  const samples = [
    light.position,
    [light.position[0] - light.range, light.position[1], light.position[2]],
    [light.position[0] + light.range, light.position[1], light.position[2]],
    [light.position[0], light.position[1] - light.range, light.position[2]],
    [light.position[0], light.position[1] + light.range, light.position[2]],
    [light.position[0], light.position[1], light.position[2] - light.range],
    [light.position[0], light.position[1], light.position[2] + light.range]
  ] as const;
  const projected = samples.map((sample) => projectToScreen(sample, matrix, viewportWidth, viewportHeight)).filter((value) => value !== null);
  if (projected.length === 0) return null;
  const minPixelX = Math.min(...projected.map((value) => value![0]));
  const maxPixelX = Math.max(...projected.map((value) => value![0]));
  const minPixelY = Math.min(...projected.map((value) => value![1]));
  const maxPixelY = Math.max(...projected.map((value) => value![1]));
  if (maxPixelX < 0 || minPixelX >= viewportWidth || maxPixelY < 0 || minPixelY >= viewportHeight) return null;
  return {
    minX: clampTile(Math.floor(minPixelX / CLUSTER_TILE_SIZE), gridWidth),
    maxX: clampTile(Math.floor(maxPixelX / CLUSTER_TILE_SIZE), gridWidth),
    minY: clampTile(Math.floor(minPixelY / CLUSTER_TILE_SIZE), gridHeight),
    maxY: clampTile(Math.floor(maxPixelY / CLUSTER_TILE_SIZE), gridHeight)
  };
}

function projectToScreen(
  position: readonly [number, number, number],
  matrix: Float32Array | readonly number[],
  viewportWidth: number,
  viewportHeight: number
): readonly [number, number] | null {
  const x = position[0];
  const y = position[1];
  const z = position[2];
  const clipX = matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!;
  const clipY = matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!;
  const clipW = matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]!;
  if (!Number.isFinite(clipW) || clipW <= 0.0001) return null;
  return [
    (clipX / clipW * 0.5 + 0.5) * viewportWidth,
    (clipY / clipW * 0.5 + 0.5) * viewportHeight
  ];
}

function clampTile(value: number, size: number): number {
  return Math.max(0, Math.min(size - 1, value));
}

function lightKind(kind: CollectedLight["kind"]): number {
  return kind === "directional" ? 0 : kind === "point" ? 1 : kind === "spot" ? 2 : 3;
}

function nearestLightIndicesFirst(
  candidates: readonly number[],
  lights: readonly CollectedLight[],
  observerPosition: readonly [number, number, number]
): readonly number[] {
  return candidates
    .map((lightIndex, order) => ({
      lightIndex,
      order,
      distanceSquared: distanceSquaredToObserver(lights[lightIndex]!.position, observerPosition)
    }))
    .sort((left, right) => left.distanceSquared !== right.distanceSquared
      ? left.distanceSquared - right.distanceSquared
      : left.order - right.order)
    .map((entry) => entry.lightIndex);
}

function distanceSquaredToObserver(
  position: readonly [number, number, number],
  observerPosition: readonly [number, number, number]
): number {
  const dx = position[0] - observerPosition[0];
  const dy = position[1] - observerPosition[1];
  const dz = position[2] - observerPosition[2];
  const squared = dx * dx + dy * dy + dz * dz;
  return Number.isFinite(squared) ? squared : Number.POSITIVE_INFINITY;
}

const warnedClusterConfigurations = new Set<string>();

/** Clears the once-per-configuration warning memory (tests + device reset). */
export function resetClusteredForwardLightingWarnings(): void {
  warnedClusterConfigurations.clear();
}

function emitClusteredForwardWarning(
  message: string,
  onWarning: ((message: string) => void) | undefined,
  gridWidth: number,
  gridHeight: number,
  maxRequestedLightsInCluster: number,
  fallbackPolicy: ClusteredForwardFallbackPolicy
): void {
  if (onWarning) {
    onWarning(message);
    return;
  }
  const signature = `${gridWidth}x${gridHeight}|peak${maxRequestedLightsInCluster}|${fallbackPolicy}`;
  if (warnedClusterConfigurations.has(signature)) return;
  warnedClusterConfigurations.add(signature);
  if (typeof console !== "undefined" && typeof console.warn === "function") console.warn(message);
}
