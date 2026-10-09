/**
 * GPUPMREMGenerator (PRD-02 §8.7): capture six RGBA16F cube faces on the GPU
 * (`renderFace` hook + `readFloatPixels`) and produce a PMREM `EnvironmentProbe`.
 *
 * The GGX prefilter itself runs through the injected `prefilter` seam — the
 * default is the CPU implementation (`environment/workers/cpuPrefilter.ts`),
 * which is also the Worker path. A native GPU FIS pass drops in through the
 * same seam; `floatColorBuffer`/`halfFloatColorBuffer` probe fields gate the
 * GPU capture (PRD §R2: callers without them use `neutral()` or prebakes).
 */

import { RenderDeviceError, type RenderDevice, type RenderTarget } from "../RenderDevice.js";
import type { Texture } from "../Texture.js";
import type { EnvironmentProbe } from "../contracts/environment.js";
import { equirectToCubeFaces } from "./HdrEquirect.js";
import {
  buildProbeFromFaces,
  cubeFaceViewProjection,
  type Prd02ProbeBuildOptions
} from "./probeBuild.js";
import type { PrefilterCubeSource, PrefilterResult } from "./workers/cpuPrefilter.js";
import { prefilterCubeGGX, roughnessToLod, lodToRoughness } from "./workers/cpuPrefilter.js";

export { roughnessToLod, lodToRoughness };

export interface GPUPMREMOptions {
  readonly faceSize?: EnvironmentProbe["faceSize"];
  readonly sampleCount?: 16 | 32 | 64;
  readonly minFaceSize?: 16;
  readonly prefilter?: (source: PrefilterCubeSource, samples?: number) => PrefilterResult;
}

type FaceIndex = 0 | 1 | 2 | 3 | 4 | 5;

export class GPUPMREMGenerator {
  private disposed = false;

  constructor(
    private readonly device: RenderDevice,
    private readonly options: GPUPMREMOptions = {}
  ) {}

  private buildOptions(o?: GPUPMREMOptions): Prd02ProbeBuildOptions {
    return {
      prefilter: o?.prefilter ?? this.options.prefilter,
      samples: o?.sampleCount ?? this.options.sampleCount
    };
  }

  private assertAlive(): void {
    if (this.disposed) throw new RenderDeviceError("GPUPMREMGenerator is disposed", "DISPOSED_RESOURCE");
  }

  /** Equirectangular float texture (`data` = Float32 RGBA) → PMREM probe. */
  fromEquirect(source: Texture, options?: GPUPMREMOptions): EnvironmentProbe {
    this.assertAlive();
    const faceSize = options?.faceSize ?? this.options.faceSize ?? 256;
    if (!(source.data instanceof Float32Array)) {
      throw new RenderDeviceError(
        "fromEquirect requires a Texture carrying Float32 RGBA pixels (decode .hdr/.ktx2 first)",
        "ENVIRONMENT_EQUIRECT_SOURCE_UNSUPPORTED",
        { format: source.format, hasSource: source.source != null }
      );
    }
    const faces = equirectToCubeFaces({ width: source.width, height: source.height, data: source.data }, faceSize);
    return buildProbeFromFaces(faces, faceSize, {
      ...this.buildOptions(options), source: "hdri", background: source, label: "env-equirect"
    });
  }

  /** Cube texture with Float32 mip-0 faces → PMREM probe. */
  fromCube(source: Texture, options?: GPUPMREMOptions): EnvironmentProbe {
    this.assertAlive();
    const faceSize = options?.faceSize ?? this.options.faceSize ?? (source.width as EnvironmentProbe["faceSize"]);
    if (source.dimension !== "cube" || source.cubeFaces.length !== 6) {
      throw new RenderDeviceError("fromCube requires a cube Texture with 6 faces", "ENVIRONMENT_CUBE_SOURCE_INVALID");
    }
    const order = ["px", "nx", "py", "ny", "pz", "nz"] as const;
    const faces: Float32Array[] = [];
    for (const name of order) {
      const level = source.cubeFaces.find((cf) => cf.face === name)?.mipLevels[0];
      if (!(level?.data instanceof Float32Array)) {
        throw new RenderDeviceError("fromCube requires Float32 RGBA face pixels", "ENVIRONMENT_CUBE_SOURCE_UNSUPPORTED", { face: name });
      }
      faces.push(level.data);
    }
    return buildProbeFromFaces(faces, faceSize, { ...this.buildOptions(options), source: "hdri", label: "env-cube" });
  }

  /**
   * Render the scene into six RGBA16F faces through the caller's `renderFace`
   * hook (2D targets while Q-01-5 cube render targets are open), then prefilter.
   */
  fromScene(
    renderFace: (face: FaceIndex, target: RenderTarget, viewProjection: Float32Array) => void,
    options?: GPUPMREMOptions & { readonly position?: readonly [number, number, number] }
  ): EnvironmentProbe {
    this.assertAlive();
    const probe = this.device.probe;
    if (!probe?.floatColorBuffer && !probe?.halfFloatColorBuffer) {
      throw new RenderDeviceError(
        "Environment scene capture requires float color buffers (EXT_color_buffer_float); use neutral()/prebaked probes instead",
        "ENVIRONMENT_PROBE_GPU_UNAVAILABLE"
      );
    }
    const size = options?.faceSize ?? this.options.faceSize ?? 128;
    const faces: Float32Array[] = [];
    for (let f = 0; f < 6; f += 1) {
      const target = this.device.createRenderTarget({ width: size, height: size, format: "rgba16f", label: `env-capture-f${f}` });
      const prevTarget = this.device.getRenderTarget?.() ?? null;
      try {
        this.device.setRenderTarget(target);
        renderFace(f as FaceIndex, target, cubeFaceViewProjection(f as FaceIndex, options?.position));
        faces.push(this.device.readFloatPixels(0, 0, size, size));
      } finally {
        this.device.setRenderTarget(prevTarget);
        target.dispose();
      }
    }
    return buildProbeFromFaces(faces, size as EnvironmentProbe["faceSize"], {
      ...this.buildOptions(options), source: "capture", label: "env-capture"
    });
  }

  dispose(): void {
    this.disposed = true;
  }
}
