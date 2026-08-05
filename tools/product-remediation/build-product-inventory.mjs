#!/usr/bin/env node
/**
 * Phase 1 product inventory for the Aura3D remediation assignment.
 *
 * Produces `tests/reports/aura3d-product-inventory.json` from the working tree.
 * Everything here is derived by reading source: no field is hand-authored, so the
 * report cannot claim a route consumes a package it does not import.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const exists = (path) => existsSync(path);

function listDirs(dir) {
  if (!exists(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}

function walkFiles(dir, filter, acc = []) {
  if (!exists(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, filter, acc);
    else if (filter(entry.name)) acc.push(full);
  }
  return acc;
}

function countLines(path) {
  try {
    return readFileSync(path, "utf8").split("\n").length;
  } catch {
    return 0;
  }
}

/** Package specifiers imported by a set of source files. */
function collectImports(files) {
  const packages = new Set();
  const privateImports = new Set();
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const match of text.matchAll(/from\s+["']([^"']+)["']/g)) {
      const spec = match[1];
      if (spec.startsWith(".")) continue;
      if (spec.startsWith("@aura3d/")) {
        packages.add(spec);
        if (/\/src\//.test(spec)) privateImports.add(spec);
        continue;
      }
      if (!spec.startsWith("node:")) packages.add(spec);
    }
    // Relative imports that reach into another workspace package's src/ are private.
    for (const match of text.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g)) {
      const resolved = resolve(dirname(file), match[1]);
      const rel = relative(root, resolved);
      if (/^packages\/[^/]+\/src\//.test(rel)) privateImports.add(rel);
    }
  }
  return {
    packages: [...packages].sort(),
    privateImports: [...privateImports].sort()
  };
}

/**
 * Magic-constant scan (Phase 13). Classifies suspicious literals so the PRD ledger
 * can distinguish level design from accidental patches.
 */
/**
 * Magic-constant scan (Phase 13). Classifies suspicious literals so the PRD ledger
 * can distinguish level design from accidental patches.
 *
 * Builder chains in this codebase span several lines, so the scan works on
 * statements rather than raw lines. A line-based scan silently missed the
 * configurator focus torus -- the exact defect it exists to catch.
 */
/**
 * Magic-constant scan (Phase 13). Classifies suspicious literals so the PRD ledger
 * can distinguish level design from accidental patches.
 *
 * Builder chains span several lines, so the scan extracts each chain by scanning
 * forward from its factory call and tracking bracket depth. A line-based scan
 * silently missed the configurator focus torus -- the exact defect it exists to
 * catch -- and naive line grouping merged neighbouring chains and read the wrong
 * `.scale()` for a node.
 */
function stripComments(text) {
  return text
    .split("\n")
    .map((line) => (line.trim().startsWith("*") || line.trim().startsWith("//") ? "" : line))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Extracts one builder chain starting at `from`, ending when depth returns to 0. */
function readChain(text, from) {
  let depth = 0;
  let index = from;
  let started = false;
  for (; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      started = true;
    } else if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
      if (started && depth <= 0) {
        // Continue while the chain keeps calling methods: `).position(...)`.
        const rest = text.slice(index + 1);
        const continuation = rest.match(/^\s*\.[A-Za-z0-9_]+\s*\(/);
        if (continuation) {
          index += continuation[0].length - 1;
          depth = 1;
          continue;
        }
        return text.slice(from, index + 1);
      }
    }
  }
  return text.slice(from);
}

