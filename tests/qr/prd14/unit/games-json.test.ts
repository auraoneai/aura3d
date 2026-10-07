/**
 * T1.13 (PRD 14 §14.1) — `games.json` V2 data: every entry validates against
 * `games.schema.json` and against the C-35 `GameEntryV2` contract, every
 * `requiredConditions[].expr` parses, every referenced shot exists in the
 * entry's timeline (or `defaults.requiredShots`), overrides carry `reason`,
 * and Courier has NO `canvasBlankCheck` override.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateRequiredCondition, GAME_VISUAL_CATEGORY_LIST } from "@aura3d/game/art";
import type { GameEntryV2 } from "@aura3d/game/art";
import { GAME_NONVISUAL_CATEGORIES } from "../../../../tools/quality-gate/src/contracts";
import { validateJsonSchema } from "./helpers/schema";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const gamesJson = JSON.parse(readFileSync(`${ROOT}tools/quality-rebuild-capture/games.json`, "utf8")) as {
  defaults?: { requiredShots?: string[] };
  games: Record<string, unknown>[];
};
const schema = JSON.parse(readFileSync(`${ROOT}tools/quality-rebuild-capture/games.schema.json`, "utf8"));

const EXPECTED_IDS = [
  "aura-clash-showcase",
  "showcase-bank-shot",
  "showcase-blockfall-reactor",
  "showcase-skyline-runner",
  "showcase-turbo-drift-circuit",
  "showcase-siege-golf",
  "showcase-aurora-lander",
  "showcase-neon-swarm",
  "showcase-gravity-post",
  "showcase-courier-rush",
  "showcase-pulse-tunnel",
  "showcase-mech-hangar",
  "showcase-vault-breakers",
  "showcase-rooftop-buckets",
  "showcase-gallery-shift",
  "showcase-deep-recovery",
  "showcase-patrol-wing",
  "showcase-orbital-defense"
];

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

describe("T1.13 games.json V2", () => {
  it("covers exactly the 18 shipped games", () => {
    expect(gamesJson.games.map((g) => g.id).sort()).toEqual([...EXPECTED_IDS].sort());
  });

  it("validates every entry against games.schema.json", () => {
    const errors = validateJsonSchema(gamesJson, schema);
    expect(errors).toEqual([]);
  });

  it("carries the C-35 V2 fields on every entry", () => {
    for (const entry of gamesJson.games) {
      const v2 = entry as GameEntryV2;
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
      expect(v2.qrFlags).toEqual([routeFlagFor(String(entry.id))]);
    }
  });

  it("parses every requiredConditions expr and references existing shots", () => {
    for (const entry of gamesJson.games) {
      const v2 = entry as GameEntryV2;
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
      const v2 = entry as GameEntryV2;
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

  it("leaves Courier Rush with no canvasBlankCheck override (the 0.968+ black frame must fail)", () => {
    const courier = gamesJson.games.find((g) => g.id === "showcase-courier-rush") as GameEntryV2;
    expect(courier.canvasBlankCheck).toBeUndefined();
  });
});
