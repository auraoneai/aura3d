/**
 * IRON CROWN refined venue look (GU47 phase 3, 4.7.1).
 *
 * The blind panel preferred the 4.6.2 frame over the first GU47 look on the Colosseum, the Crown Arena and the Airstrip
 * (judges: sepia/ochre monotone and placeholder backdrop slabs, an orange cast that turned the gi green, see-through
 * backdrop cylinders and a floating jet). The refined look starts from the 4.6.2 scene the judges preferred (its floor
 * deck, dressing and true fighter colours) and fixes what the 4.6.2 frame lacks: a real sky instead of a fogged
 * gradient, less haze, one shadowed sun key placed for modelling, neutral back rims that cut the fighters out of the
 * background, neutral grades (no venue LUT, no orange or sepia cast) and a grounded jet. No far backdrop.
 *
 * The 4.6.2 path (`?look=original`) is unchanged; `?look=gu47` forces this look on these venues.
 */
import type { AuraColor, AuraHdriId, AuraLookOverrides, AuraSceneNode } from "@aura3d/engine";
import type { OriginalLook } from "./originalLook";
import type { StageId } from "./stages";

export interface RefinedVenueLook {
  readonly lookId: OriginalLook["lookId"];
  /** The HDRI: the drawn sky outdoors; on the enclosed Crown it only lights (colour background, `enclosed`). */
  readonly hdri: AuraHdriId;
  /** A colour background keeps the HDRI undrawn (enclosed venue). */
  readonly background?: AuraColor;
  readonly overrides: AuraLookOverrides;
  /** Back rims behind each fighter (RIM_IDS, moved by main.ts): one neutral colour, never the fighter tint. */
  readonly rim: { readonly color: AuraColor; readonly intensity: number };
  /** The 4.6.2 ring key and fill spots, retinted neutral (4.6.2 used the palette warning and aura colours). */
  readonly ringKey: { readonly color: AuraColor; readonly intensity: number };
  readonly ringFill: { readonly color: AuraColor; readonly intensity: number };
  /** The 4.6.2 key light cones (smoke shafts): kept indoors only. */
  readonly cones: boolean;
  readonly vignette: number;
  readonly bloom: { readonly intensity: number; readonly threshold: number };
  /** The Crown's overhead follow-spot (FOLLOW_SPOT_ID, moved by main.ts). */
  readonly followSpot?: { readonly color: AuraColor; readonly intensity: number };
  /** Screen-space floor reflections at High and above. */
  readonly mirror?: number;
  readonly weather?: { readonly type: "snow"; readonly particles: number; readonly streakLimit: number; readonly color: AuraColor };
  readonly prayerFlags?: boolean;
}

