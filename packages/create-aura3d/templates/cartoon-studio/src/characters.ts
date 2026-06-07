import { AURAVOICE_AURA3D_PROMPT_ANIMATION_CONTRACT_ID } from "./contract";

export const characterContractId = AURAVOICE_AURA3D_PROMPT_ANIMATION_CONTRACT_ID;

export const characters = [
  {
    id: "miko",
    name: "Miko",
    palette: ["#7de2ff", "#f7ffe8"],
    primitiveFallback: "round robot with antenna",
    typedAssetKey: "miko",
    runtimeNodeId: "miko",
    primitiveMouthNodeId: "miko:mouth",
    clipRequirements: ["Idle", "Walking", "Wave", "Talk"],
    performanceChannels: ["body", "facial", "gesture", "blocking", "gaze"],
    glbUpgrade: "After assets add, use model(assets.miko) and keep viseme blendshape metadata."
  },
  {
    id: "luma",
    name: "Luma",
    palette: ["#ffe18e", "#40ffbf"],
    primitiveFallback: "small moon-garden helper",
    typedAssetKey: "luma",
    runtimeNodeId: "luma",
    primitiveMouthNodeId: "luma:mouth",
    clipRequirements: ["Idle", "Walking", "Wave", "Talk"],
    performanceChannels: ["body", "facial", "gesture", "blocking", "gaze"],
    glbUpgrade: "After assets add, use model(assets.luma) and keep viseme blendshape metadata."
  }
] as const;

export interface CartoonStudioCharacterReadiness {
  readonly id: string;
  readonly ok: boolean;
  readonly missingClips: readonly string[];
  readonly mouthReady: boolean;
  readonly gestureReady: boolean;
  readonly diagnostics: readonly string[];
}

export function validateCartoonStudioCharacters(
  entries: readonly typeof characters[number][] = characters,
  options: { readonly requiredClips?: readonly string[] } = {}
): readonly CartoonStudioCharacterReadiness[] {
  const requiredClips = options.requiredClips ?? ["Idle", "Walking", "Wave"];
  return entries.map((character) => {
    const declaredClips = new Set(character.clipRequirements.map((clip) => clip.toLowerCase()));
    const missingClips = requiredClips.filter((clip) => !declaredClips.has(clip.toLowerCase()));
    const mouthReady = Boolean(character.primitiveMouthNodeId);
    const gestureReady = character.performanceChannels.includes("gesture");
    const diagnostics = [
      ...missingClips.map((clip) => `${character.id} missing required clip metadata: ${clip}`),
      ...(mouthReady ? [] : [`${character.id} missing primitive mouth or blendshape metadata`]),
      ...(gestureReady ? [] : [`${character.id} missing gesture performance channel`])
    ];
    return {
      id: character.id,
      ok: diagnostics.length === 0,
      missingClips,
      mouthReady,
      gestureReady,
      diagnostics
    };
  });
}
