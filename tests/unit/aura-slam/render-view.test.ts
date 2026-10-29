import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VENUES } from "../../../examples/aura-slam/contract/venues";
import { CAMERA_EYE, CAMERA_TARGET, cameraFovForAspect, projectWorldPoint } from "../../../examples/aura-slam/view/camera";
import * as C from "../../../examples/aura-slam/view/constants";
import { spectatorBounce, spectatorSeat } from "../../../examples/aura-slam/view/spectators";
import { VENUE_PALETTES, isMoonVenue, venueKey } from "../../../examples/aura-slam/view/venues";

const original = readFileSync("tests/fixtures/aura-slam-original/adapter/main.ts", "utf8");

function originalPalettes(): Record<string, Record<string, string>> {
  const start = original.indexOf("const VENUE_PALETTES: Record<string, VenuePalette> = ") + "const VENUE_PALETTES: Record<string, VenuePalette> = ".length;
  const end = original.indexOf("\n};", start) + 3;
  return new Function(`return ${original.slice(start, end - 1)}`)() as Record<string, Record<string, string>>;
}

describe("aura-slam view: constants match the live adapter", () => {
  it("court geometry constants are identical to main.ts", () => {
    const num = (name: string): number => Number(new RegExp(`const ${name} = ([0-9.]+)`).exec(original)![1]);
    expect(C.COURT_X).toBe(num("COURT_X"));
    expect(C.COURT_Z).toBe(num("COURT_Z"));
    expect(C.COURT_Y).toBe(num("COURT_Y"));
    expect(C.TRAIL_COUNT).toBe(num("TRAIL_COUNT"));
    expect(C.MARK_COUNT).toBe(num("MARK_COUNT"));
    expect(C.SPECTATOR_COUNT).toBe(num("SPECTATOR_COUNT"));
    expect(C.SINGLES_X).toBeCloseTo(4.51, 9);
    expect(C.DOUBLES_X).toBeCloseTo(5.94, 9);
    expect(C.BASELINE_Z).toBe(8);
    expect(C.SERVICE_Z).toBeCloseTo(4.16, 9);
    expect(C.NET_POST_H).toBeCloseTo(1.07, 9);
  });
});

describe("aura-slam view: venues", () => {
  it("palettes equal the original for all six venues, field by field", () => {
    const orig = originalPalettes();
    expect(Object.keys(VENUE_PALETTES).sort()).toEqual(Object.keys(orig).sort());
    for (const key of Object.keys(orig)) expect(VENUE_PALETTES[key]).toEqual(orig[key]);
  });
  it("every contract venue has a palette and unknown venues fall back to hard", () => {
    for (const v of VENUES) expect(VENUE_PALETTES[v.id]).toBeDefined();
    expect(venueKey("nope")).toBe("hard");
    expect(venueKey(undefined)).toBe("hard");
    expect(venueKey("clay")).toBe("clay");
    expect(isMoonVenue("moon")).toBe(true);
    expect(isMoonVenue("hard")).toBe(false);
  });
});

describe("aura-slam view: spectators", () => {
  it("24 seats follow the original layout rules", () => {
    for (let i = 0; i < C.SPECTATOR_COUNT; i++) {
      let sx = 0, sy = 1.25, sz = -12.4;
      if (i < 12) { sx = -7.2 + (i % 6) * 2.88 + (i >= 6 ? 0.45 : 0); sy = i < 6 ? 1.18 : 1.92; sz = i < 6 ? -12.35 : -13.55; }
      else if (i < 18) { sx = -9.15; sy = 1.35; sz = -7.5 + (i - 12) * 2.75; }
      else { sx = 9.15; sy = 1.35; sz = -7.5 + (i - 18) * 2.75; }
      expect(spectatorSeat(i)).toEqual([sx, sy, sz]);
    }
  });
  it("cheering bounces upward only, idle sways around zero", () => {
    for (let i = 0; i < 24; i++) {
      for (let t = 0; t < 5; t += 0.37) {
        expect(spectatorBounce(i, t, true)).toBeGreaterThanOrEqual(0);
        expect(Math.abs(spectatorBounce(i, t, false))).toBeLessThanOrEqual(0.015 + 1e-12);
      }
    }
  });
});

/** Independent look-at + perspective implementation to cross-check the hand-rolled pinhole projection. */
function referenceProject(w: number, h: number, p: readonly [number, number, number]): { x: number; y: number; visible: boolean } {
  const sub = (a: number[], b: readonly number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
  const norm = (a: number[]) => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return [a[0]! / l, a[1]! / l, a[2]! / l]; };
  const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const z = norm(sub([...CAMERA_EYE], CAMERA_TARGET));
  const x = norm(cross([0, 1, 0], z));
  const y = cross(z, x);
  const d = sub([...p], CAMERA_EYE);
  const vx = dot(d, x), vy = dot(d, y), vz = dot(d, z);
  const aspect = Math.max(0.2, w / Math.max(1, h));
  // C2: the court camera's vertical FOV is aspect-aware (15 degrees on desktop aspects, wider on portrait canvases).
  const f = 1 / Math.tan((cameraFovForAspect(w / Math.max(1, h)) * Math.PI) / 360);
  const ndcX = (vx * f) / aspect / -vz;
  const ndcY = (vy * f) / -vz;
  return { x: (ndcX + 1) * 0.5 * w, y: (1 - ndcY) * 0.5 * h, visible: vz < -0.1 && Math.abs(ndcX) <= 1.05 && Math.abs(ndcY) <= 1.05 };
}

describe("aura-slam view: camera projection", () => {
  it("projects the camera target to the viewport centre", () => {
    const p = projectWorldPoint(1280, 720, ...CAMERA_TARGET);
    expect(p.x).toBeCloseTo(640, 6);
    expect(p.y).toBeCloseTo(360, 6);
    expect(p.visible).toBe(true);
  });
  it("matches an independent look-at/perspective model over a dense grid and several viewports", () => {
    let cases = 0;
    for (const [w, h] of [[1280, 720], [640, 360], [390, 844], [1920, 1080]] as const) {
      for (let x = -7; x <= 7; x += 1.75) for (let y = 0; y <= 3; y += 1) for (let z = -12; z <= 12; z += 3) {
        const a = projectWorldPoint(w, h, x, y, z);
        const b = referenceProject(w, h, [x, y, z]);
        expect(a.visible).toBe(b.visible);
        if (b.visible) { expect(a.x).toBeCloseTo(b.x, 6); expect(a.y).toBeCloseTo(b.y, 6); }
        cases += 1;
      }
    }
    expect(cases).toBeGreaterThan(500);
  });
  it("points behind the camera are not visible", () => {
    expect(projectWorldPoint(1280, 720, 0, 25.5, 60).visible).toBe(false);
  });
});
