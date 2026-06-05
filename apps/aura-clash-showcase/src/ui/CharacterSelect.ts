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
    silhouetteNotes: "fast forward lean, cropped jacket, electric glove accents",
    typedAsset: "assets.fighterMaraVolt",
  },
  {
    id: "rook-atlas",
    name: "Rook Atlas",
    archetype: "power grappler",
    signatureMove: "Atlas Drop",
    palette: ["#ffd76d", "#251a0a", "#f4eee0"],
    silhouetteNotes: "broad shoulders, heavy boots, grounded stance",
    typedAsset: "assets.fighterRookAtlas",
  },
  {
    id: "nyx-vale",
    name: "Nyx Vale",
    archetype: "agile counter fighter",
    signatureMove: "Shadow Feint",
    palette: ["#9c7dff", "#110d22", "#ecedff"],
    silhouetteNotes: "narrow profile, cloak-like panels, quick offset guard",
    typedAsset: "assets.fighterNyxVale",
  },
  {
    id: "kade-ember",
    name: "Kade Ember",
    archetype: "pressure boxer",
    signatureMove: "Ember Rush",
    palette: ["#ff7448", "#2b0c05", "#fff0df"],
    silhouetteNotes: "raised guard, warm rim glow, compact aggressive stance",
    typedAsset: "assets.fighterKadeEmber",
  },
  {
    id: "sable-iron",
    name: "Sable Iron",
    archetype: "defensive bruiser",
    signatureMove: "Iron Curtain",
    palette: ["#a6b0ba", "#0b1014", "#eff7ff"],
    silhouetteNotes: "armored jacket blocks, wide guard, heavy stance",
    typedAsset: "assets.fighterSableIron",
  },
  {
    id: "jin-flux",
    name: "Jin Flux",
    archetype: "technical stance dancer",
    signatureMove: "Flux Spiral",
    palette: ["#69d9ff", "#061b24", "#f0fbff"],
    silhouetteNotes: "asymmetric stance, long reach, kinetic leg arcs",
    typedAsset: "assets.fighterJinFlux",
  },
];

export function getCharacterSelectState(selectedId = "mara-volt", opponentId = "rook-atlas"): CharacterSelectState {
  return {
    selectedId,
    opponentId,
    cards: characterSelectCards,
  };
}
