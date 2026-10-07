// apps/showcase-vault-breakers/src/main.ts — PRD-14 T1.10 route-flag dispatcher (owner 14).
// Flag off (default): boots src/legacy/main.ts untouched. `?a3d-qr=route-vault-breakers`
// (or the raw flag id) boots src/v2/boot.ts. DEFAULT_ON flips only after G-PANEL
// acceptance (§10 step 5).
import { resolveQrFlags } from "@aura3d/engine/contracts";

const ROUTE_FLAG = "A3D_QR_ROUTE_VAULT_BREAKERS" as const;
const DEFAULT_ON = false;

/** Accepts `?a3d-qr=…,route-vault-breakers` and `?a3d-qr=…,A3D_QR_ROUTE_VAULT_BREAKERS`.
 *  Returns undefined when the flag is absent (CCR-14-2 replaces this helper). */
function routeFlagFromUrl(loc: Location, flag: string): boolean | undefined {
  const raw = new URL(loc.href).searchParams.get("a3d-qr");
  if (raw === null) return undefined;
  const short = `route-${flag.replace(/^A3D_QR_ROUTE_/, "").toLowerCase().replace(/_/g, "-")}`;
  return raw.split(",").map((s) => s.trim()).includes(short) || raw.split(",").map((s) => s.trim()).includes(flag)
    ? true
    : undefined;
}

const flags = resolveQrFlags({
  url: location.href,
  env: { VITE_A3D_QR: (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_A3D_QR },
  options: { [ROUTE_FLAG]: routeFlagFromUrl(location, ROUTE_FLAG) ?? DEFAULT_ON }
});

void (flags.on(ROUTE_FLAG) ? import("./v2/boot") : import("./legacy/main"));
