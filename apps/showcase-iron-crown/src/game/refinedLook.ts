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
 *
 * Owner neutral-grade pass ("too much orange / sun-bright fade", fighters blending into the pillars and throne): the
 * fighters are the lit subject. Neutral/cool keys and ring spots, strong cool back rims on both fighters (p2 had a warm
 * rim), a lower environment fill and a stronger vignette so the set sits darker than the pair, a neutral high-threshold
 * bloom (the look's own bloom glowed at threshold 0.7 in the venue accent, gold or orange, over the whole frame) and no
 * light cones through the fight plane. Bounds pinned in tests/unit/iron-crown/neutral-grade.test.ts.
 */
import type { AuraColor, AuraHdriId, AuraLookOverrides, AuraSceneNode } from "@aura3d/engine";
import { NEUTRAL_BLOOM_TINT } from "./look";
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
  /** `intensity`: volume alpha (0..1; the engine scales flake alpha by it), so the flakes read as weather, not noise. */
  readonly weather?: { readonly type: "snow"; readonly particles: number; readonly streakLimit: number; readonly color: AuraColor; readonly intensity?: number };
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
      exposureEv: -0.08,
      fogDensityScale: 0.15,
      fog: {
        color: "#c9a46a",
        near: 120,
        far: 380,
        height: { mode: "linear", near: 120, far: 380, maxOpacity: 0.16, affectsBackground: false }
      },
      environmentIntensity: 0.28,
      environmentRotationDeg: 330,
      sun: { elevationDeg: 34, azimuthDeg: -62 },
      key: { color: "#fff6ee", intensity: 7.5, shadow: { filter: "pcf", mapSize: 2048 } },
      grade: { contrast: 1.24, saturation: 1.12, temperature: 0, tint: 0 }
    },
    rim: { color: "#e2ecff", intensity: 16 },
    ringKey: { color: "#f7f3ee", intensity: 9 },
    ringFill: { color: "#dbe6ff", intensity: 6 },
    spawnDisc: "#8d8274",
    contact: { intensity: 1, length: 0.45 },
    cones: false,
    vignette: 0.28,
    bloom: { intensity: 0.12, threshold: 1.5 }
  },
  "crown-arena": {
    lookId: "arena-fight",
    // owner (22:58, "still too much orange"): the warm_bar HDRI lit every surface amber; a neutral studio probe lets the
    // stone, wood and red throne show their real colours (measured background b* on a real-GPU frame, see report)
    hdri: "studio_small_08",
    background: "#141519",
    overrides: {
      accent: "#ffd76a",
      exposureEv: 0,
      fogDensityScale: 0.15,
      fog: {
        color: "#0d0b11",
        near: 95,
        far: 300,
        height: { mode: "linear", near: 95, far: 300, maxOpacity: 0.16, affectsBackground: false }
      },
      environmentIntensity: 0.34,
      key: { color: "#f3f5fa", intensity: 2.4, shadow: { filter: "pcf", mapSize: 2048 } },
      grade: { contrast: 1.26, saturation: 1.06, temperature: -0.06, tint: 0 }
    },
    rim: { color: "#dce9ff", intensity: 18 },
    ringKey: { color: "#f6f1ea", intensity: 6 },
    ringFill: { color: "#d6e4ff", intensity: 3.5 },
    // The two key cones ended at the fighters' shoulders (z -0.15): forge haze over the pair. The warmth stays in the
    // braziers, the gold practicals and the warm_bar fill.
    cones: false,
    vignette: 0.3,
    bloom: { intensity: 0.14, threshold: 1.45 },
    followSpot: { color: "#f6f6f4", intensity: 30 },
    mirror: 0.16,
    spawnDisc: "#28222b",
    contact: { intensity: 1, length: 0.45 }
  },
  "desert-airbase": {
    lookId: "overcast",
    hdri: "autumn_field_puresky",
    overrides: {
      accent: "#ffb03c",
      exposureEv: -0.06,
      fogDensityScale: 0.15,
      fog: {
        color: "#b8724a",
        near: 115,
        far: 360,
        height: { mode: "linear", near: 115, far: 360, maxOpacity: 0.16, affectsBackground: false }
      },
      environmentIntensity: 0.46,
      environmentRotationDeg: 200,
      sun: { elevationDeg: 26, azimuthDeg: -64 },
      key: { color: "#fff1e2", intensity: 4, shadow: { filter: "pcf", mapSize: 2048 } },
      grade: { contrast: 1.24, saturation: 1.12, temperature: 0.02, tint: 0 }
    },
    rim: { color: "#e2ecff", intensity: 16 },
    ringKey: { color: "#f7f2ec", intensity: 8 },
    ringFill: { color: "#dbe6ff", intensity: 5 },
    spawnDisc: "#9a8a72",
    contact: { intensity: 1, length: 0.45 },
    cones: false,
    vignette: 0.28,
    bloom: { intensity: 0.12, threshold: 1.5 }
  },
  "himalayan-monastery": {
    lookId: "alpine-snow",
    hdri: "kloppenheim_06_puresky",
    overrides: {
      accent: "#7dd7ff",
      exposureEv: -0.02,
      fogDensityScale: 0.15,
      fog: {
        color: "#b9c8d8",
        near: 105,
        far: 340,
        height: { mode: "linear", near: 105, far: 340, maxOpacity: 0.16, affectsBackground: false }
      },
      environmentIntensity: 0.46,
      environmentRotationDeg: 300,
      sun: { elevationDeg: 28, azimuthDeg: 58 },
      key: { color: "#fff3e6", intensity: 4, shadow: { filter: "pcf", mapSize: 2048 } },
      grade: { contrast: 1.22, saturation: 1.1, temperature: -0.04, tint: 0 }
    },
    rim: { color: "#e2ecff", intensity: 15 },
    ringKey: { color: "#f7f3ee", intensity: 8 },
    ringFill: { color: "#dbe6ff", intensity: 5 },
    spawnDisc: "#8f949a",
    contact: { intensity: 1, length: 0.45 },
    cones: false,
    vignette: 0.28,
    bloom: { intensity: 0.12, threshold: 1.5 },
    // Fewer, dimmer flakes: the bright 360-flake volume read as white noise over the fighters.
    weather: { type: "snow", particles: 240, streakLimit: 30, color: "#dde4ee", intensity: 0.4 },
    prayerFlags: true
  }
};

export function refinedLook(id: StageId): RefinedVenueLook | undefined {
  return REFINED_LOOKS[id];
}

/**
 * The look overrides of a refined row: its HDRI (drawn as the sky outdoors), no look rim (the back rims replace it), and
 * the row's bloom on the look's own bloom node in a neutral tint (the post bridge drives bloom from the first bloom node,
 * which is the look's: left alone it bloomed at threshold 0.7 in the venue accent).
 */
export function refinedLookOverrides(row: RefinedVenueLook): AuraLookOverrides {
  return {
    ...row.overrides,
    hdri: row.hdri,
    background: row.background ?? "look",
    rim: false,
    post: { bloom: { intensity: row.bloom.intensity, threshold: row.bloom.threshold, color: NEUTRAL_BLOOM_TINT } }
  };
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
