import { PBRMaterial, type PBRMaterialOptions } from "../PBRMaterial";
import { createRendererOwnedEvidenceFlag, type CinematicRendererEvidenceFlag } from "./CinematicEvidence";

export type CinematicMaterialPresetId =
  | "wet-pavement"
  | "neon-emissive"
  | "hero-prop-glow"
  | "rain-dark-metal"
  | "cinematic-set-concrete";

export interface CinematicMaterialPreset {
  readonly id: CinematicMaterialPresetId;
  readonly label: string;
  readonly pbr: PBRMaterialOptions;
  readonly rendererOwnedEvidence: CinematicRendererEvidenceFlag;
  readonly approximatedFeatures: readonly string[];
  readonly diagnostics: readonly string[];
}

const MATERIAL_PRESETS: Readonly<Record<CinematicMaterialPresetId, Omit<CinematicMaterialPreset, "rendererOwnedEvidence">>> = {
  "wet-pavement": {
    id: "wet-pavement",
    label: "Wet pavement",
    pbr: {
      name: "cinematic/wet-pavement",
      baseColor: [0.035, 0.04, 0.045, 1],
      metallic: 0,
      roughness: 0.18,
      clearcoatFactor: 0.72,
      clearcoatRoughnessFactor: 0.08,
      environmentMapIntensity: 0.65,
      environmentMapSpecularIntensity: 0.9
    },
    approximatedFeatures: ["screen-space puddle breakup is represented by glossy PBR response until a normal-map texture is bound"],
    diagnostics: ["Wet pavement is renderer-owned PBR material data, not a CSS shine overlay."]
  },
  "neon-emissive": {
    id: "neon-emissive",
    label: "Neon emissive",
    pbr: {
      name: "cinematic/neon-emissive",
      baseColor: [0.05, 0.78, 1, 1],
      metallic: 0,
      roughness: 0.22,
      emissiveColor: [0.05, 0.78, 1],
      emissiveStrength: 4.8
    },
    approximatedFeatures: [],
    diagnostics: ["Neon proof is an emissive renderer material and can drive bloom/practical light evidence."]
  },
  "hero-prop-glow": {
    id: "hero-prop-glow",
    label: "Hero prop glow",
    pbr: {
      name: "cinematic/hero-prop-glow",
      baseColor: [0.42, 0.95, 1, 1],
      metallic: 0,
      roughness: 0.28,
      emissiveColor: [0.18, 0.82, 1],
      emissiveStrength: 2.6,
      clearcoatFactor: 0.25
    },
    approximatedFeatures: ["subsurface scattering is approximated with emissive PBR color"],
    diagnostics: ["Hero prop glow is real material data and must not be replaced by a DOM halo."]
  },
  "rain-dark-metal": {
    id: "rain-dark-metal",
    label: "Rain dark metal",
    pbr: {
      name: "cinematic/rain-dark-metal",
      baseColor: [0.32, 0.34, 0.36, 1],
      metallic: 0.82,
      roughness: 0.24,
      clearcoatFactor: 0.48,
      clearcoatRoughnessFactor: 0.12
    },
    approximatedFeatures: ["water beads require texture/normal detail from the route asset to be fully represented"],
    diagnostics: ["Metal wetness is encoded as PBR parameters."]
  },
  "cinematic-set-concrete": {
    id: "cinematic-set-concrete",
    label: "Cinematic set concrete",
    pbr: {
      name: "cinematic/set-concrete",
      baseColor: [0.23, 0.24, 0.25, 1],
      metallic: 0,
      roughness: 0.62,
      environmentMapIntensity: 0.22,
      environmentMapSpecularIntensity: 0.32
    },
    approximatedFeatures: [],
    diagnostics: ["Set material is renderer-owned PBR scene content."]
  }
};

export function listCinematicMaterialPresets(): readonly CinematicMaterialPreset[] {
  return (Object.keys(MATERIAL_PRESETS) as CinematicMaterialPresetId[]).map(createCinematicMaterialPreset);
}

export function createCinematicMaterialPreset(id: CinematicMaterialPresetId): CinematicMaterialPreset {
  const preset = MATERIAL_PRESETS[id];
  return {
    ...preset,
    rendererOwnedEvidence: createRendererOwnedEvidenceFlag({
      id: `material:${id}`,
      feature: "material",
      label: preset.label,
      source: "renderer-material",
      diagnostics: preset.diagnostics
    })
  };
}

export function createCinematicPBRMaterial(id: CinematicMaterialPresetId, overrides: PBRMaterialOptions = {}): PBRMaterial {
  const preset = createCinematicMaterialPreset(id);
  return new PBRMaterial({
    ...preset.pbr,
    ...overrides,
    name: overrides.name ?? preset.pbr.name
  });
}

export function resolveCinematicMaterialPresetId(tags: readonly string[]): CinematicMaterialPresetId {
  const lower = tags.map((tag) => tag.toLowerCase());
  if (lower.some((tag) => tag.includes("neon") || tag.includes("emissive"))) return "neon-emissive";
  if (lower.some((tag) => tag.includes("flower") || tag.includes("hero") || tag.includes("glow"))) return "hero-prop-glow";
  if (lower.some((tag) => tag.includes("metal") || tag.includes("robot"))) return "rain-dark-metal";
  if (lower.some((tag) => tag.includes("wet") || tag.includes("pavement") || tag.includes("rain"))) return "wet-pavement";
  return "cinematic-set-concrete";
}
