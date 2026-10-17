/**
 * Red Zone 3D — the six venues (5 + 1 exotic per PRD).
 * Palettes drive runtime material re-tints, weather effect toggles,
 * crowd tint, and the thin-air ball modifier for Altitude Bowl.
 */
import type { Stadium } from "./types";

export const STADIUMS: readonly Stadium[] = [
  {
    id: "friday",
    label: "FRIDAY NIGHT LIGHTS",
    blurb: "High-school football under sodium towers — grass, band, and a whole town in the bleachers.",
    turf: "#1b5e28", turfAlt: "#175223", apron: "#103819",
    endzone: "#12355c", endzoneAlt: "#0f2c4c",
    line: "#f7f5ea", hoarding: "#123047", accent: "#ffb224",
    seat: "#263241", crowd: ["#f2a71b", "#38bdf8", "#e8d8b0", "#dc2626", "#3d5a80", "#98c1d9"],
    weather: "clear", night: true, dome: false, thinAir: false, breathFog: false,
    fogColor: "#0a1a12", expo: 1.0
  },
  {
    id: "rustbelt",
    label: "RUST BELT FIELD",
    blurb: "Lake-effect snow flurries on rust-orange turf — breath fog on every huddle.",
    turf: "#1f5c2a", turfAlt: "#184d22", apron: "#123819",
    endzone: "#5c2a10", endzoneAlt: "#4c2310",
    line: "#f4f0e6", hoarding: "#3a332a", accent: "#ff8a3d",
    seat: "#33393f", crowd: ["#f97316", "#9ca3af", "#e2e8f0", "#7c5a3c", "#4a5568"],
    weather: "snow", night: true, dome: false, thinAir: false, breathFog: false,
    fogColor: "#14181c", expo: 1.0
  },
  {
    id: "desert",
    label: "DESERT DOME",
    blurb: "A climate-controlled dome in the sand belt — gold turf walls, dry fast track.",
    turf: "#1d632b", turfAlt: "#175223", apron: "#113b1a",
    endzone: "#7a4a12", endzoneAlt: "#683f10",
    line: "#fbf8ee", hoarding: "#4a3410", accent: "#ffd76a",
    seat: "#3a3324", crowd: ["#d4a373", "#e9c46a", "#f4f1de", "#b08968", "#8a6b45"],
    weather: "indoor", night: false, dome: true, thinAir: false, breathFog: false,
    fogColor: "#1c1608", expo: 1.0
  },
  {
    id: "bayfront",
    label: "BAYFRONT STADIUM",
    blurb: "Open-air bowl on the water — teal end zones, gull-bright hard whites.",
    turf: "#1b5e28", turfAlt: "#164f21", apron: "#103819",
    endzone: "#0e5a68", endzoneAlt: "#0c4c58",
    line: "#f7fbf7", hoarding: "#0e3444", accent: "#5eead4",
    seat: "#1f3a4a", crowd: ["#2dd4bf", "#94a3b8", "#e0fbfc", "#ee6c4d", "#3d5a80"],
    weather: "rain", night: true, dome: false, thinAir: false, breathFog: false,
    fogColor: "#0c1a22", expo: 1.0
  },
  {
    id: "neon",
    label: "NEON METRO DOME",
    blurb: "Closed-roof neon cauldron — dark turf, magenta-cyan signage, wet sheen.",
    turf: "#185424", turfAlt: "#14471e", apron: "#0e3316",
    endzone: "#3c1a5c", endzoneAlt: "#2e1448",
    line: "#eaf7ff", hoarding: "#1a1030", accent: "#e879f9",
    seat: "#18142a", crowd: ["#7c3aed", "#38bdf8", "#f472b6", "#c084fc", "#64748b"],
    weather: "indoor", night: true, dome: true, thinAir: false, breathFog: false,
    fogColor: "#0c0816", expo: 0.98
  },
  {
    id: "altitude",
    label: "ALTITUDE BOWL",
    blurb: "A mile high — thin-air long-ball festival under crisp mountain dusk.",
    turf: "#1b5e28", turfAlt: "#175223", apron: "#103819",
    endzone: "#2a3a6e", endzoneAlt: "#22305c",
    line: "#f4f8ff", hoarding: "#1e2a44", accent: "#93c5fd",
    seat: "#2a3444", crowd: ["#93c5fd", "#e2e8f0", "#64748b", "#a5b4fc", "#7dd3fc"],
    weather: "clear", night: true, dome: false, thinAir: true, breathFog: false,
    fogColor: "#101828", expo: 1.0
  }
];

export const stadiumById = (id: string): Stadium => STADIUMS.find((s) => s.id === id) ?? STADIUMS[0]!;
