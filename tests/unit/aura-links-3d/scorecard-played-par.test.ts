/**
 * Aura Links 3D closing card: the PAR total sums only the holes played (the unplayed holes read "–"), so a round
 * started mid-course (?hole=N, autoplay) or cut short does not print par 36 next to three holes' strokes.
 */
import { describe, expect, it } from "vitest";
import { COURSE_ORDER, COURSES } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import { createScoreCard, holePlayed, playedPar, recordHole } from "../../../apps/showcase-aura-links-3d/src/game/sim";

describe("aura-links-3d scorecard par totals", () => {
  const course = COURSES[COURSE_ORDER[0]!];

  it("a fresh card has no played par; a full round's played par is the course par", () => {
    let card = createScoreCard(course);
    expect(playedPar(card)).toBe(0);
    expect(card.holes.some(holePlayed)).toBe(false);
    for (const h of course.holes) card = recordHole(card, h, h.par + 1, 2);
    expect(playedPar(card)).toBe(card.totalPar);
    expect(card.toPar).toBe(card.totalStrokes - playedPar(card));
  });

  it("a partial round (holes 7-9 only) totals par over the played holes and stays consistent with strokes and to-par", () => {
    let card = createScoreCard(course);
    const played = course.holes.slice(6);
    const strokes = [4, 3, 6];
    played.forEach((h, i) => (card = recordHole(card, h, strokes[i]!, 2)));
    const expectedPar = played.reduce((s, h) => s + h.par, 0);
    expect(playedPar(card)).toBe(expectedPar);
    expect(playedPar(card)).toBeLessThan(card.totalPar);
    expect(card.totalStrokes).toBe(13);
    expect(card.toPar).toBe(card.totalStrokes - playedPar(card));
    expect(card.holes.filter(holePlayed).map((h) => h.hole)).toEqual(played.map((h) => h.number));
  });
});
