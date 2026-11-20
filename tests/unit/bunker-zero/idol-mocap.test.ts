import { describe, expect, it } from "vitest";
import { computeEnemyRigPose } from "../../../apps/showcase-bunker-zero/src/art/proceduralModels";
import { enemySpec, poseIdolEnemy } from "../../../apps/showcase-bunker-zero/src/art/idolModels";
import { BOSS_STATE_CLIP, ENEMY_STATE_CLIP, enemyClipTime, enemyMocapClipNames } from "../../../apps/showcase-bunker-zero/src/art/idolMocap";
import { readFileSync } from "node:fs";

type Bones = Record<string, { rotation: { x: number; y: number; z: number; w: number } }>;
function run(kind: "guard" | "gunner" | "boss", id: string, state: string, t: number) {
  let bones: Bones = {};
  let gun: number[] = [];
  const nodes: Record<string, unknown> = {
    [`${id}-idol`]: { setPosition() {}, setRotation() {}, setAnimationPose: (p: { bones: Bones }) => { bones = p.bones; } },
    [`${id}-idol-gun`]: { setPosition: (x: number, y: number, z: number) => { gun = [x, y, z]; }, setRotation() {} }
  };
  const pose = computeEnemyRigPose({ kind, state: state as never, time: t, stateT: t, painT: 0, deathT: state === "dead" ? t : 0, phaseSeed: 0.4 });
  poseIdolEnemy((n) => nodes[n] as never, id, kind, pose, state, t, { stateT: t, deathT: state === "dead" ? t : 0, phase: 0.4 });
  return { bones, gun };
}
const change = (a: Bones, b: Bones) => Math.max(...Object.keys(a).map((k) => Math.abs(a[k]!.rotation.x - b[k]!.rotation.x) + Math.abs(a[k]!.rotation.y - b[k]!.rotation.y) + Math.abs(a[k]!.rotation.z - b[k]!.rotation.z)));

describe("bunker zero Idol enemies play generated motion clips (fal text-to-motion)", () => {
  it("every sim state maps to a shipped clip: rifle soldier for the guard and gunner, heavy brute for the Warden", () => {
    // invariant: the clip table must stay fal text-to-motion provenance (no Sketchfab, owner rule); the toContain checks are on the exported clip-name list.
    const src = readFileSync("apps/showcase-bunker-zero/src/art/idol-mocap.ts", "utf8");
    expect(src).toMatch(/fal-ai\/hunyuan-motion/);
    expect(src).not.toMatch(/sketchfab/i);
    for (const clip of [...Object.values(ENEMY_STATE_CLIP), ...Object.values(BOSS_STATE_CLIP)]) expect(enemyMocapClipNames()).toContain(clip);
    expect(enemyClipTime("patrol", 1, 0, 0).clip).toBe("walk");
    expect(enemyClipTime("chase", 1, 0, 0).clip).toBe("run");
    expect(enemyClipTime("alert", 1, 0, 0).clip).toBe("alert");
    expect(enemyClipTime("attack", 1, 0, 0).clip).toBe("fire");
    expect(enemyClipTime("pain", 1, 0.1, 0).clip).toBe("hit");
    expect(enemyClipTime("dead", 1, 0.1, 0).clip).toBe("death");
    expect(enemyClipTime("patrol", 1, 0, 0, "boss").clip).toBe("bruteWalk");
    expect(enemyClipTime("attack", 1, 0.3, 0, "boss").clip).toBe("bruteSmash");
    expect(enemyClipTime("idle", 1, 0, 0, "boss").clip).toBe("bruteIdle");
  });

  for (const kind of ["guard", "gunner", "boss"] as const) {
    it(`${kind} (${enemySpec(kind).key}): bones change over time in every state; the gun stays held while alive`, () => {
      for (const state of ["idle", "patrol", "chase", "attack", "pain", "dead"]) {
        const id = `${kind}-${state}`;
        run(kind, id, state, 0.05); // enter the state (crossfade start)
        const a = run(kind, id, state, 0.4), b = run(kind, id, state, 0.9), c = run(kind, id, state, 1.5);
        expect(Math.max(change(a.bones, b.bones), change(a.bones, c.bones)), `${kind} ${state}`).toBeGreaterThan(0.02);
        for (const v of Object.values(b.bones)) for (const c of Object.values(v.rotation)) expect(Number.isFinite(c)).toBe(true);
        if (enemySpec(kind).gun && state !== "dead") expect(b.gun[1], `${kind} ${state} gun`).toBeGreaterThan(0.7);
      }
    });
  }
});
