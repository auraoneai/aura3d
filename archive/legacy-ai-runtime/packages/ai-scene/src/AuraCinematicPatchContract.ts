import type { AuraScenePatch } from "./AuraScenePatch.js";

export type AuraCinematicPatchCapability = "camera" | "atmosphere" | "lighting" | "hero" | "props" | "materials";

export interface AuraCinematicPatchContractResult {
  readonly ok: boolean;
  readonly capabilities: readonly AuraCinematicPatchCapability[];
  readonly diagnostics: readonly string[];
}

export function validateAuraCinematicPatchPrompt(prompt: string): AuraCinematicPatchContractResult {
  const lower = prompt.toLowerCase();
  const capabilities: AuraCinematicPatchCapability[] = [];
  if (/\b(camera|lens|closer|wide|low|high|dolly|push|pull)\b/.test(lower)) capabilities.push("camera");
  if (/\b(fog|mist|rain|storm|dry|clear|atmosphere)\b/.test(lower)) capabilities.push("atmosphere");
  if (/\b(light|rim|blue|red|pink|green|gold|warm|cold|bright|dark)\b/.test(lower)) capabilities.push("lighting");
  if (/\b(hero|robot|subject|larger|smaller|left|right|move|scale)\b/.test(lower)) capabilities.push("hero");
  if (/\b(prop|sign|lantern|umbrella|remove|add)\b/.test(lower)) capabilities.push("props");
  if (/\b(material|wet|metal|matte)\b/.test(lower)) capabilities.push("materials");
  return {
    ok: capabilities.length > 0,
    capabilities,
    diagnostics: capabilities.length > 0
      ? [`Patch prompt maps to ${capabilities.join(", ")}.`]
      : ["Patch prompt must mention camera, atmosphere, lighting, hero, props, or materials."]
  };
}

export function createAuraCinematicPatch(prompt: string, sceneId?: string): AuraScenePatch {
  const validation = validateAuraCinematicPatchPrompt(prompt);
  if (!validation.ok) throw new Error(validation.diagnostics[0]);
  return {
    patchId: `cinematic_patch_${hashPrompt(prompt)}`,
    sceneId,
    prompt,
    provider: "fixture",
    model: "cinematic-patch-contract",
    createdAt: new Date(0).toISOString(),
    operations: validation.capabilities.map((capability, index) => ({
      id: `patch_${capability}_${index}`,
      op: "merge",
      targetKind: capability === "materials" ? "material" : capability === "lighting" ? "lighting" : capability === "atmosphere" ? "vfx" : capability === "camera" ? "camera" : "object",
      targetId: capability === "lighting" ? "key" : capability === "camera" ? "camera_main" : capability === "materials" ? "mat_wet_pavement" : capability === "atmosphere" ? "rain_01" : "robot-expressive",
      value: { prompt, capability }
    }))
  };
}

function hashPrompt(prompt: string): string {
  let hash = 2166136261;
  for (let index = 0; index < prompt.length; index += 1) {
    hash ^= prompt.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
