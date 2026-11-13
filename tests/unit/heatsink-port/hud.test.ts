import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HudModel, OBJECTIVE_TEXT, findNearestTargetAhead, projectTargetLock } from "../../../examples/heatsink-port/hud";
import { Race } from "../../../examples/heatsink-port/race";
import { Track } from "../../../examples/heatsink-port/track";
import { buildBarrelNode, buildHeavyTargetNode, buildSentryTargetNode } from "../../../examples/heatsink-port/art/proceduralModels";
import { buildWorld } from "../../../examples/heatsink-port/world";

describe("ion circuit objective HUD, NEXT TARGET distance sign & 2D target lock", () => {
  it("shows crystal-clear strike instructions and medal thresholds during countdown", () => {
    expect(OBJECTIVE_TEXT).toBe(
      "STRIKE OBJECTIVE: SHOOT DRONES & RED BARRELS [CLICK / F / J] · 16 KILLS BRONZE · 30 SILVER · 36+ (<5:00) GOLD"
    );
    const race = new Race(new Track());
    expect(race.state).toBe("countdown");
    const hud = new HudModel().update(1 / 60, race);
    expect(hud.objective).toBe(OBJECTIVE_TEXT);
  });

  it("keeps #objective visible during the 3-2-1 countdown and mounts the #target-lock HUD reticle in index.html", () => {
    const html = readFileSync("examples/heatsink-port/index.html", "utf8");
    expect(html).not.toContain("#count:not(.hidden)) #objective { visibility: hidden");
    expect(html).toContain('id="target-lock"');
    expect(html).toContain('id="target-lock-label"');
    expect(html).toContain('id="target-lock-dist"');
  });

  it("reports the nearest live Sentry, Gunship, or Barrel AHEAD of the player (not behind!) using -wrapDelta", () => {
    const race = new Race(new Track());
    race.state = "race";
    for (const t of race.ops.targets) t.alive = false;
    for (const b of race.barrels) b.alive = false;

    const p = race.player;
    p.s = 1000;
    p.x = 0;
    p.theta = 0;
    const fr = race.track.frame(p.s);
    Object.assign(p.position, race.track.toWorld(p.s, p.x, fr.y + 5.3));

    // Put a sentry 45 m BEHIND the player (wrapDelta(1000, 955) = +45, so ahead distance d = -45)
    const behindSentry = race.ops.targets.find((t) => t.kind === "sentry")!;
    (behindSentry as { s: number }).s = 955;
    behindSentry.alive = true;

    const hudModel = new HudModel();
    expect(findNearestTargetAhead(race)).toBeNull();
    expect(hudModel.update(1 / 60, race).objective).toContain("NO TARGETS AHEAD");

    // Put a live heavy gunship 140 m AHEAD (wrapDelta(1000, 1140) = -140, so ahead distance d = +140)
    const aheadHeavy = race.ops.targets.find((t) => t.kind === "heavy")!;
    (aheadHeavy as { s: number }).s = 1140;
    Object.assign(aheadHeavy.world, race.track.toWorld(1140, 0, race.track.frame(1140).y + 5));
    aheadHeavy.alive = true;

    const vHeavy = hudModel.update(1 / 60, race);
    expect(vHeavy.objective).toContain("NEXT TARGET: GUNSHIP 140 m");
    expect(vHeavy.targetLock?.label).toBe("GUNSHIP +250");
    expect(vHeavy.targetLock?.distanceM).toBe(140);

    // Put a live red barrel closer at 82 m AHEAD -> becomes nearest target ahead + BARREL +150 reticle
    const barrel = race.barrels[0]!;
    barrel.s = 1082;
    barrel.x = 0;
    barrel.y = race.track.frame(1082).y;
    barrel.alive = true;

    const vBarrel = hudModel.update(1 / 60, race);
    expect(vBarrel.objective).toContain("NEXT TARGET: BARREL 82 m");
    expect(vBarrel.targetLock?.label).toBe("BARREL +150");
    expect(vBarrel.targetLock?.distanceM).toBe(82);

    // Put a live sentry even closer at 48 m AHEAD -> SENTRY +100
    const aheadSentry = race.ops.targets.filter((t) => t.kind === "sentry")[1]!;
    (aheadSentry as { s: number }).s = 1048;
    Object.assign(aheadSentry.world, race.track.toWorld(1048, 0, race.track.frame(1048).y + 5));
    aheadSentry.alive = true;

    const lock = projectTargetLock(race, {
      eye: [p.position.x - fr.tx * 7.6, p.position.y + 2, p.position.z - fr.tz * 7.6],
      look: [p.position.x + fr.tx * 22, p.position.y + 0.8, p.position.z + fr.tz * 22],
      up: [0, 1, 0],
      fovDeg: 68,
      aspect: 16 / 9
    });
    expect(lock).not.toBeNull();
    expect(lock!.label).toBe("SENTRY +100");
    expect(lock!.distanceM).toBe(48);
    expect(lock!.x).toBeGreaterThan(0.25);
    expect(lock!.x).toBeLessThan(0.75);
    expect(lock!.y).toBeGreaterThan(0.2);
    expect(lock!.y).toBeLessThan(0.8);
  });

  it("authors high-contrast crimson/cyan procedural strike targets, hazard barrels, barrel halos, and cyan plasma bolts", () => {
    const barrelJson = JSON.stringify(buildBarrelNode(0, false, false));
    expect(barrelJson.toLowerCase()).toContain("#dc2626");
    expect(barrelJson.toLowerCase()).not.toContain("#222a38");

    const sentryJson = JSON.stringify(buildSentryTargetNode(0, 6, false, false)).toLowerCase();
    const heavyJson = JSON.stringify(buildHeavyTargetNode(3, 8, false, false)).toLowerCase();
    expect(sentryJson).toContain("#22d3ee");
    expect(sentryJson).toContain("#e11d48");
    expect(heavyJson).toContain("#22d3ee");
    expect(heavyJson).toContain("#e11d48");

    const worldNodes = ((buildWorld(new Track(), "high", "?look=twilight").scene.toJSON() as unknown as { nodes?: { name?: string; castShadow?: boolean }[] }).nodes ?? []);
    const barrelRing = worldNodes.find((n) => n.name === "barrel-ring-0");
    expect(barrelRing).toBeDefined();
    expect(barrelRing?.castShadow).toBe(false);
  });
});
