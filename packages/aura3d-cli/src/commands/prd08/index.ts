/**
 * C-39 lane command registrations — prd08.
 *
 * Registers the `camera-cast` codemod and the `feel/evidence-only` doctor rule
 * (CONTRACTS.md C-39; implementations live in tools/camera-cast-codemod/).
 * and `prd08 motion-report` (S9: renders the motion-scene capture report).
 */
import { registerCliCommand, registerCodemod, registerDoctorRule } from "../../contracts/commands.js";
import { cameraCastCodemod } from "../../../../../tools/camera-cast-codemod/index.js";
import { feelLintRule } from "./feelLint.js";
import { motionReportCommand } from "./motionReport.js";

registerCodemod(cameraCastCodemod);
registerDoctorRule(feelLintRule);
registerCliCommand(motionReportCommand);

export {};
