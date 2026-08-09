import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const assetId = "showcaseBlockfallCabinet";
const manifest = JSON.parse(readFileSync(join(repoRoot, "aura.assets.json"), "utf8"));
const asset = manifest.assets?.find((entry) => entry.id === assetId);

if (!asset) throw new Error(`Missing typed asset ${assetId} from aura.assets.json`);
if (asset.quality !== "release") {
  throw new Error(`Expected ${assetId} to remain release quality; received ${String(asset.quality)}`);
}

const sourceFiles = walk(join(appDir, "src")).filter((path) => path.endsWith(".ts"));
const source = sourceFiles.map((path) => readFileSync(path, "utf8")).join("\n");
if (!source.includes(`assets.${assetId}`)) {
  throw new Error(`Live route does not reference assets.${assetId}`);
}

const primitiveOccurrences = Array.from(source.matchAll(/\bprimitives\.[A-Za-z_$][\w$]*/g)).length;
const routeHealth = {
  schema: "aura3d-route-health/1.0",
  generatedAt: new Date().toISOString(),
  appId: "showcase-blockfall-reactor",
  route: "/apps/showcase-blockfall-reactor/",
  classification: "release-ready candidate",
  publicShowcase: true,
  promotionStatus: "typed-cabinet-and-gameplay-evidence-bounded-candidate",
  renderer: {
    path: "createAuraApp root safe API",
    mode: "safe-basic",
    nativeWebGPU: false,
    productionRuntime: false
  },
  primaryAssets: [
    {
      typedRef: `assets.${assetId}`,
      role: "primaryWorld",
      status: "typed-primary-asset",
      quality: asset.quality
    }
  ],
  primitiveStatus: {
    sourceOccurrences: primitiveOccurrences,
    primitiveBudget: 40,
    role: "falling-block cells, board rails, ghost guides, reactor indicators, and collision visuals inside the typed arcade cabinet",
    status: "gameplay-geometry-with-typed-primary-cabinet"
  },
  claimStatus: {
    status: "bounded",
    label: "createAuraApp",
    allowed: [
      "falling-block development showcase",
      "catalog-sourced typed arcade-cabinet environment",
      "public game.fallingBlocks gameplay state",
      "keyboard and touch interaction proof",
      "deterministic line-clear scoring proof",
      "route-selected Rapier fidelity proof"
    ],
    notAllowed: [
      "reusable falling-block game kit",
      "commercial game launch readiness",
      "generic collision-system claim"
    ]
  },
  blockers: [],
  evidence: {
    global: "window.__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__",
    sourceReview: "apps/showcase-blockfall-reactor/src/main.ts",
    routePrimaryProbe: "tests/reports/showcase-route-primary-probes/showcase-blockfall-reactor.json",
    routePrimaryScreenshot: "tests/reports/showcase-route-primary-probes/showcase-blockfall-reactor.png",
    desktopScreenshot: "tests/reports/showcase-library-screenshots/showcase-blockfall-reactor-desktop.png",
    mobileScreenshot: "tests/reports/showcase-library-screenshots/showcase-blockfall-reactor-mobile.png",
    gameplayProof: "tests/reports/showcase-gameplay/showcase-blockfall-reactor.json",
    gameplayBeforeScreenshot: "tests/reports/showcase-gameplay/showcase-blockfall-reactor-before-input.png",
    gameplayAfterInputScreenshot: "tests/reports/showcase-gameplay/showcase-blockfall-reactor-after-input.png",
    releaseAssetProbes: {
      [assetId]: `tests/reports/showcase-release-asset-probes/${assetId}.json`
    },
    deployCommand: `pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/showcase-blockfall-reactor/dist --release --source apps/showcase-blockfall-reactor/src --asset ${assetId}`
  },
  physics: {
    backend: "rapier",
    scope: "route-selected showcase fidelity proof"
  }
};

writeFileSync(join(appDir, "route-health.json"), `${JSON.stringify(routeHealth, null, 2)}\n`);

function walk(path) {
  const entries = readdirSync(path).sort();
  return entries.flatMap((entry) => {
    const child = join(path, entry);
    return statSync(child).isDirectory() ? walk(child) : [child];
  });
}
