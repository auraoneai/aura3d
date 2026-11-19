// Idol wow pass (2026-11): the stage draws the Idol GLBs for the birds, raiders, slingshot, far islands and landmarks,
// with the runtime ids, pools and placements the presenter drives (render layer only).
import { describe, expect, it } from "vitest";
import { CHAPTERS } from "../../../apps/showcase-slingshot-siege/src/game/levels";
import { POOL, buildStage, gullPartId, projectileNodeId, SLING_IDS } from "../../../apps/showcase-slingshot-siege/src/game/stage";
import { readFileSync } from "node:fs";
import {
  SLING_BASE_PLACEMENT,
  SLING_FORK_PLACEMENT,
  BIRD_SHOULDER,
  WING_FOLDED,
  applyM3,
  birdFlapAngle,
  birdWingIds,
  birdWingPoses,
  eulerToM3,
  raiderWobble,
  WINDMILL_AXLE_LOCAL,
  WINDMILL_PLACEMENT,
  WINDMILL_SAILS_ID,
  windmillHubWorld,
  windmillSailPose
} from "../../../apps/showcase-slingshot-siege/src/art/idolModels";

type Node = { kind?: string; position?: readonly number[]; rotation?: readonly number[]; instanceWind?: unknown; name?: string; asset?: { url?: string }; runtime?: { id?: string }; scaleMode?: string; children?: readonly Node[] };
const json = (n: unknown): Node => (typeof (n as { toJSON?: () => unknown }).toJSON === "function" ? (n as { toJSON: () => Node }).toJSON() : (n as Node));
const walk = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...walk(n.children ?? [])]);

