import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const assetIds = [
  "blockfallReactorArenaBackdrop",
  "blockfallReactorMechanicHero",
  "blockfallReactorPlasmaRival",
  "showcaseBlockfallCabinet"
];
const manifest = JSON.parse(readFileSync(join(repoRoot, "aura.assets.json"), "utf8"));
const assets = Object.fromEntries(assetIds.map((assetId) => [
  assetId,
  manifest.assets?.find((entry) => entry.id === assetId)
]));

for (const assetId of assetIds) {
  const asset = assets[assetId];
  if (!asset) throw new Error(`Missing typed asset ${assetId} from aura.assets.json`);
  if (asset.quality !== "release") {
    throw new Error(`Expected ${assetId} to remain release quality; received ${String(asset.quality)}`);
  }
}

const sourceFiles = walk(join(appDir, "src")).filter((path) => path.endsWith(".ts"));
const source = sourceFiles.map((path) => readFileSync(path, "utf8")).join("\n");
for (const assetId of assetIds) {
  if (!source.includes(`assets.${assetId}`)) {
    throw new Error(`Live route does not reference assets.${assetId}`);
  }
}

const primitiveOccurrences = Array.from(source.matchAll(/\bprimitives\.[A-Za-z_$][\w$]*/g)).length;
const acceptanceReportPath = join(repoRoot, "tests/reports/blockfall-reactor-fx/acceptance-states.json");
if (!existsSync(acceptanceReportPath)) {
  throw new Error("Missing current Blockfall exact acceptance-state report; run the focused browser spec first.");
}
const acceptanceReport = JSON.parse(readFileSync(acceptanceReportPath, "utf8"));
const requiredAcceptanceStates = ["play", "single-clear", "quad", "level-up", "danger", "game-over"];
if (acceptanceReport.kind !== "blockfall-reactor-exact-acceptance-states") {
  throw new Error("Unexpected Blockfall acceptance report kind.");
}
for (const state of requiredAcceptanceStates) {
  const receipt = acceptanceReport.receipts?.[state];
  if (!receipt?.checksum || !receipt?.screenshotSha256) {
    throw new Error(`Acceptance report is missing checksum/screenshot proof for ${state}.`);
  }
}
const sourceSha256 = createHash("sha256").update(source).digest("hex");
const routeHealth = {
  schema: "aura3d-route-health/1.0",
  generatedAt: new Date().toISOString(),
  appId: "showcase-blockfall-reactor",
  route: "/apps/showcase-blockfall-reactor/",
  classification: "prototype-blocked",
  publicShowcase: false,
  promotionStatus: "typed-cabinet-and-gameplay-evidence-bounded-candidate",
  renderer: {
    path: "createAuraApp root safe API",
    mode: "safe-basic",
    nativeWebGPU: false,
    productionRuntime: false
  },
  primaryAssets: [
    {
      typedRef: "assets.blockfallReactorArenaBackdrop",
      role: "primaryWorld",
      status: "typed-primary-asset",
      quality: assets.blockfallReactorArenaBackdrop.quality
    },
    {
      typedRef: "assets.showcaseBlockfallCabinet",
      role: "primaryWorld",
      status: "typed-primary-asset",
      quality: assets.showcaseBlockfallCabinet.quality
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
  blockers: ["independent exact-artifact review pending"],
  audioFxPass: {
    schema: "aura3d-blockfall-audio-fx/1.0",
    prd: "CurrentGames-PRD/04-Blockfall-Reactor.md",
    labelUnchanged: true,
    audio: {
      generator: "apps/showcase-blockfall-reactor/scripts/build-sfx.mjs",
      provenance: "CC0-1.0, author Aura3D synthesis, CLI-registered typed WAVs",
      gameplayCues: [
        "move", "rotate", "lock", "line-clear", "quad", "level-up",
        "hold-swap", "hard-drop", "game-over"
      ],
      ambientBus: "blockfallReactorHumLoop (looping, own bus)",
      musicLayering: "additive intensity stem every five levels via per-stem bus volumes"
    },
    boardView: {
      projectionModule: "src/board-view.ts",
      pools: "locked stack per-kind instanced sub-pools + single active-piece pool",
      parityTest: "tests/unit/apps/blockfall-board-view.test.ts",
      drawCallTelemetry: "mounted A/B probe; see window evidence boardView.drawCallTelemetry"
    },
    clearFx: {
      module: "src/clear-fx.ts",
      cameraPunch: "src/camera-feel.ts",
      reducedMotionGated: true
    },
    scoreboard: {
      module: "src/board-view.ts (createScoreboardNodes)",
      format: "zero-padded SCORE 000000 / LEVEL 01 via engine text3D glyph set"
    },
    attract: {
      module: "src/attract.ts",
      fixture: "tests/fixtures/blockfall/expert-run.json",
      regressionHarness: "tests/unit/apps/blockfall-attract.test.ts"
    },
    bloom: {
      shippedIntensity: 0.26,
      reducedFlashIntensity: 0.12,
      guards: { threshold: 0.55, maxIntensity: 1.6, antiBlowout: true },
      stills: "tests/reports/blockfall-reactor-bloom/ (before bloom-off / after shipped)"
    },
    browserSpecs: [
      "tests/browser/blockfall-reactor-audio-fx.spec.ts",
      "tests/browser/blockfall-bloom-stills.spec.ts"
    ]
  },
  evidence: {
    global: "window.__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__",
    sourceReview: "apps/showcase-blockfall-reactor/src/main.ts",
    sourceSha256,
    exactAcceptanceStates: {
      report: "tests/reports/blockfall-reactor-fx/acceptance-states.json",
      source: acceptanceReport.source,
      viewport: acceptanceReport.viewport,
      states: Object.fromEntries(requiredAcceptanceStates.map((state) => [state, {
        checksum: acceptanceReport.receipts[state].checksum,
        screenshot: acceptanceReport.receipts[state].screenshot,
        screenshotSha256: acceptanceReport.receipts[state].screenshotSha256
      }]))
    },
    reducedMotionScreenshot: "tests/reports/blockfall-reactor-fx/reduced-motion.png",
    currentMobileScreenshot: "tests/reports/blockfall-reactor-fx/acceptance-mobile-play.png",
    routePrimaryProbe: "tests/reports/showcase-route-primary-probes/showcase-blockfall-reactor.json",
    routePrimaryScreenshot: "tests/reports/showcase-route-primary-probes/showcase-blockfall-reactor.png",
    desktopScreenshot: "tests/reports/showcase-library-screenshots/showcase-blockfall-reactor-desktop.png",
    mobileScreenshot: "tests/reports/showcase-library-screenshots/showcase-blockfall-reactor-mobile.png",
    gameplayProof: "tests/reports/showcase-gameplay/showcase-blockfall-reactor.json",
    gameplayBeforeScreenshot: "tests/reports/showcase-gameplay/showcase-blockfall-reactor-before-input.png",
    gameplayAfterInputScreenshot: "tests/reports/showcase-gameplay/showcase-blockfall-reactor-after-input.png",
    releaseAssetProbes: Object.fromEntries(assetIds.map((assetId) => [
      assetId,
      `tests/reports/showcase-release-asset-probes/${assetId}.json`
    ])),
    deployCommand: `pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/showcase-blockfall-reactor/dist --release --source apps/showcase-blockfall-reactor/src ${assetIds.map((assetId) => `--asset ${assetId}`).join(" ")}`
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
