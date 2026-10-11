/**
 * C-39 lane command registrations — prd11 (CONTRACTS.md).
 *
 * - `aura3d perf gate --report <file>` → tools/perf-gate (11-CODE CLI).
 * - `prd11-batch-optout` report-only codemod (11-CODE codemod, Q-14-11 / #121).
 */
import { registerCliCommand, registerCodemod } from "../../contracts/commands.js";
import { batchOptoutCodemod } from "./batchOptout.js";
import { perfGateCommand } from "./perfGate.js";

registerCliCommand(perfGateCommand);
registerCodemod(batchOptoutCodemod);

export {};
