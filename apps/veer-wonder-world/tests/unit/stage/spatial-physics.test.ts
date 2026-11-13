// End-to-end spatial physics, doorway clearance, obstacle steering, lift cab sync,
// and ground/surface/rail contact verification across all 8 worlds, 26 episodes, and 16 activities.

import { describe, expect, it } from "vitest";
import { AUDIO_MANIFEST } from "../../../src/audio-manifest.js";
import { ACTIVITIES, EPISODES, storyById } from "../../../src/content/catalog.js";
import { estimateLineMs } from "../../../src/content/schema.js";
import { en } from "../../../src/localization/en/index.js";
import { createEpisodeDirector } from "../../../src/runtime/episode-director.js";
import { DOOR_OPEN_ANGLE, TOPPLE_ANGLE, sampleMove } from "../../../src/scenes/motion.js";
import { PROCEDURAL_RIGS } from "../../../src/scenes/procedural-rigs/index.js";
import { SPOTS, placeAtSpot, planSafePath } from "../../../src/scenes/spots.js";
import { ASSET_TRAITS } from "../../../src/scenes/stand-ins.js";
import { createStage, type StageSpatialNodeState } from "../../../src/scenes/stage.js";
import { WORLD_IDS, worldGroundElevation, worldStaticObstacles } from "../../../src/scenes/worlds.js";
import type { BeatSpec, DirectorSnapshot, PlayMode } from "../../../src/types.js";

function actorRadius(n: StageSpatialNodeState): number {
  return Math.min(n.size[0], n.size[2]) * 0.34;
}

/** Checks whether a character circle `(cx, cz, r)` impales a closed door slab or doorjamb posts. */
function doorFrameOrLeafViolation(
  actor: StageSpatialNodeState,
  door: StageSpatialNodeState
): string | null {
  if (actor.carriedBy !== null || ASSET_TRAITS[actor.asset].floats === true) return null;
  // Vertical overlap check.
  if (actor.position[1] >= door.position[1] + door.size[1] - 0.05) return null;
  if (actor.position[1] + actor.size[1] <= door.position[1] + 0.05) return null;

  const r = Math.min(0.22, actorRadius(actor));
  const dx = actor.position[0] - door.position[0];
  const dz = actor.position[2] - door.position[2];
  const h = door.size[1];

  // Left and right planted doorjamb columns (`x in [-0.335*h, -0.26*h]` and `[+0.26*h, +0.335*h]`, `z in [-0.06*h, +0.06*h]`).
  const jambInnerX = 0.255 * h;
  const jambOuterX = 0.34 * h;
  const jambHalfZ = 0.065 * h;
  for (const sign of [-1, 1] as const) {
    const jx = sign * ((jambInnerX + jambOuterX) * 0.5);
    const jHalfW = (jambOuterX - jambInnerX) * 0.5;
    const nearX = Math.max(jx - jHalfW, Math.min(dx, jx + jHalfW));
    const nearZ = Math.max(-jambHalfZ, Math.min(dz, jambHalfZ));
    const dist = Math.hypot(dx - nearX, dz - nearZ);
    if (dist < r - 0.045) {
      return `${actor.id} clips ${door.id} ${sign < 0 ? "left" : "right"} jamb (dx=${dx.toFixed(2)}, dz=${dz.toFixed(2)})`;
    }
  }

  // Hinged door leaf: anchored at `[-0.26*h, 0]` extending `0.516*h` along rotated leaf axis `angle = DOOR_OPEN_ANGLE * openProgress`.
  const angle = DOOR_OPEN_ANGLE * door.openProgress;
  const hx = -0.26 * h;
  const hz = 0;
  const leafLen = 0.516 * h;
  // In ZYX/Y rotation, local (+L, 0) maps to (L*cos(angle), -L*sin(angle)).
  const dirX = Math.cos(angle);
  const dirZ = -Math.sin(angle);
  const relX = dx - hx;
  const relZ = dz - hz;
  const proj = Math.max(0.03 * h, Math.min(leafLen, relX * dirX + relZ * dirZ));
  const closestX = hx + dirX * proj;
  const closestZ = hz + dirZ * proj;
  const distToLeaf = Math.hypot(dx - closestX, dz - closestZ);
  const leafHalfThick = 0.03 * h;
  if (distToLeaf < r + leafHalfThick - 0.055) {
    return `${actor.id} clips ${door.id} leaf at openProgress=${door.openProgress.toFixed(2)} (dist=${distToLeaf.toFixed(2)}m)`;
  }
  return null;
}

