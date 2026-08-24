# Siege Golf — "what feels cheap" baseline note

SG-01 (P0), written before any route code, per the governing-docs pass
(`llms.txt`, `AGENTS.md` tree, `docs/agents/claims-and-boundaries.md`,
`docs/agents/world-class-four-games-prompt.md` Phase 0/7). This is an internal
player-experience target, not a public claim. Label stays `prototype`.

What would make this game feel cheap if we got it wrong:

1. **Ghost toppling** — structures that wobble before the ball arrives, or
   settle on their own during aim. The pre-shot world must be provably still
   (hash equality), or every hole reads as rigged.
2. **Floaty ball** — a golf ball that rolls like a balloon. Impulse scale,
   rolling friction, and stop threshold need tuning so a struck ball *thuds*
   along felt, not glides.
3. **Instant reset snap** — R that teleports pieces silently feels broken.
   Reset must visibly restore the exact authored stack (hash-proven) with an
   audio confirm.
4. **Sensor spam** — cup triggers re-firing every overlap frame would make
   scoring noisy and fake. Once-per-entry semantics, exit before re-arm.
5. **DOM-as-physics lies** — star banners are fine as DOM, but topple truth
   must be visible in rendered pixels; never fake a fallen pin in HUD only.
6. **Camera whiplash** — hard cuts between follow and overview read as bugs;
   blends must be smooth and disabled under reduced-motion.
7. **Silent hits** — a drive with no impact audio, or wood cracks on every
   micro-contact, both cheap. Cues map to contact speed bands.
8. **Power meter theater** — a meter whose value does not change the shot is
   decoration; charge must monotonically map to launch impulse.
9. **Primitive soup presentation** — crates/barrels/planks as flat unlit
   boxes under one ambient light. Night range mood needs key + rim + fog +
   restrained bloom on target lamps to read as authored.
10. **Star inflation** — stars that ignore strokes make par meaningless.
    Thresholds come from the score module only, unit-tested.

Non-negotiables while fixing all of the above: no `three` imports, no raw
URLs/string ids, typed assets through the CLI, Rapier as sole physics owner,
and no destruction/fracture simulation (engine does not implement it).
