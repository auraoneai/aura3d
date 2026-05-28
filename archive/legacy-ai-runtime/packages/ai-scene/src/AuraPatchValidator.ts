import type { AuraSceneIR } from "./AuraSceneIR.js";
import type { AuraScenePatch } from "./AuraScenePatch.js";
import type { AuraSceneValidationIssue } from "./AuraSceneValidator.js";

export function validateScenePatch(scene: AuraSceneIR, patch: AuraScenePatch): readonly AuraSceneValidationIssue[] {
  const ids = new Set([
    ...scene.objects.map((entry) => entry.id),
    ...scene.materials.map((entry) => entry.id),
    ...scene.cameras.map((entry) => entry.id),
    ...scene.timeline.map((entry) => entry.id),
    scene.lighting.id
  ]);
  return (patch.operations ?? [])
    .filter((operation) => operation.op !== "add" && !ids.has(operation.targetId))
    .map((operation) => ({
      path: `$.operations[${operation.id}]`,
      code: "PATCH_TARGET_NOT_FOUND",
      severity: "error" as const,
      message: `Patch target '${operation.targetId}' does not exist.`,
      fixSuggestion: "Use stable IDs from the current AuraSceneIR."
    }));
}
