#!/usr/bin/env node
/**
 * Required route-by-route audit: classify and disposition every route under `apps/`.
 *
 * The assignment forbids excluding routes because they are not on the homepage, so all 113
 * are covered. Classification and disposition are **derived** from measurable facts:
 *
 *   - route-gate release class, when the route has one
 *   - whether it has an interaction-audit result, and whether that result passed
 *   - whether another route consumes the same primary asset with the same category
 *   - naming families that mark fixtures (`three-compat-*`, `threejs-parity-*`, `wow-*`)
 *   - route-local line count and whether it duplicates a reusable system
 *
 * Every disposition carries the facts it was derived from, so a reader can disagree with the
 * rule rather than with an unexplained verdict.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const inventory = JSON.parse(readFileSync(join(root, "tests/reports/aura3d-product-inventory.json"), "utf8"));
const gates = JSON.parse(readFileSync(join(root, "tools/showcase-library/route-gates.json"), "utf8"));
const gateById = new Map(gates.routes.map((route) => [route.id, route]));

/**
 * Routes actually linked from a public surface.
 *
 * "Remove from public marketing" is only a meaningful disposition for something that *is*
 * marketed. Treating all 113 apps as marketed produced 53 such verdicts, most of them for
 * routes nothing links to -- which reads as a large public problem where the real finding is
 * "these exist in the tree without public exposure". Derived by scanning the marketing site,
 * the root index and the showcase index for route links.
 */
const publiclyLinked = (() => {
  const linked = new Set();
  const scan = (dir, extensions) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full, extensions);
        continue;
      }
      if (!extensions.some((extension) => entry.name.endsWith(extension))) continue;
      let text;
      try {
        text = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      for (const match of text.matchAll(/\/apps\/([a-z0-9-]+)/g)) linked.add(match[1]);
    }
  };
  scan(join(root, "marketing"), [".ts", ".tsx", ".html", ".mjs", ".json"]);
  scan(join(root, "apps/showcase-index"), [".ts", ".html"]);
  for (const file of ["index.html"]) {
    try {
      const text = readFileSync(join(root, file), "utf8");
      for (const match of text.matchAll(/apps\/([a-z0-9-]+)/g)) linked.add(match[1]);
    } catch {
      // Absent root index: nothing to add.
    }
  }
  return linked;
})();

/** Interaction-audit results, when a route has one. */
const auditDir = join(root, "tests/reports/showcase-interaction-audit");
const audits = new Map();
if (existsSync(auditDir)) {
  for (const entry of readdirSync(auditDir)) {
    if (!entry.endsWith(".json")) continue;
    const report = JSON.parse(readFileSync(join(auditDir, entry), "utf8"));
    audits.set(report.routeId, report);
  }
}

/**
 * Classification rules, in priority order.
 *
 * Each returns a category plus the fact that decided it.
 */
