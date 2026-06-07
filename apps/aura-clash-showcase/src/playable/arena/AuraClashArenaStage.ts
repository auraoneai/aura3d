export type AuraClashArenaStageLayer =
  | "backdrop"
  | "lighting"
  | "platform"
  | "atmosphere"
  | "renderer"
  | "overlay";

export interface AuraClashArenaStageElement {
  readonly id: string;
  readonly label: string;
  readonly selector: string;
  readonly layer: AuraClashArenaStageLayer;
  readonly toggleGroup: "backdrop" | "motion" | "particles" | "reflections" | "accessibility" | null;
  readonly evidenceKey: string;
}

export interface AuraClashArenaStageEvidence {
  readonly schemaVersion: "aura-clash-arena-stage/v1";
  readonly elementCount: number;
  readonly namedElementCount: number;
  readonly togglableElementCount: number;
  readonly missingElementIds: readonly string[];
  readonly evidenceBacked: boolean;
  readonly elements: readonly AuraClashArenaStageElement[];
  readonly toggleGroups: readonly string[];
}

export const auraClashArenaStageElements: readonly AuraClashArenaStageElement[] = [
  {
    id: "sky-gradient",
    label: "sky gradient",
    selector: ".aca-sky",
    layer: "backdrop",
    toggleGroup: "backdrop",
    evidenceKey: "stage.skyGradient"
  },
  {
    id: "portal-core",
    label: "central portal core",
    selector: ".aca-portal",
    layer: "lighting",
    toggleGroup: "backdrop",
    evidenceKey: "stage.portalCore"
  },
  {
    id: "downtown-skyline",
    label: "downtown skyline silhouettes",
    selector: ".aca-skyline",
    layer: "backdrop",
    toggleGroup: "backdrop",
    evidenceKey: "stage.downtownSkyline"
  },
  {
    id: "side-banners",
    label: "arena side banners",
    selector: ".aca-banners",
    layer: "backdrop",
    toggleGroup: "backdrop",
    evidenceKey: "stage.sideBanners"
  },
  {
    id: "light-rays",
    label: "volumetric light rays",
    selector: ".aca-rays",
    layer: "lighting",
    toggleGroup: "motion",
    evidenceKey: "stage.lightRays"
  },
  {
    id: "far-fog",
    label: "far fog band",
    selector: ".aca-fog-far",
    layer: "atmosphere",
    toggleGroup: "motion",
    evidenceKey: "stage.farFog"
  },
  {
    id: "drift-fog",
    label: "drifting fog band",
    selector: ".aca-fog-drift",
    layer: "atmosphere",
    toggleGroup: "motion",
    evidenceKey: "stage.driftFog"
  },
  {
    id: "near-fog",
    label: "near fog band",
    selector: ".aca-fog-near",
    layer: "atmosphere",
    toggleGroup: "motion",
    evidenceKey: "stage.nearFog"
  },
  {
    id: "platform-dais",
    label: "combat platform dais",
    selector: ".aca-dais",
    layer: "platform",
    toggleGroup: null,
    evidenceKey: "stage.platformDais"
  },
  {
    id: "svg-platform",
    label: "rim-lit SVG platform",
    selector: ".aca-platform",
    layer: "platform",
    toggleGroup: null,
    evidenceKey: "stage.svgPlatform"
  },
  {
    id: "floor-sheen",
    label: "floor reflection sheen",
    selector: ".aca-floor-sheen",
    layer: "platform",
    toggleGroup: "reflections",
    evidenceKey: "stage.floorSheen"
  },
  {
    id: "particle-canvas",
    label: "ambient particle canvas",
    selector: "#arena-particles",
    layer: "atmosphere",
    toggleGroup: "particles",
    evidenceKey: "stage.particleCanvas"
  },
  {
    id: "renderer-canvas",
    label: "Aura3D renderer canvas",
    selector: "#aura-clash-arena-canvas",
    layer: "renderer",
    toggleGroup: null,
    evidenceKey: "stage.rendererCanvas"
  },
  {
    id: "scanline-overlay",
    label: "scanline overlay",
    selector: ".aca-scanline",
    layer: "overlay",
    toggleGroup: "accessibility",
    evidenceKey: "stage.scanlineOverlay"
  },
  {
    id: "stage-vignette",
    label: "stage vignette",
    selector: ".aca-stage-vignette",
    layer: "overlay",
    toggleGroup: "accessibility",
    evidenceKey: "stage.stageVignette"
  }
];

export function annotateAuraClashArenaStage(root: ParentNode): void {
  for (const element of auraClashArenaStageElements) {
    const target = root.querySelector<HTMLElement>(element.selector);
    if (!target) continue;
    target.dataset.stageElement = element.id;
    target.dataset.stageLayer = element.layer;
    target.dataset.stageEvidence = element.evidenceKey;
    if (element.toggleGroup) target.dataset.stageToggle = element.toggleGroup;
  }
}

export function collectAuraClashArenaStageEvidence(root: ParentNode): AuraClashArenaStageEvidence {
  const missingElementIds = auraClashArenaStageElements
    .filter((element) => !root.querySelector(element.selector))
    .map((element) => element.id);
  const toggleGroups = Array.from(
    new Set(
      auraClashArenaStageElements.flatMap((element) => element.toggleGroup === null ? [] : [element.toggleGroup])
    )
  ).sort();

  return {
    schemaVersion: "aura-clash-arena-stage/v1",
    elementCount: auraClashArenaStageElements.length,
    namedElementCount: auraClashArenaStageElements.filter((element) => element.id && element.label && element.selector).length,
    togglableElementCount: auraClashArenaStageElements.filter((element) => element.toggleGroup !== null).length,
    missingElementIds,
    evidenceBacked: missingElementIds.length === 0 && auraClashArenaStageElements.every((element) => element.evidenceKey.startsWith("stage.")),
    elements: auraClashArenaStageElements,
    toggleGroups
  };
}
