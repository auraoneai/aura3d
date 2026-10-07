// PRD-13 T1.6 — generated-code warnings: the §6.2 prose catalogue applied to a
// scene snapshot, replacing the 1.0-quality "no lights" line once
// `A3D_QR_LOOKS` is on. Flag off: identical legacy text (§6.2).
// Flag on: `lookLint` output, so app.diagnostics().warnings carries the same
// `look/*` strings app.diagnostics().look.lint reports (§7.2).

import type { AuraSceneSnapshot } from "../nodes/types.js";
import { createAssetProvenance } from "../diagnostics.js";
import { groups } from "../nodes/groups.js";
import { createProductionPrimitiveTextureIntent } from "../compiler/textures.js";
import type { QrFlags } from "@aura3d/rendering/contracts";
import type { AuraLookLintContext } from "../../contracts/looks.js";
import { environmentProbeFactorySlot } from "@aura3d/rendering/contracts";
import { resolveQrFlags } from "../../contracts/flags.js";
import { lookLint } from "../../contracts/looks.js";

/** The §6.2 flag-off sentence — byte-identical to the 1.0 diagnostic. */
const NO_LIGHTS_MESSAGE =
  "Scene has no lights. Suggested fix: add lights.studio() or lights.ambient().";

export interface GeneratedCodeWarningsContext {
  readonly production?: boolean;
  readonly devicePixelRatio?: number;
  readonly capabilities?: AuraLookLintContext["capabilities"];
}

/**
 * `flags` and `context` are optional: createAuraApp passes its resolved flags
 * and renderer quality profile; the legacy path only needs the snapshot.
 */
export function collectGeneratedCodeWarnings(
  snapshot: AuraSceneSnapshot,
  flags?: QrFlags,
  context?: GeneratedCodeWarningsContext
): string[] {
  const resolved = flags ?? resolveQrFlags({ env: typeof process !== "undefined" ? process.env : {} });
  if (!resolved.on("A3D_QR_LOOKS")) return legacyWarnings(snapshot);

  // §7.2 context from the assembled app state: ambientAdditive means C-09 is
  // real AND flagged (today's stub leaves it false → ambient-kills-ibl fires).
  const lintContext: AuraLookLintContext = {
    devicePixelRatio:
      context?.devicePixelRatio ??
      (typeof globalThis.devicePixelRatio === "number" ? globalThis.devicePixelRatio : 1),
    tierCap: Number.POSITIVE_INFINITY,
    production: context?.production ?? false,
    capabilities:
      context?.capabilities ?? {
        ambientAdditive: environmentProbeFactorySlot.provided && resolved.on("A3D_QR_LIGHTING"),
        effectsPixelBacked: []
      }
  };
  return lookLint(snapshot, lintContext).map((finding: { message: string }) => finding.message);
}

/** 1.0 behaviour — the original collectGeneratedCodeWarnings body, verbatim. */
function legacyWarnings(snapshot: AuraSceneSnapshot): string[] {
  const warnings: string[] = [];
  if (!snapshot.nodes.some((node) => node.kind === "light")) {
    warnings.push(NO_LIGHTS_MESSAGE);
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
