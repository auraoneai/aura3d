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
import { QR_FLAG_STATES, REMOVED_QR_FLAGS } from "@aura3d/rendering/contracts/flags.state";
import { parseHrefCached } from "./urlCache";

export type QrFlagInput = "all" | "none" | (string & {}) | readonly string[] | Readonly<Partial<Record<QrFlagName, QrFlagValue>>>;

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

/** threejs-parity lane flags (threejs-parity-gaps PRD §5.0) — dev gates, so `all`/`none` blankets cover them. */
const PARITY_FLAGS: readonly QrFlagName[] = [
  "A3D_PARITY_SHADING",
  "A3D_PARITY_GEOMETRY",
  "A3D_PARITY_TEXTURES",
  "A3D_PARITY_BATCHING",
  "A3D_PARITY_LINES",
  "A3D_PARITY_RUNTIME"
];

const LANE_FLAGS = [...(Object.values(SHORT_NAMES) as QrFlagName[]), ...PARITY_FLAGS];

/**
 * #266 (Q-15-6) — sub-flags whose PRD declares them ON BY DEFAULT under their
 * lane flag; they exist as kill switches (`-world.biome`), not opt-ins. `all`
 * expands them like lane flags, and a lane flag resolved on from any source
 * fills its unset sub-flags after every source applied (explicit values win).
 * PRD-10 §13 (`worldSubflagOn`) already reads these parent-defaulted, so the
 * expansion matches it and makes direct `flags.on(sub)` / registry `flag:`
 * gates agree. Not listed: PRD-01's `A3D_QR_CORE_{GENERATOR,OUTPUT}` (lane 01
 * resolves them through `qrCoreGeneratorOn`/`qrCoreOutputOn` and pins the raw
 * value unset under `core`), and opt-in/default-off sub-flags (e.g.
 * `A3D_QR_POST_VELOCITY_MRT`), which stay explicit-only. Flag states live in
 * `flags.state.ts`; this table only records parent→sub defaults.
 */
const DEFAULT_ON_SUB_FLAGS: Readonly<Partial<Record<QrFlagName, readonly QrFlagName[]>>> = {
  A3D_QR_WORLD: ["A3D_QR_WORLD_TERRAIN", "A3D_QR_WORLD_WATER", "A3D_QR_WORLD_BIOME"]
};

function flagValueOn(v: QrFlagValue | undefined): boolean {
  return v !== undefined && v !== false && v !== "0" && v !== "off" && v !== "";
}

/**
 * GU47 E-G: the lane flag a sub-flag belongs to (`A3D_QR_VFX_FOG` →
 * `A3D_QR_VFX`, `A3D_QR_WORLD_WATER` → `A3D_QR_WORLD`), or null for lane flags
 * and names outside the lane table.
 */
function qrParentLaneFlag(name: string): QrFlagName | null {
  if ((LANE_FLAGS as readonly string[]).includes(name)) return null;
  for (const lane of LANE_FLAGS) {
    if (name.startsWith(`${lane}_`)) return lane;
  }
  return null;
}

/**
 * Promotion (§5.3, owner decision 2026-10-11): a flag whose state is
 * `default-on` in flags.state.ts is on unless some source set it explicitly.
 * Runs after every source, so `none`, `-x` and `A3D_QR_X=0` still turn it off.
 *
 * GU47 E-G: a promoted SUB-flag (e.g. `A3D_QR_VFX_FOG`) also stays off when a
 * source explicitly turned its lane flag off (`none`, `-vfx`, `A3D_QR_VFX=0`),
 * so the kill switches keep meaning "everything in that lane off". A lane
 * that no source set (WORLD is `dev`) does not block it: that is how
 * `A3D_QR_WORLD_WATER` can be default-on alone.
 */
function applyDefaultOnStates(out: Record<string, QrFlagValue>): void {
  for (const [name, state] of Object.entries(QR_FLAG_STATES)) {
    if (state !== "default-on") continue;
    const parent = qrParentLaneFlag(name);
    if (parent !== null && parent in out && !flagValueOn(out[parent])) continue;
    setEntry(out, name as QrFlagName, true);
  }
}

function propagateSubFlags(out: Record<string, QrFlagValue>): void {
  for (const [parent, subs] of Object.entries(DEFAULT_ON_SUB_FLAGS)) {
    if (!flagValueOn(out[parent]) || !subs) continue;
    for (const sub of subs) setEntry(out, sub, true);
  }
}

function flagNameFor(short: string): QrFlagName | null {
  const lower = short.toLowerCase();
  if (lower in SHORT_NAMES) return SHORT_NAMES[lower];
  // threejs-parity: a full `A3D_PARITY_*` name is a valid list token
  // (`?a3d-qr=A3D_PARITY_LINES`), as is the `parity.<area>` short form.
  const upper = short.toUpperCase();
  if (/^A3D_PARITY_[A-Z0-9_]+$/.test(upper)) return upper as QrFlagName;
  const sub = lower.split(/[._]/).filter((s) => s.length > 0);
  if (sub.length >= 2 && sub[0] === "parity") {
    return `A3D_PARITY_${sub.slice(1).join("_").toUpperCase()}` as QrFlagName;
  }
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
  const tokens = list.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    for (const flag of LANE_FLAGS) setEntry(out, flag, false);
    return;
  }
  // #625: `all` / `none` are positional tokens too (`route_bank_shot,all`).
  // First write wins, so explicit tokens apply before the blanket one: in
  // `all,-world` the explicit `-world` still turns world off. Sub-flags are
  // filled by propagateSubFlags after every source applied.
  let blanket: "all" | "none" | null = null;
  for (const t of tokens) {
    if (t === "all" || t === "none") {
      blanket ??= t;
      continue;
    }
    const negated = t.startsWith("-");
    const body = negated ? t.slice(1) : t;
    const eq = body.indexOf("=");
    const name = flagNameFor(eq >= 0 ? body.slice(0, eq) : body);
    if (!name) continue;
    const value: QrFlagValue = negated ? false : eq >= 0 ? body.slice(eq + 1) : true;
    setEntry(out, name, value);
  }
  if (blanket !== null) for (const flag of LANE_FLAGS) setEntry(out, flag, blanket === "all");
}

function applyInput(out: Record<string, QrFlagValue>, input: QrFlagInput): void {
  // Any string ("all", "none", "camera,-post") is a flag list. Before this, "none"
  // fell through to Object.entries(string), set nothing, and default-on flags won.
  if (typeof input === "string") {
    applyList(out, input);
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
    if ((!name.startsWith("A3D_QR_") && !name.startsWith("A3D_PARITY_")) || name === "A3D_QR" || raw === undefined) continue;
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
  // Precedence (first write wins): URL `a3d-qr` > env (A3D_QR list, then A3D_QR_X) >
  // programmatic options > flags.state default-on. Runtime overrides must beat
  // values baked into app code, or `-x` / `none` can't measure a flag (#1232).
  if (input.url !== undefined) {
    const url = typeof input.url === "string" ? parseHrefCached(input.url) : input.url;
    const list = url.searchParams.get("a3d-qr");
    if (list !== null) applyList(values, list);
  }
  if (input.env !== undefined) {
    const list = input.env.A3D_QR ?? input.env.VITE_A3D_QR;
    if (list !== undefined) applyList(values, list);
    applyPerFlagEnv(values, input.env);
  }
  if (input.options !== undefined) applyInput(values, input.options);
  applyDefaultOnStates(values);
  propagateSubFlags(values);
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
