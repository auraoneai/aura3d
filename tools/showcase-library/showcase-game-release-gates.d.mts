import type { ShowcaseRouteGate } from "./route-gates.mjs";
/** Returns failure strings after validating the supplied route-health JSON and
 * its retained composition/geometry/image files. Nested evidence is untrusted. */
export function validateReleaseGameAssetPairEvidence(input: {
  readonly route: ShowcaseRouteGate;
  readonly routeHealth: object;
  readonly root?: string;
  /** Q02 machine replay precedes L02 human promotion; final release callers omit this. */
  readonly requirePublicTemplateReady?: boolean;
  /** Q02 keeps certification/hash checks; L02/final release additionally requires route-level human promotion fields. */
  readonly requireFinalPromotion?: boolean;
}): string[];
