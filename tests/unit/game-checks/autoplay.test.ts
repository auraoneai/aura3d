// 5.7.0 `autoplay` game check: every live game supports ?autoplay=1 through readAutoplayFlag; inline readers are
// allowed only for the games on AUTOPLAY_INLINE_ALLOWLIST (their flag semantics differ from the shared reader).
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AUTOPLAY_INLINE_ALLOWLIST, loadInventory, runChecks } from "../../../tools/game-checks/lib/index.mjs";

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

type Finding = { check: string; severity: string; file: string; line: number; message: string };

function check(files: Record<string, string>, slug = "demo"): Finding[] {
  const root = mkdtempSync(join(tmpdir(), "gc-autoplay-"));
  dirs.push(root);
  const put = (rel: string, content: string) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), content); };
  mkdirSync(join(root, "tools/game-checks/data"), { recursive: true });
  copyFileSync(join(process.cwd(), "tools/game-checks/data/terms.json"), join(root, "tools/game-checks/data/terms.json"));
  put("docs/workflows/game-inventory.json", JSON.stringify({ liveGameCount: 1, games: [{ slug, appFolder: "showcase-demo", title: "Demo", kind: "game", status: "live" }] }));
  for (const [rel, content] of Object.entries(files)) put(`apps/showcase-demo/${rel}`, content);
  return runChecks({ root, slugs: [slug], only: ["autoplay"], global: false, env: {} }).findings as Finding[];
}

describe("game-checks autoplay", () => {
  it("passes a game that reads the flag with readAutoplayFlag (call or re-export)", () => {
    expect(check({ "src/main.ts": `import { readAutoplayFlag } from "@aura3d/engine/game";\nconst on = readAutoplayFlag(location.search);\n` })).toEqual([]);
    expect(check({ "src/autoplay.ts": `export { readAutoplayFlag as autoplayRequested } from "@aura3d/engine/game";\n` })).toEqual([]);
  });

  it("fails a game with no autoplay at all", () => {
    const f = check({ "src/main.ts": `const keys = { right: false };\n// ?autoplay=1 is planned\n` });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "error", file: "apps/showcase-demo" });
    expect(f[0].message).toMatch(/no \?autoplay=1 support/);
  });

  it("fails inline readers (get, has, name lists, a used readQaParams flag) off the allow-list", () => {
    const get = check({ "src/main.ts": `const params = new URLSearchParams(location.search);\nconst on = params.get("autoplay") === "1";\n` });
    expect(get.map((x) => [x.severity, x.line])).toEqual([["error", 2]]);
    expect(get[0].message).toMatch(/readAutoplayFlag/);
    expect(check({ "src/a.ts": `const p = new URLSearchParams(location.search);\nexport const on = p.has('autoplay');\n` })).toHaveLength(1);
    expect(check({ "src/a.ts": `const p = new URLSearchParams(location.search);\nexport const on = ["autoplay", "demo"].some((k) => p.get(k) === "1");\n` })).toHaveLength(1);
    const schema = check({ "src/main.ts": `const config = readQaParams({\n  autoplay: { type: "flag" }\n});\nconst on = config.autoplay;\n` });
    expect(schema.map((x) => x.line)).toEqual([4]);
  });

  it("an inline read fails even next to readAutoplayFlag; a declared but unused schema flag does not", () => {
    expect(check({ "src/a.ts": `import { readAutoplayFlag } from "@aura3d/engine/game";\nexport const a = readAutoplayFlag();\nexport const b = new URLSearchParams(location.search).get("autoplay");\n` })).toHaveLength(1);
    expect(check({ "src/main.ts": `import { readAutoplayFlag } from "@aura3d/engine/game";\nconst config = readQaParams({ autoplay: { type: "flag" } });\nconst on = readAutoplayFlag(location.search);\n` })).toEqual([]);
  });

  it("ignores comments", () => {
    expect(check({ "src/main.ts": `import { readAutoplayFlag } from "@aura3d/engine/game";\n// old: params.get("autoplay") === "1"\nreadAutoplayFlag();\n` })).toEqual([]);
  });

  it("an allow-listed game may keep its inline reader, and a stale entry warns", () => {
    expect(check({ "src/main.ts": `const p = new URLSearchParams(location.search);\nexport const on = p.get("autoplay") === "1";\n` }, "cross-hop")).toEqual([]);
    const stale = check({ "src/main.ts": `import { readAutoplayFlag } from "@aura3d/engine/game";\nreadAutoplayFlag();\n` }, "cross-hop");
    expect(stale.map((x) => x.severity)).toEqual(["warn"]);
    expect(stale[0].message).toMatch(/stale AUTOPLAY_INLINE_ALLOWLIST entry/);
  });

  it("the allow-list names only live games, each with a reason, and the real tree has no autoplay findings", () => {
    const live = new Set(loadInventory(process.cwd()).games.filter((g: { kind: string; status: string }) => g.kind === "game" && g.status === "live").map((g: { slug: string }) => g.slug));
    expect(live.size).toBe(30);
    for (const [slug, reason] of Object.entries(AUTOPLAY_INLINE_ALLOWLIST)) {
      expect(live.has(slug), slug).toBe(true);
      expect(String(reason).length).toBeGreaterThan(20);
    }
    const result = runChecks({ root: process.cwd(), slugs: "all", only: ["autoplay"], global: false, env: {} });
    expect(result.findings).toEqual([]);
  });
});
