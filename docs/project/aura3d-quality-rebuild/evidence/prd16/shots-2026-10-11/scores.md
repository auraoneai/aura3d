# Before/after game shots, 2026-10-11 (NVIDIA L4, ANGLE Vulkan)

Scores are claude-opus-5.5 vision judgments through Kiro Prism, using the autopsy scale (00-AURA3D-AUTOPSY.md, 18-game scorecard, Overall column): 0-10 against a competent modern three.js-class game. A set with no frame scores n/a. A frame where nothing drew (HUD-only, blank, black or error page) scores near 0. Every frame is 1280x720 desktop, captured by `capture-games.mjs` from that ref, built from source, on self-hosted L4 runners with `--headless=new --use-angle=vulkan --enable-features=Vulkan --ignore-gpu-blocklist`. Each probe reported `ANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA NVIDIA L4 (0x000027B8)), NVIDIA)`.

## Column flag sets (what each capture actually ran, from report.json URLs)

- A0: afb475c2, flags off. games.json qrFlags were stripped in the job, so no `a3d-qr` param was sent.
- A: afb475c2, games.json per-game flag only (`a3d-qr=A3D_QR_ROUTE_<GAME>`). This is not flags-off.
- B0: main 322d78b1, flags off (games.json qrFlags stripped, no `a3d-qr` param).
- B: main 322d78b1, games.json flags `route-<game>,game,camera,lighting,post,materials,vfx,world,tiers,looks` (`--flags none` does not remove them, #626). This is not flags-off.
- C: main 322d78b1, the games.json flags above plus `all`.

## Scores

| game | A0 off | A score | B0 off | B score | C score | Δ (C−A) | note |
|---|---|---|---|---|---|---|---|
| aura-clash-showcase | n/a | 0 | n/a | 3.5 | 0 | +0.0 | B (route+9 lanes) now renders a rooftop scene with a T-posed character where A was blank white, but all five shots are identical; B0 still captures nothing; C crashes (MaterialBindingError: missing a_uv/a_tangent). |
| showcase-aurora-lander | n/a | 2.5 | n/a | 2.5 | 0 | -2.5 | B's camera moved closer and oblique, with dark terrain occluding the ring and losing A's landers; C crashes (MaterialBindingError: missing a_uv); flags-off still captures nothing; shots remain static in every column. Net worse. |
| showcase-bank-shot | n/a | 3.5 | n/a | 3 | 3 | -0.5 | Worse: flags-off still captures nothing; after-builds drop A's white letterbox and frame tighter, but every ball is gone, all shots look identical with no play, and C lost 04-action. |
| showcase-blockfall-reactor | n/a | 4 | n/a | 3.5 | 0 | -4.0 | Worse: A0/B0 both capture nothing; A shows pieces stacking, B renders the arcade but an empty board in every shot; C goes black, then MaterialBindingError (missing a_uv/a_tangent). |
| showcase-courier-rush | 4 | 3 | n/a | 3.5 | 0 | -3.0 | Worse overall: B0 captures nothing, B adds a textured van but loses frames 03–04, and C crashes everywhere with MaterialBindingError (missing a_uv/a_tangent); before had gameplay HUD (A0) and four route frames (A). |
| showcase-deep-recovery | n/a | 0.5 | n/a | 0.5 | 1 | +0.5 | Nothing visibly improved: B matches A exactly (same static 0.0 m READY HUD, no contacts, every shot); A0/B0 capture nothing; C got worse, capturing only the title frame. |
| showcase-gallery-shift | n/a | 3 | n/a | 2.5 | 0 | -3.0 | With flags off, neither version captured frames. B adds cyan floor panels, red bars and a foreground walkway but looks frozen across all shots. C crashes with MaterialBindingError (missing a_uv), so it got worse. |
| showcase-gravity-post | 1 | 0.5 | 1 | 0.5 | 0 | -0.5 | Nothing improved: B0/B match A0/A (title only, later shots uncaptured); C is worse, with a black title and MaterialBindingError overlays (missing shader attributes a_uv, a_tangent) on every later shot. |
| showcase-mech-hangar | 1 | 2 | 0.5 | 2 | 1.5 | -0.5 | Worse: B loses the mech visible in A's 02-opening, leaving the hangar empty; C adds a white quad artifact top-left and drops 04/05 frames; title and flags-off shots are unchanged. |
| showcase-neon-swarm | 1 | 2 | 1 | 2 | 0 | -2.0 | Essentially unchanged: B0 matches A0, B matches A (same hull close-up, gold arc added, green burst blobs gone); C is worse, crashing every gameplay shot with MaterialBindingError missing a_uv/a_tangent. |
| showcase-orbital-defense | 1.5 | 2 | 1.5 | 2 | 1.5 | -0.5 | B0 matches A0 exactly; B loses A's orange enemies and debris, and its ship sits frozen below the planet in every shot; C drops starfield and orbit rings and misses the shield frame. Worse. |
| showcase-patrol-wing | n/a | 2.5 | n/a | 3 | 0 | -2.5 | Essentially nothing: A0/B0 both capture no frames, B matches A apart from slightly brighter ring markers, and C is worse, with a black title and MaterialBindingError (missing a_uv/a_tangent) on every gameplay shot. |
| showcase-pulse-tunnel | 3.5 | 3 | 4 | 3 | 0 | -3.0 | B0 matches A0 on title but lost the 03-mid frame. B adds a pink ring burst and white particle spray that obscures the car. C crashes every shot with a MaterialBindingError: missing a_uv. |
| showcase-rooftop-buckets | n/a | 2.5 | n/a | 2.5 | 0 | -2.5 | B swaps A's T-posed human for a small skinned figure holding an orange ball but loses 04-action; C is worse: black title, then MaterialBindingError screens (missing a_joints/a_weights); flags-off still captures nothing. |
| showcase-siege-golf | n/a | 3.5 | n/a | 3 | 0 | -3.5 | No visible improvement: B matches A nearly identically, A0/B0 still capture nothing, and C is worse, showing a black title then MaterialBindingError (missing a_uv/a_tangent shader attributes) on every shot. |
| showcase-skyline-runner | 0.5 | 2.5 | 0.5 | 1.5 | 0 | -2.5 | Flags-off unchanged; B swaps blue night for an orange sunset palette but loses the player and stays static across shots; C crashes with MaterialBindingError (missing a_uv), so overall it got worse. |
| showcase-turbo-drift-circuit | n/a | 2 | n/a | 2 | 1.5 | -0.5 | Little changed: flags-off still captures nothing; B drops the white bottom bar and adds vignette but shows the same static field; C adds a dark red box yet loses the 04-action frame. |
| showcase-vault-breakers | n/a | 0 | n/a | 0 | 0.5 | +0.5 | Nothing improved: flags-off still captures no frames (A0/B0), B matches A's empty gray panel plus sidebar, and C is worse, rendering an all-black canvas with no game content. |

## Means

- A0: 1.8 over 7 scored games
- A: 2.2 over 18 scored games
- B0: 1.4 over 6 scored games
- B: 2.2 over 18 scored games
- C: 0.5 over 18 scored games
- Mean Δ (C−A) over 18 games: -1.67
- Mean Δ (B−A) over 18 games: +0.08
- Autopsy 2026-10-05 reference: overall mean 3.0 (production, macos-14 Metal; not directly comparable).

## Frames that drew (vision judge: 3D scene visibly rendered)

- A0: 9 of 13 captured frames drew; 7 of 18 games produced at least one frame
- A: 61 of 79 captured frames drew; 18 of 18 games produced at least one frame
- B0: 6 of 10 captured frames drew; 6 of 18 games produced at least one frame
- B: 63 of 76 captured frames drew; 18 of 18 games produced at least one frame
- C: 14 of 75 captured frames drew; 18 of 18 games produced at least one frame

## Per-set judge summaries

- aura-clash-showcase
  - A0 (n/a): no frames captured
  - A (0): All five frames are blank white, so this was a failed capture (likely a page load, WebGL context, or capture-timing failure) and nothing can be judged visually; recapture before scoring.
  - B0 (n/a): no frames captured
  - B (3.5): The 3D scene draws with decent PBR assets (window-detailed brick building, metallic knight, reflective floor), but all five frames are identical, with an unanimated T-posed character floating shadowless in a black, sky-less void, awkward composition and no VFX or UI, so it reads as a frozen asset-test greybox rather than a functioning game.
  - C (0): All five frames show the same Aura3D MaterialBindingError page (geometry missing a_uv/a_tangent attributes required by the material), so nothing rendered and there is no visual quality to score.
- showcase-aurora-lander
  - A0 (n/a): no frames captured
  - A (2.5): All four frames are the same static greybox-like top-down view of primitive geometry on murky terrain, with flat materials, no sky, minimal lighting, a canvas that does not fill the viewport, and no visible gameplay progression.
  - B0 (n/a): no frames captured
  - B (2.5): The 3D scene draws, but every frame is the same greybox-level view: untextured terrain, flat emissive rings, primitive pillars, no shadows, sky or post-processing, and an unfilled dark strip on the right, so it reads as a frozen prototype rather than a modern three.js showcase.
  - C (0): All four frames show the same Aura3D MaterialBindingError (missing shader attribute a_uv, likely a mesh without UVs bound to a textured/generated material), so no 3D scene ever rendered and there is nothing to judge visually.
- showcase-bank-shot
  - A0 (n/a): no frames captured
  - A (3.5): A readable but prototype-grade pool table under a single blown-out spotlight in a black void, with pastel unshaded balls, plastic-looking rails, no cue or HUD, three identical frames and a canvas sizing bug that leaves a white band at the bottom.
  - B0 (n/a): no frames captured
  - B (3): A greybox-level pool table of flat box rails, an untextured pale-blue felt, and a blown-out warm floor spotlight in a black void renders, but all five frames are identical with no balls, cue, or gameplay, landing at prototype-tech-demo quality.
  - C (3): A greybox-grade pool table built from untextured box primitives: flat unlit-looking baize, plastic orange rails, a single warm spotlight that blows out the floor, no contact shadows and a pure-black void, with all four frames identical and no balls or cue rendered, which points to a stalled or empty game state.
- showcase-blockfall-reactor
  - A0 (n/a): no frames captured
  - A (4): All frames render a coherent neon arcade reactor with nicely glossy block materials, but primitive-box props, flat lighting, weak shadows, a mismatched photo-studio HDRI backdrop, empty floor composition and zero VFX keep it at a dated-indie/prototype level.
  - B0 (n/a): no frames captured
  - B (3.5): The 3D scene draws a moody neon arcade stage with one decent textured cabinet, but it is mostly flat near-black unshaded boxes with emissive strips, no meaningful shadows or atmosphere, an incongruous studio HDRI leaking through, and an empty, unchanging well across all four frames, which reads as a static greybox-plus-neon prototype.
  - C (0): Nothing rendered: the title frame is black and every later frame is an Aura3D MaterialBindingError page, because a material requires a_uv and a_tangent attributes that the geometry does not supply, so no visual quality can be judged.
- showcase-courier-rush
  - A0 (4): A functional neon-cyberpunk courier game with a clean HUD and a few decent props, held back by greybox-style emissive box geometry, blown-out bloom, missing shadows and atmosphere, and an occluding camera, which places it below dated-indie quality.
  - A (3): The scene draws in every frame, but the capture looks frozen across all four shots, and the visuals sit at prototype greybox level: flat-shaded box buildings, mismatched textured props, no shadows or post effects, and a noisy background.
  - B0 (n/a): no frames captured
  - B (3.5): A few decent scanned vehicle and barrier assets sit in a greybox city of flat pastel boxes with no shadows, little material work and minimal post, landing at prototype-plus level, and the two captured frames are identical.
  - C (0): All four frames show the same Aura3D MaterialBindingError page, where geometry is missing the a_uv and a_tangent attributes the generated material expects, so nothing in the 3D scene ever rendered and there is no visual quality to assess.
- showcase-deep-recovery
  - A0 (n/a): no frames captured
  - A (0.5): All five frames are the same HUD overlay on a solid near-black clear colour with frozen state, so the 3D scene never drew and only the clean HUD styling can be credited.
  - B0 (n/a): no frames captured
  - B (0.5): All five frames are the same HUD overlay on a solid near-black clear colour with no 3D scene drawn and a frozen game state, so this capture is a no-draw failure despite a clean, legible HUD.
  - C (1): The frame is HUD-only over a solid dark clear colour with no visible 3D scene, so it scores as a no-draw despite a clean, readable UI.
- showcase-gallery-shift
  - A0 (n/a): no frames captured
  - A (3): The 3D scene draws in every frame, but it is a flatly lit, untextured sci-fi greybox in a cramped letterboxed viewport with clipping slabs, streak artifacts and no meaningful shadows, atmosphere or VFX, which puts it at prototype level.
  - B0 (n/a): no frames captured
  - B (2.5): The 3D scene renders, but it is a static, prototype-grade greybox: untextured boxes, flat unshadowed lighting, a blown-out centre object, a foreground slab blocking the camera, an empty side panel, and four identical frames showing no progression.
  - C (0): All four frames show the same Aura3D MaterialBindingError (a mesh lacks the a_uv attribute its generated material requires), so the scene never rendered and there is nothing visual to grade.
- showcase-gravity-post
  - A0 (1): HUD-only frame over a gradient clear colour with no 3D content rendered, so it counts as a no-draw capture and scores below placeholder-primitive level.
  - A (0.5): The title frame is effectively blank, just a dark radial gradient with a bordered frame and no 3D content, so it counts as a no-draw and nothing can be judged.
  - B0 (1): The frame is effectively a solid gradient clear colour with only a polished HTML HUD overlay, and none of the scene content the HUD describes is drawn.
  - B (0.5): The title frame is effectively blank, showing only a dark radial-gradient panel with no 3D content or title UI, so the scene did not draw and there is nothing to assess visually.
  - C (0): Nothing rendered in any frame: the title frame is solid black and every later frame is the same Aura3D MaterialBindingError (geometry missing a_uv and a_tangent attributes that the material's shader requires), so there is no visual quality to judge.
- showcase-mech-hangar
  - A0 (1): The 3D scene failed to render, leaving an empty dark clear-colour viewport beside a competent but overflowing UI panel, so there is no visual quality to credit.
  - A (2): A blank title frame, one frame with a clashing duplicate mech, and four identical empty greybox hangar frames with emissive strips, no shadows/IBL/atmosphere and a dead right-side panel add up to a sub-prototype result.
  - B0 (0.5): The 3D scene failed to draw (the viewport is an empty dark clear colour) and only the tidy but text-heavy UI panel is present, so there is effectively no visual quality to assess.
  - B (2): The title frame is blank, and every other frame is the same frozen, underlit greybox of emissive-trimmed boxes with no mech, materials, shadows, VFX or HUD, so it reads as a stalled placeholder prototype well below modern three.js standards.
  - C (1.5): The title frame is blank black and the other three frames are an identical, frozen, near-unlit greybox of a few boxes with emissive cyan trim against an exposed grey clear colour, with no mech, materials, shadows, sky or post, which is placeholder-tier and well below modern three.js standards.
- showcase-neon-swarm
  - A0 (1): The 3D scene did not draw; only a clean but minimal neon-styled HTML HUD sits over a solid dark clear colour, so there is nothing to evaluate for environment, materials, lighting or post.
  - A (2): The title frame is blank, and every gameplay frame is a static, mis-placed camera staring at the dim underside of a single textured mesh against a flat clear colour, with only a few unlit low-poly gems hinting at a game. The texture and specular detail on the mesh are decent, but composition, lighting, atmosphere, VFX and readability are effectively broken.
  - B0 (1): The title frame shows only a styled HUD over an empty near-black clear colour with no visible 3D scene, so it is flagged as a no-draw and scored below placeholder-primitive level.
  - B (2): The title frame is blank, and the remaining four frames are identical extreme close-ups of a dark, glossy scanned mesh with a stuck or misplaced camera, showing none of the neon swarm gameplay, lighting, or VFX, so the capture reads as broken despite passable surface material detail.
  - C (0): Nothing rendered in any frame: the title is solid black and the other four frames show the same Aura3D MaterialBindingError, where a material requires a_uv and a_tangent but the geometry doesn't provide them, so there is no visual quality to score.
- showcase-orbital-defense
  - A0 (1.5): The 3D scene renders in every frame, but it is placeholder-grade flat-lit primitives on a black clear colour with no sky, materials, shadows, post or VFX, and all five frames are identical, which points to a frozen or non-progressing game state.
  - A (2): All five frames render a real 3D scene, but it is placeholder-grade: a visibly faceted low-poly planet, untextured black cuboid enemies, flat-shaded dots and line orbits on a plain dark clear colour with no skybox/IBL, shadows, bloom, particles, atmosphere or visible shield/action VFX, placing it near greybox-prototype level.
  - B0 (1.5): All five frames are the same static greybox of unlit-looking primitives (sphere, ring, boxes) on a flat near-black background, with no sky, HUD, VFX, lighting depth or gameplay progression, which puts it at the placeholder-primitives tier.
  - B (2): The scene renders, but all five frames are identical: a faceted low-poly planet with a fresnel rim, sparse stars, line orbits and a placeholder turret on a black clear colour, with no gameplay, VFX, shield effect, shadows, IBL or atmosphere. That is prototype greybox territory, and the capture never shows the game advancing.
  - C (1.5): Every frame shows the same placeholder low-poly sphere with basic Phong-style lighting on a black void, with no environment, materials, atmosphere, VFX or visible game progression, which puts it at placeholder-primitive level.
- showcase-patrol-wing
  - A0 (n/a): no frames captured
  - A (2.5): Title frame failed to draw, and the remaining four show an identical, static, flat-shaded low-poly greybox planetoid on a plain dark clear colour with no sky, shadows, post or VFX, an empty HUD panel and a missing player plane, so it sits at prototype level.
  - B0 (n/a): no frames captured
  - B (3): The title frame failed to render and the remaining four frames are an identical frozen shot of a flat-lit, shadowless low-poly island with a decent plane model but placeholder-grade sky, lighting and post, which puts it at early prototype level.
  - C (0): The 3D scene never drew: frame 1 is a black canvas with an empty UI panel, and frames 2-5 show an Aura3D MaterialBindingError because a material needs a_uv/a_tangent attributes the geometry doesn't supply, so there is nothing to judge visually.
- showcase-pulse-tunnel
  - A0 (3.5): Both frames draw a cohesive synthwave neon tunnel, but it is built from unlit box primitives and flat translucent planes with minimal lighting, materials, post or atmosphere, so it reads as a stylish prototype above greybox but well short of dated-indie polish.
  - A (3): A neon-synthwave tunnel with a reasonably modelled hover-ship, but the environment is a small greybox of emissive bars and translucent planes adrift in black void, with minimal post, no atmosphere or VFX, and three of four frames essentially identical, landing at prototype tier.
  - B0 (4): Coherent neon-tunnel art direction with a decent hero car, but the environment is built from flat emissive primitives with minimal lighting, post or atmosphere, and a heavy HUD obscures the frame, landing it at dated indie/prototype level.
  - B (3): All frames render a coherent neon-synthwave palette, but the scene is greybox-level primitives with unlit black geometry, placeholder grey disc particles and minimal post, placing it at prototype tier around 3.
  - C (0): All four frames show the same Aura3D renderer error page (material binding failed on a geometry missing the a_uv attribute in the tunnel-audio bundle), so nothing rendered and there is no visual quality to assess.
- showcase-rooftop-buckets
  - A0 (n/a): no frames captured
  - A (2.5): The scene renders in every frame, but it is a greybox-grade rooftop of flat pastel boxes with no shadows. A T-posed chrome-shirted character occludes the view, a duplicate head appears behind him, and the gameplay state is frozen across four of the five frames, which puts it at early-prototype quality.
  - B0 (n/a): no frames captured
  - B (2.5): The scene renders, but it is a prototype-grade greybox of untextured boxes, a T-posed figure and low-poly spheres under flat lighting with heavy bloom, and all four frames are identical, which suggests frozen gameplay or capture.
  - C (0): The 3D scene never rendered in any frame: frame 1 shows only the HUD over black, and frames 2-5 show an Aura3D MaterialBindingError because the geometry lacks the a_uv/a_tangent/a_joints/a_weights attributes the generated material shader requires, so there is nothing to score visually.
- showcase-siege-golf
  - A0 (n/a): no frames captured
  - A (3.5): A clean but flat low-poly kit scene: flat clear-colour sky, an unlit dark ground slab, minimal shadowing, no IBL, post or VFX, a frozen camera, and near-identical frames with no readable gameplay feedback, placing it at prototype-plus level.
  - B0 (n/a): no frames captured
  - B (3): A coherent but flat low-poly castle mini-golf diorama renders in every frame, but the image is static and identical across all five (likely frozen or not receiving input), with no shadows, IBL, atmosphere, post or VFX, a clear-colour sky, and a void ground plane, which puts it at prototype level.
  - C (0): No frame drew any 3D content: the title is black with an empty HUD element, and every gameplay frame is a renderer error page caused by a mesh missing the UV and tangent attributes that its material requires, so there is nothing to judge visually.
- showcase-skyline-runner
  - A0 (0.5): The frame shows only a polished HUD over a solid clear colour, with no 3D scene drawn, so it is a no-draw capture that scores near zero on the scale.
  - A (2.5): The 3D scene draws in all frames, but it is a dark, flatly lit greybox of untextured boxes and icosahedra with no sky, shadows, or VFX, a debug-looking marker, and a locked camera that loses the player; only the well-illustrated but stylistically mismatched character sprite lifts it above placeholder level.
  - B0 (0.5): HUD-only no-draw frame: the UI chrome is clean and readable, but the 3D scene is entirely absent, leaving a solid clear colour behind the overlays.
  - B (1.5): The 3D scene drew, but all four frames are identical captures of placeholder-grade flat-coloured primitives with no shadows, no meaningful lighting or IBL, broken streaky backdrop bands and no visible progression, which puts it at placeholder level on the scale.
  - C (0): Every frame is the same Aura3D MaterialBindingError page: a material requires the a_uv attribute but the geometry lacks UVs, thrown in BE.bindGenerated from Ve.drawItem. Rendering never ran, so there is nothing to judge visually and the score is 0.
- showcase-turbo-drift-circuit
  - A0 (n/a): no frames captured
  - A (2): The scene renders, but all four frames are an identical, frozen, ground-clipped view of flat-coloured placeholder primitives under a solid clear-colour sky, with no visible car, shadows, materials, atmosphere or HUD, placing it at prototype-greybox level.
  - B0 (n/a): no frames captured
  - B (2): The scene renders, but all four frames are an identical, frozen, badly framed ground-level view of flat-shaded primitive props on a featureless grass plane under a flat sky, so it reads as an early greybox prototype with no visible car, gameplay or lighting quality.
  - C (1.5): All three frames are the same static, badly framed shot of untextured primitive boxes on a flat green plane under a clear grey sky, so the scene renders but reads as placeholder greybox with an apparently frozen camera and no visible gameplay.
- showcase-vault-breakers
  - A0 (n/a): no frames captured
  - A (0): All four frames are the same empty page shell (a rounded grey canvas showing only its clear colour beside a blank dark panel), so the 3D scene never rendered and there is nothing to judge visually.
  - B0 (n/a): no frames captured
  - B (0): All four frames are the same empty page layout with a solid grey canvas and a blank side panel, so the 3D scene never rendered and there is nothing to grade visually.
  - C (0.5): All four frames show only a black canvas beside an empty page-layout panel, so 'showcase-vault-breakers' never drew a 3D scene and there is nothing to judge visually beyond the failed render.

## Runs, runners, commits

The workflow is `.github/workflows/lead-game-shots.yml` on branch `qr/lead-shots`, push-triggered. Each job runs `nvidia-smi` and fails unless the GPU is an L4. Driver: 580.178.04. Checked-out SHAs are confirmed by the "HEAD is now at" lines in the job logs.

| set | GitHub run | artifacts | runners | checked-out SHA |
|---|---|---|---|---|
| A0 | 38125356767 | lead-shots-A0-before-off-s1..s3 | gcp-gpu-1, gcp-gpu-3, gcp-gpu-4 | afb475c2f093b4d5f2501a218203729c1c8bb117 |
| A | 38120166366 | lead-shots-A-before | gcp-gpu-2 | afb475c2f093b4d5f2501a218203729c1c8bb117 |
| B0 | 38125356767 | lead-shots-B0-after-off-s1..s3 | gcp-gpu-2, gcp-gpu-3, gcp-gpu-9 | 322d78b1391f1c8293cc8e714c7d8a6ba7541343 |
| B | 38133789756 | lead-shots-B-after-lane-s1..s3 | gcp-gpu-2, gcp-gpu-3, gcp-gpu-4 | 322d78b1391f1c8293cc8e714c7d8a6ba7541343 |
| C | 38125356767 | lead-shots-C-after-all-s1..s3 | gcp-gpu-1, gcp-gpu-2, gcp-gpu-3 | 322d78b1391f1c8293cc8e714c7d8a6ba7541343 |

Failed or discarded runs:
- 38117372060: cancelled by gchahal1982 at 07:00Z, with no artifacts.
- 38120166366 B-after and C-after-all: "The self-hosted runner lost communication with the server", with no artifacts.
- 38121736694: cancelled by me before it started; it was superseded by the sharded run.

## Caveats (read before using the numbers)

- **Frozen frames.** Most captures time out before the game reaches its ready state (`timeout` / `no-draw-timeout`). Many shots within one set are pixel-identical, so the timeline input often never advances the game. Scores therefore mostly judge a static opening view, not gameplay.
- **Low fps on L4.** report.json shows 0.3 to 8 fps for most games in sets A and B, and 30 to 60 fps for a few. Canvas appearance takes about 60 s on these 4-vCPU hosts. Treat motion, VFX and readiness scores as unreliable.
- **Flags off hangs.** In A0 and B0, most games never produced even the title frame: `page.screenshot` timed out, or the 420 s run watchdog closed the page. Only 7 games (A0) and 6 games (B0) produced any frame, so their means cover different game subsets and cannot be compared with A, B or C.
- **C with `all` breaks rendering.** In most C frames the judge read an on-page Aura3D `MaterialBindingError`: geometry is missing `a_uv`/`a_tangent` (Rooftop Buckets: `a_joints`/`a_weights`). C pageErrors also include `texture data for rgba32f textures must contain exactly 8388608 bytes` (15 games) and `TypeError: Cannot read properties of undefined (reading 'el')` (all 18). C's low scores reflect these failures, not art direction.
- **Like-for-like comparison.** A vs B uses each version's games.json per-game flags and is the closest match. It shows no meaningful visual change: mean Δ (B−A) is +0.08.
- **Not comparable to the autopsy.** The autopsy's mean of 3.0 came from production URLs on macos-14 Metal, judged on 3 desktop shots plus 1 mobile shot. Do not compare it with these numbers directly.
