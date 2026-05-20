import { Texture } from "./Texture";

export type ShadowFilterMode = "none" | "pcf";
export type ShadowFilterDistribution = "grid" | "poisson";

export interface ShadowFilterSample {
  readonly x: number;
  readonly y: number;
  readonly weight: number;
}

export interface ShadowFilterKernel {
  readonly mode: ShadowFilterMode;
  readonly distribution: ShadowFilterDistribution;
  readonly radius: number;
  readonly samples: readonly ShadowFilterSample[];
}

export interface ShadowMapOptions {
  readonly size?: number;
  readonly bias?: number;
  readonly filter?: ShadowFilterMode;
  readonly pcfRadius?: number;
  readonly pcfSamples?: number;
  readonly pcfDistribution?: ShadowFilterDistribution;
  readonly label?: string;
}

export interface ShadowAtlasRequest {
  readonly id: string;
  readonly size: number;
  readonly cascadeIndex?: number;
}

export interface ShadowAtlasAllocation extends ShadowAtlasRequest {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ShadowAtlasLayout {
  readonly atlasSize: number;
  readonly allocations: readonly ShadowAtlasAllocation[];
  readonly utilization: number;
}

export class ShadowMap {
  public readonly texture: Texture;
  public readonly bias: number;
  public readonly filterKernel: ShadowFilterKernel;

  constructor(options: ShadowMapOptions = {}) {
    const size = options.size ?? 1024;
    if (!Number.isInteger(size) || size <= 0) {
      throw new RangeError("ShadowMap size must be a positive integer");
    }
    const bias = options.bias ?? 0.001;
    if (!Number.isFinite(bias) || bias < 0) {
      throw new RangeError("ShadowMap bias must be finite and non-negative");
    }
    this.bias = bias;
    this.filterKernel = createShadowFilterKernel(options);
    this.texture = new Texture({ width: size, height: size, format: "depth24", label: options.label ?? "shadow-map" });
  }

  get size(): number {
    return this.texture.width;
  }

  resize(size: number): ShadowMap {
    this.dispose();
    return new ShadowMap({
      size,
      bias: this.bias,
      filter: this.filterKernel.mode,
      pcfRadius: this.filterKernel.radius,
      pcfSamples: this.filterKernel.samples.length,
      pcfDistribution: this.filterKernel.distribution,
      label: this.texture.label
    });
  }

  dispose(): void {
    this.texture.dispose();
  }
}

export function createShadowAtlasLayout(requests: readonly ShadowAtlasRequest[], atlasSize: number): ShadowAtlasLayout {
  if (!Number.isInteger(atlasSize) || atlasSize <= 0) {
    throw new RangeError("Shadow atlas size must be a positive integer");
  }
  const normalized = requests.map((request) => {
    if (!request.id.trim()) throw new Error("Shadow atlas request id is required");
    if (!Number.isInteger(request.size) || request.size <= 0) throw new RangeError("Shadow atlas request size must be a positive integer");
    if (request.size > atlasSize) throw new RangeError("Shadow atlas request size cannot exceed atlas size");
    if (request.cascadeIndex !== undefined && (!Number.isInteger(request.cascadeIndex) || request.cascadeIndex < 0)) {
      throw new RangeError("Shadow atlas cascadeIndex must be a non-negative integer when provided");
    }
    return request;
  }).sort((left, right) => {
    const leftCascade = left.cascadeIndex ?? Number.MAX_SAFE_INTEGER;
    const rightCascade = right.cascadeIndex ?? Number.MAX_SAFE_INTEGER;
    if (leftCascade !== rightCascade) return leftCascade - rightCascade;
    if (left.size !== right.size) return right.size - left.size;
    return left.id.localeCompare(right.id);
  });

  const allocations: ShadowAtlasAllocation[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  for (const request of normalized) {
    if (cursorX + request.size > atlasSize) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }
    if (cursorY + request.size > atlasSize) {
      throw new RangeError("Shadow atlas requests do not fit in the atlas");
    }
    allocations.push({
      ...request,
      x: cursorX,
      y: cursorY,
      width: request.size,
      height: request.size
    });
    cursorX += request.size;
    rowHeight = Math.max(rowHeight, request.size);
  }
  const usedArea = allocations.reduce((sum, allocation) => sum + allocation.width * allocation.height, 0);
  return {
    atlasSize,
    allocations,
    utilization: Number((usedArea / (atlasSize * atlasSize)).toFixed(6))
  };
}

export function createShadowFilterKernel(options: Pick<ShadowMapOptions, "filter" | "pcfRadius" | "pcfSamples" | "pcfDistribution"> = {}): ShadowFilterKernel {
  const mode = options.filter ?? "none";
  if (mode !== "none" && mode !== "pcf") {
    throw new RangeError(`Unsupported shadow filter mode: ${String(mode)}`);
  }
  if (mode === "none") {
    return {
      mode,
      distribution: "grid",
      radius: 0,
      samples: [{ x: 0, y: 0, weight: 1 }]
    };
  }

  const radius = options.pcfRadius ?? 1;
  if (!Number.isFinite(radius) || radius <= 0 || radius > 8) {
    throw new RangeError("ShadowMap pcfRadius must be finite and greater than zero up to 8 texels");
  }

  const sampleCount = options.pcfSamples ?? 9;
  const distribution = options.pcfDistribution ?? "grid";
  if (distribution !== "grid" && distribution !== "poisson") {
    throw new RangeError(`Unsupported shadow filter distribution: ${String(distribution)}`);
  }
  if (distribution === "poisson") {
    return {
      mode,
      distribution,
      radius,
      samples: createPoissonDiskShadowKernel(sampleCount, radius)
    };
  }
  const gridSize = Math.sqrt(sampleCount);
  if (!Number.isInteger(sampleCount) || sampleCount <= 0 || !Number.isInteger(gridSize) || gridSize < 2 || gridSize > 5) {
    throw new RangeError("ShadowMap pcfSamples must be a square grid sample count between 4 and 25");
  }

  const half = (gridSize - 1) / 2;
  const unweighted: ShadowFilterSample[] = [];
  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      unweighted.push({
        x: (x - half) * radius,
        y: (y - half) * radius,
        weight: 1 / sampleCount
      });
    }
  }
  return {
    mode,
    distribution,
    radius,
    samples: unweighted
  };
}

