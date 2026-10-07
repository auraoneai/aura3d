// PRD-13 T1.1 — v0 look presets (PRD §7.1 / §7.1.1). Data module only: the 15
// AuraLookPreset entries (11 C-26 AuraBiomeId pass-throughs + 4 C-34
// AuraStudioLookId) with their current-engine v0 expansion values, set by this
// lane. Types come only from PR 0a contract files so this compiles with every
// provider still a stub. v1 expansion (C-36 NodeHandler) lands in T1.13.

import type { AuraColor, AuraVec3 } from "../index.js";
import type { AuraBiomeId } from "../../contracts/world.js"; // C-26 (PRD 10)
import type { AuraPostPresetId } from "../../contracts/post.js"; // C-13 (PRD 03)
import type { AuraLookId } from "../../contracts/looks.js"; // C-34 (PRD 13 provider)

/** §7.1.1 — what a v0 look expands to on today's engine (no contract seam). */
export interface AuraLookV0Expansion {
  /** HDRI in fixtures/environment-corpus/hdri/, copied into template public/ at
   *  scaffold time. null for the §7.1 background-exception looks. */
  readonly hdri: "studio_small_08_1k" | "autumn_field_puresky_1k" | "kloppenheim_06_puresky_1k" | null;
  readonly environmentIntensity: number;
  readonly key: { readonly position: AuraVec3; readonly intensity: number; readonly color: AuraColor; readonly shadow: true };
  readonly rim?: { readonly position: AuraVec3; readonly intensity: number; readonly color: AuraColor };
  readonly fog?: { readonly color: AuraColor; readonly near: number; readonly far: number };
  /** Horizon-matched; never below luma 0.06 unless backgroundException. */
  readonly background: AuraColor;
  readonly effects: readonly ("colorGrade" | "ambientOcclusion" | "bloom" | "antiAlias-msaa")[];
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number };
  readonly renderer: { readonly qualityProfile: "production"; readonly pixelRatio: "min-dpr-2" };
}

/** §7.1 — one look preset record. Frozen; agents can print it via describe(). */
export interface AuraLookPreset {
  readonly id: AuraLookId;
  readonly category: "outdoor" | "interior" | "studio" | "night" | "space" | "underwater";
  /** Non-null → v1 delegates entirely to the C-26 biome rig. */
  readonly biome: AuraBiomeId | null;
  /** Used only when the biome rig has no post spec. */
  readonly post: AuraPostPresetId;
  readonly framing: { readonly subjectHeightFraction: readonly [number, number] };
  readonly palette: { readonly base: readonly [AuraColor, AuraColor, AuraColor]; readonly accent: AuraColor };
  /** §7.1: solid dark background allowed (space, interior-* and dark-night looks). */
  readonly backgroundException: boolean;
  readonly v0: AuraLookV0Expansion;
}

/** Directional key position from sun angles (distance 24, Y up, azimuth CW from +Z). */
function sunPosition(elevationDeg: number, azimuthDeg: number, distance = 24): AuraVec3 {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return [
    Number((distance * Math.cos(el) * Math.sin(az)).toFixed(3)),
    Number((distance * Math.sin(el)).toFixed(3)),
    Number((distance * Math.cos(el) * Math.cos(az)).toFixed(3))
  ];
}

const V0_EFFECTS = ["colorGrade", "ambientOcclusion", "bloom", "antiAlias-msaa"] as const;
const PRODUCTION = { qualityProfile: "production", pixelRatio: "min-dpr-2" } as const;

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function preset(entry: {
  id: AuraLookId;
  category: AuraLookPreset["category"];
  biome: AuraBiomeId | null;
  post: AuraPostPresetId;
  framing?: readonly [number, number];
  palette: readonly [AuraColor, AuraColor, AuraColor];
  accent: AuraColor;
  backgroundException?: boolean;
  v0: Omit<AuraLookV0Expansion, "renderer" | "effects"> &
    Partial<Pick<AuraLookV0Expansion, "effects">>;
}): AuraLookPreset {
  return {
    id: entry.id,
    category: entry.category,
    biome: entry.biome,
    post: entry.post,
    framing: { subjectHeightFraction: entry.framing ?? [0.18, 0.6] },
    palette: { base: entry.palette, accent: entry.accent },
    backgroundException: entry.backgroundException ?? false,
    v0: { effects: [...V0_EFFECTS], ...entry.v0, renderer: { ...PRODUCTION } }
  };
}

function frozenPreset(entry: Parameters<typeof preset>[0]): AuraLookPreset {
  return freezeDeep(preset(entry));
}

/**
 * The 15 v0 looks. Lane-chosen v0 values (T1.1): outdoor ids use
 * autumn_field_puresky_1k, key elevation 48° azimuth 35°, shadow on, fog colour
 * = horizon; golden-hour uses kloppenheim_06_puresky_1k at 12°; studio ids use
 * studio_small_08_1k; night-city/space/underwater/polar-night have hdri null and
 * the §7.1 background exception. No v0 entry emits an ambient light.
 */
