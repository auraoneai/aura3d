// PRD-15 CI-2 — arch-gates `no-cross-package-relative` fail mode. A
// `packages/<a>/src/**` file importing `../../<b>/src/**` resolves in the repo
// but is dead inside the packed tarball, so it must fail the gate unless a
// dated allowlist row (file key) covers it. Known-bad, clean, allowlisted,
// expired and live-tree cases.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkNoCrossPackageRelative } from "../../../tools/arch-gates/index";

const REPO = join(__dirname, "../../..");
const tmp: string[] = [];

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "archgate-ncpr-"));
  tmp.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}

afterAll(() => {
  for (const d of tmp) rmSync(d, { recursive: true, force: true });
});

const BAD = "packages/engine/src/lanes/prd02.ts";
const BAD_SOURCE = [
  `import { auraLightsCounters } from "../../../rendering/src/LightUniforms.js";`,
  `import type { RenderDevice } from "../../../rendering/src/RenderDevice.js";`,
  `export const read = (_d: RenderDevice) => auraLightsCounters;`,
  ""
].join("\n");
const RENDERING = {
  "packages/rendering/src/LightUniforms.ts": "export const auraLightsCounters = 0;\n",
  "packages/rendering/src/RenderDevice.ts": "export interface RenderDevice { readonly id: number }\n"
};

function allowlist(expires: string): string {
  return JSON.stringify([
    { rule: "no-cross-package-relative", file: BAD, expires, reason: "fixture", request: "#0" }
  ]);
}

describe("arch-gates no-cross-package-relative (CI-2 fail mode)", () => {
  it("fails a packages/engine/src file that imports ../../../rendering/src", () => {
    const root = fixture({ [BAD]: BAD_SOURCE, ...RENDERING });
    const enforced = checkNoCrossPackageRelative(root).filter((f) => f.enforced);
    expect(enforced).toHaveLength(2);
    expect(enforced.every((f) => f.file === BAD)).toBe(true);
    expect(enforced[0]!.detail).toContain("enters packages/rendering");
  });

  it("passes package-subpath imports and same-package relative imports", () => {
    const root = fixture({
      "packages/engine/src/lanes/prd02.ts": [
        `import { auraLightsCounters } from "@aura3d/rendering";`,
        `import { local } from "../contracts/local.js";`,
        `export const read = () => [auraLightsCounters, local];`,
        ""
      ].join("\n"),
      "packages/engine/src/contracts/local.ts": "export const local = 1;\n",
      ...RENDERING
    });
    expect(checkNoCrossPackageRelative(root)).toEqual([]);
  });

  it("downgrades a dated allowlist row to warn until it expires", () => {
    const root = fixture({ [BAD]: BAD_SOURCE, ...RENDERING, "tools/arch-gates/allowlist.json": allowlist("2999-12-31") });
    const findings = checkNoCrossPackageRelative(root);
    expect(findings).toHaveLength(2);
    expect(findings.some((f) => f.enforced)).toBe(false);
    expect(findings[0]!.detail).toContain("allowlisted until 2999-12-31");
  });

  it("fails again once the allowlist row has expired", () => {
    const root = fixture({ [BAD]: BAD_SOURCE, ...RENDERING, "tools/arch-gates/allowlist.json": allowlist("2000-01-01") });
    const enforced = checkNoCrossPackageRelative(root).filter((f) => f.enforced);
    expect(enforced).toHaveLength(2);
    expect(enforced[0]!.detail).toContain("ALLOWLIST EXPIRED");
  });

  it("keeps specifiers that leave packages/ entirely in warn mode", () => {
    const root = fixture({
      "packages/aura3d-cli/src/cmd.ts": `import { x } from "../../../tools/x/index.js";\nexport const y = x;\n`,
      "tools/x/index.ts": "export const x = 1;\n"
    });
    const findings = checkNoCrossPackageRelative(root);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.enforced).toBeFalsy();
  });

  it("live tree: every cross-package src import is allowlisted with a date and an issue", () => {
    const enforced = checkNoCrossPackageRelative(REPO).filter((f) => f.enforced);
    expect(enforced.map((f) => `${f.file}: ${f.detail}`)).toEqual([]);
  });
});
