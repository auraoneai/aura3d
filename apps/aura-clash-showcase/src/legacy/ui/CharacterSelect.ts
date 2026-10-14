export interface CharacterSelectCard {
  id: string;
  name: string;
  archetype: string;
  signatureMove: string;
  palette: [string, string, string];
  silhouetteNotes: string;
  typedAsset: string;
}

export interface CharacterSelectState {
  selectedId: string;
  opponentId: string;
  cards: CharacterSelectCard[];
}

export const characterSelectCards: CharacterSelectCard[] = [
  {
    id: "mara-volt",
    name: "Mara Volt",
    archetype: "rushdown striker",
    signatureMove: "Voltage Breaker",
    palette: ["#31ff9f", "#0b2f24", "#f5fff6"],
    silhouetteNotes: "layered ranger armor, asymmetric sash, readable hand and shoulder silhouette",
    typedAsset: "assets.auraClashPlayerRig",
  },
  {
    id: "rook-atlas",
    name: "Rook Atlas",
    archetype: "power grappler",
    signatureMove: "Atlas Drop",
    palette: ["#ffd76d", "#251a0a", "#f4eee0"],
    silhouetteNotes: "layered ranger armor, broad frame, grounded guard and heavy boot silhouette",
    typedAsset: "assets.auraClashRivalRig",
  },
];

export function getCharacterSelectState(selectedId = "mara-volt", opponentId = "rook-atlas"): CharacterSelectState {
  return {
    selectedId,
    opponentId,
    cards: characterSelectCards,
  };
}
