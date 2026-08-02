import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface FloorRegionMetrics {
  readonly darkFraction: number;
  readonly meanLuma: number;
  readonly sampledPixels: number;
}

interface ShadowConfigurationCapture {
  readonly id: string;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly pixelRatio: number;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly diagnostics: {
    readonly backend: string;
    readonly runtimeBackend: string | undefined;
    readonly drawCalls: number;
    readonly renderSize: readonly number[];
    readonly shadows: {
      readonly enabled: boolean;
      readonly requested: boolean;
      readonly mapRendered: boolean;
      readonly mapSampled: boolean;
      readonly mapSize?: number;
      readonly label?: string;
      readonly nativeShadowMapBindings: number;
      readonly shadowRenderTargetsAllocated: number;
      readonly mapType: string;
    };
  };
  readonly caster: FloorRegionMetrics;
  readonly noCaster: FloorRegionMetrics;
  readonly shadowDarkFractionDelta: number;
  readonly shadowLumaDelta: number;
}

interface ShadowContractWindow extends Window {
  readonly __AURA3D_ROOT_SHADOW_CONTRACT_RUNNER__?: {
    readonly imports: readonly string[];
    readonly configurationIds: readonly string[];
    renderConfiguration(id: string): Promise<ShadowConfigurationCapture>;
  };
  readonly __AURA3D_ROOT_SHADOW_CONTRACT_ERROR__?: string;
}

interface ShadowContractEvidence {
  readonly schema: "aura3d-root-shadow-contract/1.0";
  readonly generatedAt: string;
  readonly imports: readonly string[];
  readonly claimBoundary: string;
  readonly configurations: readonly (ShadowConfigurationCapture & { readonly screenshot: string; readonly screenshotHash: string })[];
  readonly stability: {
    readonly baselineDarkFractionDelta: number;
    readonly minDarkFractionDelta: number;
    readonly maxDarkFractionDelta: number;
    readonly maxRelativeDeviationFromBaseline: number;
    readonly distinctBackingSizes: number;
    readonly distinctPixelRatios: number;
  };
  readonly pass: boolean;
  readonly failures: readonly string[];
}

const reportDir = "tests/reports/createAuraApp-shadow-contract";
const evidencePath = `${reportDir}/shadow-contract.json`;

/**
 * Minimum fraction of the sampled floor band the occluder must measurably darken.
 * Measured as a paired per-pixel comparison against a same-lighting no-caster
 * control, so only real projected shadow counts, not an exposure shift.
 */
const MIN_SHADOW_DARK_FRACTION_DELTA = 0.02;

/**
 * Resize/DPR stability tolerance. Absolute shadow pixel counts must change with
 * resolution; the shadow's *share* of the floor band must not.
 *
 * Measured deviation across these configurations is ~0.06 while the sampled pixel
 * count spans roughly 9x, so 0.12 leaves room for genuine PCF and texel-density
 * differences while still failing if a resize or DPR change breaks the shadow path.
 * A loose tolerance here would make the stability claim unfalsifiable, which is the
 * failure mode this contract exists to prevent: at this bound a shadow that silently
 * stopped rendering at one resolution, or halved in coverage, still fails.
 */
const MAX_RELATIVE_DEVIATION = 0.12;

