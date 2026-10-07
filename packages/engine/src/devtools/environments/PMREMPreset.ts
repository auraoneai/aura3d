export interface ThreeCompatPMREMPreset {
  readonly faceSize: number;
  readonly mipCount: number;
  readonly cacheKey: string;
}

export interface ThreeCompatPMREMDiagnostics {
  readonly cacheKey: string;
  readonly faceSize: number;
  readonly mipCount: number;
  readonly estimatedBytes: number;
  readonly warnings: readonly string[];
}

export function createThreeCompatPMREMDiagnostics(pmrem: ThreeCompatPMREMPreset, format: string): ThreeCompatPMREMDiagnostics {
  const bytesPerPixel = format === "rgbe-hdr" ? 4 : 8;
  const estimatedBytes = Array.from({ length: pmrem.mipCount }, (_, mip) => {
    const size = Math.max(1, pmrem.faceSize >> mip);
    return 6 * size * size * bytesPerPixel;
  }).reduce((total, bytes) => total + bytes, 0);

  return {
    ...pmrem,
    estimatedBytes,
    warnings: [
      ...(pmrem.faceSize < 256 ? ["PMREM face size is below ThreeCompat flagship quality floor."] : []),
      ...(pmrem.mipCount < 8 ? ["PMREM mip count is below ThreeCompat roughness coverage floor."] : [])
    ]
  };
}
