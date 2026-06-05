import { auraClashOriginalRoster } from "../fighters";

export const auraClashFighters = auraClashOriginalRoster.map((fighter) => ({
  id: fighter.id,
  name: fighter.name,
  callsign: fighter.metadata.callsign,
  title: fighter.metadata.title,
  archetype: fighter.metadata.archetype,
  designPillar: fighter.metadata.designPillar,
  typedAssetMember: fighter.asset.typedAssetMember,
  sourcePath: fighter.asset.sourcePath,
  publicPath: fighter.asset.publicPath,
  palette: fighter.visualProfile.palette,
  routeTags: fighter.routeTags,
}));

export type AuraClashFighterData = (typeof auraClashFighters)[number];

