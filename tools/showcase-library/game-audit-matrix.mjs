#!/usr/bin/env node
/*
 * Builds the per-game audit matrix required before implementation work.
 *
 * Every column is filled from repository state or from a live Playwright probe
 * (tools/showcase-library/game-play-probe.mjs). Nothing here is asserted by hand,
 * so the matrix cannot silently drift from what the routes actually do.
 *
 *   node tools/showcase-library/game-audit-matrix.mjs
 *   node tools/showcase-library/game-audit-matrix.mjs --probe tests/reports/game-play-probe/full
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const probeDir = resolve(
  repoRoot,
  process.argv.includes("--probe")
    ? process.argv[process.argv.indexOf("--probe") + 1]
    : "tests/reports/game-play-probe/full",
);
const outDir = resolve(repoRoot, "tests/reports/game-audit-matrix");
mkdirSync(outDir, { recursive: true });

const routeGates = JSON.parse(
  readFileSync(resolve(repoRoot, "tools/showcase-library/route-gates.json"), "utf8"),
).routes;
const playbook = JSON.parse(
  readFileSync(resolve(repoRoot, "tools/showcase-library/game-play-playbook.json"), "utf8"),
);

/** Routes that are games but are not registered in the showcase route-gates file. */
const EXTRA_ROUTES = [
  { id: "aura-clash-showcase", label: "Aura Clash Arena", path: "/apps/aura-clash-showcase/", releaseClass: "flagship" },
];

function readJson(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function grepCount(appDir, pattern) {
  try {
    return Number(execSync(`grep -rlE '${pattern}' ${appDir}/src 2>/dev/null | wc -l`, { shell: "/bin/sh" })
      .toString().trim()) || 0;
  } catch { return 0; }
}

/**
 * Physics classification per mission section 7, derived from which public surface the
 * route imports. `@aura3d/physics` is Rapier-backed (its only backend is "rapier"), so a
 * route on `physics.world` is on the canonical solver rather than hand-rolled.
 */
/**
 * Two public surfaces reach the canonical Rapier solver, and a route is on Rapier if it
 * uses either. Searching for only `physics.world` under-counted the routes that go through
 * the game-kit collision world instead (Turbo Drift, Blockfall Reactor, Aurora Lander),
 * which is exactly the kind of silent audit error this matrix must not make.
 */
function classifyPhysics(appDir) {
  const world = grepCount(appDir, "physics\\.world\\(|createPhysicsWorld|PhysicsWorld");
  // `game.collisionWorld` is the second canonical surface; routes may reach it directly
  // (Aurora Lander) or through the shared Rapier proof harness in apps/common.
  const collisionWorld = grepCount(appDir, "game\\.collisionWorld\\(|collisionWorld\\.add|collisionWorld\\.step|collisionWorld\\.require|createShowcaseRapierPhysicsProof");
  const controller = grepCount(appDir, "characterController|vehicleController|raycastVehicle");
  const sensor = grepCount(appDir, "sensor|Sensor");
  const direct = grepCount(appDir, "createRapierPhysics|@aura3d/physics-rapier");
  const ccd = grepCount(appDir, "continuousCollision|ccd");
  const joint = grepCount(appDir, "createJoint|\\bjoint\\b");
  const onRapier = world + collisionWorld + direct;
  const surfaces = [];
  if (world > 0) surfaces.push("physics.world");
  if (collisionWorld > 0) surfaces.push("game.collisionWorld");
  if (direct > 0) surfaces.push("physics-rapier direct");
  const kinds = [];
  if (onRapier > 0) {
    if (controller > 0) kinds.push("Rapier character/vehicle controller");
    kinds.push(`Rapier rigid-body via ${surfaces.join(" + ")}`);
    if (sensor > 0) kinds.push("Rapier sensor/query");
  } else {
    kinds.push("intentionally non-physical deterministic game");
  }
  return {
    classification: kinds.join(" + "),
    rapierSurfaces: surfaces,
    rapierFiles: onRapier,
    sensorFiles: sensor,
    controllerFiles: controller,
    ccdFiles: ccd,
    jointFiles: joint,
  };
}

function rendererMode(appDir) {
  const main = readFileSync(`${appDir}/src/main.ts`, "utf8").slice(0, 60_000);
  const mode = /createGameApp/.test(main) ? "createGameApp"
    : /createAuraApp/.test(main) ? "createAuraApp" : "other";
  return {
    entry: mode,
    shadows: grepCount(appDir, "shadow|castShadow|receiveShadow"),
    postfx: grepCount(appDir, "bloom|tonemap|toneMapping|postProcess|vignette"),
    particles: grepCount(appDir, "particle|Particle|effects\\."),
    audio: grepCount(appDir, "audio|Audio|Sfx"),
    touch: grepCount(appDir, "touch|Touch"),
    reducedMotion: grepCount(appDir, "prefers-reduced-motion|reducedMotion"),
  };
}

/**
 * Claims-vs-reality cross-check.
 *
 * Section 7 forbids a route claiming physical behaviour it does not simulate, and section 36
 * forbids inflating claims. Both directions are defects.
 *
 * This keys off each route's published machine-readable physics identity (the
 * `physics: "<surface>:Rapier"` evidence field) rather than prose in a claimBoundary string.
 * An earlier version regex-matched the prose and produced false positives on every route that
 * disclaims something narrow - Bank Shot disclaims *angular* simulation, not physics - and a
 * gate that cries wolf gets ignored. Identity-vs-import is the check that can be trusted.
 */
function auditPhysicsClaims(appDir, physics) {
  const text = readSourceBundle(appDir);
  const identityKeys = ["physics", "physicsSolver", "simulationOwner"];
  // The cap has to exceed the longest honest identity in the repo. Blockfall Reactor
  // states its solver and its deterministic board-rule carve-out in one ~200-character
  // string; a 160-character cap silently failed to match it and reported the route as
  // having no physics identity at all. A gate that invents gaps gets ignored, so the
  // limit is generous and the value is truncated for display instead.
  const published = identityKeys.flatMap((key) =>
    [...text.matchAll(new RegExp(`${key}:\\s*"([^"]{0,600})"`, "g"))].map((m) => m[1] ?? ""),
  );
  const claimsRapier = published.some((value) => /rapier/i.test(value));
  const deniesRapier = published.some((value) => /\bnone\b|non-physical|not a physical/i.test(value) && !/rapier/i.test(value));
  const onRapier = physics.rapierFiles > 0;
  // Contradictions are defects. A missing machine-readable identity is a coverage gap:
  // several deterministic routes state their status in prose and are otherwise correct.
  const contradictions = [];
  const gaps = [];
  if (claimsRapier && !onRapier) contradictions.push("PUBLISHES-Rapier-identity-but-imports-no-Rapier-surface");
  if (deniesRapier && onRapier) contradictions.push("PUBLISHES-non-physical-identity-but-imports-Rapier-surface");
  if (!published.length) gaps.push("no-machine-readable-physics-identity");
  return { publishedIdentities: published, claimsRapier, onRapier, contradictions, gaps, flags: [...contradictions, ...gaps] };
}

function readSourceBundle(appDir) {
  // Must recurse: Aura Clash keeps its route evidence under `src/evidence/`, so a
  // top-level `src/*.ts` glob never saw a physics identity that was actually
  // published, and the route was reported as unclassified.
  //
  // Walked in-process rather than shelling out, so a route directory name can never
  // become a shell argument.
  const chunks = [];
  // Generous: a large route like Turbo Drift has >1MB of source under src/, and a
  // truncated read silently loses the identity published later in main.ts.
  let budget = 8_000_000;
  const walk = (dir) => {
    if (budget <= 0) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      try {
        const text = readFileSync(full, "utf8");
        const take = text.slice(0, budget);
        budget -= take.length;
        chunks.push(take);
      } catch { /* unreadable file is not a claim */ }
      if (budget <= 0) return;
    }
  };
  walk(join(appDir, "src"));
  return chunks.join("\n");
}

