import {
  SKYLINE_LEVEL_ACTS,
  SKYLINE_SECTION_COUNT,
  SKYLINE_SECTION_LAYOUTS,
  SKYLINE_SECTION_STRIDE
} from "./level-layout";

export type SkylineDistrictId = "steel-dawn" | "hanging-grove" | "crown-heights";

export interface SkylineDistrictDefinition {
  readonly index: number;
  readonly id: SkylineDistrictId;
  readonly title: string;
  readonly actIndexes: readonly number[];
  readonly sections: readonly number[];
  readonly ambienceStem: "ambience-steel" | "ambience-grove" | "ambience-crown";
  readonly silhouette: string;
  readonly landmark: string;
  readonly landmarkNodeIds: readonly string[];
  readonly mechanicEmphasis: string;
}

/**
 * The certified ten-section/five-act course is presented as the PRD's three
 * districts. This layer owns identity only; it never changes collision or
 * progression data.
 */
export const SKYLINE_DISTRICTS: readonly SkylineDistrictDefinition[] = [
  {
    index: 0,
    id: "steel-dawn",
    title: "Steel Dawn",
    actIndexes: [0, 1],
    sections: [0, 1, 2, 3],
    ambienceStem: "ambience-steel",
    silhouette: "cool roof steps, antenna masts, and a relay-crane horizon",
    landmark: "Dawn Relay Crane",
    landmarkNodeIds: ["steel-dawn-crane-mast", "steel-dawn-crane-arm", "steel-dawn-crane-counterweight"],
    mechanicEmphasis: "long readable jumps and the first relay"
  },
  {
    index: 1,
    id: "hanging-grove",
    title: "Hanging Grove",
    actIndexes: [2, 3],
    sections: [4, 5, 6, 7],
    ambienceStem: "ambience-grove",
    silhouette: "suspended garden frames, denser foliage, and warm mist",
    landmark: "Suspended Grove",
    landmarkNodeIds: ["hanging-grove-pier-left", "hanging-grove-pier-right", "hanging-grove-canopy"],
    mechanicEmphasis: "tighter sentry timing and elevated traversal"
  },
  {
    index: 2,
    id: "crown-heights",
    title: "Crown Heights",
    actIndexes: [4],
    sections: [8, 9],
    ambienceStem: "ambience-crown",
    silhouette: "gold sunrise towers and the summit beacon",
    landmark: "Summit Beacon",
    landmarkNodeIds: ["summit-beacon-plinth", "summit-beacon-pedestal", "summit-beacon-mast", "summit-beacon-core"],
    mechanicEmphasis: "final sentry pressure, the longest climb, and finish payoff"
  }
] as const;

export function skylineDistrictIndexForAct(actIndex: number): number {
  const bounded = Math.max(0, Math.min(SKYLINE_LEVEL_ACTS.length - 1, Math.floor(actIndex)));
  return SKYLINE_DISTRICTS.findIndex((district) => district.actIndexes.includes(bounded));
}

export function resolveSkylineDistrictIndex(playerX: number): number {
  const section = Math.max(0, Math.min(
    SKYLINE_SECTION_COUNT - 1,
    Math.floor(Math.max(0, playerX) / SKYLINE_SECTION_STRIDE)
  ));
  const act = SKYLINE_SECTION_LAYOUTS[section]?.act ?? 0;
  return Math.max(0, skylineDistrictIndexForAct(act));
}

export function resolveSkylineDistrict(playerX: number): SkylineDistrictDefinition {
  return SKYLINE_DISTRICTS[resolveSkylineDistrictIndex(playerX)]!;
}

export function skylineDistrictForAct(actIndex: number): SkylineDistrictDefinition {
  return SKYLINE_DISTRICTS[Math.max(0, skylineDistrictIndexForAct(actIndex))]!;
}
