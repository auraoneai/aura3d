/**
 * materialDiagnostics.ts — C-31 `materials` section (PRD-04 §14 P2-5). Registers a
 * diagnostics section that fills `AuraMaterialDiagnostics` from the app's typed-GLB
 * actors (C-15 `inspectMaterials`), its renderer device's texture-budget ledger (R16) and the C-27
 * quality settings.
 *
 * Measured-or-pending (04-S15): program count / compile-ms read from the C-02 program-cache
 * stats of the live renderer, reached through the `Symbol.for("a3d.prd01.renderer")` seam that
 * `createAuraApp` attaches (registry identity, so no lane-01 import) and peeked with
 * `rendererProgramCachePeek` (never creates the per-device cache). Without a renderer or cache
 * they report 0 and raise `material-program-pending`. Per-material warnings from
 * `inspectMaterials()` (e.g. `variant-unknown:*`, `hardware-wrap-pending`) become issues
 * keyed by code.
 */
import { textureBudgetReport, rendererProgramCachePeek } from "@aura3d/rendering";
import type { AuraApp } from "../../agent-api/index.js";
import type { AuraMaterialDiagnostics } from "../../contracts/materials.js";
import { registerDiagnosticsSection } from "../../contracts/diagnostics.js";
import { actorAnimationContextFor } from "../../agent-api/app/actorAnimationHandle.js";

const RENDERER_SEAM = Symbol.for("a3d.prd01.renderer");

type ProgramCacheStats = { readonly compiled: number; readonly compileMsTotal: number };
type TransmissionSnapshot = { readonly targetActive: boolean; readonly issues: readonly string[] };
type MaterialDiagnosticsRenderer = {
  readonly device?: unknown;
  transmissionDiagnostics?(): readonly TransmissionSnapshot[];
};

function rendererFor(app: AuraApp): MaterialDiagnosticsRenderer | undefined {
  return (app as unknown as Record<symbol, MaterialDiagnosticsRenderer | undefined>)[RENDERER_SEAM];
}

/** C-02 program-cache stats of the app's live renderer, or undefined when unreachable. */
function programCacheStats(app: AuraApp): ProgramCacheStats | undefined {
  const renderer = rendererFor(app);
  const device = renderer?.device;
  if (!device) return undefined;
  return rendererProgramCachePeek(device as Parameters<typeof rendererProgramCachePeek>[0])?.stats();
}

export function collectPrd04MaterialDiagnostics(app: AuraApp): AuraMaterialDiagnostics {
  const actorState = actorAnimationContextFor(app).state;
  const flags = actorState.flags ?? { values: {}, on: () => false };
  const materialsOn = flags.on("A3D_QR_MATERIALS");
  const device = rendererFor(app)?.device;
  const budget = device ? textureBudgetReport(device as Parameters<typeof textureBudgetReport>[0]) : { textureBytes: 0, downscaled: [] };
  const programStats = programCacheStats(app);
  const issues: { readonly code: string; readonly material: string; readonly message: string }[] = programStats
    ? []
    : [
        {
          code: "material-program-pending",
          material: "*",
          message: "No live renderer program cache on this app (renderer seam absent or cache not created yet); program count/compile-ms report 0"
        }
      ];
  for (const actor of actorState.actors.values()) {
    for (const info of actor.inspectMaterials()) {
      for (const warning of info.warnings) {
        issues.push({ code: warning.split(":")[0] ?? warning, material: info.name, message: warning });
      }
    }
  }
  // The renderer owns resource-free snapshots for its own views and most
  // recent authored frame. Never consult a process-wide last capture.
  const transmission = rendererFor(app)?.transmissionDiagnostics?.();
  if (flags.on("A3D_QR_MATERIALS_TRANSMISSION") && (!transmission || transmission.length === 0)) {
    issues.push({
      code: "transmission-diagnostics-pending",
      material: "*",
      message: "No transmission frame diagnostics are available for this app's renderer"
    });
  }
  const transmissionIssues = new Set(transmission?.flatMap((entry) => entry.issues) ?? []);
  for (const issue of transmissionIssues) {
    issues.push({ code: issue, material: "*", message: issue });
  }
  return {
    programs: programStats?.compiled ?? 0,
    programCompileMs: programStats?.compileMsTotal ?? 0,
    transmissionTargetActive: transmission?.some((entry) => entry.targetActive) ?? false,
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
