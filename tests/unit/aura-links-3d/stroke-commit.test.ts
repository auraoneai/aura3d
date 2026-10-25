import { describe, expect, it } from "vitest";
import { commitStroke } from "../../../apps/showcase-aura-links-3d/src/game/strokeCommit";

describe("commitStroke", () => {
  it("counts one stroke when the meter reports committed on many frames", () => {
    const round = { strokes: 0, putts: 0 };
    const drive = { committed: false };
    let applied = 0;
    for (let frame = 0; frame < 60; frame += 1) if (commitStroke(round, drive, false)) applied += 1;
    expect(applied).toBe(1);
    expect(round.strokes).toBe(1);
    expect(round.putts).toBe(0);
  });

  it("counts a putt once and a new shot after the drive resets", () => {
    const round = { strokes: 3, putts: 1 };
    const drive = { committed: false };
    for (let frame = 0; frame < 20; frame += 1) commitStroke(round, drive, true);
    expect(round).toEqual({ strokes: 4, putts: 2 });
    drive.committed = false;
    commitStroke(round, drive, false);
    expect(round).toEqual({ strokes: 5, putts: 2 });
  });
});
