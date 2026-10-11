// PRD-07 P1-T18 — look-lint rule `look/fake-effect-names` (PRD-07 §6.8).
// Lane 07 owns this code (C-34) and its registration replaces the lane-13
// default, so it must keep that default's coverage (#879). It flags:
// (a) any node, including groups and their children, whose name matches the
//     PRD-13 research §4.4 fake-effect names / stems (`isFakeEffectName`);
// (b) `primitive` nodes named like VFX — the tell that a scene fakes an
//     effect with geometry;
// (c) `effect` nodes whose effect kind never produced pixels this frame
//     (`capabilities.effectsPixelBacked`).
// One finding per node; a node is reported at most once.

import { registerLookLintRule, type AuraLookLintContext, type AuraLookLintFinding } from "../../contracts/looks";
// Pure data + matcher (no registration side effects). Imported by module path,
// not through `lanes/prd13`, so loading lane 07 never installs lane 13.
import { isFakeEffectName } from "../looks/fakeEffectNames.js";
import type { AuraSceneSnapshot } from "../index";

const FAKE_NAME = /spark|smoke|fire|rain|snow|explosion|trail|fog|sky/i;

interface LintNode {
  readonly kind?: string;
  readonly effect?: string;
  readonly name?: string;
  readonly children?: readonly LintNode[];
}

/** Every node in scene order, groups included (fake names hide on either). */
function allNodes(nodes: readonly LintNode[]): LintNode[] {
  const out: LintNode[] = [];
  const walk = (list: readonly LintNode[]): void => {
    for (const node of list) {
      out.push(node);
      if (node.kind === "group" && Array.isArray(node.children)) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

function finding(message: string, name: string): AuraLookLintFinding {
  return { code: "look/fake-effect-names", message, severity: "warning", nodes: [name] } as AuraLookLintFinding;
}

function lintScene(scene: AuraSceneSnapshot, ctx: AuraLookLintContext): AuraLookLintFinding[] {
  const findings: AuraLookLintFinding[] = [];
  const pixelBacked = ctx.capabilities?.effectsPixelBacked ?? [];
  for (const node of allNodes((scene.nodes ?? []) as readonly LintNode[])) {
    const name = node.name ?? "";
    if (node.kind === "primitive") {
      const fake = name.match(FAKE_NAME)?.[0]?.toLowerCase();
      if (fake) {
        findings.push(finding(`primitive node "${name}" names "${fake}" — use an effect node (${fake === "rain" || fake === "snow" ? fake : "particles"}) so the effect produces pixels`, name));
        continue;
      }
    }
    if (node.kind === "effect") {
      const effect = node.effect ?? "";
      if (effect && !pixelBacked.includes(effect)) {
        findings.push(finding(`effect node "${name}" (${effect}) produced no pixels — it is not in capabilities.effectsPixelBacked`, name));
        continue;
      }
    }
    if (isFakeEffectName(node.name)) {
      findings.push(finding(`${node.kind ?? "node"} "${name}" imitates an engine feature (research §4.4 fake-effect name) — use the real feature`, name));
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
