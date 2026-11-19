/**
 * Idol critters animate their bodies (owner: "they're just sliding"): every critter's split parts (legs/feet, wings,
 * arms, ears, gills, tails, the turtle's neck) change angle through a hop, crouch before take-off, settle after the
 * landing and keep moving at idle; and the core loop writes the part pose to the player model every frame.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { critterPartAngles, critterPartPose, critterParts, type CritterMotionState } from "../../../apps/showcase-cross-hop/src/game/critterRig";
import { CRITTER_ASSET_IDS } from "../../../apps/showcase-cross-hop/src/aura-assets";
import { idolCritterKey } from "../../../apps/showcase-cross-hop/src/game/idolModels";
import { bindApp, startRun, st, step, syncVisuals } from "../../../apps/showcase-cross-hop/src/game/core";

const at = (t: number, extra: Partial<CritterMotionState> = {}): CritterMotionState =>
  ({ t, hopping: true, landSince: -1, time: 1 + t * 0.2, reducedMotion: false, ...extra });
const mag = (a: readonly number[]) => Math.hypot(a[0]!, a[1]!, a[2]!);

// What each critter must move (from its split; the knight's shield and sword keep its arms rigid).
const EXPECT: Record<string, readonly string[]> = {
  hop: ["legL", "legR"], goldenHop: ["legL", "legR"], roboFrog: ["legL", "legR"],
  chick: ["wingL", "wingR", "footL", "footR"], ducky: ["wingL", "wingR", "footL", "footR", "tail"],
  turtle: ["head", "legFL", "legFR", "legBL", "legBR"], bun: ["earL", "earR", "footL", "footR", "tail"],
  axolotl: ["gillL", "gillR", "tail", "footL", "footR"], toastCat: ["earL", "earR", "tail", "footL", "footR"],
  mushroomKid: ["armL", "armR", "footL", "footR"], knightToad: ["footL", "footR"],
  astroFrog: ["armL", "armR", "legL", "legR"]
};

describe("cross hop Idol critter body animation", () => {
  for (const id of CRITTER_ASSET_IDS) {
    it(`${id}: every part moves through a hop, crouches first, settles after landing and sways at idle`, () => {
      const key = idolCritterKey(id);
      const names = critterParts(key).map((p) => p.name);
      expect(names.sort()).toEqual([...EXPECT[id]!].sort());
      const frames = [0.05, 0.14, 0.3, 0.45, 0.6, 0.8, 0.95].map((t) => critterPartAngles(key, at(t)));
      for (const name of names) {
        const series = frames.map((f) => f[name]!);
        const spread = Math.max(...series.map(mag)) - Math.min(...series.map(mag));
        expect(spread, `${id}.${name} angle range over the hop`).toBeGreaterThan(0.08);
        // landing settle: still moving 0.05 s after touch-down, nearly at rest 0.6 s later
        const land = critterPartAngles(key, at(0, { hopping: false, landSince: 0.05, time: 0 }))[name]!;
        const later = critterPartAngles(key, at(0, { hopping: false, landSince: 0.7, time: 0 }))[name]!;
        expect(mag(land) - mag(later), `${id}.${name} landing settle`).not.toBe(0);
        // idle: angles keep changing between hops
        const i0 = critterPartAngles(key, at(0, { hopping: false, landSince: 5, time: 10 }))[name]!;
        const i1 = critterPartAngles(key, at(0, { hopping: false, landSince: 5, time: 10.7 }))[name]!;
        expect(i0, `${id}.${name} idle motion`).not.toEqual(i1);
      }
      // anticipation: legs/feet swing forward (negative pitch) in the crouch before take-off
      for (const p of critterParts(key).filter((q) => q.motion === "leg" && q.front === 0)) {
        expect(critterPartAngles(key, at(0.14))[p.name]![0], `${id}.${p.name} crouch`).toBeLessThan(-0.1);
        expect(critterPartAngles(key, at(0.35))[p.name]![0], `${id}.${p.name} push-off`).toBeGreaterThan(0.2);
      }
      const pose = critterPartPose(key, at(0.4));
      for (const name of names) {
        const q = pose.bones[name]!.rotation;
        expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 6);
      }
    });
  }

  it("the hawk flaps its wings", () => {
    const a = critterPartAngles("hopHawk", at(0.2)), b = critterPartAngles("hopHawk", at(0.4));
    const wings = critterParts("hopHawk").map((p) => p.name);
    expect(wings.length).toBe(2);
    for (const w of wings) expect(Math.abs(a[w]![2] - b[w]![2])).toBeGreaterThan(0.1);
  });

  // "unresolved": the handle has `part` but it answers undefined (the production build on the real GPU, 2026-11-19),
  // so the overlay pose must still move the legs.
  for (const withParts of [true, false, "unresolved"] as const) {
    it(`the game loop turns the player's leg part every frame while it hops (${withParts === true ? "handle.part" : withParts === false ? "overlay pose fallback" : "part() unresolved -> overlay pose"})`, () => {
      const legX: number[] = [];
      const handle = (id: string) => ({
        setPosition() {}, setScale() {}, setRotation() {}, setAnimation() {}, setVisible() {}, setMaterial() {}, setInstances() {},
        setAnimationPose(p: { mode: string; bones: Record<string, { rotation: { x: number; y: number; z: number; w: number } }> }) {
          if (id !== "player-body") return;
          expect(p.mode).toBe("overlay");
          const q = p.bones.legL!.rotation;
          expect(typeof q.w).toBe("number"); // object-form quaternion (tuples do not survive the handle's pose clone)
          legX.push(2 * Math.atan2(q.x, q.w));
        },
        ...(withParts === true && id === "player-body"
          ? { part: (name: string) => (name === "legL" ? { setRotation: (x: number) => { legX.push(x); } } : { setRotation() {} }) }
          : withParts === "unresolved" ? { part: () => undefined } : {})
      });
      const handles = new Map<string, ReturnType<typeof handle>>();
      const get = (id: string) => { if (!handles.has(id)) handles.set(id, handle(id)); return handles.get(id)!; };
      bindApp({ nodes: { add() {}, remove() {}, require: get, get }, camera: { setPose() {} }, output: { setOutputOverlay() {} }, effects: { burst() {} } } as never);
      startRun("quick", null, 3);
      let pressed = true;
      for (let f = 0; f < 30; f++) {
        step(1 / 60, { buffered: (d: string) => d === "up" && pressed, consume: () => { pressed = false; return true; } } as never);
        syncVisuals(1);
      }
      expect(st.playerRow + st.hop.t).toBeGreaterThan(0);
      expect(legX.length).toBeGreaterThan(20);
      // crouch (negative) then push-off (positive) both reach the renderer
      expect(Math.min(...legX)).toBeLessThan(-0.1);
      expect(Math.max(...legX)).toBeGreaterThan(0.2);
    });
  }

  it("core.ts poses the player, the spectators and the hawk every frame", () => {
    const core = readFileSync("apps/showcase-cross-hop/src/game/core.ts", "utf8");
    expect(core).toContain('poseCritterParts(nodes.get("player-body"), idolCritterKey(st.critter.asset)');
    expect(core).toContain("poseCritterParts(nodes.get(`spectator-${idx}-body`)");
    expect(core).toContain('poseCritterParts(nodes.get("hawk-body"), "hopHawk"');
  });
});