function testsFor(appId) {
  const browser = readdirSync(resolve(repoRoot, "tests/browser"))
    .filter((f) => f.includes(appId.replace("showcase-", "")) || f.includes(appId));
  const unitDir = resolve(repoRoot, "tests/unit/apps");
  const unit = existsSync(unitDir)
    ? readdirSync(unitDir).filter((f) => f.includes(appId.replace("showcase-", "")) || f.includes(appId))
    : [];
  return { browser, unit };
}

const rows = [];
for (const gate of [...EXTRA_ROUTES, ...routeGates]) {
  if (!Object.keys(playbook).includes(gate.id)) continue;
  const appDir = resolve(repoRoot, "apps", gate.id);
  const health = readJson(resolve(appDir, "route-health.json"));
  const probe = readJson(resolve(probeDir, `${gate.id}.json`));
  const perf = readJson(resolve(appDir, "performance-report.json"));
  const physics = classifyPhysics(appDir);
  const physicsClaimAudit = auditPhysicsClaims(appDir, physics);
  const renderer = rendererMode(appDir);
  const tests = testsFor(gate.id);

  const gameplaySteps = probe?.steps?.map((s) => s.label) ?? [];
  const hudText = probe?.steps?.[0]?.state?.hud ?? "";
  const luma = probe?.steps?.map((s) => s.state?.pixels?.meanLuma).filter((v) => typeof v === "number") ?? [];
  const colors = probe?.steps?.map((s) => s.state?.pixels?.distinctColors).filter((v) => typeof v === "number") ?? [];

  rows.push({
    game: gate.label,
    routeId: gate.id,
    route: gate.path,
    genre: playbook[gate.id]?.genre ?? "unclassified",
    releaseClass: gate.releaseClass,
    publicShowcase: health?.publicShowcase ?? null,
    machinePass: health?.machinePass ?? null,
    promotionStatus: health?.promotionStatus ?? null,
    controls: (playbook[gate.id]?.steps ?? []).flatMap((s) => (s.keys ?? []).map((k) => k.press ?? k.hold ?? k.down ?? k.up).filter(Boolean)),
    renderer,
    physics,
    primitiveBudget: gate.primitiveBudget ?? null,
    primaryAssets: gate.primaryAssets ?? [],
    existingBrowserTests: tests.browser,
    existingUnitTests: tests.unit,
    performanceReport: perf ? { keys: Object.keys(perf).slice(0, 12) } : null,
    physicsClaimAudit,
    probe: probe ? {
      ran: true,
      booted: probe.verdict?.booted ?? null,
      canvasBootMs: probe.boot?.canvasBootMs ?? null,
      consoleErrors: probe.consoleErrors?.length ?? 0,
      pageErrors: probe.pageErrors?.length ?? 0,
      requestFailures: probe.requestFailures?.length ?? 0,
      consoleWarnings: probe.consoleWarningCount ?? 0,
      stepsCaptured: gameplaySteps,
      firstLoadHud: hudText.slice(0, 240),
      lumaRange: luma.length ? [Math.min(...luma), Math.max(...luma)] : null,
      paletteSpread: colors.length ? { min: Math.min(...colors), max: Math.max(...colors) } : null,
    } : { ran: false },
  });
}

