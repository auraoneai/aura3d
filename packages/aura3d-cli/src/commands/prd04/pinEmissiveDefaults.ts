/**
 * C-39 codemod registration: `pin-emissive-defaults` (PRD-04 §10.6).
 * Implementation lives in tools/codemods/pin-emissive-defaults.mjs — the
 * CONTRACTS §4.1-owned path, shared with standalone `node` invocation.
 *
 * The .mjs is resolved LAZILY inside `transform`: `commands/registry.js` loads
 * this module on every CLI invocation, and a top-level import would crash the
 * packaged CLI (its dist tree does not ship `tools/`). Deferred resolution keeps
 * startup clean; invoking the codemod outside the monorepo raises a clear error.
 */
import { createRequire } from "node:module";
import { registerCodemod, type AuraCodemod } from "../../contracts/commands.js";

type Transform = AuraCodemod["transform"];

const requireFromHere = createRequire(import.meta.url);
let impl: Transform | undefined;

function loadTransform(): Transform {
  if (impl === undefined) {
    try {
      impl = (requireFromHere("../../../../../tools/codemods/pin-emissive-defaults.mjs") as { transform: Transform }).transform;
    } catch (error) {
      throw new Error(
        "aura3d codemod pin-emissive-defaults: implementation module " +
        `tools/codemods/pin-emissive-defaults.mjs is not reachable (${(error as Error).message}). ` +
        "This codemod is only available from the monorepo source tree."
      );
    }
  }
  return impl;
}

export const pinEmissiveDefaults: AuraCodemod = {
  name: "pin-emissive-defaults",
  owner: "prd04",
  description:
    "Pins legacy emissiveIntensity defaults (emissive 1.35, neon 2.8) on material.emissive(...) calls, " +
    "material.neon(...) calls and emissive object literals missing the field.",
  transform: (source, fileName) => loadTransform()(source, fileName)
};

registerCodemod(pinEmissiveDefaults);
