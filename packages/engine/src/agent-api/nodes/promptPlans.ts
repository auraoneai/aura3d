// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraPromptResolvedSubject, AuraPromptPlanSubject, AuraPromptSubjectResolver, AuraPromptPlan } from "./types.js";
import { AuraSceneBuilder, scene } from "./scene.js";
import { compilePromptPlan } from "./prompt/promptPlan.js";

export function promptSubjectIsResolved(s: AuraPromptPlanSubject): s is AuraPromptResolvedSubject {
  return "asset" in s;
}

export async function resolvePromptPlanSubject(
  plan: AuraPromptPlan,
  resolver: AuraPromptSubjectResolver
): Promise<AuraPromptPlan> {
  if (promptSubjectIsResolved(plan.subject)) {
    return plan;
  }
  const intent = plan.subject;
  const result = await resolver.resolve({ text: intent.intent, constraints: intent.constraints });
  if (!result) {
    throw new Error(
      `No auto-pullable asset matched the prompt-plan intent "${intent.intent}". ` +
        "Refine the intent or constraints (maxTriangles/license/animated), or provide a concrete typed asset " +
        "(e.g. a file via `assets add` / a typed asset ref) before compiling."
    );
  }
  const resolvedSubject: AuraPromptResolvedSubject = {
    asset: result.asset,
    ...(intent.label !== undefined ? { label: intent.label } : {})
  };
  return { ...plan, subject: resolvedSubject };
}

export function promptPlanToScene(plan: AuraPromptPlan): AuraSceneBuilder {
  return compilePromptPlan(plan).scene;
}
