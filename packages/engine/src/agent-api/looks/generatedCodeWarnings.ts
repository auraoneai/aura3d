// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraSceneSnapshot } from "../index.js";
import { createAssetProvenance, groups, primitive } from "../index.js";
import { createProductionPrimitiveTextureIntent } from "../compiler/textures.js";
import { material } from "../nodes/material.js";

export function collectGeneratedCodeWarnings(snapshot: AuraSceneSnapshot): string[] {
  const warnings: string[] = [];
  if (!snapshot.nodes.some((node) => node.kind === "light")) {
    warnings.push("Scene has no lights. Suggested fix: add lights.studio() or lights.ambient().");
  }
  if (!snapshot.nodes.some((node) => node.kind === "interaction")) {
    warnings.push("Scene has no interactions. Suggested fix: add interactions.orbit() for product/viewer scenes.");
  }
  const flatNodes = groups.flatten(snapshot.nodes);
  // muse3jsparity-PRD C1: procedural texture inputs have no rasterizer. The
  // intent is compile-time known, so warn here; fetch outcomes stay dynamic.
  for (const node of flatNodes) {
    if (node.kind !== "primitive" || !node.material) continue;
    const label = node.name ?? `aura-primitive-${node.primitive}`;
    for (const procedural of createProductionPrimitiveTextureIntent(node.material).proceduralInputs) {
      warnings.push(`procedural texture ${procedural} on "${label}" has no rasterizer; recorded only, scalar material retained`);
    }
  }
  for (const node of snapshot.nodes) {
    if (node.kind === "model" && createAssetProvenance(node.asset).source === "unsafe-url") {
      warnings.push(`Model uses unsafeModelUrl("${node.asset.url}"). Suggested fix: run assets add and use typed assets.`);
    }
  }
  return warnings;
}
