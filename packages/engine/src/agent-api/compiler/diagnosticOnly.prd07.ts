// PRD-07 P1-T15 — lane-owned diagnostic-only field rows (§6.9).
// These fields existed before PRD 07 and the contract keeps them as
// documented-quiet fields; the coverage contract expects owner:7 rows.

export const PRD07_DIAGNOSTIC_ONLY_FIELDS = {
  "effect.flipbookAtlas": { reason: "sprite grid comes from materialMode defaults; atlas json path is P5's", ownerPrd: 7 },
  "effect.frameStagger": { reason: "frameBlend flag only; per-instance stagger is P2-T8's", ownerPrd: 7 },
  "atmosphere.volumetric.noise": { reason: "analytic raymarch only; noise volume is P9's", ownerPrd: 7 },
  "effects.trail.width": { reason: "trail lands with P2-T5 ribbons", ownerPrd: 7 }
} as const;
