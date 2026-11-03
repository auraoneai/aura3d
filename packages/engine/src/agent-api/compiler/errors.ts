// AuraRuntimeError + AuraMigrationError moved to contracts/runtimeError.ts (2026-11-02) so nodes/
// can throw it without value-importing compiler/ (layering gate). This module
// re-exports the same class, so existing compiler/app importers and
// `instanceof` checks are unchanged.
export { AuraRuntimeError, AuraMigrationError } from "../../contracts/runtimeError.js";