export const REFINED_LOOKS: Readonly<Partial<Record<StageId, RefinedVenueLook>>> = {
  "colosseum-ruins": {
    lookId: "outdoor-day",
    hdri: "outdoor-midday",
    overrides: {
      accent: "#e8c98a",
      exposureEv: -0.02,
      fogDensityScale: 0.12,
      environmentIntensity: 0.7,
      environmentRotationDeg: 330,
      sun: { elevationDeg: 32, azimuthDeg: -40 },
      key: { color: "#fff3e2", intensity: 3.4, shadow: { filter: "pcf", mapSize: 2048 } },
      grade: { contrast: 1.18, saturation: 1.1, temperature: 0, tint: 0 }
    },
    rim: { color: "#fff2dc", intensity: 7 },
    ringKey: { color: "#ffe6c4", intensity: 8 },
    ringFill: { color: "#dfe8ff", intensity: 6 },
    cones: false,
    vignette: 0.2,
    bloom: { intensity: 0.2, threshold: 0.9 }
  },
  "crown-arena": {
    lookId: "arena-fight",
    hdri: "studio_small_08",
    background: "#141519",
    overrides: {
      accent: "#ffd76a",
      exposureEv: 0.12,
      fogDensityScale: 0.7,
      environmentIntensity: 0.85,
      grade: { contrast: 1.14, saturation: 1.06, temperature: -0.02, tint: 0 }
    },
    rim: { color: "#d8e6ff", intensity: 10 },
    ringKey: { color: "#ffe9cc", intensity: 9 },
    ringFill: { color: "#e4ecff", intensity: 5 },
    cones: true,
    vignette: 0.22,
    bloom: { intensity: 0.26, threshold: 0.88 },
    followSpot: { color: "#fff1dc", intensity: 22 },
    mirror: 0.3
  },
  "desert-airbase": {
    lookId: "overcast",
    hdri: "autumn_field_puresky",
    overrides: {
      accent: "#ffb03c",
      exposureEv: 0,
      fogDensityScale: 0.24,
      environmentIntensity: 0.75,
      environmentRotationDeg: 200,
      sun: { elevationDeg: 22, azimuthDeg: -52 },
      key: { color: "#ffd2a0", intensity: 3.2, shadow: { filter: "pcf", mapSize: 2048 } },
      grade: { contrast: 1.16, saturation: 1.08, temperature: 0.06, tint: 0 }
    },
    rim: { color: "#fff0dc", intensity: 8 },
    ringKey: { color: "#ffe2bf", intensity: 8 },
    ringFill: { color: "#dde8ff", intensity: 6 },
    cones: false,
    vignette: 0.2,
    bloom: { intensity: 0.22, threshold: 0.9 }
  },
  "himalayan-monastery": {
    lookId: "alpine-snow",
    hdri: "kloppenheim_06_puresky",
    overrides: {
      accent: "#7dd7ff",
      exposureEv: 0.04,
      fogDensityScale: 0.3,
      environmentIntensity: 0.75,
      environmentRotationDeg: 120,
      sun: { elevationDeg: 24, azimuthDeg: 40 },
      key: { color: "#ffe2c4", intensity: 3, shadow: { filter: "pcf", mapSize: 2048 } },
      grade: { contrast: 1.15, saturation: 1.04, temperature: -0.04, tint: 0 }
    },
    rim: { color: "#e6f2ff", intensity: 7 },
    ringKey: { color: "#ffe6c8", intensity: 8 },
    ringFill: { color: "#dceaff", intensity: 6 },
    cones: false,
    vignette: 0.2,
    bloom: { intensity: 0.2, threshold: 0.9 },
    weather: { type: "snow", particles: 360, streakLimit: 40, color: "#f2f6ff" },
    prayerFlags: true
  }
};

export function refinedLook(id: StageId): RefinedVenueLook | undefined {
  return REFINED_LOOKS[id];
}

/** The look overrides of a refined row: its HDRI (drawn as the sky outdoors), no look rim (the back rims replace it). */
export function refinedLookOverrides(row: RefinedVenueLook): AuraLookOverrides {
  return { ...row.overrides, hdri: row.hdri, background: row.background ?? "look", rim: false };
}

/** The airstrip jet sat 0.15 m above the deck (judges: "the jet floats"): parked on the deck. */
export const GROUNDED_PROPS: Readonly<Record<string, number>> = { "ab-jet-center": 0 };

/** The dressing with floating props set down on the deck. */
export function groundDressing(nodes: readonly AuraSceneNode[]): AuraSceneNode[] {
  return nodes.map((node) => {
    const raw = node as { name?: string; transform?: { position?: readonly number[] }; position?: readonly number[] };
    const y = raw.name !== undefined ? GROUNDED_PROPS[raw.name] : undefined;
    if (y === undefined) return node;
    if (raw.transform?.position) {
      const [x, , z] = raw.transform.position;
      return { ...node, transform: { ...raw.transform, position: [x, y, z] } } as unknown as AuraSceneNode;
    }
    if (raw.position) {
      const [x, , z] = raw.position;
      return { ...node, position: [x, y, z] } as unknown as AuraSceneNode;
    }
    return node;
  });
}

/**
 * The 4.6.2 deck's glowing trims as declared practicals (art-direction `emissive-fill`): the same colour and glow, the
 * material only carries `practical: true`.
 */
export function markDeckPracticals(nodes: readonly AuraSceneNode[]): AuraSceneNode[] {
  return nodes.map((node) => {
    const mat = (node as { material?: { emissiveIntensity?: number; practical?: boolean } }).material;
    if (!mat || (mat.emissiveIntensity ?? 0) <= 0.1 || mat.practical === true) return node;
    return { ...node, material: { ...mat, practical: true } } as unknown as AuraSceneNode;
  });
}
