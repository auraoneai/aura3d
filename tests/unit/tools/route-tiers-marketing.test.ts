import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyRoute,
  collectUnclassifiedRows,
  isHostingRedirectedApp,
  liveGameIssue,
  missingInventoryAppRows,
  missingMarketingAppRows,
  parseCatalogRoutePlan,
  parseGameInventory,
  parseHostingRedirects,
  readCatalogRoutePlan,
  readClassificationLabels,
  readGameInventory,
  readGateRoutes,
  readHostingRedirects,
  readMarketingRoutes
} from "../../../tools/route-tiers/index";
import type { GameInventoryEntry, GateRoute, RouteClassificationInput } from "../../../tools/route-tiers/index";
import { parseAliasBuildContract, parseMarketingRoutes } from "../../../tools/route-tiers/marketing";

const declarations = {
  showcaseRoutes: 'const showcaseRoutes = ["live-game", "blocked-live", "dual-route"];',
  evidenceRoutes: 'const evidenceRoutes = ["live-evidence"];',
  retiredPrototypeRoutes: 'const retiredPrototypeRoutes = ["retired-legacy", "dual-route"];',
  publicRoutes: "const publicRoutes = [...showcaseRoutes, ...evidenceRoutes];"
};
type ListName = keyof typeof declarations;

function script(overrides: Partial<Record<ListName, string>> = {}): string {
  return (Object.keys(declarations) as ListName[]).map((name) => overrides[name] ?? declarations[name]).join("\n");
}

const fixtureMarketing = parseMarketingRoutes(script());

function classify(id: string, overrides: Partial<RouteClassificationInput> = {}) {
  return classifyRoute({
    root: "apps",
    id,
    documented: false,
    template: false,
    specDriven: false,
    interactive: false,
    hasRouteHealth: false,
    marketing: fixtureMarketing,
    hostingRedirects: parseHostingRedirects(""),
    sourceRoute: true,
    ...overrides
  });
}

function candidate(id: string, published = true): GateRoute {
  return { id, releaseClass: "release-ready candidate", published };
}

