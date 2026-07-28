import { auraClashRenderedStageLabels } from "./RenderedArenaStage";

export type AuraClashArenaStageLayer =
  | "typed-asset"
  | "platform"
  | "backdrop"
  | "lighting"
  | "atmosphere";

export interface AuraClashArenaStageElement {
  readonly id: string;
  readonly label: string;
  readonly renderLabel: string;
  readonly layer: AuraClashArenaStageLayer;
  readonly toggleGroup: "backdrop" | "motion" | "particles" | "reflections" | null;
  readonly evidenceKey: string;
  readonly implementation: "production-runtime-render-item";
}

export interface AuraClashArenaStageEvidence {
  readonly schemaVersion: "aura-clash-arena-stage/v2";
  readonly rendererOwner: "production-runtime";
  readonly domSceneElementCount: 0;
  readonly elementCount: number;
  readonly namedElementCount: number;
  readonly togglableElementCount: number;
  readonly missingElementIds: readonly string[];
  readonly evidenceBacked: boolean;
  readonly elements: readonly AuraClashArenaStageElement[];
  readonly toggleGroups: readonly string[];
}

const element = (
  id: string,
  label: string,
  renderLabel: string,
  layer: AuraClashArenaStageLayer,
  toggleGroup: AuraClashArenaStageElement["toggleGroup"]
): AuraClashArenaStageElement => ({
  id,
  label,
  renderLabel,
  layer,
  toggleGroup,
  evidenceKey: `renderedStage.${id}`,
  implementation: "production-runtime-render-item"
});

export const auraClashArenaStageElements: readonly AuraClashArenaStageElement[] = [
  element("combat-floor", "rendered combat floor", "combat-floor", "platform", null),
  element("arena-rims", "rendered arena rim lights", "front-rim", "lighting", "reflections"),
  element("center-line", "rendered center-line marker", "center-line", "platform", null),
  element("portal-segments", "rendered segmented energy portal", "portal-segments", "lighting", "backdrop"),
  element("portal-motion", "rendered portal motion", "portal-segments", "lighting", "motion"),
  element("skyline-buildings", "rendered downtown skyline geometry", "skyline-buildings", "backdrop", "backdrop"),
  element("side-banners", "rendered side banners", "side-banners", "backdrop", null),
  element("light-pillars", "rendered arena light pillars", "light-pillars", "lighting", null),
  element("atmospheric-motes", "rendered atmospheric motes", "atmospheric-motes", "atmosphere", "particles"),
  element("floor-sheen", "rendered floor sheen", "floor-sheen", "platform", "reflections")
];

export function annotateAuraClashArenaStage(root: ParentNode): void {
  const canvas = root.querySelector<HTMLElement>("#aura-clash-arena-canvas");
  if (!canvas) return;
  canvas.dataset.stageElement = "production-runtime-stage";
  canvas.dataset.stageLayer = "renderer";
  canvas.dataset.stageEvidence = "renderedStage.productionRuntimeCanvas";
}

export function collectAuraClashArenaStageEvidence(_root: ParentNode): AuraClashArenaStageEvidence {
  const renderedLabels = new Set<string>(auraClashRenderedStageLabels);
  const missingElementIds = auraClashArenaStageElements
    .filter((entry) => !renderedLabels.has(entry.renderLabel as (typeof auraClashRenderedStageLabels)[number]))
    .map((entry) => entry.id);
  const toggleGroups = Array.from(new Set(auraClashArenaStageElements.flatMap((entry) => entry.toggleGroup ? [entry.toggleGroup] : []))).sort();
  return {
    schemaVersion: "aura-clash-arena-stage/v2",
    rendererOwner: "production-runtime",
    domSceneElementCount: 0,
    elementCount: auraClashArenaStageElements.length,
    namedElementCount: auraClashArenaStageElements.length,
    togglableElementCount: auraClashArenaStageElements.filter((entry) => entry.toggleGroup !== null).length,
    missingElementIds,
    evidenceBacked: missingElementIds.length === 0,
    elements: auraClashArenaStageElements,
    toggleGroups
  };
}
