// PRD-07 lane barrel (engine side) — contract registrations for VFX /
// particles / atmospherics. Importing this file wires C-38 app extensions
// (`effects`, `atmosphere`), C-31 diagnostics sections, the C-36 `sky` node
// handler and `setFog` handle extension, look-lint rules, option coverage,
// and CLI/codemod registrations. Everything behind A3D_QR_VFX sub-flags at
// factory time, so flag-off keeps the PR 0a stubs.

import { registerAppExtension } from "../contracts/app";
import { registerDiagnosticsSection } from "../contracts/diagnostics";
import { registerNodeHandler } from "../contracts/compiler";
import { registerNodeHandleExtension } from "../contracts/runtimeNodes";
import type { AuraHeightFogSpec } from "../contracts/atmosphere";
import { createEffectsExtension } from "../agent-api/vfx/effects-api";
import { createAtmosphereExtension } from "../agent-api/vfx/atmosphere-api";
import { collectEffectsSection, collectAtmosphereSection } from "../agent-api/vfx/diagnostics";
import { registerPrd07LookLintRules } from "../agent-api/vfx/lookLint";
import { skyNodeHandler } from "../agent-api/compiler/sky";
import { registerPrd07OptionCoverage } from "../agent-api/compiler/effects";

// C-38 — app.effects and app.atmosphere. createAuraApp's extension loop calls
// create() with {flags, options}; the factories return stubs when the flag is
// off so flag-off apps are byte-identical.
try {
  registerAppExtension({
    id: "prd07.effects",
    owner: "prd07",
    flag: "A3D_QR_VFX",
    member: "effects",
    create: (app, ctx) => createEffectsExtension(app, ctx),
    dispose: (value) => {
      (value as { clear?: () => void }).clear?.();
    }
  });
} catch (error) {
  if (!(error instanceof Error && error.message.startsWith("REGISTRY_DUPLICATE:prd07.effects"))) throw error;
}

try {
  registerAppExtension({
    id: "prd07.atmosphere",
    owner: "prd07",
    flag: "A3D_QR_VFX_SKY",
    member: "atmosphere",
    create: (app, ctx) => createAtmosphereExtension(app, ctx)
  });
} catch (error) {
  if (!(error instanceof Error && error.message.startsWith("REGISTRY_DUPLICATE:prd07.atmosphere"))) throw error;
}

// C-31 — diagnostics sections.
try {
  registerDiagnosticsSection({
    id: "prd07.effects",
    owner: "prd07",
    flag: "A3D_QR_VFX",
    key: "effects",
    collect: (app) => collectEffectsSection(app)
  });
  registerDiagnosticsSection({
    id: "prd07.atmosphere",
    owner: "prd07",
    flag: "A3D_QR_VFX_SKY",
    key: "atmosphere",
    collect: (app) => collectAtmosphereSection(app)
  });
} catch (error) {
  if (!(error instanceof Error && error.message.startsWith("REGISTRY_DUPLICATE"))) throw error;
}

// C-36 — sky node handler.
try {
  registerNodeHandler(skyNodeHandler);
} catch (error) {
  if (!(error instanceof Error && error.message.startsWith("NODE_HANDLER_DUPLICATE"))) throw error;
}

// C-36 — handle.setFog for fog effect nodes: node-handle writes merge into the
// app's live fog state.
registerNodeHandleExtension({
  id: "prd07.setFog",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  member: "setFog",
  appliesTo: ["effect"],
  create: (_handle, app) => (partial: Partial<AuraHeightFogSpec>) => {
    const atmosphere = (app as { atmosphere?: { setFog(s: Partial<AuraHeightFogSpec>): void } }).atmosphere;
    atmosphere?.setFog(partial);
  }
});

// P1-T18 / §6.8 — look lint.
registerPrd07LookLintRules();

// P1-T15 — option coverage rows.
registerPrd07OptionCoverage();

export { skyNodeHandler } from "../agent-api/compiler/sky";
export { PRD07_DIAGNOSTIC_ONLY_FIELDS } from "../agent-api/compiler/diagnosticOnly.prd07";
export * from "../agent-api/vfx";
