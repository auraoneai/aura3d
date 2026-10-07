/**
 * Lane prd15 barrel — owned by lane 15 (CONTRACTS.md §3.8). `provide()` calls
 * for that lane's real implementations live here.
 *
 * T3.11 (C-36): bind the real compiler. The slot gates flag-off call sites;
 * `provide()` itself only registers the impl — `A3D_QR_COMPILER` selects it.
 */
import { compilerSlot } from "../contracts/compiler.js";
import { realCompilerImpl } from "../agent-api/compiler/compileScene.js";

if (!compilerSlot.provided) {
  compilerSlot.provide(realCompilerImpl);
}
