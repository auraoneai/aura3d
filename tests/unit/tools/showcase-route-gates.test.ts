// allow: SIZE_OK - route-gate contract suite; split plan recorded in .omo/evidence/full-showcase-recovery-size-split-plan.md.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface ShowcaseRouteGate {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly globalName: string;
  readonly published: boolean;
  readonly releaseClass: ReleaseClass;
  readonly primaryAssets: readonly string[];
  readonly primaryAssetRoles?: Readonly<Record<string, string>>;
  readonly routePrimaryHeroAsset?: string;
  readonly secondaryPrimaryAssets?: readonly string[];
  readonly primitiveBudget: number;
  readonly requiresTypedPrimaryAssets: boolean;
  readonly requiresRoutePrimaryProbe?: boolean;
  readonly requiresKeyboardDelta?: boolean;
  readonly gameTemplateStatus?: {
    readonly category?: string;
    readonly publicTemplateReady?: boolean;
    readonly blocker?: string;
    readonly requiredBeforePublic?: readonly string[];
    readonly evidence?: readonly string[];
  };
  readonly requiresAnimationSubjectDelta?: boolean;
  readonly requiresAuraParticles?: boolean;
  readonly nativeWebGpuAllowed?: boolean;
  readonly animationSubjectDelta?: {
    readonly relativeCrop: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
    readonly minChangedRatio: number;
    readonly minStrongChangedRatio: number;
    readonly minMeanChannelDelta: number;
  };
}

interface ShowcaseRouteGateConfig {
  readonly schema: string;
  readonly routes: readonly ShowcaseRouteGate[];
}

interface ManifestAsset {
  readonly id?: string;
  readonly hash?: string;
}

interface RouteHealthPrimaryAsset {
  readonly typedRef?: string;
}

interface RouteHealthGameAssetPairEvidence {
  readonly category?: string;
  readonly assets?: readonly string[];
  readonly screenshotEvidence?: string;
  readonly compositionReport?: string;
  readonly verdict?: string;
  readonly blockers?: readonly string[];
  readonly geometryEvidence?: {
    readonly category?: string;
    readonly kind?: string;
    readonly source?: string;
    readonly report?: string;
    readonly screenshotEvidence?: string;
    readonly routePrimaryScreenshotSha256?: string;
    readonly assets?: readonly {
      readonly id?: string;
      readonly hash?: string;
    }[];
  };
}

interface RouteHealthFile {
  readonly schema?: string;
  readonly appId?: string;
  readonly route?: string;
  readonly classification?: string;
  readonly publicShowcase?: boolean;
  readonly primaryAssets?: readonly RouteHealthPrimaryAsset[];
  readonly blockers?: readonly string[];
  readonly gameAssetPairEvidence?: RouteHealthGameAssetPairEvidence;
  readonly evidence?: {
    readonly global?: string;
    readonly sourceReview?: string;
  };
}

interface LaunchEvidenceRoute {
  readonly id: string;
  readonly path: string;
  readonly globalName: string;
  readonly releaseClass?: ReleaseClass;
  readonly publicReleaseCounted?: boolean;
  readonly publicReleaseOk?: boolean;
  readonly classificationOk?: boolean;
  readonly finalStatus?: string;
  readonly diagnosticBlockers?: readonly string[];
  readonly gate?: {
    readonly primaryAssets?: readonly string[];
    readonly primaryAssetRoles?: Readonly<Record<string, string>>;
    readonly routePrimaryHeroAsset?: string | null;
    readonly secondaryPrimaryAssets?: readonly string[];
    readonly primitiveBudget?: number;
    readonly requiresTypedPrimaryAssets?: boolean;
    readonly requiresRoutePrimaryProbe?: boolean;
    readonly requiresKeyboardDelta?: boolean;
    readonly gameTemplateStatus?: {
      readonly category?: string;
      readonly publicTemplateReady?: boolean;
      readonly blocker?: string;
      readonly requiredBeforePublic?: readonly string[];
      readonly evidence?: readonly string[];
    } | null;
    readonly requiresAnimationSubjectDelta?: boolean;
    readonly requiresAuraParticles?: boolean;
    readonly nativeWebGpuAllowed?: boolean | null;
  };
  readonly routeHealth?: {
    readonly classification?: string;
    readonly publicShowcase?: boolean;
    readonly primaryAssets?: readonly string[];
    readonly evidenceGlobal?: string;
    readonly gameAssetPairEvidence?: RouteHealthGameAssetPairEvidence | null;
  };
  readonly deployCheckOk?: boolean;
  readonly deployWarnings?: readonly string[];
  readonly deployFailures?: readonly string[];
  readonly routePrimaryProbe?: {
    readonly required?: boolean;
    readonly ok?: boolean;
    readonly failures?: readonly string[];
  };
  readonly visualReview?: {
    readonly required?: boolean;
    readonly ok?: boolean;
    readonly verdict?: string | null;
    readonly failures?: readonly string[];
  };
}

interface LaunchEvidenceFile {
  readonly schema?: string;
  readonly ok?: boolean;
  readonly publicReleaseOk?: boolean;
  readonly publicVisualReviewOk?: boolean;
  readonly allRoutesOk?: boolean;
  readonly releaseCandidateCount?: number;
  readonly releaseCandidatePassed?: number;
  readonly internalDiagnosticCount?: number;
  readonly gameLayerDiagnosticCount?: number;
  readonly diagnosticRouteCount?: number;
  readonly prototypeBlockedCount?: number;
  readonly indexRouteCount?: number;
  readonly diagnostics?: readonly {
    readonly id?: string;
    readonly classification?: string;
    readonly blockers?: readonly string[];
  }[];
  readonly gameLayerDiagnostics?: readonly {
    readonly id?: string;
    readonly classification?: string;
    readonly blockers?: readonly string[];
  }[];
  readonly visualReview?: {
    readonly path?: string;
    readonly ok?: boolean;
    readonly overallVerdict?: string | null;
    readonly failures?: readonly string[];
  };
  readonly gateConfig?: {
    readonly path?: string;
    readonly schema?: string;
    readonly hash?: string;
  };
  readonly routes?: readonly LaunchEvidenceRoute[];
}

interface ShowcaseVisualReviewRoute {
  readonly id?: string;
  readonly verdict?: string;
  readonly screenshotEvidence?: readonly string[];
  readonly blockingIssues?: readonly string[];
  readonly automatedChecks?: readonly string[];
}

interface ShowcaseVisualReviewFile {
  readonly routes?: readonly ShowcaseVisualReviewRoute[];
}

type ReleaseClass =
  | "release-ready candidate"
  | "internal-diagnostic"
  | "game-layer-diagnostic"
  | "prototype-blocked"
  | "index-route"
  | "removed-from-public-showcase";

const publicReleaseCandidateIds = new Set([
  "showcase-product-configurator",
  "showcase-smart-city-control",
  "showcase-cinematic-architecture",
  "showcase-blockfall-reactor",
  "showcase-digital-twin-ops",
  "showcase-skyline-runner",
  "showcase-turbo-drift-circuit"
]);
const internalDiagnosticIds = new Set(["showcase-data-galaxy", "showcase-webgpu-particle-lab"]);
const gameLayerDiagnosticIds = new Set(["showcase-racing-game-layer-proof", "showcase-platformer-game-layer-proof"]);
const prototypeBlockedIds = new Set<string>();
const removedFromPublicShowcaseIds = new Set([
  "showcase-public-platformer-presentation-proof",
  "showcase-public-racing-presentation-proof",
  "showcase-material-asset-inspector"
]);
const gameLayerDiagnosticExpectations = new Map([
  ["showcase-racing-game-layer-proof", {
    category: "racing",
    templateBlocker: "asset-pair:racing-game-layer-proof-public-presentation-not-ready",
    assetPairVerdictBlocker: "evidence:racing-asset-pair:verdict-not-pass:fail",
    assetPairBlockers: [
      "visual:racing-proof-reads-as-diagnostic-harness",
      "visual:racing-track-scale-and-camera-not-public-quality",
      "visual:racing-debug-gates-visible",
      "visual:racing-scene-not-polished-game-presentation"
    ],
    healthBlockers: [
      "evidence:racing-asset-pair:blocker:visual:racing-proof-reads-as-diagnostic-harness",
      "evidence:racing-asset-pair:blocker:visual:racing-track-scale-and-camera-not-public-quality",
      "evidence:racing-asset-pair:blocker:visual:racing-debug-gates-visible",
      "evidence:racing-asset-pair:blocker:visual:racing-scene-not-polished-game-presentation"
    ]
  }],
  ["showcase-platformer-game-layer-proof", {
    category: "platformer",
    templateBlocker: "asset-pair:platformer-game-layer-proof-public-presentation-not-ready",
    assetPairVerdictBlocker: "evidence:platformer-asset-pair:verdict-not-pass:fail",
    assetPairBlockers: [
      "visual:platformer-proof-reads-as-diagnostic-harness",
      "visual:character-not-visibly-grounded-on-platform",
      "visual:debug-surface-guides-visible",
      "visual:character-world-composition-not-public-quality"
    ],
    healthBlockers: [
      "evidence:platformer-asset-pair:blocker:visual:platformer-proof-reads-as-diagnostic-harness",
      "evidence:platformer-asset-pair:blocker:visual:character-not-visibly-grounded-on-platform",
      "evidence:platformer-asset-pair:blocker:visual:debug-surface-guides-visible",
      "evidence:platformer-asset-pair:blocker:visual:character-world-composition-not-public-quality"
    ]
  }]
]);

