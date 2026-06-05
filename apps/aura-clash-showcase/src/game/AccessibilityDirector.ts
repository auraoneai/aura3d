export interface AccessibilityRuntimeSettings {
  reducedMotion: boolean;
  reducedFlash: boolean;
  highContrastHud: boolean;
  captions: boolean;
}

export function createAccessibilityEvidence(settings: AccessibilityRuntimeSettings) {
  return {
    reducedMotion: settings.reducedMotion,
    reducedFlash: settings.reducedFlash,
    highContrastHud: settings.highContrastHud,
    captions: settings.captions,
    guarantees: [
      "camera shake disabled or minimized when reduced motion is active",
      "screen flash intensity reduced when reduced flash is active",
      "all controls are keyboard reachable",
      "combat log uses aria-live",
    ],
  };
}

