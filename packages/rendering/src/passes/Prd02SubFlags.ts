// PRD-02 §6.5 real sub-flags under `A3D_QR_LIGHTING` (bool — `QrFlagName`
// template `A3D_QR_<AREA>_<SUB>`). `?a3dLighting=` URL kill switches
// (`pmrem=cpu`, `atlas=off`, `shadowFilter=legacy-grid`, `shadows=off`,
// `background=off`, plus `csm/probes/contact` aliases) are NOT flags — they
// are parsed in `compiler/lights.ts` and arrive on
// `source.shadow.prd02KillSwitches`.
//
// `flags.on(name)` cannot distinguish "unset" from "set false" — and both
// matter here: `A3D_QR_LIGHTING_CONTACT` explicit-on is an opt-in (forces
// the pass on non-Ultra tiers), explicit-off vetoes a tier/opt-in request,
// unset defers to C-27/`effects.contactShadows`. `prd02SubFlagOff` reads the
// raw value so "off" and "absent" stay distinct.

import type { QrFlags, QrFlagValue } from "../contracts/core.js";

export const SUB_FLAG_CSM = "A3D_QR_LIGHTING_CSM";         // off = single fitted map
export const SUB_FLAG_PROBES = "A3D_QR_LIGHTING_PROBES";   // off = prd02.probes off
export const SUB_FLAG_CONTACT = "A3D_QR_LIGHTING_CONTACT"; // off = veto; on = opt-in

/** Explicitly disabled (`=0`, `-name`, `=off`) — distinct from unset. */
export function prd02SubFlagOff(flags: QrFlags, name: string): boolean {
  const v = ((flags.values ?? {}) as Readonly<Record<string, QrFlagValue | undefined>>)[name];
  return v === false || v === "0" || v === "off";
}

// ---------- `?a3dLighting=` kill switches (compiled onto source.shadow) ----------

/** Structural mirror of `Prd02LightingKillSwitches` (engine/compiler) —
 *  rendering reads it off `source.shadow.prd02KillSwitches`. */
export interface Prd02KillSwitchesLike {
  readonly pmrem: "cpu" | null;
  readonly atlas: boolean;
  readonly shadowFilter: "legacy-grid" | null;
  readonly shadows: boolean;
  readonly background: boolean;
  readonly csm: boolean;
  readonly probes: boolean;
  readonly contact: boolean;
}

const ALL_ON: Prd02KillSwitchesLike = {
  pmrem: null, atlas: true, shadowFilter: null,
  shadows: true, background: true, csm: true, probes: true, contact: true
};

/** `source.shadow.prd02KillSwitches` when present, else all-on defaults
 *  (matches `readLightingKillSwitches` semantics for absent URLs). */
export function readPrd02KillSwitches(source: unknown): Prd02KillSwitchesLike {
  const shadow = (source as { shadow?: unknown } | null)?.shadow;
  const ks = (shadow as { prd02KillSwitches?: unknown } | null)?.prd02KillSwitches;
  return ks && typeof ks === "object" ? { ...ALL_ON, ...(ks as Partial<Prd02KillSwitchesLike>) } : ALL_ON;
}
