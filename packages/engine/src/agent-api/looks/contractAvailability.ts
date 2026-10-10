// PRD-13 — contract-slot availability for the prompt-plan compiler.
// `nodes/` may not value-import `@aura3d/rendering` (PRD-15 §6.3 layering
// gate), so the slot probes `compilePromptPlanV2` needs live here in the
// looks tier, next to `lookDiagnostics.ts`, which reads the same slots.

import type { QrFlags } from "@aura3d/rendering/contracts";
import { particleRenderHookSlot, skyBackgroundSlot } from "@aura3d/rendering/contracts";
import { appExtensionsAll } from "../../contracts/app.js";

/** C-20 emitters are pixel-backed only when the slot is real and `A3D_QR_VFX` is on. */
export function pixelBackedEffectsAvailable(flags: QrFlags): boolean {
  return particleRenderHookSlot.provided && flags.on("A3D_QR_VFX");
}

/** Whether a prompt-plan mapping's required contract has a real provider. */
export function promptContractAvailable(contract: string, flags: QrFlags): boolean {
  if (contract === "C-21") return skyBackgroundSlot.provided && flags.on("A3D_QR_VFX");
  if (contract === "C-13") {
    return flags.on("A3D_QR_POST") && appExtensionsAll().some((entry) => entry.member === "post" && entry.owner !== "prd15");
  }
  return false;
}
