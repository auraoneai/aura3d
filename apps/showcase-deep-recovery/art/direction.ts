/**
 * Art-Direction Brief — Deep Recovery (`apps/showcase-deep-recovery`).
 *
 * PRD-14 Phase 2 Deliverable D2.7: a typed, committed art-direction brief
 * per flagship route, consumed by the single-path `createGame(...)` runtime
 * and audited by `scripts/check-art-direction.mjs`.
 *
 * Genre / feel: Deep-sea salvage piloting (`Subnautica` / `Dave the Diver`
 * deep-dive phases / `Sunless Sea`). A compact yellow salvage submersible
 * descends through sunlit reef shelves into twilight trenches and abyssal
 * vents, sweeping with active sonar, grappling salvage crates onto spring
 * tethers, and hauling them back to a surface recovery buoy before oxygen
 * or hull integrity fails.
 */

export type FocalRole = "primary" | "secondary" | "background";

export interface PaletteSwatch {
  readonly role: string;
  readonly hex: `#${string}`;
  readonly notes: string;
}

export interface FocalEntry {
  readonly id: string;
  readonly role: FocalRole;
  readonly silhouetteNotes: string;
  readonly contrastTarget: number;
}

export interface ValueGroup {
  readonly name: "foreground" | "midground" | "background" | "accents";
  readonly lumaRange: readonly [number, number];
  readonly members: readonly string[];
}

export interface CameraGrammar {
  readonly mode: string;
  readonly fovDeg: number;
  readonly offset: readonly [number, number, number];
  readonly lookAheadMeters: number;
  readonly framingRule: string;
  readonly minSubjectScreenHeightFraction: number;
}

export interface LightingPlan {
  readonly key: {
    readonly color: `#${string}`;
    readonly intensity: number;
    readonly direction: readonly [number, number, number];
    readonly castShadows: boolean;
  };
  readonly fill: {
    readonly skyColor: `#${string}`;
    readonly groundColor: `#${string}`;
    readonly intensity: number;
  };
  readonly rim: {
    readonly color: `#${string}`;
    readonly intensity: number;
    readonly notes: string;
  };
  readonly ambientBanned: true;
  readonly fog: {
    readonly kind: "exponential";
    readonly reefColor: `#${string}`;
    readonly trenchColor: `#${string}`;
    readonly abyssColor: `#${string}`;
    readonly densityRange: readonly [number, number];
  };
  readonly post: {
    readonly toneMapping: "aces";
    readonly exposure: number;
    readonly bloomThreshold: number;
    readonly bloomIntensity: number;
    readonly vignette: number;
  };
}

export interface AdmittedAssetEntry {
  readonly role: string;
  readonly assetKey: string;
  readonly source: "aura-assets";
  readonly license: string;
}

export interface StandInEntry {
  readonly file: string;
  readonly symbol: string;
  readonly reason: string;
  readonly retirementExitCriteria: string;
}

export interface ArtDirectionBrief {
  readonly routeId: "showcase-deep-recovery";
  readonly title: string;
  readonly genre: string;
  readonly references: readonly [string, string, string];
  readonly moodKeywords: readonly string[];
  readonly palette: readonly PaletteSwatch[];
  readonly focalHierarchy: readonly FocalEntry[];
  readonly valueGrouping: readonly ValueGroup[];
  readonly camera: CameraGrammar;
  readonly lighting: LightingPlan;
  readonly assets: readonly AdmittedAssetEntry[];
  readonly standIns: readonly StandInEntry[];
}

