/**
 * C-39 codemod registration: `pin-emissive-defaults` (PRD-04 §10.6).
 * Implementation lives in tools/codemods/pin-emissive-defaults.mjs — the
 * CONTRACTS §4.1-owned path, shared with standalone `node` invocation.
 * TS cannot type a repo-relative `.mjs` import under Bundler resolution, so
 * the import is untyped here and the rows payload is narrowed below.
 */
// @ts-ignore: .mjs codemod impl; vitest/node resolve it at runtime.
import { transform } from "../../../../../tools/codemods/pin-emissive-defaults.mjs";
import { registerCodemod, type AuraCodemod } from "../../contracts/commands.js";

export const pinEmissiveDefaults: AuraCodemod = {
  name: "pin-emissive-defaults",
  owner: "prd04",
  description:
    "Pins legacy emissiveIntensity defaults (emissive 1.35, neon 2.8) on material.emissive(...) calls, " +
    "material.neon(...) calls and emissive object literals missing the field.",
  transform: transform as AuraCodemod["transform"]
};

registerCodemod(pinEmissiveDefaults);