describe("route tiers use the marketing build's actual route lists", () => {
  it("reads the real script and demotes all four redirected legacy release candidates", () => {
    const marketing = readMarketingRoutes();
    const gateFile = JSON.parse(readFileSync(
      new URL("../../../tools/showcase-library/route-gates.json", import.meta.url),
      "utf8"
    )) as { readonly routes: readonly GateRoute[] };
    expect(marketing.publicRoutes.has("showcase-top-tennis")).toBe(true);

    for (const id of [
      "showcase-product-configurator",
      "showcase-smart-city-control",
      "showcase-cinematic-architecture",
      "showcase-digital-twin-ops"
    ]) {
      const gate = gateFile.routes.find((route) => route.id === id);
      expect(gate, id).toMatchObject({ releaseClass: "release-ready candidate", published: true });
      expect(marketing.redirectedRoutes.has(id), id).toBe(true);
      expect(marketing.publicRoutes.has(id), id).toBe(false);
      const row = classify(id, {
        gate,
        classificationLabel: "release-ready candidate",
        documented: true,
        template: true,
        specDriven: true,
        marketing
      });
      expect(row, id).toMatchObject({ tier: 3, releaseClass: "release-ready candidate" });
      expect(row.rationale, id).toMatch(/marketing\/scripts\/build-showcase-routes\.mjs redirects/);
    }
  });

  it.each([true, false])(
    "keeps an actually published release-ready gate in Tier 1 when legacy published=%s",
    (published) => {
      const row = classify("live-game", {
        gate: candidate("live-game", published),
        classificationLabel: "release-ready candidate"
      });
      expect(row).toMatchObject({ tier: 1, releaseClass: "release-ready candidate" });
      expect(row.rationale).toContain("marketing build's public routes");
    }
  );

  it("recognizes a public gate in evidenceRoutes and a public documented candidate without a gate", () => {
    expect(classify("live-evidence", { gate: candidate("live-evidence") }).tier).toBe(1);
    expect(classify("live-game", { classificationLabel: "release-ready candidate" }).tier).toBe(1);
  });

  it.each([
    "showcase-bunker-zero",
    "showcase-serpentine-sky-run-port",
    "showcase-top-tennis"
  ])("reports real public game %s as unclassified when its release metadata is missing", (id) => {
    const marketing = readMarketingRoutes();
    expect(marketing.publicRoutes.has(id)).toBe(true);
    expect(marketing.redirectedRoutes.has(id)).toBe(false);
    const row = classify(id, {
      marketing,
      gate: undefined,
      classificationLabel: undefined,
      documented: true,
      template: true,
      specDriven: true
    });
    expect(row).toMatchObject({ root: "apps", tier: 3 });
    expect(row.rationale).toMatch(/^UNCLASSIFIED — marketing\/scripts\/build-showcase-routes\.mjs/);
    expect(row.rationale).toMatch(/route-gates\.json.*explicit release-ready candidate/);
    expect(collectUnclassifiedRows([row]).map((entry) => `${entry.root}/${entry.id}`)).toEqual([`apps/${id}`]);
  });

  it("reports all currently published apps lacking both real gate and classification entries", () => {
    const marketing = readMarketingRoutes();
    const gates = readGateRoutes();
    const labels = readClassificationLabels();
    const missing = [...marketing.publicRoutes].filter((id) =>
      !marketing.redirectedRoutes.has(id) && !gates.has(id) && !labels.has(id)
    );
    const rows = missing.map((id) => classify(id, {
      marketing,
      gate: gates.get(id),
      classificationLabel: labels.get(id),
      documented: true,
      template: true,
      specDriven: true
    }));
    expect(collectUnclassifiedRows(rows).map((row) => row.id)).toEqual(missing);
  });

  it.each([undefined, "starter example", "library demo", "unknown state"])(
    "does not let generic labels or references hide a missing public release gate (%s)",
    (classificationLabel) => {
      const row = classify("live-game", {
        classificationLabel,
        documented: true,
        template: true,
        specDriven: true
      });
      expect(row.tier).toBe(3);
      expect(row.rationale).toMatch(/^UNCLASSIFIED.*route-gates\.json/);
    }
  );

  it("does not apply another app's release gate to a public route", () => {
    const row = classify("live-game", { gate: candidate("other-game"), documented: true, specDriven: true });
    expect(row.tier).toBe(3);
    expect(row.rationale).toMatch(/^UNCLASSIFIED.*route-gates\.json/);
  });

  it("does not promote an unlisted release candidate, even when it is a legacy published probe", () => {
    for (const gate of [candidate("unlisted-legacy"), undefined]) {
      const row = classify("unlisted-legacy", {
        gate,
        classificationLabel: "release-ready candidate",
        documented: true,
        template: true,
        specDriven: true
      });
      expect(row.tier).toBe(3);
      expect(row.rationale).toMatch(/not included.*public routes/);
    }
    expect(classify("unlisted-legacy", { gate: candidate("unlisted-legacy") }).tier).toBe(3);
    expect(classify("unlisted-legacy", { gate: candidate("unlisted-legacy"), specDriven: true }).tier).toBe(3);
  });

  it("keeps independently documented and template routes in Tier 2", () => {
    expect(classify("documented-app", { classificationLabel: "starter example" }).tier).toBe(2);
    expect(classify("documented-app", { classificationLabel: "library demo" }).tier).toBe(2);
    expect(classify("documented-app", { documented: true }).tier).toBe(2);
    expect(classify("template-app", { template: true }).tier).toBe(2);
    expect(classify("documented-app", {
      gate: candidate("documented-app"),
      classificationLabel: "starter example"
    }).tier).toBe(2);
    expect(classify("documented-app", { gate: candidate("documented-app"), documented: true }).tier).toBe(2);
    expect(classify("spec-example", { specDriven: true }).tier).toBe(2);
  });

  it("scopes app gate and redirect lists to apps, not same-named documented examples", () => {
    expect(classify("retired-legacy", {
      root: "examples",
      gate: { id: "retired-legacy", releaseClass: "prototype-blocked" },
      classificationLabel: "starter example"
    }).tier).toBe(2);
    expect(classify("live-game", { root: "examples", classificationLabel: "starter example" }).tier).toBe(2);
  });

  it("lets redirects override both a public-list overlap and all positive route signals", () => {
    for (const id of ["retired-legacy", "dual-route"]) {
      const row = classify(id, {
        gate: candidate(id),
        classificationLabel: "starter example",
        documented: true,
        template: true,
        specDriven: true
      });
      expect(row.tier, id).toBe(3);
      expect(row.rationale, id).toContain("redirects");
    }
    expect(fixtureMarketing.publicRoutes.has("dual-route")).toBe(true);

    const documentedRedirect = classify("retired-legacy", { documented: true });
    expect(documentedRedirect.tier).toBe(3);
    expect(documentedRedirect.rationale).toMatch(/shipped document.*redirects/);
  });

  it.each([
    "prototype-blocked",
    "blocked",
    "internal-diagnostic",
    "game-layer-diagnostic",
    "removed-from-public-showcase",
    "prototype",
    "unknown-class",
    undefined
  ])("never promotes a public-listed gate with class %s", (releaseClass) => {
    const row = classify("blocked-live", {
      gate: { id: "blocked-live", releaseClass, published: true },
      classificationLabel: "release-ready candidate",
      documented: true,
      template: true,
      specDriven: true
    });
    expect(row.tier).toBe(3);
    expect(row.rationale).toContain("route-gates.json");
    if (releaseClass === undefined || releaseClass === "unknown-class") {
      expect(row.rationale).toMatch(/^UNCLASSIFIED/);
    } else {
      expect(row.rationale).not.toMatch(/^UNCLASSIFIED/);
    }
  });

  it.each(["blocked", "prototype-blocked", "prototype", "playable-showcase", "internal diagnostic"])(
    "never lets a release-ready gate override the non-public documentation label %s",
    (classificationLabel) => {
      const row = classify("live-game", { gate: candidate("live-game"), classificationLabel });
      expect(row.tier).toBe(3);
      expect(row.rationale).toContain("classification doc");
      expect(row.rationale).not.toMatch(/^UNCLASSIFIED/);
    }
  );

  it("does not promote an unknown documentation label merely because a gate is public-listed", () => {
    const row = classify("live-game", { gate: candidate("live-game"), classificationLabel: "unknown release state" });
    expect(row.tier).toBe(3);
    expect(row.rationale).toMatch(/^UNCLASSIFIED/);
  });

  it("keeps the real public showcase index as an index, not an ungated game", () => {
    const marketing = readMarketingRoutes();
    const { routes } = JSON.parse(readFileSync(
      new URL("../../../tools/showcase-library/route-gates.json", import.meta.url),
      "utf8"
    )) as { readonly routes: readonly GateRoute[] };
    const row = classify("showcase-index", {
      marketing,
      gate: routes.find((route) => route.id === "showcase-index"),
      classificationLabel: "index route",
      documented: true,
      specDriven: true
    });
    expect(marketing.publicRoutes.has("showcase-index")).toBe(true);
    expect(row).toMatchObject({ tier: 3, releaseClass: "index-route" });
    expect(row.rationale).not.toMatch(/^UNCLASSIFIED/);
  });

  it("does not let an inapplicable index-route gate hide a published game", () => {
    const row = classify("live-game", {
      gate: { id: "live-game", releaseClass: "index-route" },
      documented: true,
      specDriven: true
    });
    expect(row.tier).toBe(3);
    expect(row.rationale).toMatch(/^UNCLASSIFIED.*index-route/);
  });

  it("retains a missing public app as an unclassified report row rather than silently dropping it", () => {
    const existing = [
      classify("live-game", { gate: candidate("live-game") }),
      classify("blocked-live", { gate: { id: "blocked-live", releaseClass: "prototype-blocked" } }),
      classify("live-evidence", { root: "examples", documented: true })
    ];
    const missing = missingMarketingAppRows(fixtureMarketing, existing);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({
      id: "live-evidence",
      root: "apps",
      tier: 3,
      interactive: false,
      hasRouteHealth: false
    });
    expect(missing[0]!.rationale).toMatch(/^UNCLASSIFIED.*no source route/);
    expect(collectUnclassifiedRows([...existing, ...missing]).map((entry) => `${entry.root}/${entry.id}`))
      .toEqual(["apps/live-evidence"]);
    expect(missing.some((row) => row.id === "dual-route")).toBe(false);
  });
});

