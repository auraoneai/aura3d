/**
 * PRD 11 Phase 5 — §6.9 item-3 memory policy.
 *
 * Medium and below release decoded image data after upload and re-fetch on
 * restore (slower restore, less memory); High and Ultra retain. Texture
 * owners pass the tier's decision into `ResourceDescriptor.retainForRestore`
 * when registering with the C-29 `ResourceRegistry` (fact F-11-03).
 */

import type { AuraQualityTier } from "../contracts/quality";

export function retainDecodedSourcesForRestore(tier: AuraQualityTier): boolean {
  return tier === "high" || tier === "ultra";
}
