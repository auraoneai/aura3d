/**
 * C-09 real EnvironmentProbeFactory (PRD-02 §6.2/§8.7): builds EnvironmentProbe
 * objects — PMREM'd specular cube + 9-band SH + optional background texture —
 * from equirect images, cube sources, GPU scene captures, or the analytic
 * RoomEnvironmentScene (the always-available neutral floor).
 *
 * The GPU capture + prefilter chain lives in `GPUPMREMGenerator`; probe
 * assembly lives in `probeBuild.ts` so neither direction creates an import
 * cycle. `fromScene` needs float render targets
 * (`device.probe.floatColorBuffer` / `halfFloatColorBuffer`); callers without
 * them fall back to `neutral()` / prebaked data (PRD §R2).
 */

import type { RenderDevice } from "../RenderDevice.js";
import type { Texture } from "../Texture.js";
import type {
  EnvironmentCaptureRequest,
  EnvironmentProbe,
  EnvironmentProbeFactory
} from "../contracts/environment.js";
import { QUALITY_TIERS, type AuraQualityTier } from "../contracts/quality.js";
import { GPUPMREMGenerator, type GPUPMREMOptions } from "./GPUPMREMGenerator.js";
import { buildProbeFromFaces, buildRoomFaces, type Prd02ProbeBuildOptions } from "./probeBuild.js";

export interface Prd02EnvironmentProbeFactoryOptions {
  readonly prefilter?: Prd02ProbeBuildOptions["prefilter"];
  readonly samples?: number;
  /** Face size used for `fromScene`/`fromEquirect`/`fromCube` when the caller omits `faceSize`. */
  readonly defaultFaceSize?: EnvironmentProbe["faceSize"];
}

export class Prd02EnvironmentProbeFactory implements EnvironmentProbeFactory {
  private readonly pmrem: GPUPMREMGenerator;

  constructor(
    device: RenderDevice,
    private readonly options: Prd02EnvironmentProbeFactoryOptions = {}
  ) {
    this.pmrem = new GPUPMREMGenerator(device, {
      faceSize: options.defaultFaceSize,
      sampleCount: (options.samples as GPUPMREMOptions["sampleCount"]) ?? undefined,
      prefilter: options.prefilter
    });
  }

  fromScene(req: EnvironmentCaptureRequest, o?: { faceSize?: EnvironmentProbe["faceSize"] }): EnvironmentProbe {
    // EnvironmentProbe.faceSize floor is 128; a 64-resolution request still
    // captures at 128 so the returned probe satisfies the contract type.
    return this.pmrem.fromScene(
      (face, target, viewProjection) => req.renderFace(face, target, viewProjection),
      { faceSize: o?.faceSize ?? Math.max(128, req.resolution) as EnvironmentProbe["faceSize"] }
    );
  }

  fromEquirect(src: Texture, o?: { faceSize?: EnvironmentProbe["faceSize"] }): EnvironmentProbe {
    return this.pmrem.fromEquirect(src, { faceSize: o?.faceSize });
  }

  fromCube(src: Texture, o?: { faceSize?: EnvironmentProbe["faceSize"] }): EnvironmentProbe {
    return this.pmrem.fromCube(src, { faceSize: o?.faceSize });
  }

  neutral(tier: AuraQualityTier): EnvironmentProbe {
    const faceSize = QUALITY_TIERS[tier].environmentSize;
    return buildProbeFromFaces(buildRoomFaces(faceSize), faceSize, {
      prefilter: this.options.prefilter,
      samples: this.options.samples,
      source: "neutral",
      label: "env-neutral"
    });
  }
}

/** Slot provider entry for `environmentProbeFactorySlot.provide(...)`. */
export function createEnvironmentProbeFactory(device: RenderDevice): EnvironmentProbeFactory {
  return new Prd02EnvironmentProbeFactory(device);
}