const sampleGame: GameInventoryEntry = {
  slug: "live-game",
  appFolder: "showcase-live-game",
  url: "/apps/showcase-live-game/",
  title: "Live Game",
  genre: "arcade",
  verification: "playable",
  evidenceFolder: "evidence/live-game",
  kind: "game",
  status: "live"
};

function inventoryText(games: readonly GameInventoryEntry[] = [sampleGame]): string {
  const live = games.filter((game) => game.kind === "game" && game.status === "live");
  return JSON.stringify({
    schema: "aura3d-game-inventory/1",
    liveGameCount: live.length,
    genres: { arcade: "Arcade" },
    genreCounts: { arcade: live.length },
    games: games.map((game) => ({ ...game, screens: null }))
  });
}

const gameMarketing = parseMarketingRoutes([
  'const showcaseRoutes = ["showcase-live-game", "showcase-blocked-live", "showcase-retired-game", "showcase-public-missing"];',
  'const retiredPrototypeRoutes = ["showcase-retired-game"];',
  "const evidenceRoutes = [];",
  "const publicRoutes = [...showcaseRoutes, ...evidenceRoutes];"
].join("\n"));

function catalogText(games: readonly GameInventoryEntry[] = [sampleGame]): string {
  return JSON.stringify({
    schema: "aura3d-site-games-catalog/1",
    genres: { arcade: "Arcade" },
    games: games.map((game) => ({
      appFolder: game.appFolder,
      previewSlug: game.slug,
      url: game.url,
      title: game.title,
      genre: game.genre,
      verification: game.verification,
      evidenceFolder: game.evidenceFolder.replace(/^evidence\//, "")
    }))
  });
}

const noHostingRedirects = parseHostingRedirects("");
const gameReserved = new Set(["showcase-retired-game"]);
const gamePlan = await parseCatalogRoutePlan(catalogText(), gameMarketing, gameReserved, noHostingRedirects);

function gameRow(game: GameInventoryEntry, overrides: Partial<RouteClassificationInput> = {}) {
  return classify(game.appFolder, { marketing: gameMarketing, gameInventory: game, aliasPlan: gamePlan, ...overrides });
}

const realGames = readGameInventory();
const realMarketing = readMarketingRoutes();
const realRedirects = readHostingRedirects();
const realBuildSource = readFileSync("marketing/scripts/build-showcase-routes.mjs", "utf8");
const realReserved = parseAliasBuildContract(realBuildSource);
const realPlan = await readCatalogRoutePlan(realMarketing, realReserved, realRedirects);
const missingRedirectFile = join(tmpdir(), `missing-route-tier-redirects-${randomUUID()}`);
const cleanHosting = readHostingRedirects(missingRedirectFile);
const cleanPlan = await readCatalogRoutePlan(realMarketing, realReserved, cleanHosting);
const realGates = readGateRoutes();
const realLabels = readClassificationLabels();
const expectedGameIds = [
  "showcase-top-tennis", "showcase-roadster-rush", "showcase-heatsink", "showcase-teleoperator",
  "showcase-iron-crown", "showcase-pips-big-leap", "showcase-aura-hoops-3d", "showcase-aura-diamond-3d",
  "showcase-aura-fc-3d", "showcase-aura-links-3d", "showcase-bunker-zero", "showcase-slingshot-siege",
  "showcase-dot-dash-3d", "showcase-cross-hop", "showcase-strange-orbit-port", "showcase-splat-rush-port",
  "showcase-serpentine-sky-run-port", "showcase-drift-and-deliver-port", "showcase-heatsink-port",
  "showcase-ninja-runner-port", "showcase-last-train-port", "showcase-roadster-hours-port",
  "showcase-where-the-wind-wanders-port", "showcase-silt-and-signal-port", "showcase-cloud-runner-port",
  "showcase-shape-shift-sprint", "showcase-number-surge", "showcase-splat-turf", "showcase-polarity-orbs",
  "showcase-beat-hopper"
];
const redirectedAliases: Readonly<Record<string, string>> = {
  "showcase-strange-orbit-port": "/apps/craterline-gp/",
  "showcase-splat-rush-port": "/apps/chroma-roll/",
  "showcase-serpentine-sky-run-port": "/apps/serpentine-sky-run/",
  "showcase-drift-and-deliver-port": "/apps/gridlock-courier/",
  "showcase-heatsink-port": "/apps/ion-circuit/",
  "showcase-ninja-runner-port": "/apps/shadowstep-gauntlet/",
  "showcase-last-train-port": "/apps/lamplight-line/",
  "showcase-roadster-hours-port": "/apps/saltwind-highway/",
  "showcase-where-the-wind-wanders-port": "/apps/the-bellkeepers-walk/",
  "showcase-silt-and-signal-port": "/apps/duneglide/",
  "showcase-cloud-runner-port": "/apps/cumulus-dash/"
};

describe("live game inventory classification", () => {
  it("covers exactly the 30 generated live game identities", () => {
    expect([...realGames.keys()].sort()).toEqual([...expectedGameIds].sort());
    expect([...realGames.values()].every((game) => game.kind === "game" && game.status === "live")).toBe(true);
    expect(realPlan.aliases.size).toBe(11);
  });

  it.each(expectedGameIds)("keeps ungated live game %s at its documented non-release Tier 3 label with and without host redirects", (id) => {
    const game = realGames.get(id)!;
    const sourceRoute = existsSync(join("apps", id, "index.html"));
    expect(sourceRoute).toBe(true);
    expect(game.appFolder).toBe(`showcase-${game.slug}`);
    expect(realMarketing.publicRoutes.has(id)).toBe(true);
    expect(realMarketing.redirectedRoutes.has(id)).toBe(false);
    expect(realGates.get(id)?.releaseClass).not.toBe("release-ready candidate");
    expect(realLabels.get(id) ?? "").not.toMatch(/^release-ready candidate/);
    // apps-classification.md "Published Games Without Release Gates" (2026-11-03): no gate evidence,
    // so each live game carries the conservative non-release label rather than staying unclassified.
    expect(realLabels.get(id)).toBe("development showcase");
    const alias = redirectedAliases[id];
    if (alias) {
      expect(game.url).toBe(alias);
      expect(realPlan.aliases.get(id)).toMatchObject({ appFolder: id, url: alias, sourceUrl: `/apps/${id}/` });
    } else {
      expect(game.url).toBe(`/apps/${id}/`);
      expect(realPlan.aliases.has(id)).toBe(false);
    }
    for (const [hostingRedirects, aliasPlan] of [[realRedirects, realPlan], [cleanHosting, cleanPlan]] as const) {
      expect(liveGameIssue(game, id, realMarketing, hostingRedirects, sourceRoute, aliasPlan)).toBeUndefined();
      const row = classify(id, {
        marketing: realMarketing, hostingRedirects, aliasPlan, sourceRoute, gameInventory: game,
        gate: realGates.get(id), classificationLabel: realLabels.get(id)
      });
      expect(row.tier).toBe(3);
      expect(row.rationale).toBe("classification doc: development showcase");
      // Without the label the same route is still refused, so the label is the only thing classifying it.
      const unlabelled = classify(id, {
        marketing: realMarketing, hostingRedirects, aliasPlan, sourceRoute, gameInventory: game,
        gate: realGates.get(id)
      });
      expect(unlabelled.tier).toBe(3);
      expect(unlabelled.rationale).toMatch(/^UNCLASSIFIED/);
      if (isHostingRedirectedApp(id, hostingRedirects)) {
        expect(unlabelled.rationale).toContain("same game's catalog-planned canonical alias");
        expect(unlabelled.rationale).toContain("source route remains Tier 3");
      } else {
        expect(unlabelled.rationale).toContain("release-ready candidate");
      }
    }
  });

  it("never treats live inventory/catalog membership as a release-ready signal", () => {
    const game = parseGameInventory(inventoryText()).get(sampleGame.appFolder)!;
    const row = gameRow(game);
    expect(row).toMatchObject({ root: "apps", tier: 3 });
    expect(row.rationale).toMatch(/^UNCLASSIFIED.*release-ready candidate/);
    expect(row.rationale).toContain("do not supply release eligibility");
    expect(row).not.toHaveProperty("visualApproved");
    expect(row).not.toHaveProperty("releaseAccepted");
    expect(row).not.toHaveProperty("gameChecksPassed");
    expect(gameRow(game, { gate: candidate(game.appFolder) }).tier).toBe(1);
    expect(gameRow(game, { classificationLabel: "release-ready candidate" }).tier).toBe(1);
  });

  it("keeps a legacy root redirect Tier 3 even when it targets the same canonical alias", async () => {
    const game = { ...sampleGame, url: "/apps/canonical-game/" };
    const hostingRedirects = parseHostingRedirects([
      "/apps/showcase-live-game /apps/canonical-game/ 301",
      "/apps/showcase-live-game/ /apps/canonical-game/ 301"
    ].join("\n"));
    const aliasPlan = await parseCatalogRoutePlan(catalogText([game]), gameMarketing, gameReserved, hostingRedirects);
    expect(aliasPlan.aliases.get(game.appFolder)).toMatchObject({
      url: game.url, sourceUrl: `/apps/${game.appFolder}/`, slug: "canonical-game"
    });
    expect(isHostingRedirectedApp(game.appFolder, hostingRedirects)).toBe(true);
    expect(liveGameIssue(game, game.appFolder, gameMarketing, hostingRedirects, true, aliasPlan)).toBeUndefined();
    const row = gameRow(game, { hostingRedirects, aliasPlan });
    expect(row.tier).toBe(3);
    expect(row.rationale).toMatch(/^UNCLASSIFIED/);
    expect(row.rationale).toContain("same game's catalog-planned canonical alias /apps/canonical-game/");
    expect(row.rationale).toContain("alias has no inherited release gate");
    const gated = gameRow(game, { hostingRedirects, aliasPlan, gate: candidate(game.appFolder) });
    expect(gated.tier).toBe(3);
    expect(gated.rationale).toContain("source route remains Tier 3");
    const labelled = gameRow(game, { hostingRedirects, aliasPlan, classificationLabel: "release-ready candidate" });
    expect(labelled.tier).toBe(3);
    const missingSource = gameRow(game, { hostingRedirects, aliasPlan, sourceRoute: false });
    expect(missingSource.tier).toBe(3);
    expect(missingSource.rationale).toMatch(/^UNCLASSIFIED.*no source route/);
    for (const releaseClass of ["blocked", "prototype-blocked", "prototype"]) {
      const blocked = gameRow(game, { hostingRedirects, aliasPlan, gate: { id: game.appFolder, releaseClass } });
      expect(blocked.tier, releaseClass).toBe(3);
      expect(blocked.rationale, releaseClass).toContain("route-gates.json");
    }
    const blockedLabel = gameRow(game, { hostingRedirects, aliasPlan, classificationLabel: "prototype" });
    expect(blockedLabel.tier).toBe(3);
    expect(blockedLabel.rationale).toContain("classification doc");
  });

  it.each([
    ["wrong destination", "/apps/showcase-live-game/ /apps/other-game/ 301"],
    ["legacy self-loop", "/apps/showcase-live-game/ /apps/showcase-live-game/ 301"],
    ["legacy wildcard", "/apps/showcase-live-game/* /apps/canonical-game/:splat 301"],
    ["legacy index redirect", "/apps/showcase-live-game/index.html /apps/canonical-game/ 301"],
    ["canonical loop", "/apps/canonical-game/ /apps/showcase-live-game/ 301"],
    ["canonical rewrite", "/apps/canonical-game/* /apps/showcase-live-game/:splat 200"],
    ["broad wildcard", "/apps/* /apps/elsewhere/ 301"],
    ["malformed status", "/apps/showcase-live-game/ /apps/canonical-game/ 999"]
  ])("fails closed on %s in the optional host rules", async (_name, rule) => {
    const game = { ...sampleGame, url: "/apps/canonical-game/" };
    await expect(Promise.resolve().then(() =>
      parseCatalogRoutePlan(catalogText([game]), gameMarketing, gameReserved, parseHostingRedirects(rule))
    )).rejects.toThrow();
  });

  it.each([
    ["slug", { ...sampleGame, slug: "different-game" }],
    ["URL", { ...sampleGame, url: "/apps/other-game/" }],
    ["title", { ...sampleGame, title: "Other title" }],
    ["genre", { ...sampleGame, genre: "sports" }],
    ["verification", { ...sampleGame, verification: "replay-verified" as const }],
    ["evidence", { ...sampleGame, evidenceFolder: "evidence/other-game" }]
  ])("rejects an inventory/%s disagreement with the catalog", (_name, game) => {
    const row = gameRow(game, { gate: candidate(game.appFolder) });
    expect(row.tier).toBe(3);
    expect(row.rationale).toMatch(/^UNCLASSIFIED/);
  });

  it("fails closed when the alias plan is missing or was made for different host inputs", () => {
    const missing = gameRow(sampleGame, { aliasPlan: undefined, gate: candidate(sampleGame.appFolder) });
    expect(missing.tier).toBe(3);
    expect(missing.rationale).toMatch(/^UNCLASSIFIED.*alias plan/);
    const changedHost = gameRow(sampleGame, {
      hostingRedirects: parseHostingRedirects("/unrelated /elsewhere 301")
    });
    expect(changedHost.tier).toBe(3);
    expect(changedHost.rationale).toMatch(/^UNCLASSIFIED.*alias plan/);
  });

  it("rejects aliases colliding with public or reserved marketing routes", async () => {
    for (const url of ["/apps/showcase-public-missing/", "/apps/showcase-retired-game/"]) {
      await expect(parseCatalogRoutePlan(catalogText([{ ...sampleGame, url }]), gameMarketing, gameReserved, noHostingRedirects))
        .rejects.toThrow(/collides/);
    }
  });

  it("fails closed on a missing helper, missing catalog, malformed catalog, and duplicate catalog IDs", async () => {
    const missing = join(tmpdir(), `missing-alias-input-${randomUUID()}`);
    await expect(readCatalogRoutePlan(gameMarketing, gameReserved, noHostingRedirects, missing)).rejects.toThrow();
    await expect(parseCatalogRoutePlan(catalogText(), gameMarketing, gameReserved, noHostingRedirects, missing))
      .rejects.toThrow(/missing.*route-aliases/);
    await expect(parseCatalogRoutePlan("{", gameMarketing, gameReserved, noHostingRedirects)).rejects.toThrow();
    await expect(parseCatalogRoutePlan('{"schema":"wrong","games":[]}', gameMarketing, gameReserved, noHostingRedirects))
      .rejects.toThrow(/catalog/);
    const valid = JSON.parse(catalogText()) as { games: Record<string, unknown>[] };
    const first = valid.games[0]!;
    for (const duplicate of [
      { ...first, appFolder: "showcase-other", url: "/apps/other/" },
      { ...first, previewSlug: "other-game", url: "/apps/other/" },
      { ...first, previewSlug: "other-game", appFolder: "showcase-other" }
    ]) {
      const text = JSON.stringify({ ...valid, games: [first, duplicate] });
      await expect(parseCatalogRoutePlan(text, gameMarketing, gameReserved, noHostingRedirects)).rejects.toThrow(/duplicate/);
    }
  });

  it("requires the build to import, plan, copy and call its canonical alias implementation", () => {
    expect(realReserved.has("showcase-blockfall-reactor")).toBe(true);
    expect(() => parseAliasBuildContract(realBuildSource.replace("../../tools/site/route-aliases.mjs", "../../tools/site/missing.mjs")))
      .toThrow(/helper import/);
    expect(() => parseAliasBuildContract(realBuildSource.replace(
      'copyFileSync(path.join(outputApps, alias.appFolder, "index.html"), path.join(targetDir, "index.html"));', ""
    ))).toThrow(/copy canonical HTML/);
    expect(() => parseAliasBuildContract(realBuildSource.replace(
      'writeFileSync(redirectsPath, plan.text, "utf8")', 'writeFileSync(redirectsPath, "", "utf8")'
    ))).toThrow(/scoped alias rules/);
    expect(() => parseAliasBuildContract(realBuildSource.replace(
      'path.join(repoRoot, "tools", "site", "games.catalog.json")',
      'path.join(repoRoot, "tools", "site", "wrong.json")'
    ))).toThrow(/canonical site games catalog/);
    expect(() => parseAliasBuildContract(realBuildSource.replace(
      "aliases = buildCatalogRouteAliases({ catalog, routes: publicRoutes, reservedRoutes: reservedAliasRoutes, rootDir: repoRoot, outDir: distDir });",
      "aliases = [];"
    ))).toThrow(/post-build catalog alias step/);
    expect(() => parseAliasBuildContract(realBuildSource.replace(
      'const reservedAliasRoutes = [...retiredPrototypeRoutes, ...supersededPublicRoutes, "aura-clash"];',
      "const reservedAliasRoutes = [];"
    ))).toThrow(/reserved routes/);
  });

  it("fails before classification on an absent or malformed generated inventory", () => {
    expect(() => readGameInventory(join(tmpdir(), `missing-game-inventory-${randomUUID()}.json`))).toThrow();
    expect(() => parseGameInventory("{")).toThrow();
    const valid = JSON.parse(inventoryText()) as { games: Record<string, unknown>[] };
    const game = valid.games[0]!;
    for (const invalid of [
      {},
      { schema: "aura3d-game-inventory/2", games: [] },
      { schema: "aura3d-game-inventory/1", games: "not an array", liveGameCount: 0, genres: {}, genreCounts: {} },
      { ...valid, liveGameCount: 2 },
      { ...valid, genreCounts: { arcade: 2 } },
      { ...valid, games: [{ ...game, status: "unknown" }] },
      { ...valid, games: [{ ...game, url: "https://example.com/" }] },
      { ...valid, games: [{ ...game, title: "" }] },
      { ...valid, games: [{ ...game, verification: "invented" }] },
      { ...valid, games: [{ ...game, evidenceFolder: "evidence/../other" }] },
      { ...valid, games: [{ ...game, screens: { set: "final", dir: "other", card: null, frameCount: 1 } }] },
      { ...valid, games: [{ ...game, screens: "not a screenshot record" }] }
    ]) expect(() => parseGameInventory(JSON.stringify(invalid))).toThrow();
  });

  it("rejects duplicate game slugs, app folders, and public URLs", () => {
    const second = { ...sampleGame, slug: "other-game", appFolder: "showcase-other-game", url: "/apps/showcase-other-game/" };
    for (const duplicate of [
      { ...second, slug: sampleGame.slug },
      { ...second, appFolder: sampleGame.appFolder },
      { ...second, url: sampleGame.url }
    ]) expect(() => parseGameInventory(inventoryText([sampleGame, duplicate]))).toThrow(/duplicate/);
  });

  it.each([
    ["slug mismatch", { ...sampleGame, slug: "wrong-game" }],
    ["app URL mismatch", { ...sampleGame, url: "/apps/showcase-other-game/" }],
    ["hidden status", { ...sampleGame, status: "hidden" as const }],
    ["retired status", { ...sampleGame, status: "retired" as const }],
    ["demo kind", { ...sampleGame, kind: "demo" as const }]
  ])("does not let a public gate mask %s", (_name, invalid) => {
    const game = parseGameInventory(inventoryText([invalid])).get(invalid.appFolder)!;
    const row = gameRow(game, {
      gate: candidate(game.appFolder),
      classificationLabel: "release-ready candidate",
      documented: true
    });
    expect(row.tier).toBe(3);
    expect(row.rationale).toMatch(/^UNCLASSIFIED.*game-inventory\.json/);
  });

  it("keeps marketing and production-host redirects ahead of inventory and gates", () => {
    const retired: GameInventoryEntry = {
      ...sampleGame, slug: "retired-game", appFolder: "showcase-retired-game", url: "/apps/showcase-retired-game/"
    };
    const marketingRow = gameRow(retired, { gate: candidate(retired.appFolder) });
    expect(marketingRow.tier).toBe(3);
    expect(marketingRow.rationale).toMatch(/^UNCLASSIFIED.*build-showcase-routes\.mjs redirects/);
    const hostRow = gameRow(sampleGame, {
      gate: candidate(sampleGame.appFolder),
      hostingRedirects: parseHostingRedirects("/apps/showcase-live-game/ /apps/elsewhere/ 301")
    });
    expect(hostRow.tier).toBe(3);
    expect(hostRow.rationale).toMatch(/^UNCLASSIFIED.*marketing\/public\/_redirects/);
  });

  it("never overrides explicit blocked or prototype gate and document labels", () => {
    const blocked: GameInventoryEntry = {
      ...sampleGame, slug: "blocked-live", appFolder: "showcase-blocked-live", url: "/apps/showcase-blocked-live/"
    };
    for (const releaseClass of ["prototype-blocked", "blocked", "prototype", "internal-diagnostic"]) {
      const row = gameRow(blocked, { gate: { id: blocked.appFolder, releaseClass } });
      expect(row.tier, releaseClass).toBe(3);
      expect(row.rationale, releaseClass).toContain("route-gates.json");
    }
    for (const classificationLabel of ["prototype", "blocked", "internal diagnostic"]) {
      const row = gameRow(blocked, { classificationLabel });
      expect(row.tier, classificationLabel).toBe(3);
      expect(row.rationale, classificationLabel).toContain("classification doc");
    }
  });

  it("does not hide a missing source behind either a live entry or a release gate", () => {
    const row = gameRow(sampleGame, { sourceRoute: false, gate: candidate(sampleGame.appFolder) });
    expect(row.tier).toBe(3);
    expect(row.rationale).toMatch(/^UNCLASSIFIED.*no source route/);
    const index = classify("showcase-index", {
      marketing: realMarketing,
      sourceRoute: false,
      gate: { id: "showcase-index", releaseClass: "index-route" },
      classificationLabel: "index route"
    });
    expect(index.tier).toBe(3);
    expect(index.rationale).toMatch(/^UNCLASSIFIED.*no source route/);
    const missing = missingInventoryAppRows(parseGameInventory(inventoryText()), []);
    expect(collectUnclassifiedRows(missing).map((entry) => entry.id)).toEqual([sampleGame.appFolder]);
    expect(missingInventoryAppRows(parseGameInventory(inventoryText()), [row])).toEqual([]);
  });

  it("reports live inventory routes absent from marketing, even when documented or sourced", () => {
    const game: GameInventoryEntry = {
      ...sampleGame, slug: "unknown-game", appFolder: "showcase-unknown-game", url: "/apps/showcase-unknown-game/"
    };
    const row = gameRow(game, { documented: true, template: true, specDriven: true });
    expect(row.tier).toBe(3);
    expect(row.rationale).toMatch(/^UNCLASSIFIED.*not listed in the marketing public routes/);
    expect(missingInventoryAppRows(parseGameInventory(inventoryText([game])), [])[0]!.rationale)
      .toMatch(/^UNCLASSIFIED.*no source route/);
  });

  it("leaves a marketing-published game with neither gate nor inventory unclassified", () => {
    const row = classify("showcase-public-missing", {
      marketing: gameMarketing, documented: true, template: true, specDriven: true
    });
    expect(row.tier).toBe(3);
    expect(row.rationale).toMatch(/^UNCLASSIFIED.*route-gates\.json.*game-inventory\.json/);
  });
});

describe("production hosting redirects", () => {
  it("detects exact and wildcard redirects but not 200 rewrites", () => {
    const redirects = parseHostingRedirects([
      "# no build execution",
      "/apps/old /apps/new/ 301",
      "/apps/wild/* /apps/new/ 302",
      "/apps/index-only/index.html /apps/new/ 301",
      "/apps/rewrite/ /apps/new/index.html 200"
    ].join("\n"));
    expect(isHostingRedirectedApp("old", redirects)).toBe(true);
    expect(isHostingRedirectedApp("wild", redirects)).toBe(true);
    expect(isHostingRedirectedApp("index-only", redirects)).toBe(true);
    expect(isHostingRedirectedApp("rewrite", redirects)).toBe(false);
    expect(isHostingRedirectedApp("older", redirects)).toBe(false);
  });
  it("treats an absent optional file as no redirects and rejects malformed rules", () => {
    expect(readHostingRedirects(join(tmpdir(), `missing-redirects-${randomUUID()}`))).toEqual(noHostingRedirects);
    expect(parseHostingRedirects("/apps/old /apps/new/").rules[0]?.status).toBe("302");
    for (const text of [
      "/apps/example",
      "/apps/:dynamic /target 301",
      "/apps/ex*ample /target 301",
      "/apps/../example /target 301",
      "/apps/example /target 999",
      "/apps/example /target 301\n/apps/example /other 302"
    ]) expect(() => parseHostingRedirects(text)).toThrow(/_redirects/);
  });
});

describe("marketing route-list extraction", () => {
  it("parses static lists without executing any of the build source", () => {
    const routes = parseMarketingRoutes(`${script()}\nthrow new Error("must not execute");`);
    expect([...routes.publicRoutes]).toEqual(["live-game", "blocked-live", "dual-route", "live-evidence"]);
    expect([...routes.redirectedRoutes]).toEqual(["retired-legacy", "dual-route"]);
  });

  it("uses publicRoutes itself rather than assuming every showcase or evidence route is public", () => {
    const routes = parseMarketingRoutes(script({
      publicRoutes: 'const publicRoutes = ["direct-live", ...evidenceRoutes];'
    }));
    expect([...routes.publicRoutes]).toEqual(["direct-live", "live-evidence"]);
    expect(classify("live-game", { gate: candidate("live-game"), marketing: routes }).tier).toBe(3);
    expect(classify("direct-live", { gate: candidate("direct-live"), marketing: routes }).tier).toBe(1);
  });

  it("fails closed when the marketing source file is missing", () => {
    expect(() => readMarketingRoutes(join(tmpdir(), `missing-marketing-${randomUUID()}.mjs`))).toThrow();
  });

  it.each(Object.keys(declarations) as ListName[])("fails closed when %s is missing", (name) => {
    expect(() => parseMarketingRoutes(script({ [name]: "" }))).toThrow(new RegExp(`missing.*${name}`));
  });

  it.each([
    ["showcaseRoutes", "const showcaseRoutes = getRoutes();"],
    ["showcaseRoutes", 'const showcaseRoutes = ["live-game", dynamicRoute];'],
    ["evidenceRoutes", "const evidenceRoutes = [...otherRoutes];"],
    ["retiredPrototypeRoutes", 'let retiredPrototypeRoutes = ["retired-legacy"];'],
    ["retiredPrototypeRoutes", 'const retiredPrototypeRoutes = ["../invalid"];'],
    ["publicRoutes", "const publicRoutes = [...showcaseRoutes, ...unknownRoutes];"],
    ["publicRoutes", 'const publicRoutes = ["live-" + suffix];']
  ] as const)("fails closed on malformed %s: %s", (name, declaration) => {
    expect(() => parseMarketingRoutes(script({ [name]: declaration }))).toThrow(new RegExp(name));
  });

  it("rejects syntax errors and duplicated or commented-out route declarations", () => {
    expect(() => parseMarketingRoutes(`${script()}\nconst broken = [`)).toThrow(/invalid syntax/);
    expect(() => parseMarketingRoutes(`${script()}\nconst showcaseRoutes = [];`)).toThrow(/duplicate.*showcaseRoutes/);
    expect(() => parseMarketingRoutes(script({
      retiredPrototypeRoutes: "// const retiredPrototypeRoutes = [];"
    }))).toThrow(/missing.*retiredPrototypeRoutes/);
  });

  it("rejects duplicate route ids within or across public lists", () => {
    expect(() => parseMarketingRoutes(script({
      showcaseRoutes: 'const showcaseRoutes = ["live-game", "live-game"];'
    }))).toThrow(/duplicate.*showcaseRoutes/);
    expect(() => parseMarketingRoutes(script({
      evidenceRoutes: 'const evidenceRoutes = ["live-game"];'
    }))).toThrow(/duplicate.*publicRoutes/);
    expect(() => parseMarketingRoutes(script({
      retiredPrototypeRoutes: 'const retiredPrototypeRoutes = ["retired-legacy", "retired-legacy"];'
    }))).toThrow(/duplicate.*retiredPrototypeRoutes/);
    // A public/retired overlap is different: the build writes the redirect last.
    expect(parseMarketingRoutes(script()).redirectedRoutes.has("dual-route")).toBe(true);
  });

  it.each([
    'publicRoutes.push("new-route");',
    'publicRoutes[0] = "new-route";',
    'retiredPrototypeRoutes.length = 0;',
    "delete showcaseRoutes[0];",
    'Object.assign(publicRoutes, ["new-route"]);',
    'publicRoutes["splice"](0, 1);'
  ])("rejects direct route-list mutation: %s", (mutation) => {
    expect(() => parseMarketingRoutes(`${script()}\n${mutation}`)).toThrow(/marketing route lists/);
  });

  it("rejects public lists that use a source array before it has been initialized", () => {
    const unordered = [
      declarations.showcaseRoutes,
      declarations.publicRoutes,
      declarations.evidenceRoutes,
      declarations.retiredPrototypeRoutes
    ].join("\n");
    expect(() => parseMarketingRoutes(unordered)).toThrow(/publicRoutes references evidenceRoutes before/);
  });
});
