// Owner report 2026-10-31: holding Shift for a few seconds made the car shake and the engine buzz instead of just
// staying in overdrive. With Shift held at 0 air, the next grounded frame's regen re-armed boost every other frame, so a
// new "boost" event (sound + shake pulse) and an engine pitch jump fired each time. The sim's boost state machine is
// unchanged (the reference replays stay sample-identical); the sound, shake, engine pitch and speed lines now follow
// Player.boostVisual, which bridges those one-frame gaps.

import { describe, expect, it } from "vitest";
import { BOOST_FX_REARM_S } from "../../../apps/showcase-roadster-rush/src/native/constants";
import { Player } from "../../../apps/showcase-roadster-rush/src/native/player";

const env = { difficulty: 0, supportHeight: () => 0 };
const DT = 1 / 60;

/** Runs the player with Shift held or released; counts "boost" events (each one plays the boost sound and sets a shake
 *  pulse) and flips of the visual boost flag. */
function run(player: Player, seconds: number, boost: boolean): { boostEvents: number; visualToggles: number } {
  let boostEvents = 0;
  let visualToggles = 0;
  let was = player.boostVisual;
  player.onEvent = (name) => { if (name === "boost") boostEvents++; };
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    player.update(DT, { boost } as never, env);
    if (player.boostVisual !== was) visualToggles++;
    was = player.boostVisual;
  }
  return { boostEvents, visualToggles };
}

describe("Apex Overdrive boost presentation", () => {
  it("a held boost past empty air fires its sound and shake once and stays visually on", () => {
    const player = new Player();
    player.reset();
    const r = run(player, 8, true);
    expect(r.boostEvents).toBe(1);
    expect(r.visualToggles).toBe(1); // on once, never flickering off while Shift is held
    expect(player.boostVisual).toBe(true);
  });

  it("releasing Shift ends the visual boost after the re-arm window, and a new press fires again", () => {
    const player = new Player();
    player.reset();
    run(player, 1, true);
    run(player, BOOST_FX_REARM_S + 0.1, false);
    expect(player.boostVisual).toBe(false);
    const r = run(player, 0.2, true);
    expect(r.boostEvents).toBe(1);
  });
});
