/**
 * Declared ownership and read/write graph for retained evidence.
 *
 * ## Why this is declared rather than inferred
 *
 * The Aura Clash stale-first-frame incident happened because two producers could write semantically
 * overlapping evidence and nothing anywhere stated which one was authoritative. Inferring ownership from
 * code would re-derive the same ambiguity; declaring it makes "exactly one producer owns this path" a
 * checkable property, and makes an accidental second writer a test failure rather than a mystery.
 *
 * `hashes` lists paths a producer *binds into* its output. That is what makes ordering cycles findable:
 * the route-primary probe hashes `apps/<route>/route-health.json`, and the composition regenerator
 * rewrites that same file, so probe-then-composition always leaves the probe's own binding stale.
 */

/** Producer id -> authoritative artifact paths it writes. */
export const PRODUCER_OWNERSHIP = Object.freeze({
  "route-primary-probes": [
    "tests/reports/showcase-route-primary-probes/<route>.json",
    "tests/reports/showcase-route-primary-probes/<route>.png",
    "tests/reports/showcase-route-primary-probes/<route>-subject-suppressed.png",
    "tests/reports/showcase-route-primary-probes/_summary.json"
  ],
  "regenerate-game-composition-evidence": [
    "tests/reports/showcase-spec-compiler/<report>/game-template/<route>-asset-pair-composition.json",
    "apps/<route>/game-template/<route>-asset-pair-composition.json",
    "apps/<route>/route-health.json",
    "apps/<route>/showcase-evidence-checklist.json",
    "apps/<route>/src/generated/game-geometry.ts"
  ],
  "showcase-release-asset-probes": [
    "tests/reports/showcase-release-asset-probes/<asset>.json",
    "tests/reports/showcase-release-asset-probes/<asset>.png",
    "tests/reports/showcase-release-asset-probes/_summary.json"
  ],
  "vehicle-wheel-visibility": [
    "tests/reports/vehicle-wheel-visibility/<asset>.json",
    "tests/reports/vehicle-wheel-visibility/<asset>-angle-<n>.png"
  ],
  "aura-clash-launch-readiness": [
    "apps/aura-clash-showcase/launch-evidence/visual-approval.json",
    "apps/aura-clash-showcase/launch-evidence/first-frame.png"
  ],
  "showcase-library-screenshots": [
    "tests/reports/showcase-library-screenshots/<route>-desktop.png",
    "tests/reports/showcase-library-screenshots/<route>-mobile.png"
  ],
  "showcase-gameplay-proofs": [
    "tests/reports/showcase-gameplay/<route>.json",
    "tests/reports/showcase-gameplay/<route>-<state>.png"
  ],
  /*
   * Producers added during this pass.
   *
   * Declared because the registry is only meaningful if it is complete: an undeclared artifact class has no owner, so
   * nothing detects a second writer appearing on it. Auditing the reports tree against this map found four classes
   * with no owner -- three of them ones I had just created, which is exactly how the original ambiguity arose.
   */
  "game-visual-qa": [
    "tests/reports/showcase-game-visual-qa/<route>.json"
  ],
  "multipart-primitive-draw": [
    "tests/reports/multipart-primitive-draw/body-and-four-wheels.json"
  ],
  "asset-screening": [
    "tests/reports/asset-screening/<intent>.json"
  ],
  "replicability-metrics": [
    "tests/reports/replicability-metrics/report.json"
  ],
  "current-threejs-baseline": [
    "tests/reports/current-threejs-baseline.json"
  ],
  "final-competitive-baseline": [
    "tests/reports/final-competitive-baseline/<artifact>"
  ],
  "external-candidate-package-audit": [
    "tests/reports/external-candidate-package-audit.json"
  ],
  "final-subsystem-ownership": [
    "tests/reports/final-subsystem-ownership.json",
    "docs/architecture/final-subsystem-ownership.md"
  ],
  "physics-backend-bakeoff": [
    "tests/reports/physics-backend-bakeoff/<artifact>"
  ],
  "optional-rapier-browser": [
    "tests/reports/optional-rapier-physics/report.json"
  ],
  /*
   * The freshness audit owns its own retained report.
   *
   * Declared for the same reason every other producer is: an artifact class with no declared owner passes the
   * "at most one owner" check trivially while enjoying none of its protection. It would be incoherent for the
   * arbiter of retained evidence to be the one producer exempt from the rules it enforces.
   */
  "evidence-freshness-audit": [
    "tests/reports/evidence-freshness/staleness-audit.json"
  ]
});

/**
 * Retained artifact directories every declared producer must cover.
 *
 * Used by a test to fail when a class of retained evidence exists on disk with no declared owner. Without that check
 * the registry decays silently: a new producer ships, nothing claims its output, and the "exactly one owner" guarantee
 * quietly stops applying to it.
 *
 * Deliberately a list of *directories under `tests/reports/`* rather than every file: the reports tree also holds
 * command-proof logs and one-off audit folders that are not producer-owned evidence, and demanding an owner for those
 * would make the check noise rather than signal.
 */
export const OWNED_ARTIFACT_DIRECTORIES = Object.freeze([
  "showcase-route-primary-probes",
  "showcase-release-asset-probes",
  "vehicle-wheel-visibility",
  "showcase-library-screenshots",
  "showcase-gameplay",
  "showcase-game-visual-qa",
  "multipart-primitive-draw",
  "asset-screening",
  "replicability-metrics",
  "evidence-freshness",
  "physics-backend-bakeoff",
  "optional-rapier-physics"
]);

