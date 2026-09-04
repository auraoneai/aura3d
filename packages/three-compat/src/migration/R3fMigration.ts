import type { ThreeCompatCompatibilityWarning } from "./CompatibilityWarnings";

/**
 * R3F + CSS2D/CSS3D migration notes (muse3jsparity-PRD V1.4 + N4.3).
 *
 * Two explicit non-parity positions, documented where importers look:
 *
 * 1. No "R3F parity" claim. The covered-path mapping table lives in
 *    `@aura3d/react` (`R3F_TO_AURA_MIGRATION_TABLE`: Canvas, Model, Lights,
 *    Camera, Effect plus `useAuraFrame` / `useAuraApp` / suspense / events /
 *    the three drei recipes). This lab detects R3F/drei source and points at
 *    that table instead of rewriting imports it cannot honor.
 * 2. No `CSS2DRenderer` / `CSS3DRenderer` parity (explicit 2.1 decision).
 *    `CSS2D_CSS3D_MANUAL_MAP` gives the manual mapping per renderer.
 */

/** Where the R3F mapping table lives. A pointer, not a copy — one source of truth. */
export const R3F_MIGRATION_TABLE_POINTER =
  "@aura3d/react exports R3F_TO_AURA_MIGRATION_TABLE (AuraCanvas components plus useAuraFrame/useAuraApp/suspense/events/drei recipes). " +
  "That table maps covered paths; it is not an R3F-parity claim.";

export interface Css2DCss3DManualMapping {
  readonly three: "CSS2DRenderer" | "CSS3DRenderer";
  readonly aura: string;
  readonly steps: readonly string[];
}

/**
 * Manual CSS2D/3D mapping for importers (N4 task 3).
 *
 * CSS2D annotations map onto world-anchored labels. CSS3D has no Aura
 * equivalent — in-plane 3D text maps onto G1 SDF text, and anything beyond
 * that keeps its CSS3DRenderer alongside the canvas (it is DOM; it composes).
 */
export const CSS2D_CSS3D_MANUAL_MAP: readonly Css2DCss3DManualMapping[] = [
  {
    three: "CSS2DRenderer",
    aura: "labels.* world-anchored screen-space labels",
    steps: [
      "Replace each CSS2DObject with labels.billboard() or labels.anchor() at the same world position.",
      "Map CSS2DObject.visible = false to offscreenPolicy: \"hide\" (default is \"clamp\").",
      "Occlusion dimming is on by default (occlusionAware); set occlusionAware: false to keep the old always-on-top CSS behavior."
    ]
  },
  {
    three: "CSS3DRenderer",
    aura: "no equivalent — G1 SDF text for in-plane text, otherwise keep CSS3DRenderer",
    steps: [
      "For text rendered in a 3D plane, use G1 SDF text (packages/rendering/src/SdfText.ts) with the uppercase alphanumeric catalog.",
      "For annotations, use labels.* world-anchored labels instead.",
      "Anything beyond those two keeps its CSS3DRenderer element alongside the AuraCanvas; it is DOM and composes without a migration."
    ]
  }
];

const R3F_SOURCE_MARKERS: readonly { readonly marker: string; readonly code: string; readonly message: string }[] = [
  {
    marker: "@react-three/fiber",
    code: "r3f-manual",
    message: `R3F imports are not rewritten. Map them manually with ${R3F_MIGRATION_TABLE_POINTER}`
  },
  {
    marker: "@react-three/drei",
    code: "drei-manual",
    message: `drei imports are not rewritten. The three covered patterns are cameraControlsRecipe, environmentPresetRecipe, and transformGizmoRecipe in @aura3d/react; everything else stays on drei. ${R3F_MIGRATION_TABLE_POINTER}`
  },
  {
    marker: "CSS2DRenderer",
    code: "css2d-manual",
    message: `CSS2DRenderer has no Aura parity target by explicit 2.1 decision. ${CSS2D_CSS3D_MANUAL_MAP[0]?.steps.join(" ") ?? ""}`
  },
  {
    marker: "CSS3DRenderer",
    code: "css3d-manual",
    message: `CSS3DRenderer has no Aura parity target by explicit 2.1 decision. ${CSS2D_CSS3D_MANUAL_MAP[1]?.steps.join(" ") ?? ""}`
  }
];

/** Source-level R3F/drei/CSS2D/CSS3D detection for the migration lab. */
export function createR3fMigrationWarnings(source: string): readonly ThreeCompatCompatibilityWarning[] {
  return R3F_SOURCE_MARKERS.filter(({ marker }) => source.includes(marker)).map(({ code, message }) => ({ code, message }));
}
