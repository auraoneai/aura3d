import type { FighterMoveKit } from "./FighterMoveProfile";
import type { FighterComboTuning, FighterStats } from "./FighterStats";
import type { FighterVisualProfile } from "./FighterVisualProfile";

export const auraClashFighterIds = [
  "mara",
  "rook",
  "nyx",
  "kade",
  "sable",
  "jin"
] as const;

export type AuraClashFighterId = (typeof auraClashFighterIds)[number];

export const auraClashFighterAssetKeys = {
  mara: "fighterMaraVolt",
  rook: "fighterRookAtlas",
  nyx: "fighterNyxVale",
  kade: "fighterKadeEmber",
  sable: "fighterSableIron",
  jin: "fighterJinFlux"
} as const satisfies Record<AuraClashFighterId, string>;

export type AuraClashFighterAssetKey =
  (typeof auraClashFighterAssetKeys)[AuraClashFighterId];

export type FighterMetadata = Readonly<{
  slot: 1 | 2 | 3 | 4 | 5 | 6;
  callsign: string;
  title: string;
  slug: string;
  rosterGroup: "Aura Clash Originals";
  role: "V1 playable fighter";
  archetype: string;
  designPillar: string;
}>;

export type FighterAssetReference = Readonly<{
  fighter: AuraClashFighterAssetKey;
  cliAssetName: AuraClashFighterAssetKey;
  typedAssetMember: `assets.${AuraClashFighterAssetKey}`;
  sourcePath: `apps/aura-clash-showcase/assets/source/fighters/${string}.glb`;
  publicPath: `apps/aura-clash-showcase/public/aura-assets/${string}.glb`;
  provenanceStatus: "generated-registered" | "cli-imported" | "license-approved";
  url: null;
  safeUsage: string;
}>;

export type FighterRouteTag =
  | "playable"
  | "evidence"
  | "accessibility"
  | "deploy"
  | "poster"
  | "home";

export type FighterContentNote = Readonly<{
  rule:
    | "original-ip"
    | "typed-asset"
    | "non-lethal-arcade"
    | "readable-hud"
    | "reduced-flash-safe";
  note: string;
}>;

export type AuraClashFighterDefinition = Readonly<{
  id: AuraClashFighterId;
  name: string;
  metadata: FighterMetadata;
  asset: FighterAssetReference;
  stats: FighterStats;
  comboTuning: FighterComboTuning;
  visualProfile: FighterVisualProfile;
  moveKit: FighterMoveKit;
  routeTags: readonly FighterRouteTag[];
  contentNotes: readonly FighterContentNote[];
}>;

export function fighterAssetReference(
  id: AuraClashFighterId,
  fileSlug: string
): FighterAssetReference {
  const assetKey = auraClashFighterAssetKeys[id];
  return {
    fighter: assetKey,
    cliAssetName: assetKey,
    typedAssetMember: `assets.${assetKey}`,
    sourcePath: `apps/aura-clash-showcase/assets/source/fighters/${fileSlug}.glb`,
    publicPath: `apps/aura-clash-showcase/public/aura-assets/${fileSlug}.glb`,
    provenanceStatus: "generated-registered",
    url: null,
    safeUsage:
      `Resolve through generated aura-assets.ts and pass ${`assets.${assetKey}`} to model() through the typed Aura3D asset manifest.`
  };
}

