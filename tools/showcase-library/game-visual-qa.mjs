import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { readPngForegroundMetrics } from "./png-foreground.mjs";
import { createRouteSourceHash } from "./route-primary-probes.mjs";

export const GAME_VISUAL_QA_CHECKS = [
  "subject-bound-to-surface", "contact", "camera-readability", "scale-contract", "debug-guide-absence", "hud-occlusion-budget"
];
const compositionCheck = {
  "subject-bound-to-surface": "binding-overlap", contact: "contact", "camera-readability": "camera-readability",
  "scale-contract": "scale-contract", "debug-guide-absence": "debug-guide-absence"
};

export function validateGameVisualQa(input) {
  const root = resolve(input.root ?? process.cwd());
  const routeId = input.route.id;
  const category = input.route.gameTemplateStatus?.category;
  const failures = [];
  const health = input.routeHealth ?? readJson(root, `apps/${routeId}/route-health.json`, failures, "route-health");
  const pair = record(health?.gameAssetPairEvidence);
  const compositionPath = string(pair?.compositionReport);
  const probePath = `tests/reports/showcase-route-primary-probes/${routeId}.json`;
  const composition = compositionPath ? readJson(root, compositionPath, failures, "composition") : undefined;
  if (!compositionPath) failures.push("composition-path-missing");
  const probe = readJson(root, probePath, failures, "route-primary");
  const screenshotPath = string(composition?.screenshot?.path) ?? `tests/reports/showcase-route-primary-probes/${routeId}.png`;
  const screenshotAbsolute = safeResolve(root, screenshotPath, failures, "screenshot");
  let pngMetrics;
  if (screenshotAbsolute && existsSync(screenshotAbsolute)) {
    try { pngMetrics = input.pngMetrics ?? readPngForegroundMetrics(screenshotAbsolute, probe?.renderedProbe?.analysisCrop); }
    catch (error) { failures.push(`png-analysis:${error instanceof Error ? error.message : String(error)}`); }
  } else if (screenshotAbsolute) failures.push(`screenshot-missing:${screenshotPath}`);

  const checks = [];
  for (const id of GAME_VISUAL_QA_CHECKS.slice(0, 5)) {
    const sourceId = compositionCheck[id];
    const source = Array.isArray(composition?.checks) ? composition.checks.find((check) => check?.id === sourceId) : undefined;
    const blockers = [];
    if (!source) blockers.push(`composition-check-missing:${sourceId}`);
    else if (source.verdict !== "pass") blockers.push(...(Array.isArray(source.blockers) && source.blockers.length ? source.blockers : [`composition-check-fail:${sourceId}`]));
    checks.push({ id, verdict: blockers.length ? "fail" : "pass", source: sourceId, tolerance: source?.tolerance ?? {}, measured: source?.measured ?? {}, blockers });
  }
  const rendered = record(probe?.renderedProbe);
  const compositionProbe = record(probe?.compositionProbe);
  const injectedPngMetrics = input.pngMetrics !== undefined;
  const subjectBounds = injectedPngMetrics ? pngMetrics?.foregroundBounds : record(compositionProbe?.subjectBounds) ?? record(rendered?.foregroundBounds);
  const analysisCrop = injectedPngMetrics ? pngMetrics?.crop : record(rendered?.analysisCrop) ?? pngMetrics?.crop;
  const subjectClipped = injectedPngMetrics ? pngMetrics?.clipped : compositionProbe?.subjectClipped ?? rendered?.clipped;
  const subjectReadabilityScore = injectedPngMetrics ? pngMetrics?.readabilityScore : compositionProbe?.subjectReadabilityScore ?? rendered?.readabilityScore;
  const hudBlockers = [];
  const minReadabilityScore = 30;
  const maxForegroundAreaRatio = 0.78;
  const foregroundAreaRatio = subjectBounds && analysisCrop
    ? round((subjectBounds.width * subjectBounds.height) / (analysisCrop.width * analysisCrop.height)) : 0;
  if (rendered?.occludedByUi !== false) hudBlockers.push(`hud-occluded:${String(rendered?.occludedByUi)}`);
  if (rendered?.clipped !== false || subjectClipped !== false) hudBlockers.push("hud-subject-clipped");
  if (typeof subjectReadabilityScore !== "number" || subjectReadabilityScore < minReadabilityScore) hudBlockers.push(`hud-readability:${String(subjectReadabilityScore)}`);
  if (foregroundAreaRatio > maxForegroundAreaRatio) hudBlockers.push(`hud-foreground-area:${foregroundAreaRatio}`);
  checks.push({ id: "hud-occlusion-budget", verdict: hudBlockers.length ? "fail" : "pass", source: "route-primary-subject-isolation", tolerance: { occludedByUi: false, clipped: false, minReadabilityScore, maxForegroundAreaRatio }, measured: { occludedByUi: rendered?.occludedByUi, clipped: subjectClipped, readabilityScore: subjectReadabilityScore, foregroundAreaRatio }, blockers: hudBlockers });

  if (composition?.schema !== "aura3d-showcase-asset-pair-composition/1.0") failures.push(`composition-schema:${String(composition?.schema)}`);
  if (composition?.routeId !== routeId) failures.push(`composition-route:${String(composition?.routeId)}`);
  if (composition?.category !== category) failures.push(`composition-category:${String(composition?.category)}`);
  if (composition?.verdict !== "pass" || composition?.pass !== true) failures.push(`composition-verdict:${String(composition?.verdict)}`);
  if (probe?.routeId !== routeId || probe?.pass !== true) failures.push(`route-primary-verdict:${String(probe?.pass)}`);
  if (pair?.verdict !== "pass") failures.push(`route-health-pair-verdict:${String(pair?.verdict)}`);
  if (pair?.screenshotEvidence !== screenshotPath) failures.push("route-health-screenshot-link");
  const screenshotHash = screenshotAbsolute && existsSync(screenshotAbsolute) ? hash(readFileSync(screenshotAbsolute)) : undefined;
  if (screenshotHash && composition?.screenshot?.sha256 !== screenshotHash) failures.push("composition-screenshot-stale");
  if (screenshotHash && rendered?.sha256 !== screenshotHash) failures.push("route-primary-screenshot-stale");
  if (probe?.sourceHash !== createRouteSourceHash(routeId, root)) failures.push("route-primary-source-stale");
  const healthAbsolute = safeResolve(root, `apps/${routeId}/route-health.json`, failures, "route-health");
  if (healthAbsolute && existsSync(healthAbsolute) && probe?.routeHealthHash !== hash(readFileSync(healthAbsolute))) failures.push("route-primary-health-stale");
  for (const check of checks) if (check.verdict !== "pass") failures.push(...check.blockers.map((blocker) => `${check.id}:${blocker}`));
  const unique = [...new Set(failures)];
  return { schema: "aura3d-game-visual-qa/1.0", routeId, category, verdict: unique.length ? "fail" : "pass", pass: unique.length === 0, compositionReport: compositionPath, routePrimaryProbe: probePath, screenshot: { path: screenshotPath, sha256: screenshotHash, metrics: pngMetrics }, checks, blockers: unique };
}

