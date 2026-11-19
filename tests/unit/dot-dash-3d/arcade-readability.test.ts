import { describe, expect, it } from "vitest";
import { ARCADE_FOV, ARCADE_TILT_DEG, fitArcadeRig, projectNdc, type CameraPose } from "../../../apps/showcase-dot-dash-3d/src/game/camera";
import { ARCADE } from "../../../apps/showcase-dot-dash-3d/src/game/look";
import { MAZES, MAZE_ORDER } from "../../../apps/showcase-dot-dash-3d/src/game/mazes";
import { idx, parseMaze } from "../../../apps/showcase-dot-dash-3d/src/game/grid";
import { GHOST_ORDER } from "../../../apps/showcase-dot-dash-3d/src/game/sim";
import {
  ARCADE_EMISSIVE, COURIER_FRAME, NEON, arcadeGeometries, arcadePoolBounds, neonSegments
} from "../../../apps/showcase-dot-dash-3d/src/art/arcadeActors";
import { ACTOR, CELL_SIZE, COURIER_SCALE, PELLET_SIZE, SENTRY_ARCADE, sentryColor } from "../../../apps/showcase-dot-dash-3d/src/game/world";

/**
 * Arcade readability (owner review 2026-11-18, "make them like pacman type"): a near-top-down camera frames the whole
 * maze at 1280x720 and 390x844; the courier and the four sentries are big enough to find at a glance; pellets,
 * actors and walls stand out from the near-black floor; the actors fit the corridors between the neon lines.
 */
const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16))); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

const VIEWPORTS = [[1280, 720], [390, 844]] as const;
/** On-screen diameter (px) of a flat disc of `diameter` tiles centred on tile (tx, ty) at height y. */
function screenSpan(pose: CameraPose, w: number, h: number, tx: number, ty: number, diameter: number, y = 0.2): number {
  const cx = tx - 9, cz = ty - 10, r = diameter / 2;
  const pts = [[cx - r, cz], [cx + r, cz], [cx, cz - r], [cx, cz + r]].map(([x, z]) => projectNdc(pose, w / h, [x!, y, z!])!);
  const xs = pts.map((n) => (n[0] * 0.5 + 0.5) * w), ys = pts.map((n) => (0.5 - n[1] * 0.5) * h);
  return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}
const courierWidth = (() => { const b = arcadePoolBounds("courier"); return (b.max[0]! - b.min[0]!) * COURIER_SCALE; })();

