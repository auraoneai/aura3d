import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * WS-6.2 — public claims stay tied to what was measured.
 *
 * Two failure modes, and this guards both.
 *
 * **Overclaiming** is the obvious one: broad better-than-Three.js language with no measurement
 * behind it. Currently there is none, and this keeps it that way.
 *
 * **Stale honesty** is the one that actually bit. The README's "what is still not resolved"
 * section is the right instinct, and it had drifted into being wrong in Aura3D's *favour* and
 * against it at the same time: it claimed five physics capabilities were "unreachable from the
 * public API" — constraints, friction, restitution, CCD and penetration resolution — when all
 * five are now reachable through `createPhysicsRuntime` and covered by the WS-4.3 invariants,
 * while saying nothing at all about the bundle being ~2x Three.js, which §B.1 calls the single
 * largest adoption blocker. A limitations list that is out of date is not honesty, it is noise.
 *
 * So the rule enforced here is: **every public number is either currently measured, or absent.**
 */

const README = readFileSync("README.md", "utf8");

interface BundleReport {
  readonly pass: boolean;
  readonly scenarios: readonly { readonly id: string; readonly ratio: number }[];
}

const bundle = JSON.parse(readFileSync("tests/reports/bundle-scenarios.json", "utf8")) as BundleReport;

describe("public claims do not overclaim", () => {
  it("makes no broad better-than-Three.js or better-than-Babylon claim", () => {
    // Scoped comparisons backed by a measurement are fine — "9 vs 15 authored lines" is a fact.
    // What is forbidden is an unscoped superiority claim.
    const forbidden = [
      /faster than three\.?js/i,
      /better than three\.?js/i,
      /smaller than three\.?js/i,
      /replaces three\.?js/i,
      /beats three\.?js/i,
      /faster than babylon/i,
      /better than babylon/i,
      /drop-in replacement for three\.?js/i
    ];
    for (const pattern of forbidden) {
      expect(pattern.test(README), `README contains a broad superiority claim: ${String(pattern)}`).toBe(false);
    }
  });

  it("keeps a 'what is still not resolved' section, because a release note without one is not useful", () => {
    expect(README).toMatch(/what is still not resolved/i);
  });
});

describe("public claims state the bundle position, which is the release blocker", () => {
  it("discloses that the bundle is over budget while it is over budget", () => {
    /*
     * Conditional on the measurement, not hard-coded. If the bundle gap closes, `bundle.pass`
     * becomes true and this assertion stops requiring the disclosure — so the README does not
     * have to carry a stale warning forever, and cannot drop a current one.
     */
    if (bundle.pass) return;
    expect(README, "bundle is over budget but the README does not say so").toMatch(/over budget/i);
    /*
     * And with the actual ratios, not a vague admission.
     *
     * Compared at 2 decimal places against the README's own table. `toFixed(2)` on the report
     * value is what the table states, so a re-measurement that moves a ratio forces the table to
     * be updated rather than left describing an older build.
     */
    for (const scenario of bundle.scenarios) {
      const rounded = scenario.ratio.toFixed(2);
      expect(README, `README does not state the measured ratio ${rounded}x for ${scenario.id}`).toContain(`${rounded}x`);
    }
  });

  it("does not claim physics capabilities are unreachable when they are reachable", () => {
    /*
     * The specific stale claim that was removed. `createPhysicsRuntime` exposes bodies,
     * colliders, joints, forces and impulses, and WS-4.3's nine invariants cover constraints,
     * friction, restitution and CCD on the production backend.
     */
    expect(README).not.toMatch(/unreachable from the public API/i);
    /*
     * Reachability is proven by *resolving the import*, not by grepping the generated API doc.
     *
     * A first version of this test asserted `createPhysicsRuntime` appears in
     * `docs/api/public-api.md` and failed — the generator lists barrel `export` statements, and
     * this symbol reaches the root through a re-export it does not enumerate. The doc is a
     * catalogue; the module graph is the contract. `tests/unit/physics/public-physics-runtime.test.ts`
     * already imports it from `@aura3d/engine` and would fail if it stopped resolving, which is
     * stronger evidence than a string in a generated file.
     */
    const runtimeContract = readFileSync("tests/unit/physics/public-physics-runtime.test.ts", "utf8");
    expect(runtimeContract, "the physics reachability contract no longer imports from @aura3d/engine").toMatch(
      /import \{[\s\S]*createPhysicsRuntime[\s\S]*\} from "@aura3d\/engine"/
    );
  });

  it("names the broken public routes rather than leaving them undisclosed", () => {
    // WS-5.2 found three. A limitations section that omits known-broken public routes is the
    // stale-honesty failure mode again.
    const tierHealth = "tests/reports/tier12-route-health/report.json";
    if (!existsSync(tierHealth)) return;
    const report = JSON.parse(readFileSync(tierHealth, "utf8")) as { readonly failures: readonly string[] };
    const brokenRoutes = new Set(report.failures.map((failure) => failure.split("/")[2]).filter(Boolean));
    for (const route of brokenRoutes) {
      expect(README, `README does not disclose that ${route} is broken`).toContain(route!);
    }
  });
});

describe("the shipped claim gates still pass", () => {
  it("passes check:marketing-truth and check:agent-docs", () => {
    // The PRD's stated proof for WS-6.2. Run here so the claim edits above cannot break them
    // silently between release runs.
    for (const script of ["check:marketing-truth", "check:agent-docs"]) {
      expect(() => execFileSync("pnpm", [script], { stdio: "pipe" }), `${script} failed`).not.toThrow();
    }
  }, 300_000);
});
