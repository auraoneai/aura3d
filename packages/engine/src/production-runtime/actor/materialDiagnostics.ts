/**
 * materialDiagnostics.ts — C-31 `materials` section (PRD-04 §14 P2-5). Registers a
 * diagnostics section that fills `AuraMaterialDiagnostics` from the registered typed-GLB
 * actors (C-15 `inspectMaterials`), the shared texture-budget ledger (R16) and the C-27
 * quality settings.
 *
 * Measured-or-pending: program count / compile-ms read from the C-02 program-cache stats,
 * which live behind the lane-01 renderer and are not reachable from this layer — they
 * report 0 and raise `material-program-pending`. Per-material warnings from
 * `inspectMaterials()` (e.g. `variant-unknown:*`, `hardware-wrap-pending`) become issues
 * keyed by code.
 */
import { textureBudgetReport, prd04TransmissionDiagnostics } from "@aura3d/rendering";
import type { AuraApp } from "../../agent-api/index.js";
import type { AuraMaterialDiagnostics } from "../../contracts/materials.js";
import { registerDiagnosticsSection } from "../../contracts/diagnostics.js";
import { typedGLBActorQrFlags } from "./extensions.js";
import { registeredTypedGLBActors } from "./TypedGLBActorMaterials.js";

export function collectPrd04MaterialDiagnostics(app: AuraApp): AuraMaterialDiagnostics {
  const flags = typedGLBActorQrFlags();
  const materialsOn = flags.on("A3D_QR_MATERIALS");
  const budget = textureBudgetReport();
  const issues: { readonly code: string; readonly material: string; readonly message: string }[] = [
    {
      code: "material-program-pending",
      material: "*",
      message: "Program count/compile-ms are reported by the C-02 program-cache stats, which are not reachable from the actor layer yet"
    }
  ];
  for (const actor of registeredTypedGLBActors()) {
    for (const info of actor.inspectMaterials()) {
      for (const warning of info.warnings) {
        issues.push({ code: warning.split(":")[0] ?? warning, material: info.name, message: warning });
      }
    }
  }
  // P4-1: real transmission-capture state from the lane contributor (target
  // allocated this frame, format, mip chain, C-28 issues like
  // `transmission-ldr-capture`).
  const transmission = prd04TransmissionDiagnostics();
  for (const issue of transmission.issues) {
    issues.push({ code: issue, material: "*", message: issue });
  }
  return {
    programs: 0,
    programCompileMs: 0,
    transmissionTargetActive: transmission.targetActive,
    lightsDroppedByMaterial: 0,
    paths: {
      materialModel: materialsOn ? "physical-r185" : "legacy",
      transmission: flags.on("A3D_QR_MATERIALS_TRANSMISSION") ? "auto" : "off",
      ktx2: flags.on("A3D_QR_MATERIALS_KTX2") ? "basis" : "unavailable",
      tangents: materialsOn ? "mikktspace" : "derivative"
    },
    textureBytes: budget.textureBytes,
    textureBudgetBytes: app.quality?.settings.textureBudgetBytes ?? 0,
    downscaledTextures: budget.downscaled.length,
    issues
  };
}

let diagnosticsRegistered = false;

export function registerPrd04MaterialDiagnostics(): () => void {
  if (diagnosticsRegistered) return () => {};
  diagnosticsRegistered = true;
  const unregister = registerDiagnosticsSection({
    id: "prd04.materials",
    owner: "prd04",
    flag: "A3D_QR_MATERIALS",
    key: "materials",
    collect: collectPrd04MaterialDiagnostics
  });
  return () => {
    unregister();
    diagnosticsRegistered = false;
  };
}
