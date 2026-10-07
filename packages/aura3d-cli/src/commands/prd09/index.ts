/**
 * C-39 lane command registrations — prd09 registers its `aura3d` commands
 * here via registerCliCommand (CONTRACTS.md): the `sfx admit` command, the
 * shared `perf-report` command and the four migration codemods whose output
 * regenerates the route patch sets when a route's HEAD moves.
 */
import "./sfx-admit";

import { registerCliCommand, registerCodemod } from "../../contracts/commands.js";
import { perfReportCommand } from "./perf-report.js";
import { captureBranchesCodemod } from "./codemods/capture-branches.js";
import { audioWrapperCodemod } from "./codemods/audio-wrapper.js";
import { evidenceGlobalsCodemod } from "./codemods/evidence-globals.js";
import { perfScriptCodemod } from "./codemods/perf-script.js";

registerCliCommand(perfReportCommand);
registerCodemod(captureBranchesCodemod);
registerCodemod(audioWrapperCodemod);
registerCodemod(evidenceGlobalsCodemod);
registerCodemod(perfScriptCodemod);
