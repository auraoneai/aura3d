/**
 * C-39 lane command registrations — prd13 (CONTRACTS.md).
 *
 * `aura3d look capture|judge|rubric|lint` (T2.16–T2.18) plus the
 * `look-from-ambient` codemod (§11.5). The `doctor --look` alias is Q-05-2;
 * `doctor` is a PRD 05 verb, so the forwarding lives on that lane. `look lint`
 * already hosts every C-39 registerDoctorRule rule, so registered rules run
 * today without the alias.
 *
 * PRD 13 also registers a default `look/capture-branch` doctor rule — but only
 * when PRD 09 has not already registered that code (it owns it when it lands;
 * C-39 duplicate registration throws, so the guard is required, not optional).
 */

import { doctorRulesAll, registerCliCommand, registerCodemod, registerDoctorRule } from "../../contracts/commands.js";
import { lookCaptureCommand } from "../../look/capture.js";
import { lookJudgeCommand, lookRubricCommand } from "../../look/judge.js";
import { defaultCaptureBranchRule, lookFromAmbientCodemod, lookLintCommand } from "../../look/lint-static.js";

registerCliCommand(lookCaptureCommand);
registerCliCommand(lookJudgeCommand);
registerCliCommand(lookRubricCommand);
registerCliCommand(lookLintCommand);
registerCodemod(lookFromAmbientCodemod);

if (!doctorRulesAll().some((rule) => rule.code === defaultCaptureBranchRule.code)) {
  registerDoctorRule(defaultCaptureBranchRule);
}
