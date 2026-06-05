export interface ArenaLightCue {
  id: string;
  label: string;
  color: string;
  intensity: number;
  position: [number, number, number];
}

export interface ArenaCameraCue {
  id: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface ArenaHazardCue {
  id: string;
  label: string;
  gameplayEffect: string;
  accessibilityFallback: string;
}

export interface ArenaDefinition {
  id: string;
  name: string;
  tagline: string;
  typedAsset: string;
  visualPillars: string[];
  lightCues: ArenaLightCue[];
  cameraCues: ArenaCameraCue[];
  hazardCues: ArenaHazardCue[];
  posterNotes: string[];
}
