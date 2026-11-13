import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildArticulatedEnemyNode,
  BZ_PROC_MATERIALS,
  computeEnemyRigPose,
  ENEMY_RIG_PARTS,
  makeEnemyRigIds,
  measureProceduralBounds,
  type BunkerEnemyKind
} from "../../../apps/showcase-bunker-zero/src/art/proceduralModels";
import { BZ_POST } from "../../../apps/showcase-bunker-zero/src/art/look";
import { ENEMY_FORWARD, ENEMY_TURN_RATE, enemyFacingError, nextEnemyYaw, simHeading } from "../../../apps/showcase-bunker-zero/src/enemy-facing";
import { FLOORS, KILL_HOUSE } from "../../../apps/showcase-bunker-zero/src/maps";
import { createSim } from "../../../apps/showcase-bunker-zero/src/sim";

interface JsonSceneNode {
  readonly kind?: string;
  readonly runtime?: { readonly id?: string };
  readonly material?: unknown;
  readonly geometry?: { readonly positions?: ArrayLike<number>; readonly colors?: ArrayLike<number> };
  readonly children?: readonly JsonSceneNode[];
}

function collectRuntimeIds(node: JsonSceneNode, out = new Set<string>()): Set<string> {
  if (node.runtime?.id) out.add(node.runtime.id);
  for (const child of node.children ?? []) collectRuntimeIds(child, out);
  return out;
}

function countMeshParts(node: JsonSceneNode): number {
  let count = node.geometry?.positions && node.material ? 1 : 0;
  for (const child of node.children ?? []) count += countMeshParts(child);
  return count;
}

const EXPECTED_HEIGHT_RANGE: Record<BunkerEnemyKind, readonly [number, number]> = {
  guard: [1.8, 2.05],
  dog: [0.85, 1.15],
  gunner: [1.95, 2.22],
  boss: [2.9, 3.25]
};