export function createPoissonDiskShadowKernel(sampleCount = 16, radius = 1): readonly ShadowFilterSample[] {
  if (!Number.isInteger(sampleCount) || sampleCount < 4 || sampleCount > 32) {
    throw new RangeError("Poisson shadow sample count must be an integer from 4 to 32");
  }
  if (!Number.isFinite(radius) || radius <= 0 || radius > 8) {
    throw new RangeError("Poisson shadow radius must be finite and greater than zero up to 8 texels");
  }
  const poisson16 = [
    [-0.94201624, -0.39906216], [0.94558609, -0.76890725], [-0.0941841, -0.9293887], [0.34495938, 0.2938776],
    [-0.91588581, 0.45771432], [-0.81544232, -0.87912464], [-0.38277543, 0.27676845], [0.97484398, 0.75648379],
    [0.44323325, -0.97511554], [0.53742981, -0.4737342], [-0.26496911, -0.41893023], [0.79197514, 0.19090188],
    [-0.2418884, 0.99706507], [-0.81409955, 0.9143759], [0.19984126, 0.78641367], [0.14383161, -0.1410079]
  ] as const;
  const poisson32 = [
    [-0.975402, -0.0711386], [-0.920347, -0.441282], [-0.883908, 0.217872], [-0.884518, 0.568041],
    [-0.811945, -0.790709], [-0.792474, 0.0130608], [-0.644704, -0.569165], [-0.634888, 0.682157],
    [-0.624807, -0.238616], [-0.590539, 0.327366], [-0.504396, -0.863621], [-0.454499, 0.875562],
    [-0.416458, -0.0370163], [-0.345554, -0.670523], [-0.272745, 0.535116], [-0.238006, -0.369068],
    [-0.190885, 0.918882], [-0.149278, 0.0543955], [0.00910668, -0.869337], [0.0293372, 0.358103],
    [0.0968844, -0.0888426], [0.185344, -0.536082], [0.239055, 0.717623], [0.301938, -0.281269],
    [0.392248, 0.0857121], [0.487048, -0.733963], [0.549342, 0.478623], [0.625366, -0.0596615],
    [0.688151, -0.462789], [0.736279, 0.253616], [0.816755, 0.604563], [0.897866, -0.192168]
  ] as const;
  const base = sampleCount <= 16 ? poisson16 : poisson32;
  const weight = 1 / sampleCount;
  return base.slice(0, sampleCount).map(([x, y]) => ({ x: Number((x * radius).toFixed(6)), y: Number((y * radius).toFixed(6)), weight }));
}

export function computeShadowDepthBias(options: {
  readonly baseBias: number;
  readonly slopeScale?: number;
  readonly normalDotLight: number;
  readonly texelSize?: number;
}): number {
  const slopeScale = options.slopeScale ?? 1;
  const texelSize = options.texelSize ?? 1;
  if (!Number.isFinite(options.baseBias) || options.baseBias < 0) throw new RangeError("Shadow baseBias must be finite and non-negative");
  if (!Number.isFinite(slopeScale) || slopeScale < 0) throw new RangeError("Shadow slopeScale must be finite and non-negative");
  if (!Number.isFinite(texelSize) || texelSize <= 0) throw new RangeError("Shadow texelSize must be finite and positive");
  const grazing = 1 - Math.max(0, Math.min(1, options.normalDotLight));
  return Number((options.baseBias + grazing * slopeScale * texelSize).toFixed(8));
}
