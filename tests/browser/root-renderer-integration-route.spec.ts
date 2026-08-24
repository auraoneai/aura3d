import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * FS-304: proves that the designated root integration reference route's published
 * renderer claims match what the mounted runtime actually did.
 *
 * The property under test is *claim honesty*, not feature count. Each claimed
 * feature is cross-checked against an independently re-read runtime observation, so
 * the route cannot advertise a renderer feature the runtime skipped — and, equally,
 * cannot stay silent about a bridge it is not actually running on.
 *
 * The route runs on the typed-GLB production bridge. Adopting the bridge initially
 * regressed the scene (draw calls 175 -> 26, typed world GLB and most authored
 * platforms missing) because the bridge sized typed models from manifest metadata
 * bounds rather than the actually-loaded GLB bounds. That was fixed in the bridge;
 * this spec asserts the bridge is active and that the route claims only observed
 * features, so a future regression back to the fallback path fails loudly instead of
 * silently downgrading the route's renderer claims.
 */

const reportDir = "tests/reports/root-renderer-integration";
const evidencePath = `${reportDir}/skyline-root-integration.json`;
const ROUTE_ID = "showcase-skyline-runner";

interface RootIntegrationEvidence {
  readonly schema: string;
  readonly role: string;
  readonly imports: readonly string[];
  readonly runtimeBackend?: string;
  readonly backend: string;
  readonly observed: {
    readonly postprocessPixelBacked: boolean;
    readonly actualPasses: readonly string[];
    readonly toneMappingPass: boolean;
    readonly colorGradePass: boolean;
    readonly fxaaPass: boolean;
    readonly bloomPass: boolean;
    readonly ssaoPassExecuted: boolean;
    readonly fogEnabled: boolean;
    readonly shadowMapRendered: boolean;
    readonly shadowMapSampled: boolean;
    readonly shadowMapSize?: number;
  };
  readonly claimedFeatures: readonly string[];
  readonly executedButNotClaimed: readonly string[];
  readonly productionBridgeStatus: string;
  readonly claimBoundary: string;
  readonly provenBy: readonly string[];
}

