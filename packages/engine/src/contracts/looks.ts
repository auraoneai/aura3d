/**
 * C-34 — looks and lookLint (CONTRACTS.md). Provider: PRD 13. Flag: A3D_QR_LOOKS.
 */

import type { PrdId } from "@aura3d/rendering/contracts";
import type { AuraSceneSnapshot, AuraColor, AuraAssetRef } from "../agent-api/index";
import type { AuraBiomeId } from "./world";
import type { AppliedLookReport } from "./diagnostics";
import type { AuraDirectionalShadowOptions } from "./lighting";
import type { AuraHeightFogSpec } from "./atmosphere";
import type { AuraPostPresetId } from "./post";

export type AuraStudioLookId = "product-studio" | "character-showcase" | "arena-fight" | "neon-arcade";
export type AuraLookId = AuraBiomeId | AuraStudioLookId;

/**
 * GU47 E-A: the typed HDRI catalogue. Each id is the corpus or library file stem without its size suffix and ships as
 * `public/hdri/<id>_1k.hdr` (served at `/hdri/<id>_1k.hdr`; licence rows in `public/hdri/ATTRIBUTION.md`).
 */
export type AuraHdriId = "autumn_field_puresky" | "kloppenheim_06_puresky" | "studio_small_08"
  | "belfast_sunset_puresky" | "industrial_sunset_puresky" | "spruit_sunrise" | "venice_sunset"
  | "rooftop_night" | "cobblestone_street_night" | "hangar_interior" | "warm_bar" | "museum_of_history"
  | "kloppenheim_02" | "deep_space_starfield" | "outdoor-midday" | "sunset-dramatic" | "indoor-workshop";

/** GU47(E-C): stand-in for the `AuraBloomOptions` E-C declares in `./post`; swap to that import once it lands. */
interface AuraBloomOptions { readonly intensity?: number; readonly threshold?: number; readonly knee?: number; readonly scatter?: number; readonly color?: AuraColor; readonly clampLuminance?: number; }

/**
 * Per-look overrides, clamped by `clampLookOverrides` (agent-api/looks/looks.ts). The GU47 E-A keys (`hdri` onwards)
 * leave a look's expansion unchanged unless they are set.
 */
export interface AuraLookOverrides {
  readonly sun?: { readonly azimuthDeg?: number; readonly elevationDeg?: number };
  readonly exposureEv?: number /* [-2,2] */;
  readonly fogDensityScale?: number /* [0,3] */;
  readonly accent?: AuraColor;
  readonly background?: "look" | AuraColor;
  /** Replaces the look's HDRI (or its procedural fill): a catalogue id or a typed `.hdr` texture ref. */
  readonly hdri?: AuraHdriId | AuraAssetRef<"texture">;
  readonly environmentIntensity?: number /* [0,4]; HDRI intensity, or the fill's on a no-HDRI look */;
  readonly environmentRotationDeg?: number /* wraps into [0,360) */;
  readonly key?: { readonly color?: AuraColor; readonly intensity?: number /* [0,20] */; readonly shadow?: AuraDirectionalShadowOptions };
  /** `false` drops the look's rim light; an object adds or retunes it. */
  readonly rim?: false | { readonly color?: AuraColor; readonly intensity?: number /* [0,20] */; readonly azimuthDeg?: number /* wraps into [0,360) */ };
  /** near/far [0,100000] replace the look's fog range; `height` makes the look fog a C-21 height fog. */
  readonly fog?: { readonly color?: AuraColor; readonly near?: number; readonly far?: number; readonly height?: AuraHeightFogSpec };
  /** contrast/saturation [0,3], temperature/tint [-1,1]; `lut` a typed `.cube` asset (`AuraAssetRef<"lut">`, PRD §3.1). */
  readonly grade?: { readonly contrast?: number; readonly saturation?: number; readonly temperature?: number; readonly tint?: number; readonly lut?: AuraAssetRef<"lut"> };
  /** A preset id replaces the look's declared `output.preset`; `{ bloom }` drops (`false`) or retunes the look's bloom node. */
  readonly post?: AuraPostPresetId | { readonly bloom?: false | AuraBloomOptions };
}
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