function scanMagicGeometry(files) {
  const findings = [];
  for (const file of files) {
    let raw;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const text = stripComments(raw);
    const lineForOffset = (offset) => text.slice(0, offset).split("\n").length;
    const chains = [];
    for (const match of text.matchAll(/primitives\.[A-Za-z0-9_]+\s*\(|labels\.[A-Za-z0-9_]+\s*\(|model\s*\(/g)) {
      const offset = match.index ?? 0;
      chains.push({ text: readChain(text, offset).replace(/\s+/g, " "), line: lineForOffset(offset) });
    }

    const record = (line, kind, note, source) => findings.push({
      file: relative(root, file),
      line,
      kind,
      note,
      source: source.slice(0, 220)
    });

    for (const chain of chains) {
      const source = chain.text;
      const isTorus = /^primitives\.torus\s*\(/.test(source);
      /*
       * A raw torus is a defect only when it is standing in for *selection feedback*.
       *
       * `focusObject`/`focusSemanticRegion` own selection indicators, so a route building
       * one by hand is bypassing the reusable system. A decorative ring -- a reactor
       * containment ring, a telemetry orbit, a planet's orbit path -- is scene content, and
       * flagging it makes the count meaningless. Selection intent is what the word "select"
       * or "focus" in the node name indicates; "orbit", "containment" and "induction" do not.
       */
      const selectionIntent = /(focus|select|highlight|outline)/i.test(source);
      const decorativeRing = /(orbit|containment|induction|calibration|halo ring|tunnel|vortex|evidence ring|telemetry)/i.test(source);
      if (isTorus && selectionIntent && !decorativeRing) {
        record(chain.line, "manual-selection-ring", "focus/selection indicator constructed from a raw torus primitive instead of the reusable focus system", source);
      }
      const scaleMatch = source.match(/\.scale\(\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/);
      if (isTorus && /\.rotate\(/.test(source) && scaleMatch) {
        const axes = [Number(scaleMatch[1]), Number(scaleMatch[2]), Number(scaleMatch[3])];
        // A ring primitive lies in local XY with its tube thin on Z. Thinning Y
        // instead of Z and then tipping the node flattens the ring into a bar.
        const thinnest = axes.indexOf(Math.min(...axes));
        record(
          chain.line,
          thinnest === 2 ? "torus-rotate-scale-composition" : "torus-flattened-into-bar",
          thinnest === 2
            ? "nonuniform torus scale composed with rotation; axis-dependent and unstable"
            : `torus thinned on axis ${["x", "y", "z"][thinnest]} rather than the tube axis z, then rotated: renders as a bar, not a ring`,
          source
        );
      }
      /*
       * `labels.callout` is now a working API, so *using* it is not a finding.
       *
       * What remains a finding is using it without `anchorWorldPosition`: the label then
       * anchors to its own position, so its leader line points at itself rather than at the
       * subject it annotates, and it drifts away from that subject as the camera moves.
       */
      if (/^labels\.callout\s*\(/.test(source) && !/anchorWorldPosition/.test(source)) {
        record(chain.line, "callout-without-world-anchor", "labels.callout without anchorWorldPosition: the leader line points at the label, not at its subject", source);
      }
      /*
       * Helper geometry at literal world coordinates.
       *
       * Reported only when *all three* components are bare literals. A chain positioned
       * relative to a named datum -- `.position(0, BOARD_CENTER_Y, -0.06)` -- is already
       * derived from something, so flagging it produced false findings against Blockfall's
       * arcade cabinet, whose rails and shrouds are genuine level design measured from the
       * board centre. Category 1 in the assignment's classification ("legitimate design
       * value") must not be reported as category 5 ("accidental patch"), or the count stops
       * meaning anything.
       */
      const literalPosition = /\.position\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)/.test(source);
      const derivedFromDatum = /\.position\([^)]*\b[A-Z][A-Z0-9_]{2,}\b/.test(source)
        || /\.position\([^)]*\.\.\./.test(source)
        || /\.position\([^)]*(?:center|bounds|anchor|region|Point|position)\b/.test(source);
      if (literalPosition && !derivedFromDatum
        && /(marker|beacon|pulse|proxy|guide|sample|rail|workpiece|sweep|placeholder|prop|station|panel)/i.test(source)) {
        record(chain.line, "hardcoded-helper-placement", "helper/procedural geometry placed at literal world coordinates unrelated to asset bounds", source);
      }
    }

    for (const match of text.matchAll(/(SCENE_HEIGHT|CONTACT_Y|SURFACE_Y|FLOOR_Y|GROUND_Y)\s*=\s*-?[\d.]/g)) {
      record(lineForOffset(match.index ?? 0), "hardcoded-contact-plane", "asset contact/ground plane frozen as a literal", match[0]);
    }
  }
  return findings;
}

const gates = readJson(join(root, "tools/showcase-library/route-gates.json"));
const gateById = new Map(gates.routes.map((route) => [route.id, route]));

/** Controls a route exposes, read from its index.html plus its keyboard bindings. */
function collectControls(appDir, files) {
  const controls = [];
  const html = join(appDir, "index.html");
  if (exists(html)) {
    const text = readFileSync(html, "utf8");
    // Buttons are addressed by `id` in some routes and by `data-*` attributes in
    // others. A scan that only looked for `id` reported the configurator as having
    // two controls when it has eleven, which is exactly the blind spot that let
    // "the focus button is broken" go unnoticed.
    for (const match of text.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
      const attributes = match[1];
      const label = match[2].replace(/<[^>]+>/g, "").trim();
      const idMatch = attributes.match(/\bid=["']([^"']+)["']/);
      const dataMatch = attributes.match(/\b(data-[a-z-]+)=["']([^"']+)["']/);
      const selector = idMatch
        ? `#${idMatch[1]}`
        : dataMatch
          ? `button[${dataMatch[1]}="${dataMatch[2]}"]`
          : undefined;
      if (!selector) continue;
      controls.push({
        kind: "button",
        id: idMatch ? idMatch[1] : `${dataMatch[1]}=${dataMatch[2]}`,
        selector,
        label
      });
    }
    for (const match of text.matchAll(/<input[^>]*id=["']([^"']+)["'][^>]*type=["']([^"']+)["']/g)) {
      controls.push({ kind: `input:${match[2]}`, id: match[1], label: match[1] });
    }
    for (const match of text.matchAll(/<input[^>]*type=["']([^"']+)["'][^>]*id=["']([^"']+)["']/g)) {
      controls.push({ kind: `input:${match[1]}`, id: match[2], label: match[2] });
    }
    for (const match of text.matchAll(/<select[^>]*id=["']([^"']+)["']/g)) {
      controls.push({ kind: "select", id: match[1], label: match[1] });
    }
  }
  // Several routes build their console in JS, so scan source template strings too.
  // Static HTML alone reported Digital Twin Ops as having zero controls while it
  // renders nine.
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/<button\b([^>]*)>/g)) {
      const attributes = match[1];
      const dataMatch = attributes.match(/\b(data-[a-z-]+)=["']?\$\{[^}]*\}["']?/)
        ?? attributes.match(/\b(data-[a-z-]+)=["']([^"'$]+)["']/);
      const idMatch = attributes.match(/\bid=["']([^"'$]+)["']/);
      if (idMatch) {
        if (!controls.some((control) => control.id === idMatch[1])) {
          controls.push({ kind: "button", id: idMatch[1], selector: `#${idMatch[1]}`, label: idMatch[1], source: "template" });
        }
        continue;
      }
      if (dataMatch) {
        const attribute = dataMatch[1];
        const id = dataMatch[2] ? `${attribute}=${dataMatch[2]}` : `${attribute}=*`;
        if (!controls.some((control) => control.id === id)) {
          controls.push({
            kind: "button",
            id,
            selector: dataMatch[2] ? `button[${attribute}="${dataMatch[2]}"]` : `button[${attribute}]`,
            label: id,
            source: "template"
          });
        }
      }
    }
  }

  const keys = new Set();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/["'](Key[A-Z]|Arrow(?:Up|Down|Left|Right)|Space|Enter|Escape|Digit\d|Shift(?:Left|Right)?|Tab)["']/g)) {
      keys.add(match[1]);
    }
  }
  for (const key of [...keys].sort()) controls.push({ kind: "keyboard", id: key, label: key });
  return controls;
}

function detectRuntimeSystems(files) {
  const systems = new Set();
  const probes = {
    "fixed-step-runtime": /onFrame\(|frameLoop\(|createFrameLoop/,
    physics: /game\.collisionWorld|kinematicBody|PhysicsWorld|createRuntimeScenePhysics|physics\./,
    animation: /animation:|\.animate\(|animationController|AnimationMixer|playClip/,
    "racing-kit": /game\.racing\b|racingSurfaceQuery|racingCameraRig/,
    "platformer-kit": /game\.platformer\b|platformerSurfaceQuery|platformerCameraRig/,
    "falling-blocks-kit": /game\.fallingBlocks/,
    "combat-kit": /combatWorld|game\.hitbox|fightingGameKit|games\.fighting/,
    "input-kit": /game\.input\b|createGameInput/,
    "touch-controls": /touchControls|bindGameTouchControls/,
    interactions: /interactions\.(orbit|pointer|select|drag)/,
    labels: /labels\.(callout|anchor|billboard|axisTick|hud)/,
    "focus-system": /focusObject\(|createAuraFocus|interactions\.focus/,
    "asset-relative-layout": /layout\.|anchors\.|placeRelativeTo|resolveSubjectPlacementFacts/,
    evidence: /collectAuraSceneEvidence|createAuraRouteHealthSnapshot/
  };
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const [name, pattern] of Object.entries(probes)) {
      if (pattern.test(text)) systems.add(name);
    }
  }
  return [...systems].sort();
}

function detectAssets(files) {
  const assetsUsed = new Set();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/assets\.([A-Za-z0-9_]+)/g)) assetsUsed.add(match[1]);
  }
  return [...assetsUsed].sort();
}

function evidenceCoverage(appDir, id) {
  const coverage = [];
  for (const name of ["route-health.json", "showcase-evidence-checklist.json", "showcase-spec-compile-report.json"]) {
    if (exists(join(appDir, name))) coverage.push(name);
  }
  if (exists(join(appDir, "launch-evidence"))) coverage.push("launch-evidence/");
  const browserSpecs = walkFiles(join(root, "tests/browser"), (name) => name.endsWith(".spec.ts"))
    .filter((file) => readFileSync(file, "utf8").includes(id))
    .map((file) => relative(root, file));
  return { retainedArtifacts: coverage, browserSpecs };
}

function categorizeApp(id) {
  const gate = gateById.get(id);
  if (gate) {
    if (gate.releaseClass === "index-route") return "public flagship";
    if (gate.releaseClass === "internal-diagnostic" || gate.releaseClass === "game-layer-diagnostic") return "diagnostic";
    if (gate.releaseClass === "removed-from-public-showcase") return "obsolete";
    return "public flagship";
  }
  if (id.startsWith("three-compat-")) return "internal fixture";
  if (id.startsWith("threejs-parity")) return "internal fixture";
  if (id.startsWith("wow-")) return "advanced";
  if (id.startsWith("regression-")) return "internal fixture";
  if (/^(v9-)?advanced-examples-gallery$/.test(id)) return "advanced";
  if (id === "common" || id === "wow-common") return "internal fixture";
  if (/^(hello-world|public-scene|controls-|lights-|lines-|material-lighting|animation-(keyframes|multiple|walk))/.test(id)) return "starter";
  return "public example";
}

const apps = [];
for (const name of listDirs(join(root, "apps"))) {
  const appDir = join(root, "apps", name);
  const srcFiles = walkFiles(join(appDir, "src"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"));
  const rootFiles = walkFiles(appDir, (file) => file.endsWith(".ts")).filter((file) => !file.includes(`${appDir}/src/`) && !file.includes("/tests/") && !file.includes("/scripts/"));
  const files = [...new Set([...srcFiles, ...rootFiles])];
  if (files.length === 0 && !exists(join(appDir, "index.html"))) continue;
  const routeLocalLines = files.reduce((total, file) => total + countLines(file), 0);
  const gate = gateById.get(name);
  const { packages, privateImports } = collectImports(files);
  apps.push({
    routeId: name,
    path: `apps/${name}/`,
    category: categorizeApp(name),
    public: gate ? Boolean(gate.published) : exists(join(appDir, "index.html")),
    releaseClass: gate?.releaseClass ?? "unclassified",
    packagesConsumed: packages.filter((spec) => spec.startsWith("@aura3d/")),
    externalPackages: packages.filter((spec) => !spec.startsWith("@aura3d/")),
    privateImports,
    routeLocalLines,
    sourceFiles: files.map((file) => relative(root, file)),
    controls: collectControls(appDir, files),
    runtimeSystems: detectRuntimeSystems(files),
    assets: detectAssets(files),
    usesPhysics: detectRuntimeSystems(files).includes("physics"),
    usesAnimation: detectRuntimeSystems(files).includes("animation"),
    evidenceCoverage: evidenceCoverage(appDir, name),
    magicGeometry: scanMagicGeometry(files),
    manualInteractionStatus: "pending",
    visualDefects: [],
    runtimeDefects: [],
    apiDefectsExposed: [],
    maturity: gate ? (gate.releaseClass === "prototype-blocked" ? "prototype" : "candidate") : "unclassified",
    releaseSuitability: gate?.releaseClass === "prototype-blocked" ? "blocked" : "pending-interaction-audit"
  });
}

const examples = [];
for (const name of listDirs(join(root, "examples"))) {
  const dir = join(root, "examples", name);
  const files = walkFiles(dir, (file) => file.endsWith(".ts") || file.endsWith(".tsx"));
  if (files.length === 0 && !exists(join(dir, "index.html"))) continue;
  const { packages, privateImports } = collectImports(files);
  examples.push({
    routeId: `examples/${name}`,
    path: `examples/${name}/`,
    category: name.startsWith("external-") ? "advanced" : name.startsWith("legacy-") ? "obsolete" : "public example",
    public: exists(join(dir, "index.html")),
    packagesConsumed: packages.filter((spec) => spec.startsWith("@aura3d/")),
    privateImports,
    /*
     * Examples were the only inventory entries missing `sourceFiles`.
     *
     * All 111 apps carried it; all 36 examples did not, even though `files` was already computed
     * two lines above. `build-threejs-parity.mjs` resolves consumers by reading
     * `entry.sourceFiles ?? []` and grepping for capability symbols, so every example was
     * iterating an empty list and could never be credited.
     *
     * The visible consequence: `examples/physics-sandbox` uses `Constraint` (6 references) and
     * `PhysicsDebugDraw` (2), yet the parity report listed `joints / constraints` and
     * `physics debug rendering` as "no production consumer imports this capability". Five physics
     * rows were downgraded on evidence the tool was structurally unable to see.
     *
     * `check-quality-gates.mjs` reads the same field for apps, so this omission also silently
     * narrowed that gate's reach.
     */
    sourceFiles: files.map((file) => relative(root, file)),
    routeLocalLines: files.reduce((total, file) => total + countLines(file), 0),
    controls: collectControls(dir, files),
    runtimeSystems: detectRuntimeSystems(files),
    assets: detectAssets(files),
    magicGeometry: scanMagicGeometry(files),
    manualInteractionStatus: "pending"
  });
}

/** Public export names for a package, read from its own index barrel. */
function collectPackageExports(pkgDir) {
  const index = join(pkgDir, "src/index.ts");
  const names = new Set();
  const reExports = [];
  if (!exists(index)) return { names: [], reExports: [] };
  const text = readFileSync(index, "utf8");
  for (const match of text.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']/g)) reExports.push(match[1]);
  for (const match of text.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:const|function|class|interface|type|enum)\s+([A-Za-z0-9_]+)/g)) {
    names.add(match[1]);
  }
  for (const match of text.matchAll(/export\s+\{([^}]+)\}/g)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  // Follow one level of `export *` barrels to enumerate the real surface.
  for (const spec of reExports) {
    const candidate = resolve(join(pkgDir, "src"), spec.replace(/\.js$/, ".ts"));
    if (!exists(candidate) || !statSync(candidate).isFile()) continue;
    const moduleText = readFileSync(candidate, "utf8");
    for (const match of moduleText.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:const|function|class|interface|type|enum)\s+([A-Za-z0-9_]+)/g)) {
      names.add(match[1]);
    }
  }
  return { names: [...names].sort(), reExports };
}

const packageNames = listDirs(join(root, "packages"));
const packageInfos = [];
for (const name of packageNames) {
  const pkgDir = join(root, "packages", name);
  const manifestPath = join(pkgDir, "package.json");
  if (!exists(manifestPath)) continue;
  const manifest = readJson(manifestPath);
  const srcFiles = walkFiles(join(pkgDir, "src"), (file) => file.endsWith(".ts"));
  const testFiles = walkFiles(join(pkgDir, "tests"), (file) => file.endsWith(".ts"));
  const { names: exportNames, reExports } = collectPackageExports(pkgDir);
  packageInfos.push({
    name: manifest.name ?? `@aura3d/${name}`,
    dir: `packages/${name}/`,
    private: manifest.private === true,
    version: manifest.version,
    declaredDependencies: Object.keys(manifest.dependencies ?? {}).filter((dep) => dep.startsWith("@aura3d/")),
    sourceFiles: srcFiles.length,
    sourceLines: srcFiles.reduce((total, file) => total + countLines(file), 0),
    testFiles: testFiles.length,
    publicExportCount: exportNames.length,
    publicExports: exportNames,
    barrelReExports: reExports
  });
}

// Consumer graph: which apps/examples/packages import each package.
const allConsumers = [...apps, ...examples];
for (const pkg of packageInfos) {
  pkg.consumers = {
    apps: allConsumers.filter((entry) => entry.packagesConsumed?.includes(pkg.name)).map((entry) => entry.routeId),
    packages: packageInfos
      .filter((other) => other.name !== pkg.name && other.declaredDependencies.includes(pkg.name))
      .map((other) => other.name)
  };
  pkg.consumerCount = pkg.consumers.apps.length + pkg.consumers.packages.length;
}

// Duplicated abstraction detection: exported symbol names that appear in >1 package.
const symbolOwners = new Map();
for (const pkg of packageInfos) {
  for (const name of pkg.publicExports) {
    if (!symbolOwners.has(name)) symbolOwners.set(name, []);
    symbolOwners.get(name).push(pkg.name);
  }
}
const duplicatedExports = [...symbolOwners.entries()]
  .filter(([, owners]) => owners.length > 1)
  .map(([name, owners]) => ({ symbol: name, owners: owners.sort() }))
  .sort((a, b) => a.symbol.localeCompare(b.symbol));

const engineAgentApiFiles = walkFiles(join(root, "packages/engine/src/agent-api"), (file) => file.endsWith(".ts"));
const magicGeometryTotals = {};
for (const entry of [...apps, ...examples]) {
  for (const finding of entry.magicGeometry) {
    magicGeometryTotals[finding.kind] = (magicGeometryTotals[finding.kind] ?? 0) + 1;
  }
}

const report = {
  schema: "aura3d-product-inventory/1.0",
  generatedAt: new Date().toISOString(),
  producer: "tools/product-remediation/build-product-inventory.mjs",
  baseline: "1.5.0",
  totals: {
    packages: packageInfos.length,
    apps: apps.length,
    publicGatedRoutes: gates.routes.length,
    examples: examples.length,
    templates: listDirs(join(root, "templates")).length,
    generatedTemplates: listDirs(join(root, "packages/create-aura3d/templates")).length,
    agentApiFiles: engineAgentApiFiles.length,
    agentApiLines: engineAgentApiFiles.reduce((total, file) => total + countLines(file), 0),
    duplicatedExportSymbols: duplicatedExports.length,
    magicGeometryFindings: Object.values(magicGeometryTotals).reduce((a, b) => a + b, 0)
  },
  magicGeometryTotals,
  packages: packageInfos,
  apps,
  examples,
  templates: {
    root: listDirs(join(root, "templates")),
    generator: listDirs(join(root, "packages/create-aura3d/templates"))
  },
  duplicatedExports
};

const outPath = join(root, "tests/reports/aura3d-product-inventory.json");
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`wrote ${relative(root, outPath)}`);
console.log(JSON.stringify(report.totals, null, 2));
console.log("magic geometry:", JSON.stringify(magicGeometryTotals));
