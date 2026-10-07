// PRD-07 P2-T3 — carved gameEffects: flag-off nodes() is deep-equal to the
// 85aafcd0 fixture; flag-on + autoMount adopts the controller into the single
// live app so spawns reach app.effects with no nodes() call; gameFeel.create()
// controllers are adopted the same way.

import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createAuraApp, scene } from "../../../../packages/engine/src";
import { gameFeelBuilders } from "../../../../packages/engine/src/agent-api/GameFeel.js";
import { createGameEffects } from "../../../../packages/engine/src/agent-api/vfx/gameEffects.js";
import { collectEffectsSection } from "../../../../packages/engine/src/agent-api/vfx/diagnostics.js";
import { gameEffectsUnbound, resetPrd07AppRegistry } from "../../../../packages/engine/src/agent-api/vfx/effects-api.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "../fixtures/game-effects-nodes-85aafcd0.json"), "utf8"));

beforeEach(() => resetPrd07AppRegistry());

describe("P2-T3 game-effects auto-mount", () => {
  it("flag off → nodes() output is deep-equal to the 85aafcd0 fixture", () => {
    const fx = createGameEffects({ autoMount: false });
    fx.hitSpark([1, 2, 3], { intensity: 0.8 });
    fx.groundDust([0, 0.5, 0]);
    fx.update(0.016);
    expect(fx.nodes()).toEqual(fixture);
  });

  it("flag on, no nodes() call → liveParticles > 0 after hitSpark", () => {
    const app = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });
    const fx = createGameEffects(); // autoMount: adopted by the one live flag-on app
    fx.hitSpark([0, 0, 0]);
    for (let i = 0; i < 5; i++) app.step(1 / 60);
    const report = collectEffectsSection(app);
    expect(report.liveParticles).toBeGreaterThan(0);
    expect(fx.nodes()).toEqual([]); // deprecated path returns [] when bound
    app.dispose();
  });

  it("explicit legacyPrimitiveNodes keeps the old node output while bound", () => {
    const app = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });
    const fx = createGameEffects({ app, legacyPrimitiveNodes: true });
    fx.hitSpark([0, 0, 0]);
    const nodes = fx.nodes();
    expect(nodes.length).toBeGreaterThan(0); // legacy primitive path preserved
    app.dispose();
  });

  it("gameFeel.create() controllers are adopted", () => {
    const app = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });
    const feel = gameFeelBuilders.create({ effects: createGameEffects() });
    const receipt = feel.landingDust([0, 0, 0]);
    expect(receipt.accepted).toBe(true);
    for (let i = 0; i < 5; i++) app.step(1 / 60);
    expect(collectEffectsSection(app).liveParticles).toBeGreaterThan(0);
    app.dispose();
  });

  it("two flag-on apps live → GAME_EFFECTS_UNBOUND and no binding", () => {
    const appA = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });
    const appB = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });
    const fx = createGameEffects();
    expect(gameEffectsUnbound()).toContain("2 flag-on apps live");
    fx.hitSpark([0, 0, 0]);
    for (let i = 0; i < 5; i++) appA.step(1 / 60);
    expect(collectEffectsSection(appA).liveParticles).toBe(0);
    appA.dispose();
    appB.dispose();
  });
});
