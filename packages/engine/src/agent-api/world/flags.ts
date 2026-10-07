/**
 * PRD-10 §4.1/§7.3 — builder-time QR flag read for the `*.surface`-style
 * upgrade paths. Builders run before `createAuraApp`, so the only flag source
 * they can see is the environment (`A3D_QR` / `A3D_QR_*` vars); per-app
 * `qualityRebuild.flags` are read by the compiler instead. The C-36 handlers
 * still gate on the app-resolved flag, so an env-off build never produces a
 * world node a flag-off app could see.
 */
import { resolveQrFlags } from "../../contracts/flags.js";
import type { QrFlagName } from "@aura3d/rendering/contracts";

export function worldBuilderFlagOn(name: QrFlagName): boolean {
  const proc = (globalThis as { process?: { env?: Readonly<Record<string, string | undefined>> } }).process;
  const flags = resolveQrFlags({ env: proc?.env ?? {} });
  return flags.on(name);
}
