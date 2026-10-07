// apps/aura-clash-showcase/src/main.ts — PRD-14 T1.10 route-flag dispatcher (owner 14).
// Flag off (default): boots src/legacy/main.ts untouched. `?a3d-qr=route-aura-clash`
// boots src/v2/boot.ts. DEFAULT_ON flips only after G-PANEL acceptance (§10 step 5).
import { resolveQrFlags } from "@aura3d/engine/contracts";

const ROUTE_FLAG = "A3D_QR_ROUTE_AURA_CLASH" as const;
const DEFAULT_ON = false;

function routeFlagFromUrl(loc: Location, flag: string): boolean | undefined {
  const raw = new URL(loc.href).searchParams.get("a3d-qr");
  if (raw === null) return undefined;
  const entries = raw.split(",").map((s) => s.trim());
  const short = `route-${flag.replace(/^A3D_QR_ROUTE_/, "").toLowerCase().replace(/_/g, "-")}`;
  return entries.includes(short) || entries.includes(flag) ? true : undefined;
}

const flags = resolveQrFlags({
  url: location.href,
  env: { VITE_A3D_QR: (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_A3D_QR },
  options: { [ROUTE_FLAG]: routeFlagFromUrl(location, ROUTE_FLAG) ?? DEFAULT_ON }
});

void (flags.on(ROUTE_FLAG) ? import("./v2/boot") : import("./legacy/main"));
