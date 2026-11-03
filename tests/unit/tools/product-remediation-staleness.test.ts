import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const gateScript = "tools/product-remediation/check-quality-gates.mjs";
const explainerScript = "tools/evidence-freshness/explain-staleness.mjs";
const auditPath = "tests/reports/evidence-freshness/staleness-audit.json";
const probeDir = "tests/reports/showcase-route-primary-probes";
const published = "showcase-published";
const secondPublished = "showcase-second-published";
const retired = "showcase-retired";
const frozen = "showcase-frozen";
const noProbe = "showcase-no-probe";

type Audit = Record<string, unknown> & { artifacts: Record<string, unknown>[] };
type Check = { id: string; status: string; detail: string };
type GateReport = { totals: { fail: number; unproven: number }; checks: Check[] };
type ProbeModule = {
  ROUTE_PRIMARY_PROBE_PRODUCER_VERSION: string;
  createRouteSourceHash: (routeId: string, root: string) => string;
  createRoutePrimaryProbeContext: (routeFixture: ReturnType<typeof route>, root: string) => {
    sourceHash: string;
    routeGateHash: string;
    routeHealthHash: string;
    rendererFingerprint: string;
    producerId: string;
    producerVersion: string;
    producerFingerprint: string;
    primaryAssets: { id: string; manifestHash: string }[];
  };
};
type FreshnessModule = {
  sha256: (value: string | Buffer) => string;
  createConfigFingerprint: (value: unknown) => string;
  createRendererFingerprint: (root: string) => string;
  createProducerFingerprint: (path: string, version: string, root: string) => string;
  createFreshnessBinding: (options: Record<string, unknown>) => unknown;
};

const artifactPath = (id: string) => `${probeDir}/${id}.json`;
const reason = (status: string) => ({
  kind: "route-source",
  id: published,
  status,
  detail: "synthetic freshness reason"
});

function route(id: string, options: { published?: boolean; frozen?: boolean; requiresProbe?: boolean; assets?: string[] } = {}) {
  const assets = options.assets ?? [];
  return {
    id,
    label: id,
    path: `/apps/${id}/`,
    globalName: `__${id.replaceAll("-", "_").toUpperCase()}__`,
    published: options.published ?? true,
    releaseClass: options.frozen ? "game-layer-diagnostic" : "internal-diagnostic",
    primaryAssets: assets,
    ...(assets.length ? {
      primaryAssetRoles: Object.fromEntries(assets.map((asset) => [asset, "hero"])),
      routePrimaryHeroAsset: assets[0],
      secondaryPrimaryAssets: assets.slice(1)
    } : {}),
    primitiveBudget: 0,
    requiresTypedPrimaryAssets: assets.length > 0,
    requiresRoutePrimaryProbe: options.requiresProbe ?? true,
    ...(options.frozen ? { retainedEvidenceFrozen: true } : {})
  };
}

function markNotFresh(audit: Audit, options: { unbound?: boolean; status?: string } = {}): void {
  const entry = audit.artifacts[0]!;
  entry.fresh = false;
  entry.unbound = options.unbound ?? false;
  entry.reasons = [reason(options.status ?? "mismatch")];
  audit.staleArtifactCount = 1;
}

function legacyAudit(countKey?: "stale" | "staleCount"): Audit {
  return {
    ...(countKey ? { [countKey]: 0 } : {}),
    artifacts: [published, secondPublished].map((id) => ({
      artifact: artifactPath(id),
      stale: false,
      unbound: false
    }))
  };
}