export const lookPresets = {
  // ---- C-26 biome pass-throughs -------------------------------------------
  "outdoor-day": frozenPreset({
    id: "outdoor-day",
    category: "outdoor",
    biome: "outdoor-day",
    post: "daylight-outdoor",
    palette: ["#7fa3c2", "#8a9a6a", "#b8b0a0"],
    accent: "#d98e4a",
    v0: {
      hdri: "autumn_field_puresky_1k",
      environmentIntensity: 1.0,
      key: { position: sunPosition(48, 35), intensity: 3.0, color: "#fff2e0", shadow: true },
      fog: { color: "#9db8cf", near: 40, far: 220 },
      background: "#9db8cf",
      grade: { contrast: 1.05, saturation: 1.0, temperature: 0.05 }
    }
  }),
  "golden-hour": frozenPreset({
    id: "golden-hour",
    category: "outdoor",
    biome: "golden-hour",
    post: "cinematic-film",
    palette: ["#b87a4a", "#6b5d4f", "#3d3630"],
    accent: "#ffd08a",
    v0: {
      hdri: "kloppenheim_06_puresky_1k",
      environmentIntensity: 1.0,
      key: { position: sunPosition(12, 35), intensity: 2.6, color: "#ffb46b", shadow: true },
      fog: { color: "#c98a5a", near: 30, far: 180 },
      background: "#c98a5a",
      grade: { contrast: 1.08, saturation: 1.05, temperature: 0.25 }
    }
  }),
  overcast: frozenPreset({
    id: "overcast",
    category: "outdoor",
    biome: "overcast",
    post: "daylight-outdoor",
    palette: ["#8b969e", "#6f7a72", "#9aa3ab"],
    accent: "#c2cfd8",
    v0: {
      hdri: "autumn_field_puresky_1k",
      environmentIntensity: 0.9,
      key: { position: sunPosition(48, 35), intensity: 2.2, color: "#e8edf2", shadow: true },
      fog: { color: "#8f9aa3", near: 25, far: 150 },
      background: "#8f9aa3",
      grade: { contrast: 0.98, saturation: 0.9, temperature: -0.05 }
    }
  }),
  "night-city": frozenPreset({
    id: "night-city",
    category: "night",
    biome: "night-city",
    post: "neon-night",
    palette: ["#1a2233", "#2e3a52", "#10151f"],
    accent: "#ff5fa2",
    backgroundException: true,
    v0: {
      hdri: null,
      environmentIntensity: 0.0,
      key: { position: sunPosition(55, 210), intensity: 0.7, color: "#7d9dd4", shadow: true },
      fog: { color: "#070a12", near: 30, far: 160 },
      background: "#070a12",
      grade: { contrast: 1.1, saturation: 1.05, temperature: -0.1 }
    }
  }),
  "polar-night": frozenPreset({
    id: "polar-night",
    category: "night",
    biome: "polar-night",
    post: "cinematic-film",
    palette: ["#233043", "#3a4d66", "#0d1420"],
    accent: "#7fe8c9",
    backgroundException: true,
    v0: {
      hdri: null,
      environmentIntensity: 0.0,
      key: { position: sunPosition(38, 340), intensity: 0.5, color: "#8fb0d8", shadow: true },
      fog: { color: "#04070d", near: 35, far: 200 },
      background: "#04070d",
      grade: { contrast: 1.05, saturation: 0.95, temperature: -0.2 }
    }
  }),
  "alpine-snow": frozenPreset({
    id: "alpine-snow",
    category: "outdoor",
    biome: "alpine-snow",
    post: "daylight-outdoor",
    palette: ["#c6d4de", "#8fa3b5", "#5c7085"],
    accent: "#e26d5a",
    v0: {
      hdri: "autumn_field_puresky_1k",
      environmentIntensity: 1.1,
      key: { position: sunPosition(48, 35), intensity: 3.2, color: "#f4f8ff", shadow: true },
      fog: { color: "#c6d4de", near: 45, far: 260 },
      background: "#c6d4de",
      grade: { contrast: 1.0, saturation: 0.95, temperature: 0.0 }
    }
  }),
  "interior-warm": frozenPreset({
    id: "interior-warm",
    category: "interior",
    biome: "interior-warm",
    post: "cinematic-film",
    framing: [0.25, 0.7],
    palette: ["#6b4f3a", "#3a2e26", "#8a7057"],
    accent: "#e0a45c",
    backgroundException: true,
    v0: {
      hdri: "studio_small_08_1k",
      environmentIntensity: 0.9,
      key: { position: sunPosition(50, 25), intensity: 2.0, color: "#ffe3c2", shadow: true },
      background: "#1c1712",
      grade: { contrast: 1.05, saturation: 1.0, temperature: 0.15 }
    }
  }),
  "interior-neutral": frozenPreset({
    id: "interior-neutral",
    category: "interior",
    biome: "interior-neutral",
    post: "product-studio",
    framing: [0.25, 0.7],
    palette: ["#5c6470", "#3c414a", "#7d8590"],
    accent: "#8fb0d8",
    backgroundException: true,
    v0: {
      hdri: "studio_small_08_1k",
      environmentIntensity: 1.0,
      key: { position: sunPosition(50, 25), intensity: 1.8, color: "#f2f4f7", shadow: true },
      background: "#17181b",
      grade: { contrast: 1.0, saturation: 1.0, temperature: 0.0 }
    }
  }),
  "interior-industrial": frozenPreset({
    id: "interior-industrial",
    category: "interior",
    biome: "interior-industrial",
    post: "arena-fight",
    framing: [0.25, 0.7],
    palette: ["#4a5057", "#2b2f35", "#6e7a85"],
    accent: "#d97a3a",
    backgroundException: true,
    v0: {
      hdri: "studio_small_08_1k",
      environmentIntensity: 0.85,
      key: { position: sunPosition(55, 20), intensity: 2.0, color: "#e8ecef", shadow: true },
      background: "#101216",
      grade: { contrast: 1.1, saturation: 0.95, temperature: -0.05 }
    }
  }),
  space: frozenPreset({
    id: "space",
    category: "space",
    biome: "space",
    post: "space",
    framing: [0.15, 0.5],
    palette: ["#101524", "#1f2b45", "#05070f"],
    accent: "#9db8ff",
    backgroundException: true,
    v0: {
      hdri: null,
      environmentIntensity: 0.0,
      key: { position: sunPosition(30, 45), intensity: 3.5, color: "#ffffff", shadow: true },
      background: "#000000",
      grade: { contrast: 1.15, saturation: 1.0, temperature: 0.0 }
    }
  }),
  underwater: frozenPreset({
    id: "underwater",
    category: "underwater",
    biome: "underwater",
    post: "underwater",
    framing: [0.2, 0.6],
    palette: ["#0e3542", "#1a5468", "#062831"],
    accent: "#ff8a5c",
    backgroundException: true,
    v0: {
      hdri: null,
      environmentIntensity: 0.0,
      key: { position: sunPosition(60, 30), intensity: 1.6, color: "#9fd4c8", shadow: true },
      fog: { color: "#05202b", near: 5, far: 60 },
      background: "#05202b",
      grade: { contrast: 0.95, saturation: 1.05, temperature: -0.15 }
    }
  }),
  // ---- C-34 studio looks ---------------------------------------------------
  "product-studio": frozenPreset({
    id: "product-studio",
    category: "studio",
    biome: null,
    post: "product-studio",
    framing: [0.45, 0.7],
    palette: ["#3a3f47", "#24272e", "#565d68"],
    accent: "#d9b98a",
    v0: {
      hdri: "studio_small_08_1k",
      environmentIntensity: 1.1,
      key: { position: sunPosition(50, 25), intensity: 2.4, color: "#ffffff", shadow: true },
      background: "#2b2f36",
      grade: { contrast: 1.05, saturation: 1.0, temperature: 0.0 }
    }
  }),
  "character-showcase": frozenPreset({
    id: "character-showcase",
    category: "studio",
    biome: null,
    post: "arena-fight",
    framing: [0.45, 0.7],
    palette: ["#33383f", "#1f2329", "#4a5058"],
    accent: "#e0a45c",
    v0: {
      hdri: "studio_small_08_1k",
      environmentIntensity: 1.0,
      key: { position: sunPosition(50, 25), intensity: 2.2, color: "#fff4e8", shadow: true },
      rim: { position: sunPosition(35, 210), intensity: 1.4, color: "#7d9dd4" },
      background: "#272a31",
      grade: { contrast: 0.95, saturation: 1.0, temperature: 0.05 }
    }
  }),
  "arena-fight": frozenPreset({
    id: "arena-fight",
    category: "studio",
    biome: "interior-industrial",
    post: "arena-fight",
    framing: [0.2, 0.5],
    palette: ["#3d4149", "#21242b", "#596270"],
    accent: "#ff4a3d",
    v0: {
      hdri: "studio_small_08_1k",
      environmentIntensity: 0.85,
      key: { position: sunPosition(60, 30), intensity: 2.2, color: "#f4f6f8", shadow: true },
      rim: { position: sunPosition(40, 200), intensity: 1.6, color: "#ff5fa2" },
      background: "#141519",
      grade: { contrast: 1.15, saturation: 1.05, temperature: -0.05 }
    }
  }),
  "neon-arcade": frozenPreset({
    id: "neon-arcade",
    category: "studio",
    biome: "night-city",
    post: "neon-night",
    framing: [0.15, 0.5],
    palette: ["#141828", "#232c4d", "#0b0e18"],
    accent: "#4de8ff",
    v0: {
      hdri: null,
      environmentIntensity: 0.0,
      key: { position: sunPosition(55, 210), intensity: 0.7, color: "#7d9dd4", shadow: true },
      // night-city fog at half density (§7.1 studio-look definition)
      fog: { color: "#12151c", near: 60, far: 320 },
      background: "#12151c",
      grade: { contrast: 1.15, saturation: 1.15, temperature: -0.1 }
    }
  })
} satisfies Record<AuraLookId, AuraLookPreset>;

Object.freeze(lookPresets);

export const lookPresetIds = Object.keys(lookPresets) as readonly AuraLookId[];