export const artDirection: ArtDirectionBrief = {
  routeId: "showcase-deep-recovery",
  title: "Deep Recovery — Pelagic Salvage Submersible",
  genre: "Deep-sea salvage piloting & tether recovery",
  references: [
    "Subnautica (Unknown Worlds) — turquoise-to-indigo pelagic depth fog, warm submersible floodlights cutting through particulate water, bioluminescent coral accents",
    "Dave the Diver — Deep Dive phases (Mintrocket) — high-contrast yellow diver/sub silhouette against dark basalt trench walls and readable cargo crate beacons",
    "In Other Waters / Barotrauma — crisp oceanographic telemetry HUD: depth sonar sweep, oxygen/hull integrity bars, and tether tension readouts",
  ],
  moodKeywords: [
    "pelagic-cyan",
    "hydrothermal-amber",
    "pressurized-isolation",
    "bioluminescent-reef",
    "industrial-salvage",
  ],
  palette: [
    {
      role: "dominant-pelagic-water",
      hex: "#071b2c",
      notes: "60% dominant deep pelagic teal-indigo water column and exponential depth fog.",
    },
    {
      role: "secondary-basalt-trench",
      hex: "#122a3d",
      notes: "25% basalt trench walls, terraced reef shelves, and corroded wreck hulls.",
    },
    {
      role: "hero-submersible-yellow",
      hex: "#f5b82e",
      notes: "10% industrial caution yellow on the player submersible hull and surface recovery buoy.",
    },
    {
      role: "accent-sonar-cyan",
      hex: "#38f2e4",
      notes: "3% active sonar ping ring, viewport dome glow, and standard crate beacon strobes.",
    },
    {
      role: "accent-vent-amber",
      hex: "#ff6b2b",
      notes: "2% hydrothermal vent plumes, heavy salvage crate beacons, and hull-breach warning strobes.",
    },
  ],
  focalHierarchy: [
    {
      id: "player-submersible-and-headlamp-cone",
      role: "primary",
      silhouetteNotes:
        "Compact yellow bathysphere hull (`deepRecoverySub`) with dual side thrusters, forward viewport dome, and twin volumetric floodlight cones.",
      contrastTarget: 0.45,
    },
    {
      id: "salvage-crates-and-tether-lines",
      role: "secondary",
      silhouetteNotes:
        "Standard cyan-strobe crates (`deepRecoveryCrateStandard`) and heavy amber-strobe crates (`deepRecoveryCrateHeavy`) linked to the sub by glowing spring tethers.",
      contrastTarget: 0.32,
    },
    {
      id: "surface-recovery-buoy-and-wreck-ribs",
      role: "secondary",
      silhouetteNotes:
        "Surface recovery buoy (`deepRecoveryBuoyBeacon`) with vertical recovery column at y=16, plus rusted wreck hulls (`deepRecoveryWreckHull`) framing the trench.",
      contrastTarget: 0.25,
    },
    {
      id: "terraced-seabed-and-kelp-spires",
      role: "background",
      silhouetteNotes:
        "Three-tier seabed (Sunlit Reef, Twilight Trench, Abyssal Vent Zone) receding into exponential pelagic fog.",
      contrastTarget: 0.14,
    },
  ],
  valueGrouping: [
    {
      name: "foreground",
      lumaRange: [0.42, 0.88],
      members: ["player-submersible", "headlamp-cones", "active-tethers", "grappled-crates"],
    },
    {
      name: "midground",
      lumaRange: [0.18, 0.48],
      members: ["wreck-hulls", "reef-shelves", "uncollected-crates", "recovery-buoy"],
    },
    {
      name: "background",
      lumaRange: [0.04, 0.22],
      members: ["trench-walls", "abyssal-floor", "pelagic-fog-column"],
    },
    {
      name: "accents",
      lumaRange: [0.65, 0.98],
      members: ["sonar-ping-wave", "crate-beacon-strobes", "vent-ember-plumes", "buoy-strobe"],
    },
  ],
  camera: {
    mode: "third-person-sub-chase",
    fovDeg: 54,
    offset: [0, 1.9, 5.8],
    lookAheadMeters: 4.5,
    framingRule:
      "Close behind-and-above chase rig keeping the yellow submersible in the lower-center third while looking forward along the headlamp beam into the trench.",
    minSubjectScreenHeightFraction: 0.12,
  },
  lighting: {
    key: {
      color: "#5fd4ff",
      intensity: 2.35,
      direction: [-0.25, -0.92, -0.28],
      castShadows: true,
    },
    fill: {
      skyColor: "#2da8d8",
      groundColor: "#061320",
      intensity: 0.82,
    },
    rim: {
      color: "#ff9e44",
      intensity: 1.65,
      notes: "Warm sub headlamp + hydrothermal under-rim separating the yellow hull and crates from the dark indigo trench.",
    },
    ambientBanned: true,
    fog: {
      kind: "exponential",
      reefColor: "#0c3550",
      trenchColor: "#071d31",
      abyssColor: "#040d1a",
      densityRange: [0.016, 0.036],
    },
    post: {
      toneMapping: "aces",
      exposure: 1.15,
      bloomThreshold: 0.72,
      bloomIntensity: 0.42,
      vignette: 0.28,
    },
  },
  assets: [
    {
      role: "player-submersible-hull",
      assetKey: "deepRecoverySub",
      source: "aura-assets",
      license: "Aura3D Proprietary (Generated via Meshy)",
    },
    {
      role: "sunken-wreck-hull-obstacle",
      assetKey: "deepRecoveryWreckHull",
      source: "aura-assets",
      license: "Aura3D Proprietary (Generated via Meshy)",
    },
    {
      role: "salvage-crate-standard",
      assetKey: "deepRecoveryCrateStandard",
      source: "aura-assets",
      license: "Aura3D Proprietary (Generated via Meshy)",
    },
    {
      role: "salvage-crate-heavy",
      assetKey: "deepRecoveryCrateHeavy",
      source: "aura-assets",
      license: "Aura3D Proprietary (Generated via Meshy)",
    },
    {
      role: "surface-recovery-buoy",
      assetKey: "deepRecoveryBuoyBeacon",
      source: "aura-assets",
      license: "Aura3D Proprietary (Generated via Meshy)",
    },
  ],
  standIns: [
    {
      file: "src/main.ts",
      symbol: "buildSeabedAndTrench",
      reason:
        "Continuous terraced reef/trench/abyss bathymetry and dynamic spring-tether ribbons require parametric vertex placement aligned to `DEPTH_ZONES` and live crate physics.",
      retirementExitCriteria:
        "Retain parametric bathymetry and live tether ribbons; all hero props (sub, wrecks, standard/heavy crates, buoy) use admitted GLBs.",
    },
  ],
};

export default artDirection;