writeFileSync(resolve(outDir, "audit-matrix.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  probeSource: probeDir.replace(`${repoRoot}/`, ""),
  games: rows,
}, null, 2));

const md = [
  "# Aura3D game audit matrix",
  "",
  `Generated: ${new Date().toISOString()}  `,
  `Live Playwright probe evidence: \`${probeDir.replace(`${repoRoot}/`, "")}\``,
  "",
  "| Game | Route | Genre | Release class | Physics surfaces | Claim audit | Boot ms | Console/page/net errors | Min/Max luma | Palette spread |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.game} | \`${r.routeId}\` | ${r.genre} | ${r.releaseClass} | ${r.physics.rapierSurfaces.join(" + ") || "**none (non-physical)**"} | ${r.physicsClaimAudit.contradictions.length ? "**CONTRADICTION: " + r.physicsClaimAudit.contradictions.join(", ") + "**" : r.physicsClaimAudit.gaps.length ? "gap: " + r.physicsClaimAudit.gaps.join(", ") : "consistent"} | ${r.probe.canvasBootMs ?? "-"} | ${r.probe.ran ? `${r.probe.consoleErrors}/${r.probe.pageErrors}/${r.probe.requestFailures}` : "NOT PROBED"} | ${r.probe.lumaRange ? r.probe.lumaRange.join(" / ") : "-"} | ${r.probe.paletteSpread ? `${r.probe.paletteSpread.min}-${r.probe.paletteSpread.max}` : "-"} |`),
  "",
  "## Per-game detail",
  "",
  ...rows.map((r) => [
    `### ${r.game} (\`${r.routeId}\`)`,
    "",
    `- Route: ${r.route}`,
    `- Genre: ${r.genre}`,
    `- Release class: ${r.releaseClass} | publicShowcase: ${r.publicShowcase} | machinePass: ${r.machinePass}`,
    `- Promotion status: ${r.promotionStatus ?? "n/a"}`,
    `- Physics claim audit: ${r.physicsClaimAudit.contradictions.length ? "CONTRADICTION -> " + r.physicsClaimAudit.contradictions.join(", ") : r.physicsClaimAudit.gaps.length ? "gap -> " + r.physicsClaimAudit.gaps.join(", ") : "consistent"} (published identity: ${r.physicsClaimAudit.publishedIdentities.join(" | ") || "none"}; Rapier surface imported: ${r.physicsClaimAudit.onRapier})`,
    `- Physics: ${r.physics.classification} (surfaces: ${r.physics.rapierSurfaces.join(", ") || "none"}; sensors ${r.physics.sensorFiles} files, controllers ${r.physics.controllerFiles}, CCD ${r.physics.ccdFiles}, joints ${r.physics.jointFiles})`,
    `- Renderer: ${r.renderer.entry}; shadow files ${r.renderer.shadows}, postfx files ${r.renderer.postfx}, particle files ${r.renderer.particles}, audio files ${r.renderer.audio}, touch files ${r.renderer.touch}, reduced-motion files ${r.renderer.reducedMotion}`,
    `- Primitive budget: ${r.primitiveBudget}; primary typed assets: ${r.primaryAssets.join(", ") || "none"}`,
    `- Tests: browser ${r.existingBrowserTests.length} (${r.existingBrowserTests.slice(0, 4).join(", ")}), unit ${r.existingUnitTests.length}`,
    `- Probe: ${r.probe.ran ? `booted=${r.probe.booted}, canvas at ${r.probe.canvasBootMs ?? "?"}ms, ${r.probe.stepsCaptured.length} play steps` : "NOT PROBED"}`,
    `- First-load HUD read: ${r.probe.firstLoadHud ? `\`${r.probe.firstLoadHud.slice(0, 200)}\`` : "none"}`,
    "",
  ].join("\n")).join("\n"),
].join("\n");

writeFileSync(resolve(outDir, "audit-matrix.md"), md);
console.log(`audit matrix -> ${outDir}/audit-matrix.md (${rows.length} games)`);