describe("Bunker Zero articulated enemy rigs & facing", () => {
  for (const kind of ["guard", "dog", "gunner", "boss"] as const) {
    it(`${kind}: grounded at minY = 0, faces +Z, and exposes all 9 hierarchical group pivots`, () => {
      const stem = `test-${kind}`;
      const expectedIds = makeEnemyRigIds(stem);
      const builder = buildArticulatedEnemyNode(kind, stem, undefined, stem, false);
      const json = builder.toJSON() as unknown as JsonSceneNode;
      const bounds = measureProceduralBounds(builder);

      expect(ENEMY_FORWARD[kind]).toBe("+z");
      // Grounded cleanly on boot soles / mechanical paws at y = 0
      expect(Math.abs(bounds.minY)).toBeLessThan(0.005);
      const [minH, maxH] = EXPECTED_HEIGHT_RANGE[kind];
      const height = bounds.maxY - bounds.minY;
      expect(height).toBeGreaterThanOrEqual(minH);
      expect(height).toBeLessThanOrEqual(maxH);
      // Forward muzzles, visors and jaws extend farther toward +Z than the dorsal pack extends toward -Z
      expect(bounds.maxZ).toBeGreaterThan(Math.abs(bounds.minZ));

      const runtimeIds = collectRuntimeIds(json);
      for (const part of ENEMY_RIG_PARTS) {
        expect(runtimeIds.has(expectedIds[part]), `${kind} missing ${part}`).toBe(true);
      }
      expect(countMeshParts(json)).toBeGreaterThanOrEqual(12);
    });
  }

  it("computes deterministic, zero-drift ZYX joint poses across patrol, chase, attack, pain and death", () => {
    for (const kind of ["guard", "dog", "gunner", "boss"] as const) {
      const patrolA = computeEnemyRigPose({
        kind, state: "patrol", time: 1.35, stateT: 0.8, painT: 0, deathT: 0, phaseSeed: 2.1
      });
      const patrolB = computeEnemyRigPose({
        kind, state: "patrol", time: 1.35, stateT: 0.8, painT: 0, deathT: 0, phaseSeed: 2.1
      });
      expect(patrolA).toEqual(patrolB);
      // Opposite stride phases on left/right legs during patrol
      expect(Math.sign(patrolA.legLRot[0])).toBe(-Math.sign(patrolA.legRRot[0]));

      const deadPose = computeEnemyRigPose({
        kind, state: "dead", time: 4.0, stateT: 1.2, painT: 0, deathT: 0.6, phaseSeed: 2.1
      });
      // Collapsed onto the floor without sinking below y = 0
      expect(deadPose.rigPos[1]).toBeGreaterThanOrEqual(0.12);
      expect(deadPose.rigPos[1]).toBeLessThan(patrolA.rigPos[1]);
    }

    // Heavy Gunner spins rotary barrels around +Z during attack
    const gunnerAtk1 = computeEnemyRigPose({ kind: "gunner", state: "attack", time: 1.0, stateT: 0.2, painT: 0, deathT: 0 });
    const gunnerAtk2 = computeEnemyRigPose({ kind: "gunner", state: "attack", time: 1.2, stateT: 0.4, painT: 0, deathT: 0 });
    expect(gunnerAtk2.specRot[2]).toBeGreaterThan(gunnerAtk1.specRot[2]);

    // Robo-Hound lunges forward (+Z) and opens articulated jaw during attack
    const houndIdle = computeEnemyRigPose({ kind: "dog", state: "idle", time: 1.0, stateT: 0.2, painT: 0, deathT: 0 });
    const houndLunge = computeEnemyRigPose({ kind: "dog", state: "attack", time: 1.0, stateT: 0.22, painT: 0, deathT: 0 });
    expect(houndLunge.rigPos[2]).toBeGreaterThan(0.15);
    expect(houndLunge.specRot[0]).toBeGreaterThan(houndIdle.specRot[0] + 0.3);

    // Guard carbine pulses specScale during recoil kick and resets to [1, 1, 1] at rest/death
    const guardKick = computeEnemyRigPose({ kind: "guard", state: "attack", time: 1.0, stateT: 0.04, painT: 0, deathT: 0 });
    const guardDead = computeEnemyRigPose({ kind: "guard", state: "dead", time: 1.0, stateT: 0.5, painT: 0, deathT: 0.4 });
    expect(guardKick.specScale[2]).toBeGreaterThan(1.1);
    expect(guardDead.specScale).toEqual([1, 1, 1]);
  });

  it("includes root 'body' in ENEMY_RIG_PARTS and un-hides ids.body in setEnemyRigVisible", () => {
    expect(ENEMY_RIG_PARTS[0]).toBe("body");
    expect(ENEMY_RIG_PARTS).toHaveLength(9);

    const mainSrc = readFileSync(
      resolve(__dirname, "../../../apps/showcase-bunker-zero/src/main.ts"),
      "utf8"
    );
    const fnMatch = mainSrc.match(/function setEnemyRigVisible\([\s\S]*?\n\}/);
    expect(fnMatch, "setEnemyRigVisible missing from main.ts").not.toBeNull();
    expect(fnMatch![0]).toContain("ids.body");
    expect(fnMatch![0]).toContain("ENEMY_RIG_PARTS");
  });

  it("equips enemy armor materials with Fresnel rim illumination, vertex colors, and bloom-ready visors", () => {
    for (const key of ["tacticalSlateArmor", "tacticalOliveArmor", "wardenExoArmor", "darkFatigues", "corduraOlive"] as const) {
      const mat = BZ_PROC_MATERIALS[key] as unknown as {
        readonly rim?: { readonly color: string; readonly power: number; readonly intensity: number };
      };
      expect(mat.rim, `${key} missing Fresnel rim illumination`).toBeDefined();
      expect(mat.rim!.intensity).toBeGreaterThanOrEqual(0.2);
    }
    for (const key of ["visorAmber", "visorCrimson", "reactorCrimson"] as const) {
      const mat = BZ_PROC_MATERIALS[key] as unknown as {
        readonly emissiveIntensity?: number;
        readonly practical?: boolean;
      };
      expect(mat.practical).toBe(true);
      expect(mat.emissiveIntensity ?? 0).toBeGreaterThan(BZ_POST.bloom.threshold);
    }

    // Verify custom enemy mesh parts carry baked vertex colors
    const guardJson = buildArticulatedEnemyNode("guard", "vc-guard", undefined, "vc-guard", false).toJSON() as unknown as JsonSceneNode;
    let coloredParts = 0;
    const walk = (n: JsonSceneNode) => {
      if (n.geometry?.positions && n.geometry?.colors) coloredParts++;
      for (const c of n.children ?? []) walk(c);
    };
    walk(guardJson);
    expect(coloredParts).toBeGreaterThanOrEqual(12);
  });

  it("spawns immediately visible, player-facing enemies in the opening sightline of every floor and Kill House", () => {
    const defs = [
      ...FLOORS.map((def, idx) => ({ def, mode: "descent" as const, seed: 1337 + idx * 97, label: `Floor ${idx + 1}` })),
      { def: KILL_HOUSE, mode: "killhouse" as const, seed: 1344, label: "Kill House" }
    ];
    const minForwardCos = Math.cos((37.5 * Math.PI) / 180);

    for (const { def, mode, seed, label } of defs) {
      const sim = createSim(def, { ox: 0, mode, seed });
      const p = sim.state.player;
      const fx = Math.sin(p.yaw);
      const fz = -Math.cos(p.yaw);

      const openingVisible = sim.state.enemies.filter((e) => {
        const dx = e.x - p.x;
        const dz = e.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 16 || dist < 1) return false;
        const fwdDot = (dx * fx + dz * fz) / dist;
        return fwdDot >= minForwardCos && sim.hasLOS(p.x, p.z, e.x, e.z);
      });

      expect(openingVisible.length, `${label} has no enemy in the opening forward sightline`).toBeGreaterThanOrEqual(1);

      for (const e of openingVisible) {
        const toPlayerX = p.x - e.x;
        const toPlayerZ = p.z - e.z;
        const yaw = nextEnemyYaw(0, e.kind, e.facing, 10);
        expect(enemyFacingError(yaw, e.kind, toPlayerX, toPlayerZ), `${label} ${e.id} not facing player on spawn`).toBeLessThan(1e-6);
      }

      if (label === "Floor 1") {
        expect(openingVisible.some((e) => e.kind === "guard")).toBe(true);
        expect(openingVisible.some((e) => e.kind === "dog")).toBe(true);
      }

      // Within 1.5s of starting play, at least one opening enemy alerts/chases toward the player
      const idleInput = {
        moveX: 0, moveZ: 0, turn: 0, pitchDelta: 0,
        fire: false, firePressed: false, reload: false, use: false
      };
      for (let i = 0; i < 90; i++) {
        sim.tick(1 / 60, idleInput);
      }
      expect(
        openingVisible.some((e) => e.state === "alert" || e.state === "chase" || e.state === "attack"),
        `${label} opening enemy never aggroed within 1.5s`
      ).toBe(true);
    }
  });

  it("a drawn enemy faces the player for every compass bearing", () => {
    for (const kind of Object.keys(ENEMY_FORWARD) as Array<keyof typeof ENEMY_FORWARD>) {
      for (let i = 0; i < 48; i++) {
        const simFacing = (i / 48) * Math.PI * 2;
        const h = simHeading(simFacing);                // the sim looks along this world direction
        const yaw = nextEnemyYaw(0, kind, simFacing, 10); // snap (large dt)
        expect(enemyFacingError(yaw, kind, h.x, h.z)).toBeLessThan(1e-9);
      }
    }
  });

  it("turns a half turn away and converges within 0.4 s at the configured turn rate", () => {
    const kind = "guard" as const;
    const simFacing = 1.1, h = simHeading(simFacing);
    let yaw = nextEnemyYaw(0, kind, simFacing, 10) + Math.PI;
    let t = 0;
    while (t < 0.4 - 1e-9) { yaw = nextEnemyYaw(yaw, kind, simFacing, 1 / 60); t += 1 / 60; }
    expect((enemyFacingError(yaw, kind, h.x, h.z) * 180) / Math.PI).toBeLessThan(1);
    expect(ENEMY_TURN_RATE * 0.4).toBeGreaterThan(Math.PI);
  });
});
