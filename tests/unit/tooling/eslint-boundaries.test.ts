/**
 * WS-3.6b — proof that the boundary rules actually fire.
 *
 * The rule this replaced passed on every file in the repository for a year while enforcing nothing,
 * because the config had no TypeScript parser. A green `pnpm lint` is therefore not evidence that
 * boundaries are enforced. These tests lint synthetic sources through the real
 * `eslint.config.js`-registered plugin and assert on the reported message ids, so the gate fails if
 * the rules ever stop matching.
 */
import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import auraBoundaries from "../../../tools/eslint-plugin-aura3d-boundaries/index.mjs";
import { PACKAGE_TIERS } from "../../../tools/package-tiers";
import { PACKAGE_INVENTORY, packageTiers, releasePackageTargets } from "../../../tools/release/release-inventory.mjs";

const repoRoot = resolve(__dirname, "../../..");

/** Lint `code` as if it were the file at `relativePath`, using only the boundary rules. */
async function lintAs(relativePath: string, code: string, rule: string) {
  const eslint = new ESLint({
    cwd: repoRoot,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts"],
        languageOptions: {
          parser: await import("@typescript-eslint/parser"),
          ecmaVersion: "latest",
          sourceType: "module"
        },
        plugins: { "aura3d-boundaries": auraBoundaries },
        rules: { [`aura3d-boundaries/${rule}`]: "error" }
      }
    ]
  });
  const [result] = await eslint.lintText(code, { filePath: resolve(repoRoot, relativePath) });
  return result.messages;
}

describe("aura3d-boundaries/no-upward-package-import", () => {
  it("reports an import that points up-tier", async () => {
    // math is tier 0, engine is tier 5.
    const messages = await lintAs(
      "packages/math/src/Probe.ts",
      `import { createAuraApp } from "@aura3d/engine";\nexport const x = createAuraApp;\n`,
      "no-upward-package-import"
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.messageId).toBe("upward");
    expect(messages[0]?.message).toContain("math (tier 0)");
    expect(messages[0]?.message).toContain("engine (tier 5)");
  });

  it("allows an import that points down-tier", async () => {
    const messages = await lintAs(
      "packages/engine/src/Probe.ts",
      `import { Vector3 } from "@aura3d/math";\nexport const x = Vector3;\n`,
      "no-upward-package-import"
    );
    expect(messages).toEqual([]);
  });

  it("resolves a subpath to the package it truly aliases, not its prefix", async () => {
    // `@aura3d/engine/scene` aliases into packages/scene (tier 2), NOT packages/engine
    // (tier 5). `assets` is tier 3, so importing scene is legal and importing engine would not
    // be. A prefix-based implementation would resolve this to `engine` and wrongly report it. This
    // is the case that makes alias resolution mandatory.
    const messages = await lintAs(
      "packages/assets/src/Probe.ts",
      `import { Scene } from "@aura3d/engine/scene";\nexport const x = Scene;\n`,
      "no-upward-package-import"
    );
    expect(messages).toEqual([]);
  });

  it("reports a 4.x legacy subpath removed in 5.0.0 instead of attributing it by prefix", async () => {
    // PRD-15 T5.6 deprecated `@aura3d/engine/rendering`; 5.0.0 removed it (migration guide B15),
    // so it has no tsconfig path and must not silently resolve to `engine` by prefix.
    const messages = await lintAs(
      "packages/assets/src/Probe.ts",
      `import { WebGL2Device } from "@aura3d/engine/rendering";\nexport const x = WebGL2Device;\n`,
      "no-upward-package-import"
    );
    expect(messages.map((m) => m.messageId)).toEqual(["unresolved"]);
  });

  it("reports an unknown @aura3d specifier rather than silently passing it", async () => {
    const messages = await lintAs(
      "packages/math/src/Probe.ts",
      `import { y } from "@aura3d/not-a-real-package-xyz";\nexport const x = y;\n`,
      "no-upward-package-import"
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.messageId).toBe("unresolved");
  });

  it("checks re-exports and dynamic imports, not only static imports", async () => {
    const reexport = await lintAs(
      "packages/math/src/Probe.ts",
      `export { createAuraApp } from "@aura3d/engine";\n`,
      "no-upward-package-import"
    );
    expect(reexport.map((m) => m.messageId)).toEqual(["upward"]);

    const dynamic = await lintAs(
      "packages/math/src/Probe.ts",
      `export const load = () => import("@aura3d/engine");\n`,
      "no-upward-package-import"
    );
    expect(dynamic.map((m) => m.messageId)).toEqual(["upward"]);
  });

  it("ignores files outside packages/*", async () => {
    const messages = await lintAs(
      "apps/showcase/src/main.ts",
      `import { createAuraApp } from "@aura3d/engine";\nexport const x = createAuraApp;\n`,
      "no-upward-package-import"
    );
    expect(messages).toEqual([]);
  });
});

describe("aura3d-boundaries/no-internal-deep-import", () => {
  it("reports another package's src/", async () => {
    const messages = await lintAs(
      "packages/engine/src/Probe.ts",
      `import { x } from "@aura3d/rendering/src/WebGL2Device";\nexport const y = x;\n`,
      "no-internal-deep-import"
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.messageId).toBe("deep");
  });

  it("allows a documented public subpath", async () => {
    const messages = await lintAs(
      "packages/engine/src/Probe.ts",
      `import { x } from "@aura3d/assets/browser";\nexport const y = x;\n`,
      "no-internal-deep-import"
    );
    expect(messages).toEqual([]);
  });
});

describe("tier source of truth", () => {
  it("is shared with the package-graph gate", async () => {
    // If these two ever diverge, one gate would permit what the other rejects. They must read the
    // same module — this asserts the module exists and is populated, and the import above is what
    // makes the sharing real.
    expect(PACKAGE_TIERS).toEqual(packageTiers());
    expect(PACKAGE_TIERS.math).toBe(0);
    expect(PACKAGE_TIERS.engine).toBeGreaterThan(PACKAGE_TIERS.rendering);
  });
});

describe("versioned package inventory", () => {
  it("assigns a tier to every current workspace package and a directory to every release target", () => {
    const workspace = readdirSync(resolve(repoRoot, "packages")).filter(dir => existsSync(resolve(repoRoot, "packages", dir, "package.json")));
    expect(workspace.filter(dir => PACKAGE_TIERS[dir] === undefined)).toEqual([]);
    for (const dir of workspace) {
      const manifest = JSON.parse(readFileSync(resolve(repoRoot, "packages", dir, "package.json"), "utf8")) as { name: string };
      expect(PACKAGE_INVENTORY.find(item => item.directory === `packages/${dir}`)?.name).toBe(manifest.name);
    }
    const targets = releasePackageTargets("5.0.0");
    // invariant: source must keep `@aura3d/addons` as a release target — the addons workspace package is versioned and published with the 5.0 release set
    expect(targets.map(target => target.name)).toContain("@aura3d/addons");
    expect(targets.find(target => target.name === "@aura3d/engine")?.directory).toBe(".");
    for (const target of targets) expect(existsSync(resolve(repoRoot, target.directory, "package.json"))).toBe(true);
  });
});
