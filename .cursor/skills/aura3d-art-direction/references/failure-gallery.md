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

## Hero lost in the set

Symptom: a dark hero on a dark set (an armoured courier on a night street, seen
from behind) reads as a hole; no edge separates body from background.
Fix: separate by value, not only hue: a rim or back light on the hero (the
look's `rim` slot, or a directional light behind and above), or a lighter
accent (trim, emissive piping, a pale cloak edge). Judge a back-view frame at
gameplay distance and as a 64 px thumbnail.

## HUD colour words the frame does not draw

Symptom: the copy says "amber gate" and the gate renders pale cream after the
grade, so players hunt for a colour that is not on screen.
Fix: judge the named colour in the graded real-GPU frame; saturate the
material and emissive until it reads as that colour, or change the words.

## Mirror sheen and dented paint on a generated model

Symptom: blotchy white sheen, melted or wavy reflections and dented-looking
panels on an AI image-to-3D car or glossy product.
Fix: the delivered PBR maps lie (one material, metalness median 0.77,
roughness 0.17, a JPEG normal map tilting 7 to 14 degrees on smooth panels).
Paint is dielectric (metalness about 0) with a clearcoat (`material.clearcoatPaint`);
give body, glass, chrome and tyres their own materials; keep normal maps
lossless PNG (never `assets slim --allow-glossy` a glossy model; `assets
inspect --pbr` flags the rest); lower `normalScale` on reconstructed meshes; judge the reflections on a real GPU under the look.

## Hand-made transparent matte

Symptom: a poster or cut-out built by rendering on a flat colour and keying it
out: fringed edges, lost soft shadows, shifted colours.
Fix: native alpha output, `output: { alphaMode: "premultiplied",
inputAlphaMode: "premultiplied" }` with no backdrop and a `material.shadow`
catcher; it keeps partial edge alpha, shadow coverage and the opaque frame's
colours.