describe("product remediation evidence-freshness gate", () => {
  let root: string;
  let baselineAudit: Audit;

  function freshAudit(): Audit {
    return structuredClone(baselineAudit);
  }

  function put(path: string, contents: string | Buffer): void {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }

  function putJson(path: string, value: unknown): void {
    put(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  function runGate(): { check: Check; report: GateReport; status: number | null } {
    const result = spawnSync(process.execPath, [join(root, gateScript)], { cwd: root, encoding: "utf8" });
    if (result.error) throw result.error;
    expect(result.signal, result.stderr).toBeNull();
    const output = join(root, "tests/reports/aura3d-quality-gates.json");
    expect(existsSync(output), result.stderr).toBe(true);
    const report = JSON.parse(readFileSync(output, "utf8")) as GateReport;
    const check = report.checks.find((entry) => entry.id === "evidence-freshness");
    expect(check, result.stdout).toBeDefined();
    return { check: check!, report, status: result.status };
  }

  function expectVerdict(expected: "pass" | "fail" | "unproven") {
    const result = runGate();
    expect(result.check.status, result.check.detail).toBe(expected);
    expect(result.status).toBe(expected === "pass" ? 0 : 1);
    // All unrelated checks have passing synthetic evidence: only freshness changes the exit code.
    expect(result.report.totals).toMatchObject({
      fail: expected === "fail" ? 1 : 0,
      unproven: expected === "unproven" ? 1 : 0
    });
    return result.check;
  }

  function runExplainer(...flags: string[]): Audit {
    const result = spawnSync(process.execPath, [join(root, explainerScript), "--root", root, "--json", "--write", ...flags], {
      cwd: root,
      encoding: "utf8"
    });
    if (result.error) throw result.error;
    expect(result.status, result.stderr).toBe(0);
    const audit = JSON.parse(result.stdout) as Audit;
    expect(JSON.parse(readFileSync(join(root, auditPath), "utf8"))).toEqual(audit);
    return audit;
  }

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "aura3d-quality-staleness-"));
    for (const path of [
      gateScript,
      explainerScript,
      "tools/showcase-library/route-gates.mjs",
      "tools/showcase-library/route-primary-probes.mjs",
      "tools/showcase-library/png-foreground.mjs",
      "tools/evidence-freshness/index.mjs",
      "tools/evidence-freshness/producer-registry.mjs"
    ]) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(resolve(repoRoot, path), target);
    }
    put("packages/engine/src/agent-api/index.ts", "export const syntheticRenderer = 1;\n");
    const routes = [
      route(published, { assets: ["syntheticHero"] }),
      route(secondPublished, { assets: ["syntheticHero"] }),
      route(retired, { published: false }),
      route(frozen, { frozen: true }),
      route(noProbe, { requiresProbe: false })
    ];
    putJson("tools/showcase-library/route-gates.json", {
      schema: "aura3d-showcase-route-gates/1.0",
      routes
    });
    putJson("tests/reports/showcase-interaction-audit/published.json", {
      routeId: published,
      controlsOperated: 1,
      controlsPassing: 1,
      consoleErrors: [],
      keyboardResults: [{ changed: true }],
      restartRecovered: true,
      observedInvariants: {
        focus: { passes: true },
        labels: { total: 1, visible: 1 },
        spatial: { passes: true }
      },
      controlsDiscovered: 1,
      mobileControlsDiscovered: 1,
      viewportVariants: [1, 2, 3],
      frameSequence: [1, 2, 3, 4, 5, 6],
      sourceFingerprint: "synthetic-source",
      configurationFingerprint: "synthetic-config",
      trace: { synthetic: true },
      frameVariationRequired: true,
      distinctFrames: 2
    });
    put("fixtures/kits.js", [
      "createProductConfiguratorKit",
      "createDigitalTwinKit",
      "createArchitectureKit",
      "createSmartCityKit",
      "createCinematicKit"
    ].join("\n"));
    putJson("tests/reports/aura3d-product-inventory.json", {
      apps: [{ routeId: published, magicGeometry: [], sourceFiles: ["fixtures/kits.js"] }]
    });
    putJson("tests/reports/turbo-vehicle-grounding/turbo-vehicle-grounding.json", {
      finalChassis: {
        observed: {
          everUngrounded: false,
          maxContactGap: 0.01,
          suspensionMoved: true,
          pitchObserved: true,
          rollObserved: true
        }
      },
      opponentController: "aura-vehicle-driver-ai"
    });
    putJson("tests/reports/skyline-platformer-motion/skyline-platformer-motion.json", {
      motion: { invariants: { passes: true, measured: { apexToRiseRatio: 1 } }, estimatedSessionSeconds: 130, airtime: 1 },
      groundedSamples: 80,
      groundedSampleCount: 100,
      maxAirborneStreak: 10
    });
    const freshness = await import(
      /* @vite-ignore */ pathToFileURL(join(root, "tools/evidence-freshness/index.mjs")).href
    ) as FreshnessModule;
    const producer = await import(
      /* @vite-ignore */ pathToFileURL(join(root, "tools/showcase-library/route-primary-probes.mjs")).href
    ) as ProbeModule;
    putJson("aura.assets.json", { assets: [{ id: "syntheticHero", hash: freshness.sha256("synthetic hero") }] });
    const screenshot = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aWQAAAAASUVORK5CYII=",
      "base64"
    );
    const viewport = { width: 640, height: 480, deviceScaleFactor: 1 };
    for (const entry of routes.slice(0, 2)) {
      const id = entry.id;
      put(`apps/${id}/main.ts`, `export const syntheticScene = "${id}";\n`);
      putJson(`apps/${id}/route-health.json`, { state: "synthetic-ready" });
      const context = producer.createRoutePrimaryProbeContext(entry, root);
      const screenshotPath = `${probeDir}/${id}.png`;
      put(screenshotPath, screenshot);
      const dependencies = [
        { kind: "route-source", id, hash: context.sourceHash },
        { kind: "route-gate-config", id: "route-gates.json", hash: context.routeGateHash },
        { kind: "route-health", id: `${id}/route-health.json`, hash: context.routeHealthHash },
        ...context.primaryAssets.map((asset) => ({ kind: "primary-asset", id: asset.id, hash: asset.manifestHash })),
        { kind: "renderer-fingerprint", id: "agent-api+assets", hash: context.rendererFingerprint },
        { kind: "producer-version", id: context.producerId, hash: context.producerFingerprint },
        { kind: "viewport-contract", id, hash: freshness.createConfigFingerprint(viewport) }
      ];
      putJson(artifactPath(id), {
        schema: "aura3d-route-primary-probe/1.0",
        routeId: id,
        routePath: entry.path,
        appId: id,
        sourceHash: context.sourceHash,
        routeGateHash: context.routeGateHash,
        routeHealthHash: context.routeHealthHash,
        viewport,
        primaryAssets: context.primaryAssets,
        renderer: { drawCalls: 10 },
        renderedProbe: { screenshotPath, sha256: freshness.sha256(screenshot) },
        freshness: freshness.createFreshnessBinding({
          artifact: artifactPath(id),
          producerId: context.producerId,
          producerVersion: context.producerVersion,
          producerFingerprint: context.producerFingerprint,
          dependencies
        })
      });
    }
    for (const id of [retired, frozen]) {
      putJson(artifactPath(id), {
        renderer: { drawCalls: 10 },
        fresh: false,
        unbound: true,
        humanVisualApproval: true,
        historicalSentinel: id
      });
    }
    // This is an isolated synthetic tree; its verdict is never copied into repository evidence.
    const initial = spawnSync(process.execPath, [join(root, gateScript), "--print-freshness-audit"], {
      cwd: root, encoding: "utf8"
    });
    expect(initial.status, initial.stderr).toBe(0);
    baselineAudit = JSON.parse(initial.stdout) as Audit;
    expect(baselineAudit.staleArtifactCount).toBe(0);
    expect(existsSync(join(root, auditPath)), "printing a proof must not write the audit").toBe(false);
  });

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("passes a complete current-producer audit with fresh published artifacts", () => {
    putJson(auditPath, freshAudit());
    const check = expectVerdict("pass");
    expect(check.detail).toContain("2 required published probe(s) fresh");
    expect(check.detail).toContain("retired and frozen evidence not audited or approved");
  });

  it.each([
    ["stale", { status: "mismatch" }],
    ["unbound artifact", { unbound: true, status: "missing" }],
    ["unbound dependency in a bound artifact", { status: "unbound" }]
  ])("fails on a %s from the current producer", (_name, options) => {
    const audit = freshAudit();
    markNotFresh(audit, options);
    putJson(auditPath, audit);
    const check = expectVerdict("fail");
    expect(check.detail).toContain(artifactPath(published));
    expect(check.detail).toContain("1 of 2 artifact(s) stale or unbound");
  });

  it("records missing evidence as unproven instead of passing or crashing", () => {
    const check = expectVerdict("unproven");
    expect(check.detail).toContain("freshness audit missing");
    expect(check.detail).toContain("check-quality-gates.mjs --print-freshness-audit");
  });

  it("records invalid JSON as unproven and still writes a gate result", () => {
    put(auditPath, "{ this is not JSON");
    const check = expectVerdict("unproven");
    expect(check.detail).toContain("unreadable or invalid JSON");
  });

  it.each([
    ["null", null],
    ["an array", []],
    ["a count without artifact verdicts", { stale: 0 }],
    ["an empty artifact list", { staleCount: 0, artifacts: [] }]
  ])("rejects %s as an ambiguous or malformed report", (_name, input) => {
    putJson(auditPath, input);
    expectVerdict("unproven");
  });

  it.each([
    ["missing schema", (audit: Audit) => { delete audit.schema; }],
    ["unknown schema", (audit: Audit) => { audit.schema = "another-audit/9.0"; }],
    ["missing artifacts", (audit: Audit) => { Reflect.deleteProperty(audit, "artifacts"); }],
    ["empty artifacts", (audit: Audit) => { audit.artifacts = []; }],
    ["missing aggregate", (audit: Audit) => { delete audit.staleArtifactCount; }],
    ["negative aggregate", (audit: Audit) => { audit.staleArtifactCount = -1; }],
    ["fractional aggregate", (audit: Audit) => { audit.staleArtifactCount = 0.5; }],
    ["string aggregate", (audit: Audit) => { audit.staleArtifactCount = "0"; }],
    ["null aggregate", (audit: Audit) => { audit.staleArtifactCount = null; }],
    ["missing artifact path", (audit: Audit) => { delete audit.artifacts[0]!.artifact; }],
    ["duplicate artifact", (audit: Audit) => { audit.artifacts[1]!.artifact = audit.artifacts[0]!.artifact; }],
    ["missing fresh verdict", (audit: Audit) => { delete audit.artifacts[0]!.fresh; }],
    ["nonboolean fresh verdict", (audit: Audit) => { audit.artifacts[0]!.fresh = "true"; }],
    ["missing unbound verdict", (audit: Audit) => { delete audit.artifacts[0]!.unbound; }],
    ["nonboolean unbound verdict", (audit: Audit) => { audit.artifacts[0]!.unbound = 0; }],
    ["contradictory fresh and unbound verdicts", (audit: Audit) => { audit.artifacts[0]!.unbound = true; }],
    ["contradictory fresh and legacy stale verdicts", (audit: Audit) => { audit.artifacts[0]!.stale = true; }],
    ["malformed reasons", (audit: Audit) => { audit.artifacts[0]!.reasons = null; }],
    ["fresh with a stale reason", (audit: Audit) => { audit.artifacts[0]!.reasons = [reason("mismatch")]; }],
    ["stale without a reason", (audit: Audit) => { audit.artifacts[0]!.fresh = false; audit.staleArtifactCount = 1; }],
    ["fresh with a producer conflict", (audit: Audit) => { audit.artifacts[0]!.producerConflicts = [{}]; }],
    ["invalid timestamp", (audit: Audit) => { audit.generatedAt = "yesterday"; }],
    ["invalid renderer fingerprint", (audit: Audit) => { audit.rendererFingerprint = "sha256-no-renderer-sources"; }],
    ["invalid retired route list", (audit: Audit) => { audit.retiredRoutes = [null]; }],
    ["invalid conflict list", (audit: Audit) => { audit.ownershipConflicts = null; }]
  ])("rejects a current report with %s", (_name, mutate) => {
    const audit = freshAudit();
    mutate(audit);
    putJson(auditPath, audit);
    expect(expectVerdict("unproven").detail).toContain("invalid freshness audit");
  });

  it("rejects a zero aggregate that contradicts a stale artifact", () => {
    const audit = freshAudit();
    markNotFresh(audit);
    audit.staleArtifactCount = 0;
    putJson(auditPath, audit);
    expect(expectVerdict("unproven").detail).toContain("staleArtifactCount=0 disagrees with 1");
  });

  it("rejects a nonzero aggregate that contradicts fresh artifacts", () => {
    const audit = freshAudit();
    audit.staleArtifactCount = 1;
    putJson(auditPath, audit);
    expect(expectVerdict("unproven").detail).toContain("staleArtifactCount=1 disagrees with 0");
  });

  it("rejects a zero aggregate that omits an unbound artifact", () => {
    const audit = freshAudit();
    markNotFresh(audit, { unbound: true, status: "missing" });
    audit.staleArtifactCount = 0;
    putJson(auditPath, audit);
    expect(expectVerdict("unproven").detail).toContain("staleArtifactCount=0 disagrees with 1");
  });

  it.each(["stale", "staleCount"])("does not let current count hide a conflicting legacy %s count", (key) => {
    const audit = freshAudit();
    audit[key] = 1;
    putJson(auditPath, audit);
    expect(expectVerdict("unproven").detail).toContain(`${key}=1 disagrees with 0`);
  });

  it("accepts agreeing current and legacy aggregates without using precedence to hide conflicts", () => {
    const audit = freshAudit();
    audit.stale = 0;
    audit.staleCount = 0;
    audit.artifacts[0]!.stale = false;
    putJson(auditPath, audit);
    expectVerdict("pass");
  });

  it.each(["stale", "staleCount"] as const)("rejects a legacy %s count without current proof", (key) => {
    putJson(auditPath, legacyAudit(key));
    expect(expectVerdict("unproven").detail).toContain("legacy audit lacks");
  });

  it("rejects a legacy aggregate even with explicit current-style artifact verdicts", () => {
    const audit = legacyAudit("staleCount");
    audit.artifacts = [published, secondPublished].map((id) => ({
      artifact: artifactPath(id),
      fresh: true,
      unbound: false
    }));
    putJson(auditPath, audit);
    expectVerdict("unproven");
  });

  it("rejects legacy per-artifact stale flags without current proof", () => {
    putJson(auditPath, legacyAudit());
    expectVerdict("unproven");
  });

  it("fails for a legacy stale artifact when its aggregate agrees", () => {
    const audit = legacyAudit("staleCount");
    audit.artifacts[0]!.stale = true;
    audit.staleCount = 1;
    putJson(auditPath, audit);
    expect(expectVerdict("fail").detail).toContain(artifactPath(published));
  });

  it("fails for an unbound legacy artifact even when its stale flag is false", () => {
    const audit = legacyAudit();
    audit.artifacts[0]!.unbound = true;
    putJson(auditPath, audit);
    expect(expectVerdict("fail").detail).toContain("(unbound)");
  });

  it("does not assume a legacy stale=false verdict means the binding is present", () => {
    const audit = legacyAudit("stale");
    delete audit.artifacts[0]!.unbound;
    putJson(auditPath, audit);
    expect(expectVerdict("unproven").detail).toContain("missing a boolean unbound verdict");
  });

  it("rejects an older 1.0 producer report without the retiredRoutes field", () => {
    const audit = freshAudit();
    delete audit.retiredRoutes;
    putJson(auditPath, audit);
    expectVerdict("unproven");
  });

  it("rejects a compact producer audit without dependency-bound input proof", () => {
    const audit = freshAudit();
    delete audit.inputProof;
    putJson(auditPath, audit);
    expect(expectVerdict("unproven").detail).toContain("lacks dependency-bound input proof");
  });

  it("does not audit or approve retired and frozen historical probes", () => {
    const retiredBefore = readFileSync(join(root, artifactPath(retired)), "utf8");
    const frozenBefore = readFileSync(join(root, artifactPath(frozen)), "utf8");
    putJson(auditPath, freshAudit());
    expectVerdict("pass");
    expect(readFileSync(join(root, artifactPath(retired)), "utf8")).toBe(retiredBefore);
    expect(readFileSync(join(root, artifactPath(frozen)), "utf8")).toBe(frozenBefore);
  });

  it("ignores unreadable retired and frozen probes when checking current evidence", () => {
    put(artifactPath(retired), "{ historical, not current");
    put(artifactPath(frozen), "{ deliberately frozen");
    putJson(auditPath, freshAudit());
    expectVerdict("pass");
    expect(readFileSync(join(root, artifactPath(retired)), "utf8")).toBe("{ historical, not current");
    expect(readFileSync(join(root, artifactPath(frozen)), "utf8")).toBe("{ deliberately frozen");
  });

  it("fails on published stale evidence even if retired evidence claims approval", () => {
    const audit = freshAudit();
    markNotFresh(audit);
    putJson(auditPath, audit);
    const check = expectVerdict("fail");
    expect(check.detail).toContain(artifactPath(published));
    expect(check.detail).not.toContain(artifactPath(retired));
  });

  it("rejects a fresh targeted subset instead of treating it as a full published audit", () => {
    const audit = freshAudit();
    audit.artifacts.pop();
    putJson(auditPath, audit);
    expect(expectVerdict("unproven").detail).toContain(`missing: ${artifactPath(secondPublished)}`);
  });

  it.each([retired, frozen, noProbe])("rejects %s as an unexpected audited artifact", (id) => {
    const audit = freshAudit();
    audit.artifacts.push({ artifact: artifactPath(id), fresh: true, unbound: false, reasons: [], producerConflicts: [] });
    putJson(auditPath, audit);
    expect(expectVerdict("unproven").detail).toContain(`unexpected: ${artifactPath(id)}`);
  });

  it("rejects retired metadata that contradicts the published route registry", () => {
    const audit = freshAudit();
    audit.retiredRoutes = [published];
    putJson(auditPath, audit);
    expect(expectVerdict("unproven").detail).toContain("retiredRoutes disagrees");
  });

  it.each(["published", "requiresRoutePrimaryProbe"])("rejects malformed route selection flag %s", (key) => {
    const path = "tools/showcase-library/route-gates.json";
    const gates = JSON.parse(readFileSync(join(root, path), "utf8")) as { routes: Record<string, unknown>[] };
    gates.routes[0]![key] = "true";
    putJson(path, gates);
    putJson(auditPath, freshAudit());
    expect(expectVerdict("unproven").detail).toContain("missing or malformed selection flags");
  });

  it("accepts the full synthetic audit, rejects its targeted subset, and fails after a source change", () => {
    const fresh = freshAudit();
    putJson(auditPath, fresh);
    expect(fresh.staleArtifactCount).toBe(0);
    expect(fresh.artifacts).toMatchObject([
      { artifact: artifactPath(published), fresh: true, unbound: false },
      { artifact: artifactPath(secondPublished), fresh: true, unbound: false }
    ]);
    expectVerdict("pass");

    const targeted = runExplainer("--route", published);
    expect(targeted.staleArtifactCount).toBe(0);
    expect(targeted.artifacts).toHaveLength(1);
    expect(expectVerdict("unproven").detail).toContain(`missing: ${artifactPath(secondPublished)}`);

    putJson(auditPath, fresh);
    put(`apps/${published}/main.ts`, "export const syntheticScene = 'changed';\n");
    expect(expectVerdict("fail").detail).toContain(artifactPath(published));
    const stale = runExplainer();
    expect(stale.staleArtifactCount).toBe(1);
    expect(stale.artifacts[0]).toMatchObject({
      artifact: artifactPath(published),
      fresh: false,
      unbound: false,
      reasons: [expect.objectContaining({ kind: "route-source", status: "mismatch" })]
    });
    expect(expectVerdict("fail").detail).toContain(artifactPath(published));
  }, 20_000);

  it.each([
    ["renderer", () => put("packages/engine/src/agent-api/index.ts", "export const syntheticRenderer = 2;\n")],
    ["route source", () => put(`apps/${published}/main.ts`, "export const syntheticScene = 2;\n")],
    ["route health", () => putJson(`apps/${published}/route-health.json`, { state: "changed" })],
    ["gate config", () => {
      const path = "tools/showcase-library/route-gates.json";
      put(path, `${readFileSync(join(root, path), "utf8")}\n`);
    }],
    ["primary asset", () => putJson("aura.assets.json", {
      assets: [{ id: "syntheticHero", hash: `sha256-${"f".repeat(64)}` }]
    })],
    ["screenshot", () => put(`${probeDir}/${published}.png`, "changed synthetic screenshot")],
    ["missing probe", () => rmSync(join(root, artifactPath(published)))],
    ["missing screenshot", () => rmSync(join(root, `${probeDir}/${published}.png`))]
  ])("rejects a previously green cached audit after %s changes without refreshing it", (_name, mutate) => {
    putJson(auditPath, freshAudit());
    expectVerdict("pass");
    const retained = readFileSync(join(root, auditPath), "utf8");
    mutate();
    const result = runGate();
    expect(["fail", "unproven"]).toContain(result.check.status);
    expect(result.status).toBe(1);
    expect(readFileSync(join(root, auditPath), "utf8"), "the gate must not rewrite its input audit").toBe(retained);
  }, 20_000);

  it("reports an unreadable explainer as unproven rather than trusting the cached audit", () => {
    putJson(auditPath, freshAudit());
    rmSync(join(root, explainerScript));
    expect(expectVerdict("unproven").detail).toContain("cannot recompute current freshness audit");
  });

  it("records an unreadable required probe rather than crashing or trusting the cached audit", () => {
    putJson(auditPath, freshAudit());
    put(artifactPath(published), "{ invalid JSON");
    const result = runGate();
    expect(["fail", "unproven"]).toContain(result.check.status);
    expect(result.check.detail).toContain(artifactPath(published));
    expect(result.status).toBe(1);
    expect(result.report.totals.unproven).toBeGreaterThan(0);
  });

  it("rejects invalid explainer output rather than trusting the cached audit", () => {
    putJson(auditPath, freshAudit());
    put(explainerScript, "console.log('not JSON');\n");
    expect(expectVerdict("unproven").detail).toContain("explainer returned invalid JSON");
  });

  it.each(["ownershipConflicts", "orderingCycles"])("rejects a cached audit with %s", (key) => {
    const audit = freshAudit();
    audit[key] = [{ synthetic: "conflict" }];
    putJson(auditPath, audit);
    expect(expectVerdict("fail").detail).toContain("ownership conflicts or ordering cycles");
  });

  it("rejects producer-shaped probes with missing required binding dimensions", () => {
    putJson(auditPath, freshAudit());
    const path = artifactPath(published);
    const probe = JSON.parse(readFileSync(join(root, path), "utf8")) as {
      freshness: { dependencies: { kind: string }[] };
    };
    probe.freshness.dependencies = probe.freshness.dependencies.filter((entry) => entry.kind !== "route-health");
    putJson(path, probe);
    expect(expectVerdict("fail").detail).toContain(artifactPath(published));
  });

  it("rejects a missing health file even if the probe also omits its health dependency", () => {
    putJson(auditPath, freshAudit());
    const path = artifactPath(published);
    const probe = JSON.parse(readFileSync(join(root, path), "utf8")) as {
      freshness: { dependencies: { kind: string }[] };
    };
    probe.freshness.dependencies = probe.freshness.dependencies.filter((entry) => entry.kind !== "route-health");
    putJson(path, probe);
    rmSync(join(root, `apps/${published}/route-health.json`));
    const live = spawnSync(process.execPath, [join(root, explainerScript), "--root", root, "--json"], {
      cwd: root, encoding: "utf8"
    });
    expect(live.status, live.stderr).toBe(0);
    expect((JSON.parse(live.stdout) as Audit).staleArtifactCount).toBe(0);
    expect(expectVerdict("unproven").detail).toContain("missing route, gate, health or renderer sources");
  });

  it("rejects an omitted screenshot even when the compact explainer verdict is fresh", () => {
    putJson(auditPath, freshAudit());
    const path = artifactPath(published);
    const probe = JSON.parse(readFileSync(join(root, path), "utf8")) as Record<string, unknown>;
    delete probe.renderedProbe;
    putJson(path, probe);
    rmSync(join(root, `${probeDir}/${published}.png`));
    const live = spawnSync(process.execPath, [join(root, explainerScript), "--root", root, "--json"], {
      cwd: root, encoding: "utf8"
    });
    expect(live.status, live.stderr).toBe(0);
    expect((JSON.parse(live.stdout) as Audit).staleArtifactCount).toBe(0);
    expect(expectVerdict("unproven").detail).toContain("lacks a screenshot binding");
  });

  it("rejects a changed producer identity even when dependency hashes still match", () => {
    putJson(auditPath, freshAudit());
    const path = artifactPath(published);
    const probe = JSON.parse(readFileSync(join(root, path), "utf8")) as {
      freshness: { producer: { id: string } };
    };
    probe.freshness.producer.id = "not-the-producer";
    putJson(path, probe);
    expect(expectVerdict("fail").detail).toContain("producer identity or fingerprint");
  });

  it("rejects a cached renderer fingerprint that does not match a fresh current audit", () => {
    const audit = freshAudit();
    audit.rendererFingerprint = `sha256-${"f".repeat(64)}`;
    putJson(auditPath, audit);
    expect(expectVerdict("fail").detail).toContain("renderer fingerprint differs");
  });

  it("rejects a replaced probe even when its current dependency verdict remains fresh", () => {
    putJson(auditPath, freshAudit());
    expectVerdict("pass");
    const path = artifactPath(published);
    const probe = JSON.parse(readFileSync(join(root, path), "utf8")) as {
      renderer: { drawCalls: number };
    };
    probe.renderer.drawCalls += 1;
    putJson(path, probe);
    expect(expectVerdict("fail").detail).toContain("input proof differs");
  }, 20_000);

  it("rejects an old audit after a changed source is rebound into a newly fresh probe", async () => {
    putJson(auditPath, freshAudit());
    expectVerdict("pass");
    put(`apps/${published}/main.ts`, "export const syntheticScene = 'new capture';\n");
    const producer = await import(
      /* @vite-ignore */ pathToFileURL(join(root, "tools/showcase-library/route-primary-probes.mjs")).href
    ) as ProbeModule;
    const path = artifactPath(published);
    const probe = JSON.parse(readFileSync(join(root, path), "utf8")) as {
      sourceHash: string;
      freshness: { dependencies: { kind: string; hash: string }[] };
    };
    probe.sourceHash = producer.createRouteSourceHash(published, root);
    probe.freshness.dependencies.find((entry) => entry.kind === "route-source")!.hash = probe.sourceHash;
    putJson(path, probe);
    const live = spawnSync(process.execPath, [join(root, explainerScript), "--root", root, "--json"], {
      cwd: root, encoding: "utf8"
    });
    expect(live.status, live.stderr).toBe(0);
    expect((JSON.parse(live.stdout) as Audit).staleArtifactCount).toBe(0);
    expect(expectVerdict("fail").detail).toContain("input proof differs");
  }, 20_000);

  it("consumes the real explainer's unbound published verdicts in a temporary synthetic repository", () => {
    for (const id of [published, secondPublished]) rmSync(join(root, artifactPath(id)));
    const audit = runExplainer();
    expect(audit.staleArtifactCount).toBe(2);
    expect(audit.artifacts).toMatchObject([
      { artifact: artifactPath(published), fresh: false, unbound: true },
      { artifact: artifactPath(secondPublished), fresh: false, unbound: true }
    ]);
    expect(audit.retiredRoutes).toEqual([retired]);
    expect(audit.frozenRoutes).toEqual([frozen]);
    const check = expectVerdict("fail");
    expect(check.detail).toContain(artifactPath(published));
    expect(check.detail).toContain(artifactPath(secondPublished));
    expect(check.detail).not.toContain(artifactPath(retired));
  });
});
