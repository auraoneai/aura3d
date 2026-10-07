/**
 * `A3D_QR_ASSETS` env resolution for CLI write paths (CONTRACTS §5.2).
 *
 * The engine's `resolveQrFlags` lives in `@aura3d/engine` which `@aura3d/cli`
 * does not depend on, so this mirrors its env-source semantics exactly:
 * `A3D_QR` list (`all`, `none`, comma tokens with `-name` negations and
 * `name=value`) applies first, then per-flag `A3D_QR_ASSETS`, with first-set
 * winning — identical to `applyList`/`applyPerFlagEnv`/`setEntry` in
 * `packages/engine/src/contracts/flags.ts`.
 */

const LANE_FLAG = "A3D_QR_ASSETS";

function truthy(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "0" || value === "off" || value === "false" || value === "") return false;
  if (value === "1" || value === "on" || value === "true") return true;
  return true;
}

export function qrAssetsFlagEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  let resolved: boolean | undefined;
  const list = env.A3D_QR ?? env.VITE_A3D_QR;
  if (list !== undefined) {
    const trimmed = list.trim();
    if (trimmed === "all") resolved = true;
    else if (trimmed === "none" || trimmed === "") resolved = false;
    else {
      for (const token of trimmed.split(",")) {
        const t = token.trim();
        if (!t) continue;
        const negated = t.startsWith("-");
        const body = negated ? t.slice(1) : t;
        const eq = body.indexOf("=");
        const name = eq >= 0 ? body.slice(0, eq) : body;
        if (name.toLowerCase() !== "assets") continue;
        resolved ??= negated ? false : truthy(eq >= 0 ? body.slice(eq + 1) : "1");
      }
    }
  }
  resolved ??= truthy(env[LANE_FLAG]);
  return resolved === true;
}
