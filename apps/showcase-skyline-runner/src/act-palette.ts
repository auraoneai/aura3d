import { blendSkyBandColor, planSkyBackdrop, skyBandCountForRamp } from "@aura3d/engine";
import {
  SKYLINE_LEVEL_ACTS,
  SKYLINE_SECTION_COUNT,
  SKYLINE_SECTION_LAYOUTS,
  SKYLINE_SECTION_STRIDE
} from "./level-layout";

export interface SkylineActPalette {
  readonly actIndex: number;
  readonly actId: string;
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
    title: "Home Grove",
    skyRamp: ["#6fa86a", "#2f5a48"],
    skyEmissiveRamp: ["#c8e878", "#4a8058"],
    groundRamp: ["#6fa86a", "#1f4238"],
    groundEmissiveRamp: ["#c8e878", "#2f5848"],
    sceneBackground: "#234636",
    fogColor: "#3d7258",
    fogDensity: 0.042,
    fogIntensity: 0.42,
    ambientLightColor: "#b8ddb0",
    ambientLightIntensity: 0.66,
    keyLightColor: "#ffd59c",
    keyLightIntensity: 1.14,
    checkpointLightColor: "#8ef0c8",
    checkpointLightIntensity: 0.56
  },
  {
    actIndex: 1,
    actId: "broken-canopy",
    title: "Broken Canopy",
    skyRamp: ["#4f7088", "#1a3348"],
    skyEmissiveRamp: ["#7aa0b8", "#2a4860"],
    groundRamp: ["#4f7088", "#142838"],
    groundEmissiveRamp: ["#7aa0b8", "#1e3850"],
    sceneBackground: "#1a2f42",
    fogColor: "#2a4a62",
    fogDensity: 0.058,
    fogIntensity: 0.56,
    ambientLightColor: "#9ec0d8",
    ambientLightIntensity: 0.58,
    keyLightColor: "#c8d4e0",
    keyLightIntensity: 0.92,
    checkpointLightColor: "#72d8f0",
    checkpointLightIntensity: 0.5
  },
  {
    actIndex: 2,
    actId: "sentry-pass",
    title: "Sentry Pass",
    skyRamp: ["#5a7080", "#1c2a38"],
    skyEmissiveRamp: ["#8aa0b0", "#304050"],
    groundRamp: ["#5a7080", "#141e28"],
    groundEmissiveRamp: ["#8aa0b0", "#243038"],
    sceneBackground: "#182430",
    fogColor: "#324858",
    fogDensity: 0.052,
    fogIntensity: 0.54,
    ambientLightColor: "#a8bcc8",
    ambientLightIntensity: 0.54,
    keyLightColor: "#b8c8d8",
    keyLightIntensity: 0.88,
    checkpointLightColor: "#68e0f0",
    checkpointLightIntensity: 0.48
  },
  {
    actIndex: 3,
    actId: "cloudstep-rise",
    title: "Cloudstep Rise",
    skyRamp: ["#6a90b0", "#284868"],
    skyEmissiveRamp: ["#9ec8e8", "#3a6890"],
    groundRamp: ["#6a90b0", "#1e3858"],
    groundEmissiveRamp: ["#9ec8e8", "#2a5078"],
    sceneBackground: "#1e3a58",
    fogColor: "#3a6890",
    fogDensity: 0.038,
    fogIntensity: 0.46,
    ambientLightColor: "#b8d8f0",
    ambientLightIntensity: 0.64,
    keyLightColor: "#d8ecff",
    keyLightIntensity: 1.02,
    checkpointLightColor: "#78f0ff",
    checkpointLightIntensity: 0.58
  },
  {
    actIndex: 4,
    actId: "aurora-crown",
    title: "Aurora Crown",
    skyRamp: ["#7a4898", "#1a3858"],
    skyEmissiveRamp: ["#c878d8", "#3898a8"],
    groundRamp: ["#7a4898", "#142840"],
    groundEmissiveRamp: ["#c878d8", "#2890a0"],
    sceneBackground: "#241840",
    fogColor: "#483878",
    fogDensity: 0.048,
    fogIntensity: 0.52,
    ambientLightColor: "#c8b0e8",
    ambientLightIntensity: 0.6,
    keyLightColor: "#e8a8d8",
    keyLightIntensity: 1.08,
    checkpointLightColor: "#78f8e8",
    checkpointLightIntensity: 0.62
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
}): SkylineSkyBackdropPlan {
  const palette = getSkylineActPalette(options.actIndex);
  const plan = planSkyBackdrop({
    span: options.sceneSpan,
    depth: options.farBackgroundDepth,
    horizonY: options.horizonY,
    height: 20,
    bands: skyBandCountForRamp(...palette.skyRamp),
    belowHorizonHeight: 14,
    belowHorizonBands: skyBandCountForRamp(...palette.groundRamp)
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
