import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { idolClipRig, maxTravel } from "./idolClipDispatch";
import { WALKER_CLIPS, WALKER_KEYS, WALKER_POOL, nearestTown, townWalkers, walkerPose, type TownFrame } from "../../../examples/last-train-port/walkers";

const FRAME: TownFrame = { o: [10, 4, -20], f: [0.6, 0.8], s: [0.8, -0.6] };

describe("Lamplight Line Idol town walkers (render only)", () => {
  it("advance along the platform or plaza, never onto the track, and are deterministic", () => {
    const ws = townWalkers(2);
    expect(ws).toHaveLength(WALKER_POOL);
    expect(ws.some((w) => w.idle)).toBe(true);
    for (const w of ws) {
      const p0 = walkerPose(FRAME, w, 5), p1 = walkerPose(FRAME, w, 5.2);
      const lat = (p0.x - FRAME.o[0]) * FRAME.s[0] + (p0.z - FRAME.o[2]) * FRAME.s[1];
      expect(Math.abs(lat)).toBeGreaterThanOrEqual(3.8); // the track is lateral 0 with a ~1.5 m tram half-width
      expect(walkerPose(FRAME, w, 5)).toEqual(p0);
      if (w.idle) expect(p1.along).toBe(p0.along);
      else expect(Math.max(Math.abs(p1.along - p0.along), Math.abs(walkerPose(FRAME, w, 5.6).along - p0.along))).toBeGreaterThan(0.1);
    }
    expect(nearestTown([FRAME, { ...FRAME, o: [400, 0, 400] }], 30, -10)).toBe(0);
  });

  it("walkers: clips play through the engine's per-frame dispatch at real frame time; a frozen engine clock stays in the T-pose", async () => {
    for (const key of WALKER_KEYS) {
      const r = await idolClipRig(`apps/showcase-last-train-port/assets/idol/${key}.glb`);
      expect(r.clipNames, key).toEqual(expect.arrayContaining([WALKER_CLIPS.walk, WALKER_CLIPS.idle]));
      for (const clip of [WALKER_CLIPS.walk, WALKER_CLIPS.idle]) {
        const spec = { clip, loop: true, speed: 1 };
        // app.step(0): engine time never moves, the clip never fades in, the bind T-pose is drawn
        let f = r.frame(spec, 5000);
        for (let i = 0; i < 10; i++) f = r.frame(spec, 5000);
        // (checked on the first clip only: the actor keeps the last played pose when the next clip starts)
        if (clip === WALKER_CLIPS.walk) for (const d of r.handDrop(f)) expect(d, `${key} ${clip} frozen clock`).toBeLessThan(0.15);
        // real frame time (60 fps)
        let ms = 5000;
        const advance = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) f = r.frame(spec, (ms += 1000 / 60)); return f; };
        const a = advance(1.0);
        expect(a.warnings, key).toEqual([]);
        for (const d of r.handDrop(a)) expect(d, `${key} ${clip} arms hang`).toBeGreaterThan(0.2);
        const b = advance(clip === WALKER_CLIPS.walk ? 0.4 : 1.2);
        expect(maxTravel(a, b), `${key} ${clip} moves`).toBeGreaterThan(clip === WALKER_CLIPS.walk ? 0.03 : 0.002);
      }
    }
  }, 180_000);

  it("main.ts steps the engine by frame time (the clip mixer needs dt; app.step(0) froze Idol clips in the bind T-pose)", () => {
    const main = readFileSync("examples/last-train-port/main.ts", "utf8");
    expect(main).not.toMatch(/\.step\(0\)|stepAsync\(0\)/);
  });
});
