#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
// `showcase-public-racing-presentation-proof` was deleted (superseded by Turbo Drift Circuit), so the
// only remaining route with an established speed contract is the racing game-layer diagnostic.
const routes = [
  "showcase-racing-game-layer-proof"
];

for (const routeId of routes) {
  const modulePath = resolve(root, `apps/${routeId}/src/generated/game-geometry.ts`);
  const mainPath = resolve(root, `apps/${routeId}/src/main.ts`);
  let source = readFileSync(modulePath, "utf8");
  const main = readFileSync(mainPath, "utf8");
  const authoredLapSeconds = requiredNumber(source, /const authoredLapSeconds = ([\d.]+);/, "authoredLapSeconds", routeId);
  const targetSceneSizes = responsiveTargetSceneSizes(main, routeId);
  const centerlineBody = requiredMatch(source, /const roadCenterline = \[([\s\S]*?)\]\.map/, "roadCenterline", routeId);
  const points = [...centerlineBody.matchAll(/\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g)]
    .map((match) => ({ x: Number(match[1]), z: Number(match[2]) }));
  if (points.length < 2) throw new Error(`${routeId}: roadCenterline requires at least two points`);
  const routeLength = round3(points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.z - points[index].z), 0));
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  const routeSpan = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 0.001);
  const gameUnitsPerSecond = round3(routeLength / authoredLapSeconds);
  const compactSceneUnitsPerGameUnit = round3(targetSceneSizes.compact / routeSpan);
  const sceneUnitsPerGameUnit = round3(targetSceneSizes.standard / routeSpan);
  const speedModel = `const speedModel = {\n  kind: "route-length-over-authored-lap-seconds",\n  routeLength: ${routeLength},\n  authoredLapSeconds: ${authoredLapSeconds},\n  gameUnitsPerSecond: ${gameUnitsPerSecond},\n  sceneUnitsPerGameUnit: ${sceneUnitsPerGameUnit},\n  sceneUnitsPerSecond: ${round6(gameUnitsPerSecond * sceneUnitsPerGameUnit)},\n  responsiveSceneSpeeds: {\n    compact: { targetSceneSize: ${targetSceneSizes.compact}, sceneUnitsPerGameUnit: ${compactSceneUnitsPerGameUnit}, sceneUnitsPerSecond: ${round6(gameUnitsPerSecond * compactSceneUnitsPerGameUnit)} },\n    standard: { targetSceneSize: ${targetSceneSizes.standard}, sceneUnitsPerGameUnit: ${sceneUnitsPerGameUnit}, sceneUnitsPerSecond: ${round6(gameUnitsPerSecond * sceneUnitsPerGameUnit)} }\n  },\n  units: "game-and-scene-units-per-second"\n} as const;\n\n`;
  if (/const speedModel = \{[\s\S]*?\} as const;\n\n/.test(source)) {
    source = source.replace(/const speedModel = \{[\s\S]*?\} as const;\n\n/, speedModel);
  } else {
    source = source.replace(/const drivableBounds = /, `${speedModel}const drivableBounds = `);
  }
  source = source.replace(/routeWidth, authoredLapSeconds, (?!speedModel,)/g, "routeWidth, authoredLapSeconds, speedModel, ");
  writeFileSync(modulePath, source);
  console.log(`${routeId}: ${routeLength} game units / ${authoredLapSeconds}s = ${gameUnitsPerSecond} game units/s = ${round6(gameUnitsPerSecond * sceneUnitsPerGameUnit)} scene units/s`);
}

function responsiveTargetSceneSizes(source, routeId) {
  const match = source.match(/targetSceneSize:\s*compactViewport\s*\?\s*([\d.]+)\s*:\s*([\d.]+)/);
  if (match) return { compact: Number(match[1]), standard: Number(match[2]) };
  const fixed = Number(source.match(/targetSceneSize:\s*([\d.]+)/)?.[1]);
  if (Number.isFinite(fixed) && fixed > 0) return { compact: fixed, standard: fixed };
  throw new Error(`${routeId}: missing targetSceneSize`);
}

function requiredMatch(source, pattern, field, routeId) {
  const match = source.match(pattern)?.[1];
  if (!match) throw new Error(`${routeId}: missing ${field}`);
  return match;
}
function requiredNumber(source, pattern, field, routeId) {
  const value = Number(requiredMatch(source, pattern, field, routeId));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${routeId}: invalid ${field}`);
  return value;
}
function round3(value) { return Number(value.toFixed(3)); }
function round6(value) { return Number(value.toFixed(6)); }
