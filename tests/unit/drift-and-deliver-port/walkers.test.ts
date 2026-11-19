import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { idolClipRig, maxTravel } from "./idolClipDispatch";
import { PITCH, STREET_LINES } from "../../../examples/drift-and-deliver-port/world";
import { WALKER_CLIPS, WALKER_KEYS, WALKER_POOL, assignWalkers, walkerPose, walkersNear } from "../../../examples/drift-and-deliver-port/walkers";

describe("Gridlock Courier Idol sidewalk walkers (render only)", () => {
  it("advance along their sidewalk, stay on the 6.6-7.6 m band and 12 m clear of crossings, and are deterministic", () => {
    const ws = walkersNear(31, -12);
    const walking = ws.filter((w) => !w.idle), idling = ws.filter((w) => w.idle);
    expect(walking.length).toBeGreaterThan(20);
    expect(idling.length).toBeGreaterThan(0);
    for (const w of ws) {
      const p0 = walkerPose(w, 3), p1 = walkerPose(w, 3.2);
      const lat = w.onZ ? p0.x - w.line : p0.z - w.line, along = w.onZ ? p0.z : p0.x;
      expect(Math.abs(lat)).toBeGreaterThanOrEqual(6.4);
      expect(Math.abs(lat)).toBeLessThanOrEqual(7.8);
      const t = (((along - 30) % PITCH) + PITCH) % PITCH;
      expect(t).toBeGreaterThanOrEqual(12 - 1e-6);
      expect(t).toBeLessThanOrEqual(PITCH - 12 + 1e-6);
      const step = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      if (w.idle) expect(step).toBe(0);
      else { const p2 = walkerPose(w, 3.6); expect(Math.max(step, Math.hypot(p2.x - p0.x, p2.z - p0.z))).toBeGreaterThan(0.1); }
      expect(walkerPose(w, 3)).toEqual(p0);
    }
    expect(STREET_LINES.length).toBeGreaterThan(0);
  });
  it("fills the 16-node pool around the courier with walkers and idlers", () => {
    const slots = assignWalkers(31, -12, 7);
    expect(slots).toHaveLength(WALKER_POOL);
    const shown = slots.filter((s) => s !== null);
    expect(shown.length).toBeGreaterThanOrEqual(12);
    expect(shown.some((s) => s!.clip === WALKER_CLIPS.walk)).toBe(true);
    for (const s of shown) expect(Math.hypot(s!.x - 31, s!.z + 12)).toBeLessThan(140);
  });

  it("walkers: clips play through the engine's per-frame dispatch at real frame time; a frozen engine clock stays in the T-pose", async () => {
    for (const key of WALKER_KEYS) {
      const r = await idolClipRig(`examples/drift-and-deliver-port/assets/idol/${key}.glb`);
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
    const main = readFileSync("examples/drift-and-deliver-port/main.ts", "utf8");
    expect(main).not.toMatch(/\.step\(0\)|stepAsync\(0\)/);
  });
});
