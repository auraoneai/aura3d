export type AuraClashArenaPalette = "holo" | "cyber" | "ember" | "void";
export type AuraClashArenaBackdrop = "all" | "skyline" | "portal";
export type AuraClashArenaMotion = "subtle" | "static" | "lively";

export interface AuraClashArenaTweaksState {
  readonly palette: AuraClashArenaPalette;
  readonly backdrop: AuraClashArenaBackdrop;
  readonly fogDensity: number;
  readonly motion: AuraClashArenaMotion;
  readonly particles: boolean;
  readonly reflections: boolean;
}

export interface AuraClashArenaTweaksEvidence {
  readonly schemaVersion: "aura-clash-arena-tweaks/v1";
  readonly includedInEvidence: true;
  readonly affectsDeterministicReplay: false;
  readonly deterministicReplayInputs: readonly string[];
  readonly visualOnlyControls: readonly string[];
  readonly state: AuraClashArenaTweaksState;
}

export const defaultAuraClashArenaTweaks: AuraClashArenaTweaksState = {
  palette: "holo",
  backdrop: "all",
  fogDensity: 0.58,
  motion: "subtle",
  particles: true,
  reflections: true
};

export const auraClashArenaVisualOnlyControls = [
  "palette",
  "backdrop",
  "fogDensity",
  "motion",
  "particles",
  "reflections"
] as const;

export function collectArenaTweaksState(root: ParentNode): AuraClashArenaTweaksState {
  const shell = root.querySelector<HTMLElement>(".aca");
  const fogInput = root.querySelector<HTMLInputElement>("#arena-fog");

  return {
    palette: coercePalette(shell?.dataset.palette),
    backdrop: coerceBackdrop(shell?.dataset.backdrop),
    fogDensity: coerceFogDensity(fogInput?.value ?? shell?.style.getPropertyValue("--aca-fog")),
    motion: coerceMotion(shell?.dataset.motion),
    particles: shell ? !shell.classList.contains("aca-no-particles") : defaultAuraClashArenaTweaks.particles,
    reflections: shell ? !shell.classList.contains("aca-no-reflections") : defaultAuraClashArenaTweaks.reflections
  };
}

export function createArenaTweaksEvidence(root: ParentNode): AuraClashArenaTweaksEvidence {
  return {
    schemaVersion: "aura-clash-arena-tweaks/v1",
    includedInEvidence: true,
    affectsDeterministicReplay: false,
    deterministicReplayInputs: ["game.inputReplay", "game.runSimulation", "moveData", "roundRules"],
    visualOnlyControls: auraClashArenaVisualOnlyControls,
    state: collectArenaTweaksState(root)
  };
}

function coercePalette(value: string | undefined): AuraClashArenaPalette {
  return value === "cyber" || value === "ember" || value === "void" ? value : "holo";
}

function coerceBackdrop(value: string | undefined): AuraClashArenaBackdrop {
  return value === "skyline" || value === "portal" ? value : "all";
}

function coerceMotion(value: string | undefined): AuraClashArenaMotion {
  return value === "static" || value === "lively" ? value : "subtle";
}

function coerceFogDensity(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultAuraClashArenaTweaks.fogDensity;
  return Math.max(0.15, Math.min(1, Number(parsed.toFixed(2))));
}
