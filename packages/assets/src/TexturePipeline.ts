import type { ImportStage } from "./ImportPipeline";

export interface TextureMipGenerationInput {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
  readonly colorSpace?: "linear" | "srgb";
}

export interface TextureMipLevel {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export interface TextureMipGenerationResult {
  readonly width: number;
  readonly height: number;
  readonly colorSpace: "linear" | "srgb";
  readonly levels: readonly TextureMipLevel[];
}

export interface TextureMipGenerationStageOptions {
  readonly name?: string;
}

export function generateTextureMipChain(input: TextureMipGenerationInput): TextureMipGenerationResult {
  validateTextureMipInput(input);

  const levels: TextureMipLevel[] = [{
    width: input.width,
    height: input.height,
    data: new Uint8Array(input.data)
  }];

  while (levels[levels.length - 1]!.width > 1 || levels[levels.length - 1]!.height > 1) {
    levels.push(downsampleRGBA8(levels[levels.length - 1]!));
  }

  return {
    width: input.width,
    height: input.height,
    colorSpace: input.colorSpace ?? "srgb",
    levels
  };
}

export function createTextureMipGenerationStage(options: TextureMipGenerationStageOptions = {}): ImportStage<TextureMipGenerationInput, TextureMipGenerationResult> {
  return {
    name: options.name ?? "texture-mip-generation",
    run: (input) => generateTextureMipChain(input)
  };
}

export interface AnisotropyRequest {
  /** Desired anisotropy (4 is the default where supported; 8/16 are opt-in). */
  readonly desired?: number;
  /**
   * Capability-probe result: maximum anisotropy the device supports.
   * Values <= 1 (or absent) mean unsupported — the request safely folds to 1.
   */
  readonly maxSupported?: number;
}

export interface AnisotropyResolution {
  readonly applied: 1 | 2 | 4 | 8 | 16;
  readonly capped: boolean;
  readonly detail: string;
}

const ANISOTROPY_STEPS = [1, 2, 4, 8, 16] as const;

/**
 * M2 root-requestable anisotropy with capability gating. The renderer already
 * honors `maxAnisotropy`; this is the requesting side the root material
 * builders will call (root wiring is a reported bridge hunk).
 */
export function resolveAnisotropyRequest(request: AnisotropyRequest = {}): AnisotropyResolution {
  const desired = Number.isFinite(request.desired) ? Math.max(1, request.desired as number) : 4;
  const maxSupported = Number.isFinite(request.maxSupported) ? Math.max(1, request.maxSupported as number) : 1;
  const allowed = Math.min(desired, maxSupported);
  const applied = [...ANISOTROPY_STEPS].reverse().find((step) => step <= allowed) ?? 1;
  const capped = applied < desired;
  return {
    applied,
    capped,
    detail: capped
      ? `Anisotropy ${desired}x requested but device supports ${maxSupported}x — applied ${applied}x.`
      : `Anisotropy ${applied}x applied (requested ${desired}x, device ${maxSupported}x).`
  };
}

function validateTextureMipInput(input: TextureMipGenerationInput): void {
  if (!Number.isInteger(input.width) || input.width <= 0) {
    throw new Error("Texture mip generation width must be a positive integer");
  }
  if (!Number.isInteger(input.height) || input.height <= 0) {
    throw new Error("Texture mip generation height must be a positive integer");
  }
  if (!(input.data instanceof Uint8Array) && !(input.data instanceof Uint8ClampedArray)) {
    throw new Error("Texture mip generation requires RGBA8 byte data");
  }
  if (input.data.byteLength !== input.width * input.height * 4) {
    throw new Error("Texture mip generation data must contain exactly width * height * 4 bytes");
  }
  if (input.colorSpace !== undefined && input.colorSpace !== "linear" && input.colorSpace !== "srgb") {
    throw new Error("Texture mip generation colorSpace must be linear or srgb");
  }
}

function downsampleRGBA8(source: TextureMipLevel): TextureMipLevel {
  const width = Math.max(1, Math.ceil(source.width / 2));
  const height = Math.max(1, Math.ceil(source.height / 2));
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const samples: number[] = [];
      for (let sy = y * 2; sy < Math.min(source.height, y * 2 + 2); sy += 1) {
        for (let sx = x * 2; sx < Math.min(source.width, x * 2 + 2); sx += 1) {
          samples.push((sy * source.width + sx) * 4);
        }
      }
      const output = (y * width + x) * 4;
      for (let component = 0; component < 4; component += 1) {
        let total = 0;
        for (const sample of samples) total += source.data[sample + component] ?? 0;
        data[output + component] = Math.round(total / samples.length);
      }
    }
  }

  return { width, height, data };
}