const routeGateConfigPath = resolve("tools/showcase-library/route-gates.json");
const routeGateConfigRaw = readFileSync(routeGateConfigPath, "utf8");
const routeGateConfig = JSON.parse(routeGateConfigRaw) as ShowcaseRouteGateConfig;
const routeGateConfigHash = createHash("sha256").update(routeGateConfigRaw).digest("hex");

interface RoutePrimaryProbeContext {
  readonly routeId: string;
  readonly routePath: string;
  readonly appId: string;
  readonly sourceHash: string;
  readonly routeGateHash: string;
  readonly routeHealthHash?: string;
  readonly routePrimaryHeroAsset?: string;
  readonly secondaryPrimaryAssets: readonly string[];
  readonly primaryAssets: readonly {
    readonly id: string;
    readonly role: string;
    readonly expectedTypedRef: string;
    readonly manifestHash?: string;
    readonly routePrimaryEvidenceTarget: boolean;
    readonly evidenceMode: "route-primary-foreground" | "secondary-present";
  }[];
}

interface RoutePrimaryProbeValidationResult {
  readonly ok: boolean;
  readonly required: boolean;
  readonly failures: readonly string[];
}

interface RoutePrimaryProbeModule {
  createRoutePrimaryProbeContext(route: ShowcaseRouteGate, root?: string): RoutePrimaryProbeContext;
  routePrimaryProbeEvidencePath(routeId: string, root?: string): string;
  routePrimaryProbeScreenshotPath(routeId: string, root?: string): string;
  validateRoutePrimaryProbeEvidence(route: ShowcaseRouteGate, options?: Record<string, unknown>): RoutePrimaryProbeValidationResult;
  validateRoutePrimaryProbeEvidenceRecord(
    route: ShowcaseRouteGate,
    evidence: Record<string, unknown>,
    options?: Record<string, unknown>
  ): RoutePrimaryProbeValidationResult;
}

interface RouteGateModule {
  listShowcaseRouteGates(root?: string, options?: { readonly publishedOnly?: boolean }): readonly ShowcaseRouteGate[];
  readShowcaseRouteGateConfig(root?: string): ShowcaseRouteGateConfig;
  showcaseRouteById(id: string, root?: string): ShowcaseRouteGate;
  showcaseRouteGateHash(root?: string): string;
}

interface GameReleaseGateModule {
  validateReleaseGameAssetPairEvidence(input: {
    readonly route: ShowcaseRouteGate;
    readonly routeHealth: RouteHealthFile;
    readonly root?: string;
  }): readonly string[];
}

