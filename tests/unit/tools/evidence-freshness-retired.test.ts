import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const explainer = resolve(repoRoot, "tools/evidence-freshness/explain-staleness.mjs");
const gatePath = "tools/showcase-library/route-gates.json";
const producerPath = "tools/showcase-library/route-primary-probes.mjs";
const reportDir = "tests/reports/showcase-route-primary-probes";

const publishedMissing = "showcase-published-missing";
const publishedForced = "showcase-published-forced";
const publishedCurrent = "showcase-published-current";
const publishedNoProbe = "showcase-published-no-probe";
const retiredMissing = "showcase-retired-missing";
const retiredWithProbe = "showcase-retired-with-probe";
const retiredNoProbe = "showcase-retired-no-probe";
const frozen = "showcase-frozen";
const retiredFrozen = "showcase-retired-frozen";

interface Route {
  id: string;
  label: string;
  path: string;
  globalName: string;
  published: boolean;
  releaseClass: string;
  primaryAssets: string[];
  primaryAssetRoles?: Record<string, string>;
  routePrimaryHeroAsset?: string;
  secondaryPrimaryAssets?: string[];
  primitiveBudget: number;
  requiresTypedPrimaryAssets: boolean;
  requiresRoutePrimaryProbe?: boolean;
  retainedEvidenceFrozen?: boolean;
}

interface ProbeModule {
  ROUTE_PRIMARY_PROBE_PRODUCER_VERSION: string;
  routePrimaryProbeExpectedRouteIds(routes: readonly Route[]): string[];
  createRouteSourceHash(routeId: string, root: string): string;
  hashRouteHealthDependency(path: string): string;
}

interface FreshnessModule {
  sha256(value: string | Buffer): string;
  createRendererFingerprint(root: string): string;
  createProducerFingerprint(path: string, version: string, root: string): string;
  createConfigFingerprint(config: unknown): string;
  createFreshnessBinding(options: Record<string, unknown>): unknown;
}

interface Artifact {
  artifact: string;
  fresh: boolean;
  unbound: boolean;
  reasons: { kind: string; id: string; status: string; detail: string }[];
}

interface Audit {
  schema: string;
  frozenRoutes: string[];
  retiredRoutes: string[];
  artifacts: Artifact[];
  staleArtifactCount: number;
}

function route(
  id: string,
  options: { published?: boolean; assets?: string[]; requiresProbe?: boolean; frozen?: boolean } = {}
): Route {
  const assets = options.assets ?? [];
  return {
    id,
    label: id,
    path: `/apps/${id}/`,
    globalName: `__${id.replaceAll("-", "_").toUpperCase()}__`,
    published: options.published ?? true,
    releaseClass: options.frozen ? "game-layer-diagnostic" : "internal-diagnostic",
    primaryAssets: assets,
    ...(assets.length > 0 ? {
      primaryAssetRoles: Object.fromEntries(assets.map((asset) => [asset, "hero"])),
      routePrimaryHeroAsset: assets[0],
      secondaryPrimaryAssets: assets.slice(1)
    } : {}),
    primitiveBudget: 0,
    requiresTypedPrimaryAssets: assets.length > 0,
    ...(options.requiresProbe !== undefined ? { requiresRoutePrimaryProbe: options.requiresProbe } : {}),
    ...(options.frozen ? { retainedEvidenceFrozen: true } : {})
  };
}

function artifactPath(id: string): string {
  return `${reportDir}/${id}.json`;
}