test.describe("root renderer integration reference route", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("skyline runner demonstrates the root-proven renderer features through public imports only", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/apps/${ROUTE_ID}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => Boolean((window as unknown as Record<string, unknown>).__AURA3D_SHOWCASE_SKYLINE_RUNNER__),
      undefined,
      { timeout: 60_000 }
    );
    // The route publishes its evidence at mount; wait for the runtime to have
    // actually drawn before reading pass state, otherwise "not mounted" would be
    // indistinguishable from "feature absent".
    await page.waitForFunction(() => {
      const evidence = (window as unknown as Record<string, any>).__AURA3D_SHOWCASE_SKYLINE_RUNNER__;
      return Number(evidence?.diagnostics?.drawCalls ?? 0) > 0;
    }, undefined, { timeout: 60_000 });

    mkdirSync(resolve(reportDir), { recursive: true });

    const integration: RootIntegrationEvidence = await page.evaluate(() => {
      const evidence = (window as unknown as Record<string, any>).__AURA3D_SHOWCASE_SKYLINE_RUNNER__;
      return evidence.rootRendererIntegration as RootIntegrationEvidence;
    });

    // Independently re-read the live diagnostics so the assertions do not rely on
    // the route's own snapshot of itself.
    const liveDiagnostics = await page.evaluate(() => {
      const evidence = (window as unknown as Record<string, any>).__AURA3D_SHOWCASE_SKYLINE_RUNNER__;
      const renderer = evidence?.diagnostics?.renderer;
      return {
        runtimeBackend: renderer?.runtime?.backend as string | undefined,
        actualPasses: (renderer?.postprocess?.actualPasses ?? []) as string[],
        pixelBacked: renderer?.postprocess?.pixelBacked === true,
        bloomPass: renderer?.postprocess?.bloomPass === true,
        ambientOcclusionPass: renderer?.postprocess?.ambientOcclusionPass === true,
        fogEnabled: renderer?.fog?.enabled === true,
        shadowMapRendered: renderer?.shadows?.mapRendered === true,
        shadowMapSampled: renderer?.shadows?.mapSampled === true
      };
    });

    const screenshot = `${reportDir}/${ROUTE_ID}-root-integration.png`;
    await page.screenshot({ path: screenshot, fullPage: false });
    const screenshotHash = `sha256-${createHash("sha256").update(readFileSync(resolve(screenshot))).digest("hex")}`;

    const onProductionBridge = liveDiagnostics.runtimeBackend === "production-runtime";
    const failures: string[] = [];
    // Public-only imports. This route is the reference precisely because it does
    // not reach into renderer internals to obtain the result.
    if (!integration.imports.includes("@aura3d/engine")) failures.push("Route does not declare the public @aura3d/engine import.");
    for (const forbidden of integration.imports) {
      if (forbidden.includes("@aura3d/rendering") || forbidden.includes("/src/")) {
        failures.push(`Route integration evidence declares a non-public import: ${forbidden}`);
      }
    }
    // Every claimed feature must be backed by an independently observed signal.
    const claimChecks: Record<string, boolean> = {
      "root-typed-glb-production-bridge": liveDiagnostics.runtimeBackend === "production-runtime",
      "root-pixel-backed-tone-mapping":
        liveDiagnostics.pixelBacked && liveDiagnostics.actualPasses.includes("tone-mapping"),
      "root-bloom-pass": liveDiagnostics.bloomPass,
      "root-environment-fog": liveDiagnostics.fogEnabled,
      "root-single-directional-pcf-shadow-map": liveDiagnostics.shadowMapRendered && liveDiagnostics.shadowMapSampled
    };
    for (const feature of integration.claimedFeatures) {
      const observed = claimChecks[feature];
      if (observed === undefined) failures.push(`Route claims an unrecognized feature with no observation rule: ${feature}`);
      else if (!observed) failures.push(`Route claims ${feature} but the mounted runtime did not report it.`);
    }
    // The route must not silently promote SSAO from executed to claimed.
    if (integration.claimedFeatures.some((feature) => feature.includes("ssao"))) {
      failures.push("Route claims SSAO, which the root postprocess contract records as partial.");
    }
    if (liveDiagnostics.ambientOcclusionPass && integration.executedButNotClaimed.length === 0) {
      failures.push("SSAO executed but the route did not record it as executed-but-not-claimed.");
    }
    // Claim honesty in the other direction: a route not on the production bridge must
    // claim nothing and must say why, rather than reporting renderer features it only
    // authored. This is what stops authored intent from reading as proven support.
    if (!onProductionBridge) {
      if (integration.claimedFeatures.length > 0) {
        failures.push(`Route is on ${liveDiagnostics.runtimeBackend} but still claims renderer features: ${integration.claimedFeatures.join(", ")}`);
      }
      if (!/deliberately-not-adopted/.test(integration.productionBridgeStatus)) {
        failures.push("Route is not on the production bridge but does not record why.");
      }
    } else if (integration.productionBridgeStatus !== "active") {
      failures.push("Route is on the production bridge but does not report productionBridgeStatus active.");
    }
    // Guard against generalizing this single route into arbitrary-scene parity.
    for (const forbiddenWord of ["parity", "arbitrary"]) {
      if (integration.claimedFeatures.some((feature) => feature.toLowerCase().includes(forbiddenWord))) {
        failures.push(`Claimed features must not contain "${forbiddenWord}".`);
      }
    }
    if (!/does not claim arbitrary-scene/i.test(integration.claimBoundary)) {
      failures.push("Claim boundary must explicitly exclude arbitrary-scene renderer parity.");
    }

    const evidence = {
      schema: "aura3d-root-renderer-integration-route/1.0",
      generatedAt: new Date().toISOString(),
      routeId: ROUTE_ID,
      screenshot,
      screenshotHash,
      routeIntegration: integration,
      independentlyObserved: liveDiagnostics,
      claimChecks,
      pass: failures.length === 0,
      failures,
      visualApproval: "not-granted: this contract proves renderer feature integration, not visual quality"
    };
    writeFileSync(resolve(evidencePath), `${JSON.stringify(evidence, null, 2)}\n`);

    expect(integration.role).toBe("root-integration-reference-route");
    expect(onProductionBridge).toBe(true);
    expect(integration.productionBridgeStatus).toBe("active");
    // The bounded feature set this route demonstrates. Each entry is separately
    // proven by a root-only contract and each is raised here only from an observed
    // runtime diagnostic, never from what the scene authored.
    expect(integration.claimedFeatures).toEqual(expect.arrayContaining([
      "root-typed-glb-production-bridge",
      "root-pixel-backed-tone-mapping",
      "root-bloom-pass",
      "root-environment-fog",
      "root-single-directional-pcf-shadow-map"
    ]));
    expect(evidence.failures, JSON.stringify(evidence.failures, null, 2)).toEqual([]);
    expect(evidence.pass).toBe(true);
    expect(errors).toEqual([]);
  });
});
