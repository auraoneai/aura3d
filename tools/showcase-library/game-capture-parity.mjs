#!/usr/bin/env node
/*
 * Capture-parity audit.
 *
 * Several routes rendered differently when `?capture=review` was present:
 * different ambient levels, different bloom, different fog, and in some cases
 * whole chunks of scene content swapped out. That makes reviewed screenshots
 * evidence of a scene nobody can actually play, and it lets a visual-QA gate
 * pass while the shipped game is visibly broken (Courier Rush shipped a blown-out
 * white van this way).
 *
 * This classifies every capture-flag branch so the drift is countable and can be
 * gated:
 *   ART       - lighting, effects, materials, scene content. Must NOT differ.
 *   FRAMING   - camera pose only. Tolerable, but still hides live defects.
 *   TRANSIENT - cosmetic FX / motion reduction. Legitimate.
 *   UNKNOWN   - needs a human read.
 *
 *   node tools/showcase-library/game-capture-parity.mjs
 *   ... --json tests/reports/game-capture-parity/report.json
 *   ... --fail-on-art        # gate mode: exit 1 if any ART branch remains
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const failOnArt = args.includes("--fail-on-art");

const CAPTURE_FLAG = /capture\s*===\s*"review"|visualReviewCapture|reviewCapture|captureMode|isCapture|CAPTURE_REVIEW/;

const ART = /\b(lights\.|effects\.|material\.|emissive|toneMapping|exposure|saturation|contrast|bloom|fog|colorGrade|antiAlias|shadow|\.background\(|\.addMany\(|\.add\(\s*$|castShadow|receiveShadow|envMap|roughness|metalness|clearcoat|visible:)/;
const FRAMING = /\b(camera|chase|fov|offset|targetOffset|smoothing|position|lookAt|rig)\b/i;
const TRANSIENT = /\b(particles?|trail|fx|effect|shake|reducedMotion|pulse|glow|spark|dust|smoke)\b/i;

function classify(line) {
  // Content-swapping branches are the worst kind: the capture build renders a
  // different world, so treat an empty-branch swap as ART even if it also moves
  // the camera.
  if (/\?\s*\[\s*\]\s*:/.test(line) || /:\s*\[\s*\]\s*,?\s*$/.test(line)) return "ART";
  if (ART.test(line)) return "ART";
  if (FRAMING.test(line)) return "FRAMING";
  if (TRANSIENT.test(line)) return "TRANSIENT";
  return "UNKNOWN";
}

const appsDir = join(repoRoot, "apps");
const routes = readdirSync(appsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && (/^showcase-/.test(d.name) || d.name === "aura-clash-showcase"))
  .map((d) => d.name);

const report = { generatedAt: new Date().toISOString(), routes: [], totals: { ART: 0, FRAMING: 0, TRANSIENT: 0, UNKNOWN: 0 } };

for (const route of routes) {
  const srcDir = join(appsDir, route, "src");
  if (!existsSync(srcDir)) continue;
  const findings = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const lines = readFileSync(p, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!CAPTURE_FLAG.test(line)) return;
        // The flag declaration itself and body dataset tagging are not divergences.
        if (/^const\s+\w*[Cc]apture\w*\s*=\s*urlParams|document\.body\.dataset/.test(line.trim())) return;
        findings.push({ file: p.replace(`${repoRoot}/`, ""), line: i + 1, kind: classify(line), text: line.trim().slice(0, 200) });
      });
    }
  };
  walk(srcDir);
  const counts = { ART: 0, FRAMING: 0, TRANSIENT: 0, UNKNOWN: 0 };
  for (const f of findings) counts[f.kind]++;
  for (const k of Object.keys(counts)) report.totals[k] += counts[k];
  if (findings.length) report.routes.push({ route, counts, findings });
}

report.routes.sort((a, b) => b.counts.ART - a.counts.ART);
const summary = {
  routesWithDivergence: report.routes.length,
  ART: report.totals.ART,
  FRAMING: report.totals.FRAMING,
  TRANSIENT: report.totals.TRANSIENT,
  UNKNOWN: report.totals.UNKNOWN,
};

if (jsonOut) {
  mkdirSync(dirname(resolve(repoRoot, jsonOut)), { recursive: true });
  writeFileSync(resolve(repoRoot, jsonOut), JSON.stringify(report, null, 2));
}

const lines = [
  "# Capture-parity audit",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  "ART branches make the reviewed screenshot a different scene from the shipped game.",
  "They must be converged onto one set of values.",
  "",
  "| Route | ART | FRAMING | TRANSIENT | UNKNOWN |",
  "|---|---|---|---|---|",
  ...report.routes.map((r) => `| ${r.route} | ${r.counts.ART} | ${r.counts.FRAMING} | ${r.counts.TRANSIENT} | ${r.counts.UNKNOWN} |`),
  `| **total** | **${summary.ART}** | **${summary.FRAMING}** | **${summary.TRANSIENT}** | **${summary.UNKNOWN}** |`,
  "",
];
const mdPath = jsonOut ? jsonOut.replace(/\.json$/, ".md") : null;
if (mdPath) writeFileSync(mdPath, lines.join("\n"));
console.log(lines.join("\n"));
console.log(`report -> ${jsonOut ?? "(stdout only)"}  ${mdPath ?? ""}`);

if (failOnArt && report.totals.ART > 0) {
  console.error(`capture-parity: ${report.totals.ART} ART divergence(s) remain`);
  process.exit(1);
}
