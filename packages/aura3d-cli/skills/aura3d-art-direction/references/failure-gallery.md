# Failure gallery

The recurring failure patterns (research/21) and the fix that removes each.
Match the symptom on your PNG, apply the fix, re-capture. `visualQA` name-based
heuristics may be referenced here for diagnosis only — they are deprecated and
never acceptance evidence; use `structuralQA` names when a structural check is
needed.

## Void background

Symptom: the world ends in a flat colour; horizonless, airless.
Fix: add the look's environment (HDRI/biome) or `background`/`fog` from the
recipe row. Lint: `look/solid-void` (unless the look declares the exception).

## Flat shading

Symptom: every surface the same brightness; no key direction.
Fix: the look's environment supplies IBL; keep key intensity at the preset
value. Lint: `look/no-ibl`, `look/no-lights`.

## Ambient soup

Symptom: shadows grey and directionless; scene reads washed-out.
Fix: remove `lights.ambient` fill; the look's key + hemisphere/IBL supplies
fill. Lint: `look/ambient-kills-ibl`, `look/ambient-flattens`.

## Floating objects

Symptom: props hover; no contact darkening at feet/wheels.
Fix: key `shadow: true` at full strength plus a contact detail (ground, AO).
Lint: `look/weak-shadow`.

## Primitive soup

Symptom: hero subject is boxes/spheres/cylinders.
Fix: `model(assets.x)` from the typed catalog; `assets resolve "<genre> kit"`
when unsure. Lint: `look/primitive-subject`.

## Fake effect primitives

Symptom: emissive planes/cards named like "wet reflection", "puddle streak",
"rain splash" faking an effect the engine should produce.
Fix: use the look's effects/post preset; model the practical (lamp, sign)
instead. Lint: `look/fake-effect-names`.

## Debug HUD in-world

Symptom: health pips, timers or counters built from in-scene primitives, or a
debug overlay in the shipped frame.
Fix: move the HUD to DOM/CSS; strip the overlay. Lint: `look/debug-overlay`,
`hud-is-dom` rejection in the v2 prompt report.

## Renderer overrides

Symptom: `pixelRatio`, `qualityProfile`, `safe-basic` or FXAA overrides in app
code — usually added to "fix" a soft or banded frame.
Fix: `looks.appOptions(id)` and the post preset; fix the look, not the
renderer. Lint: `look/low-dpr`, `look/double-aa`.

## Capture-only lighting

Symptom: a `?capture=` branch that adds lights/effects only for screenshots.
Fix: the shipped path must look right under default flags; iterate the look,
not the branch. Lint: `look/capture-branch`.
