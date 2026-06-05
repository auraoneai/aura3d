#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const glbPaths = Array.from(new Set(collectGlbPaths(manifest))).sort();

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

const glbTargets = glbPaths.flatMap((publicPath) => [
  {
    kind: "glb",
    label: `/${publicPath}`,
    url: toUrl(origin, "", publicPath)
  },
  {
    kind: "glb",
    label: `${canonicalBasePath}/${publicPath}`,
    url: toUrl(origin, canonicalBasePath, publicPath)
  },
  {
    kind: "glb",
    label: `${appBasePath}/${publicPath}`,
    url: toUrl(origin, appBasePath, publicPath)
  }
]);

const startedAt = new Date().toISOString();
const results = [];

for (const target of [...routeTargets, ...metadataTargets, ...glbTargets]) {
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
  targetCount: results.length,
  ok: failed.length === 0,
  failedCount: failed.length,
  kindStatus,
  prdGateCoverage: createPrdGateCoverage(kindStatus),
  results
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);

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

function collectGlbPaths(value, paths = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectGlbPaths(item, paths);
    }
    return paths;
  }

  if (!value || typeof value !== "object") {
    return paths;
  }

  for (const [key, child] of Object.entries(value)) {
    if (
      typeof child === "string" &&
      child.endsWith(".glb") &&
      (key === "publicPath" || key === "url" || key === "path" || child.includes("aura-assets/"))
    ) {
      paths.push(child.replace(/^\/+/, ""));
      continue;
    }

    collectGlbPaths(child, paths);
  }

  return paths;
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
      (target.kind !== "glb" || byteLength > 0 || Number(contentLength ?? 0) > 0);

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
    ["route", "metadata", "glb"].map((kind) => {
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