function classify(app) {
  const gate = gateById.get(app.routeId);
  if (gate) {
    if (gate.releaseClass === "index-route") return { category: "public flagship", because: "route gate: index-route" };
    if (gate.releaseClass === "internal-diagnostic") return { category: "diagnostic", because: "route gate: internal-diagnostic" };
    if (gate.releaseClass === "game-layer-diagnostic") return { category: "diagnostic", because: "route gate: game-layer-diagnostic" };
    if (gate.releaseClass === "removed-from-public-showcase") return { category: "obsolete", because: "route gate: removed-from-public-showcase" };
    return { category: "public flagship", because: `route gate: ${gate.releaseClass}` };
  }
  if (/^three-compat-/.test(app.routeId)) return { category: "internal fixture", because: "three-compat migration fixture family" };
  if (/^threejs-parity/.test(app.routeId)) return { category: "internal fixture", because: "threejs-parity measurement fixture family" };
  if (/^regression-/.test(app.routeId)) return { category: "internal fixture", because: "regression fixture family" };
  if (/^(wow-)?common$/.test(app.routeId)) return { category: "internal fixture", because: "shared helper module, not a route" };
  if (/^wow-/.test(app.routeId)) return { category: "advanced", because: "wow-* advanced asset-gallery family" };
  if (/^v9-/.test(app.routeId)) return { category: "obsolete", because: "v9-* superseded family" };
  if (/gallery$/.test(app.routeId)) return { category: "advanced", because: "gallery aggregation route" };
  if (/(-proof|-check|-evidence|-lab)$/.test(app.routeId)) return { category: "diagnostic", because: "evidence/lab naming family" };
  if (/^(hello-world|public-scene|controls-|lights-|lines-|material-lighting|animation-(keyframes|multiple|walk)|camera-path|decals|instancing-performance|stereo-effects|parallax-barrier|postprocessing-|skinning-|materials-|loader-|shadowmap-)/.test(app.routeId)) {
    return { category: "starter", because: "single-feature starter naming family" };
  }
  if (/^(editor|asset-|animation-studio|material-studio|product-studio|scene-studio|scene-lab|game-lab|large-scene|interactive-|flagship-|character-|architecture-|automotive-|cinematic-|world-war-x|showcase-)/.test(app.routeId)) {
    return { category: "advanced", because: "multi-feature advanced application family" };
  }
  return { category: "public example", because: "no gate and no fixture/starter family match" };
}

/**
 * Duplicate detection: two routes sharing a primary asset and a category are candidates for
 * consolidation. Derived from the assets each route actually imports.
 */
const assetSignature = new Map();
for (const app of inventory.apps) {
  if (app.assets.length === 0) continue;
  const key = app.assets.slice().sort().join("|");
  if (!assetSignature.has(key)) assetSignature.set(key, []);
  assetSignature.get(key).push(app.routeId);
}

function disposition(app, category) {
  const gate = gateById.get(app.routeId);
  const audit = audits.get(app.routeId);
  const facts = [];
  if (gate) facts.push(`gate=${gate.releaseClass}`);
  if (audit) {
    facts.push(`audit: ${audit.controlsPassing}/${audit.controlsOperated} controls, ${audit.consoleErrors.length} errors`);
  }
  const sharedAssetPeers = (assetSignature.get(app.assets.slice().sort().join("|")) ?? [])
    .filter((id) => id !== app.routeId);
  if (sharedAssetPeers.length > 0) facts.push(`shares primary assets with ${sharedAssetPeers.join(", ")}`);

  // Obsolete and fixture families are dispositioned by their family, not by audit state.
  if (category === "obsolete") {
    return { disposition: "delete in a future breaking release", rationale: "superseded family; retained only so historical evidence resolves", facts };
  }
  if (category === "internal fixture") {
    return { disposition: "keep as internal fixture", rationale: "measurement or migration fixture; not a public claim", facts };
  }
  if (category === "diagnostic") {
    return { disposition: "keep as diagnostic", rationale: "publishes engine behaviour rather than a product experience", facts };
  }

  // Public routes: disposition follows audit evidence.
  if (audit) {
    const clean = audit.consoleErrors.length === 0 && audit.controlsPassing === audit.controlsOperated;
    if (!clean) {
      return { disposition: "keep and fix", rationale: "interaction audit found failing controls or runtime errors", facts };
    }
    if (gate?.releaseClass === "prototype-blocked") {
      return {
        disposition: "keep and fix",
        rationale: "controls verified, but the route remains prototype-blocked pending visual review of its runtime simulation",
        facts
      };
    }
    return {
      disposition: "keep and fix",
      rationale: "controls verified with zero runtime errors; remaining work is kit adoption rather than defect repair",
      facts
    };
  }

  // No audit coverage. What that means depends on whether anything links to the route.
  const linked = publiclyLinked.has(app.routeId);
  if (linked) facts.push("linked from a public surface");
  const interactiveControls = app.controls.filter((control) => control.kind !== "keyboard").length
    + app.controls.filter((control) => control.kind === "keyboard").length;
  /*
   * A route's own test suite counts as coverage.
   *
   * Aura Clash carries 23 route-local Playwright specs including deterministic replay; the
   * showcase-wide interaction audit does not cover it because it is not in the route-gate
   * registry. Reporting it as uncovered would be false.
   */
  const ownSuite = existsSync(join(root, "apps", app.routeId, "tests"));
  if (ownSuite) facts.push("has a route-local test suite");
  if (linked && ownSuite) {
    return {
      disposition: "keep and fix",
      rationale: "publicly linked and covered by its own route-local suite; add it to the shared interaction audit",
      facts
    };
  }
  if (linked && interactiveControls === 0) {
    /*
     * A static demo with no controls cannot fail an interaction audit, so absence of one is
     * not a defect. What it needs is a render check, which the route-primary probe provides
     * for gated routes and does not for these.
     */
    return {
      disposition: "keep as static demo",
      rationale: "publicly linked with no interactive controls; needs render evidence rather than interaction coverage",
      facts
    };
  }
  if (linked) {
    return {
      disposition: "remove from public marketing",
      rationale: "publicly linked, has interactive controls, and no interaction coverage proves they work",
      facts
    };
  }
  if (sharedAssetPeers.length > 0) {
    return {
      disposition: "consolidate",
      rationale: `not publicly linked and shares its primary assets with ${sharedAssetPeers.length} other route(s)`,
      facts
    };
  }
  if (category === "starter") {
    return {
      disposition: "keep and fix",
      rationale: "single-feature starter, not publicly linked; needs interaction coverage before any public claim",
      facts
    };
  }
  return {
    disposition: "keep unlisted",
    rationale: "not publicly linked and has no interaction coverage; retained as a development route, not presented as an example",
    facts
  };
}

