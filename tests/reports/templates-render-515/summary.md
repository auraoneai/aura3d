# Template render evidence (515)

REA capture_browser_scenario CLI (real Chrome, 960x540, 9 s settle), 21 templates built from workspace source (vite, loopback server).
Tree = this branch (origin/main + lane/515) with origin/lane/503-templates merged in a throwaway merge (not committed), because the 503 template fixes are not on origin/main yet.
Gate: `node tools/release/render-gate/index.mjs --templates --driver saved --saved-dir evidence/templates-render-515` (slim JSON: events only).

Result: 20/21 pass. FAIL: postprocess-scene, "no scene texture (9.5% textured blocks)" (threshold 10%; it passed on 503 with the published 5.0.2 engine, workspace engine differs). Not fixed here: the file is a 503 template and editing it would conflict with the 503 merge; thresholds untouched.

Changes in this lane: falling-blocks-starter (diagnostics overlay off, seeded stack, neon skyline), character-viewer (forest clearing from primitives; now passes honestly), animation-studio (studio architecture plus chequered floor on the empty-document demo stage; still logs "No scene loaded", so the 503 allow-list remains the safety net), procedural-scene (restored; look trim, chequered floor).
On bare origin/main (without 503 fixes) 14/21 pass; the failures are the 503-fixed templates plus animation-studio/procedural-scene before the floors.
Console errors per capture are benign 404 resource loads (favicon etc.) as in 503; not itemised.
