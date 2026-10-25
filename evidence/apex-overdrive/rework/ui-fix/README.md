# Apex Overdrive: mobile layout and traffic widths (2026-10-24)

Group C screenshot problems, fixed on `game-rework`. Frames are software WebGL2 (SwiftShader) from the remote runner, built from the commit that adds this folder; they are not real-GPU evidence.

| Problem seen | Cause | Fix | Before / after |
|---|---|---|---|
| 3D view fills only the top ~245 px at 390x844 | `#game` had no CSS size, so it kept the 1280x800 attribute aspect | `canvas#game` is now fixed, `100vw x 100vh` | `before-gameplay-early.390x844.jpg` / `after-...` |
| Quick-switcher wraps to four rows and floats mid-screen or covers the car on the card | bar sat at the bottom below 1100 px | single scrolling row at the top, start-aligned, border-box, safe-area aware | `before-title.390x844.jpg` / `after-...` |
| Two box trucks overlap in the ramp frame | the Meshy box truck is 1.72x wider than the sim width (the carrier 3.0x); fit-to-length made the truck about 4.1 m wide in a 3.6 m lane | lateral width-fit for those two models only (`MODEL_WIDTH_OVER_SPEC` in `main.ts`, Meshy models only) | `before-key-ramp.1280x720.jpg` / `after-...` |
| HUD pill said "AURA3D 4.0 · APEX OVERDRIVE" | stale version label | pill now reads "APEX OVERDRIVE" | `before-key-ramp.1280x720.jpg` / `after-...` |

Measured geometry (canvas CSS size, quick-switcher box) from `tests/browser/fixc-apex-geom.spec.ts`: before, canvas 1280x800 at every viewport and bar 229x158 at y=642 on 390x844; after, canvas equals the viewport and the bar is one 38 px row at y=8.

Not covered: the card (720x450) frame from this run caught the player right behind a truck, so it is not a good card image; retaking cards belongs to the screenshot lane. The carrier squash is by measured ratio, not by eye on a carrier close-up.
