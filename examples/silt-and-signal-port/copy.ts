/**
 * Player-facing text for the game, written for it (chapter names, objective titles and voiced
 * lines are not reused). Keys are the objective, chapter and scene ids from `chapters-data.ts`; the sim and the
 * reference replay never read this file.
 */
export const GAME_TITLE = "Duneglide";

export const CHAPTER_COPY: Record<string, { name: string; tagline: string }> = {
  home: { name: "Lantern Road", tagline: "One small village, one long road, one favour to repay." },
  aqueduct: { name: "The Broken Waterway", tagline: "Shortcuts through old stone cost more than they save." },
  forest: { name: "Upside-down Woods", tagline: "Roots hang in the sky, and everything glows after dark." },
  nursery: { name: "The Lantern Reef", tagline: "Slow tides, soft light, and something that needs tending." },
  orchard: { name: "Orchard of Storms", tagline: "For a few minutes, the weather works for you." },
  crown: { name: "The Quiet Crown", tagline: "The hardest flights are the ones you owe an apology for." },
  return: { name: "The Road Back", tagline: "The same valley looks different when someone else leads." }
};

export const OBJECTIVE_TITLES: Record<string, string> = {
  clinic: "Fly to the gatehouse on the far road",
  board: "Land and hold steady while your passenger climbs aboard",
  departure: "Follow the road past the standing arches",
  "canyon-gate": "Hover at the village gate to leave",
  descent: "Follow the dry channel downhill",
  watergate: "Hold under the stuck sluice and lift it free",
  searchlights: "Stay low beneath the sweeping lamps",
  "first-portal": "Fly through the bright doorway",
  "root-song": "Trace the glow between the roots",
  "root-anchor": "Hover beside the sleeping root until it stirs",
  "midnight-rest": "Park by the moon pool and rest a while",
  "root-bridge": "Cross each time the root bridge opens",
  "forest-exit": "Climb to the high canopy walkway",
  "tidal-channel": "Ride the calm channel between the reefs",
  "wake-vane": "Skim the water fast enough to turn the vane",
  "tow-shell": "Latch on, then drag the shell to its cradle",
  young: "Hover over each spring to wake it",
  "nursery-return": "Return to your passenger in the garden",
  "sky-gate": "Follow the current up into the sky",
  updraft: "Spiral up the rising air",
  pollen: "Carry the glowing pollen between the sails",
  "moon-bridge": "Glide across the bridge while it is lit",
  "crown-door": "Cross the last cloud bank",
  "elder-path": "Follow your passenger toward the great one",
  relay: "Hold still and send the beacon signal",
  worker: "Lift the trapped platform clear",
  tether: "Hover until the cable lets go",
  "release-elder": "Fly the old path into the giant's shadow",
  "home-crossing": "Carry the living current home",
  "new-channel": "Return through the harbour channels",
  "village-sluice": "Hover at the sluice to bring the lights back",
  "last-bridge": "Lift the bridge so the road can open",
  migration: "Fly the migration route past the gatehouse",
  ending: "Let the road belong to someone else"
};

export const SCENE_COPY: Record<string, readonly string[]> = {
  "last-light": ["The signal lamp on the far road is still lit.", "Somebody out there is waiting for you to answer it."],
  boarding: ["The cradle settles. Your passenger is aboard.", "The road out of the village is open."],
  departure: ["The gate swings wide.", "Past the last lamp the valley opens up, and the way ahead is yours to choose."],
  miners: ["The sluice groans and gives way.", "Water rushes down the channel, and the way below is clear."],
  threshold: ["A ring of light hangs over the broken waterway.", "Through it, the air smells of rain and leaves."],
  "root-song": ["The root hums once and unclenches.", "Lights ripple outward along the branches."],
  midnight: ["The pool is still. Nothing chases you here.", "For one quiet hour, the flight can wait."],
  dawn: ["Grey light slides over the canopy.", "Somewhere above, the woods let go of the night."],
  "first-steps": ["The shell rocks, then settles into place.", "Small lights wake inside it, one after another."],
  sky: ["The garden is warm and bright again.", "A current lifts from the water and points at the clouds."],
  "nursery-flight": ["The current carries you upward.", "The reef shrinks to a smear of light below."],
  moonrise: ["The moon clears the orchard wall.", "The pollen glows as if it remembered where it was going."],
  promise: ["The bridge hums as you cross it.", "Some promises are easier to keep at altitude."],
  sanctuary: ["The last cloud thins out.", "Beyond it, a quiet place with a light in every window."],
  betrayal: ["The beacon goes out into the dark.", "Not everyone who listens means well."],
  workers: ["The platform rises on a plume of dust.", "Hands wave from the edge, small against the sky."],
  apology: ["The cable parts with a ringing note.", "There is a long silence, and then the wind comes back."],
  resolve: ["The big one turns its head slowly.", "The little ones settle under its shadow."],
  homecoming: ["The valley comes into view, lit from within.", "It looks smaller than you remember, and more precious."],
  lights: ["One by one the village lamps come back on.", "The water wheel starts to turn."],
  gate: ["The bridge swings up and out of the way.", "The road beyond is wide and empty."],
  farewell: ["The herd drifts past the old gatehouse.", "Nobody speaks. The lamps flicker in agreement."]
};

export const ENDING_COPY = ["The road is quiet now.", "Somebody else is leading, and the lamps stay lit behind them."];
