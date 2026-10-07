// PRD-07 P6-T5 — `vfx-pools-to-effects` codemod (C-39): reports the E25
// pooled-primitive patterns and rewrites the simple constructs
// (spawnLoop→spawn; primitives.box/sphere + .runtime → app.effects.burst).
// The fixture is a verbatim copy of apps/showcase-blockfall-reactor/src/
// clear-fx.ts — the app source is never edited in place.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { vfxPoolsToEffectsCodemod, vfxPoolsToEffectsTransform, findPooledPrimitiveChains } from "../../../../packages/aura3d-cli/src/commands/prd07/codemods";

const FIXTURE = fileURLToPath(new URL("../fixtures/clear-fx.ts", import.meta.url));

describe("P6-T5 vfx-pools-to-effects codemod", () => {
  it("reports the E25 pool sites in the clear-fx fixture", () => {
    const source = readFileSync(FIXTURE, "utf8");
    const { rows } = vfxPoolsToEffectsTransform(source, "clear-fx.ts");
    const pool = rows.filter((r) => r.construct.startsWith("E25"));
    // Pooled primitives array + the life-driven setScale signature.
    expect(pool.some((r) => r.construct.includes("pooled-primitive array"))).toBe(true);
    expect(pool.some((r) => r.construct.includes("life-driven setScale"))).toBe(true);
    // And the pooled primitive chain itself is found and rewritten.
    expect(rows.some((r) => r.construct.startsWith("primitives.box"))).toBe(true);
  });

  it("rewrites pooled primitives.box chains to app.effects.burst", () => {
    const source = readFileSync(FIXTURE, "utf8");
    const { code } = vfxPoolsToEffectsTransform(source, "clear-fx.ts");
    expect(code).toContain('app.effects.burst("explosion-small"');
    expect(code).not.toMatch(/primitives\.box\s*\([^]*\.runtime\s*\(/);
  });

  it("rewrites effects.spawnLoop to effects.spawn", () => {
    const { code, rows } = vfxPoolsToEffectsTransform(
      'const h = effects.spawnLoop("spark", [0, 0, 0]);\n',
      "demo.ts"
    );
    expect(code).toContain('effects.spawn("spark"');
    expect(rows.some((r) => r.mapping === "approximate" && r.target?.includes("effects.spawn"))).toBe(true);
  });

  it("findPooledPrimitiveChains handles nested parens and multiline chains", () => {
    const source = `const n = primitives.sphere({ name: "s" })
      .position(0, cellPosition(1, 2, 3)[0], 0)
      .scale([0.01, 0.01, 0.01])
      .runtime(game.runtimeNode(id("x"), { tags: ["p"] }));`;
    const chains = findPooledPrimitiveChains(source);
    expect(chains.length).toBe(1);
    expect(chains[0]!.primitive).toBe("sphere");
    expect(source.slice(chains[0]!.start, chains[0]!.end)).toContain(".runtime(");
  });

  it("the codemod descriptor registers as prd07-owned with a transform", () => {
    const mod = vfxPoolsToEffectsCodemod();
    expect(mod.name).toBe("vfx-pools-to-effects");
    expect(mod.owner).toBe("prd07");
    expect(typeof mod.transform).toBe("function");
  });
});
