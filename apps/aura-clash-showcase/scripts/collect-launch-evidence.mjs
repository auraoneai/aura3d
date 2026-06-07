#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const defaultOrigin = "https://aura3d.auraone.ai";
const origin = normalizeOrigin(process.env.AURA_CLASH_ORIGIN ?? defaultOrigin);
const canonicalBasePath = normalizePath(process.env.AURA_CLASH_BASE_PATH ?? "/showcase/aura-clash");
const appBasePath = normalizePath(process.env.AURA_CLASH_APP_BASE_PATH ?? "/apps/aura-clash-showcase");
const outPath = resolve(
  appRoot,
  process.env.AURA_CLASH_LAUNCH_EVIDENCE_OUT ?? "launch-evidence/deployed-routes.json"
);

if (process.env.AURA_CLASH_CONTEXTUAL_EVIDENCE_ONLY === "1") {
  writeAuraClash106Evidence(null);
  console.log("Aura Clash 1.0.6 contextual launch evidence written.");
  process.exit(0);
}

const prdGates = [
  {
    id: "deployed-route-and-glb-200",
    prdLineHint: 465,
    prdLabel: "Confirm deployed route and GLB URLs return 200.",
    artifact: "apps/aura-clash-showcase/launch-evidence/deployed-routes.json",
    requiredKinds: ["route", "glb"]
  },
  {
    id: "deployed-route-confirmed",
    prdLineHint: 494,
    prdLabel: "Deployed route confirmed.",
    artifact: "apps/aura-clash-showcase/launch-evidence/deployed-routes.json",
    requiredKinds: ["route", "metadata", "glb"]
  }
];

const requiredRoutes = [
  "/",
  "/playable/",
  "/evidence/",
  "/accessibility/",
  "/deploy-check/",
  "/poster/"
];

