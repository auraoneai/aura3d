// PRD-07 P1-T18 — look-lint rule `look/fake-effect-names` (PRD-07 §6.8).
// Flags (a) `primitive` nodes named like VFX — the tell that a scene fakes an
// effect with geometry — and (b) `effect` nodes whose effect kind never
// produced pixels this frame (`capabilities.effectsPixelBacked`).

import { registerLookLintRule, type AuraLookLintContext, type AuraLookLintFinding } from "../../contracts/looks";
import type { AuraSceneSnapshot } from "../index";

const FAKE_NAME = /spark|smoke|fire|rain|snow|explosion|trail|fog|sky/i;

function lintScene(scene: AuraSceneSnapshot, ctx: AuraLookLintContext): AuraLookLintFinding[] {
  const findings: AuraLookLintFinding[] = [];
  const pixelBacked = ctx.capabilities?.effectsPixelBacked ?? [];
  const nodes = (scene.nodes ?? []) as readonly { kind?: string; effect?: string; name?: string }[];
  for (const node of nodes) {
    const name = node.name ?? "";
    if (node.kind === "primitive") {
      const fake = name.match(FAKE_NAME)?.[0]?.toLowerCase();
      if (!fake) continue;
      findings.push({
        code: "look/fake-effect-names",
        message: `primitive node "${name}" names "${fake}" — use an effect node (${fake === "rain" || fake === "snow" ? fake : "particles"}) so the effect produces pixels`,
        severity: "warning",
        nodes: [name]
      } as AuraLookLintFinding);
      continue;
    }
    if (node.kind === "effect") {
      const effect = node.effect ?? "";
      if (effect && !pixelBacked.includes(effect)) {
        findings.push({
          code: "look/fake-effect-names",
          message: `effect node "${name}" (${effect}) produced no pixels — it is not in capabilities.effectsPixelBacked`,
          severity: "warning",
          nodes: [name]
        } as AuraLookLintFinding);
      }
    }
  }
  return findings;
}

export function registerPrd07LookLintRules(): void {
  try {
    registerLookLintRule({ code: "look/fake-effect-names", owner: "prd07", run: (scene, ctx) => lintScene(scene, ctx) });
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith("LOOK_RULE_DUPLICATE"))) throw error;
  }
}
