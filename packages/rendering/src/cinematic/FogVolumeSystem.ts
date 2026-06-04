import { createRendererOwnedEvidenceFlag, type CinematicRendererEvidenceFlag } from "./CinematicEvidence";

export interface CinematicFogVolumeSystem {
  readonly id: string;
  readonly mode: "height-fog" | "volume-slices";
  readonly color: readonly [number, number, number];
  readonly density: number;
  readonly heightFalloff: number;
  readonly rendererOwnedEvidence: CinematicRendererEvidenceFlag;
  readonly diagnostics: readonly string[];
}

export function createFogVolumeSystem(options: Partial<Omit<CinematicFogVolumeSystem, "rendererOwnedEvidence" | "diagnostics">> = {}): CinematicFogVolumeSystem {
  const id = options.id ?? "cinematic-fog";
  return {
    id,
    mode: options.mode ?? "height-fog",
    color: options.color ?? [0.22, 0.34, 0.52],
    density: options.density ?? 0.26,
    heightFalloff: options.heightFalloff ?? 0.42,
    rendererOwnedEvidence: createRendererOwnedEvidenceFlag({
      id: `vfx:${id}`,
      feature: "vfx",
      label: "Fog volume system",
      source: "renderer-vfx",
      diagnostics: ["Fog is represented as renderer fog/volume data, not a translucent DOM layer."]
    }),
    diagnostics: ["Fog volume compiled as route-supported renderer atmospheric approximation."]
  };
}
