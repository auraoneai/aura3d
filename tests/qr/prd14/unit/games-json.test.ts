/**
 * T1.13 (PRD 14 §14.1) — `games.json` V2 data: every entry validates against
 * `games.schema.json` and against the C-35 `GameEntryV2` contract, every
 * `requiredConditions[].expr` parses, every referenced shot exists in the
 * entry's timeline (or `defaults.requiredShots`), overrides carry `reason`,
 * and Courier has NO `canvasBlankCheck` override.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateRequiredCondition, GAME_VISUAL_CATEGORY_LIST } from "@aura3d/game/art";
import type { GameEntryV2 } from "@aura3d/game/art";
import { GAME_NONVISUAL_CATEGORIES } from "../../../../tools/quality-gate/src/contracts";
import { validateJsonSchema } from "./helpers/schema";
import { NON_REBUILD_ROUTES, PRD14_REBUILD_ROUTES } from "./helpers/games";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const gamesJson = JSON.parse(readFileSync(`${ROOT}tools/quality-rebuild-capture/games.json`, "utf8")) as {
  defaults?: { requiredShots?: string[] };
  games: Record<string, unknown>[];
};
const schema = JSON.parse(readFileSync(`${ROOT}tools/quality-rebuild-capture/games.schema.json`, "utf8"));

// The 18 PRD-14 games minus the 13 apps deleted in 4.0.1 (46bca99f1, pruned
// from games.json in 8e6ecef13), plus the later non-rebuild capture routes
// (644da6651, 479225fd9). See helpers/games.ts.
const EXPECTED_IDS = [...PRD14_REBUILD_ROUTES, ...NON_REBUILD_ROUTES];
const REBUILD = new Set<string>(PRD14_REBUILD_ROUTES);
const rebuildEntries = () => gamesJson.games.filter((g) => REBUILD.has(String(g.id)));

const QUALITY_TIERS = ["low", "medium", "high", "ultra"] as const;
const ALLOWED_BLANK_OVERRIDES = new Set([
  "showcase-aurora-lander",
  "showcase-gravity-post",
  "showcase-gallery-shift",
  "showcase-deep-recovery",
  "showcase-orbital-defense"
]);

function collectShotIds(entry: Record<string, unknown>): Set<string> {
  const ids = new Set<string>(gamesJson.defaults?.requiredShots ?? []);
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (typeof value === "object" && value !== null) {
      for (const [key, v] of Object.entries(value)) {
        if ((key === "shot" || key === "capture") && typeof v === "string") ids.add(v);
        walk(v);
      }
    }
  };
  walk(entry.timeline);
  return ids;
}

function routeFlagFor(id: string): string {
  return `A3D_QR_ROUTE_${id.replace(/^showcase-/, "").replace(/-showcase$/, "").replace(/-/g, "_").toUpperCase()}`;
}

// FLAG-1: qrFlags is the capture harness's default URL-form flag list —
// `route-<id>` dispatch token plus the engine short flags the v2 capture arm
// turns on. Since T0-29 (#1232) the v2 boots no longer force these flags
// (v2-flags.test.ts); the URL is the only source, so exact `none` /
// `-<flag>` arms can turn them off.
const ENGINE_QR_FLAGS = ["game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"] as const;

function routeUrlFlagFor(id: string): string {
  return `route-${routeFlagFor(id).slice("A3D_QR_ROUTE_".length).toLowerCase().replace(/_/g, "-")}`;
}

describe("T1.13 games.json V2", () => {
  it("covers exactly the shipped games", () => {
    expect(gamesJson.games.map((g) => g.id).sort()).toEqual([...EXPECTED_IDS].sort());
  });

  it("rebuild routes dispatch to a v2 boot; the other routes have neither v2 boot nor route flag", () => {
    for (const entry of gamesJson.games) {
      const id = String(entry.id);
      const appDir = String(entry.appDir ?? entry.id);
      const boot = `${ROOT}apps/${appDir}/src/v2/boot.ts`;
      const flags = (entry.qrFlags ?? []) as string[];
      if (REBUILD.has(id)) {
        expect(existsSync(boot), `${id} v2 boot`).toBe(true);
        expect(readFileSync(`${ROOT}apps/${appDir}/src/main.ts`, "utf8"), `${id} main.ts dispatches the route flag`).toContain(routeFlagFor(id));
      } else {
        expect(existsSync(boot), `${id} has a v2 boot: add it to PRD14_REBUILD_ROUTES`).toBe(false);
        expect(flags.filter((f) => f.startsWith("route-")), `${id} route flag`).toEqual([]);
        for (const f of flags) expect(ENGINE_QR_FLAGS as readonly string[], `${id} qrFlags`).toContain(f);
        expect(entry.evidenceGlobal, id).toBe("__AURA3D_GAME_EVIDENCE__");
        expect(typeof entry.readyExpr === "string" && entry.readyExpr.length > 0, `${id} readyExpr`).toBe(true);
      }
    }
  });

  it("validates every entry against games.schema.json", () => {
    const errors = validateJsonSchema(gamesJson, schema);
    expect(errors).toEqual([]);
  });

  it("carries the C-35 V2 fields on every rebuild entry", () => {
    for (const entry of rebuildEntries()) {
      const v2 = entry as unknown as GameEntryV2;
      const label = String(entry.id);
      expect([0, 1, 2, 3, 4]).toContain(v2.wave);
      expect(["S-presentation", "S-world", "F"]).toContain(v2.rebuildTier);
      expect(v2.artDirection, label).toMatch(/^apps\/[\w-]+\/art\/direction\.ts$/);
      expect(v2.artDirection.startsWith(`apps/${String(entry.id)}/`)).toBe(true);
      expect(v2.acceptance.minOverall).toBe(7);
      expect(v2.acceptance.minVisualCategory).toBe(5);
      expect(v2.acceptance.minNonVisual).toMatchObject({ sound_audio: 6, controls: 7, game_feel: 6.5, loading_transitions: 6 });
      if (v2.acceptance.minNonVisual.physics_feel !== undefined) {
        expect(v2.acceptance.minNonVisual.physics_feel).toBe(6);
      }
      for (const key of Object.keys(v2.acceptance.critical)) {
        expect(
          [...(GAME_VISUAL_CATEGORY_LIST as readonly string[]), ...(GAME_NONVISUAL_CATEGORIES as readonly string[])],
          `${label} critical key "${key}"`
        ).toContain(key);
      }
      expect(v2.budgets.routeJsGzipKB).toBe(80);
      expect(v2.budgets.gameLogicCpuMs).toBeLessThanOrEqual(4);
      for (const tier of QUALITY_TIERS) {
        expect(typeof v2.budgets.drawCalls[tier], `${label} drawCalls.${tier}`).toBe("number");
      }
      expect(v2.budgets.drawCalls.low).toBeLessThanOrEqual(150);
      expect(v2.budgets.drawCalls.medium).toBeLessThanOrEqual(300);
      expect(v2.budgets.drawCalls.high).toBeLessThanOrEqual(500);
      expect(v2.budgets.drawCalls.ultra).toBeLessThanOrEqual(1000);
      expect(v2.budgets.transferToPlayableMB).toBeGreaterThan(0);
      expect(v2.budgets.transferToPlayableMB).toBeLessThanOrEqual(15);
      expect((v2 as GameEntryV2 & { qrFlags?: readonly string[] }).qrFlags, `${label} qrFlags`).toEqual([routeUrlFlagFor(String(entry.id)), ...ENGINE_QR_FLAGS]);
    }
  });

  it("carries the FLAG-2 capture-contract fields on every rebuild entry", () => {
    for (const entry of rebuildEntries()) {
      const label = String(entry.id);
      expect(entry.evidenceGlobal, label).toBe("__AURA3D_GAME_EVIDENCE__");
      expect(entry.readyExpr, label).toBe("window.__AURA3D_GAME__?.state === 'playing'");
      expect(entry.captureContractMigrated, label).toBe(true);
      const legacy = entry.legacy as { evidenceGlobal?: string } | undefined;
      expect(legacy?.evidenceGlobal, `${label} legacy.evidenceGlobal`).toBeTruthy();
      expect(legacy?.evidenceGlobal, `${label} legacy global must differ`).not.toBe("__AURA3D_GAME_EVIDENCE__");
    }
  });

  it("carries the T1.13 overlay fields on every rebuild entry", () => {
    for (const entry of rebuildEntries()) {
      const label = String(entry.id);
      expect(Array.isArray(entry.scenarios), `${label} scenarios[]`).toBe(true);
      expect(Array.isArray(entry.hudSelectors), `${label} hudSelectors[]`).toBe(true);
      expect(Array.isArray(entry.keyboardHintSelectors), `${label} keyboardHintSelectors[]`).toBe(true);
      expect("titleDeterministic" in entry, `${label} titleDeterministic`).toBe(true);
    }
  });

  it("parses every requiredConditions expr and references existing shots", () => {
    for (const entry of gamesJson.games) {
      const v2 = entry as unknown as GameEntryV2;
      if (!REBUILD.has(String(entry.id)) && v2.requiredConditions === undefined) continue;
      expect(Array.isArray(v2.requiredConditions), `${String(entry.id)} requiredConditions[]`).toBe(true);
      const shots = collectShotIds(entry);
      for (const condition of v2.requiredConditions) {
        expect(shots.has(condition.shot), `${String(entry.id)} shot "${condition.shot}"`).toBe(true);
        expect(evaluateRequiredCondition(condition.expr, {}).reason, `${String(entry.id)} expr "${condition.expr}"`).not.toBe("parse-error");
        expect(condition.deadlineMs).toBeGreaterThan(0);
      }
    }
  });

  it("restricts canvasBlankCheck overrides to the five §7.2.1 games, each with a reason", () => {
    for (const entry of gamesJson.games) {
      const v2 = entry as unknown as GameEntryV2;
      if (v2.canvasBlankCheck === undefined) {
        expect(ALLOWED_BLANK_OVERRIDES.has(String(entry.id)) === false, `${String(entry.id)} must not omit the check silently`).toBe(true);
        continue;
      }
      expect(ALLOWED_BLANK_OVERRIDES.has(String(entry.id)), `${String(entry.id)} override`).toBe(true);
      expect(typeof v2.canvasBlankCheck.reason === "string" && v2.canvasBlankCheck.reason.length > 0, `${String(entry.id)} reason`).toBe(true);
      expect(v2.canvasBlankCheck.maxDarkFraction).toBeLessThanOrEqual(0.97);
      expect(v2.canvasBlankCheck.minDistinctColors).toBeGreaterThan(0);
    }
  });

  // Retired: "leaves Courier Rush with no canvasBlankCheck override" — the
  // showcase-courier-rush app was deleted in 4.0.1 (46bca99f1) and its entry
  // pruned (8e6ecef13). docs/project/status/retired-tests.md §3b.
});
