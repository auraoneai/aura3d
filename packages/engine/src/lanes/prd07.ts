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
import { createEffectsExtension, prd07AppDisposed, prd07SystemFor } from "../agent-api/vfx/effects-api";
import { createAtmosphereExtension } from "../agent-api/vfx/atmosphere-api";
import { collectEffectsSection, collectAtmosphereSection } from "../agent-api/vfx/diagnostics";
import { registerPrd07LookLintRules } from "../agent-api/vfx/lookLint";
import { skyNodeHandler } from "../agent-api/compiler/sky";
import { registerPrd07OptionCoverage } from "../agent-api/compiler/effects";
import { setParticleUpdateMsProvider } from "../agent-api/nodes/particles";
import { lastParticleUpdateMs } from "@aura3d/rendering";

// P1-T3 — particle budget diagnostics read the measured `particles` scope
// through this seam (nodes/ may not value-import @aura3d/rendering).
setParticleUpdateMsProvider(lastParticleUpdateMs);

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
      prd07AppDisposed(value as object);
    }
  });
} catch (error) {
  if (!(error instanceof Error && error.message.startsWith("REGISTRY_DUPLICATE:prd07.effects"))) throw error;
}

try {
  registerAppExtension({
    id: "prd07.atmosphere",
    owner: "prd07",
    // GU47 E-B: the real atmosphere (live fog state and the compiler/fog.ts binding) installs under A3D_QR_VFX,
    // A3D_QR_VFX_SKY or A3D_QR_VFX_FOG alone (createAtmosphereExtension); it is not a sky-flag extension.
    flag: "A3D_QR_VFX",
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
    flag: "A3D_QR_VFX",
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
// app's live fog state. GU47 E-B: into the spec of the handle's own fog node
// (app-level setFog only applies to node-free scenes or with overrideSceneFog).
registerNodeHandleExtension({
  id: "prd07.setFog",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  member: "setFog",
  appliesTo: ["effect"],
  create: (handle, app) => (partial: Partial<AuraHeightFogSpec>) => {
    if (app && prd07SystemFor(app)?.atmosphere.setNodeFogByRuntimeId(handle.id, partial)) return;
    const atmosphere = (app as { atmosphere?: { setFog(s: Partial<AuraHeightFogSpec>, o?: { overrideSceneFog?: boolean }): void } } | undefined)?.atmosphere;
    atmosphere?.setFog(partial, { overrideSceneFog: true });
  }
});

// P1-T18 / §6.8 — look lint.
registerPrd07LookLintRules();

// P1-T15 — option coverage rows.
registerPrd07OptionCoverage();

export { skyNodeHandler } from "../agent-api/compiler/sky";
export { PRD07_DIAGNOSTIC_ONLY_FIELDS } from "../agent-api/compiler/diagnosticOnly.prd07";
export * from "../agent-api/vfx";
