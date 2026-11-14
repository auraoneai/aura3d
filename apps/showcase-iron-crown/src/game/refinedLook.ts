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
  /**
   * Phase 4 (4.7.2): the spawn disc under each fighter. The 4.6.2 disc is near-black, so the fighters' cast and contact
   * shadows landed on black and never read; a mid-tone disc lets them read.
   */
  readonly spawnDisc?: AuraColor;
  /** Phase 4: contact-shadow strength and reach under the fighters (default 0.8 / 0.3). */
  readonly contact?: { readonly intensity: number; readonly length: number };
}

export const REFINED_LOOKS: Readonly<Partial<Record<StageId, RefinedVenueLook>>> = {
  "colosseum-ruins": {
    lookId: "outdoor-day",
    hdri: "outdoor-midday",
    overrides: {
      accent: "#e8c98a",
      exposureEv: -0.02,
      fogDensityScale: 0.15,
      fog: {
        color: "#c9a46a",
        near: 120,
        far: 380,
        height: { mode: "linear", near: 120, far: 380, maxOpacity: 0.16, affectsBackground: false }
      },
      environmentIntensity: 0.32,
      environmentRotationDeg: 330,
      sun: { elevationDeg: 34, azimuthDeg: -62 },
      key: { color: "#fff3e2", intensity: 11, shadow: { filter: "pcf", mapSize: 2048 } },
      grade: { contrast: 1.18, saturation: 1.1, temperature: 0, tint: 0 }
    },
    rim: { color: "#fff2dc", intensity: 7 },
    ringKey: { color: "#ffe6c4", intensity: 3 },
    ringFill: { color: "#dfe8ff", intensity: 2.5 },
    spawnDisc: "#8d8274",
    contact: { intensity: 1, length: 0.45 },
    cones: false,
    vignette: 0.2,
    bloom: { intensity: 0.18, threshold: 1.12 }
  },
  "crown-arena": {
    lookId: "arena-fight",
    hdri: "warm_bar",
    background: "#141519",
    overrides: {
      accent: "#ffd76a",
      exposureEv: 0.02,
      fogDensityScale: 0.15,
      fog: {
        color: "#0d0b11",
        near: 95,
        far: 300,
        height: { mode: "linear", near: 95, far: 300, maxOpacity: 0.16, affectsBackground: false }
      },
      environmentIntensity: 0.52,
      grade: { contrast: 1.22, saturation: 1.08, temperature: -0.02, tint: 0 }
    },
    rim: { color: "#d8ebff", intensity: 9.5 },
    ringKey: { color: "#ffe4b8", intensity: 4 },
    ringFill: { color: "#d8e6ff", intensity: 2.3 },
    cones: true,
    vignette: 0.24,
    bloom: { intensity: 0.2, threshold: 1.18 },
    followSpot: { color: "#ffe8c6", intensity: 26 },
    mirror: 0.16,
    spawnDisc: "#28222b",
    contact: { intensity: 1, length: 0.45 }
  },
  "desert-airbase": {
    lookId: "overcast",
    hdri: "autumn_field_puresky",
    overrides: {
      accent: "#ffb03c",
      exposureEv: 0,
      fogDensityScale: 0.15,
      fog: {
        color: "#b8724a",
        near: 115,
        far: 360,
        height: { mode: "linear", near: 115, far: 360, maxOpacity: 0.16, affectsBackground: false }
      },
      environmentIntensity: 0.62,
      environmentRotationDeg: 200,
      sun: { elevationDeg: 26, azimuthDeg: -64 },
      key: { color: "#ffd2a0", intensity: 4.4, shadow: { filter: "pcf", mapSize: 2048 } },
      grade: { contrast: 1.16, saturation: 1.08, temperature: 0.06, tint: 0 }
    },
    rim: { color: "#fff0dc", intensity: 8 },
    ringKey: { color: "#ffe2bf", intensity: 3 },
    ringFill: { color: "#dde8ff", intensity: 2.5 },
    spawnDisc: "#9a8a72",
    contact: { intensity: 1, length: 0.45 },
    cones: false,
    vignette: 0.2,
    bloom: { intensity: 0.2, threshold: 1.12 }
  },
  "himalayan-monastery": {
    lookId: "alpine-snow",
    hdri: "kloppenheim_06_puresky",
    overrides: {
      accent: "#7dd7ff",
      exposureEv: 0.02,
      fogDensityScale: 0.15,
      fog: {
        color: "#b9c8d8",
        near: 105,
        far: 340,
        height: { mode: "linear", near: 105, far: 340, maxOpacity: 0.16, affectsBackground: false }
      },
      environmentIntensity: 0.6,
      environmentRotationDeg: 300,
      sun: { elevationDeg: 28, azimuthDeg: 58 },
      key: { color: "#ffe2c4", intensity: 4.2, shadow: { filter: "pcf", mapSize: 2048 } },
      grade: { contrast: 1.16, saturation: 1.04, temperature: -0.04, tint: 0 }
    },
    rim: { color: "#e6f2ff", intensity: 7 },
    ringKey: { color: "#ffe6c8", intensity: 3 },
    ringFill: { color: "#dceaff", intensity: 2.5 },
    spawnDisc: "#8f949a",
    contact: { intensity: 1, length: 0.45 },
    cones: false,
    vignette: 0.2,
    bloom: { intensity: 0.18, threshold: 1.12 },
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
