/**
 * PRD-10 §4.1/§7.3 — builder-time QR flag read for the `*.surface`-style
 * upgrade paths. Builders run before `createAuraApp`, so the only flag source
 * they can see is the environment (`A3D_QR` / `A3D_QR_*` vars); per-app
 * `qualityRebuild.flags` are read by the compiler instead. The C-36 handlers
 * still gate on the app-resolved flag, so an env-off build never produces a
 * world node a flag-off app could see.
 */
import { resolveQrFlags } from "../../contracts/flags.js";
import type { QrFlagName, QrFlags } from "@aura3d/rendering/contracts";

export function worldBuilderFlagOn(name: QrFlagName): boolean {
  const proc = (globalThis as { process?: { env?: Readonly<Record<string, string | undefined>> } }).process;
  const flags = resolveQrFlags({ env: proc?.env ?? {} });
  return flags.on(name);
}

export type AuraWorldSubFlag = "A3D_QR_WORLD_TERRAIN" | "A3D_QR_WORLD_WATER" | "A3D_QR_WORLD_BIOME";

/**
 * §13 — sub-flags are ON BY DEFAULT when `A3D_QR_WORLD` is on; they exist as
 * route-level kill switches, not opt-ins. An explicitly set sub-flag value
 * (`world.biome` / `-world.biome` list tokens, `A3D_QR_WORLD_BIOME=1|0`,
 * per-app flags) always wins over the parent default.
 */
export function worldSubflagOn(flags: QrFlags, sub: AuraWorldSubFlag): boolean {
  const v = flags.values[sub];
  if (v !== undefined) return v !== false && v !== "off" && v !== "0";
  return flags.on("A3D_QR_WORLD");
}

/** Builder-time variant of `worldSubflagOn` (env is the only flag source). */
export function worldBuilderSubflagOn(sub: AuraWorldSubFlag): boolean {
  const proc = (globalThis as { process?: { env?: Readonly<Record<string, string | undefined>> } }).process;
  return worldSubflagOn(resolveQrFlags({ env: proc?.env ?? {} }), sub);
}
