import { describe, expect, it } from "vitest";
import { bindDressing } from "../../../apps/showcase-beat-hopper/src/dressing";
import { BeatHopperSim } from "../../../apps/showcase-beat-hopper/src/sim";
import { buildWorld } from "../../../apps/showcase-beat-hopper/src/world";

/**
 * Idol wow pass, moving parts: the Idol speaker towers / synth stacks live in `grp-dress-stacks`, which pumps on the
 * 132 BPM bass (the procedural cabinets' only motion), and the DJ consoles in `grp-dress-decks` bob on the beat. The
 * skater-bot's motion (clips) is covered by idol-skater.test.ts; its 5 cm inline wheels (~3 px at the 9.7 m chase
 * camera) stay part of the rigid boot.
 */
describe("beat-hopper Idol stage dressing moves on the beat", () => {
  it("the Idol speaker stacks sit in the pumping stack group and the decks in the bobbing deck group", () => {
    type N = { name?: string; kind?: string; children?: N[] };
    const nodes = buildWorld({ sim: new BeatHopperSim(7), aspect: 16 / 9 }).scene.toJSON().nodes as unknown as N[];
    const stacks = nodes.find((n) => n.name === "grp-dress-stacks")!, decks = nodes.find((n) => n.name === "grp-dress-decks")!;
    expect(stacks.children?.map((c) => c.name)).toEqual(["dress-stack-a", "dress-stack-b"]);
    expect(decks.children?.map((c) => c.name)).toEqual(["dress-deck"]);
    const calls = new Map<string, { pos?: number[]; scale?: number[] }>();
    const handle = (id: string) => {
      const rec = calls.get(id) ?? {};
      calls.set(id, rec);
      const h = { setPosition: (x: number, y: number, z: number) => { rec.pos = [x, y, z]; return h; }, setScale: (s: number[]) => { rec.scale = s; return h; } };
      return h as never;
    };
    const rt = bindDressing(handle);
    rt.update(10, 0);
    const quiet = { ...calls.get("grp-dress-stacks")! }, deckQuiet = calls.get("grp-dress-decks")!.pos!;
    rt.update(10.4, 1);
    const thump = calls.get("grp-dress-stacks")!;
    expect(thump.scale![0]).toBeGreaterThan(quiet.scale![0]! + 0.03);
    expect(thump.scale![1]).toBeGreaterThan(quiet.scale![1]!);
    expect(calls.get("grp-dress-decks")!.pos![1]! - deckQuiet[1]!).toBeGreaterThan(0.1);
  }, 60_000);
});
