/**
 * fidelity.ts — PRD Phase M7: honest quality tiering.
 *
 * Surfaces a single, user-facing FIDELITY GRADE (A / B / C) per character and per
 * scene, derived from the REAL signals the pipeline already records. The grade is
 * how we keep the product honest: a C scene is "previz", never sold as finished.
 *
 * The grade is a deliberate DOWNGRADE-only combination of the inputs the PRD lists:
 *
 *   A — a curated/uploaded properly-rigged character (rig grade A) playing real
 *       (mocap/extracted) motion, rendered with cel-or-PBR shading AND shadows.
 *   B — a catalog rig that graded OK (rig grade A/B) but is missing one of the
 *       A ingredients (procedural motion, or shadows off): a watchable catalog take.
 *   C — a mascot / minimal rig (rig grade C/D) OR an authored placeholder: PREVIZ.
 *       Never present a C as a finished shot.
 *
 * The function is PURE (no IO) so it can run identically in the render-time resolver
 * report and in the browser UI. Both sides import the SAME grading rules.
 */

export type FidelityGrade = "A" | "B" | "C";

/** Rig grade as produced by the resolver (`RigGrade`) / `gradeRig` (A best … D unusable). */
export type FidelityRigGrade = "A" | "B" | "C" | "D";

/** Where a character's geometry/rig came from — drives the mascot/previz floor. */
export type FidelityProvenance = "curated" | "user-uploaded" | "catalog-resolved" | "authored-fallback";

/** The motion actually played — real extracted/mocap clips vs the procedural baseline. */
export type FidelityMotionSource = "mocap" | "extracted" | "embedded" | "procedural" | "idle" | "talk" | "fallback" | "unknown";

export interface CharacterFidelityInput {
  readonly id: string;
  /** Rig grade from the resolver / `gradeRig`. Absent → treated as the previz floor. */
  readonly rigGrade?: FidelityRigGrade;
  readonly provenance: FidelityProvenance;
  /** Dominant motion source the render actually played for this character. */
  readonly motionSource?: FidelityMotionSource;
  /** Shading mode the scene rendered with (cel/pbr both count; "none" does not). */
  readonly shading?: "cel" | "pbr" | "none";
  /** Whether real shadow maps were enabled (grounding + depth). */
  readonly shadows?: boolean;
}

export interface CharacterFidelity {
  readonly id: string;
  readonly grade: FidelityGrade;
  /** True for grade C — the UI must label this output "previz". */
  readonly previz: boolean;
  /** Short human reason the grade landed where it did (shown in the report + UI tooltip). */
  readonly reason: string;
}

export interface SceneFidelity {
  readonly grade: FidelityGrade;
  readonly previz: boolean;
  readonly characters: readonly CharacterFidelity[];
  readonly reason: string;
}

const MASCOT_PROVENANCE = new Set<FidelityProvenance>(["authored-fallback"]);
const REAL_MOTION = new Set<FidelityMotionSource>(["mocap", "extracted", "embedded"]);
const CURATED_PROVENANCE = new Set<FidelityProvenance>(["curated", "user-uploaded"]);

/** Grade ONE character. Pure; downgrade-only from the A ingredients. */
export function gradeCharacterFidelity(input: CharacterFidelityInput): CharacterFidelity {
  const rig = input.rigGrade ?? "D";
  const provenance = input.provenance;
  const motion = input.motionSource ?? "unknown";
  const shading = input.shading ?? "none";
  const shadows = input.shadows ?? false;

  // PREVIZ FLOOR (C): a mascot/authored placeholder, or a rig too sparse to act (C/D),
  // is previz regardless of the other ingredients — its body acting is unreliable.
  if (MASCOT_PROVENANCE.has(provenance) || rig === "C" || rig === "D") {
    const why =
      MASCOT_PROVENANCE.has(provenance)
        ? "authored placeholder / mascot rig"
        : `sparse rig (grade ${rig}) — crude retarget only`;
    return { id: input.id, grade: "C", previz: true, reason: `previz: ${why}` };
  }

  // A: curated/uploaded rig (grade A) + real motion + shading + shadows — the full stack.
  const realMotion = REAL_MOTION.has(motion);
  const shaded = shading === "cel" || shading === "pbr";
  if (CURATED_PROVENANCE.has(provenance) && rig === "A" && realMotion && shaded && shadows) {
    return {
      id: input.id,
      grade: "A",
      previz: false,
      reason: "curated/uploaded grade-A rig with real motion, shading and shadows"
    };
  }

  // B: a catalog (or curated) rig that graded OK (A/B) but is missing one A ingredient
  // (procedural motion, shadows off, or unshaded) — a watchable catalog take, not previz.
  const missing: string[] = [];
  if (!realMotion) missing.push("procedural motion");
  if (!shaded) missing.push("no cel/PBR shading");
  if (!shadows) missing.push("shadows off");
  if (!CURATED_PROVENANCE.has(provenance)) missing.push("catalog rig");
  return {
    id: input.id,
    grade: "B",
    previz: false,
    reason: missing.length ? `catalog-grade: ${missing.join(", ")}` : "graded-ok rig"
  };
}

/** Grade a whole SCENE: the floor of its characters (worst grade wins; empty scene → C/previz). */
export function gradeSceneFidelity(characters: readonly CharacterFidelityInput[]): SceneFidelity {
  const graded = characters.map(gradeCharacterFidelity);
  if (graded.length === 0) {
    return { grade: "C", previz: true, characters: graded, reason: "previz: no characters in the scene" };
  }
  const order: Record<FidelityGrade, number> = { A: 3, B: 2, C: 1 };
  let worst: FidelityGrade = "A";
  for (const g of graded) if (order[g.grade] < order[worst]) worst = g.grade;
  const previz = worst === "C";
  const reason = previz
    ? `previz: lowest character grade is C (${graded.filter((g) => g.grade === "C").map((g) => g.id).join(", ")})`
    : `scene grade ${worst} (floor of ${graded.length} character grade(s))`;
  return { grade: worst, previz, characters: graded, reason };
}

/** Human one-word tier label for a grade (used by report + UI badge). */
export function fidelityLabel(grade: FidelityGrade): string {
  return grade === "C" ? "Previz" : `Grade ${grade}`;
}
