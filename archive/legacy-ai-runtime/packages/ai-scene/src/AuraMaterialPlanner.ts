import type { AuraMaterialPlan } from "./AuraSceneIR.js";

export function planMaterialFromTags(id: string, label: string, tags: readonly string[]): AuraMaterialPlan {
  const tagSet = new Set(tags);
  if (tagSet.has("glass")) return { id, label, baseColor: [0.7, 0.9, 1, 0.45], metallic: 0, roughness: 0.06, transmission: 0.55, source: "default" };
  if (tagSet.has("metal") || tagSet.has("robot")) return { id, label, baseColor: [0.9, 0.72, 0.32, 1], metallic: 0.55, roughness: 0.34, clearcoat: 0.2, source: "default" };
  if (tagSet.has("plant") || tagSet.has("organic")) return { id, label, baseColor: [0.22, 0.75, 0.36, 1], metallic: 0.02, roughness: 0.56, emissive: [0.02, 0.18, 0.05], emissiveStrength: 0.6, source: "default" };
  return { id, label, baseColor: [0.78, 0.8, 0.84, 1], metallic: 0.05, roughness: 0.46, source: "default" };
}
