// PRD-13 T1.13 — the C-31 `"look"` diagnostics section (CONTRACTS §13.1).
// `diagnostics().look` reports which look the authored snapshot carries, the
// expansion it resolves to, the v1 contracts still stubbed, and the `lookLint`
// findings for the snapshot. With `A3D_QR_LOOKS` off the section returns the
// documented empty value `{ id: null, expansion: "none", missingContracts: [],
// lint: [] }`.

import type { QrFlags } from "@aura3d/rendering/contracts";
import { environmentProbeFactorySlot, particleRenderHookSlot } from "@aura3d/rendering/contracts";
import type { AuraApp } from "../index.js";
import type { DiagnosticsSection } from "../../contracts/diagnostics.js";
import { resolveQrFlags } from "../../contracts/flags.js";
import type { AuraLookDiagnostics, AuraLookLintContext } from "../../contracts/looks.js";
import { lookLint } from "../../contracts/looks.js";
import { looks, resolveLookExpansion } from "./looks.js";

const EMPTY_LOOK_DIAGNOSTICS: AuraLookDiagnostics = {
  id: null,
  expansion: "none",
  missingContracts: [],
  lint: []
};

function sectionFlags(): QrFlags {
  const env = typeof process !== "undefined" && process.env ? process.env : {};
  const url = typeof location !== "undefined" ? location.href : undefined;
  return resolveQrFlags({ url, env });
}

export const lookDiagnosticsSection: DiagnosticsSection<AuraLookDiagnostics> = {
  id: "look",
  key: "look",
  owner: "prd13",
  flag: "A3D_QR_LOOKS",

  collect(app: AuraApp): AuraLookDiagnostics {
    const flags = sectionFlags();
    if (!flags.on("A3D_QR_LOOKS")) return EMPTY_LOOK_DIAGNOSTICS;
    const snapshot = app.scene;
    const { expansion, missingContracts } = resolveLookExpansion({ flags });
    const lintContext: AuraLookLintContext = {
      devicePixelRatio: typeof globalThis.devicePixelRatio === "number" ? globalThis.devicePixelRatio : 1,
      tierCap: 2,
      production: false,
      capabilities: {
        ambientAdditive: environmentProbeFactorySlot.provided && flags.on("A3D_QR_LIGHTING"),
        effectsPixelBacked: particleRenderHookSlot.provided && flags.on("A3D_QR_VFX")
          ? ["rain", "particles", "motion-trail"]
          : []
      }
    };
    return {
      id: looks.resolveDefault(snapshot).id,
      expansion,
      missingContracts,
      lint: lookLint(snapshot, lintContext)
    };
  }
};
