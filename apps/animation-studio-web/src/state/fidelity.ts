/**
 * fidelity.ts (UI) — PRD Phase M7: honest quality tiering, surfaced in the studio shell.
 *
 * Mirrors the render-side rules in
 * `packages/create-aura3d/templates/animation-studio/src/fidelity.ts` so the badge the
 * user sees in the Outliner / scene header ALWAYS agrees with the resolver's fidelity
 * report. A grade-C character/scene is "previz" — the UI labels it as such and never
 * presents it as finished.
 *
 * The UI cannot import across the package boundary, so the (small, pure) grading rules
 * are duplicated here; a unit test pins the two copies to identical verdicts.
 */

export type FidelityGrade = "A" | "B" | "C";
export type FidelityRigGrade = "A" | "B" | "C" | "D";
export type FidelityProvenance = "curated" | "user-uploaded" | "catalog-resolved" | "authored-fallback";
export type FidelityMotionSource =
  | "mocap"
  | "extracted"
  | "embedded"
  | "procedural"
  | "idle"
  | "talk"
  | "fallback"
  | "unknown";

export interface CharacterFidelityInput {
  id: string;
  rigGrade?: FidelityRigGrade;
  provenance: FidelityProvenance;
  motionSource?: FidelityMotionSource;
  shading?: "cel" | "pbr" | "none";
  shadows?: boolean;
}

export interface CharacterFidelity {
  id: string;
  grade: FidelityGrade;
  previz: boolean;
  reason: string;
}

export interface SceneFidelity {
  grade: FidelityGrade;
  previz: boolean;
  characters: CharacterFidelity[];
  reason: string;
}

const MASCOT_PROVENANCE = new Set<FidelityProvenance>(["authored-fallback"]);
const REAL_MOTION = new Set<FidelityMotionSource>(["mocap", "extracted", "embedded"]);
const CURATED_PROVENANCE = new Set<FidelityProvenance>(["curated", "user-uploaded"]);

export function gradeCharacterFidelity(input: CharacterFidelityInput): CharacterFidelity {
  const rig = input.rigGrade ?? "D";
  const provenance = input.provenance;
  const motion = input.motionSource ?? "unknown";
  const shading = input.shading ?? "none";
  const shadows = input.shadows ?? false;

  if (MASCOT_PROVENANCE.has(provenance) || rig === "C" || rig === "D") {
    const why = MASCOT_PROVENANCE.has(provenance)
      ? "authored placeholder / mascot rig"
      : `sparse rig (grade ${rig}) — crude retarget only`;
    return { id: input.id, grade: "C", previz: true, reason: `previz: ${why}` };
  }

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

export function gradeSceneFidelity(characters: CharacterFidelityInput[]): SceneFidelity {
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

/** Human one-word tier label for the badge. C is "Previz" — never "finished". */
export function fidelityLabel(grade: FidelityGrade): string {
  return grade === "C" ? "Previz" : `Grade ${grade}`;
}
