// Idol QA regression: "after a level clears, a decorative tree and its ground disc fly off the cliff into the sea".
// Reproduces a level-1 clear through the real Rapier SiegeSim and the presenter's node addressing (main.ts maps every
// sim visual to a pooled runtime id: piece slots via assignPoolSlots, projectiles, debris, gull rigs, windmills) and
// asserts that no presenter write can reach a decorative node: the decor nodes carry no runtime id and are not
// instanced, so neither `app.nodes.get(id)` nor a pool `setInstances` can move them, through the clear and the
// next level's slot reassignment.
import { describe, expect, it } from "vitest";
import { SiegeSim } from "../../../apps/showcase-slingshot-siege/src/game/sim";
import { LEVELS, CHAPTERS } from "../../../apps/showcase-slingshot-siege/src/game/levels";
import { assignPoolSlots } from "../../../apps/showcase-slingshot-siege/src/game/layout";
import {
  POOL, barrelNodeId, blockNodeId, buildStage, crateNodeId, debrisNodeId, gullPartId, millPoleNodeId, plankNodeId, projectileNodeId
} from "../../../apps/showcase-slingshot-siege/src/game/stage";
import { propPoolNodeId, PROP_POOL_FAMILIES, blockFamilyNodeId, BLOCK_FAMILIES, BARREL_BAND_POOL_ID } from "../../../apps/showcase-slingshot-siege/src/game/blockInstances";

type Node = { kind?: string; name?: string; position?: number[]; rotation?: number[]; scale?: unknown; runtime?: { id?: string }; instances?: unknown[]; children?: Node[] };
const json = (n: unknown): Node => (typeof (n as { toJSON?: () => unknown }).toJSON === "function" ? (n as { toJSON: () => Node }).toJSON() : (n as Node));
const walk = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...walk(n.children ?? [])]);
const yieldToLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function presenterTargets(sim: SiegeSim): Set<string> {
  const ids = new Set<string>();
  const slots = assignPoolSlots(sim.pieceList().map((p) => p.spec), POOL);
  for (const slot of slots) {
    if (!slot) continue;
    ids.add(slot.kind === "crate" ? crateNodeId(slot.slot) : slot.kind === "barrel" ? barrelNodeId(slot.slot) : slot.kind === "plank" ? plankNodeId(slot.slot) : blockNodeId(slot.slot));
  }
  for (const u of sim.forEachVisual()) {
    if (u.id.startsWith("projectile-")) ids.add(projectileNodeId(Number(u.id.slice(11)) % POOL.projectiles));
    else if (u.id.startsWith("debris-")) ids.add(debrisNodeId(Number(u.id.slice(7))));
  }
  sim.gullList().forEach((_, g) => ids.add(gullPartId(g, "body")));
  sim.windmillList().forEach((_, m) => ids.add(millPoleNodeId(m)));
  for (const f of PROP_POOL_FAMILIES) ids.add(propPoolNodeId(f));
  for (const f of BLOCK_FAMILIES) ids.add(blockFamilyNodeId(f));
  ids.add(BARREL_BAND_POOL_ID);
  return ids;
}

describe("slingshot-siege decor stays anchored through a level clear", () => {
  it("level 1 cleared by the real sim: no presenter write can address a decorative pine, crate or keg", async () => {
    const stageNodes = walk(buildStage(CHAPTERS[0]!, { reducedMotion: false }).nodes.map(json));
    const decor = stageNodes.filter((n) => /^(island-tree|fg-crate|fg-barrel)-\d$/.test(n.name ?? ""));
    expect(decor).toHaveLength(10);
    const before = JSON.stringify(decor.map((n) => [n.name, n.position, n.rotation, n.scale]));
    for (const n of decor) {
      expect(n.runtime, n.name).toBeUndefined();
      expect(n.instances, n.name).toBeUndefined();
    }
    const runtimeIds = new Set(stageNodes.map((n) => n.runtime?.id).filter((id): id is string => typeof id === "string"));

    const sim = new SiegeSim({ level: LEVELS[0]!, seed: 42 });
    const written = presenterTargets(sim);
    let shots = 0;
    for (let frame = 0; frame < 60 * 40 && sim.gullsAlive() > 0; frame += 1) {
      if (!sim.isShotActive() && shots < 8 && frame % 240 === 0) { sim.launch(shots % 2 ? "ember" : "stone", [-7.4, 1.8, 0], [9.5 + (shots % 3) * 0.6, 7.5 - (shots % 2) * 0.4, 0]); shots += 1; }
      sim.update(1 / 60);
      for (const id of presenterTargets(sim)) written.add(id);
      if (frame % 60 === 59) await yieldToLoop();
    }
    expect(sim.gullsAlive(), "level 1 cleared").toBe(0);
    // the level transition reassigns every pool slot for the next level
    sim.loadLevel(LEVELS[1]!);
    for (const id of presenterTargets(sim)) written.add(id);

    // Every presenter target is a real runtime id of a pooled node, and none of them is decor.
    for (const id of written) {
      expect(runtimeIds.has(id) || /^v-(block|crate|barrel|plank|debris)-\d+$/.test(id), id).toBe(true);
      expect(/^(island-tree|fg-crate|fg-barrel)-\d$/.test(id), id).toBe(false);
    }
    // The decor transforms are authored once and never change.
    const after = walk(buildStage(CHAPTERS[0]!, { reducedMotion: false }).nodes.map(json)).filter((n) => /^(island-tree|fg-crate|fg-barrel)-\d$/.test(n.name ?? ""));
    expect(JSON.stringify(after.map((n) => [n.name, n.position, n.rotation, n.scale]))).toBe(before);
  }, 60_000);
});
