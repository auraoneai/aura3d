import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { REMOVED_5_0_ROOT_VALUES, REMOVED_5_0_SUBPATHS, resetGitCache, runChecks } from "../../../tools/game-checks/lib/index.mjs";

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

function check(source: string) {
  const root = mkdtempSync(join(tmpdir(), "gc-removed-"));
  dirs.push(root);
  const put = (rel: string, content: string) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), content); };
  mkdirSync(join(root, "tools/game-checks/data"), { recursive: true });
  copyFileSync(join(process.cwd(), "tools/game-checks/data/terms.json"), join(root, "tools/game-checks/data/terms.json"));
  put("docs/workflows/game-inventory.json", JSON.stringify({ liveGameCount: 1, games: [{ slug: "demo", appFolder: "showcase-demo", title: "Demo", kind: "game", status: "live" }] }));
  put("apps/showcase-demo/src/main.ts", source);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  resetGitCache();
  return runChecks({ root, slugs: ["demo"], only: ["no-removed-5-0-apis"], global: false, env: {} }).findings;
}

describe("game-checks no-removed-5-0-apis", () => {
  it("lists the 38 B14 values (plus createGame) and the 9 B15 subpaths", () => {
    expect(REMOVED_5_0_ROOT_VALUES).toHaveLength(39);
    expect(REMOVED_5_0_SUBPATHS).toHaveLength(9);
  });

  it("flags removed root values, aliases, multi-line and re-exports", () => {
    const f = check(`import { createAuraApp, createA3DApp as legacy } from "@aura3d/engine";\nimport {\n  scene,\n  unsafeModelUrl,\n} from "@aura3d/engine";\nexport { loadAsset } from "@aura3d/engine";\nimport { createGame } from "@aura3d/engine";\n`);
    expect(f.map((x) => x.message.match(/"(\w+)"/)![1])).toEqual(["createA3DApp", "unsafeModelUrl", "loadAsset", "createGame"]);
    expect(f.every((x) => x.severity === "error")).toBe(true);
  });

  it("flags removed subpaths (static, dynamic, require) but not the valid sub-entries", () => {
    const f = check(`import { a } from "@aura3d/engine/production-runtime";\nimport("@aura3d/engine/rendering/webgpu");\nconst x = require("@aura3d/engine/assets/browser");\nimport { ok } from "@aura3d/engine/renderer";\nimport { game } from "@aura3d/engine/game";\nimport { r } from "@aura3d/engine/rendering-extra";\nimport "@aura3d/engine/contracts";\n`);
    expect(f.map((x) => x.line)).toEqual([1, 2, 3, 7]);
  });

  it("stays quiet on valid 5.0 code and on comments", () => {
    expect(check(`// import { createA3DApp } from "@aura3d/engine";\nimport { createAuraApp, scene } from "@aura3d/engine";\nimport { createGame } from "@aura3d/engine/game";\n`)).toEqual([]);
  });
});
