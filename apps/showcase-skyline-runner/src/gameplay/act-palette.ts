import { blendSkyBandColor, planSkyBackdrop, skyBandCountForRamp } from "@aura3d/engine";
import {
  SKYLINE_LEVEL_ACTS,
  SKYLINE_SECTION_COUNT,
  SKYLINE_SECTION_LAYOUTS,
  SKYLINE_SECTION_STRIDE
} from "./level-layout";
import { skylineDistrictForAct, type SkylineDistrictId } from "./districts";

export interface SkylineActPalette {
  readonly actIndex: number;
  readonly actId: string;
  readonly districtId: SkylineDistrictId;
  readonly districtTitle: string;
  readonly title: string;
  readonly skyRamp: readonly [string, string];
  readonly skyEmissiveRamp: readonly [string, string];
  readonly groundRamp: readonly [string, string];
  readonly groundEmissiveRamp: readonly [string, string];
  readonly sceneBackground: string;
  readonly fogColor: string;
  readonly fogDensity: number;
  readonly fogIntensity: number;
  readonly ambientLightColor: string;
  readonly ambientLightIntensity: number;
  readonly keyLightColor: string;
  readonly keyLightIntensity: number;
  readonly checkpointLightColor: string;
  readonly checkpointLightIntensity: number;
}

const ACT_PALETTES: readonly SkylineActPalette[] = [
  {
    actIndex: 0,
    actId: "home-grove",
    districtId: "steel-dawn",
    districtTitle: "Steel Dawn",
    title: "Home Grove",
    // Steel Dawn is a nocturne: the first frame needs a deep value floor so the
    // coral hero, cyan relays, and snow-capped typed world do not wash together.
    // Steel Dawn is a restrained blue-hour district. The old cyan ramp turned
    // the whole frame into a stack of luminous aqua stripes and erased the
    // warm hero silhouette. Keep the horizon blue enough to separate the typed
    // trees, then fall quickly into ink so the world, not the backdrop, owns the
    // visual hierarchy.
    skyRamp: ["#1d3c59", "#070b1b"],
    skyEmissiveRamp: ["#254f61", "#090f25"],
    // Match the ground's horizon colour to the sky's horizon colour without
    // making the lower half a second bright panel. The nadir is nearly black,
    // giving the platforms a deliberate stage instead of an empty cyan floor.
    groundRamp: ["#1b3945", "#050a14"],
    groundEmissiveRamp: ["#21534f", "#070e1b"],
    sceneBackground: "#050916",
    fogColor: "#0a1728",
    fogDensity: 0.009,
    fogIntensity: 0.12,
    ambientLightColor: "#91a9bd",
    ambientLightIntensity: 0.36,
    keyLightColor: "#ffc39d",
    keyLightIntensity: 1.08,
    checkpointLightColor: "#70ddd1",
    checkpointLightIntensity: 0.68
  },
  {
    actIndex: 1,
    actId: "emerald-canopy",
    districtId: "steel-dawn",
    districtTitle: "Steel Dawn",
    title: "Emerald Canopy",
    skyRamp: ["#0e7490", "#07111f"],
    skyEmissiveRamp: ["#67e8f9", "#164e63"],
    groundRamp: ["#155e75", "#030712"],
    groundEmissiveRamp: ["#22d3ee", "#0c2438"],
    sceneBackground: "#07111f",
    fogColor: "#0b1e32",
    fogDensity: 0.026,
    fogIntensity: 0.44,
    ambientLightColor: "#bae6fd",
    ambientLightIntensity: 0.76,
    keyLightColor: "#67e8f9",
    keyLightIntensity: 1.36,
    checkpointLightColor: "#22d3ee",
    checkpointLightIntensity: 0.75
  },
  {
    actIndex: 2,
    actId: "amber-bastion",
    districtId: "hanging-grove",
    districtTitle: "Hanging Grove",
    title: "Amber Bastion",
    skyRamp: ["#9a6b32", "#10251f"],
    skyEmissiveRamp: ["#f0c878", "#14532d"],
    groundRamp: ["#3f6b47", "#081a15"],
    groundEmissiveRamp: ["#86c56f", "#163d27"],
    sceneBackground: "#0b1b16",
    fogColor: "#3a3321",
    fogDensity: 0.028,
    fogIntensity: 0.48,
    ambientLightColor: "#d9f99d",
    ambientLightIntensity: 0.75,
    keyLightColor: "#f0c878",
    keyLightIntensity: 1.35,
    checkpointLightColor: "#a7f3d0",
    checkpointLightIntensity: 0.75
  },
  {
    actIndex: 3,
    actId: "violet-nebula",
    districtId: "hanging-grove",
    districtTitle: "Hanging Grove",
    title: "Violet Nebula",
    skyRamp: ["#b77945", "#17352a"],
    skyEmissiveRamp: ["#f4cf91", "#166534"],
    groundRamp: ["#4d7c5b", "#0b2118"],
    groundEmissiveRamp: ["#a3d977", "#23563a"],
    sceneBackground: "#10261d",
    fogColor: "#59452e",
    fogDensity: 0.025,
    fogIntensity: 0.46,
    ambientLightColor: "#ecfccb",
    ambientLightIntensity: 0.78,
    keyLightColor: "#f4cf91",
    keyLightIntensity: 1.4,
    checkpointLightColor: "#86efac",
    checkpointLightIntensity: 0.8
  },
  {
    actIndex: 4,
    actId: "aurora-crown",
    districtId: "crown-heights",
    districtTitle: "Crown Heights",
    title: "Aurora Crown",
    skyRamp: ["#f59e0b", "#7c2d3e"],
    skyEmissiveRamp: ["#fde68a", "#fb7185"],
    groundRamp: ["#b45309", "#4c1d2f"],
    groundEmissiveRamp: ["#fbbf24", "#9f1239"],
    sceneBackground: "#2a1019",
    fogColor: "#5c2a2f",
    fogDensity: 0.025,
    fogIntensity: 0.52,
    ambientLightColor: "#fef3c7",
    ambientLightIntensity: 0.82,
    keyLightColor: "#fbbf24",
    keyLightIntensity: 1.45,
    checkpointLightColor: "#fde68a",
    checkpointLightIntensity: 0.85
  }
] as const;

