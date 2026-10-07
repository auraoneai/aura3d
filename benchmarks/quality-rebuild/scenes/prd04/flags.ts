/**
 * flags.ts — PRD-04 flag-list expansion for lane drivers.
 *
 * `resolveQrFlags` handles `all` only when it is the sole list entry
 * (`applyList` skips an `all` token inside a comma list — flagNameFor has no
 * "all" row), so §17's `all,-materials` leave-one-out runs are inexpressible
 * through the CSV path (qr-request to:prd15). Drivers translate their `flags=`
 * param through this helper: `all`/`none` expand to the full lane set, `-x`
 * negates, `x`/`x=v` sets one entry; object input wins per-key, so later tokens
 * never clobber earlier ones (same first-wins rule as applyList).
 *
 * Mirrors contracts/flags.ts SHORT_NAMES; keep the two in sync.
 */
import type { QrFlagInput } from "@aura3d/engine";
import type { QrFlagName, QrFlagValue } from "@aura3d/rendering/contracts";

const LANE_SHORT = [
  "core",
  "lighting",
  "post",
  "materials",
  "assets",
  "animation",
  "vfx",
  "camera",
  "game",
  "world",
  "tiers",
  "webgpu",
  "looks",
  "compiler",
  "strict"
] as const;

function flagNameForToken(token: string): QrFlagName | null {
  const lower = token.toLowerCase();
  if ((LANE_SHORT as readonly string[]).includes(lower)) {
    return `A3D_QR_${lower.toUpperCase()}` as QrFlagName;
  }
  const sub = lower.split(/[._]/);
  if (sub.length === 2 && (LANE_SHORT as readonly string[]).includes(sub[0]!)) {
    return `A3D_QR_${sub[0]!.toUpperCase()}_${sub[1]!.toUpperCase()}` as QrFlagName;
  }
  if (sub.length === 2 && sub[0] === "route") {
    return `A3D_QR_ROUTE_${sub[1]!.toUpperCase()}` as QrFlagName;
  }
  return null;
}

/** `flags=` CSV → QrFlagInput: understands `all`/`none` mid-list, `-x`, `x=v`. */
export function expandPrd04FlagList(list: readonly string[]): QrFlagInput {
  const out: Record<string, QrFlagValue> = {};
  const apply = (name: QrFlagName, value: QrFlagValue) => {
    if (!(name in out)) out[name] = value;
  };
  for (const raw of list) {
    for (const part of String(raw).split(",")) {
      const token = part.trim();
      if (!token) continue;
      const negated = token.startsWith("-");
      const body = negated ? token.slice(1) : token;
      const eq = body.indexOf("=");
      const name = eq >= 0 ? body.slice(0, eq) : body;
      const value: QrFlagValue = negated ? false : eq >= 0 ? body.slice(eq + 1) : true;
      const lower = name.toLowerCase();
      if (lower === "all") {
        for (const short of LANE_SHORT) apply(`A3D_QR_${short.toUpperCase()}` as QrFlagName, value);
        continue;
      }
      if (lower === "none") {
        for (const short of LANE_SHORT) apply(`A3D_QR_${short.toUpperCase()}` as QrFlagName, false);
        continue;
      }
      const flag = flagNameForToken(name);
      if (flag) apply(flag, value);
    }
  }
  return out;
}
