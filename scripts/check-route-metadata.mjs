#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "../apps/aura-clash-showcase/scripts/check-route-metadata.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const gameRoutes = [
  "showcase-blockfall-reactor",
  "showcase-turbo-drift-circuit",
  "showcase-skyline-runner"
];
const showcaseIndex = readFileSync(resolve(repoRoot, "apps/showcase-index/index.html"), "utf8");
const marketingBuilder = readFileSync(resolve(repoRoot, "marketing/scripts/build-showcase-routes.mjs"), "utf8");
const vercel = JSON.parse(readFileSync(resolve(repoRoot, "vercel.json"), "utf8"));

if (vercel.outputDirectory !== ".") {
  throw new Error("vercel.json must publish the repository-root app paths used by showcase game routes.");
}
for (const route of gameRoutes) {
  const publicPath = `/apps/${route}/`;
  if (!showcaseIndex.includes(publicPath)) {
    throw new Error(`apps/showcase-index/index.html is missing ${publicPath}`);
  }
  if (!marketingBuilder.includes(`"${route}"`)) {
    throw new Error(`marketing/scripts/build-showcase-routes.mjs is missing ${route}`);
  }
  const conflictingRewrite = (vercel.rewrites ?? []).find((entry) => (
    entry.source === publicPath || entry.source === publicPath.slice(0, -1)
  ) && !String(entry.destination ?? "").startsWith(publicPath));
  if (conflictingRewrite) {
    throw new Error(`vercel.json rewrites ${publicPath} away from its built static route.`);
  }
}

console.log(`[showcase game route-metadata] ${gameRoutes.length} game routes are indexed, built, and publishable at their direct Vercel paths.`);
