// Cross Hop diorama ambient emitters (pollen, fireflies, embers, rain, confetti) stay on the 5.0.2 emitter: 5.1 honours
// shape/shapeSize, which spread the particles through a 34 x 3 x 20.7 m box where they all but vanish (real-GPU frames:
// evidence/lane-511-engine-api/games-r3). The fixture is the origin/main (5.0.2) lowering of the same emitters.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bindApp, buildScene, setLookMode, startRun } from "../../../apps/showcase-cross-hop/src/game/core";
import { lowerEffectNode } from "../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";

const fixture = JSON.parse(readFileSync(new URL("../../fixtures/cross-hop/ambient-lowered-origin-main.json", import.meta.url), "utf8")) as Record<string, { emitter: Record<string, unknown> }>;
const THEMES: Record<string, number> = { pollen: 0, fireflies: 2, embers: 3, rain: 4, confetti: 5 };

function ambientNodeFor(theme: number): Record<string, unknown> | undefined {
  const added: Record<string, unknown>[] = [];
  const handle = { setPosition() {}, setScale() {}, setRotation() {}, setAnimation() {}, setVisible() {}, setMaterial() {}, setInstances() {}, setLight() {} };
  bindApp({
    nodes: { add: (n: Record<string, unknown>) => { added.push(n); }, remove: () => undefined, require: () => handle, get: () => handle },
    camera: { setPose() {} },
    output: { setOutputOverlay() {} },
    effects: { burst() {} }
  } as never);
  setLookMode("diorama");
  const scene = buildScene() as { nodes: Record<string, unknown>[] };
  // Theme 0 is in the built scene; other themes are swapped in by startRun (swapDioramaLook adds the new emitter).
  startRun("quick", null, 7, theme);
  const all = [...scene.nodes, ...added];
  return all.filter((n) => n.kind === "effect" && n.effect === "particles" && /^crosshop /.test(String(n.name))).at(theme === 0 ? 0 : -1);
}

describe("cross hop ambient emitters keep the 5.0.2 look", () => {
  for (const [kind, theme] of Object.entries(THEMES)) {
    it(`${kind} (theme ${theme}) lowers to the origin/main emitter`, () => {
      const node = ambientNodeFor(theme);
      expect(node?.name).toBe(`crosshop ${kind}`);
      expect(node?.shape).toBeUndefined();
      expect(node?.shapeSize).toBeUndefined();
      const lowered = JSON.parse(JSON.stringify(lowerEffectNode(node as never))) as { emitter: Record<string, unknown> };
      expect(lowered.emitter).toEqual(fixture[kind]!.emitter);
    });
  }
});