describe("explain-staleness retired routes", () => {
  let root: string;
  let routes: Route[];
  let producer: ProbeModule;
  let freshness: FreshnessModule;

  function put(path: string, contents: string | Buffer): void {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }

  function writeGates(value: unknown): void {
    put(gatePath, `${JSON.stringify(value, null, 2)}\n`);
  }

  function run(...flags: string[]) {
    const result = spawnSync(process.execPath, [explainer, "--root", root, ...flags], {
      cwd: root,
      encoding: "utf8"
    });
    if (result.error) throw result.error;
    return result;
  }

  function audit(...flags: string[]): Audit {
    const result = run("--json", ...flags);
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout) as Audit;
  }

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "aura3d-freshness-retired-"));
    // Copy the real producer and its imports, not the repository's mutable reports or gates.
    for (const path of [
      producerPath,
      "tools/showcase-library/route-gates.mjs",
      "tools/showcase-library/png-foreground.mjs",
      "tools/evidence-freshness/index.mjs"
    ]) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(resolve(repoRoot, path), target);
    }
    producer = await import(/* @vite-ignore */ pathToFileURL(join(root, producerPath)).href) as ProbeModule;
    freshness = await import(
      /* @vite-ignore */ pathToFileURL(join(root, "tools/evidence-freshness/index.mjs")).href
    ) as FreshnessModule;

    routes = [
      route(publishedMissing, { assets: ["hero"], requiresProbe: false }),
      route(publishedForced, { requiresProbe: true }),
      route(publishedCurrent, { assets: ["hero"] }),
      route(publishedNoProbe),
      route(retiredMissing, { published: false, assets: ["hero"] }),
      route(retiredWithProbe, { published: false, assets: ["hero"] }),
      route(retiredNoProbe, { published: false }),
      route(frozen, { assets: ["hero"], frozen: true }),
      route(retiredFrozen, { published: false, assets: ["hero"], frozen: true })
    ];
    writeGates({ schema: "aura3d-showcase-route-gates/1.0", routes });

    // Even a retained record claiming approval must never become a live freshness verdict.
    for (const id of [retiredWithProbe, frozen, retiredFrozen]) {
      put(artifactPath(id), JSON.stringify({ fresh: true, pass: true, humanVisualApproval: true }));
    }

    // A fully bound synthetic published probe proves the filter does not just make everything unbound.
    const sourcePath = `apps/${publishedCurrent}/main.ts`;
    const healthPath = `apps/${publishedCurrent}/route-health.json`;
    const screenshotPath = `${reportDir}/${publishedCurrent}.png`;
    const screenshot = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aWQAAAAASUVORK5CYII=",
      "base64"
    );
    const assetHash = freshness.sha256("synthetic hero");
    const viewport = { width: 640, height: 480 };
    put(sourcePath, "export const syntheticScene = 1;\n");
    put(healthPath, JSON.stringify({ state: "ready" }));
    put("packages/engine/src/agent-api/index.ts", "export const syntheticRenderer = 1;\n");
    put("aura.assets.json", JSON.stringify({ assets: [{ id: "hero", hash: assetHash }] }));
    put(screenshotPath, screenshot);
    const producerFingerprint = freshness.createProducerFingerprint(
      producerPath, producer.ROUTE_PRIMARY_PROBE_PRODUCER_VERSION, root
    );
    const dependencies = [
      { kind: "route-source", id: publishedCurrent, hash: producer.createRouteSourceHash(publishedCurrent, root) },
      { kind: "route-gate-config", id: "route-gates.json", hash: freshness.sha256(readFileSync(join(root, gatePath))) },
      { kind: "route-health", id: `${publishedCurrent}/route-health.json`, hash: producer.hashRouteHealthDependency(join(root, healthPath)) },
      { kind: "primary-asset", id: "hero", hash: assetHash },
      { kind: "renderer-fingerprint", id: "agent-api+assets", hash: freshness.createRendererFingerprint(root) },
      { kind: "producer-version", id: "route-primary-probes", hash: producerFingerprint },
      { kind: "viewport-contract", id: publishedCurrent, hash: freshness.createConfigFingerprint(viewport) },
      { kind: "screenshot", id: `${publishedCurrent}.png`, hash: freshness.sha256(screenshot) }
    ];
    const binding = freshness.createFreshnessBinding({
      artifact: artifactPath(publishedCurrent),
      producerId: "route-primary-probes",
      producerVersion: producer.ROUTE_PRIMARY_PROBE_PRODUCER_VERSION,
      producerFingerprint,
      generatedAt: "2026-01-01T00:00:00.000Z",
      dependencies
    });
    put(artifactPath(publishedCurrent), JSON.stringify({
      primaryAssets: [{ id: "hero", manifestHash: assetHash }],
      renderedProbe: { sha256: freshness.sha256(screenshot) },
      viewport,
      freshness: binding
    }));
  });

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("audits exactly the producer's published, required, non-frozen routes", () => {
    const report = audit();
    expect(report.schema).toBe("aura3d-explain-staleness/1.0");
    expect(report.artifacts.map((artifact) => artifact.artifact)).toEqual(
      producer.routePrimaryProbeExpectedRouteIds(routes).map(artifactPath)
    );
    expect(report.artifacts.map((artifact) => artifact.artifact)).toEqual([
      artifactPath(publishedMissing), artifactPath(publishedForced), artifactPath(publishedCurrent)
    ]);
    expect(report.retiredRoutes).toEqual([retiredMissing, retiredWithProbe, retiredNoProbe, retiredFrozen]);
    expect(report.frozenRoutes).toEqual([frozen, retiredFrozen]);
    expect(report.staleArtifactCount).toBe(2);
    for (const id of [publishedMissing, publishedForced]) {
      expect(report.artifacts.find((artifact) => artifact.artifact === artifactPath(id))).toMatchObject({
        fresh: false,
        unbound: true,
        reasons: [{ id: "freshness-binding", status: "missing" }]
      });
    }
    expect(report.artifacts.find((artifact) => artifact.artifact === artifactPath(publishedCurrent)))
      .toMatchObject({ fresh: true, unbound: false, reasons: [] });
    for (const id of [...report.retiredRoutes, ...report.frozenRoutes]) {
      expect(report.artifacts.some((artifact) => artifact.artifact === artifactPath(id))).toBe(false);
    }
  });

  it("does not relax freshness checks for a published probe", () => {
    put(`apps/${publishedCurrent}/main.ts`, "export const syntheticScene = 2;\n");
    const report = audit("--route", publishedCurrent);
    expect(report.staleArtifactCount).toBe(1);
    expect(report.artifacts).toHaveLength(1);
    expect(report.artifacts[0]).toMatchObject({ artifact: artifactPath(publishedCurrent), fresh: false });
    expect(report.artifacts[0].reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "route-source", id: publishedCurrent, status: "mismatch" })
    ]));
  });

  it("treats a malformed published probe as unbound rather than current", () => {
    put(artifactPath(publishedMissing), "{not valid json");
    const report = audit("--route", publishedMissing);
    expect(report.artifacts).toMatchObject([{ fresh: false, unbound: true }]);
    expect(report.staleArtifactCount).toBe(1);
  });

  it("labels retired and frozen probes as historical, not audited or approved, in text", () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`retired (unpublished; any retained evidence is historical, not audited or approved): ${retiredMissing}, ${retiredWithProbe}, ${retiredNoProbe}, ${retiredFrozen}`);
    expect(result.stdout).toContain(`frozen (evidence deliberately preserved, not regenerated; historical, not audited or approved): ${frozen}, ${retiredFrozen}`);
    expect(result.stdout).toContain(`UNBOUND ${artifactPath(publishedMissing)}`);
    expect(result.stdout).toContain(`FRESH   ${artifactPath(publishedCurrent)}`);
    for (const id of [retiredMissing, retiredWithProbe, retiredNoProbe, frozen, retiredFrozen]) {
      expect(result.stdout).not.toContain(artifactPath(id));
    }
    expect(result.stdout).toContain("2 of 3 artifact(s) are not provably current.");
  });

  it.each([
    { id: publishedMissing, artifacts: [publishedMissing], retired: [], frozen: [], stale: 1 },
    { id: publishedForced, artifacts: [publishedForced], retired: [], frozen: [], stale: 1 },
    { id: publishedCurrent, artifacts: [publishedCurrent], retired: [], frozen: [], stale: 0 },
    { id: publishedNoProbe, artifacts: [], retired: [], frozen: [], stale: 0 },
    { id: retiredMissing, artifacts: [], retired: [retiredMissing], frozen: [], stale: 0 },
    { id: retiredWithProbe, artifacts: [], retired: [retiredWithProbe], frozen: [], stale: 0 },
    { id: retiredNoProbe, artifacts: [], retired: [retiredNoProbe], frozen: [], stale: 0 },
    { id: frozen, artifacts: [], retired: [], frozen: [frozen], stale: 0 },
    { id: retiredFrozen, artifacts: [], retired: [retiredFrozen], frozen: [retiredFrozen], stale: 0 }
  ])("respects --route $id across all result categories", ({ id, artifacts, retired, frozen: frozenIds, stale }) => {
    const report = audit("--route", id);
    expect(report.artifacts.map((artifact) => artifact.artifact)).toEqual(artifacts.map(artifactPath));
    expect(report.retiredRoutes).toEqual(retired);
    expect(report.frozenRoutes).toEqual(frozenIds);
    expect(report.staleArtifactCount).toBe(stale);
    const result = run("--route", id);
    expect(result.status, result.stderr).toBe(0);
    for (const other of routes.filter((entry) => entry.id !== id)) {
      expect(result.stdout).not.toContain(other.id);
    }
  });

  it("retains retired classification alongside all published verdicts in an isolated synthetic audit", () => {
    const result = run("--json", "--write");
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as Audit;
    const retained = JSON.parse(readFileSync(join(root, "tests/reports/evidence-freshness/staleness-audit.json"), "utf8"));
    expect(retained).toEqual(report);
    expect(report.retiredRoutes).toEqual([retiredMissing, retiredWithProbe, retiredNoProbe, retiredFrozen]);
    expect(report.frozenRoutes).toEqual([frozen, retiredFrozen]);
    expect(report.artifacts.map((artifact) => artifact.artifact)).toEqual(
      [publishedMissing, publishedForced, publishedCurrent].map(artifactPath)
    );
    expect(report.staleArtifactCount).toBe(2);
    expect(result.stdout).not.toContain("humanVisualApproval");
  });

  it.each([
    {
      name: "missing routes array",
      mutate: (doc: { schema?: string; routes?: Record<string, unknown>[] }) => { delete doc.routes; },
      message: /must contain a routes array/
    },
    {
      name: "empty routes array",
      mutate: (doc: { routes?: Record<string, unknown>[] }) => { doc.routes = []; },
      message: /must contain at least one route/
    },
    {
      name: "unsupported gate schema",
      mutate: (doc: { schema?: string; routes?: Record<string, unknown>[] }) => { doc.schema = "unknown"; },
      message: /unsupported schema/
    },
    {
      name: "missing route id",
      mutate: (doc: { routes?: Record<string, unknown>[] }) => { delete doc.routes![5].id; },
      message: /missing id/
    },
    {
      name: "missing publication flag",
      mutate: (doc: { routes?: Record<string, unknown>[] }) => { delete doc.routes![0].published; },
      message: /published as a boolean/
    },
    {
      name: "non-boolean retirement flag",
      mutate: (doc: { routes?: Record<string, unknown>[] }) => { doc.routes![5].published = "false"; },
      message: /published as a boolean/
    },
    {
      name: "malformed primary assets",
      mutate: (doc: { routes?: Record<string, unknown>[] }) => { doc.routes![5].primaryAssets = null; },
      message: /must define primaryAssets/
    },
    {
      name: "malformed required-probe flag",
      mutate: (doc: { routes?: Record<string, unknown>[] }) => { doc.routes![1].requiresRoutePrimaryProbe = "true"; },
      message: /requiresRoutePrimaryProbe must be a boolean/
    },
    {
      name: "malformed freeze flag",
      mutate: (doc: { routes?: Record<string, unknown>[] }) => { doc.routes![7].retainedEvidenceFrozen = "true"; },
      message: /retainedEvidenceFrozen must be a boolean/
    },
    {
      name: "freeze on a promoted route",
      mutate: (doc: { routes?: Record<string, unknown>[] }) => {
        doc.routes![0].releaseClass = "release-ready candidate";
        doc.routes![0].retainedEvidenceFrozen = true;
      },
      message: /cannot set retainedEvidenceFrozen/
    }
  ])("rejects $name even under a targeted filter", ({ mutate, message }) => {
    const document = JSON.parse(readFileSync(join(root, gatePath), "utf8")) as {
      schema?: string;
      routes?: Record<string, unknown>[];
    };
    mutate(document);
    writeGates(document);
    const result = run("--json", "--route", publishedMissing);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(message);
    expect(result.stdout).toBe("");
  });

  it("fails on missing or invalid gate metadata instead of emitting an empty clean report", () => {
    rmSync(join(root, gatePath));
    let result = run("--json");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/route-gates\.json/);
    expect(result.stdout).toBe("");

    put(gatePath, "{invalid json");
    result = run("--json");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Cannot read valid route gate metadata/);
    expect(result.stdout).toBe("");
  });

  it("fails if the authoritative producer or its required metadata and helpers are unavailable", () => {
    rmSync(join(root, producerPath));
    let result = run("--json");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/route-primary-probes\.mjs/);
    expect(result.stdout).toBe("");

    put(producerPath, 'export const ROUTE_PRIMARY_PROBE_PRODUCER_VERSION = "1.1";\n');
    result = run("--json");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/producer metadata is unavailable or malformed/);
    expect(result.stdout).toBe("");

    put(producerPath, [
      'export const ROUTE_PRIMARY_PROBE_PRODUCER_VERSION = "1.1";',
      "export function routePrimaryProbeExpectedRouteIds() { return []; }"
    ].join("\n"));
    result = run("--json");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/producer metadata is unavailable or malformed/);
    expect(result.stdout).toBe("");

    put(producerPath, "export function routePrimaryProbeExpectedRouteIds() { return []; }\n");
    result = run("--json");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/producer metadata is unavailable or malformed/);
    expect(result.stdout).toBe("");
  });

  it("rejects unknown and missing --route values instead of reporting an empty audit", () => {
    let result = run("--json", "--route", "showcase-unknown");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/no route matching --route showcase-unknown/);
    expect(result.stdout).toBe("");

    result = run("--json", "--route");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/--route requires a value/);
    expect(result.stdout).toBe("");
  });
});