const manifestPath = resolve(appRoot, "aura.assets.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const runtimeAssetPaths = collectRuntimeAssetPaths(manifest);
const glbPaths = runtimeAssetPaths.filter((publicPath) => publicPath.endsWith(".glb"));
const audioPaths = runtimeAssetPaths.filter((publicPath) => /\.(ogg|mp3|wav)$/i.test(publicPath));

if (glbPaths.length === 0) {
  throw new Error(`No GLB public paths found in ${manifestPath}`);
}

const routeTargets = requiredRoutes.map((route) => ({
  kind: "route",
  label: `${canonicalBasePath}${route}`,
  url: toUrl(origin, canonicalBasePath, route)
}));

const metadataTargets = [
  {
    kind: "metadata",
    label: "/robots.txt",
    url: toUrl(origin, "", "/robots.txt")
  },
  {
    kind: "metadata",
    label: "/sitemap.xml",
    url: toUrl(origin, "", "/sitemap.xml")
  },
  {
    kind: "metadata",
    label: `${canonicalBasePath}/sitemap.xml`,
    url: toUrl(origin, canonicalBasePath, "/sitemap.xml")
  },
  {
    kind: "metadata",
    label: `${canonicalBasePath}/robots.txt`,
    url: toUrl(origin, canonicalBasePath, "/robots.txt")
  }
];

const glbTargets = glbPaths.map((publicPath) => ({
  kind: "glb",
  label: `/${publicPath}`,
  url: toUrl(origin, "", publicPath)
}));

const audioTargets = audioPaths.map((publicPath) => ({
  kind: "audio",
  label: `/${publicPath}`,
  url: toUrl(origin, "", publicPath)
}));

const startedAt = new Date().toISOString();
const results = [];

for (const target of [...routeTargets, ...metadataTargets, ...glbTargets, ...audioTargets]) {
  results.push(await probeTarget(target));
}

const failed = results.filter((result) => !result.ok);
const kindStatus = summarizeKindStatus(results);
const evidence = {
  generatedAt: new Date().toISOString(),
  startedAt,
  origin,
  canonicalBasePath,
  appBasePath,
  manifestPath,
  routeCount: routeTargets.length,
  metadataCount: metadataTargets.length,
  manifestGlbCount: glbPaths.length,
  manifestAudioCount: audioPaths.length,
  targetCount: results.length,
  ok: failed.length === 0,
  failedCount: failed.length,
  kindStatus,
  prdGateCoverage: createPrdGateCoverage(kindStatus),
  results
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
writeAuraClash106Evidence(evidence);

if (failed.length > 0) {
  console.error(`Aura Clash launch evidence failed for ${failed.length} target(s).`);
  console.error(`Evidence written to ${outPath}`);
  process.exit(1);
}

console.log(`Aura Clash launch evidence passed for ${results.length} target(s).`);
console.log(`Evidence written to ${outPath}`);

function normalizeOrigin(value) {
  return value.replace(/\/+$/, "");
}

function normalizePath(value) {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

function toUrl(baseOrigin, basePath, leafPath) {
  const normalizedLeaf = leafPath.startsWith("/") ? leafPath : `/${leafPath}`;
  return `${baseOrigin}${basePath}${normalizedLeaf}`.replace(/([^:]\/)\/+/g, "$1");
}

function collectRuntimeAssetPaths(assetManifest) {
  const paths = [];
  for (const asset of assetManifest.assets ?? []) {
    if (!asset || typeof asset !== "object") continue;
    if (typeof asset.url !== "string") continue;
    if (!/\.(glb|ogg|mp3|wav)$/i.test(asset.url)) continue;
    paths.push(asset.url.replace(/^\/+/, ""));
  }
  return Array.from(new Set(paths)).sort();
}

async function probeTarget(target) {
  const started = Date.now();

  try {
    const response = await fetch(target.url, {
      method: "GET",
      redirect: "follow"
    });

    const contentLength = response.headers.get("content-length");
    const contentType = response.headers.get("content-type");
    const body = await response.arrayBuffer();
    const byteLength = body.byteLength;
    const ok =
      response.status === 200 &&
      (!["glb", "audio"].includes(target.kind) || byteLength > 0 || Number(contentLength ?? 0) > 0);

    return {
      ...target,
      ok,
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      contentType,
      contentLength: contentLength ? Number(contentLength) : null,
      byteLength,
      durationMs: Date.now() - started
    };
  } catch (error) {
    return {
      ...target,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started
    };
  }
}

function summarizeKindStatus(targetResults) {
  return Object.fromEntries(
    ["route", "metadata", "glb", "audio"].map((kind) => {
      const matching = targetResults.filter((result) => result.kind === kind);
      const failed = matching.filter((result) => !result.ok);
      return [
        kind,
        {
          ok: matching.length > 0 && failed.length === 0,
          total: matching.length,
          failed: failed.length
        }
      ];
    })
  );
}

function createPrdGateCoverage(statusByKind) {
  return prdGates.map((gate) => ({
    ...gate,
    ok: gate.requiredKinds.every((kind) => statusByKind[kind]?.ok === true),
    requiredKindStatus: Object.fromEntries(
      gate.requiredKinds.map((kind) => [kind, statusByKind[kind] ?? { ok: false, total: 0, failed: 0 }])
    )
  }));
}

function writeAuraClash106Evidence(deployedEvidence) {
  const evidenceDir = resolve(appRoot, "launch-evidence");
  mkdirSync(evidenceDir, { recursive: true });

  const screenshots = [
    {
      id: "first-frame",
      source: resolve(evidenceDir, "aura-clash-arena-first-frame.png"),
      output: resolve(evidenceDir, "playable-106-first-frame.png")
    },
    {
      id: "combat-frame",
      source: resolve(evidenceDir, "aura-clash-arena-combat-frame.png"),
      output: resolve(evidenceDir, "playable-106-combat-frame.png")
    },
    {
      id: "ko-reset",
      source: resolve(evidenceDir, "aura-clash-visual-ko-reset.png"),
      output: resolve(evidenceDir, "playable-106-ko-reset.png")
    }
  ];

  const screenshotResults = screenshots.map((screenshot) => {
    if (!existsSync(screenshot.source)) {
      return {
        id: screenshot.id,
        ok: false,
        source: toAppRelative(screenshot.source),
        output: toAppRelative(screenshot.output),
        error: "source screenshot missing"
      };
    }

    copyFileSync(screenshot.source, screenshot.output);
    const sourceStat = statSync(screenshot.source);
    const outputStat = statSync(screenshot.output);
    return {
      id: screenshot.id,
      ok: outputStat.size > 0,
      source: toAppRelative(screenshot.source),
      output: toAppRelative(screenshot.output),
      sourceBytes: sourceStat.size,
      outputBytes: outputStat.size
    };
  });

  const flagshipGates = readOptionalJson(resolve(appRoot, "tests/reports/flagship-gates.json"));
  const flagshipReadiness = readOptionalJson(resolve(appRoot, "tests/reports/flagship-readiness.json"));
  const deployedGate = flagshipGates?.results?.find?.((result) => result.id === "deployed-playable-playwright") ?? null;
  const deployedProof = {
    schema: "aura-clash-106-deployed-proof",
    generatedAt: new Date().toISOString(),
    route: "/playable/",
    source: deployedEvidence ? "collect-launch-evidence-probes" : "flagship-gates-deployed-playable",
    ok: Boolean(deployedEvidence?.ok ?? deployedGate?.ok),
    deployedEvidence: deployedEvidence
      ? {
          origin: deployedEvidence.origin,
          canonicalBasePath: deployedEvidence.canonicalBasePath,
          appBasePath: deployedEvidence.appBasePath,
          targetCount: deployedEvidence.targetCount,
          failedCount: deployedEvidence.failedCount,
          kindStatus: deployedEvidence.kindStatus
        }
      : null,
    gate: deployedGate
      ? {
          id: deployedGate.id,
          ok: deployedGate.ok,
          command: [deployedGate.command, ...(deployedGate.args ?? [])].join(" "),
          durationMs: deployedGate.durationMs
        }
      : null
  };

  writeFileSync(
    resolve(evidenceDir, "deployed-106-proof.json"),
    `${JSON.stringify(deployedProof, null, 2)}\n`
  );

  const readiness = {
    schema: "aura-clash-106-readiness",
    generatedAt: new Date().toISOString(),
    ok:
      screenshotResults.every((result) => result.ok) &&
      flagshipGates?.ok === true &&
      flagshipReadiness?.ok === true &&
      deployedProof.ok === true,
    route: "/playable/",
    release: "1.0.6",
    contextualRoute: "Aura Clash Arena",
    artifacts: {
      screenshots: screenshotResults,
      deployedProof: "launch-evidence/deployed-106-proof.json",
      flagshipGates: "tests/reports/flagship-gates.json",
      flagshipReadiness: "tests/reports/flagship-readiness.json"
    },
    gates: {
      flagshipGates: flagshipGates
        ? {
            ok: flagshipGates.ok,
            status: flagshipGates.status,
            generatedAt: flagshipGates.generatedAt,
            commandCount: flagshipGates.commandCount,
            failedCount: flagshipGates.failedCount
          }
        : null,
      flagshipReadiness: flagshipReadiness
        ? {
            ok: flagshipReadiness.ok,
            status: flagshipReadiness.status,
            generatedAt: flagshipReadiness.generatedAt,
            gateCount: flagshipReadiness.gates?.length ?? 0
          }
        : null,
      deployedProof: {
        ok: deployedProof.ok,
        source: deployedProof.source
      }
    },
    limitations: [
      "Human visual approval remains separate and cannot be inferred from generated screenshots.",
      "This readiness artifact summarizes current release evidence; it does not replace the separate published CLI and production-origin checks."
    ]
  };

  writeFileSync(
    resolve(evidenceDir, "aura-clash-106-readiness.json"),
    `${JSON.stringify(readiness, null, 2)}\n`
  );

  if (!readiness.ok) {
    const failedScreenshots = screenshotResults.filter((result) => !result.ok);
    const errors = [
      ...failedScreenshots.map((result) => `${result.id}: ${result.error ?? "empty output"}`),
      flagshipGates?.ok === true ? null : "tests/reports/flagship-gates.json is missing or not ok",
      flagshipReadiness?.ok === true ? null : "tests/reports/flagship-readiness.json is missing or not ok",
      deployedProof.ok ? null : "deployed playable proof is missing or not ok"
    ].filter(Boolean);
    throw new Error(`Aura Clash 1.0.6 readiness evidence is incomplete: ${errors.join("; ")}`);
  }
}

function readOptionalJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function toAppRelative(path) {
  return path.replace(`${appRoot}/`, "");
}
