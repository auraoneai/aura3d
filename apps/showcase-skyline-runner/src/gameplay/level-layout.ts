/**
 * Renderer-independent authored layout for Skyline Level 1.
 *
 * The deterministic GLB compositor imports this module, so it cannot import the
 * generated collision contract or the Aura runtime. Keeping the district stride
 * here removes the former circular build where an old contract determined the
 * next world asset's length.
 */
export const SKYLINE_LEVEL_ACTS = [
  { id: "home-grove", title: "Home Grove", objective: "Wake the trail relays", sections: [0, 1] },
  { id: "broken-canopy", title: "Broken Canopy", objective: "Cross the storm gaps", sections: [2, 3] },
  { id: "sentry-pass", title: "Sentry Pass", objective: "Outrun the dormant wardens", sections: [4, 5] },
  { id: "cloudstep-rise", title: "Cloudstep Rise", objective: "Carry three sky shards upward", sections: [6, 7] },
  { id: "aurora-crown", title: "Aurora Crown", objective: "Light the summit beacon", sections: [8, 9] }
] as const;

export const SKYLINE_SECTION_LAYOUTS = [
  { name: "grove-tutorial", act: 0, elevation: 0 },
  { name: "relay-orchard", act: 0, elevation: 0.12 },
  { name: "windfall-bridge", act: 1, elevation: 0.3 },
  { name: "canopy-switchback", act: 1, elevation: 0.16 },
  { name: "warden-approach", act: 2, elevation: 0.48 },
  { name: "sentry-gauntlet", act: 2, elevation: 0.34 },
  { name: "cloudstep-climb", act: 3, elevation: 0.7 },
  { name: "shard-terraces", act: 3, elevation: 0.54 },
  { name: "crown-ascent", act: 4, elevation: 0.92 },
  { name: "summit-beacon", act: 4, elevation: 0.78 }
] as const;

export const SKYLINE_SECTION_COUNT = SKYLINE_SECTION_LAYOUTS.length;
/** Measured end of the final retained mesh platform in the immutable source district. */
export const SKYLINE_SECTION_STRIDE = 14.94;

export const SKYLINE_TERRAIN_PROFILES = [
  [0, 0, 0.04, 0.02, 0.08, 0.04, 0.1, 0.06, 0.12, 0.08, 0.14, 0.1],
  [0, 0.08, 0.16, 0.08, 0.24, 0.14, 0.3, 0.18, 0.34, 0.22, 0.28, 0.18],
  [0.18, 0.08, -0.04, 0.2, 0.36, 0.12, -0.08, 0.28, 0.42, 0.18, 0.04, 0.16],
  [0.16, 0.32, 0.12, 0.38, 0.18, 0.44, 0.2, 0.5, 0.26, 0.42, 0.2, 0.08],
  [0.04, 0.1, 0.18, 0.28, 0.36, 0.44, 0.52, 0.46, 0.4, 0.34, 0.26, 0.18],
  [0.18, 0.38, 0.12, 0.46, 0.08, 0.5, 0.14, 0.42, 0.04, 0.36, 0.1, 0.22],
  [0.04, 0.12, 0.22, 0.32, 0.42, 0.52, 0.62, 0.7, 0.78, 0.7, 0.62, 0.54],
  [0.54, 0.36, 0.56, 0.4, 0.62, 0.46, 0.68, 0.5, 0.72, 0.54, 0.66, 0.48],
  [0.18, 0.28, 0.4, 0.52, 0.64, 0.76, 0.86, 0.94, 0.86, 0.76, 0.66, 0.56],
  [0.56, 0.7, 0.82, 0.9, 0.82, 0.72, 0.62, 0.52, 0.42, 0.32, 0.22, 0.12]
] as const;

export const skylineTerrainWarp = (section: number, x: number): number => {
  const profile = SKYLINE_TERRAIN_PROFILES[section] ?? SKYLINE_TERRAIN_PROFILES[0];
  const normalized = Math.max(0, Math.min(1, x / SKYLINE_SECTION_STRIDE));
  const sample = normalized * (profile.length - 1);
  const left = Math.floor(sample);
  const right = Math.min(profile.length - 1, left + 1);
  const blend = sample - left;
  return profile[left]! + (profile[right]! - profile[left]!) * blend;
};
