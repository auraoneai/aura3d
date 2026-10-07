import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyze } from "../../../tools/script-prune/index";

// PRD-15 T7.3 — fixture: chain a→b, orphan c, workflow-referenced d,
// missing-target e. Expected: keep a, b, d; delete c, e.
const REPO_ROOT = resolve(__dirname, "../../..");

const SCRIPTS = {
  a: "echo a && pnpm run b",
  b: "echo b",
  c: "echo orphan",
  d: "echo workflow",
  e: "node tools/script-prune/definitely-not-real-e.ts"
};

const corpus = new Map<string, string>([
  [
    join(REPO_ROOT, ".github/workflows/fixture.yml"),
    "steps:\n  - run: pnpm run a\n  - run: pnpm run d\n"
  ]
]);

describe("script-prune analyze (PRD-15 T7.3)", () => {
  const rows = analyze(SCRIPTS, corpus);
  const byName = new Map(rows.map((r) => [r.name, r]));

  it("keeps a (workflow-referenced) and b (referenced by kept a)", () => {
    expect(byName.get("a")?.verdict).toBe("keep");
    expect(byName.get("b")?.verdict).toBe("keep");
    expect(byName.get("b")?.referencedBy).toContain("script:a");
  });

  it("deletes orphan c (zero references)", () => {
    expect(byName.get("c")?.verdict).toBe("delete");
    expect(byName.get("c")?.reason).toContain("zero references");
  });

  it("keeps workflow-referenced d", () => {
    expect(byName.get("d")?.verdict).toBe("keep");
    expect(byName.get("d")?.referencedBy.some((r) => r.endsWith("fixture.yml"))).toBe(true);
  });

  it("deletes e whose script target file is missing", () => {
    expect(byName.get("e")?.verdict).toBe("delete");
    expect(byName.get("e")?.reason).toContain("target file(s) missing");
  });

  it("pass 2 cascade: b dies when only a deleted script referenced it", () => {
    const rows2 = analyze({ x: "echo x && pnpm run y", y: "echo y" }, new Map());
    const m = new Map(rows2.map((r) => [r.name, r]));
    expect(m.get("x")?.verdict).toBe("delete");
    expect(m.get("y")?.verdict).toBe("delete");
    expect(m.get("y")?.reason).toContain("referenced only by deleted scripts");
  });
});
