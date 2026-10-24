import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clipDuration, forward, localPose, nodeIndex, qrot, readGlb } from "../../../tools/aura-fc/glb.mjs";
import { BALL_MODEL, BALL_RADIUS_MODEL, CONTACT_FRAC, TOE_POINT } from "../../../tools/aura-fc/bake-kick.mjs";

/**
 * The baked KickTap / KickPass / KickShot clips, measured from the animation data inside the shipped GLBs (not from
 * the baker's own report): the boot meets the ball at the sim's launch fraction, the swing runs along the kick
 * line, the standing foot stays planted, and nothing goes through the floor.
 */
const manifest = readFileSync("apps/showcase-aura-fc-3d/src/aura-assets-v2.ts", "utf8");
const glbPath = (key: string) => `public${/url: "([^"]+)"/.exec(manifest.slice(manifest.indexOf(`${key}: {`)))![1]}`;
const KICKS = ["KickTap", "KickPass", "KickShot"] as const;
// sim.ts launch angles (deg) at the kick powers each clip covers: pass 20 + 8p (p .12..0.75), shot/driven 10..16
const LAUNCH_ELEVATION: Record<(typeof KICKS)[number], [number, number]> = { KickTap: [20.9, 22], KickPass: [22, 26], KickShot: [12, 16.5] };

function sample(glbFile: string, clipName: string) {
  const glb = readGlb(glbFile);
  const anim = glb.json.animations.find((a: { name: string }) => a.name === clipName);
  expect(anim, `${glbFile} has ${clipName}`).toBeTruthy();
  const dur = clipDuration(glb, anim);
  const n = Math.round(dur * 60);
  const frames = Array.from({ length: n + 1 }, (_, k) => forward(glb, localPose(glb, anim, (dur * k) / n)));
  return { glb, dur, n, frames, id: nodeIndex(glb).id };
}
const tip = (f: any, id: (n: string) => number) => {
  const a = f.pos[id("RightFoot")], o = qrot(f.rot[id("RightFoot")], TOE_POINT);
  return [a[0] + o[0], a[1] + o[1], a[2] + o[2]] as [number, number, number];
};

describe.each([["striker", "fcSoccerStrikerMeshy"], ["keeper", "fcGoalkeeperMeshy"]])("%s kick clips", (_label, key) => {
  const file = glbPath(key);
  for (const clip of KICKS) {
    it(`${clip}: boot meets the ball at the launch fraction, along the kick line`, () => {
      const { dur, n, frames, id } = sample(file, clip);
      expect(dur).toBeCloseTo(0.6, 3);
      const kc = Math.round(CONTACT_FRAC * n);
      const dt = 1 / 60;
      const p = tip(frames[kc], id);
      const toBall = Math.hypot(p[0] - BALL_MODEL[0], p[1] - BALL_MODEL[1], p[2] - BALL_MODEL[2]);
      expect(toBall).toBeLessThan(BALL_RADIUS_MODEL);              // boot tip is inside the ball at the strike frame
      const a = tip(frames[kc - 1], id), b = tip(frames[kc + 1], id);
      const v = [(b[0] - a[0]) / (2 * dt), (b[1] - a[1]) / (2 * dt), (b[2] - a[2]) / (2 * dt)];
      const yaw = Math.abs(Math.atan2(v[0], v[2]) * 180 / Math.PI);
      const elev = Math.atan2(v[1], Math.hypot(v[0], v[2])) * 180 / Math.PI;
      expect(yaw).toBeLessThan(15);                                  // swing runs along the (model-forward) kick line
      const [lo, hi] = LAUNCH_ELEVATION[clip];
      expect(Math.abs(elev - (lo + hi) / 2)).toBeLessThan(15);       // and rises about like the launch it produces
      expect(Math.hypot(...v)).toBeGreaterThan(3.5);                 // fastest point of the swing (model units/s)
      const speeds = frames.slice(1, -1).map((_f, i) => { const q0 = tip(frames[i], id), q1 = tip(frames[i + 2], id); return Math.hypot(q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]) / (2 * dt); });
      expect(speeds[kc - 1]).toBeGreaterThan(Math.max(...speeds) * 0.85);   // contact is at (or within 15% of) peak speed
    });

    it(`${clip}: standing foot stays planted, feet never go through the floor, backswing precedes the strike`, () => {
      const { frames, id } = sample(file, clip);
      const left0 = frames[0].pos[id("LeftFoot")];
      let drift = 0, minAnkle = 9;
      for (const f of frames) {
        const l = f.pos[id("LeftFoot")], r = f.pos[id("RightFoot")];
        drift = Math.max(drift, Math.hypot(l[0] - left0[0], l[1] - left0[1], l[2] - left0[2]));
        minAnkle = Math.min(minAnkle, l[1], r[1]);
      }
      expect(drift).toBeLessThan(0.012);                              // < 1.2 cm over the whole swing
      expect(minAnkle).toBeGreaterThan(0.14);                         // ankle joint stays above the rest height - 1 cm
      const z = frames.map((f) => f.pos[id("RightFoot")][2]);
      const kc = Math.round(CONTACT_FRAC * (frames.length - 1));
      expect(Math.min(...z.slice(0, kc))).toBeLessThan(-0.2);         // boot goes back first
      expect(z[kc]).toBeGreaterThan(Math.min(...z) + 0.2);            // then comes forward through the ball
      expect(z.at(-1)!).toBeGreaterThan(z[kc]!);                      // and follows through
    });
  }

  it("the original Shoot clip has no kick in it (why the kit boxes looked like a second set of legs)", () => {
    const { frames, id } = sample(file, "Shoot");
    const z = frames.map((f) => f.pos[id("RightFoot")][2]);
    expect(Math.max(...z) - Math.min(...z)).toBeLessThan(0.35);
  });
});
