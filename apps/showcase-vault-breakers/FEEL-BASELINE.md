# Vault Breakers — "what feels cheap" baseline note

VB-01 (P0), written before any route code, per the governing-docs pass
(`llms.txt`, `AGENTS.md` tree, `docs/agents/claims-and-boundaries.md`,
`docs/agents/game-example-standards.md`, `docs/api/game-runtime.md`). Internal
player-experience target, not a public claim. Label stays `prototype`.

What would make this game feel cheap if we got it wrong:

1. **Mushy flippers** — the #1 pinball tell. A flipper that eases up instead of
   snapping reads as broken. Motor torque/speed must reach the up limit in well
   under 150 ms and a stationary held flipper must be an immovable wall to the
   ball. If the motorised hinge cannot hold that bar headlessly, we ship the
   documented kinematic fallback instead of pretending.
2. **Gravity-less table** — a ball that wanders instead of flowing downhill.
   The authored playfield slope (gravity with a +drain component) must pull a
   resting ball toward the flippers visibly but slowly enough to save it.
3. **Scoreboard theater** — a DOM score that the 3D table does not show. The
   extruded-text scoreboard on the back panel must display the live score in
   scene pixels (score-reel digit nodes), with the DOM panel as a mirror only.
4. **Sensor spam** — bumpers/slings/targets that re-trigger every overlap frame
   or fire on a resting ball. Once-per-entry arming, kick impulses only above a
   contact-speed floor, cooldowns per sensor.
5. **Fake kickers** — bumpers that just have high restitution feel dead. Real
   pop bumpers *add* energy: apply an authored impulse along the contact normal
   on entry, visible in the ball's exit speed.
6. **Rubber drain** — a drain that swallows the ball without ceremony, or
   multiball where draining one ball ends everything. Ball-end only when every
   live ball has drained; the HUD/evidence report the live-ball count.
7. **Tilt roulette** — nudge that either does nothing or insta-tilts. Nudge
   applies a small real impulse, strikes accumulate per ball, lockout at three,
   and the meter is visible before it happens.
8. **Silent table** — a flipper with no snap, a bumper with no pop, is a
   slideshow. Every mechanical event maps to a synthesized cue with per-cue
   cooldowns so clusters do not machine-gun.
9. **Primitive soup** — walls as raw unlit boxes under one ambient light.
   Vault-interior mood needs a warm gold key, cool teal rim, shallow fog, and
   restrained bloom fed only by bumper/target/vault emissives.
10. **Mission fog** — progression the player cannot see. The active mission is
    always on the 3D scoreboard and the HUD, and bank completion visibly
    changes the table (bank lamp goes from amber to teal).

Non-negotiables while fixing all of the above: no `three` imports, no raw
URLs/string ids, typed assets through the CLI, Rapier as sole physics owner,
authored slope/kick/nudge logic labeled authored, and the flipper mode
(`joint` | `fallback`) reported honestly in evidence and README.
