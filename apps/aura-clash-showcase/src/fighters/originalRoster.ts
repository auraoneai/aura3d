import type { AuraClashFighterDefinition, AuraClashFighterId } from "./FighterDefinition";
import { jinFlux } from "./definitions/jinFlux";
import { kadeEmber } from "./definitions/kadeEmber";
import { maraVolt } from "./definitions/maraVolt";
import { nyxVale } from "./definitions/nyxVale";
import { rookAtlas } from "./definitions/rookAtlas";
import { sableIron } from "./definitions/sableIron";

export const auraClashOriginalRoster = [
  maraVolt,
  rookAtlas,
  nyxVale,
  kadeEmber,
  sableIron,
  jinFlux
] as const satisfies readonly AuraClashFighterDefinition[];

export const auraClashOriginalRosterIds = auraClashOriginalRoster.map(
  (fighter) => fighter.id
) as readonly AuraClashFighterId[];

export const auraClashOriginalRosterById = Object.freeze(
  auraClashOriginalRoster.reduce((byId, fighter) => {
    byId[fighter.id] = fighter;
    return byId;
  }, {} as Record<AuraClashFighterId, AuraClashFighterDefinition>)
);

export function auraClashOriginalFighterById(
  id: string
): AuraClashFighterDefinition {
  return (
    auraClashOriginalRosterById[id as AuraClashFighterId] ??
    auraClashOriginalRoster[0]
  );
}