/** Producer id -> `{ writes, hashes }` in the same path vocabulary as ownership. */
export const PRODUCER_ORDERING_GRAPH = Object.freeze({
  "route-primary-probes": {
    writes: PRODUCER_OWNERSHIP["route-primary-probes"],
    /*
     * The probe used to bind a hash of the whole `apps/<route>/route-health.json`, which created a real ordering
     * cycle: the composition producer rewrites that file, so probe-then-composition always left the probe's own
     * binding stale and the probe had to run twice.
     *
     * That was never a real dependency. Composition writes exactly one key -- `gameAssetPairEvidence` -- and derives
     * it *from* this probe's output. The probe now hashes route-health **excluding** that block
     * (`hashRouteHealthDependency`), so the cycle is eliminated at its cause rather than compensated for by a
     * documented double run. The path recorded here is the narrowed dependency, not the whole file.
     */
    hashes: [
      "apps/<route>/route-health.json#excluding-gameAssetPairEvidence",
      "tools/showcase-library/route-gates.json",
      "aura.assets.json"
    ]
  },
  "regenerate-game-composition-evidence": {
    writes: PRODUCER_OWNERSHIP["regenerate-game-composition-evidence"],
    hashes: [
      "tests/reports/showcase-route-primary-probes/<route>.json",
      "tests/reports/showcase-route-primary-probes/<route>.png"
    ]
  },
  "showcase-release-asset-probes": {
    writes: PRODUCER_OWNERSHIP["showcase-release-asset-probes"],
    hashes: ["aura.assets.json"]
  },
  "vehicle-wheel-visibility": {
    writes: PRODUCER_OWNERSHIP["vehicle-wheel-visibility"],
    hashes: ["aura.assets.json"]
  },
  "game-visual-qa": {
    writes: PRODUCER_OWNERSHIP["game-visual-qa"],
    // Consumes the probe and composition output, so it must run after both.
    hashes: [
      "tests/reports/showcase-route-primary-probes/<route>.json",
      "apps/<route>/route-health.json"
    ]
  },
  "multipart-primitive-draw": {
    writes: PRODUCER_OWNERSHIP["multipart-primitive-draw"],
    hashes: []
  },
  "asset-screening": {
    writes: PRODUCER_OWNERSHIP["asset-screening"],
    hashes: ["aura.assets.json"]
  },
  "replicability-metrics": {
    writes: PRODUCER_OWNERSHIP["replicability-metrics"],
    hashes: []
  },
  "current-threejs-baseline": {
    writes: PRODUCER_OWNERSHIP["current-threejs-baseline"],
    hashes: [
      "benchmark/context/threejs-r185.1-20260808.json",
      "docs/project/parity/threejs-r185-surface-inventory.md",
      "pnpm-lock.yaml"
    ]
  },
  "final-competitive-baseline": {
    writes: PRODUCER_OWNERSHIP["final-competitive-baseline"],
    hashes: []
  },
  "external-candidate-package-audit": {
    writes: PRODUCER_OWNERSHIP["external-candidate-package-audit"],
    hashes: []
  },
  "final-subsystem-ownership": {
    writes: PRODUCER_OWNERSHIP["final-subsystem-ownership"],
    hashes: [
      "tests/reports/external-candidate-package-audit.json",
      "tools/final-subsystem-ownership/adr-registry.json"
    ]
  },
  "physics-backend-bakeoff": {
    writes: PRODUCER_OWNERSHIP["physics-backend-bakeoff"],
    hashes: [
      "pnpm-lock.yaml",
      "tools/physics-backend-bakeoff/index.ts"
    ]
  },
  "optional-rapier-browser": {
    writes: PRODUCER_OWNERSHIP["optional-rapier-browser"],
    hashes: [
      "pnpm-lock.yaml",
      "packages/physics-rapier/src/index.ts",
      "tests/fixtures/optional-rapier-browser.ts"
    ]
  },
  "evidence-freshness-audit": {
    writes: PRODUCER_OWNERSHIP["evidence-freshness-audit"],
    /*
     * Reads every other producer's output to judge it, but hashes none of them.
     *
     * Declaring those as `hashes` would create an ordering cycle against effectively the whole graph: this
     * producer is the arbiter, so it must run *after* everything, and recording read-dependencies here would say
     * every other producer depends on the arbiter's verdict. It does not bind their content into its own output;
     * it reports on it.
     */
    hashes: []
  }
});

/**
 * Documented run order. Each producer runs exactly once.
 *
 * A second `route-primary-probes` entry used to be required: the composition producer rewrote
 * `route-health.json` after the first probe hashed the whole file, so only a re-run could close the loop. Narrowing
 * the probe's dependency to exclude the one block composition owns removed that requirement, so the order is now
 * acyclic and every producer runs once.
 */
export const DOCUMENTED_PRODUCER_ORDER = Object.freeze([
  "asset-screening",
  // Immutable program inputs; generation is one-time and later invocations verify.
  "final-competitive-baseline",
  "current-threejs-baseline",
  "external-candidate-package-audit",
  "final-subsystem-ownership",
  "physics-backend-bakeoff",
  "optional-rapier-browser",
  "showcase-release-asset-probes",
  "vehicle-wheel-visibility",
  "multipart-primitive-draw",
  "route-primary-probes",
  "regenerate-game-composition-evidence",
  // Consumes probe + composition output, so it runs after both.
  "game-visual-qa",
  // Measures the final source tree, so it runs last.
  "replicability-metrics",
  // Judges every artifact above, so it runs after all of them.
  "evidence-freshness-audit"
]);