describe("showcase route gate registry", () => {
  const materializedFixtureFiles: string[] = [];

  beforeAll(() => {
    materializedFixtureFiles.push(...materializeRetainedShowcaseFixtures());
  });

  afterAll(() => {
    for (const path of materializedFixtureFiles.reverse()) rmSync(path, { force: true });
  });

  it("loads route gates through the shared route-gates module", async () => {
    const module = await loadRouteGateModule();
    const loadedConfig = module.readShowcaseRouteGateConfig(process.cwd());
    const publishedRoutes = module.listShowcaseRouteGates(process.cwd(), { publishedOnly: true });

    expect(loadedConfig.schema).toBe(routeGateConfig.schema);
    expect(loadedConfig.routes.map((route) => route.id)).toEqual(routeGateConfig.routes.map((route) => route.id));
    expect(publishedRoutes.map((route) => route.id)).toEqual(
      routeGateConfig.routes.filter((route) => route.published).map((route) => route.id)
    );
    expect(module.showcaseRouteGateHash(process.cwd())).toBe(routeGateConfigHash);
    for (const route of routeGateConfig.routes) {
      expect(module.showcaseRouteById(route.id, process.cwd())).toMatchObject({
        id: route.id,
        path: route.path,
        globalName: route.globalName
      });
    }
  });

  it("keeps route ids, paths, globals, gate schema, and published app folders coherent", () => {
    expect(routeGateConfig.schema).toBe("aura3d-showcase-route-gates/1.0");
    expect(routeGateConfig.routes.length).toBeGreaterThan(0);

    const routeIds = new Set<string>();
    const paths = new Set<string>();
    const globals = new Set<string>();

    for (const route of routeGateConfig.routes) {
      expect(route.id, "route id").toMatch(/^showcase-[a-z0-9-]+$/);
      expect(route.label, `${route.id} label`).toBeTruthy();
      expect(route.path, `${route.id} path`).toBe(`/apps/${route.id}/`);
      expect(route.globalName, `${route.id} global`).toBe(expectedGlobalName(route.id));
      expect(typeof route.published, `${route.id} published`).toBe("boolean");
      expect([
        "release-ready candidate",
        "internal-diagnostic",
        "game-layer-diagnostic",
        "prototype-blocked",
        "index-route",
        "removed-from-public-showcase"
      ], `${route.id} release class`).toContain(route.releaseClass);
      if (route.id === "showcase-index") {
        expect(route.releaseClass, "showcase index release class").toBe("index-route");
      } else if (internalDiagnosticIds.has(route.id)) {
        expect(route.releaseClass, `${route.id} diagnostic release class`).toBe("internal-diagnostic");
      } else if (gameLayerDiagnosticIds.has(route.id)) {
        expect(route.releaseClass, `${route.id} game-layer diagnostic release class`).toBe("game-layer-diagnostic");
      } else if (prototypeBlockedIds.has(route.id)) {
        expect(route.releaseClass, `${route.id} prototype release class`).toBe("prototype-blocked");
      } else if (removedFromPublicShowcaseIds.has(route.id)) {
        expect(route.releaseClass, `${route.id} superseded release class`).toBe("removed-from-public-showcase");
      } else if (publicReleaseCandidateIds.has(route.id)) {
        expect(route.releaseClass, `${route.id} public release class`).toBe("release-ready candidate");
      }
      expect(Array.isArray(route.primaryAssets), `${route.id} primaryAssets`).toBe(true);
      if (route.primaryAssets.length > 0) {
        expect(route.primaryAssetRoles, `${route.id} primaryAssetRoles`).toBeTruthy();
        for (const assetId of route.primaryAssets) {
          expect(route.primaryAssetRoles?.[assetId], `${route.id} role for ${assetId}`).toMatch(/^[a-z][a-z0-9-]*$/);
        }
        expect(route.routePrimaryHeroAsset, `${route.id} routePrimaryHeroAsset`).toBeTruthy();
        expect(route.primaryAssets.includes(route.routePrimaryHeroAsset ?? ""), `${route.id} hero is primary`).toBe(true);
        expect(new Set(route.secondaryPrimaryAssets ?? []), `${route.id} secondaryPrimaryAssets`).toEqual(
          new Set(route.primaryAssets.filter((assetId) => assetId !== route.routePrimaryHeroAsset))
        );
      } else {
        expect(route.routePrimaryHeroAsset, `${route.id} empty route has no hero`).toBeUndefined();
        expect(route.secondaryPrimaryAssets ?? [], `${route.id} empty route has no secondary assets`).toEqual([]);
      }
      expect(Number.isInteger(route.primitiveBudget), `${route.id} primitiveBudget`).toBe(true);
      expect(route.primitiveBudget, `${route.id} primitiveBudget`).toBeGreaterThanOrEqual(0);
      expect(typeof route.requiresTypedPrimaryAssets, `${route.id} requiresTypedPrimaryAssets`).toBe("boolean");
      if (route.requiresRoutePrimaryProbe !== undefined) {
        expect(typeof route.requiresRoutePrimaryProbe, `${route.id} requiresRoutePrimaryProbe`).toBe("boolean");
      }

      expect(routeIds.has(route.id), `duplicate route id ${route.id}`).toBe(false);
      expect(paths.has(route.path), `duplicate route path ${route.path}`).toBe(false);
      expect(globals.has(route.globalName), `duplicate route global ${route.globalName}`).toBe(false);
      routeIds.add(route.id);
      paths.add(route.path);
      globals.add(route.globalName);

      if (route.published) {
        expect(existsSync(resolve("apps", route.id)), `${route.id} app folder`).toBe(true);
      }

      if (route.releaseClass === "index-route") {
        expect(route.primaryAssets, `${route.id} index routes do not declare primary assets`).toEqual([]);
        expect(route.requiresTypedPrimaryAssets, `${route.id} index routes skip typed primary deploy checks`).toBe(false);
      }

      if (route.requiresAnimationSubjectDelta) {
        expect(route.animationSubjectDelta, `${route.id} animationSubjectDelta`).toBeTruthy();
        expect(route.animationSubjectDelta!.minChangedRatio, `${route.id} minChangedRatio`).toBeGreaterThan(0);
        expect(route.animationSubjectDelta!.minStrongChangedRatio, `${route.id} minStrongChangedRatio`).toBeGreaterThan(0);
        expect(route.animationSubjectDelta!.minMeanChannelDelta, `${route.id} minMeanChannelDelta`).toBeGreaterThan(0);
      }

      if (route.gameTemplateStatus) {
        expect(route.gameTemplateStatus.category, `${route.id} game template category`).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(typeof route.gameTemplateStatus.publicTemplateReady, `${route.id} game template readiness`).toBe("boolean");
        if (route.gameTemplateStatus.publicTemplateReady) {
          expect(route.gameTemplateStatus.evidence?.length ?? 0, `${route.id} game template evidence`).toBeGreaterThan(0);
        } else {
          expect(route.gameTemplateStatus.blocker, `${route.id} game template blocker`).toMatch(/^(category-template|asset-pair|visual-review):/);
          expect(route.gameTemplateStatus.requiredBeforePublic?.length ?? 0, `${route.id} public game template requirements`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("keeps Turbo and Skyline release-ready only with current machine and manual visual evidence", () => {
    const review = JSON.parse(readFileSync(resolve("docs/project/showcase-visual-review.json"), "utf8")) as ShowcaseVisualReviewFile;
    const reviewsById = new Map((review.routes ?? []).map((route) => [route.id, route]));
    const expected = new Map([
      ["showcase-turbo-drift-circuit", { category: "racing", hero: "showcaseKenneyRaceCarRed", secondary: "showcaseKenneyNeonRaceCircuit" }],
      ["showcase-skyline-runner", { category: "platformer", hero: "showcaseKenneyOobiPlatformerHero", secondary: "showcaseKenneyVerdantPlatformerWorld" }]
    ]);

    for (const [routeId, truth] of expected) {
      const route = routeGateConfig.routes.find((entry) => entry.id === routeId);
      if (!route) throw new Error(`missing route gate for ${routeId}`);
      expect(route.published, `${routeId} is a published route`).toBe(true);
      expect(route.releaseClass, `${routeId} release class`).toBe("release-ready candidate");
      expect(route.gameTemplateStatus?.publicTemplateReady, `${routeId} game template ready`).toBe(true);
      expect(route.gameTemplateStatus?.evidence?.length ?? 0, `${routeId} template evidence`).toBeGreaterThanOrEqual(4);
      expect(route.routePrimaryHeroAsset, `${routeId} hero`).toBe(truth.hero);
      expect(route.secondaryPrimaryAssets, `${routeId} secondary`).toEqual([truth.secondary]);

      const health = JSON.parse(readFileSync(resolve("apps", routeId, "route-health.json"), "utf8")) as RouteHealthFile;
      expect(health.classification, `${routeId} route-health classification`).toBe("release-ready candidate");
      expect(health.publicShowcase, `${routeId} public showcase`).toBe(true);
      expect(health.blockers, `${routeId} blockers`).toEqual([]);
      expect(health.gameAssetPairEvidence?.category, `${routeId} asset-pair category`).toBe(truth.category);
      expect(health.gameAssetPairEvidence?.verdict, `${routeId} machine composition verdict`).toBe("pass");
      expect(health.gameAssetPairEvidence?.screenshotEvidence, `${routeId} asset-pair screenshot`).toBe(
        `tests/reports/showcase-route-primary-probes/${routeId}.png`
      );
      expect(new Set(health.gameAssetPairEvidence?.assets ?? []), `${routeId} asset-pair assets`).toEqual(new Set(route.primaryAssets));
      expect(health.gameAssetPairEvidence?.blockers, `${routeId} machine composition blockers`).toEqual([]);

      const visualReview = reviewsById.get(routeId);
      expect(visualReview?.verdict, `${routeId} visual review`).toBe("pass");
      expect(visualReview?.screenshotEvidence, `${routeId} visual review screenshot`).toEqual(expect.arrayContaining([
        `tests/reports/showcase-route-primary-probes/${routeId}.png`,
        `tests/reports/showcase-gameplay/${routeId}-before-input.png`,
        `tests/reports/showcase-gameplay/${routeId}-after-input.png`
      ]));
      expect(visualReview?.blockingIssues).toEqual([]);
      expect(visualReview?.automatedChecks).toEqual([
        "subject-bound-to-surface", "contact", "camera-readability", "scale-contract", "debug-guide-absence", "hud-occlusion-budget"
      ]);
    }
  });

  it("keeps game-layer proof routes diagnostic until public game presentation is rebuilt", () => {
    const review = JSON.parse(readFileSync(resolve("docs/project/showcase-visual-review.json"), "utf8")) as ShowcaseVisualReviewFile;
    const reviewsById = new Map((review.routes ?? []).map((route) => [route.id, route]));

    for (const [routeId, expected] of gameLayerDiagnosticExpectations) {
      const route = routeGateConfig.routes.find((entry) => entry.id === routeId);
      if (!route) throw new Error(`missing route gate for ${routeId}`);
      expect(route.published, `${routeId} remains published as diagnostic evidence`).toBe(true);
      expect(route.releaseClass, `${routeId} release class`).toBe("game-layer-diagnostic");
      expect(route.gameTemplateStatus?.publicTemplateReady, `${routeId} game template ready`).toBe(false);
      expect(route.gameTemplateStatus?.blocker, `${routeId} game template blocker`).toBe(expected.templateBlocker);
      expect(route.gameTemplateStatus?.requiredBeforePublic?.length ?? 0, `${routeId} public rebuild requirements`).toBeGreaterThan(0);

      const health = JSON.parse(readFileSync(resolve("apps", routeId, "route-health.json"), "utf8")) as RouteHealthFile;
      expect(health.classification, `${routeId} route-health classification`).toBe("game-layer-diagnostic");
      expect(health.publicShowcase, `${routeId} public showcase`).toBe(false);
      expect(health.blockers, `${routeId} generated route-health blockers`).toEqual(expect.arrayContaining([
        expected.assetPairVerdictBlocker,
        ...expected.healthBlockers
      ]));
      expect(health.gameAssetPairEvidence?.category, `${routeId} asset-pair category`).toBe(expected.category);
      expect(health.gameAssetPairEvidence?.verdict, `${routeId} asset-pair verdict`).toBe("fail");
      expect(health.gameAssetPairEvidence?.screenshotEvidence, `${routeId} asset-pair screenshot`).toBe(
        `tests/reports/showcase-route-primary-probes/${routeId}.png`
      );
      expect(new Set(health.gameAssetPairEvidence?.assets ?? []), `${routeId} asset-pair assets`).toEqual(new Set(route.primaryAssets));
      expect(health.gameAssetPairEvidence?.blockers, `${routeId} asset-pair blockers`).toEqual(
        expect.arrayContaining(expected.assetPairBlockers)
      );

      const visualReview = reviewsById.get(routeId);
      expect(visualReview?.verdict, `${routeId} visual review`).toBe("fail");
      expect(visualReview?.screenshotEvidence, `${routeId} visual review screenshot`).toEqual([
        `tests/reports/showcase-route-primary-probes/${routeId}.png`
      ]);
      expect(visualReview?.blockingIssues ?? [], `${routeId} visual review blockers`).toEqual(
        expect.arrayContaining(expected.assetPairBlockers)
      );
    }
  });

  it("keeps game-layer diagnostic route source from publishing public visual passes", () => {
    for (const [routeId, expected] of gameLayerDiagnosticExpectations) {
      const source = readRouteSourceText(routeId);

      expect(source, `${routeId} diagnostic claim label`).toContain("game-layer diagnostic route");
      expect(source, `${routeId} retained visual review verdict`).toContain('visualReview: "fail"');
      expect(source, `${routeId} retained asset pair verdict`).toContain("assetPairPass: false");
      expect(source, `${routeId} runtime visual review verdict`).toContain("visualReviewPass: false");
      expect(source, `${routeId} retained visual review must not pass`).not.toContain('visualReview: "pass"');
      expect(source, `${routeId} retained asset pair must not pass`).not.toContain("assetPairPass: true");
      expect(source, `${routeId} runtime visual review must not pass`).not.toContain("visualReviewPass: true");
      for (const blocker of expected.assetPairBlockers) {
        expect(source, `${routeId} source blocker ${blocker}`).toContain(blocker);
      }
    }
  });

  it("requires current passing game asset-pair evidence before a game route can be public", async () => {
    const module = await loadGameReleaseGateModule();
    const prototypeRoute = typedRoute("showcase-turbo-drift-circuit");
    const releaseRoute: ShowcaseRouteGate = {
      ...prototypeRoute,
      releaseClass: "release-ready candidate",
      gameTemplateStatus: {
        category: "racing",
        publicTemplateReady: true,
        evidence: [
          "tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png"
        ]
      }
    };
    const failingHealth = JSON.parse(
      readFileSync(resolve("apps/showcase-turbo-drift-circuit/route-health.json"), "utf8")
    ) as RouteHealthFile;
    const releaseHealthBase: RouteHealthFile = {
      schema: failingHealth.schema,
      appId: failingHealth.appId,
      route: failingHealth.route,
      classification: "release-ready candidate",
      publicShowcase: true,
      primaryAssets: failingHealth.primaryAssets,
      blockers: [],
      evidence: failingHealth.evidence
    };
    const compositionReport = "tests/reports/showcase-spec-compiler/turbo-drift-circuit/game-template/showcase-turbo-drift-circuit-asset-pair-composition.json";
    const geometryEvidence = {
      category: "racing",
      kind: "racing-track-topology",
      source: "asset-mesh-extracted",
      report: "tests/reports/showcase-spec-compiler/turbo-drift-circuit/game-template/showcase-turbo-drift-circuit-racing-track-topology.json",
      screenshotEvidence: "tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png",
      routePrimaryScreenshotSha256: `sha256-${"a".repeat(64)}`,
      assets: releaseRoute.primaryAssets.map((asset) => ({
        id: asset,
        hash: `sha256-${"b".repeat(64)}`
      }))
    };

    const explicitFailingHealth: RouteHealthFile = {
      ...failingHealth,
      gameAssetPairEvidence: {
        ...failingHealth.gameAssetPairEvidence,
        category: "racing",
        verdict: "fail",
        blockers: ["asset-pair:synthetic-current-evidence-failure"]
      }
    };
    expect(module.validateReleaseGameAssetPairEvidence({
      route: releaseRoute,
      routeHealth: explicitFailingHealth,
      root: process.cwd()
    })).toEqual(expect.arrayContaining([
      "release-game-asset-pair-verdict:fail",
      expect.stringMatching(/^release-game-asset-pair-blockers:asset-pair:synthetic-current-evidence-failure$/)
    ]));

    expect(module.validateReleaseGameAssetPairEvidence({
      route: releaseRoute,
      routeHealth: releaseHealthBase
    })).toEqual(expect.arrayContaining([
      "release-game-asset-pair-evidence-missing:racing"
    ]));

    const turboReleaseFailures = module.validateReleaseGameAssetPairEvidence({
      route: releaseRoute,
      routeHealth: {
        ...releaseHealthBase,
        gameAssetPairEvidence: {
          category: "racing",
          verdict: "pass",
          compositionReport,
          screenshotEvidence: "tests/reports/manual-visual-qa/turbo-drift-circuit.png",
          assets: releaseRoute.primaryAssets,
          blockers: []
        }
      }
    });
    expect(turboReleaseFailures).toEqual(expect.arrayContaining([
      "release-game-asset-pair-screenshot-evidence:tests/reports/manual-visual-qa/turbo-drift-circuit.png"
    ]));

    const missingGeometryFailures = module.validateReleaseGameAssetPairEvidence({
      route: releaseRoute,
      routeHealth: {
        ...releaseHealthBase,
        gameAssetPairEvidence: {
          category: "racing",
          verdict: "pass",
          compositionReport,
          screenshotEvidence: "tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png",
          assets: releaseRoute.primaryAssets,
          blockers: []
        }
      }
    });
    expect(missingGeometryFailures).toEqual(expect.arrayContaining([
      "release-game-geometry-evidence-missing:racing"
    ]));

    expect(module.validateReleaseGameAssetPairEvidence({
      route: releaseRoute,
      routeHealth: {
        ...releaseHealthBase,
        gameAssetPairEvidence: {
          category: "racing",
          verdict: "pass",
          compositionReport,
          screenshotEvidence: "tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png",
          assets: releaseRoute.primaryAssets,
          blockers: [],
          geometryEvidence
        }
      }
    })).toEqual(expect.arrayContaining([
      "release-game-geometry-root-required"
    ]));

    expect(module.validateReleaseGameAssetPairEvidence({
      route: releaseRoute,
      routeHealth: {
        ...releaseHealthBase,
        gameAssetPairEvidence: {
          category: "racing",
          verdict: "pass",
          compositionReport,
          screenshotEvidence: "tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png",
          assets: releaseRoute.primaryAssets,
          blockers: [],
          geometryEvidence
        }
      },
      root: process.cwd()
    })).toEqual(expect.arrayContaining([
      "release-game-geometry-screenshot-hash-mismatch:tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png",
      "release-game-geometry-asset-hash-mismatch:showcaseKenneyRaceCarRed",
      "release-game-geometry-asset-hash-mismatch:showcaseKenneyNeonRaceCircuit"
    ]));

    const manifestHashes = readManifestAssetHashes();
    const forgedTurboReleaseGeometryFailures = module.validateReleaseGameAssetPairEvidence({
      route: releaseRoute,
      routeHealth: {
        ...releaseHealthBase,
        gameAssetPairEvidence: {
          category: "racing",
          verdict: "pass",
          compositionReport,
          screenshotEvidence: "tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png",
          assets: releaseRoute.primaryAssets,
          blockers: [],
          geometryEvidence: {
            ...geometryEvidence,
            report: "tests/reports/showcase-spec-compiler/public-racing-presentation-proof/game-template/showcase-public-racing-presentation-proof-racing-track-topology.json",
            routePrimaryScreenshotSha256: fileSha256("tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png"),
            assets: releaseRoute.primaryAssets.map((asset) => ({
              id: asset,
              hash: manifestHashes.get(asset)
            }))
          }
        }
      },
      root: process.cwd()
    });
    expect(forgedTurboReleaseGeometryFailures).toEqual(expect.arrayContaining([
      "release-game-geometry-report-route:showcase-public-racing-presentation-proof",
      "release-game-geometry-report-source:compiler-authored-overlay-validated",
      "release-game-geometry-report-asset:showcaseTsukubaCircuit",
      "release-game-geometry-report-overlay:tests/reports/showcase-route-primary-probes/showcase-public-racing-presentation-proof.png",
      "release-game-geometry-asset-evidence-report:showcaseKenneyRaceCarRed:tests/reports/showcase-spec-compiler/turbo-drift-circuit/game-template/showcase-turbo-drift-circuit-racing-track-topology.json",
      "release-game-geometry-asset-certification:showcaseKenneyNeonRaceCircuit:certified-racing-track",
      "release-game-geometry-asset-evidence-report:showcaseKenneyNeonRaceCircuit:tests/reports/showcase-spec-compiler/turbo-drift-circuit/game-template/showcase-turbo-drift-circuit-racing-track-topology.json"
    ]));
    expect(forgedTurboReleaseGeometryFailures).not.toEqual([]);

    const proofRoute = routeGateConfig.routes.find((route) => route.id === "showcase-racing-game-layer-proof");
    if (proofRoute === undefined) throw new Error("missing racing game layer proof route gate");
    const proofHealth = JSON.parse(
      readFileSync(resolve("apps/showcase-racing-game-layer-proof/route-health.json"), "utf8")
    ) as RouteHealthFile;
    expect(module.validateReleaseGameAssetPairEvidence({
      route: proofRoute,
      routeHealth: proofHealth,
      root: process.cwd()
    })).toEqual(expect.arrayContaining([
      "release-game-template-ready:false",
      expect.stringMatching(/^release-game-asset-pair-verdict:fail$/),
      expect.stringMatching(/^release-game-asset-pair-blockers:.*visual:racing-debug-gates-visible/),
      expect.stringMatching(/^release-game-asset-pair-route-health-blockers:.*evidence:racing-asset-pair:blocker:visual:racing-debug-gates-visible/),
      "release-game-geometry-screenshot-hash-mismatch:tests/reports/showcase-route-primary-probes/showcase-racing-game-layer-proof.png",
      "release-game-geometry-asset-evidence-screenshot:showcaseTexturedSportsCar:tests/reports/showcase-route-primary-probes/showcase-public-racing-presentation-proof.png",
      "release-game-geometry-asset-evidence-report:showcaseTexturedSportsCar:tests/reports/showcase-spec-compiler/public-racing-presentation-proof/game-template/showcase-public-racing-presentation-proof-racing-track-topology.json",
      "release-game-geometry-asset-evidence-screenshot-sha:showcaseTexturedSportsCar:sha256-3f4c83fa739c76e48787902f7169e683a658618e95e446c092c52ceb140c8c44",
      "release-game-geometry-asset-evidence-screenshot:showcaseTsukubaCircuit:tests/reports/showcase-route-primary-probes/showcase-public-racing-presentation-proof.png",
      "release-game-geometry-asset-evidence-report:showcaseTsukubaCircuit:tests/reports/showcase-spec-compiler/public-racing-presentation-proof/game-template/showcase-public-racing-presentation-proof-racing-track-topology.json",
      "release-game-geometry-asset-evidence-screenshot-sha:showcaseTsukubaCircuit:sha256-3f4c83fa739c76e48787902f7169e683a658618e95e446c092c52ceb140c8c44"
    ]));

    const platformerProofRoute = routeGateConfig.routes.find((route) => route.id === "showcase-platformer-game-layer-proof");
    if (platformerProofRoute === undefined) throw new Error("missing platformer game layer proof route gate");
    const platformerProofHealth = JSON.parse(
      readFileSync(resolve("apps/showcase-platformer-game-layer-proof/route-health.json"), "utf8")
    ) as RouteHealthFile;
    expect(module.validateReleaseGameAssetPairEvidence({
      route: platformerProofRoute,
      routeHealth: platformerProofHealth,
      root: process.cwd()
    })).toEqual(expect.arrayContaining([
      "release-game-template-ready:false",
      expect.stringMatching(/^release-game-asset-pair-verdict:fail$/),
      expect.stringMatching(/^release-game-asset-pair-blockers:.*visual:character-not-visibly-grounded-on-platform/),
      expect.stringMatching(/^release-game-asset-pair-route-health-blockers:.*evidence:platformer-asset-pair:blocker:visual:debug-surface-guides-visible/),
      "release-game-geometry-asset-evidence-screenshot:showcaseWalkAnimatedGirl:tests/reports/showcase-route-primary-probes/showcase-public-platformer-presentation-proof.png",
      "release-game-geometry-asset-evidence-report:showcaseWalkAnimatedGirl:tests/reports/showcase-spec-compiler/public-platformer-presentation-proof/game-template/showcase-public-platformer-presentation-proof-platformer-playable-surfaces.json",
      "release-game-geometry-asset-evidence-screenshot-sha:showcaseWalkAnimatedGirl:sha256-cbcbbc77e556eedc2b32d307e9cf4f3907178121f04f3f0b36577dfb1941bf5e",
      "release-game-geometry-asset-evidence-screenshot:showcaseSideScrollerWorld:tests/reports/showcase-route-primary-probes/showcase-public-platformer-presentation-proof.png",
      "release-game-geometry-asset-evidence-report:showcaseSideScrollerWorld:tests/reports/showcase-spec-compiler/public-platformer-presentation-proof/game-template/showcase-public-platformer-presentation-proof-platformer-playable-surfaces.json",
      "release-game-geometry-asset-evidence-screenshot-sha:showcaseSideScrollerWorld:sha256-cbcbbc77e556eedc2b32d307e9cf4f3907178121f04f3f0b36577dfb1941bf5e"
    ]));
  }, 20_000);

  it("requires typed primary assets to exist in the manifest, generated type file, and route source", () => {
    const manifestAssets = readManifestAssetIds();
    const generatedAssetKeys = readGeneratedAssetKeys();

    for (const route of routeGateConfig.routes) {
      const sourceText = readRouteSourceText(route.id);
      const typedRefs = new Set(Array.from(sourceText.matchAll(/\bassets\.([A-Za-z0-9_]+)/g))
        .map((match) => match[1])
        .filter((asset): asset is string => Boolean(asset)));

      if (!route.requiresTypedPrimaryAssets) {
        expect(route.primaryAssets, `${route.id} routes without typed asset requirements should not declare primary assets`).toEqual([]);
        continue;
      }

      expect(route.primaryAssets.length, `${route.id} primary asset count`).toBeGreaterThan(0);
      for (const assetId of route.primaryAssets) {
        expect(manifestAssets.has(assetId), `${route.id} manifest contains ${assetId}`).toBe(true);
        expect(generatedAssetKeys.has(assetId), `${route.id} generated src/aura-assets.ts contains ${assetId}`).toBe(true);
        expect(typedRefs.has(assetId), `${route.id} route source references assets.${assetId}`).toBe(true);
      }
    }
  });

  it("keeps static route-health and showcase index entries in sync with published gates", () => {
    const publishedAppRoutes = routeGateConfig.routes.filter((route) => route.published && route.id !== "showcase-index");
    const publishedIds = new Set(publishedAppRoutes.map((route) => route.id));
    const indexSource = readFileSync(resolve("apps/showcase-index/src/main.ts"), "utf8");
    const indexHtml = readFileSync(resolve("apps/showcase-index/index.html"), "utf8");
    const indexIds = new Set(Array.from(indexSource.matchAll(/\bid:\s*"([^"]+)"/g)).map((match) => match[1] ?? ""));
    const publicReleaseRoutes = publishedAppRoutes.filter((route) => route.releaseClass === "release-ready candidate");
    const publicCardHrefs = new Set(
      Array.from(indexHtml.matchAll(/href="([^"]+)"/g))
        .map((match) => match[1] ?? "")
        .filter((href) => href.startsWith("/apps/showcase-"))
    );

    expect(indexIds, "showcase index entries").toEqual(publishedIds);
    expect(indexSource, "showcase index derives public route list from publicShowcase entries").toContain(
      "const publicApps = apps.filter((entry) => entry.publicShowcase);"
    );
    expect(indexSource, "showcase index routes exclude non-public apps").toContain(
      "const routes = publicApps.map((entry) => entry.route);"
    );
    expect(publicCardHrefs, "static showcase index public cards").toEqual(new Set(publicReleaseRoutes.map((route) => route.path)));

    for (const route of publishedAppRoutes) {
      const healthPath = resolve("apps", route.id, "route-health.json");
      expect(existsSync(healthPath), `${route.id} route-health.json`).toBe(true);
      const health = JSON.parse(readFileSync(healthPath, "utf8")) as RouteHealthFile;
      expect(health.schema, `${route.id} route-health schema`).toBe("aura3d-route-health/1.0");
      expect(health.appId, `${route.id} route-health appId`).toBe(route.id);
      expect(health.route, `${route.id} route-health route`).toBe(route.path);
      expect(health.evidence?.global, `${route.id} route-health global`).toBe(`window.${route.globalName}`);
      expect(health.evidence?.sourceReview, `${route.id} source review path`).toBe(`apps/${route.id}/src/main.ts`);

      const healthPrimaryAssets = new Set((health.primaryAssets ?? []).map((asset) => normalizeTypedRef(asset.typedRef)));
      expect(healthPrimaryAssets, `${route.id} route-health primary assets`).toEqual(new Set(route.primaryAssets));
      if (route.releaseClass === "release-ready candidate") {
        expect(indexHtml, `${route.id} public card href`).toContain(`href="${route.path}"`);
      } else {
        expect(indexHtml, `${route.id} non-public route is not a public card`).not.toContain(`href="${route.path}"`);
      }
    }

    const unpublishedHealthFiles = readdirSync(resolve("apps"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("showcase-") && !publishedIds.has(entry.name) && entry.name !== "showcase-index")
      .map((entry) => {
        const routeHealthPath = resolve("apps", entry.name, "route-health.json");
        return {
          id: entry.name,
          routeHealthPath,
          health: existsSync(routeHealthPath)
            ? JSON.parse(readFileSync(routeHealthPath, "utf8")) as RouteHealthFile
            : undefined
        };
      })
      .filter((entry) => entry.health);

    for (const entry of unpublishedHealthFiles) {
      const expectedClassification = prototypeBlockedIds.has(entry.id) ? "prototype" : "blocked";
      expect(entry.health?.classification, `${entry.id} unpublished route classification`).toBe(expectedClassification);
      expect(entry.health?.publicShowcase, `${entry.id} unpublished route publicShowcase`).toBe(false);
    }
  });

  it("binds generated launch evidence to the current route gate config", () => {
    const launchEvidencePath = resolve("docs/project/showcase-launch-evidence.json");
    expect(existsSync(launchEvidencePath), "showcase launch evidence exists").toBe(true);
    expect(routeGateConfigRaw, "route gate config should not contain absolute local paths").not.toMatch(/\/Users\/|\/var\/folders|aura3d-resolve-/);
    const launchEvidenceRaw = readFileSync(launchEvidencePath, "utf8");
    expect(launchEvidenceRaw, "launch evidence should not leak local paths").not.toMatch(/absolutePath|\/Users\/|\/var\/folders|private\/var|aura3d-resolve-/);
    const launchEvidence = JSON.parse(launchEvidenceRaw) as LaunchEvidenceFile;
    const visualReviewPath = resolve("docs/project/showcase-visual-review.json");
    const visualReview = JSON.parse(readFileSync(visualReviewPath, "utf8")) as ShowcaseVisualReviewFile;
    const visuallyAcceptedRouteIds = new Set(
      (visualReview.routes ?? [])
        .filter((route) => route.id && route.verdict === "pass")
        .map((route) => route.id)
    );
    const publishedRoutes = routeGateConfig.routes.filter((route) => route.published);
    const launchRoutes = launchEvidence.routes ?? [];
    const expectedReleaseCandidatePassed = publishedRoutes
      .filter((route) => route.releaseClass === "release-ready candidate" && visuallyAcceptedRouteIds.has(route.id))
      .length;
    const expectedReleaseCandidateCount = publishedRoutes.filter((route) => route.releaseClass === "release-ready candidate").length;
    const expectedGameLayerDiagnosticCount = publishedRoutes.filter((route) => route.releaseClass === "game-layer-diagnostic").length;
    const expectedPrototypeBlockedCount = publishedRoutes.filter((route) => route.releaseClass === "prototype-blocked").length;

    expect(launchEvidence.schema, "launch evidence schema").toBe("aura3d-showcase-build-deploy/1.0");
    expect(typeof launchEvidence.ok, "launch evidence ok flag").toBe("boolean");
    expect(launchEvidence.ok, "launch evidence ok tracks the public release candidate set").toBe(true);
    expect(launchEvidence.publicReleaseOk, "public release candidates pass release and required per-route visual review").toBe(true);
    expect(launchEvidence.publicVisualReviewOk, "public visual review gate").toBe(true);
    expect(launchEvidence.allRoutesOk, "all routes include retained internal diagnostics").toBe(false);
    expect(launchEvidence.releaseCandidateCount, "release candidate count").toBe(expectedReleaseCandidateCount);
    expect(launchEvidence.releaseCandidatePassed, "release candidates passed").toBe(expectedReleaseCandidatePassed);
    expect(launchEvidence.internalDiagnosticCount, "internal diagnostics count").toBe(2);
    expect(launchEvidence.gameLayerDiagnosticCount, "game-layer diagnostics count").toBe(expectedGameLayerDiagnosticCount);
    expect(launchEvidence.diagnosticRouteCount, "total diagnostics count").toBe(4);
    expect(launchEvidence.prototypeBlockedCount, "prototype blocked count").toBe(expectedPrototypeBlockedCount);
    expect(launchEvidence.indexRouteCount, "index route count").toBe(1);
    expect(launchEvidence.gateConfig?.path, "launch gate config path").toBe("tools/showcase-library/route-gates.json");
    expect(launchEvidence.gateConfig?.schema, "launch gate config schema").toBe(routeGateConfig.schema);
    expect(launchEvidence.gateConfig?.hash, "launch gate config hash").toBe(routeGateConfigHash);
    expect(launchEvidence.visualReview?.path, "visual review path").toBe("docs/project/showcase-visual-review.json");
    expect(launchEvidence.visualReview?.ok, "public release visual review ok").toBe(true);
    expect(launchEvidence.visualReview?.overallVerdict, "retained all-route visual review verdict").toBe("fail");
    expect(launchEvidence.visualReview?.failures ?? [], "retained visual review failures").toEqual(expect.arrayContaining([
      "visual-review-overall-verdict:fail"
    ]));
    expect(new Set(launchRoutes.map((route) => route.id)), "launch route ids").toEqual(
      new Set(publishedRoutes.map((route) => route.id))
    );

    for (const route of publishedRoutes) {
      const launchRoute = launchRoutes.find((entry) => entry.id === route.id);
      expect(launchRoute, `${route.id} launch route`).toBeTruthy();
      expect(launchRoute?.path, `${route.id} launch path`).toBe(route.path);
      expect(launchRoute?.globalName, `${route.id} launch global`).toBe(route.globalName);
      expect(launchRoute?.releaseClass, `${route.id} launch release class`).toBe(route.releaseClass);
      expect(launchRoute?.publicReleaseCounted, `${route.id} public release counted`).toBe(
        route.releaseClass === "release-ready candidate"
      );
      expect(launchRoute?.classificationOk, `${route.id} classification ok`).toBe(true);
      expect(new Set(launchRoute?.gate?.primaryAssets ?? []), `${route.id} launch primary assets`).toEqual(
        new Set(route.primaryAssets)
      );
      expect(launchRoute?.gate?.primaryAssetRoles ?? {}, `${route.id} launch primary asset roles`).toEqual(
        route.primaryAssetRoles ?? {}
      );
      expect(launchRoute?.gate?.routePrimaryHeroAsset ?? null, `${route.id} launch route-primary hero`).toBe(
        route.routePrimaryHeroAsset ?? null
      );
      expect(launchRoute?.gate?.secondaryPrimaryAssets ?? [], `${route.id} launch secondary primary assets`).toEqual(
        route.secondaryPrimaryAssets ?? []
      );
      expect(launchRoute?.gate?.primitiveBudget, `${route.id} launch primitive budget`).toBe(route.primitiveBudget);
      expect(launchRoute?.gate?.requiresTypedPrimaryAssets, `${route.id} launch typed primary flag`).toBe(
        route.requiresTypedPrimaryAssets
      );
      expect(launchRoute?.gate?.requiresRoutePrimaryProbe, `${route.id} launch route-primary flag`).toBe(
        Boolean(route.requiresRoutePrimaryProbe)
      );
      if (route.releaseClass === "index-route") {
        expect(launchRoute?.deployCheckOk, `${route.id} index deploy skipped as ok`).toBe(true);
        expect(launchRoute?.routePrimaryProbe?.required, `${route.id} index route-primary skipped`).toBe(false);
        expect(launchRoute?.routeHealth?.primaryAssets ?? [], `${route.id} index route-health primary assets`).toEqual([]);
      } else {
        expect(new Set(launchRoute?.routeHealth?.primaryAssets ?? []), `${route.id} launch route-health primary assets`).toEqual(
          new Set(route.primaryAssets)
        );
        expect(launchRoute?.routeHealth?.evidenceGlobal, `${route.id} launch route-health global`).toBe(
          `window.${route.globalName}`
        );
        if (launchRoute?.deployCheckOk === false) {
          expect(
            (launchRoute.deployWarnings?.length ?? 0) + (launchRoute.deployFailures?.length ?? 0),
            `${route.id} deploy failure details`
          ).toBeGreaterThan(0);
        }
        expect(launchRoute?.routePrimaryProbe?.required, `${route.id} route-primary probe required`).toBe(true);
        if (launchRoute?.routePrimaryProbe?.ok === false) {
          expect(launchRoute.routePrimaryProbe.failures?.length ?? 0, `${route.id} route-primary probe failure details`).toBeGreaterThan(0);
        }
      }

      if (route.releaseClass === "release-ready candidate") {
        expect(launchRoute?.routePrimaryProbe?.ok, `${route.id} public route-primary ok`).toBe(true);
        expect(launchRoute?.deployCheckOk, `${route.id} public deploy ok`).toBe(true);
        expect(launchRoute?.visualReview?.required, `${route.id} visual review required`).toBe(true);
        if (visuallyAcceptedRouteIds.has(route.id)) {
          expect(launchRoute?.publicReleaseOk, `${route.id} public release ok after visual review`).toBe(true);
          expect(launchRoute?.visualReview?.ok, `${route.id} visual review passed`).toBe(true);
          expect(launchRoute?.visualReview?.failures ?? [], `${route.id} visual review failures`).toEqual([]);
        } else {
          expect(launchRoute?.publicReleaseOk, `${route.id} public release remains blocked by visual review`).toBe(false);
          expect(launchRoute?.visualReview?.ok, `${route.id} visual review remains blocked`).toBe(false);
          expect(launchRoute?.visualReview?.failures?.length ?? 0, `${route.id} visual review failures`).toBeGreaterThan(0);
        }
      }

      if (route.releaseClass === "internal-diagnostic") {
        expect(launchRoute?.publicReleaseOk, `${route.id} diagnostic public release ok`).toBe(true);
        expect(launchRoute?.routeHealth?.primaryAssets ?? [], `${route.id} diagnostic primary assets retained`).toEqual(route.primaryAssets);
        expect(launchRoute?.diagnosticBlockers?.length ?? 0, `${route.id} diagnostic blockers retained`).toBeGreaterThan(0);
        expect(launchEvidence.diagnostics?.some((entry) => entry.id === route.id), `${route.id} listed in diagnostics`).toBe(true);
      }

      if (route.releaseClass === "game-layer-diagnostic") {
        const expected = gameLayerDiagnosticExpectations.get(route.id);
        if (!expected) throw new Error(`missing game-layer expectation for ${route.id}`);
        expect(launchRoute?.publicReleaseCounted, `${route.id} game-layer diagnostic public release counted`).toBe(false);
        expect(launchRoute?.publicReleaseOk, `${route.id} game-layer diagnostic public release ok`).toBe(true);
        expect(launchRoute?.routeHealth?.classification, `${route.id} route-health classification`).toBe("game-layer-diagnostic");
        expect(launchRoute?.routeHealth?.publicShowcase, `${route.id} route-health public showcase`).toBe(false);
        expect(launchRoute?.routeHealth?.gameAssetPairEvidence?.verdict, `${route.id} asset-pair verdict`).toBe("fail");
        expect(launchRoute?.diagnosticBlockers ?? [], `${route.id} game-layer diagnostic blockers retained`).toEqual(
          expect.arrayContaining([
            expected.templateBlocker,
            ...expected.assetPairBlockers.map((blocker) => `visual-review:route-visual-review-blocker:${route.id}:${blocker}`)
          ])
        );
        expect(launchEvidence.diagnostics?.some((entry) => entry.id === route.id), `${route.id} listed in diagnostics`).toBe(true);
        expect(launchEvidence.gameLayerDiagnostics?.some((entry) => entry.id === route.id), `${route.id} listed in game-layer diagnostics`).toBe(true);
      }

      if (route.releaseClass === "removed-from-public-showcase") {
        expect(launchRoute?.publicReleaseCounted, `${route.id} superseded route public release counted`).toBe(false);
        expect(launchRoute?.routeHealth?.classification, `${route.id} superseded route-health classification`).toBe("removed-from-public-showcase");
        expect(launchRoute?.routeHealth?.publicShowcase, `${route.id} superseded route is not public`).toBe(false);
      }

      if (route.releaseClass === "prototype-blocked") {
        expect(launchRoute?.publicReleaseCounted, `${route.id} prototype public release counted`).toBe(false);
        expect(launchRoute?.publicReleaseOk, `${route.id} prototype public release ok`).toBe(true);
        expect(launchRoute?.diagnosticBlockers?.length ?? 0, `${route.id} prototype blockers retained`).toBeGreaterThan(0);
      }
    }

    for (const routeId of ["showcase-turbo-drift-circuit", "showcase-skyline-runner"]) {
      const launchRoute = launchRoutes.find((route) => route.id === routeId);
      expect(launchRoute?.releaseClass, `${routeId} launch release class`).toBe("release-ready candidate");
      expect(launchRoute?.publicReleaseCounted, `${routeId} public release candidate`).toBe(true);
      expect(launchRoute?.publicReleaseOk, `${routeId} public release ok`).toBe(true);
      expect(launchRoute?.classificationOk, `${routeId} classification ok`).toBe(true);
      expect(launchRoute?.gate?.gameTemplateStatus?.publicTemplateReady, `${routeId} game template public readiness`).toBe(true);
      expect(launchRoute?.visualReview?.ok, `${routeId} visual review`).toBe(true);
      expect(launchRoute?.diagnosticBlockers ?? [], `${routeId} has no diagnostic blockers`).toEqual([]);
    }

    const dataGalaxy = launchRoutes.find((route) => route.id === "showcase-data-galaxy");
    expect(dataGalaxy?.diagnosticBlockers?.join("\n"), "data diagnostic readability blocker").toMatch(/readability|foreground/);
    const webGpuLab = launchRoutes.find((route) => route.id === "showcase-webgpu-particle-lab");
    expect(webGpuLab?.diagnosticBlockers?.join("\n"), "webgpu diagnostic blocker").toMatch(/webgpu|foreground|clipped/i);
  });

  it("validates route-primary probe freshness and primary asset roles", async () => {
    const module = await loadRoutePrimaryProbeModule();
    const route = publishedTypedRoute("showcase-product-configurator");
    const context = module.createRoutePrimaryProbeContext(route);
    const evidence = createValidProbeEvidence(route, context);

    const result = module.validateRoutePrimaryProbeEvidenceRecord(route, evidence, {
      root: process.cwd(),
      requireScreenshot: false
    });

    expect(evidence.routeGateHash, "probe routeGateHash").toBe(routeGateConfigHash);
    expect(evidence.sourceHash, "probe sourceHash").toBe(context.sourceHash);
    expect(evidence.routeHealthHash, "probe routeHealthHash").toBe(context.routeHealthHash);
    expect(evidence.routePrimaryHeroAsset, "probe routePrimaryHeroAsset").toBe(route.routePrimaryHeroAsset);
    expect(evidence.secondaryPrimaryAssets, "probe secondaryPrimaryAssets").toEqual(route.secondaryPrimaryAssets);
    expect(result).toMatchObject({ ok: true, required: true, failures: [] });
  });

  it("accepts multi-primary route evidence with one hero foreground target and secondary-present assets", async () => {
    const module = await loadRoutePrimaryProbeModule();
    const route = typedRoute("showcase-turbo-drift-circuit");
    const context = module.createRoutePrimaryProbeContext(route);
    const evidence = createValidProbeEvidence(route, context);

    const result = module.validateRoutePrimaryProbeEvidenceRecord(route, evidence, {
      root: process.cwd(),
      requireScreenshot: false
    });

    expect(context.routePrimaryHeroAsset).toBe("showcaseKenneyRaceCarRed");
    expect(context.secondaryPrimaryAssets).toEqual(["showcaseKenneyNeonRaceCircuit"]);
    expect(result).toMatchObject({ ok: true, required: true, failures: [] });

    const missingHero = cloneRecord(evidence);
    missingHero.routePrimaryHeroAsset = "showcaseRaceCar";
    const missingSecondary = cloneRecord(evidence);
    missingSecondary.secondaryPrimaryAssets = [];
    const secondaryWithHeroMode = cloneRecord(evidence);
    const primaryAssets = secondaryWithHeroMode.primaryAssets as Array<Record<string, unknown>>;
    const secondary = primaryAssets.find((asset) => asset.id === "showcaseKenneyNeonRaceCircuit");
    if (secondary) secondary.evidenceMode = "route-primary-foreground";

    expect(module.validateRoutePrimaryProbeEvidenceRecord(route, missingHero, {
      root: process.cwd(),
      requireScreenshot: false
    }).failures).toEqual(expect.arrayContaining([expect.stringMatching(/^route-primary-hero-asset:/)]));
    expect(module.validateRoutePrimaryProbeEvidenceRecord(route, missingSecondary, {
      root: process.cwd(),
      requireScreenshot: false
    }).failures).toEqual(expect.arrayContaining([expect.stringMatching(/^secondary-primary-assets:/)]));
    expect(module.validateRoutePrimaryProbeEvidenceRecord(route, secondaryWithHeroMode, {
      root: process.cwd(),
      requireScreenshot: false
    }).failures).toEqual(expect.arrayContaining([expect.stringMatching(/^secondary-primary-evidence-mode:showcaseKenneyNeonRaceCircuit:/)]));
  });

  it("fails stale or missing route-primary probe evidence", async () => {
    const module = await loadRoutePrimaryProbeModule();
    const route = publishedTypedRoute("showcase-product-configurator");
    const context = module.createRoutePrimaryProbeContext(route);
    const staleSource = cloneRecord(createValidProbeEvidence(route, context));
    staleSource.sourceHash = `sha256-${"0".repeat(64)}`;
    const staleGate = cloneRecord(createValidProbeEvidence(route, context));
    staleGate.routeGateHash = `sha256-${"1".repeat(64)}`;
    const staleHealth = cloneRecord(createValidProbeEvidence(route, context));
    staleHealth.routeHealthHash = `sha256-${"2".repeat(64)}`;

    expect(module.validateRoutePrimaryProbeEvidenceRecord(route, staleSource, {
      root: process.cwd(),
      requireScreenshot: false
    }).failures).toEqual(expect.arrayContaining([expect.stringMatching(/^source-hash:/)]));
    expect(module.validateRoutePrimaryProbeEvidenceRecord(route, staleGate, {
      root: process.cwd(),
      requireScreenshot: false
    }).failures).toEqual(expect.arrayContaining([expect.stringMatching(/^route-gate-hash:/)]));
    expect(module.validateRoutePrimaryProbeEvidenceRecord(route, staleHealth, {
      root: process.cwd(),
      requireScreenshot: false
    }).failures).toEqual(expect.arrayContaining([expect.stringMatching(/^route-health-hash:/)]));

    const missing = module.validateRoutePrimaryProbeEvidence(route, {
      root: process.cwd(),
      evidencePath: "tests/reports/showcase-route-primary-probes/does-not-exist.json"
    });
    expect(missing.ok).toBe(false);
    expect(missing.failures).toEqual(expect.arrayContaining([expect.stringMatching(/^missing-route-primary-probe:/)]));
  });

  it("fails route-primary evidence that is primitive-primary or explicitly failing", async () => {
    const module = await loadRoutePrimaryProbeModule();
    const route = publishedTypedRoute("showcase-product-configurator");
    const context = module.createRoutePrimaryProbeContext(route);
    const primitive = cloneRecord(createValidProbeEvidence(route, context));
    primitive.primitivePrimaryCandidates = ["hero:box"];
    const failing = cloneRecord(createValidProbeEvidence(route, context));
    failing.pass = false;
    failing.failures = ["primary-foreground-too-small:0"];

    expect(module.validateRoutePrimaryProbeEvidenceRecord(route, primitive, {
      root: process.cwd(),
      requireScreenshot: false
    }).failures).toEqual(expect.arrayContaining([expect.stringMatching(/^primitive-primary-candidates:/)]));
    expect(module.validateRoutePrimaryProbeEvidenceRecord(route, failing, {
      root: process.cwd(),
      requireScreenshot: false
    }).failures).toEqual(expect.arrayContaining([
      "route-primary-probe-pass:false",
      "route-primary-probe-failure:primary-foreground-too-small:0"
    ]));
  });

  it("rejects unsafe route-primary paths and fabricated screenshot metrics", async () => {
    const module = await loadRoutePrimaryProbeModule();
    expect(() => module.routePrimaryProbeEvidencePath("../tmp/escape")).toThrow(/Unsafe showcase route id/);
    expect(() => module.routePrimaryProbeScreenshotPath("showcase-product-configurator/../../escape")).toThrow(/Unsafe showcase route id/);

    const route = publishedTypedRoute("showcase-product-configurator");
    const context = module.createRoutePrimaryProbeContext(route);
    const screenshotPath = resolve("tests/reports/showcase-route-primary-probes/showcase-product-configurator.png");
    const evidence = cloneRecord(createValidProbeEvidence(route, context));

    if (existsSync(screenshotPath)) {
      const screenshotHash = createHash("sha256").update(readFileSync(screenshotPath)).digest("hex");
      const primaryAssets = evidence.primaryAssets as Array<Record<string, unknown>>;
      for (const asset of primaryAssets) {
        const probe = asset.renderedProbe as Record<string, unknown>;
        probe.sha256 = `sha256-${screenshotHash}`;
        probe.nonBlankPixels = 1;
        probe.colorBuckets = 1;
        probe.foregroundBounds = { x: 1, y: 1, width: 10, height: 10 };
        probe.clipped = false;
        probe.readabilityScore = 99;
        probe.failures = [];
      }
      evidence.pass = true;
      evidence.failures = [];
    }

    const result = module.validateRoutePrimaryProbeEvidenceRecord(route, evidence, {
      root: process.cwd(),
      path: resolve("tests/reports/showcase-route-primary-probes/showcase-product-configurator.json")
    });

    expect(result.ok).toBe(false);
    if (existsSync(screenshotPath)) {
      expect(result.failures).toEqual(expect.arrayContaining([
        expect.stringMatching(/^probe-png-(?:nonblank|color-buckets|foreground-bounds|clipped|readability):/)
      ]));
    } else {
      expect(result.failures).toEqual(expect.arrayContaining([
        expect.stringMatching(/^missing-route-primary-screenshot:/)
      ]));
    }
  });

  it("rejects forged pass records for retained failing route screenshots", async () => {
    const module = await loadRoutePrimaryProbeModule();
    const route = publishedTypedRoute("showcase-data-galaxy");
    const evidencePath = module.routePrimaryProbeEvidencePath(route.id, process.cwd());
    const screenshotPath = module.routePrimaryProbeScreenshotPath(route.id, process.cwd());
    expect(existsSync(evidencePath), "data-galaxy retained route-primary JSON").toBe(true);
    expect(existsSync(screenshotPath), "data-galaxy retained route-primary screenshot").toBe(true);

    const forged = JSON.parse(readFileSync(evidencePath, "utf8")) as Record<string, unknown>;
    forged.pass = true;
    forged.failures = [];
    forged.primitivePrimaryCandidates = [];
    for (const asset of forged.primaryAssets as Array<Record<string, unknown>>) {
      const probe = asset.renderedProbe as Record<string, unknown> | undefined;
      if (!probe) continue;
      probe.visible = true;
      probe.clipped = false;
      probe.occludedByUi = false;
      probe.failures = [];
    }

    const result = module.validateRoutePrimaryProbeEvidenceRecord(route, forged, {
      root: process.cwd(),
      path: evidencePath
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/^probe-primary-foreground-(?:too-small|width|height):/)
    ]));
  });

  it("keeps retained route-primary summary artifact paths repo-relative", () => {
    const summaryPath = resolve("tests/reports/showcase-route-primary-probes/_summary.json");
    expect(existsSync(summaryPath), "route-primary summary exists").toBe(true);
    const summaryRaw = readFileSync(summaryPath, "utf8");
    expect(summaryRaw, "route-primary summary should not leak absolute local paths").not.toMatch(/\/Users\/|\/var\/folders|private\/var|aura3d-resolve-/);
    const summary = JSON.parse(summaryRaw) as { routes?: readonly { evidencePath?: string; screenshotPath?: string }[] };
    for (const route of summary.routes ?? []) {
      expect(route.evidencePath, "summary evidence path").toMatch(/^tests\/reports\/showcase-route-primary-probes\/showcase-[a-z0-9-]+\.json$/);
      expect(route.screenshotPath, "summary screenshot path").toMatch(/^tests\/reports\/showcase-route-primary-probes\/showcase-[a-z0-9-]+\.png$/);
    }
  });
});

function materializeRetainedShowcaseFixtures(): string[] {
  const fixtureRoot = resolve("tests/fixtures/showcase-spec/evidence");
  const reportsRoot = resolve("tests/reports");
  if (!existsSync(fixtureRoot)) return [];
  const created: string[] = [];
  for (const source of walkFiles(fixtureRoot)) {
    const relativePath = source.slice(fixtureRoot.length + 1);
    const target = resolve(reportsRoot, relativePath);
    if (existsSync(target)) continue;
    mkdirSync(resolve(target, ".."), { recursive: true });
    if (source.endsWith(".json")) {
      const fixturePrefix = "tests/fixtures/showcase-spec/evidence/";
      const reportSource = readFileSync(source, "utf8").replaceAll(fixturePrefix, "tests/reports/");
      writeFileSync(target, reportSource);
    } else {
      copyFileSync(source, target);
    }
    created.push(target);
  }
  return created;
}

function expectedGlobalName(routeId: string): string {
  return `__AURA3D_${routeId.replace(/-/g, "_").toUpperCase()}__`;
}

function readManifestAssetIds(): ReadonlySet<string> {
  const manifest = JSON.parse(readFileSync(resolve("aura.assets.json"), "utf8")) as { assets?: readonly ManifestAsset[] };
  return new Set((manifest.assets ?? []).map((asset) => asset.id).filter((id): id is string => Boolean(id)));
}

function readManifestAssetHashes(): ReadonlyMap<string, string> {
  const manifest = JSON.parse(readFileSync(resolve("aura.assets.json"), "utf8")) as { assets?: readonly ManifestAsset[] };
  return new Map((manifest.assets ?? [])
    .filter((asset): asset is ManifestAsset & { readonly id: string; readonly hash: string } =>
      typeof asset.id === "string" && typeof asset.hash === "string")
    .map((asset) => [asset.id, asset.hash]));
}

function fileSha256(path: string): string {
  return `sha256-${createHash("sha256").update(readFileSync(resolve(path))).digest("hex")}`;
}

function readGeneratedAssetKeys(): ReadonlySet<string> {
  const generated = readFileSync(resolve("src/aura-assets.ts"), "utf8");
  return new Set(Array.from(generated.matchAll(/"([A-Za-z0-9_]+)"\s*:/g)).map((match) => match[1] ?? "").filter(Boolean));
}

function readRouteSourceText(routeId: string): string {
  const appDir = resolve("apps", routeId);
  if (!existsSync(appDir)) return "";
  return walkFiles(appDir)
    .filter((file) => /\.(?:ts|tsx|js|jsx|css|html|md)$/.test(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

function normalizeTypedRef(ref: string | undefined): string {
  return String(ref ?? "").replace(/^assets\./, "");
}

async function loadRoutePrimaryProbeModule(): Promise<RoutePrimaryProbeModule> {
  return await import(pathToFileURL(resolve("tools/showcase-library/route-primary-probes.mjs")).href) as RoutePrimaryProbeModule;
}

async function loadRouteGateModule(): Promise<RouteGateModule> {
  return await import(pathToFileURL(resolve("tools/showcase-library/route-gates.mjs")).href) as RouteGateModule;
}

async function loadGameReleaseGateModule(): Promise<GameReleaseGateModule> {
  return await import(pathToFileURL(resolve("tools/showcase-library/showcase-game-release-gates.mjs")).href) as GameReleaseGateModule;
}

function publishedTypedRoute(id: string): ShowcaseRouteGate {
  const route = typedRoute(id);
  expect(route.published, `${id} published`).toBe(true);
  return route;
}

function typedRoute(id: string): ShowcaseRouteGate {
  const route = routeGateConfig.routes.find((entry) => entry.id === id);
  if (!route) throw new Error(`Missing route gate for ${id}`);
  expect(route.requiresTypedPrimaryAssets, `${id} typed primary assets`).toBe(true);
  return route;
}

function createValidProbeEvidence(route: ShowcaseRouteGate, context: RoutePrimaryProbeContext): Record<string, unknown> {
  const renderedProbe = {
    screenshotPath: `tests/reports/showcase-route-primary-probes/${route.id}.png`,
    sha256: `sha256-${"a".repeat(64)}`,
    width: 1440,
    height: 900,
    analysisCrop: { x: 300, y: 120, width: 780, height: 680 },
    nonBlankPixels: 42_000,
    colorBuckets: 24,
    foregroundBounds: { x: 320, y: 180, width: 420, height: 320 },
    visible: true,
    clipped: false,
    occludedByUi: false,
    readabilityScore: 82,
    failures: []
  };
  return {
    schema: "aura3d-route-primary-probe/1.0",
    routeId: route.id,
    routePath: route.path,
    appId: route.id,
    sourceHash: context.sourceHash,
    routeGateHash: context.routeGateHash,
    routePrimaryHeroAsset: context.routePrimaryHeroAsset,
    secondaryPrimaryAssets: context.secondaryPrimaryAssets,
    ...(context.routeHealthHash ? { routeHealthHash: context.routeHealthHash } : {}),
    generatedAt: "2026-06-21T00:00:00.000Z",
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    renderer: { backend: "production-runtime", drawCalls: 4, renderSize: [1440, 900] },
    primaryAssets: context.primaryAssets.map((asset) => ({
      id: asset.id,
      role: asset.role,
      expectedTypedRef: asset.expectedTypedRef,
      routePrimaryEvidenceTarget: asset.routePrimaryEvidenceTarget,
      evidenceMode: asset.evidenceMode,
      ...(asset.manifestHash ? { manifestHash: asset.manifestHash } : {}),
      ...(asset.routePrimaryEvidenceTarget ? { renderedProbe } : {})
    })),
    primitivePrimaryCandidates: [],
    pass: true,
    failures: []
  };
}

function cloneRecord(record: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
}

function walkFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") continue;
      files.push(...walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}
