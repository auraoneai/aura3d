export interface AuraClashSaveState {
  selectedFighterId: string;
  opponentFighterId: string;
  reducedMotion: boolean;
  reducedFlash: boolean;
  highContrast: boolean;
  bestRoundSeconds: number | null;
}

const storageKey = "aura-clash-showcase-save-v1";

export const defaultAuraClashSaveState: AuraClashSaveState = {
  selectedFighterId: "mara-volt",
  opponentFighterId: "rook-atlas",
  reducedMotion: false,
  reducedFlash: false,
  highContrast: false,
  bestRoundSeconds: null,
};

export function loadAuraClashSaveState(storage: Storage = window.localStorage): AuraClashSaveState {
  const raw = storage.getItem(storageKey);
  if (!raw) {
    return defaultAuraClashSaveState;
  }

  try {
    return {
      ...defaultAuraClashSaveState,
      ...JSON.parse(raw),
    };
  } catch {
    return defaultAuraClashSaveState;
  }
}

export function saveAuraClashState(state: AuraClashSaveState, storage: Storage = window.localStorage): void {
  storage.setItem(storageKey, JSON.stringify(state));
}