describe("slingshot-siege Idol models", () => {
  const nodes = walk(buildStage(CHAPTERS[0]!, { reducedMotion: false }).nodes.map(json));
  const byId = (id: string) => nodes.find((n) => n.runtime?.id === id || n.name === id);

  it("birds, raiders and the slingshot are world-scale Idol models on their old runtime ids", () => {
    const ids = [SLING_IDS.loaded, "ammo-wait-0", SLING_IDS.catapult, ...Array.from({ length: POOL.gullRigs }, (_, g) => gullPartId(g, "body")),
      ...Array.from({ length: POOL.projectiles }, (_, i) => projectileNodeId(i))];
    for (const id of ids) {
      const n = byId(id);
      expect(n?.kind, id).toBe("model");
      expect(n?.scaleMode, id).toBe("world");
      expect(n?.asset?.url, id).toMatch(/\/aura-assets\/siege[A-Z]\w+\.[0-9a-f]+\.glb$/);
    }
    expect(byId(SLING_IDS.loaded)!.asset!.url).toMatch(/siegeBirdPebbleBody/);
    for (const wid of birdWingIds(projectileNodeId(0))) expect(byId(wid)!.asset!.url, wid).toMatch(/siegeBird\w+Wing/);
    expect(byId(gullPartId(0, "body"))!.asset!.url).toMatch(/siegeRaiderKing/);
    expect(byId(gullPartId(1, "body"))!.asset!.url).toMatch(/siegeRaiderKnight/);
    expect(byId(gullPartId(2, "body"))!.asset!.url).toMatch(/siegeRaiderGrunt/);
  });

  it("the fork's prong tips land on the band anchors (FORK_TIPS [-7.79, 1.89, +/-0.22])", () => {
    const [x, y] = SLING_FORK_PLACEMENT.position;
    const [sx, sy] = SLING_FORK_PLACEMENT.scale;
    // Measured on the normalised GLB: tips at local x +/-0.325, y 1.215, z 0; the yaw turns local x onto world -z.
    expect(y + 1.215 * sy).toBeCloseTo(1.89, 2);
    expect(0.325 * sx).toBeCloseTo(0.22, 2);
    expect(x).toBeCloseTo(-7.79, 2);
    // The base's socket rim (local -0.10, 0.71, 0.10) sits under the fork's foot.
    const b = SLING_BASE_PLACEMENT;
    expect(b.position[0] - 0.1 * b.scale).toBeCloseTo(-7.79, 2);
    expect(b.position[2] + 0.1 * b.scale).toBeCloseTo(0, 2);
    expect(b.position[1] + 0.71 * b.scale).toBeGreaterThan(y);
    expect(b.position[1] + 0.71 * b.scale - y).toBeLessThan(0.08);
  });

  it("far islands and landmarks draw Idol models", () => {
    for (const id of ["far-sea-stack", "far-lighthouseIslet", "prop-watchtower", "prop-gatehouse", "prop-windmill", "island-tree-0", "island-tree-4", "fg-crate-0", "fg-barrel-1"]) {
      expect(byId(id)?.kind, id).toBe("model");
    }
  });

  it("moving parts: the windmill sails turn about the axle tip every frame; the pines are anchored", () => {
    const sails = byId(WINDMILL_SAILS_ID)!;
    expect(sails.kind).toBe("model");
    expect(sails.asset!.url).toMatch(/siegeWindmillSails/);
    expect(byId("prop-windmill")!.asset!.url).toMatch(/siegeWindmillBody/);
    // Attached at the body's axle tip: the body transform applied to the measured local axle point.
    const hub = windmillHubWorld();
    const [lx, ly, lz] = WINDMILL_AXLE_LOCAL, a = WINDMILL_PLACEMENT.rotationY, p = WINDMILL_PLACEMENT.position;
    expect(hub[0]).toBeCloseTo(p[0] + Math.cos(a) * lx + Math.sin(a) * lz, 6);
    expect(hub[1]).toBeCloseTo(p[1] + ly, 6);
    expect(hub[2]).toBeCloseTo(p[2] - Math.sin(a) * lx + Math.cos(a) * lz, 6);
    expect(sails.position).toEqual(hub);
    // Advance a few 60 Hz frames: the spin angle grows, the hub stays put and the axle keeps facing the tower front.
    let last = windmillSailPose(0);
    for (let f = 1; f <= 5; f += 1) {
      const pose = windmillSailPose(f / 60);
      expect(pose.rotation[0]).toBeGreaterThan(last.rotation[0]);
      expect(pose.position).toEqual(hub);
      expect(pose.rotation[1]).toBeCloseTo(WINDMILL_PLACEMENT.rotationY - Math.PI / 2, 9);
      last = pose;
    }
    // main.ts drives the pose every frame from game time.
    const main = readFileSync("apps/showcase-slingshot-siege/src/main.ts", "utf8");
    expect(main).toMatch(/windmillSailPose\(elapsed\)/);
    expect(byId("island-tree-0")!.instanceWind).toBeUndefined();
  });

  it("settles programs and the Idol texture upgrades before the frame loop runs game logic and the veil lifts", () => {
    const main = readFileSync("apps/showcase-slingshot-siege/src/main.ts", "utf8");
    const warm = main.indexOf("await warmPrograms(app");
    expect(warm).toBeGreaterThan(0);
    const after = main.slice(warm);
    expect(after.indexOf("appReady = true")).toBeGreaterThan(0);
    expect(after.indexOf("loadingVeil?.classList.add(\"is-done\")")).toBeGreaterThan(after.indexOf("appReady = true") - 1);
    expect(main.slice(0, warm)).not.toMatch(/appReady = true/);
    expect(main).toMatch(/gameApp\.onFrame\(\(\{ dt \}\) => \{\n\s+if \(!appReady/);
  });

  it("creature pass: flying birds flap, perched birds tuck and twitch, wings stay on the shoulders; raiders waddle and breathe", () => {
    // Flight: the wing angle sweeps through a wide arc within a few 60 Hz frames.
    const fly = Array.from({ length: 6 }, (_, f) => birdFlapAngle(f / 60, true));
    expect(Math.max(...fly) - Math.min(...fly)).toBeGreaterThan(0.6);
    for (let f = 1; f < fly.length; f += 1) expect(fly[f]).not.toBeCloseTo(fly[f - 1]!, 3);
    // Perch: tucked near the folded angle, but still moving.
    const perch = Array.from({ length: 30 }, (_, f) => birdFlapAngle(f / 60, false));
    for (const a of perch) expect(Math.abs(a - WING_FOLDED)).toBeLessThan(0.35);
    expect(new Set(perch.map((a) => a.toFixed(4))).size).toBeGreaterThan(10);
    // Attachment: for a moving, turning body the wing roots sit exactly on the rotated, scaled shoulders, and the
    // wing rotation changes frame to frame while flying.
    let lastRot: readonly number[] | null = null;
    for (let f = 0; f < 5; f += 1) {
      const body = { position: [1 + f * 0.2, 2 + f * 0.1, 0.3], rotation: [0.1 * f, Math.PI / 2, -0.2 * f], scale: 0.48 };
      const [l, r] = birdWingPoses("ember", body, birdFlapAngle(f / 60, true));
      const R = eulerToM3(body.rotation), sh = BIRD_SHOULDER.ember;
      const el = applyM3(R, [sh[0] * 0.48, sh[1] * 0.48, sh[2] * 0.48]), er = applyM3(R, [-sh[0] * 0.48, sh[1] * 0.48, sh[2] * 0.48]);
      for (let k = 0; k < 3; k += 1) {
        expect(l.position[k]).toBeCloseTo(body.position[k]! + el[k]!, 9);
        expect(r.position[k]).toBeCloseTo(body.position[k]! + er[k]!, 9);
      }
      // The wing's span axis (local +X) points away from the body on each side (for a spread wing).
      const spanL = applyM3(eulerToM3(l.rotation), [1, 0, 0]), outL = applyM3(R, [1, 0, 0]);
      const spanR = applyM3(eulerToM3(r.rotation), [-1, 0, 0]); // the right-wing GLB is the mirror image (span -X)
      if (Math.abs(birdFlapAngle(f / 60, true)) < 1.2) {
        expect(spanL[0] * outL[0] + spanL[1] * outL[1] + spanL[2] * outL[2]).toBeGreaterThan(0);
        expect(spanR[0] * outL[0] + spanR[1] * outL[1] + spanR[2] * outL[2]).toBeLessThan(0);
        // mirror symmetry: the two spans are reflections of each other across the body plane
        expect(spanL[0] * outL[0] + spanL[1] * outL[1] + spanL[2] * outL[2]).toBeCloseTo(-(spanR[0] * outL[0] + spanR[1] * outL[1] + spanR[2] * outL[2]), 9);
      }
      if (lastRot) expect(l.rotation).not.toEqual(lastRot);
      lastRot = l.rotation;
    }
    // Raiders: roll and breathing scale change over a few frames.
    const w = Array.from({ length: 5 }, (_, f) => raiderWobble(f / 30, 1));
    expect(new Set(w.map((x) => x.roll.toFixed(4))).size).toBe(5);
    expect(new Set(w.map((x) => x.breathe.toFixed(4))).size).toBe(5);
    // main.ts drives both every frame.
    const main = readFileSync("apps/showcase-slingshot-siege/src/main.ts", "utf8");
    expect(main).toMatch(/syncBirdWings\(\);/);
    expect(main).toMatch(/raiderWobble\(elapsed, g\)/);
  });
});
