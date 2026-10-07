/**
 * C-34 — looks and lookLint (CONTRACTS.md). Provider: PRD 13. Flag: A3D_QR_LOOKS.
 */

import type { PrdId } from "@aura3d/rendering/contracts";
import type { AuraSceneSnapshot, AuraColor } from "../agent-api/index";
import type { AuraBiomeId } from "./world";
import type { AppliedLookReport } from "./diagnostics";

export type AuraStudioLookId = "product-studio" | "character-showcase" | "arena-fight" | "neon-arcade";
export type AuraLookId = AuraBiomeId | AuraStudioLookId;
export interface AuraLookOverrides { readonly sun?: { readonly azimuthDeg?: number; readonly elevationDeg?: number }; readonly exposureEv?: number /* [-2,2] */; readonly fogDensityScale?: number /* [0,3] */; readonly accent?: AuraColor; readonly background?: "look" | AuraColor; }
export interface AuraLookNode { readonly kind: "look"; readonly look: AuraLookId; readonly overrides?: AuraLookOverrides; }
export type AuraLookLintCode = "look/no-lights" | "look/ambient-kills-ibl" | "look/ambient-flattens" | "look/no-ibl" | "look/weak-shadow" | "look/low-dpr" | "look/solid-void" | "look/primitive-subject" | "look/flat-palette" | "look/double-aa" | "look/debug-overlay" | "look/fake-effect-names" | "look/evidence-only-feel" | "look/capture-branch";
export interface AuraLookLintFinding { readonly code: AuraLookLintCode | `look/${string}`; readonly severity: "error" | "warning"; readonly message: string; readonly nodes?: readonly string[]; }
export interface AuraLookLintContext { readonly appliedLook?: AppliedLookReport; readonly devicePixelRatio: number; readonly tierCap: number; readonly production: boolean; readonly capabilities: { readonly ambientAdditive: boolean; readonly effectsPixelBacked: readonly string[] }; }

export interface AuraLookLintRule { readonly code: AuraLookLintCode | `look/${string}`; readonly owner: PrdId; run(s: AuraSceneSnapshot, c: AuraLookLintContext): readonly AuraLookLintFinding[]; }

const lookLintRules = new Map<string, AuraLookLintRule>();
// Codes installed as PRD 13 defaults (§6.2, T1.5): a lane's registerLookLintRule
// call for the same code replaces the default without the duplicate-code throw.
const lookLintDefaultCodes = new Set<string>();
// The provider's default rules live in agent-api (they need engine imports);
// this hook installs them lazily at the first lookLint call, so a lane that
// registers before any diagnostics run always wins its code.
let lookLintDefaultsProvider: (() => void) | undefined;
let lookLintDefaultsInstalled = false;

export function lookLint(s: AuraSceneSnapshot, c: AuraLookLintContext): readonly AuraLookLintFinding[] {
  if (!lookLintDefaultsInstalled) {
    lookLintDefaultsInstalled = true;
    lookLintDefaultsProvider?.();
  }
  const findings: AuraLookLintFinding[] = [];
  for (const rule of lookLintRules.values()) {
    findings.push(...rule.run(s, c));
  }
  return findings;
}

export function registerLookLintRule(rule: AuraLookLintRule): void {
  if (lookLintRules.has(rule.code) && !lookLintDefaultCodes.has(rule.code)) {
    throw new Error(`LOOK_RULE_DUPLICATE:${rule.code}`);
  }
  lookLintDefaultCodes.delete(rule.code);
  lookLintRules.set(rule.code, rule);
}

/** PRD 13 internal: installs default rule bodies for codes no lane registered.
 *  Re-registration of a defaulted code is allowed (the lane version wins). */
export function registerLookLintDefaults(rules: readonly AuraLookLintRule[]): void {
  for (const rule of rules) {
    if (!lookLintRules.has(rule.code)) {
      lookLintRules.set(rule.code, rule);
      lookLintDefaultCodes.add(rule.code);
    }
  }
}

/** PRD 13 internal: hook the lazy default install into the first lookLint call. */
export function setLookLintDefaultsProvider(provider: () => void): void {
  lookLintDefaultsProvider = provider;
}

/** Test seam: registered codes, for assertions about lazy default behaviour. */
export function lookLintRegisteredCodes(): readonly string[] {
  return [...lookLintRules.keys()];
}

export interface AuraLookDiagnostics { readonly id: AuraLookId | "engine-default" | null; readonly expansion: "v1-contracts" | "v0-current-engine" | "none"; readonly missingContracts: readonly ("world.biome" | "environments.preset" | "output.preset" | "quality.auto" | "lights.hemisphere")[]; readonly lint: readonly AuraLookLintFinding[]; }
// looks.preset/list/describe/resolveDefault; AuraSceneBuilder.look(id, overrides?)  (signatures as PRD 13 P-13-looks)
