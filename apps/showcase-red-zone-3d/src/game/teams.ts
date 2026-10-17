/**
 * Red Zone 3D — the eight clubs of the Gridiron Series.
 *
 * Each carries a tactical identity (smashmouth / air-raid / option /
 * blitz-heavy / balanced), a weighted play-call table, preferred coverage
 * shells, and a roster strength that scales athlete attributes.
 */
import type { Club } from "./types";

export const CLUBS: readonly Club[] = [
  {
    id: "forge",
    abbr: "IWF",
    name: "Ironwood Forge",
    city: "Pittsburgh",
    identity: "smashmouth",
    colors: { primary: "#f2a71b", secondary: "#1c2430", pants: "#1c2430", helmet: "#1c2430", visor: "#f2a71b", accent: "#ffb224" },
    callWeights: [0.52, 0.33, 0.15],
    defense: [["blitz", 0.35], ["cover3", 0.4], ["man", 0.25]],
    rating: 0.93
  },
  {
    id: "comets",
    abbr: "ACC",
    name: "Aero City Comets",
    city: "Los Angeles",
    identity: "air-raid",
    colors: { primary: "#38bdf8", secondary: "#0c1a2e", pants: "#e8eef6", helmet: "#0c1a2e", visor: "#38bdf8", accent: "#7dfcff" },
    callWeights: [0.14, 0.4, 0.46],
    defense: [["cover2", 0.45], ["man", 0.3], ["cover3", 0.25]],
    rating: 0.9
  },
  {
    id: "wishbone",
    abbr: "WBJ",
    name: "Wishbone Junction",
    city: "Oklahoma",
    identity: "option",
    colors: { primary: "#dc2626", secondary: "#fdf0d5", pants: "#7f1d1d", helmet: "#dc2626", visor: "#fdf0d5", accent: "#ff6b5e" },
    callWeights: [0.58, 0.27, 0.15],
    defense: [["cover3", 0.5], ["blitz", 0.28], ["man", 0.22]],
    rating: 0.84
  },
  {
    id: "steel",
    abbr: "BST",
    name: "Blitzburgh Steel",
    city: "Detroit",
    identity: "blitz-heavy",
    colors: { primary: "#94a3b8", secondary: "#111827", pants: "#334155", helmet: "#111827", visor: "#94a3b8", accent: "#cbd5e1" },
    callWeights: [0.34, 0.4, 0.26],
    defense: [["blitz", 0.62], ["man", 0.24], ["cover2", 0.14]],
    rating: 0.88
  },
  {
    id: "surge",
    abbr: "CSG",
    name: "Coastal Surge",
    city: "Miami",
    identity: "balanced",
    colors: { primary: "#2dd4bf", secondary: "#0f2e3a", pants: "#f0fdfa", helmet: "#0f2e3a", visor: "#2dd4bf", accent: "#5eead4" },
    callWeights: [0.3, 0.45, 0.25],
    defense: [["cover2", 0.4], ["cover3", 0.35], ["man", 0.25]],
    rating: 0.86
  },
  {
    id: "vipers",
    abbr: "NVP",
    name: "Neon Vipers",
    city: "Las Vegas",
    identity: "air-raid",
    colors: { primary: "#c084fc", secondary: "#1e1033", pants: "#2e1065", helmet: "#1e1033", visor: "#c084fc", accent: "#e879f9" },
    callWeights: [0.18, 0.5, 0.32],
    defense: [["man", 0.44], ["cover2", 0.3], ["blitz", 0.26]],
    rating: 0.82
  },
  {
    id: "coyotes",
    abbr: "MCY",
    name: "Mesa Coyotes",
    city: "Phoenix",
    identity: "balanced",
    colors: { primary: "#ea580c", secondary: "#292524", pants: "#44403c", helmet: "#292524", visor: "#ea580c", accent: "#fb923c" },
    callWeights: [0.36, 0.38, 0.26],
    defense: [["cover3", 0.4], ["man", 0.3], ["blitz", 0.3]],
    rating: 0.8
  },
  {
    id: "yetis",
    abbr: "SMY",
    name: "Summit Yetis",
    city: "Denver",
    identity: "smashmouth",
    colors: { primary: "#e2e8f0", secondary: "#1e3a5f", pants: "#1e3a5f", helmet: "#e2e8f0", visor: "#38bdf8", accent: "#93c5fd" },
    callWeights: [0.5, 0.3, 0.2],
    defense: [["cover3", 0.42], ["blitz", 0.33], ["man", 0.25]],
    rating: 0.85
  }
];

export const clubById = (id: string): Club => CLUBS.find((c) => c.id === id) ?? CLUBS[0]!;
