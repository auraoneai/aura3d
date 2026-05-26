export interface ThreeCompatPostProcessFrame {
  readonly label: string;
  readonly exposure: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly bloom: number;
  readonly ambientOcclusion: number;
  readonly sharpness: number;
  readonly blur: number;
  readonly vignette: number;
  readonly outlines: number;
}

export interface ThreeCompatPostProcessPass {
  readonly name: string;
  readonly enabled: boolean;
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame;
}

export function createThreeCompatBaseFrame(label = "source"): ThreeCompatPostProcessFrame {
  return {
    label,
    exposure: 1,
    contrast: 1,
    saturation: 1,
    bloom: 0,
    ambientOcclusion: 0,
    sharpness: 0,
    blur: 0,
    vignette: 0,
    outlines: 0
  };
}