describe("dot-dash-3d arcade readability", () => {
  it("frames the whole maze from near top-down (tilt <= 10 deg) at 1280x720 and 390x844 (portrait fits the width)", () => {
    expect(ARCADE_TILT_DEG).toBeLessThanOrEqual(10);
    for (const [w, h] of VIEWPORTS) {
      const pose = fitArcadeRig(w / h);
      expect(pose.fov).toBe(ARCADE_FOV);
      const d = [pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2]];
      const tilt = (Math.acos(d[1]! / Math.hypot(...d)) * 180) / Math.PI;
      expect(tilt).toBeLessThanOrEqual(10);
      const corners = [[-9.5, -10.5], [9.5, -10.5], [-9.5, 10.5], [9.5, 10.5]].map(([x, z]) => projectNdc(pose, w / h, [x!, 0, z!])!);
      for (const c of corners) { expect(Math.abs(c[0])).toBeLessThanOrEqual(1); expect(Math.abs(c[1])).toBeLessThanOrEqual(1); }
      const span = (Math.max(...corners.map((c) => c[0])) - Math.min(...corners.map((c) => c[0]))) / 2;
      const spanY = (Math.max(...corners.map((c) => c[1])) - Math.min(...corners.map((c) => c[1]))) / 2;
      // the board fills the frame: portrait fits the width (>= 94%), landscape fills >= 80% of the height
      if (w < h) expect(span, `${w}x${h} width fill`).toBeGreaterThanOrEqual(0.94);
      else expect(spanY, `${w}x${h} height fill`).toBeGreaterThanOrEqual(0.8);
    }
  });

  it("courier and sentries are >= 28 px on screen (bodies at 1280x720; body + own glow halo at 390x844)", () => {
    const sizes: string[] = [];
    for (const [w, h] of VIEWPORTS) {
      const pose = fitArcadeRig(w / h);
      for (const [tx, ty] of [[9, 15], [1, 1], [17, 19], [1, 19], [17, 1]] as const) {
        const courier = screenSpan(pose, w, h, tx, ty, courierWidth, 0.3);
        const sentry = screenSpan(pose, w, h, tx, ty, ACTOR.sentry, 0.25);
        const courierGlow = screenSpan(pose, w, h, tx, ty, ACTOR.courierGlow, 0.01);
        const sentryGlow = screenSpan(pose, w, h, tx, ty, ACTOR.sentryGlow, 0.01);
        const pellet = screenSpan(pose, w, h, tx, ty, PELLET_SIZE, 0.16);
        sizes.push(`${w}x${h} ${tx},${ty}: courier ${courier.toFixed(1)} sentry ${sentry.toFixed(1)} pellet ${pellet.toFixed(1)}`);
        if (w > h) {
          expect(courier, `courier ${w}x${h}`).toBeGreaterThanOrEqual(28);
          expect(sentry, `sentry ${w}x${h}`).toBeGreaterThanOrEqual(28);
        } else {
          // a 390 px wide phone shows 19 tiles across: bodies are ~21-23 px, their glow halos >= 28 px
          expect(courier, `courier ${w}x${h}`).toBeGreaterThanOrEqual(20);
          expect(sentry, `sentry ${w}x${h}`).toBeGreaterThanOrEqual(20);
          expect(courierGlow, `courier glow ${w}x${h}`).toBeGreaterThanOrEqual(28);
          expect(sentryGlow, `sentry glow ${w}x${h}`).toBeGreaterThanOrEqual(28);
        }
        expect(courier / pellet).toBeGreaterThanOrEqual(5);
        expect(pellet, `pellet ${w}x${h}`).toBeGreaterThanOrEqual(3.5);
      }
    }
    console.info(sizes.filter((_, i) => i % 5 === 0).join("\n"));
  });

  it("pellets, power cells, actors and walls contrast with the floor (pellets >= 7:1)", () => {
    expect(contrast(ARCADE.pellet, ARCADE.floor)).toBeGreaterThanOrEqual(7);
    expect(contrast(ARCADE.cell, ARCADE.floor)).toBeGreaterThanOrEqual(7);
    expect(contrast(ARCADE.courier, ARCADE.floor)).toBeGreaterThanOrEqual(7);
    for (const id of GHOST_ORDER) expect(contrast(SENTRY_ARCADE[id], ARCADE.floor), id).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ARCADE.frightenedFlash, ARCADE.floor)).toBeGreaterThanOrEqual(7);
    expect(contrast(ARCADE.eyeWhite, ARCADE.pupil)).toBeGreaterThanOrEqual(7);
    for (const id of MAZE_ORDER) expect(contrast(ARCADE.neon[id], ARCADE.floor), id).toBeGreaterThanOrEqual(3);
    expect(CELL_SIZE).toBeGreaterThan(PELLET_SIZE * 2);
  });

  it("the courier is the brightest thing on screen (emissive x luminance beats sentries, pellets and walls)", () => {
    const glow = (hex: string, e: number) => lum(hex) * (1 + e);
    const courier = glow(ARCADE.courier, ARCADE_EMISSIVE.courier);
    for (const id of GHOST_ORDER) expect(courier, id).toBeGreaterThan(glow(SENTRY_ARCADE[id], ARCADE_EMISSIVE.sentry));
    for (const id of MAZE_ORDER) expect(courier, id).toBeGreaterThan(glow(ARCADE.neon[id], ARCADE_EMISSIVE.neon) * 3);
    expect(ARCADE_EMISSIVE.courier).toBeGreaterThan(ARCADE_EMISSIVE.dot);
    expect(courier).toBeGreaterThan(glow(ARCADE.pellet, ARCADE_EMISSIVE.dot));
  });

  it("four distinct solid sentry colours; frightened = one dark blue, white flashes near the end, eaten = eyes only", () => {
    expect(new Set(GHOST_ORDER.map((id) => SENTRY_ARCADE[id])).size).toBe(4);
    for (const id of GHOST_ORDER) {
      expect(sentryColor(id, 0, true, 1, false)).toBe(SENTRY_ARCADE[id]);
      expect(sentryColor(id, 5, true, 1, false)).toBe(ARCADE.frightened);
    }
    const ending = new Set(Array.from({ length: 40 }, (_, i) => sentryColor("blitz", 1, true, i * 0.023, false)));
    expect([...ending].sort()).toEqual([ARCADE.frightened, ARCADE.frightenedFlash].sort());
    expect(sentryColor("dim", 5, false, 1, false)).toBe(SENTRY_ARCADE.dim);
  });

  it("actors fill 70-85% of the corridor between the neon lines without touching them", () => {
    const corridor = 1 + 2 * NEON.inset - NEON.thickness;
    expect(courierWidth / corridor).toBeGreaterThanOrEqual(0.7);
    expect(courierWidth / corridor).toBeLessThanOrEqual(0.85);
    expect(ACTOR.sentry / corridor).toBeGreaterThanOrEqual(0.7);
    expect(ACTOR.sentry / corridor).toBeLessThanOrEqual(0.85);
    expect(courierWidth).toBeGreaterThan(ACTOR.courier);
    expect(COURIER_FRAME.noseTip).toBeGreaterThan(COURIER_FRAME.bodyRadius);
  });

  it("neon lines never cross a corridor: every walkable tile centre is >= 0.7 tiles from every line", () => {
    for (const id of MAZE_ORDER) {
      const m = parseMaze(MAZES[id]);
      const segs = neonSegments(m.width, m.height, (x, y) => m.wall[idx(m.width, x, y)] === true);
      expect(segs.length, id).toBeGreaterThan(100);
      const bad: string[] = [];
      for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
        if (m.wall[idx(m.width, x, y)]) continue;
        for (const s of segs) {
          const dx = Math.max(0, Math.abs(x - s.x) - s.sx / 2), dz = Math.max(0, Math.abs(y - s.z) - s.sz / 2);
          if (Math.hypot(dx, dz) < 0.7 - 1e-6) bad.push(`${x},${y}`);
        }
      }
      expect(bad, id).toEqual([]);
    }
  });

  it("every arcade pool geometry is unit-bounded and the sentries are four different silhouettes", () => {
    const g = arcadeGeometries();
    for (const [key, spec] of Object.entries(g)) {
      const p = spec.positions as Float32Array;
      expect(p.length, key).toBeGreaterThanOrEqual(24);
      for (let i = 0; i < p.length; i++) { expect(Number.isFinite(p[i]!)).toBe(true); expect(Math.abs(p[i]!), key).toBeLessThanOrEqual(0.5 + 1e-6); }
    }
    const counts = (["sentryBlitz", "sentrySly", "sentryFlick", "sentryDim"] as const).map((k) => (g[k].positions as Float32Array).length);
    expect(new Set(counts).size).toBe(4);
  });
});
