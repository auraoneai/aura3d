/**
 * §1.1 / §5.2 — flag resolution (CONTRACTS.md). Custodian: PRD 15.
 *
 * Sources in precedence order; the first source that sets a flag wins:
 *   1. explicit `qualityRebuild: { flags }` option
 *   2. URL `?a3d-qr=<list>` (ignored by callers when allowUrlFlags is false)
 *   3. environment `A3D_QR=<list>` / `import.meta.env.VITE_A3D_QR`
 *   4. per-flag `A3D_QR_<AREA>=1|0|value`
 *   5. the registry default (all flags off while every flag is `dev`, §5.3)
 */

import type { QrFlagName, QrFlagValue, QrFlags } from "@aura3d/rendering/contracts";
import { REMOVED_QR_FLAGS } from "@aura3d/rendering/contracts/flags.state";

export type QrFlagInput = "all" | readonly string[] | Readonly<Partial<Record<QrFlagName, QrFlagValue>>>;

const SHORT_NAMES: Readonly<Record<string, QrFlagName>> = {
  core: "A3D_QR_CORE",
  lighting: "A3D_QR_LIGHTING",
  post: "A3D_QR_POST",
  materials: "A3D_QR_MATERIALS",
  assets: "A3D_QR_ASSETS",
  animation: "A3D_QR_ANIMATION",
  vfx: "A3D_QR_VFX",
  camera: "A3D_QR_CAMERA",
  game: "A3D_QR_GAME",
  world: "A3D_QR_WORLD",
  tiers: "A3D_QR_TIERS",
  webgpu: "A3D_QR_WEBGPU",
  looks: "A3D_QR_LOOKS",
  compiler: "A3D_QR_COMPILER",
  strict: "A3D_QR_STRICT"
};

const LANE_FLAGS = Object.values(SHORT_NAMES) as QrFlagName[];

function flagNameFor(short: string): QrFlagName | null {
  const lower = short.toLowerCase();
  if (lower in SHORT_NAMES) return SHORT_NAMES[lower];
  const sub = lower.split(/[._]/).filter((s) => s.length > 0);
  // #72: multi-segment names — `core.shadows.cascade` →
  // `A3D_QR_CORE_SHADOWS_CASCADE`; `route.demo.alpha` → `A3D_QR_ROUTE_DEMO_ALPHA`.
  if (sub.length >= 2 && sub[0] in SHORT_NAMES) {
    return `A3D_QR_${sub[0].toUpperCase()}_${sub.slice(1).join("_").toUpperCase()}` as QrFlagName;
  }
  if (sub.length >= 2 && sub[0] === "route") {
    return `A3D_QR_ROUTE_${sub.slice(1).join("_").toUpperCase()}` as QrFlagName;
  }
  return null;
}

function setEntry(out: Record<string, QrFlagValue>, name: QrFlagName, value: QrFlagValue): void {
  if (!(name in out)) out[name] = value;
}

/** `all` | `none` | comma list of short names with `-name` exclusions and `name=value` values. */
function applyList(out: Record<string, QrFlagValue>, list: string): void {
  const trimmed = list.trim();
  if (trimmed === "all") {
    for (const flag of LANE_FLAGS) setEntry(out, flag, true);
    return;
  }
  if (trimmed === "none" || trimmed === "") {
    for (const flag of LANE_FLAGS) setEntry(out, flag, false);
    return;
  }
  for (const token of trimmed.split(",")) {
    const t = token.trim();
    if (!t) continue;
    const negated = t.startsWith("-");
    const body = negated ? t.slice(1) : t;
    const eq = body.indexOf("=");
    const name = flagNameFor(eq >= 0 ? body.slice(0, eq) : body);
    if (!name) continue;
    const value: QrFlagValue = negated ? false : eq >= 0 ? body.slice(eq + 1) : true;
    setEntry(out, name, value);
  }
}

function applyInput(out: Record<string, QrFlagValue>, input: QrFlagInput): void {
  if (input === "all") {
    applyList(out, "all");
    return;
  }
  if (Array.isArray(input)) {
    for (const token of input as readonly string[]) applyList(out, token);
    return;
  }
  for (const [name, value] of Object.entries(input)) {
    if (value !== undefined) setEntry(out, name as QrFlagName, value);
  }
}

function applyPerFlagEnv(out: Record<string, QrFlagValue>, env: Readonly<Record<string, string | undefined>>): void {
  for (const [name, raw] of Object.entries(env)) {
    if (!name.startsWith("A3D_QR_") || name === "A3D_QR" || raw === undefined) continue;
    const value: QrFlagValue = raw === "0" || raw === "off" || raw === "false" ? false : raw === "1" || raw === "on" || raw === "true" ? true : raw;
    setEntry(out, name as QrFlagName, value);
  }
}

/**
 * T1.11 (PRD-06 §10): `animation.mixer: "pose"` is the documented alias for
 * the `A3D_QR_ANIMATION_POSE_MIXER` sub-flag. Compose it onto a resolved
 * `QrFlags`; an explicit value already resolved for the sub-flag wins, so a
 * caller can still turn it off through `qualityRebuild.flags`.
 */
export function qrFlagsWithAnimationMixer(flags: QrFlags, mixer: "pose" | "legacy" | undefined): QrFlags {
  if (mixer !== "pose" || flags.values.A3D_QR_ANIMATION_POSE_MIXER !== undefined) {
    return flags;
  }
  const values: Readonly<Partial<Record<QrFlagName, QrFlagValue>>> = Object.freeze({
    ...flags.values,
    A3D_QR_ANIMATION_POSE_MIXER: true
  });
  return {
    values,
    on(name: QrFlagName): boolean {
      const v = values[name];
      return v !== undefined && v !== false && v !== "0" && v !== "off" && v !== "";
    }
  };
}

export function resolveQrFlags(input: { readonly options?: QrFlagInput; readonly url?: URL | string; readonly env?: Readonly<Record<string, string | undefined>> }): QrFlags {
  const values: Record<string, QrFlagValue> = {};
  if (input.options !== undefined) applyInput(values, input.options);
  if (input.url !== undefined) {
    const url = typeof input.url === "string" ? new URL(input.url, "http://localhost/") : input.url;
    const list = url.searchParams.get("a3d-qr");
    if (list !== null) applyList(values, list);
  }
  if (input.env !== undefined) {
    const list = input.env.A3D_QR ?? input.env.VITE_A3D_QR;
    if (list !== undefined) applyList(values, list);
    applyPerFlagEnv(values, input.env);
  }
  for (const removed of REMOVED_QR_FLAGS) {
    if (values[removed] !== undefined) {
      delete values[removed];
      if (typeof console !== "undefined") console.warn(`QR_FLAG_REMOVED:${removed}`);
    }
  }
  const frozen: Readonly<Partial<Record<QrFlagName, QrFlagValue>>> = Object.freeze({ ...values });
  return {
    values: frozen,
    on(name: QrFlagName): boolean {
      const v = frozen[name];
      return v !== undefined && v !== false && v !== "0" && v !== "off" && v !== "";
    }
  };
}

// createAuraApp/createGameApp option (C-38):
//   qualityRebuild?: { readonly flags?: QrFlagInput; readonly allowUrlFlags?: boolean /* default true */ }
