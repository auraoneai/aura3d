import { createStageDirectorPlan } from "../game";

export const auraClashStages = [
  {
    ...createStageDirectorPlan(),
    title: "Neon Downtown Rooftop",
    typedAssetMember: "assets.auraClashDuelStage",
    assetProof: "auraClashDuelStage GLB composes combat lane, nonblocking skyline, signage, lighting anchors, and screenshot-safe stage depth.",
  },
] as const;

export type AuraClashStageData = (typeof auraClashStages)[number];

