/**
 * WS-5.4 — assemble the review package for the three `prototype-blocked` routes.
 *
 * R5 forbids promoting these routes without human review, and the PRD asks for the review package
 * to be *prepared* rather than for the routes to be promoted. That distinction is the whole point
 * of this tool: it gathers what a reviewer needs to decide and deliberately writes nothing that
 * could constitute a promotion.
 *
 * What it collects, per route, from evidence already in the tree:
 *
 * - the gate `releaseClass` and `gameTemplateStatus` blocker
 * - `route-health.json` classification, promotion status and the named blockers
 * - the human visual-review verdict and when it was recorded
 * - the retained screenshot with its **recomputed** digest, so the reviewer is looking at the
 *   bytes on disk rather than at a number recorded beside them
 * - the engine-level defects this route is the visible symptom of, cross-referenced to the fix
 *   commit or the ADR that blocks it
 *
 * That last section is the part a reviewer cannot assemble from the repository alone, and it is
 * why this is a tool rather than a document: the Phase 4 work fixed real causes behind two of
 * these three routes, and the third is blocked on a recorded architectural decision. A reviewer
 * deciding "is this still broken" needs to know which.
 *
 * Writes `tests/reports/blocked-route-review/report.json` and prints a summary. Never mutates
 * route health, gates, or the visual review.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");

const BLOCKED_ROUTES = ["showcase-blockfall-reactor", "showcase-skyline-runner", "showcase-turbo-drift-circuit"] as const;

/**
 * Engine defects behind each route's reported symptoms, and their current disposition.
 *
 * Hand-written because it is a *judgement* linking a symptom to a cause, and R4 wants the
 * evidence path beside it. Every entry names a commit or an ADR so a reviewer can check it.
 */
const ENGINE_CAUSES: Readonly<Record<string, readonly { readonly symptom: string; readonly cause: string; readonly disposition: string }[]>> = {
  "showcase-skyline-runner": [
    {
      symptom: "jump is barely there / unusable",
      cause:
        "solvePlatformerMotion derived apex from geometry: `apex = max(minApex, geometry.maxRise * apexHeadroom)` " +
        "collapsed to minApex on a level course, so the level dictated the jump.",
      disposition: "FIXED — apex is intent-derived (1fc1b10e, 5bc298e3); invariant 6 asserts a jump reaches >50% of v^2/2g"
    },
    {
      symptom: "character sticks on scenery / grounded flickers",
      cause:
        "Capsule colliders were built as flat-ended cylinders, so a character rested on a rim 0.099 above any slope " +
        "and `grounded` was permanently false; separately, step-up fired before reaching a ledge and step-down undid it.",
      disposition: "FIXED — compound capsule + step-up gate (4252ecbe)"
    },
    {
      symptom: "slopes behave as flat ground",
      cause: "Every raycast/spherecast ignored body rotation, so a tilted platform reported axis-aligned normals.",
      disposition: "FIXED — oriented-box cast in the body frame (4252ecbe)"
    }
  ],
  "showcase-turbo-drift-circuit": [
    {
      symptom: "wheels sink into the road; car movement is not natural",
      cause:
        "game.racing integrates its own kinematic motion — heading comes straight from steering input, so the car has " +
        "no slip, no yaw inertia and no lateral velocity, and therefore no weight transfer or understeer.",
      disposition:
        "BLOCKED — see docs/architecture/adr/0002-racing-kit-force-model-needs-a-route-length-scale.md. The rewire " +
        "is written and reverted: GameRacingRoute states no length scale, and at the route's declared 4x pace 11 of 12 " +
        "measured configurations cannot hold the tightest corner. Needs a route-contract decision, not a kit change."
    },
    {
      symptom: "opponent behaviour",
      cause: "Opponent driving shares the same kinematic integrator as the player.",
      disposition: "BLOCKED — same cause as above"
    }
  ],
  "showcase-blockfall-reactor": [
    {
      symptom: "stacked blocks shove each other apart",
      cause:
        "solverIterations defaulted to 1 and was written straight onto the displaced solver, whose default was 10 — so every " +
        "route ran a tenth of the constraint quality the backend ships with. A 6-box stack collapsed completely.",
      disposition: "SUPERSEDED — Rapier is now the sole physical owner and the 6-box stack invariant remains executable"
    }
  ]
};