export function getSkylineActPalette(actIndex: number): SkylineActPalette {
  return ACT_PALETTES[Math.max(0, Math.min(ACT_PALETTES.length - 1, actIndex))]!;
}

export function resolveSkylineActIndex(playerX: number): number {
  const sectionIndex = Math.max(0, Math.min(
    SKYLINE_SECTION_COUNT - 1,
    Math.floor(Math.max(0, playerX) / SKYLINE_SECTION_STRIDE)
  ));
  return SKYLINE_SECTION_LAYOUTS[sectionIndex]?.act ?? 0;
}

export function resolveSkylineAct(playerX: number): (typeof SKYLINE_LEVEL_ACTS)[number] {
  return SKYLINE_LEVEL_ACTS[resolveSkylineActIndex(playerX)]!;
}

export function skylineActPaletteSignature(palette: SkylineActPalette): string {
  return [
    palette.actId,
    palette.skyRamp[0],
    palette.skyRamp[1],
    palette.fogColor,
    palette.keyLightColor
  ].join("|");
}

export function skylineDistrictPaletteSignature(actIndex: number): string {
  const district = skylineDistrictForAct(actIndex);
  const palette = getSkylineActPalette(district.actIndexes[0] ?? actIndex);
  return [
    district.id,
    palette.skyRamp[0],
    palette.skyRamp[1],
    palette.groundRamp[0],
    palette.fogColor,
    palette.keyLightColor
  ].join("|");
}

export interface SkylineSkyBackdropPlan {
  readonly palette: SkylineActPalette;
  readonly plan: ReturnType<typeof planSkyBackdrop>;
  readonly bandColors: readonly { readonly side: "sky" | "ground"; readonly color: string; readonly emissive: string; readonly emissiveIntensity: number; readonly centerY: number; readonly z: number; readonly width: number; readonly height: number }[];
}

export function planSkylineActBackdrop(options: {
  readonly actIndex: number;
  readonly sceneSpan: readonly [number, number];
  readonly horizonY: number;
  readonly farBackgroundDepth: number;
  /** Exact showcase-review framing needs a taller, finer backdrop than gameplay. */
  readonly reviewCapture?: boolean;
}): SkylineSkyBackdropPlan {
  const palette = getSkylineActPalette(options.actIndex);
  const plan = planSkyBackdrop({
    span: options.sceneSpan,
    depth: options.farBackgroundDepth,
    horizonY: options.horizonY,
    height: 20,
    // The exact review lens needs quieter steps and a taller lower field. Keep
    // the mounted gameplay route on the reusable default density: multiplying
    // every band across all five authored acts increased the production scene
    // by hundreds of permanently-mounted quads even though four acts are hidden.
    bands: skyBandCountForRamp(...palette.skyRamp, options.reviewCapture ? 2 : 8),
    belowHorizonHeight: options.reviewCapture ? 28 : 14,
    belowHorizonBands: skyBandCountForRamp(...palette.groundRamp, options.reviewCapture ? 2 : 8)
  });
  const bandColors = plan.bands.map((band) => {
    const colorRamp = band.side === "sky" ? palette.skyRamp : palette.groundRamp;
    const emissiveRamp = band.side === "sky" ? palette.skyEmissiveRamp : palette.groundEmissiveRamp;
    return {
      side: band.side,
      color: blendSkyBandColor(colorRamp[0], colorRamp[1], band.blend),
      emissive: blendSkyBandColor(emissiveRamp[0], emissiveRamp[1], band.blend),
      emissiveIntensity: band.emissiveIntensity,
      centerY: band.centerY,
      z: band.z,
      width: band.width,
      height: band.height
    };
  });
  return { palette, plan, bandColors };
}
