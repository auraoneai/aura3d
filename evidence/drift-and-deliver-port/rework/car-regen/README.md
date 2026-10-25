# Gridlock Courier: regenerated hero car (2026-10-25)

Software WebGL2 (SwiftShader) on the remote runner, not real-GPU evidence. Spec: `tests/browser/carregen-gridlock.spec.ts`
(QA hooks: reset, 90 steps forward = `drive`, then 40 steps of a boosted right drift = `drift`), runs `carregen-before`
(origin/game-rework before the change) and `carregen-after` (commit 4507f5f19). Both: 2 of 2 passed, 0 console errors.

| Frame | Before (old Meshy car) | After (new car) |
| --- | --- | --- |
| drive 1280x720 | `before-drive-1280x720.jpg` | `after-drive-1280x720.jpg` |
| drift 1280x720 | `before-drift-1280x720.jpg` | `after-drift-1280x720.jpg` |
| drive 390x844 | `before-drive-390x844.jpg` | `after-drive-390x844.jpg` |
| drift 390x844 | `before-drift-390x844.jpg` | `after-drift-390x844.jpg` |

- Before: the blue faceted body of thin overlapping plates; the road and interior read through it.
- After: an opaque teal compact hatchback, rear and taillights toward the camera, on a visible road at both sizes.

Asset: Meshy text-to-3D through Kiro Prism, text prompt only (no image input, no brand, emblem or text), preview
`01a17465-6271-70ff-aa9f-dd1f1e2f335d`, refine `01a17466-f3b3-764c-b450-379f42fda5c2`; prepped (simplify to 30,951
vertices, textures 1024), baked by `tools/gridlock-courier-bake/bake.mjs` (+z forward, lowest point y = 0, 1.9 units long).
Checks: 37,470 triangles, 0 open edges (watertight; 91 non-manifold edges where parts meet), 1.8 MB, `assets validate
--require-license` in an isolated project: 0 failures (orientation-metadata warning only). Drawn at 4.4 m to match the
player footprint (2 x 4.4 m); sim, collider and steering unchanged.

Credits: 60 of the 90 allowed (two previews and two refines). The first attempt (`rejected-attempt1-preview.png`,
preview 01a17461, refine 01a17463) was a tall microcar (height 0.72 of length) that would have blocked the chase camera's
view of the road; it was not used. The `drift` tag is now 500 credits (the per-call cap was passed as 560 for this job;
the helper's caps are per-call arguments, so no helper setting changed).

Not checked: real-GPU appearance; the faint grey blank plate on the rear and a small roof antenna come from the model.