test.describe("createAuraApp root shadow contract", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("proves root directional shadow pixels and resize/DPR stability", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/createAuraApp-shadow-contract-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const contractWindow = window as ShadowContractWindow;
      return Boolean(contractWindow.__AURA3D_ROOT_SHADOW_CONTRACT_RUNNER__ || contractWindow.__AURA3D_ROOT_SHADOW_CONTRACT_ERROR__);
    }, undefined, { timeout: 30_000 });

    const harnessError = await page.evaluate(() => (window as ShadowContractWindow).__AURA3D_ROOT_SHADOW_CONTRACT_ERROR__);
    if (harnessError) throw new Error(harnessError);

    const runnerInfo = await page.evaluate(() => {
      const runner = (window as ShadowContractWindow).__AURA3D_ROOT_SHADOW_CONTRACT_RUNNER__;
      if (!runner) throw new Error("Root shadow contract runner was not initialized.");
      return { imports: runner.imports, configurationIds: runner.configurationIds };
    });

    mkdirSync(resolve(reportDir), { recursive: true });

    const configurations: (ShadowConfigurationCapture & { readonly screenshot: string; readonly screenshotHash: string })[] = [];
    for (const id of runnerInfo.configurationIds) {
      const capture = await renderConfiguration(page, id);
      const screenshot = `${reportDir}/${id}.png`;
      await page.locator("#shadow-contract-stage canvas").screenshot({ path: screenshot });
      configurations.push({ ...capture, screenshot, screenshotHash: sha256File(screenshot) });
    }

    const baseline = configurations[0];
    if (!baseline) throw new Error("Root shadow contract produced no configurations.");
    const deltas = configurations.map((configuration) => configuration.shadowDarkFractionDelta);
    const maxRelativeDeviationFromBaseline = Math.max(
      ...deltas.map((delta) => Math.abs(delta - baseline.shadowDarkFractionDelta) / Math.max(1e-6, baseline.shadowDarkFractionDelta))
    );

    const failures: string[] = [];
    for (const configuration of configurations) {
      const { shadows } = configuration.diagnostics;
      if (configuration.diagnostics.runtimeBackend !== "production-runtime") {
        failures.push(`${configuration.id} did not reach the production runtime; shadows cannot be claimed from the fallback path.`);
      }
      if (!shadows.requested) failures.push(`${configuration.id} did not request shadows.`);
      if (!shadows.mapRendered) failures.push(`${configuration.id} did not render a shadow depth target.`);
      if (!shadows.mapSampled) failures.push(`${configuration.id} did not sample the shadow map in a shader.`);
      if (configuration.shadowDarkFractionDelta < MIN_SHADOW_DARK_FRACTION_DELTA) {
        failures.push(`${configuration.id} shadow darkening ${configuration.shadowDarkFractionDelta} is below the ${MIN_SHADOW_DARK_FRACTION_DELTA} floor-region threshold.`);
      }
    }
    if (maxRelativeDeviationFromBaseline > MAX_RELATIVE_DEVIATION) {
      failures.push(`Shadow coverage is not stable across resize/DPR: relative deviation ${maxRelativeDeviationFromBaseline.toFixed(4)} exceeds ${MAX_RELATIVE_DEVIATION}.`);
    }

    const evidence: ShadowContractEvidence = {
      schema: "aura3d-root-shadow-contract/1.0",
      generatedAt: new Date().toISOString(),
      imports: runnerInfo.imports,
      claimBoundary: "Root createAuraApp production bridge renders and samples a single directional PCF shadow map with pixel-measured floor darkening that stays proportionally stable across canvas resize and device pixel ratio. This is not a claim about cascaded directional shadows, point/spot shadow maps, or Three.js shadow parity.",
      configurations,
      stability: {
        baselineDarkFractionDelta: baseline.shadowDarkFractionDelta,
        minDarkFractionDelta: Math.min(...deltas),
        maxDarkFractionDelta: Math.max(...deltas),
        maxRelativeDeviationFromBaseline: Number(maxRelativeDeviationFromBaseline.toFixed(4)),
        distinctBackingSizes: new Set(configurations.map((configuration) => `${configuration.backingWidth}x${configuration.backingHeight}`)).size,
        distinctPixelRatios: new Set(configurations.map((configuration) => configuration.pixelRatio)).size
      },
      pass: failures.length === 0,
      failures
    };
    writeFileSync(resolve(evidencePath), `${JSON.stringify(evidence, null, 2)}\n`);

    expect(evidence.imports).toEqual(["@aura3d/engine", "../../src/aura-assets"]);
    // Resize and DPR must both actually vary, otherwise "stable across resize/DPR"
    // would be a claim about a single configuration.
    expect(evidence.stability.distinctBackingSizes).toBeGreaterThanOrEqual(4);
    expect(evidence.stability.distinctPixelRatios).toBeGreaterThanOrEqual(3);
    expect(evidence.configurations.length).toBeGreaterThanOrEqual(5);
    expect(evidence.failures, JSON.stringify(evidence.failures, null, 2)).toEqual([]);
    expect(evidence.pass).toBe(true);
    expect(errors).toEqual([]);
  });
});

async function renderConfiguration(page: Page, id: string): Promise<ShadowConfigurationCapture> {
  return page.evaluate(async (configurationId) => {
    const runner = (window as ShadowContractWindow).__AURA3D_ROOT_SHADOW_CONTRACT_RUNNER__;
    if (!runner) throw new Error("Root shadow contract runner was not initialized.");
    return runner.renderConfiguration(configurationId);
  }, id);
}

function sha256File(path: string): string {
  return `sha256-${createHash("sha256").update(readFileSync(resolve(path))).digest("hex")}`;
}
