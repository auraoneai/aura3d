/**
 * PRD 11 Phase 4 — versioned renderer-string → hardware-class table
 * (PRD-11 §6.4 step 2, hardware classes per §17.1).
 *
 * One row per class; rows are evaluated top-down so the first matching tier
 * wins (Ultra patterns are checked before High, and so on). Bump
 * `DEVICE_CLASS_TABLE_VERSION` whenever a row changes so the persisted
 * `aura3d.quality.v1` decision cache invalidates on table edits.
 */

import type { AuraQualityTier } from "../contracts/quality";

export const DEVICE_CLASS_TABLE_VERSION = 1;

/** Software rasterisers hit the hard floor before the class table (§6.4 step 1). */
export const SOFTWARE_RENDERER_PATTERN = /SwiftShader|llvmpipe|Microsoft Basic Render|WARP|Software (Rendering|Adapter|Rasterizer)/i;

export interface DeviceClassEntry {
  readonly id: string;
  readonly tier: AuraQualityTier;
  readonly patterns: readonly RegExp[];
}

export const DEVICE_CLASSES: readonly DeviceClassEntry[] = [
  {
    id: "ultra",
    tier: "ultra",
    patterns: [
      // RTX 4070+ / 50xx desktop only — a laptop suffix anywhere demotes to High.
      /\bRTX\s*(40[7-9]\d|50\d\d)\b(?!.*(Laptop|Max-Q|Mobile))/i,
      /\bM[34]\s*Max\b/i,             // Apple M3 Max, M4 Max
      /\bM\d\s*Ultra\b/i              // M-series Ultra
    ]
  },
  {
    id: "high",
    tier: "high",
    patterns: [
      /\bM[1-4]\s*Pro\b/i,            // Apple M1-M4 Pro
      /\bM[12]\s*Max\b/i,             // Apple M1/M2 Max
      /\bRTX\s*20\d\d/i,              // RTX 20xx desktop
      /\bRTX\s*30\d\d/i,              // RTX 30xx desktop + laptop
      /\bRTX\s*40\d\d\b.*(Laptop|Max-Q|Mobile)/i, // RTX 40xx laptop
      /\bRadeon\s+(RX\s*)?[67]\d{3}M?\b/i, // RX 6000/7000 (RDNA2+)
      /\bRDNA\s?[23]\b/i
    ]
  },
  {
    id: "medium",
    tier: "medium",
    patterns: [
      /\bApple\s+M[1-4]\b(?!\s*(Pro|Max|Ultra))/i, // M1-M4 base
      /\bIris\s+Xe\b/i,
      /\bArc\s+A?[357]\d\d\b/i,       // Intel Arc A3/A5/A7 integrated class
      /\bAdreno\s+[67]\d\d\b/i,       // Adreno 650-799
      /\bApple\s+A1[4-9]\b/i,         // Apple A14 and newer
      /\bApple\s+A2\d\b/i
    ]
  },
  {
    id: "low",
    tier: "low",
    patterns: [
      /\bUHD\b/i,                     // Intel UHD
      /\bIntel\s+HD\b/i,
      /\bHD\s+Graphics\b/i,
      /\bAdreno\s+[56][0-4]\d\b/i,    // Adreno 500-640
      /\bMali[\s-]?G[57]\d\b/i,       // Mali-G5x / G7x
      /\bApple\s+A1[23]\b/i,          // A12 / A13
      /\bParavirtual\b/i              // Apple Paravirtual device (CI runner)
    ]
  }
];

/** Safari's masked renderer string; §6.4 resolves it to Medium / confidence low. */
export const MASKED_APPLE_RENDERER = "Apple GPU";

export interface DeviceClassResult {
  readonly tier: AuraQualityTier;
  readonly matched: string | null;
}

/**
 * Map a renderer string through the class table. `null`/unmatched returns
 * `tier: "medium"` with `matched: null` — the caller decides the confidence.
 */
export function classifyRendererString(renderer: string | null): DeviceClassResult {
  if (!renderer) return { tier: "medium", matched: null };
  for (const entry of DEVICE_CLASSES) {
    for (const pattern of entry.patterns) {
      if (pattern.test(renderer)) {
        return { tier: entry.tier, matched: entry.id };
      }
    }
  }
  return { tier: "medium", matched: null };
}
