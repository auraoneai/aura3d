import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * §10 / §12 — the migration matrix is measured, and the version follows from it.
 *
 * `MIGRATION-1.6.md` makes four falsifiable claims: no package was removed, no non-`three-compat`
 * public symbol was removed, the one removed root subpath was already unusable when installed, and
 * therefore the version is `1.6.0` rather than `2.0.0`.
 *
 * Those are exactly the claims a release is tempted to assert. §12's rule — *"if packages disappear
 * and commonly used imports break, it is 2.0.0"* — is only meaningful if "disappear" and "break"
 * are computed rather than judged, so this recomputes all four against `v1.5.2`.
 *
 * If a later change removes a package or a symbol, this test fails and the version decision has to
 * be revisited. That is the point: the matrix is an input to the decision, not a description of it.
 */

const BASE_TAG = "v1.5.2";
const MIGRATION = readFileSync("MIGRATION-1.6.md", "utf8");

/**
 * The same text with newlines collapsed to spaces.
 *
 * Markdown prose wraps, so assertions use collapsed whitespace instead of accidentally testing
 * line wrapping.
 */
const MIGRATION_FLAT = MIGRATION.replace(/\s+/g, " ");

function showAtBase(path: string): string {
  return execFileSync("git", ["show", `${BASE_TAG}:${path}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Exported names from a generated public-API document, `as` aliases resolved to the public name. */
function exportedSymbols(source: string): ReadonlySet<string> {
  const symbols = new Set<string>();
  for (const line of source.split("\n")) {
    const match = /^export (?:type )?\{([^}]*)\}/.exec(line.trim());
    if (!match) continue;
    for (const raw of match[1]!.split(",")) {
      const name = raw.trim().split(" as ")[0]!.trim();
      if (name.length > 0) symbols.add(name);
    }
  }
  return symbols;
}

describe("§12 — the version decision follows from measurement", () => {
  it("removed no package", () => {
    const atBase = execFileSync("git", ["ls-tree", "--name-only", BASE_TAG, "packages/"], { encoding: "utf8" })
      .split("\n")
      .filter((line) => line.startsWith("packages/"))
      .map((line) => line.split("/")[1]!)
      // `AGENTS.md` sits beside the package directories and is not one.
      .filter((name) => !name.endsWith(".md"));
    const now = execFileSync("git", ["ls-tree", "--name-only", "HEAD", "packages/"], { encoding: "utf8" })
      .split("\n")
      .filter((line) => line.startsWith("packages/"))
      .map((line) => line.split("/")[1]!)
      .filter((name) => !name.endsWith(".md"));
    const removed = atBase.filter((name) => !now.includes(name));
    expect(removed, `packages removed since ${BASE_TAG}: ${removed.join(", ")}`).toEqual([]);
  });

  it("removed no public symbol outside @aura3d/three-compat", () => {
    /*
     * The 36 removed symbols are all `*Compat` / `THREE_COMPAT_*` and still ship from the
     * standalone `@aura3d/three-compat` package, so no consumer loses a symbol — they change one
     * import specifier, and only if they were using a subpath that never resolved when installed.
     */
    const before = exportedSymbols(showAtBase("docs/api/public-api.md"));
    const after = exportedSymbols(readFileSync("docs/api/public-api.md", "utf8"));
    const removed = [...before].filter((name) => !after.has(name));
    const nonCompat = removed.filter((name) => !/Compat|THREE_COMPAT/.test(name));
    expect(nonCompat, `non-three-compat public symbols removed: ${nonCompat.join(", ")}`).toEqual([]);
    // And the surface did not shrink overall, which is what "high-value concepts preserved" means.
    expect(after.size).toBeGreaterThanOrEqual(before.size);
  });

  it("removed exactly one root subpath, and it was already unusable when installed", () => {
    const before = JSON.parse(showAtBase("package.json")) as { readonly exports?: Record<string, unknown>; readonly files?: readonly string[] };
    const after = JSON.parse(readFileSync("package.json", "utf8")) as { readonly exports?: Record<string, unknown>; readonly files?: readonly string[] };
    const removed = Object.keys(before.exports ?? {}).filter((key) => !(key in (after.exports ?? {})));
    expect(removed).toEqual(["./three-compat"]);
    /*
     * The claim that it was already broken is checkable: the root `files` allowlist does not ship
     * `dist/three-compat`, so an installed consumer resolving that subpath got
     * ERR_PACKAGE_PATH_NOT_EXPORTED. It only ever worked inside a built worktree.
     */
    const shipsThreeCompatDist = (before.files ?? []).some((entry) => entry.includes("three-compat"));
    expect(shipsThreeCompatDist, "dist/three-compat was shipped, so the subpath did work").toBe(false);
  });

  it("keeps the three-compat symbols reachable from their own package", () => {
    const manifest = JSON.parse(readFileSync("packages/three-compat/package.json", "utf8")) as { readonly name: string };
    expect(manifest.name).toBe("@aura3d/three-compat");
  });

  it("states 1.6.0, and states it as a conclusion rather than an assertion", () => {
    expect(MIGRATION).toMatch(/\*\*1\.6\.0\.\*\*/);
    // The §12 rule must be quoted, so a reader can check the reasoning rather than trust it.
    expect(MIGRATION_FLAT).toMatch(/If packages disappear and commonly used imports break/);
    // And the two false premises §12 reasoned from must be named.
    expect(MIGRATION_FLAT).toMatch(/Both premises turned out false/);
  });

  it("binds the cleared bundle condition to measured lean entries, not the compatibility root", () => {
    const report = JSON.parse(readFileSync("tests/reports/bundle-scenarios.json", "utf8")) as {
      readonly pass: boolean;
      readonly scenarios: ReadonlyArray<{
        readonly ratio: number;
        readonly maxRatio: number;
        readonly pass: boolean;
      }>;
    };

    expect(report.pass).toBe(true);
    expect(report.scenarios).toHaveLength(3);
    for (const scenario of report.scenarios) {
      expect(scenario.pass).toBe(true);
      expect(scenario.ratio).toBeLessThanOrEqual(scenario.maxRatio);
      expect(MIGRATION_FLAT).toContain(`${scenario.ratio.toFixed(3)}x`);
    }

    expect(MIGRATION_FLAT).toMatch(/clears the §B\.1 release condition through the recommended lean entries/);
    expect(MIGRATION_FLAT).toMatch(/not by shrinking the compatibility-heavy root/);
    expect(MIGRATION_FLAT).toMatch(/not universal performance claims/);
  });
});

describe("the matrix documents every intentional break with a replacement", () => {
  it("names the removed physics backend value and what to do instead", () => {
    expect(MIGRATION).toMatch(/backend: "aura-js"/);
    expect(MIGRATION_FLAT).toMatch(/throws by name/);
  });

  it("names the removed snapshot fields", () => {
    expect(MIGRATION).toMatch(/jsFallbackAvailable/);
    expect(MIGRATION).toMatch(/fallback/);
  });

  it("explains each behaviour change as a defect fix rather than a silent difference", () => {
    // A behaviour change with no stated cause is indistinguishable from a regression.
    for (const pattern of [/solverIterations/, /flat-ended cylinders/, /respect body rotation/]) {
      expect(MIGRATION, `behaviour change not explained: ${String(pattern)}`).toMatch(pattern);
    }
  });
});

describe("§10 — the removal retrieval record is verifiable", () => {
  const REMOVED = readFileSync("docs/architecture/removed-in-1.6.md", "utf8");

  it("gives a retrieval command that actually works", () => {
    /*
     * The point of a retrieval record is that someone can get the file back. Asserting the
     * document *contains* instructions proves nothing, so this executes the documented command
     * against a real deleted path and checks that content comes back.
     */
    expect(REMOVED).toMatch(/git show <commit>\^:<path>/);
    const restored = execFileSync("git", ["show", "c9d6044a^:QuickFixes.md"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    });
    expect(restored.length, "the documented retrieval command returned nothing").toBeGreaterThan(1000);
  });

  it("lists every file the §7 deletion commit actually removed", () => {
    // A retrieval record that omits a deletion is worse than none: it implies completeness.
    const deleted = execFileSync("git", ["show", "--diff-filter=D", "--name-only", "--format=", "c9d6044a"], {
      encoding: "utf8"
    })
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    expect(deleted.length).toBeGreaterThan(5);
    for (const path of deleted) {
      const basename = path.split("/").pop()!;
      expect(REMOVED, `${path} was deleted but is not in the retrieval record`).toContain(basename);
    }
  });

  it("states plainly that no package or public symbol was removed", () => {
    // The most important line in the document, and the one a reader checks first.
    expect(REMOVED.replace(/\s+/g, " ")).toMatch(
      /No package, and no reachable public symbol, was removed in 1\.6/
    );
  });

  it("records the deletions R8 refused, with their measured blocker counts", () => {
    // So a future attempt starts from the measurement instead of repeating it.
    for (const pattern of [/61 of 68/, /370/, /0 lines removed/, /11 release gates/]) {
      expect(REMOVED, `missing R8 refusal evidence: ${String(pattern)}`).toMatch(pattern);
    }
  });
});
