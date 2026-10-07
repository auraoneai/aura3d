/**
 * C-39 lane command registrations — prd08.
 *
 * Registers the `camera-cast` codemod and the `feel/evidence-only` doctor rule
 * (CONTRACTS.md C-39; implementations live in tools/camera-cast-codemod/).
 * `prd08 motion-report` lands with the motion benchmark scenes (phase 5).
 */
import { registerCodemod, registerDoctorRule } from "../../contracts/commands.js";
import { cameraCastCodemod } from "../../../../../tools/camera-cast-codemod/index.js";
import { feelLintRule } from "./feelLint.js";

registerCodemod(cameraCastCodemod);
registerDoctorRule(feelLintRule);

export {};