describe("spatial physics, doorway clearance, world gateways & surface grounding", () => {
  it("keeps liftGate parented to liftCab and TOPPLE_ANGLE at exact 90 degrees", () => {
    expect(TOPPLE_ANGLE).toBeCloseTo(Math.PI / 2, 6);
    const liftRig = PROCEDURAL_RIGS.lift;
    const gatePart = liftRig.parts.find((p) => p.part === "liftGate");
    expect(gatePart?.parent).toBe("liftCab");
  });

  it("exposes unobstructed stage spots and offLeft/offRight entry corridors across all 8 worlds", () => {
    for (const worldId of WORLD_IDS) {
      const obstacles = worldStaticObstacles(worldId);
      for (const [spotId, pos] of Object.entries(SPOTS)) {
        if (pos[1] > 0.8) continue;
        for (const obs of obstacles) {
          const hitX = Math.abs(pos[0] - obs.x) < obs.halfW + 0.12;
          const hitZ = Math.abs(pos[2] - obs.z) < obs.halfD + 0.12;
          expect(hitX && hitZ, `${worldId} obstacle ${obs.id} overlaps spot ${spotId}`).toBe(false);
        }
      }
      // Verify `offLeft -> left` and `offRight -> right` corridors are clear or cleanly steerable.
      for (const [fromSpot, toSpot] of [
        ["offLeft", "left"],
        ["offRight", "right"]
      ] as const) {
        const plan = planSafePath(
          SPOTS[fromSpot],
          SPOTS[toSpot],
          { id: "momo", asset: "momo", width: 0.85, depth: 0.76, height: 0.9 },
          obstacles.map((o) => ({
            id: o.id,
            x: o.x,
            y: 0,
            z: o.z,
            halfW: o.halfW,
            halfD: o.halfD,
            height: o.height
          }))
        );
        expect(plan.totalDistance, `${worldId} ${fromSpot}->${toSpot}`).toBeLessThan(6.5);
      }
    }
    // Station track rails at z = -1.6 elevate GoGo & GogoCarriage onto the steel rail heads.
    expect(worldGroundElevation("station", 0, -1.6, "gogo")).toBeGreaterThanOrEqual(0.08);
    expect(worldGroundElevation("station", 0, -1.6, "gogoCarriage")).toBeGreaterThanOrEqual(0.08);
    expect(worldGroundElevation("meadow", 0, 0, "momo")).toBe(0);
  });

  it("waits for opening doors, routes through doorway apertures, enters lifts from +Z, and rests sleepers on beds/clouds", () => {
    // 1. Sleepers (`momo`, `teddy`, `sheep`) rest on `bed` and `sleepyCloud`, while `blanket` drapes over the centre.
    const bedOcc = {
      id: "bed",
      position: SPOTS.center,
      role: "surface" as const,
      asset: "bed",
      width: 1.52,
      depth: 0.96,
      height: 0.8,
      restHeight: 0.496
    };
    const teddyOnBed = placeAtSpot(
      "center",
      { id: "teddy", role: "actor", asset: "teddy", width: 0.36, height: 0.45, from: [-1.6, 0, -0.3] },
      [bedOcc]
    );
    expect(teddyOnBed[1]).toBeCloseTo(0.496, 3);
    const blanketOnBed = placeAtSpot(
      "center",
      { id: "blanket", role: "surface", asset: "blanket", width: 0.48, height: 0.22, from: [1.6, 0, -0.3] },
      [bedOcc, { id: "teddy", position: teddyOnBed, role: "actor", asset: "teddy", width: 0.36, height: 0.45 }]
    );
    expect(blanketOnBed[0]).toBeCloseTo(SPOTS.center[0], 3);
    expect(blanketOnBed[1]).toBeGreaterThan(teddyOnBed[1]);

    // 2. Doorway crossing waits for opening leaf and threads through the open arch centre.
    const openingDoor = {
      id: "door",
      asset: "door",
      x: 0,
      y: 0,
      z: -1.6,
      halfW: 0.5,
      halfD: 0.15,
      height: 1.6,
      door: true,
      open: true,
      openProgress: 0.05
    };
    const crossPlan = planSafePath(
      [0, 0, -2.1],
      [-1.6, 0, -0.3],
      { id: "lulu", asset: "lulu", width: 0.63, depth: 0.59, height: 0.95 },
      [openingDoor]
    );
    expect(crossPlan.waitSec).toBeGreaterThan(0.35);
    expect(crossPlan.waypoints.length).toBeGreaterThanOrEqual(3);
    const holdSample = sampleMove("walk", [0, 0, -2.1], [-1.6, 0, -0.3], 0.1, 0.2, false, {
      waypoints: crossPlan.waypoints,
      waitSec: crossPlan.waitSec,
      totalDurationSec: crossPlan.waitSec + 2.0
    });
    expect(holdSample.position).toEqual([0, 0, -2.1]);

    // 3. Lift entry routes to `+Z` front gate first instead of slicing sideways through the `-X` shaft wall.
    const liftPlan = planSafePath(
      [-1.6, 0, -0.3],
      [0, 0.108, 0],
      { id: "teddy", asset: "teddy", width: 0.36, depth: 0.32, height: 0.45 },
      [{ id: "lift", asset: "lift", x: 0, y: 0, z: 0, halfW: 0.5, halfD: 0.36, height: 1.8, open: true, openProgress: 1 }]
    );
    expect(liftPlan.waypoints.length).toBeGreaterThanOrEqual(3);
    expect(liftPlan.waypoints[1]?.[0]).toBeCloseTo(0, 2);
    expect(liftPlan.waypoints[1]?.[2] ?? 0).toBeGreaterThan(0.5);
  });

  it("steps all 26 episodes with zero doorway/leaf clipping, zero ground sinking, and zero runtime warnings", async () => {
    const stage = await createStage({ target: null, reducedMotion: false, mountTimeoutMs: 50 });
    const violations: string[] = [];
    try {
      for (const ep of EPISODES) {
        await stage.load(ep);
        const stepAndAudit = (ms: number, beatId: string): void => {
          const steps = Math.max(1, Math.round(ms / 150));
          for (let s = 0; s < steps; s += 1) {
            stage.update(0.15);
            const state = stage.spatialState();
            const doors = state.filter((n) => n.visible && n.asset === "door");
            for (const n of state) {
              if (!n.visible) continue;
              // Ground contact check for grounded non-carried nodes.
              if (n.carriedBy === null && !ASSET_TRAITS[n.asset].floats) {
                const gy = worldGroundElevation(ep.world, n.position[0], n.position[2], n.asset);
                if (n.position[1] < gy - 0.025) {
                  violations.push(`${ep.id}/${beatId}: ${n.id} sank below ground (${n.position[1].toFixed(3)} < ${gy.toFixed(3)})`);
                }
              }
              // Doorjamb & swinging leaf check for cast & animal actors.
              if (n.role === "actor" || n.asset === "teddy" || n.asset === "cow" || n.asset === "duck" || n.asset === "horse") {
                for (const d of doors) {
                  const hit = doorFrameOrLeafViolation(n, d);
                  if (hit) violations.push(`${ep.id}/${beatId}: ${hit}`);
                }
              }
            }
          }
        };

        for (const beat of ep.beats) {
          stage.apply(beat.stage);
          stepAndAudit(beat.holdMs ?? 2400, beat.id);
          if (beat.response) {
            stage.apply(beat.response.stage);
            stepAndAudit(1800, `${beat.id}:response`);
          } else if (beat.responseByTarget) {
            const firstKey = Object.keys(beat.responseByTarget)[0];
            const branch = firstKey ? beat.responseByTarget[firstKey] : undefined;
            if (branch?.stage) {
              stage.apply(branch.stage);
              stepAndAudit(1800, `${beat.id}:${firstKey}`);
            }
          }
        }
        const unexpectedWarnings = stage.diagnostics().warnings.filter((w) => !w.startsWith("first frame:"));
        expect(unexpectedWarnings, `${ep.id} stage warnings`).toEqual([]);
      }
    } finally {
      stage.dispose();
    }
    expect(violations).toEqual([]);
  }, 60_000);

  it("steps all 16 activities across all rounds with zero doorway/lift clipping, proper cab/surface contact, and zero warnings", async () => {
    const stage = await createStage({ target: null, reducedMotion: false, mountTimeoutMs: 50 });
    const violations: string[] = [];
    try {
      for (const act of ACTIVITIES) {
        await stage.load(act);
        const stepAndAudit = (ms: number, label: string): void => {
          const steps = Math.max(1, Math.round(ms / 150));
          for (let s = 0; s < steps; s += 1) {
            stage.update(0.15);
            const state = stage.spatialState();
            const doors = state.filter((n) => n.visible && n.asset === "door");
            const lifts = state.filter((n) => n.visible && n.asset === "lift");
            for (const n of state) {
              if (!n.visible) continue;
              if (n.carriedBy === null && !ASSET_TRAITS[n.asset].floats) {
                const gy = worldGroundElevation(act.world, n.position[0], n.position[2], n.asset);
                if (n.position[1] < gy - 0.025) {
                  violations.push(`${act.id}/${label}: ${n.id} sank below ground (${n.position[1].toFixed(3)} < ${gy.toFixed(3)})`);
                }
              }
              if (n.role === "actor" || n.asset === "teddy" || n.asset === "cow" || n.asset === "duck" || n.asset === "horse" || n.asset === "sheep") {
                for (const d of doors) {
                  const hit = doorFrameOrLeafViolation(n, d);
                  if (hit) violations.push(`${act.id}/${label}: ${hit}`);
                }
                // Lift side-wall & cab-floor check (`G07`).
                for (const l of lifts) {
                  const dx = Math.abs(n.position[0] - l.position[0]);
                  const dz = n.position[2] - l.position[2];
                  if (dx < 0.22 && Math.abs(dz) < 0.16 && n.position[1] < l.position[1] + 0.08) {
                    violations.push(`${act.id}/${label}: ${n.id} sank below liftCab floor (y=${n.position[1].toFixed(3)})`);
                  }
                }
              }
            }
          }
        };

        let littleLiftMaxTeddyY = 0;
        let gogoTrainMinY = Infinity;

        const runBeat = (beat: BeatSpec, label: string, roundIndex = 0, override?: {
          readonly stage?: BeatSpec["stage"];
          readonly response?: BeatSpec["response"];
          readonly responseByTarget?: BeatSpec["responseByTarget"];
        }): void => {
          stage.apply(override?.stage ?? beat.stage);
          stepAndAudit(beat.holdMs ?? 1800, label);
          if (act.id === "little-lift") {
            const teddy = stage.spatialState().find((n) => n.id === "teddy" && n.visible);
            if (teddy && teddy.position[1] > littleLiftMaxTeddyY) littleLiftMaxTeddyY = teddy.position[1];
          }
          if (act.id === "gogo-train") {
            const gogo = stage.spatialState().find((n) => n.id === "gogo" && n.visible);
            if (gogo && gogo.position[1] < gogoTrainMinY) gogoTrainMinY = gogo.position[1];
          }
          const byTarget = override?.responseByTarget ?? beat.responseByTarget;
          const resp = override?.response ?? beat.response;
          const targets = beat.input && beat.input.type !== "none" ? beat.input.targets : [];
          if (byTarget && targets.length > 0) {
            const chosen = targets[roundIndex % targets.length] ?? targets[0];
            const branch = chosen ? byTarget[chosen] : undefined;
            if (branch?.stage) {
              stage.apply(branch.stage);
              stepAndAudit(branch.holdMs ?? resp?.holdMs ?? 1800, `${label}:${chosen}`);
              if (act.id === "little-lift") {
                const teddy = stage.spatialState().find((n) => n.id === "teddy" && n.visible);
                if (teddy && teddy.position[1] > littleLiftMaxTeddyY) littleLiftMaxTeddyY = teddy.position[1];
              }
            }
          } else if (resp) {
            stage.apply(resp.stage);
            stepAndAudit(resp.holdMs ?? 1800, `${label}:resp`);
            if (act.id === "little-lift") {
              const teddy = stage.spatialState().find((n) => n.id === "teddy" && n.visible);
              if (teddy && teddy.position[1] > littleLiftMaxTeddyY) littleLiftMaxTeddyY = teddy.position[1];
            }
          }
        };

        for (const introBeat of act.intro) {
          runBeat(introBeat, `intro:${introBeat.id}`);
        }

        const totalRounds = Math.max(1, act.roundLimit);
        for (let r = 0; r < totalRounds; r += 1) {
          const variant = act.roundVariants?.[r];
          if (variant?.setupStage) {
            stage.apply(variant.setupStage);
            stepAndAudit(900, `r${r + 1}:setup`);
          }
          for (const baseBeat of act.round) {
            const patch = variant?.beatOverrides?.[baseBeat.id];
            runBeat(baseBeat, `r${r + 1}:${baseBeat.id}`, r, patch);
          }
        }
        for (const outro of act.outro) {
          runBeat(outro, `outro:${outro.id}`);
        }

        if (act.id === "little-lift") {
          expect(littleLiftMaxTeddyY, "little-lift elevates teddy onto upper floor").toBeGreaterThan(0.8);
          expect(littleLiftMaxTeddyY, "little-lift keeps teddy inside upper cab under roof").toBeLessThan(1.0);
        }
        if (act.id === "gogo-train") {
          expect(gogoTrainMinY, "gogo-train rests GoGo on station steel rails").toBeGreaterThanOrEqual(0.08);
        }
        const unexpectedWarnings = stage.diagnostics().warnings.filter((w) => !w.startsWith("first frame:"));
        expect(unexpectedWarnings, `${act.id} stage warnings`).toEqual([]);
      }
    } finally {
      stage.dispose();
    }
    expect(violations).toEqual([]);
  }, 60_000);

  it("verifies exact director key-frame choreography across E18, G09, G04, E04, E17, G08, G07, E22, G13, and G16", async () => {
    const lineMs = (key: string): number => AUDIO_MANIFEST.lines[key]?.durationMs ?? estimateLineMs(en.lines[key] ?? key);
    const stage = await createStage({ target: null, reducedMotion: false, mountTimeoutMs: 50 });
    try {
      const mount = async (storyId: string, mode: PlayMode) => {
        const story = storyById(storyId);
        expect(story, storyId).toBeDefined();
        if (!story) throw new Error(storyId);
        await stage.load(story);
        const director = createEpisodeDirector(story, { lineMs });
        let targets: readonly string[] = [];
        const route = (effects: ReturnType<typeof director.send>): void => {
          for (const eff of effects) {
            if (eff.type === "stage") stage.apply(eff.actions);
            if (eff.type === "targets") targets = eff.targets ?? [];
          }
        };
        route(director.send({ type: "START", mode }));
        const adv = (ms: number): void => {
          const steps = Math.max(0, Math.round(ms / 50));
          for (let i = 0; i < steps; i += 1) {
            route(director.send({ type: "TICK", dtMs: 50 }));
            stage.update(0.05);
          }
        };
        const jumpUntil = (pred: (s: DirectorSnapshot) => boolean, extraMs = 0): void => {
          let guard = 0;
          while (!pred(director.snapshot()) && director.snapshot().phase !== "finished" && guard < 4000) {
            route(director.send({ type: "TICK", dtMs: 50 }));
            stage.update(0.05);
            guard += 1;
          }
          if (extraMs > 0) adv(extraMs);
        };
        const tap = (target: string, afterMs: number): void => {
          route(director.send({ type: "TAP", target }));
          if (afterMs > 0) adv(afterMs);
        };
        return { adv, jumpUntil, tap, targets: () => targets };
      };

      // E18 whos-at-the-door
      const e18 = await mount("whos-at-the-door", "play-together");
      e18.jumpUntil((s) => s.beatId === "who" && s.phase === "holding", 2_000);
      expect(stage.spatialState().find((n) => n.id === "door")?.open).toBe(false);
      e18.jumpUntil((s) => s.beatId === "door-invite" && s.phase === "waiting");
      e18.tap("door", 2_200);
      expect(stage.spatialState().find((n) => n.id === "door")?.openProgress ?? 0).toBeGreaterThan(0.7);
      expect(stage.spatialState().find((n) => n.id === "sheru")?.visible).toBe(true);

      // G09 family-doorbells
      const g09 = await mount("family-doorbells", "play-together");
      g09.jumpUntil((s) => s.beatId === "ring" && s.phase === "waiting");
      g09.tap("door", 0);
      g09.jumpUntil((s) => s.beatId === "open", 2_000);
      expect(stage.spatialState().find((n) => n.id === "door")?.open).toBe(true);
      expect(stage.spatialState().find((n) => n.id === "lulu")?.visible).toBe(true);

      // G04 peekaboo-animal-barn
      const g04 = await mount("peekaboo-animal-barn", "play-together");
      g04.jumpUntil((s) => s.phase === "waiting");
      g04.tap("door", 2_400);
      expect(stage.spatialState().find((n) => n.id === "cow")?.visible).toBe(true);

      // E04 gogo-abc-train
      const e04 = await mount("gogo-abc-train", "play-together");
      e04.adv(3_500);
      expect(stage.spatialState().find((n) => n.id === "gogo")?.position[1] ?? 0).toBeGreaterThanOrEqual(0.075);

      // E17 sheru-big-adventure
      const e17 = await mount("sheru-big-adventure", "play-together");
      e17.adv(3_500);
      expect(stage.spatialState().find((n) => n.id === "sheru")?.position[1] ?? -1).toBeGreaterThanOrEqual(-0.01);

      // G08 build-and-tumble
      const g08 = await mount("build-and-tumble", "play-together");
      g08.jumpUntil((s) => s.beatId === "one" && s.phase === "waiting");
      g08.tap("block-1", 0);
      g08.jumpUntil((s) => s.beatId === "two" && s.phase === "waiting");
      g08.tap("block-2", 1_500);
      g08.jumpUntil((s) => s.beatId === "three" && s.phase === "waiting");
      g08.tap("block-3", 1_800);
      expect(stage.spatialState().some((n) => n.id.startsWith("block") && n.toppled)).toBe(true);

      // G07 little-lift
      const g07 = await mount("little-lift", "play-together");
      g07.jumpUntil((s) => s.beatId === "in" && s.phase === "waiting");
      g07.tap("teddy", 0);
      g07.jumpUntil((s) => s.beatId === "up" && s.phase === "waiting");
      g07.tap("lift", 2_200);
      const g07TeddyY = stage.spatialState().find((n) => n.id === "teddy")?.position[1] ?? 0;
      const g07Lift = stage.spatialState().find((n) => n.id === "lift");
      expect(g07TeddyY).toBeGreaterThan(0.8);
      expect(g07TeddyY).toBeLessThan(0.95);
      expect(g07Lift?.open).toBe(false);
      expect(g07Lift?.pendingClose).toBe(false);

      // Bedtime E22, G13, G16
      const e22 = await mount("teddy-warm-blanket", "watch-sing");
      e22.adv(6_000);
      expect(stage.spatialState().find((n) => n.id === "teddy")?.visible).toBe(true);

      const g13 = await mount("tuck-in-friends", "play-together");
      g13.jumpUntil((s) => s.phase === "waiting");
      const g13Target = g13.targets()[0];
      expect(g13Target).toBeTruthy();
      if (g13Target) g13.tap(g13Target, 2_200);
      expect(stage.spatialState().find((n) => n.id === "teddy")?.position[1] ?? 0).toBeGreaterThan(0.2);

      const g16 = await mount("cloud-sheep-hush", "play-together");
      g16.jumpUntil((s) => s.phase === "waiting");
      const g16Target = g16.targets()[0];
      expect(g16Target).toBeTruthy();
      if (g16Target) g16.tap(g16Target, 2_200);
      expect(stage.spatialState().find((n) => n.id === "sheepOne")?.position[1] ?? 0).toBeGreaterThan(0.2);
    } finally {
      stage.dispose();
    }
  });
});
