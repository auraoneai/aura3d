# Quality bar — the 12-category look rubric

Score every captured PNG per category 0-10 in 0.5 steps. Anchors are written as
what you observe, not what the code does. A score < 7 needs an `observations`
entry naming the concrete thing seen on screen.

## lighting

- 2: one flat light everywhere; faces and props read equally bright
- 5: a key direction exists but the fill flattens it; mood is generic daylight
- 7: clear key + fill + rim separation; the mood matches the look brief
- 9: light feels motivated by the world (sun, sign, lamp); bounce and colour temperature vary by area

## shadows

- 2: no visible shadow; objects float
- 5: a shadow exists but is grey/soft with no contact darkening
- 7: dark contact shadows ground every object, soft falloff
- 9: cascaded and stable; contact + ambient occlusion match the reference

## ibl_reflections

- 2: surfaces uniform, no environment response
- 5: metals look like plastic; reflections faint or absent
- 7: environment visible in glossy surfaces; roughness varies by material
- 9: reflections pick up the actual sky/studio setup and track correctly

## environment_world

- 2: solid void background
- 5: a sky/ground exist but read as a backdrop, not a place
- 7: horizon, ground and props compose a believable space
- 9: parallax layers (far, mid, near) plus weather or time-of-day cues

## atmospheric_effects

- 2: air is empty; no depth between near and far
- 5: a fog exists but mismatches the light (wrong colour or distance)
- 7: fog/haze ties to the horizon colour and lifts the far field
- 9: volumetric cues (shafts, mist, drizzle) read at a glance

## material_quality

- 2: one flat colour per object, everything the same
- 5: some materials differ but most read as untextured plastic
- 7: wood/metal/fabric/skin read distinctly; normal/roughness respond to light
- 9: materials carry wear, edge highlights and texture at read distance

## modeling_assets

- 2: hero subject is a box/sphere primitive
- 5: typed models but scale mismatches or obvious gaps
- 7: real models at real scale, fitted to the world
- 9: asset variety, dressing and silhouette richness like the reference

## composition

- 2: subject centred and tiny, or clipping the frame edge
- 5: subject visible but dead-centre symmetry with wasted space
- 7: clear focal hierarchy; rule-of-thirds or genre framing used
- 9: leading lines and depth layers direct the eye through the shot

## camera

- 2: default angle; horizon level but arbitrary
- 5: a deliberate angle exists but fov/height flattens the subject
- 7: rig matches the genre row; subject inside its framing band
- 9: camera reads as a choice (dolly, chase, orbit) and moves with intent

## postprocessing

- 2: raw output; clipped brights or crushed blacks
- 5: a grade exists but fights the palette (muddy or oversaturated)
- 7: tone/grade holds the palette; AO grounds the mid-tones
- 9: grade + bloom + AO are tuned as one image pipeline

## animation_quality

- 2: hero subject static or sliding
- 5: animation exists but feet slide or loops stutter
- 7: locomotion matches travel direction; idle vs action states read
- 9: secondary motion and timing give the subject weight

## ui_hud

- 2: debug overlay or dev counters in the shipped frame
- 5: HUD exists but overlaps the subject or sits off-layout
- 7: HUD in DOM, readable, out of the subject's way
- 9: HUD styled to the game's palette and responsive at mobile width

## Hard checks (lint codes that must be clean)

`aura3d look lint` plus `app.diagnostics().look.lint` must report no
`error`-severity finding for:

- `look/no-lights`, `look/no-ibl` — the scene lights and reflects nothing
- `look/ambient-kills-ibl`, `look/ambient-flattens` — ambient used as the only fill
- `look/solid-void` — void background without a declared exception
- `look/low-dpr`, `look/double-aa` — renderer overrides or doubled AA
- `look/fake-effect-names`, `look/capture-branch` — fake effect primitives or
  capture-only branches (except where the flagged lane allows capture branches)
- `look/primitive-subject`, `look/debug-overlay` — primitive hero or shipped debug HUD
- `look/multiple-looks`, `look/expansion-mismatch` — look conflicts
