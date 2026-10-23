import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THREE_TO_A3D_MAPPINGS } from "../../../packages/aura3d-cli/src/migrate-three/mappings";

// L10-03 / WS-3.4: a codemod row may only name an engine symbol that the
// published surface really exports. Each `engineImport` is resolved against
// the module that `engineImportFrom` names, via the source file recorded in
// aura.exports.json, so `export *` re-exports are honoured.

const repo = resolve(__dirname, "../../..");
const manifest = JSON.parse(readFileSync(resolve(repo, "aura.exports.json"), "utf8")) as {
  readonly package: string;
  readonly entries: Readonly<Record<string, { readonly source: string }>>;
};

const specifierToEntry = (specifier: string): string => {
  if (specifier === manifest.package) return ".";
  const prefix = `${manifest.package}/`;
  if (!specifier.startsWith(prefix)) throw new Error(`unexpected engineImportFrom ${specifier}`);
  return `./${specifier.slice(prefix.length)}`;
};

describe("migrate-three mapping targets (L10-03)", () => {
  it("every engineImportFrom resolves to a published subpath in aura.exports.json", () => {
    const specifiers = new Set(THREE_TO_A3D_MAPPINGS.map((row) => row.engineImportFrom ?? manifest.package));
    for (const specifier of specifiers) {
      expect(manifest.entries[specifierToEntry(specifier)], `${specifier} missing from aura.exports.json`).toBeDefined();
    }
  });

  it("every engineImport is exported by the module its row names", async () => {
    const bySpecifier = new Map<string, Set<string>>();
    for (const row of THREE_TO_A3D_MAPPINGS) {
      if (!row.engineImport) continue;
      const specifier = row.engineImportFrom ?? manifest.package;
      const names = bySpecifier.get(specifier) ?? new Set<string>();
      names.add(row.engineImport);
      bySpecifier.set(specifier, names);
    }
    expect(bySpecifier.size).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const [specifier, names] of bySpecifier) {
      const entry = manifest.entries[specifierToEntry(specifier)];
      const mod = (await import(/* @vite-ignore */ resolve(repo, entry.source))) as Record<string, unknown>;
      for (const name of names) {
        if (!(name in mod)) missing.push(`${specifier} → ${name}`);
      }
    }
    expect(missing, `mapping rows name symbols the surface does not export`).toEqual([]);
  }, 60_000);
});