interface GateRoute {
  readonly id: string;
  readonly releaseClass?: string;
  readonly gameTemplateStatus?: { readonly publicTemplateReady?: boolean; readonly blocker?: string };
}

function readJson<T>(relativePath: string): T | undefined {
  const path = join(repoRoot, relativePath);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function main(): void {
  const gates = readJson<{ readonly routes: readonly GateRoute[] }>("tools/showcase-library/route-gates.json");
  const review = readJson<{
    readonly reviewedAt?: string;
    readonly reviewer?: { readonly name?: string };
    readonly routes: readonly { readonly id: string; readonly verdict: string }[];
  }>("docs/project/showcase-visual-review.json");

  const routes = BLOCKED_ROUTES.map((id) => {
    const gate = gates?.routes.find((candidate) => candidate.id === id);
    const health = readJson<{
      readonly classification?: string;
      readonly publicShowcase?: boolean;
      readonly promotionStatus?: string;
      readonly blockers?: readonly string[];
    }>(`apps/${id}/route-health.json`);
    const screenshotPath = `tests/reports/showcase-route-primary-probes/${id}.png`;
    const screenshotAbsolute = join(repoRoot, screenshotPath);
    const screenshotDigest = existsSync(screenshotAbsolute)
      ? `sha256-${createHash("sha256").update(readFileSync(screenshotAbsolute)).digest("hex")}`
      : undefined;

    return {
      id,
      gate: {
        releaseClass: gate?.releaseClass,
        templatePublicReady: gate?.gameTemplateStatus?.publicTemplateReady,
        templateBlocker: gate?.gameTemplateStatus?.blocker
      },
      routeHealth: {
        classification: health?.classification,
        publicShowcase: health?.publicShowcase,
        promotionStatus: health?.promotionStatus,
        blockers: health?.blockers ?? []
      },
      humanReview: {
        verdict: review?.routes.find((candidate) => candidate.id === id)?.verdict,
        reviewedAt: review?.reviewedAt,
        reviewer: review?.reviewer?.name
      },
      retainedScreenshot: { path: screenshotPath, digest: screenshotDigest },
      engineCauses: ENGINE_CAUSES[id] ?? []
    };
  });

  const fixed = routes.flatMap((route) => route.engineCauses.filter((cause) => cause.disposition.startsWith("FIXED")));
  const blocked = routes.flatMap((route) => route.engineCauses.filter((cause) => cause.disposition.startsWith("BLOCKED")));

  const report = {
    generatedAt: new Date().toISOString(),
    purpose:
      "WS-5.4 review package. Prepared for human review per R5; contains no promotion. Screenshot digests are " +
      "recomputed from the PNG bytes rather than read from route-health.json, so the reviewer sees the artefact.",
    promotionPerformed: false,
    summary: {
      routes: routes.length,
      engineCausesFixed: fixed.length,
      engineCausesBlocked: blocked.length,
      readyForReviewDecision: routes.filter((route) => route.engineCauses.every((cause) => cause.disposition.startsWith("FIXED"))).map((route) => route.id),
      stillBlockedOnAnArchitecturalDecision: routes.filter((route) => route.engineCauses.some((cause) => cause.disposition.startsWith("BLOCKED"))).map((route) => route.id)
    },
    routes
  };

  const outputDirectory = join(repoRoot, "tests/reports/blocked-route-review");
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log("WS-5.4 blocked-route review package (no promotion performed)\n");
  for (const route of routes) {
    console.log(`${route.id}`);
    console.log(`  gate            : ${route.gate.releaseClass}`);
    console.log(`  promotion status: ${route.routeHealth.promotionStatus}`);
    console.log(`  human verdict   : ${route.humanReview.verdict} (${route.humanReview.reviewedAt ?? "no date"})`);
    console.log(`  blockers        : ${route.routeHealth.blockers.length}`);
    for (const cause of route.engineCauses) {
      console.log(`  - ${cause.symptom}`);
      console.log(`      ${cause.disposition}`);
    }
    console.log("");
  }
  console.log(`engine causes fixed  : ${fixed.length}`);
  console.log(`engine causes blocked: ${blocked.length}`);
  console.log(`ready for a review decision: ${report.summary.readyForReviewDecision.join(", ") || "none"}`);
  console.log(`still blocked on an ADR    : ${report.summary.stillBlockedOnAnArchitecturalDecision.join(", ") || "none"}`);
  console.log("\nreport: tests/reports/blocked-route-review/report.json");
}

main();
