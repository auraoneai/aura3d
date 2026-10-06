import type { AuraCustomGeometrySpec } from "@aura3d/engine";

export type SkylineVisualRole =
  | "safe-surface"
  | "hazard"
  | "collectible"
  | "ember-charge"
  | "relay"
  | "finish"
  | "player"
  | "ghost";

export interface SkylineVisualRoleSpec {
  readonly role: SkylineVisualRole;
  readonly shape: string;
  readonly primaryColor: string;
  readonly accentColor: string;
  readonly nodeTag: string;
  readonly meaning: string;
}

/**
 * Canonical gameplay vocabulary. A role must differ by silhouette and color
 * pair, so monochrome/color-vision conditions still leave a shape cue.
 */
export const SKYLINE_VISUAL_LANGUAGE: Readonly<Record<SkylineVisualRole, SkylineVisualRoleSpec>> = {
  "safe-surface": {
    role: "safe-surface",
    shape: "horizontal-ledges-with-light-top-edge",
    primaryColor: "#d7f4db",
    accentColor: "#b98b62",
    nodeTag: "safe-surface",
    meaning: "standable certified route"
  },
  hazard: {
    role: "hazard",
    shape: "typed-sentry-or-world-hazard-with-crossed-warning-mark",
    primaryColor: "#f43f5e",
    accentColor: "#ffd0d7",
    nodeTag: "hazard-language",
    meaning: "damage or defeat risk"
  },
  collectible: {
    role: "collectible",
    shape: "faceted-diamond-with-thin-ring-halo",
    primaryColor: "#f7c948",
    accentColor: "#fff1a8",
    nodeTag: "sky-shard-language",
    meaning: "score pickup"
  },
  "ember-charge": {
    role: "ember-charge",
    shape: "vertical-capsule-inside-open-ring",
    primaryColor: "#ff6b35",
    accentColor: "#ffd08a",
    nodeTag: "ember-charge-language",
    meaning: "stored projectile charge"
  },
  relay: {
    role: "relay",
    shape: "cyan-ring-on-post",
    primaryColor: "#22d3ee",
    accentColor: "#d8fbff",
    nodeTag: "relay-language",
    meaning: "checkpoint progression"
  },
  finish: {
    role: "finish",
    shape: "stepped-gold-mast-with-emerald-core",
    primaryColor: "#e5ad43",
    accentColor: "#64e8c4",
    nodeTag: "finish-language",
    meaning: "summit completion"
  },
  player: {
    role: "player",
    shape: "rounded-typed-humanoid",
    primaryColor: "#f8fbff",
    accentColor: "#c7b8ff",
    nodeTag: "player-language",
    meaning: "live controllable runner"
  },
  ghost: {
    role: "ghost",
    shape: "rounded-typed-humanoid-echo",
    primaryColor: "#8ef0ff",
    accentColor: "#5ee0ff",
    nodeTag: "ghost-language",
    meaning: "non-interactive best-run echo"
  }
};

export function skylineVisualRoleSignature(role: SkylineVisualRole): string {
  const spec = SKYLINE_VISUAL_LANGUAGE[role];
  return `${spec.shape}|${spec.primaryColor}|${spec.accentColor}`;
}

export function skylineVisualLanguageEvidence() {
  const roles = Object.values(SKYLINE_VISUAL_LANGUAGE);
  const signatures = roles.map((role) => skylineVisualRoleSignature(role.role));
  return {
    encoding: "shape-plus-color",
    roles: roles.map((role) => ({ ...role, signature: skylineVisualRoleSignature(role.role) })),
    roleCount: roles.length,
    uniqueSignatureCount: new Set(signatures).size,
    everyRoleHasShapeAndTwoColors: roles.every((role) =>
      role.shape.length > 0 && /^#[0-9a-f]{6}$/i.test(role.primaryColor) && /^#[0-9a-f]{6}$/i.test(role.accentColor)
    )
  };
}

/** A true indexed octahedron: angular enough to remain a shard without color. */
export const SKYLINE_SHARD_GEOMETRY: AuraCustomGeometrySpec = {
  kind: "aura-custom-geometry",
  positions: [
    [0, 1, 0],
    [0.7, 0, 0],
    [0, 0, 0.48],
    [-0.7, 0, 0],
    [0, 0, -0.48],
    [0, -1, 0]
  ],
  indices: [
    0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1,
    5, 2, 1, 5, 3, 2, 5, 4, 3, 5, 1, 4
  ],
  bounds: { min: [-0.7, -1, -0.48], max: [0.7, 1, 0.48] }
};

