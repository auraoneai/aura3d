/**
 * PRD-10 §4.1/§7.3 — builder-time QR flag read for the `*.surface`-style
 * upgrade paths. Builders run before `createAuraApp` resolves the app's flags,
 * so the builder decides from the same source chain the app will use. The
 * C-36 handlers still gate on the app-resolved flag, so a builder that saw a
 * flag off never produces a world node a flag-off app could see.
 *
 * GU47 E-G (WP-7): the builder read used to see the environment only, so
 * `qualityRebuild: { flags }` and `?a3d-qr=` were ignored at build time and a
 * builder could disagree with its own app. It now resolves exactly like
 * `createAuraApp`: the app's declared `qualityRebuild` (see
 * `setWorldBuilderFlags`, `world.useAppFlags`), then the URL `?a3d-qr=` list
 * (unless the app declared `allowUrlFlags: false`), then the environment, then
 * the flags.state defaults.
 */
import { resolveQrFlags, type QrFlagInput } from "../../contracts/flags.js";
import type { QrFlagName, QrFlags } from "@aura3d/rendering/contracts";

/** The `qualityRebuild` option shape of `createAuraApp` / `createGameApp`. */
export interface AuraWorldBuilderFlagSource {
  readonly flags?: QrFlagInput;
  readonly allowUrlFlags?: boolean;
}

let declared: AuraWorldBuilderFlagSource | QrFlags | null = null;

function isResolvedFlags(value: AuraWorldBuilderFlagSource | QrFlags): value is QrFlags {
  return typeof (value as QrFlags).on === "function" && typeof (value as QrFlags).values === "object";
}

/**
 * Declare the app's flags for builder-time reads. Pass the same
 * `qualityRebuild` object you give `createAuraApp` (or an app's resolved
 * `QrFlags`) BEFORE building the scene; `null` clears the declaration.
 */
export function setWorldBuilderFlags(source: AuraWorldBuilderFlagSource | QrFlags | null | undefined): void {
  declared = source ?? null;
}

/** The flags a world builder decides with right now (same chain as the app). */
export function worldBuilderFlags(): QrFlags {
  if (declared !== null && isResolvedFlags(declared)) return declared;
  const source = declared;
  const proc = (globalThis as { process?: { env?: Readonly<Record<string, string | undefined>> } }).process;
  const href = source?.allowUrlFlags === false
    ? undefined
    : typeof location !== "undefined" && typeof location.href === "string" ? location.href : undefined;
  return resolveQrFlags({
    ...(source?.flags !== undefined ? { options: source.flags } : {}),
    ...(href !== undefined ? { url: href } : {}),
    env: proc?.env ?? {}
  });
}

export function worldBuilderFlagOn(name: QrFlagName): boolean {
  return worldBuilderFlags().on(name);
}

export type AuraWorldSubFlag = "A3D_QR_WORLD_TERRAIN" | "A3D_QR_WORLD_WATER" | "A3D_QR_WORLD_BIOME" | "A3D_QR_WORLD_WIND";

/**
 * §13 — sub-flags are ON BY DEFAULT when `A3D_QR_WORLD` is on; they exist as
 * route-level kill switches, not opt-ins. An explicitly set sub-flag value
 * (`world.biome` / `-world.biome` list tokens, `A3D_QR_WORLD_BIOME=1|0`,
 * per-app flags, a flags.state `default-on` promotion) always wins over the
 * parent default.
 */
export function worldSubflagOn(flags: QrFlags, sub: AuraWorldSubFlag): boolean {
  const v = flags.values[sub];
  if (v !== undefined) return v !== false && v !== "off" && v !== "0";
  return flags.on("A3D_QR_WORLD");
}

/** Builder-time variant of `worldSubflagOn` (same source chain as the app). */
export function worldBuilderSubflagOn(sub: AuraWorldSubFlag): boolean {
  return worldSubflagOn(worldBuilderFlags(), sub);
}