const routes = inventory.apps.map((app) => {
  const { category, because } = classify(app);
  const audit = audits.get(app.routeId);
  const { disposition: verdict, rationale, facts } = disposition(app, category);
  return {
    routeId: app.routeId,
    category,
    categoryBecause: because,
    published: app.public,
    publiclyLinked: publiclyLinked.has(app.routeId),
    releaseClass: app.releaseClass,
    routeLocalLines: app.routeLocalLines,
    controlCount: app.controls.filter((control) => control.kind !== "keyboard").length,
    keyboardBindings: app.controls.filter((control) => control.kind === "keyboard").length,
    interactionAudited: Boolean(audit),
    interactionPassing: audit ? audit.consoleErrors.length === 0 && audit.controlsPassing === audit.controlsOperated : undefined,
    magicGeometryFindings: app.magicGeometry.length,
    privateImports: app.privateImports.length,
    disposition: verdict,
    rationale,
    facts
  };
});

const byCategory = {};
const byDisposition = {};
for (const route of routes) {
  byCategory[route.category] = (byCategory[route.category] ?? 0) + 1;
  byDisposition[route.disposition] = (byDisposition[route.disposition] ?? 0) + 1;
}

const report = {
  schema: "aura3d-route-disposition/1.0",
  generatedAt: new Date().toISOString(),
  producer: "tools/product-remediation/build-route-disposition.mjs",
  method: [
    "Every route under apps/ is covered; none is excluded for not being on the homepage.",
    "Category is derived from route-gate release class, then from naming families.",
    "Disposition for public routes follows interaction-audit evidence; absence of coverage is itself a finding.",
    "Each verdict carries the facts that produced it."
  ],
  totals: { routes: routes.length, byCategory, byDisposition },
  routes: routes.sort((a, b) => a.routeId.localeCompare(b.routeId))
};

writeFileSync(join(root, "tests/reports/aura3d-route-disposition.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log("wrote tests/reports/aura3d-route-disposition.json");
console.log("routes:", routes.length);
console.log("by category:", JSON.stringify(byCategory, null, 1));
console.log("by disposition:", JSON.stringify(byDisposition, null, 1));
void statSync;
