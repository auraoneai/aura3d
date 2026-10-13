// tests/qr/prd14/browser/lib/assets-admitted.ts — PRD-14 §16.1 S10 validator.
// "Every art/direction.ts asset role resolves to an admitted id whose kit file
// has an `accept` look-dev verdict on the three r185 pane."
//   admitted — the role's `assetKey` is an asset id in the route manifest
//              apps/<dir>/aura.assets.json or the root aura.assets.json
//              (`aura3d assets add` writes the root map; src/aura-assets.ts is
//              what every route imports)
//   kit      — apps/showcase-kits/<kit>/kit.json (§6.4, T3.2) lists a file for
//              that id whose `lookdev.verdict` is "accept"; a role with no
//              shared `kit` must be listed by some apps/showcase-kits/*/kit.json
// A missing manifest or kit.json is a violation, never a skip.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDirectionAssets, readDirection, type DirectionAssetRole } from "./direction";

export interface S10Violation {
  readonly half: "admitted" | "kit";
  readonly role: string;
  readonly assetKey: string;
  readonly reason: string;
}

interface ManifestLike { readonly assets?: readonly { readonly id?: string }[] }
interface KitFileLike {
  readonly id?: string;
  readonly assetKey?: string;
  readonly lookdev?: { readonly verdict?: string };
}
interface KitLike { readonly files?: readonly KitFileLike[] }

function readJson<T>(path: string): T | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
}

/** Asset ids admitted for a route (route manifest ∪ root manifest). */
export function admittedIds(repoRoot: string, appDir: string): Set<string> {
  const ids = new Set<string>();
  for (const path of [join(repoRoot, "apps", appDir, "aura.assets.json"), join(repoRoot, "aura.assets.json")]) {
    for (const a of readJson<ManifestLike>(path)?.assets ?? []) if (typeof a.id === "string") ids.add(a.id);
  }
  return ids;
}

export function kitManifestPath(repoRoot: string, kit: string): string {
  return join(repoRoot, "apps", "showcase-kits", kit, "kit.json");
}

function matchesAssetKey(f: KitFileLike, assetKey: string): boolean {
  const kebab = assetKey.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  return f.id === assetKey || f.id === kebab || f.assetKey === assetKey;
}

function verdictOf(kitName: string, kit: KitLike, assetKey: string): string | null {
  const file = (kit.files ?? []).find((f) => matchesAssetKey(f, assetKey));
  if (file === undefined) return `kit ${kitName} lists no file for "${assetKey}"`;
  const verdict = file.lookdev?.verdict;
  return verdict === "accept" ? null : `kit ${kitName} file "${assetKey}" look-dev verdict is ${verdict ?? "missing"}, not accept`;
}

function kitViolation(repoRoot: string, r: DirectionAssetRole): string | null {
  if (r.kit !== null) {
    const kit = readJson<KitLike>(kitManifestPath(repoRoot, r.kit));
    return kit === null ? `no kit manifest apps/showcase-kits/${r.kit}/kit.json` : verdictOf(r.kit, kit, r.assetKey);
  }
  // Route-specific role (no shared kit named): any staged kit.json may list it.
  const kitsRoot = join(repoRoot, "apps", "showcase-kits");
  if (!existsSync(kitsRoot)) return "apps/showcase-kits/ does not exist (no kit manifest lists it)";
  for (const name of readdirSync(kitsRoot).sort()) {
    const kit = readJson<KitLike>(join(kitsRoot, name, "kit.json"));
    if (kit !== null && (kit.files ?? []).some((f) => matchesAssetKey(f, r.assetKey))) {
      return verdictOf(name, kit, r.assetKey);
    }
  }
  return `no apps/showcase-kits/*/kit.json lists "${r.assetKey}"`;
}

/** Both S10 halves for one route; `roles` defaults to the route's art/direction.ts. */
export function checkS10(
  repoRoot: string,
  appDir: string,
  roles: readonly DirectionAssetRole[] = parseDirectionAssets(readDirection(join(repoRoot, "apps"), appDir))
): S10Violation[] {
  const ids = admittedIds(repoRoot, appDir);
  const out: S10Violation[] = [];
  for (const r of roles) {
    if (!ids.has(r.assetKey)) {
      out.push({ half: "admitted", role: r.role, assetKey: r.assetKey, reason: `"${r.assetKey}" is not an admitted asset id` });
    }
    const kit = kitViolation(repoRoot, r);
    if (kit !== null) out.push({ half: "kit", role: r.role, assetKey: r.assetKey, reason: kit });
  }
  return out;
}

export function formatS10(appDir: string, violations: readonly S10Violation[]): string[] {
  return violations.map((v) => `${appDir}: [${v.half}] ${v.role} ${v.assetKey}: ${v.reason}`);
}