export function writeGameVisualQaReport(input, outputPath) {
  const report = validateGameVisualQa(input); const path = resolve(input.root ?? process.cwd(), outputPath ?? `tests/reports/showcase-game-visual-qa/${input.route.id}.json`);
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`); return report;
}
function readJson(root, path, failures, label) { const absolute = safeResolve(root, path, failures, label); if (!absolute) return undefined; if (!existsSync(absolute)) { failures.push(`${label}-missing:${path}`); return undefined; } try { return JSON.parse(readFileSync(absolute, "utf8")); } catch { failures.push(`${label}-invalid-json:${path}`); return undefined; } }
function safeResolve(root, path, failures, label) { if (typeof path !== "string" || !path || isAbsolute(path) || path.includes("\0")) { failures.push(`${label}-unsafe-path:${String(path)}`); return undefined; } const absolute = resolve(root, path); const rel = relative(root, absolute); if (rel.startsWith("..") || isAbsolute(rel)) { failures.push(`${label}-unsafe-path:${path}`); return undefined; } return absolute; }
function record(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : undefined; }
function string(value) { return typeof value === "string" && value ? value : undefined; }
function hash(bytes) { return `sha256-${createHash("sha256").update(bytes).digest("hex")}`; }
function round(value) { return Math.round(value * 10000) / 10000; }
