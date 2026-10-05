# 21 — Vision judgment of shipped game screenshots (authoritative for visual categories)

Method: production screenshots (GitHub Actions run 37289688772, macos-14, ANGLE Metal) downsized to 1100px JPEG; 3 desktop shots (opening/mid/action) + 1 mobile shot per game sent to claude-opus-5.5 via Kiro Prism with an art-director + rendering-engineer rubric calibrated to modern browser 3D. Raw screenshots: `evidence/games/`.

# `aura-clash-showcase`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Aura Clash Showcase: Visual Audit

The game does not meet modern browser 3D standards. Overall score is 3/10. The renderer appears to be working; the poor result comes mostly from scene authoring, camera framing, and how the assets are treated. It reads as a web dashboard with a small, dim 3D box embedded in it, not as a fighting game.

---

## 1. Per-image description

**desktop 02-opening**
- The page is a dark navy web layout. A nav pill sits at the top, with two HUD cards ("MARA VOLT" / "ROOK ATLAS", health and burst bars, timer "94 HURT"). A row of keyboard-hint buttons runs along the bottom.
- The 3D viewport is a rounded rectangle covering about 45% of the page area. It shows a downloaded-looking brownstone street block, a dark arena floor plane with cyan and yellow line strips, and two lamp posts with flat teal and pink sign rectangles.
- The two fighters stand in the center, small, at roughly 30% of viewport height. Both use the same humanoid rig, with solid teal and solid orange tints. Floating cyan "AURA CLASH" text clips behind their heads, and tiny gold "crowd" figurines are scattered around the edges.
- Lighting is flat and murky. There are no character shadows, only foot-ring decals, no reflections, and no sky. The bottom quarter of the viewport is empty dark floor.

**desktop 03-mid**
- The camera has orbited to a more side-on angle. A dark "3 HIT" combo plate floats over the fighters' torsos and covers the action.
- The teal fighter is semi-transparent or smeared, probably a dash afterimage that reads as a rendering glitch. A cyan streak runs along the floor.
- A white radial hotspot sits on the empty foreground floor. It looks like a stray point light with no source.
- The facade fills the upper half. The fighters still occupy under a third of the frame height, and the HUD and UI take more screen area than the 3D scene.

**desktop 04-action**
- The orange fighter is in an airborne kick or launch pose and renders as a translucent orange smear. The teal fighter is hunched underneath.
- A "2 HIT" plate again covers the impact point. There are no hit sparks, flash, shake, or particles at contact, so the most important frame of a fighting game has almost no VFX.
- Environment, lighting, and empty foreground are unchanged from the earlier shots, and the floor stays dull with no reflections.

**mobile 03-mid**
- The layout stacks vertically: a wrapping nav, two HUD cards side by side, and the timer "83 HIT". All of this uses about 37% of the screen before the 3D view starts.
- The 3D view is a portrait crop dominated by the brick facade. The fighters are tiny, and the floor occupies a thin band.
- The bottom roughly 35% of the canvas is a blank black void, either an unfilled region or the camera missing the floor.
- The keyboard-hint buttons ("A / Left", "D / Right"…) are cut off at the bottom. There are no touch controls.

---

## 2. Category scores

| Category | Score | Justification |
|---|---|---|
| environment_world | 4 | The stock brownstone street kit is reasonably detailed but unrelated to the arena: a flat plane dropped in front of a facade. |
| modeling_assets | 4 | Character meshes and buildings are decent purchased or scanned assets. Lamp posts, signs, and arena borders are box primitives. |
| texture_quality | 4 | Building textures are acceptable. Character textures are erased by flat tint overrides, and the floor is untextured. |
| material_quality | 3 | Everything has the same matte response. Brick, glass, asphalt, cloth, and skin are indistinguishable in sheen. |
| pbr_credibility | 3 | No visible specular, no roughness variation, and windows show no reflections. It reads like Lambert shading. |
| lighting | 3 | Flat, low-contrast fill with no key, no rim to separate fighters from the busy background, and a sourceless floor hotspot. |
| shadows | 2 | No cast shadows from fighters; foot decals stand in for them. No contact shadowing under the facade. |
| ambient_lighting | 3 | Uniform grey ambient with no AO and no grounding. |
| ibl_reflections | 2 | No visible environment reflections on glass, floor, or characters (inferred: likely no envmap or a dim one). |
| tone_mapping | 3 | Murky mid-grey exposure. Blacks are lifted and highlights are weak, so nothing pops. |
| color_management | 4 | No obvious sRGB double-gamma errors, but the palette is desaturated mud apart from the UI-colored team tints. |
| anti_aliasing | 4 | Thin floor lines and railings show crawling and stair-stepping (partly inferred through JPEG). |
| postprocessing | 2 | No meaningful bloom on emissive signs or lines, no color grade, no DoF, no vignette. |
| vfx | 2 | Hit moments have no sparks, flashes, or trails beyond translucent smears. |
| particles | 2 | A handful of tiny specks, invisible at gameplay scale. |
| animation_quality | 4 | Poses look like competent mocap (stance, kick, launch), but the smear/ghosting obscures them (inferred). |
| character_presentation | 3 | Fighters are small and monochrome-tinted, which makes them look like placeholders. Silhouettes get lost against the facade. |
| camera | 3 | Wide, distant, high-ish framing. Orbiting the angle mid-fight hurts the 2D-plane readability that fighters depend on. |
| composition | 3 | Subjects sit in the middle third, the foreground is wasted, the background is busy, and combo labels block the action. |
| scale_depth_perception | 4 | Facade scale reads correctly, but the tiny crowd figurines break scale. No fog or value falloff for depth. |
| atmospheric_effects | 1 | No fog, haze, volumetrics, rain, or steam, despite a night street that calls for them. |
| gameplay_readability | 5 | Team colors make P1 and P2 identifiable. Combo plates occlude hits and the smears confuse state. |
| ui_hud | 6 | The HUD cards are clean and consistent, but they sit outside the game and look like a web dashboard. Debug-style nav ("Evidence", "Deploy check", "npm") ships in production. |
| typography | 6 | Bold condensed names and the tracked mono labels work. Small labels are low contrast. |
| polish_juice | 3 | No hitstop, shake, flash, or impact audio-visual feedback is visible. Floating text clips into characters. |
| mobile_presentation | 2 | Portrait stack with tiny fighters, a black void in a third of the canvas, keyboard hints instead of touch controls, and cropped buttons. |
| **overall_visual_quality** | **3** | An early-2010s tech-demo feel wrapped in a polished web shell. |

---

## 3. What looks poor and why

- **Tinted characters.** A flat color override on the fighters destroys texture, normal, and roughness detail. They read as clay mannequins. This is the single biggest "programmer art" signal.
- **The 3D scene is not the hero.** The UI chrome takes more pixels than the game. The canvas is a boxed inset with rounded corners, which feels like an embedded preview.
- **Tiny subjects and wasted frame.** Fighters are 25–33% of viewport height, with the empty floor below and a busy facade behind.
- **Murky exposure and no lighting design.** Everything is a similar mid-value, so the fighters don't separate from the brick. There are no rim lights, no practicals on the lamp posts, and the emissive signs don't glow.
- **No grounding.** No cast or contact shadows, so the fighters float. Foot rings are a band-aid.
- **No reflections.** A night street floor is the classic place for wet-asphalt reflections, and here it's matte dark grey.
- **Missing impact VFX.** Hits produce translucent smears and an occluding text plate instead of sparks, flash, and hitstop.
- **Scene authoring errors:**
  - World-space "AURA CLASH" text clips behind heads.
  - The combo plate covers the impact point.
  - The stray floor hotspot has no source.
  - The micro-scale crowd figurines read as toys.
  - The primitive box sign panels are flat colored rectangles.
- **Debug or internal UI in production.** "Evidence", "Deploy check", "npm", "Tweaks", and "Aura3D evidence & scope" make it read as a dev harness.
- **Mobile.** A black void, keyboard controls on a touch device, and a portrait layout for a horizontal genre.

---

## 4. Dominant causes

| Cause | % | Notes |
|---|---|---|
| Game scene authoring | 35% | Tints, lighting rig, missing VFX, floating text, crowd, floor material. |
| Camera / composition / layout | 25% | Inset canvas, distant camera, orbiting angle, mobile void. |
| Engine defaults | 20% | Apparent lack of envmap, shadows, tone mapping, AA, and bloom by default. Anything that ships "off" stays off. |
| Weak assets | 12% | Box primitives for props and arena; the stock street kit doesn't match the theme. Fighters are fine underneath the tint. |
| Engine rendering limits | 8% | Nothing visible proves a hard limit. If shadows, PBR, IBL, or bloom are actually unsupported, move weight here (unverified from stills). |

---

## 5. Top 6 highest-leverage changes

1. **Reframe the game.**
   - Use a full-bleed canvas with the HUD overlaid on the 3D view.
   - Lock to a side-on fighting camera (low, about 35–50mm equivalent) that tracks the fighters' midpoint and zooms with distance.
   - Fighters should fill 45–60% of frame height. Cut the empty foreground.
2. **Restore the characters.**
   - Remove the flat tint and use the authored textures.
   - Express team identity through a strong colored rim light, emissive accents, and a fresnel outline.
3. **Build a real lighting rig.**
   - Add one shadow-casting key light with tight shadow bounds on the arena, plus a contact-shadow or AO pass.
   - Add a cool fill, warm and cool team rim lights, and lamp-post practicals.
   - Use ACES or AgX tone mapping with deliberate exposure: crush blacks and let the emissives exceed 1.0.
4. **Fix ground and atmosphere.**
   - Make the floor wet asphalt with roughness variation and planar reflections or SSR.
   - Add an HDRI or env cube for IBL and window reflections.
   - Add light distance fog or haze to push the facade back, and darken or blur the background.
5. **Add impact juice.**
   - On each hit: 50–100ms hitstop, camera shake, a white hit flash on the victim, and spark plus shockwave particles at the contact point.
   - Use proper weapon or limb trails instead of translucent smears.
   - Apply selective bloom on emissives and VFX.
   - Move the combo counter to the HUD edge, never over the action.
6. **Ship-mode cleanup and mobile.**
   - Hide the dev nav and "evidence" UI behind a flag.
   - On mobile, force or encourage landscape, make the canvas full-screen, add on-screen touch controls, and fill or remove the black void.

---

## 6. Verdict

**Substantial rebuild of the presentation layer.** The engine and gameplay code probably survive. Camera, lighting, materials, VFX, arena, and layout need to be redone, not tweaked. Polish alone won't overcome tinted characters in an inset box with no shadows or impact feedback.

---

## 7. Competitive with a well-built modern three.js browser game?

**No.** Good three.js games ship with:
- PBR materials under IBL
- Shadows and reflections
- Tone-mapped, graded HDR with selective bloom
- Hero-framed characters
- Heavy hit feedback

This build has none of these visibly. Its strongest element is the web HUD, which is the wrong thing to lead a 3D showcase. As an engine showcase it currently argues against the engine, because viewers will attribute the flat look to Aura3D whether or not that's fair.

# `showcase-aurora-lander`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Aurora Lander: Visual Audit

## 1) Per-image description

### desktop-1920x1080__02-opening
A small teal lander sits dead-centre, about 4% of the frame. It has a stacked dome, an antenna puck, ring panels and splayed legs. A long yellow-white capsule-shaped flame hangs below it, with a faint warm halo. The background is a flat, uniform navy with roughly ten sparse dot "stars". There is no gradient, no aurora, no horizon glow.

The only ground is a single dark-green blobby heightfield silhouette at the bottom. It ends abruptly at both sides, leaving navy void at the left and right edges, and has no visible lighting, texture, shadow or landing pad. HUD chips sit top-left, and a dark sidebar takes about 13% of the width on the right. The 3D view covers about 87% of the screen, but more than 85% of that is empty navy.

### desktop-1920x1080__03-mid
The lander is tilted about 23° in the upper-centre and thrusting, with the same rigid capsule flame offset from the nozzle axis. No terrain is visible. The only ground cue is a cropped corner of a landing pad in the extreme bottom-left, showing two emissive yellow strips.

One brighter "star" in the lower-left has a soft circular bloom halo that reads as a stray UI dot rather than a world object. The frame is otherwise empty navy. The lander's underside is a clipped white disc.

### desktop-1920x1080__04-action
The lander is centred and not thrusting, at 123.5 m altitude. There is no terrain, no pad, no horizon: only navy and roughly eight dots. The underside emissive disc is blown to near-white.

This is labelled the "action" shot, yet nothing is happening and there is zero spatial reference. The player cannot tell where the ground is.

### mobile-390x844__03-mid
The layout is portrait. The top ~66% is game view and the bottom ~34% is a dark control panel: a Briefing button, a throttle slider, RCS buttons, and Ghost/Pause/Restart.

The HUD chips wrap into three rows and consume the top ~12% of the view. The lander is jammed into the upper-right near the edge and tilted, with the capsule flame. One haloed dot sits lower-left. There is no terrain or pad in view, and the playfield is roughly 90% empty navy.

## 2) Category scores

| Category | Score | Justification |
|---|---|---|
| environment_world | 1.5 | One untextured green blob that doesn't span the screen, and in 3 of 4 shots no world at all. |
| modeling_assets | 4 | The lander has reasonable silhouette detail (dome, legs, panels, antenna) but is chunky and low-poly. The terrain is a smooth noise mesh. |
| texture_quality | 1.5 | No visible textures anywhere; everything is flat albedo. |
| material_quality | 2.5 | The lander reads as flat teal plastic with no metal/roughness variation. The terrain is matte flat green. |
| pbr_credibility | 2 | No specular response or Fresnel, and nothing reads as metal, regolith or glass. |
| lighting | 2.5 | There is no discernible key light direction. The flame casts no light onto the lander or ground, and the terrain is uniformly lit. |
| shadows | 1 | No shadows visible: none from the lander on the ground, and no self-shadowing on its legs. (Partly inferred: the ground is rarely on screen.) |
| ambient_lighting | 3 | Flat ambient fill keeps the lander visible but kills form. There is no AO in the panel crevices. |
| ibl_reflections | 1 | No environment reflections on any surface. |
| tone_mapping | 3.5 | The flame core and the lander underside clip to white, while the rest sits in murky mid-navy, so the frame has poor dynamic range use. |
| color_management | 4.5 | The palette is coherent (teal/navy/amber) but desaturated and muddy. The green terrain clashes with the teal and has no value separation. |
| anti_aliasing | 5 | Edges are mostly clean. There is mild stair-stepping on the lander legs and antenna at this small size (JPEG makes this partly unclear). |
| postprocessing | 3 | Weak bloom halos on the flame and dots only. No grading, vignette, chromatic or lens treatment. The bloom on the stray dot looks like a bug. |
| vfx | 2.5 | The exhaust is a single static additive capsule mesh: no flicker shape, no taper to a nozzle, no shock diamonds, no heat. |
| particles | 1 | No exhaust particles, dust kick-up, RCS puffs or debris. The "stars" are a dozen dots. |
| animation_quality | 3 (inferred) | Rigid-body tilt only. There is no visible leg suspension, RCS pulse or flame variance cue in the stills. |
| character_presentation | 3.5 | The lander is the hero but tiny (about 4% of the frame) and poorly lit. Its silhouette is the strongest thing on screen, which is a low bar. |
| camera | 2 | The camera frames empty sky and loses the ground entirely at altitude. There is no altitude-adaptive zoom and no lead toward the target pad. |
| composition | 1.5 | The subject floats in a void. The pad is cropped at the corner, and frames have no foreground, midground or background layering. |
| scale_depth_perception | 1.5 | There are no depth cues (parallax, haze, size reference) and the stars sit in the same visual plane as the lander. 60 m and 120 m look identical. |
| atmospheric_effects | 1 | The game is called *Aurora* Lander and has no aurora. There is no sky gradient, haze or horizon glow. |
| gameplay_readability | 4 | The HUD numbers are legible, but the core gameplay information (where the ground and pad are, distance and slope) is often absent from the view. |
| ui_hud | 5.5 | Clean, consistent chip styling and a tidy sidebar. It reads as dev-tool or prototype ("PROTOTYPE · AUTHORED ARCADE DYNAMICS"). The fuel bar is a sliver. |
| typography | 5.5 | The monospace HUD is legible and on-theme. The sidebar text is tiny at 1080p, and the title has no hierarchy or brand treatment. |
| polish_juice | 2 | No camera shake, flame flicker, screen-space feedback, landing guides or ground glow. The game is static and silent-looking. |
| mobile_presentation | 4 | The controls are thumb-sized and well spaced. The HUD wraps into three rows, the subject hugs the edge, the panel eats a third of the screen, and the playfield is still mostly empty. |
| overall_visual_quality | 2.5 | It reads as a functional prototype: early-2000s Flash/tech-demo level art direction on a modern renderer. |

## 3) What looks poor and why

- **Empty composition:** 85–95% of every frame is flat navy. The terrain is missing in 3 of 4 captures, and when present it is a cropped blob that ends mid-screen, exposing the world boundary.
- **The title promise is unfulfilled:** "Aurora" with no aurora, no sky gradient and no horizon. The background is a solid clear-colour plus dot sprites.
- **Flat-colour materials:** the teal lander and green terrain show no roughness/metal variation, textures, AO or rim light, so the lander reads as a toy and the ground as a felt cut-out.
- **No lighting relationship:** the bright flame doesn't light the hull or the ground, and there are no shadows. Objects don't feel like they share a space.
- **The flame is a primitive:** a static, uniformly glowing capsule offset from the nozzle, with clipped white core and no taper or particles. It reads as a placeholder.
- **Exposure and tone:** clipped whites on the flame and underside next to murky mid-blue, with no grade and no contrast shaping.
- **Stray bloom dots:** one larger haloed star looks like a cursor or debug marker.
- **Tiny subject and lost camera:** the lander is about 4% of the frame and the camera doesn't adapt to altitude, so scale and descent progress are unreadable.
- **Prototype UI:** the sidebar labelled "PROTOTYPE", the button cluster and the dev-panel aesthetic. On desktop, the touch controls are redundant chrome eating 13% of the width.

## 4) Dominant causes

| Cause | % | Notes |
|---|---|---|
| Game scene authoring | 40% | No sky, no aurora, a terrain that doesn't fill the frame, no lights or shadows configured, a placeholder flame. |
| Camera/composition | 25% | Fixed framing loses the ground, the subject is too small, and nothing is layered. |
| Weak assets | 20% | Untextured lander and terrain, primitive exhaust, dot stars. |
| Engine defaults | 10% | Flat ambient, no tone-map or grade tuning, naive bloom, no default env map. |
| Engine rendering limits | 5% | Nothing here approaches renderer limits; the AA and bloom seen are adequate. |

## 5) Top 6 highest-leverage changes

1. **Altitude-adaptive camera.** Always keep the terrain and target pad in frame, zooming out with altitude and leading toward the pad. Make the lander about 8–12% of the frame height. This fixes readability, scale and composition at once.
2. **Build the sky as the hero.** Use a vertical gradient (deep indigo to teal horizon glow), animated aurora ribbons (shader curtains with noise), and a layered starfield with size and brightness variance. Remove the stray haloed dot.
3. **Full-width layered terrain.** Use 3–4 parallax ridge layers with atmospheric value falloff, and a near ground with triplanar regolith/rock texture and slope shading. Give it a distinct palette from the lander, such as cool grey-violet with aurora-tinted rim. Make the pads proper models with beacons and light pools.
4. **Lighting pass.** Add a cool directional key plus an aurora-coloured rim, a shadow-casting light (lander shadow on the ground as an altitude cue), and an env map for IBL. Make the exhaust a dynamic point light that illuminates the hull and the ground on approach.
5. **Replace the exhaust VFX.** Use a nozzle-attached tapered cone shader with noise flicker and a hot core with cooler edges, a GPU particle plume, ground dust and blast ring under 15 m, and RCS puffs on rotation.
6. **Materials and post.** Give the lander PBR materials (brushed metal, painted panels, foil, emissive windows) with AO. Use ACES/AgX tone mapping with tuned exposure to fix clipping, threshold-tuned bloom, a subtle grade and vignette, and mild shake on thrust and landing.

On UI: on desktop, hide the touch panel and move the briefing into a modal. On mobile, compress the HUD to one or two rows and shrink the control panel to about 25%.

## 6) Verdict

**Substantial rebuild** of the art, scene and camera. The engine, HUD framework and lander silhouette are salvageable, but the environment, sky, VFX, lighting and camera need to be authored from scratch. Polish alone won't move this past roughly 4.

## 7) Competitive with a well-built modern three.js browser game?

**No.** Modern three.js showcases (for example Bruno Simon's work or polished WebGL arcade titles) deliver lit, shadowed, textured worlds with atmosphere, particles and a reactive camera. This build shows a small, flat-shaded model floating over a solid-colour background with a capsule flame and mostly no ground. It reads as a physics prototype, not a shipped showcase, and specifically fails to show off the renderer it is meant to advertise.

# `showcase-bank-shot`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Aura3D "showcase-bank-shot" visual audit

## 1) Per-image description

**desktop-1920x1080__02-opening.jpg**
A single pool table floats in a near-black void, seen from a fixed elevated 3/4 camera. The felt is a flat, saturated royal blue with no visible lamp falloff. White decals show a head string, two concentric "spot/target" circles, and faint lane lines. A tight rack of glossy, solid-colored balls sits on the right with the cue ball near it. The rails are uniformly saturated orange-red "wood" with white dot diamonds and inset grooves. Specular hotspots appear on the near rail, along with a cyan glow at bottom-left and a magenta glow on the right rail. Pockets are black discs with grey rims, and the legs are untextured boxes. There is no cue stick, no visible room, and no readable ball shadows. The floor is a barely visible dark red-brown gradient. The 3D table fills roughly 45% of the frame, and about 40% is empty black. A right-side panel takes ~13% of the width and holds the title, stat grid, power bar, instructions, buttons, and debug text ("Backend rapier, Sensors 6, Bodies 34"). An empty "…" pill sits top-center.

**desktop-1920x1080__03-mid.jpg**
The camera, lighting, and framing are identical to the opening. The rack is partially broken: one red ball sits near the top rail, another red near the right rail, and green and purple balls are low-center, with the cue ball beside the rack. There is no cue, aim line, motion blur, impact effect, or trail, so nothing indicates a shot just happened. The clock reads 3:54, and the HUD is otherwise unchanged. The empty "…" placeholders remain.

**desktop-1920x1080__04-action.jpg**
The scene is the same as mid, apart from a faint thin aim line off the cue ball toward the rack. The top pill now reads "OPEN TABLE – AIM WITH A/D, HOLD SPACE TO CHARGE", and the same text is duplicated in the side panel. Despite the "action" label, there is still no cue stick, no power or charge visualization in-world, and no VFX. The black void and flat felt are unchanged.

**mobile-390x844__03-mid.jpg**
The portrait layout gives the top ~60% to the 3D viewport and the bottom ~40% to a stacked HUD of stats, power bar, and buttons. The camera is near top-down and pulled far back. The table occupies only ~25% of viewport width, inside a dark blue boxy room with untextured walls, a dark floor rectangle, and a clipped teal slab on the upper-left edge. Balls are a few pixels each and the decals are illegible. A blown-out white lamp hotspot sits on the bottom-right corner of the table. Most of the viewport is dark navy or black with no detail.

## 2) Scores

| Category | Score | Justification |
|---|---|---|
| environment_world | 2 | Black void on desktop; empty untextured box room on mobile. No pool hall, no lamp, no props. |
| modeling_assets | 3 | Table is boxy kit-bash: block legs, disc pockets, flat rail strips. Balls are fine spheres. No cue stick at all. |
| texture_quality | 2 | No visible textures. Felt is flat color, rails have no wood grain, balls lack numbers and stripes. |
| material_quality | 3 | Rails read as orange plastic. Felt has no fiber or sheen. Balls have a decent gloss highlight, which is the only credible material. |
| pbr_credibility | 3 | Spec highlights exist, but there is no energy-conserving roughness variety and the felt behaves like an unlit or emissive surface. |
| lighting | 3 | Arbitrary colored hotspots (cyan, magenta, orange) contradict the "one lamp" fiction. No overhead light pool. Felt is evenly lit. |
| shadows | 2 | No readable ball shadows on the felt and no table shadow on the floor, so nothing grounds the objects. |
| ambient_lighting | 2 | Pure black ambient with no AO in pockets, rail joins, or under balls. |
| ibl_reflections | 2 | Balls show point-light glints only, with no environment reflection. Rails have no reflection either. |
| tone_mapping | 4 | Desktop is mostly in range but the felt blue is oversaturated. The mobile lamp hotspot clips hard to white. |
| color_management | 4 | Palette is garish: electric blue felt against orange rails against neon accents. Probably sRGB-correct, but authored without restraint. |
| anti_aliasing | 5 (inferred) | Edges and decal lines look acceptable at 1080p. Mobile at small scale shows shimmer-prone sub-pixel balls. |
| postprocessing | 2 | No visible bloom discipline, AO, DOF, vignette, or grading. The rail glows look like light leaks, not deliberate bloom. |
| vfx | 1 | Only the aim line and target-circle decals. No impact, pocket, or charge effects. |
| particles | 0 | None visible in any frame. |
| animation_quality | 2 (inferred) | Physics balls only. No cue animation, and nothing changes between "mid" and "action" except ball positions. |
| character_presentation | 1 | The player avatar in pool is the cue stick, and it is absent, so there is no physical agency in-world. |
| camera | 3 | A single static high 3/4 shot never moves. Mobile camera is far too distant. |
| composition | 3 | The table is off-center against a void with huge dead space top and bottom, and the HUD crowds the right edge. |
| scale_depth_perception | 3 | Without shadows, room, or fog, the table reads as a floating model and scale is ambiguous. |
| atmospheric_effects | 1 | No lamp haze, smoke, dust, or fog. |
| gameplay_readability | 5 | Ball positions and decals read clearly on desktop. Stripes vs. solids cannot be told apart, which is fatal for "clear your suit." Mobile is close to unreadable. |
| ui_hud | 5 | Clean dark-glass panel and a consistent grid, but it is a dev dashboard: debug backend text, empty "…" placeholders, duplicated status messages. |
| typography | 5 | Legible sans with sensible hierarchy. Generic, with tiny label sizes and no game identity. |
| polish_juice | 2 | No feedback on any action and placeholder text visible. Reads as a prototype, as its own label says. |
| mobile_presentation | 2 | Tiny table in a dark box, a blown hotspot, and 40% of the screen spent on buttons. Effectively unplayable visually. |
| overall_visual_quality | 3 | A clean programmer-art prototype. Sits below "dated but competent" because the void, missing cue, and missing shadows are basic omissions. |

## 3) What looks poor and why

- **Void environment.** Desktop renders the table against pure black, and mobile shows an untextured blue box. There is no establishing context, so the table looks like a CAD preview.
- **No cue stick.** The single most important pool asset is missing. Aiming is reduced to a hairline and HUD buttons, which removes physicality and any sense of player agency.
- **Lighting is incoherent.** The game text says "one lamp," yet the rails show cyan, magenta, and orange glints from off-screen sources. The felt has no pool of light falling off toward the rails, which is the defining look of the genre.
- **No grounding shadows or AO.** Balls appear pasted onto the felt, and the table hovers above the floor.
- **Flat, untextured materials.**
  - The felt is a solid saturated blue with no nap, normal map, or sheen.
  - The rails are uniform orange with no wood grain or clearcoat variation.
  - The pockets are black discs with no leather, mesh, or depth.
- **Balls lack identity.** With no numbers, stripes, or cue-ball dot, the 8-ball rule (suits) is visually unsupported.
- **Garish palette.** Electric blue against orange against neon accents reads as untuned defaults, not art direction.
- **Static camera.** One unchanging high angle across opening, mid, and action means no drama or framing for shots.
- **Debug and placeholder UI in production.** "Backend rapier / Sensors / Bodies," the empty "…" pills, and duplicated status text are visible in shipped frames.
- **Mobile.** Camera distance makes the subject tiny, the hotspot clips, and the room geometry is crude and exposed.

## 4) Dominant causes

| Cause | % | Notes |
|---|---|---|
| Game scene authoring | 40% | Lighting setup, missing environment, palette, missing shadows enabled, decals. |
| Weak or missing assets | 25% | No cue, no ball textures, boxy table, no wood or felt materials. |
| Camera/composition | 15% | Static high camera, dead space, poor mobile framing. |
| Engine defaults | 15% | No tone-map or grade tuning, no IBL by default, shadows and AO apparently off. |
| Engine rendering limits | 5% | Nothing here exceeds what three.js-class rendering does routinely. |

## 5) Top 6 highest-leverage changes

1. **Build the pool-hall lighting setup.**
   - One visible overhead lamp with a warm spotlight and soft shadow maps, and contact shadows under the balls.
   - SSAO or baked AO on the table.
   - Remove the stray colored lights.
   This alone fixes grounding, mood, and focus.
2. **Add an HDRI/IBL with clearcoat on the balls and rails.** Use a dim bar-interior HDRI so the balls get real reflections and the rails read as lacquered wood. Choose ACES or AgX with a deliberate grade and a muted felt tone.
3. **Replace the core assets.**
   - A modeled cue stick with aim pull-back and strike animation.
   - Balls with numbers and stripes (texture atlas).
   - Wood PBR rails and a felt material with normal map and sheen.
   - Leather pocket meshes and turned legs.
4. **Give the table an environment.** A modest pool-hall room that falls into darkness beyond the lamp cone: back wall, cue rack, bar silhouette, light haze or volumetric cone in the lamp. Kill the black void.
5. **Rework the camera.**
   - A cue-follow aim camera that sits low behind the cue ball.
   - A shot-tracking camera.
   - A pocket-cam or slow-mo on key sinks.
   - On mobile, fit the table to the viewport (or force landscape) and shrink the HUD footprint.
6. **Add juice and clean the UI.**
   - Impact flash, chalk puff, pocket glow or score pop, power-charge visualization on the cue, and a ghost-ball trajectory.
   - Strip the debug and backend text and the "…" placeholders.
   - Move the HUD to a slim overlay with game-styled typography.

## 6) Verdict

**Substantial rebuild.** Gameplay, physics, and the HUD skeleton are salvageable. The visual layer needs replacement rather than polish: lighting rig, environment, every material, the missing cue asset, and the camera system. Tuning the current scene cannot fix a void background and an absent cue.

## 7) Competitive with a well-built modern three.js browser game?

**No.** Well-built three.js pool games ship with HDRI reflections, numbered and striped balls, a lamp pool with soft shadows, a cue stick, and camera work. This build has none of these, plus a black void, an incoherent palette, visible debug UI, and a mobile view where the subject is a few dozen pixels wide. It reads as an engine test scene, at roughly 3/10 against the modern bar.

# `showcase-blockfall-reactor`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Aura3D Showcase Audit: `showcase-blockfall-reactor`

The playfield shading is competent, but the game is effectively a 2D Tetris skin. The camera is static and front-on, the backdrop and mascot appear to be flat cards, and there are almost no shadows, a single VFX event, and no visible motion or reaction across frames. It does not showcase what a 3D engine can do. Overall score: **4/10**.

---

## 1. Per-image description

### desktop-1920x1080__02-opening

- **Playfield:** A head-on, near-orthographic view of a 10-wide well. Heavy cyan neon gridlines frame dark navy cell insets.
  - About three rows of glossy "jelly candy" blocks sit at the bottom, with a magenta piece stacked above.
  - A faint dark-gray ghost piece floats mid-well.
  - An orange elliptical ring with a few ember specks sits on row 2. This is the only VFX in the whole capture set.
  - A thin static vertical cyan streak runs down the center column above a soft cyan hotspot.
- **Left flank:** An arcade-cabinet facade with a "LIVE" neon sign, a blue metal panel with yellow lightning decals, and a "SUPER ARCADE GAME" marquee clipped by the HUD.
- **Right flank:** An illustrated flame-haired mascot that reads as a 2D sticker on a flat magenta rectangle, below a detailed orange/purple cabinet. Both flank backdrops look like painted or pre-rendered plates, not lit geometry.
- **HUD:** Title card top-left, score/lines/level/combo top-right, a Hold/Next column on the right, and a 2×5 grid of text buttons bottom-left that look like a debug control bar.
- **Screen usage:** Roughly 35% is live 3D playfield. The bottom ~12% is a near-black void with an unlit pedestal, and the lower-left and lower-right are flat dark navy with floating light pillars.

### desktop-1920x1080__03-mid

- The framing is pixel-identical to the opening. Only the board state changed: a tall stack in columns 6–7, a magenta T piece at the left with a small white arc indicator, and score 217.
- The environment, lighting, mascot pose and center hotspot are unchanged.
- There is no VFX, no particles, and no camera change. The scene reads as a static wallpaper behind a grid.

### desktop-1920x1080__04-action

- This "action" frame is visually indistinguishable from mid apart from a few more pieces, score 251, and a piece in Hold.
- There is no line clear, impact, flash, shake or particle event, so nothing marks this as an action moment.
- The same dark lower band, cyan hotspot and static mascot remain.

### mobile-390x844__03-mid

- **Layout:** Portrait. The well fills the full width with almost no margin, and the environment is cropped down to a few neon bars and one yellow light strip.
- **HUD overlap:** Two stacked HUD cards occupy the top ~12%. The Hold/Next panel overlaps the top-right of the playfield, covering columns 9–10 across roughly rows 1–5.
- **Controls:** A two-row control bar takes the bottom ~18%, sitting below a dark empty band.
- **3D share:** About 60% of the screen is playfield, but there is essentially no world. It reads as a flat web app with glossy tiles.

---

## 2. Category scores

| Category | Score | Justification |
|---|---|---|
| environment_world | 4 | Rich-looking arcade backdrop, but it appears to be flat plates with no parallax or integration; bottom third is a void. |
| modeling_assets | 3 | Visible 3D geometry is rounded-rect blocks, line tubes, and a box pedestal; everything else reads as imagery. |
| texture_quality | 5 | Backdrop plates are detailed; the blocks are untextured, and the grid backplane is flat color. |
| material_quality | 5 | The jelly/candy block shader with specular and subsurface-ish glow is the strongest element; nothing else has material definition. |
| pbr_credibility | 4 | Blocks sell "glossy plastic" but don't pick up neighbor emissives; the frame and pedestal read as unlit flat. |
| lighting | 4 | Lighting is neon-flavored, but light doesn't visibly fall onto the well, floor or blocks from the tubes. |
| shadows | 1 | No visible cast or contact shadows anywhere; blocks float on the grid plane. |
| ambient_lighting | 3 | No AO between blocks or at well edges; the ambient is flat navy. |
| ibl_reflections | 3 | Block highlights suggest an env map, but there is no floor or frame reflection where neon begs for it. |
| tone_mapping | 6 | Saturated without clipping mush; highlights roll off acceptably and nothing is washed out. |
| color_management | 6 | Coherent cyan/magenta/orange palette, though the block rainbow fights the cyan grid. |
| anti_aliasing | 6 (inferred) | Edges look clean at capture scale; thin 1px grid and tube lines are likely to shimmer in motion. |
| postprocessing | 5 | Moderate bloom on tubes, tasteful rather than hazy; no DoF, chromatic or grade work selling depth. |
| vfx | 2 | One orange ring in one frame; no lock, drop or clear effects visible elsewhere. |
| particles | 2 | A handful of embers around the ring; otherwise none. |
| animation_quality | 2 (inferred) | The mascot pose and environment are identical across all three frames, with no visible secondary motion. |
| character_presentation | 3 | The mascot art is appealing, but it's an unlit sticker on a hard-edged rectangle, disconnected from the scene. |
| camera | 2 | Locked, dead-on, flat framing that throws away all depth; identical across states. |
| composition | 5 | Symmetric and centered with a clear focal point, but large dead zones low and the marquee clipped by the HUD. |
| scale_depth_perception | 3 | No perspective cues, fog layering or parallax; the backdrop reads as a wall 1m behind the grid. |
| atmospheric_effects | 2 | No haze, volumetric light or dust; the only atmosphere is the bloom halo. |
| gameplay_readability | 6 | Block colors are distinct, but the ghost piece is low-contrast dark gray, heavy gridlines compete with pieces, and the center hotspot sits behind play. |
| ui_hud | 4 | Clean dark cards, but tiny text at 1080p, the debug-looking button bar on desktop, and the mobile Next panel occluding the board. |
| typography | 5 | Legible sans with consistent weights, but undersized labels and generic system-UI feel with no arcade identity. |
| polish_juice | 2 | No visible feedback between frames: no shake, flash, squash or score pop. |
| mobile_presentation | 3 | The board fills the width, but the HUD overlaps play, the world is cut away, and the button bar is oversized and generic. |
| overall_visual_quality | 4 | Nice block shader and attractive backdrop art can't hide a static, flat, unshadowed 2D presentation. |

---

## 3. What looks poor and why

- **Fake depth.** The cabinets, "LIVE" sign and mascot look like 2D plates. Lighting doesn't match: the mascot's warm rim light has no source, and nothing from the scene's neon hits it. The magenta rectangle behind the mascot exposes it as a card.
- **Zero grounding.** There are no shadows, no AO, and no reflective floor. The blocks hover on a flat navy plane, and the pedestal and floor are an unlit black void.
- **Static everything.** Mid and action frames are near-identical. Nothing in the world reacts to play, so the game appears dead between line clears.
- **Camera wastes the 3D engine.** A perfectly front-on, locked view makes this indistinguishable from a 2D canvas game with pre-shaded sprites.
- **Busy playfield.** Bright, thick cyan outlines on every cell, plus dark cell insets, create visual noise at the same intensity as the pieces. The blocks are smaller than their cells, so the stacks read as loose candies rather than solid columns.
- **Artifacts that read as bugs.** The cyan hotspot behind center-well and the thin vertical streak in the opening frame look like stray light or leftover debug lines.
- **Low-contrast ghost piece.** The dark gray ghost against dark navy is easy to miss.
- **Debug-grade UI.** The desktop on-screen button grid (Left/Right/Rot L/Rot R/…) reads as a dev harness. On mobile, the Next panel overlaps the well and the "SUPER ARCADE GAME" marquee is clipped by the title card.
- **Dead screen real estate.** The lower ~25% of the desktop frame is dark navy and black with isolated light sticks.

---

## 4. Dominant causes

| Cause | % | Notes |
|---|---|---|
| Game scene authoring | 35% | No shadows or reflections configured, flat backdrop cards, no VFX hooks, static world, dark empty floor. |
| Camera/composition | 20% | Locked orthographic-feel camera and dead zones; HUD collisions. |
| Weak assets | 25% | Almost no real 3D geometry; the mascot is an unrigged image; the blocks are the only real asset. |
| Engine defaults | 15% | Flat ambient, no AO or contact shadows by default, bloom is the only post. |
| Engine rendering limits | 5% | Nothing visible suggests the renderer can't do better; the block shader and tone mapping show it can. |

---

## 5. Top 6 highest-leverage changes

1. **Camera with depth and life.** Use a slight downward tilt (~8–12°) and a modest FOV so the well has visible thickness. Add a slow idle drift, punch-in and kick on line clears, and scaled shake on hard drop and Tetris.
2. **Ground the playfield.** Make the well a real 3D bezel with blocks as beveled cubes filling their cells. Add contact shadows or AO between blocks, a glossy reflective floor (planar or SSR) under the cabinet, and emissive bounce from blocks onto the frame.
3. **Replace or integrate the backdrop and mascot.** Either build low-poly 3D cabinets lit by scene lights, or at minimum split the plates into layered parallax planes with matched lighting and fog. Rig the mascot (Spine or 3D) with idle, react, combo and fail states, and remove the magenta rectangle.
4. **Juice and VFX system.** Add GPU particle bursts on lock, shard explosions and a shockwave ring on clears, and escalating color grade, chromatic flash and bloom pulse for combo/B2B/Tetris. Make the environment neon pulse with gameplay events.
5. **Playfield readability pass.** Thin and dim the gridlines (about 30–40% opacity, or dots at intersections). Give the ghost piece an outlined treatment in the piece's color. Remove the center hotspot and the stray vertical streak, and fill the floor with a lit stage and light shafts or volumetric haze.
6. **UI/mobile rework.** Hide the desktop button grid behind a toggle and show keyboard hints instead. Give the HUD an arcade-themed typographic identity at larger sizes. On mobile, move Hold/Next into a strip above the well, shrink the control bar, and keep a sliver of the 3D world visible.

---

## 6. Verdict

**Substantial-rebuild of the presentation layer.**

Keep the block material, tone mapping, palette and game logic. Rebuild the camera, environment, mascot integration, lighting/shadows and VFX. Polish alone won't fix a scene that is structurally a 2D wallpaper behind a grid.

---

## 7. Competitive with a well-built modern three.js browser game?

**No.** Good modern three.js puzzle games (and the Tetris Effect-style reference this is reaching for) use a dynamic camera, reactive environments, real shadows and reflections, and dense event-driven VFX. This build has a static camera, flat card backdrops, no shadows, one ring effect, and a dev-style button bar.

The block shader and the backdrop illustration make a good first screenshot. In motion and across states, it presents as a nicely skinned 2D web Tetris rather than an engine showcase.

# `showcase-courier-rush`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Aura3D Visual Audit: showcase-courier-rush

## Headline

2 of 3 desktop captures render a fully black world. HUD and the nav arrow still draw, but there is no scene. This alone makes the desktop build unshippable as a showcase. The one frame that does render shows blown-out bloom, untextured box architecture, and a player vehicle reduced to a white blob. Mobile renders, but its HUD covers roughly 40% of the screen.

---

## 1) Per-image description

**desktop__02-opening**
- **Scene:** A night-time city street seen from a high, steep chase camera behind the player van. Buildings are untextured dark-navy extruded boxes. The road is flat dark teal with a double yellow centerline that blooms into a solid glowing stripe running the full height of the screen.
- **Player van:** Almost entirely clipped to white by bloom, so its form is unreadable.
- **Props:**
  - Two orange jersey barriers, the best assets on screen, with real texture and wear.
  - A yellow parcel box next to a cyan glowing pickup ring.
  - A slatted ramp or pallet structure.
  - A distant truck, plus distant building facades with orange and cyan emissive windows that bloom into a blurry wall.
- **Lighting:** No readable cast shadows, no reflections on the road, no fog or sky. Large crushed-black regions sit at the left and right edges.
- **Screen split:** About 90% 3D. The HUD is four small panels: objective, timer/strikes/earnings, control hints, and a dispatch subtitle.

**desktop__03-mid**
- **Scene:** Completely black. No geometry, sky, or clear color is visible.
- **What still draws:** All HUD panels and the cyan nav arrow, at the identical screen position seen in the opening frame.
- **Timer:** Reads 57.5, only 0.2s after the opening frame's 57.7. Either the simulation is stalled or paused, or the capture is not "mid" game at all.
- **Screen split:** 100% UI on black. This is a broken frame.

**desktop__04-action**
- Pixel-identical to 03-mid: black frame, HUD intact, timer still at 57.5.
- This confirms a persistent failure rather than a transient one. Possible causes:
  - Camera position or matrix going NaN after a physics step.
  - Camera embedded inside geometry.
  - WebGL context loss.
  - Exposure or post chain producing zero.
  - The game loop halting after the first frames.
- **Screen split:** 0% usable 3D.

**mobile__03-mid**
- **Scene:** Portrait view with a very close chase camera. The van's rear fills the lower half. The van has a real model with a license plate and rear doors, but its roof is blown to pure white.
- **Emissive and bloom:**
  - Two horizontal cyan emissive bars stick out of the van's sides like wings and bloom heavily.
  - Orange barriers flank the lane.
  - The yellow centerline is blown out again.
  - Distant pink/purple emissive facades are visible at the top.
- **Lighting:** No shadows or reflections.
- **HUD coverage:**
  - The timer panel sits over the road ahead.
  - The objective banner takes the top.
  - A "Delivered +173" toast covers the van.
  - A 6-button touch pad covers the bottom-right.
- **Screen split:** The HUD obscures roughly 35–40%. Gameplay state is progressing (Job 2/5, 1 strike, x1.2), so mobile is not hitting the black-frame bug.

---

## 2) Scores (0–10)

| Category | Score | Justification |
|---|---|---|
| environment_world | 2 | Untextured box buildings and a flat road. No street furniture density, signage, or skyline silhouette. Black in 2/3 desktop frames. |
| modeling_assets | 4 | Van and jersey barriers are credible authored assets. Everything else is primitives or extrusions. |
| texture_quality | 3 | Barriers are textured. Buildings and road read as flat color with no detail maps. |
| material_quality | 3 | Everything is matte or emissive. No car paint, glass, wet asphalt, or metal response. |
| pbr_credibility | 2 | No roughness variation, no specular highlights, no energy-plausible response. Emissive values are wildly over-driven. |
| lighting | 3 | Pure emissive-driven night with no motivated key light. The van is lit by its own bloom rather than the scene. |
| shadows | 1 | No visible cast shadows from van, barriers, or buildings. Objects float. |
| ambient_lighting | 3 | Flat navy ambient. No AO or contact darkening, and edges crush to black. |
| ibl_reflections | 1 | No env map and no road or vehicle reflections, which is the single biggest miss for a neon-night driving game. |
| tone_mapping | 2 | Hard white clipping on the van and road lines while the rest is crushed. Exposure is mismanaged. |
| color_management | 4 | The palette (navy/teal/orange/cyan) is coherent in intent. Saturation dies in the clipped highlights. |
| anti_aliasing | 5 (partly inferred) | Edges look acceptable at 1080p through JPEG. Bloom hides most aliasing. |
| postprocessing | 2 | Bloom threshold is far too low, so bloom swallows the hero object. No vignette, grading, or motion blur visible. |
| vfx | 3 | The pickup ring is clean but basic. Cyan side bars and the nav arrow are flat. No exhaust, sparks, or speed lines. |
| particles | 1 (inferred) | None visible in any frame. |
| animation_quality | 3 (inferred) | No visible suspension, body roll, wheel steer, or lean cues. Desktop frames show no evidence of motion at all. |
| character_presentation | 2 | The player vehicle, the de facto character, is a white blob on desktop and a half-blown-out shape on mobile. |
| camera | 3 | Desktop is too steep and high, which flattens the scene. Mobile is too close, so you cannot see the road ahead. Desktop camera likely the source of the black frames. |
| composition | 3 | The road reads as a lane, but the blown centerline cuts the frame in half. Edges are dead black and there is no focal hierarchy. |
| scale_depth_perception | 3 | Without fog, shadows, or texture detail, buildings have no readable scale. The distant bloom wall flattens depth. |
| atmospheric_effects | 1 | No fog, haze, rain, volumetric light cones, or sky. |
| gameplay_readability | 2 | Pickup ring and parcel read on the one working desktop frame. Black frames score 0, and on mobile the HUD covers the road ahead. |
| ui_hud | 6 | Clean, consistent glass panels with good hierarchy on desktop. Mobile placement is poor. |
| typography | 6 | Legible modern sans with good weight contrast. Desktop control hints are too small. |
| polish_juice | 2 | No screen shake, speed FX, or impact feedback visible. The delivery toast is the only feedback. |
| mobile_presentation | 3 | Renders, unlike desktop, but the camera is too tight and the HUD occludes key playfield areas. |
| **overall_visual_quality** | **2** | One mediocre frame plus two black frames on the primary platform. Even the working frame is roughly a 3.5. |

---

## 3) What looks poor and why

1. **Black desktop frames (critical).** HUD and arrow draw while the canvas is black and the timer is effectively frozen. The evidence fits a render or sim pipeline failure, not an art issue. Likely candidates:
   - Camera transform NaN from physics.
   - Context loss.
   - The camera going inside a building or below the road plane.
   - Post chain output zero.

   I can't determine which from stills. It needs console logs and per-frame camera-position dumps.
2. **Bloom and exposure are broken.** Emissive intensity on the van, road lines, and distant windows is far above the bloom threshold. Tone mapping clips to white instead of rolling off. The hero vehicle, the most important object on screen, is erased.
3. **Primitive architecture.** Buildings are unlit navy boxes with no windows geometry, trim, rooftop clutter, signage, or texture. The only emissive detail is a distant blurred wall.
4. **No reflections or IBL.** A neon night street with dry, matte, flat asphalt wastes the genre's main visual payoff. The van has no paint, glass, or chrome response.
5. **No shadows or grounding.** Barriers, parcel, and van have no contact or cast shadows, so everything floats.
6. **No atmosphere.** No fog gradient, sky, or haze. Distance is either black or bloom smear, with no depth layering.
7. **Camera.**
   - Desktop pitch is too steep and kills the skyline.
   - Mobile is too close, and the van fills about 50% of the frame.
   - Neither shows enough road ahead for a time-pressure driving game.
8. **Mobile HUD layout.** The timer panel sits on the road ahead, the toast sits on the player, and the touch cluster covers the right lane.
9. **Asset inconsistency.** The authored barriers and van sit next to programmer-art boxes and slats, which makes the primitives look worse.

---

## 4) Dominant causes (estimates)

| Cause | % | Notes |
|---|---|---|
| Game scene authoring | 35% | Box buildings, no props or dressing, over-driven emissive values, no fog or sky authored, mobile HUD placement. |
| Engine rendering limits / bugs | 25% | Black-frame failure (ownership unconfirmed: engine vs game camera/physics), absent shadows, no reflection solution exposed. |
| Engine defaults | 20% | Bloom threshold and strength, tone mapper and exposure, no default env map, shadows off by default. |
| Camera / composition | 12% | Steep desktop pitch, too-tight mobile follow, dead frame edges. |
| Weak assets | 8% | The few real assets are fine. The problem is that there are too few of them. |

---

## 5) Top 6 highest-leverage changes

1. **Fix the black-frame bug first.**
   - Log `webglcontextlost`, assert finite camera and vehicle transforms every frame, and clamp physics.
   - Validate the post chain output.
   - Add a capture-time assertion that the canvas isn't uniform black.
2. **Re-tune HDR and bloom.**
   - Switch to ACES or AgX and set a sane exposure.
   - Raise the bloom threshold above 1.0 in linear HDR and cut bloom strength by about 60%.
   - Drop van and road-line emissive to near zero. Road paint should be lit and reflective, not emissive.
   - Make headlights and taillights the only vehicle emissives.
3. **Add an IBL env map plus a wet-road reflection solution.**
   - Use an HDRI or baked cubemap of neon city night.
   - Make the road roughness 0.15–0.35 with puddle masks, and add SSR or a planar reflection for the road.
   - Give the van clearcoat car paint and glass.

   This is the biggest single visual jump for the genre.
4. **Replace the box buildings with a modular kit.**
   - Window grids with emissive variation, storefronts, awnings, and neon signs.
   - Street furniture: lamps, hydrants, cones, parked cars.
   - Trim-sheet textures and a recognizable skyline silhouette.
5. **Add shadows, grounding, and atmosphere.**
   - One directional moonlight with cascaded shadows, plus a few shadow-casting streetlights.
   - SSAO or contact shadows.
   - Height or exponential fog tinted to the palette, with volumetric light cones under lamps.
6. **Rework the camera and mobile layout.**
   - Desktop: lower the pitch to about 15–25°, add speed-based FOV and pull-back, and add a slight lag or roll.
   - Mobile: pull the camera back and up to show about 2x the road ahead.
   - Mobile HUD: move the timer into a compact top strip, put toasts above the road horizon, and use a semi-transparent, smaller touch cluster.

   This should come with basic juice: speed lines, tire smoke, screen shake on strikes, and a delivery burst.

---

## 6) Verdict

**Substantial rebuild.** The rendering pipeline config (tone mapping, bloom, shadows, env maps) can be saved through polish once the black-frame bug is fixed. The environment art has to be largely rebuilt, because box buildings can't be polished into a credible neon city. The HUD is salvageable as-is on desktop.

## 7) Competitive with a well-built modern three.js browser game?

**No.** Two-thirds of desktop captures are black, which is disqualifying on its own. The single working frame has no reflections, no shadows, no atmosphere, and primitive architecture. Its hero vehicle is lost to bloom clipping. Comparable modern three.js neon-driving showcases lead with wet reflective roads, IBL car paint, fog depth, and dense emissive signage. This build has none of those, and its best assets (the barriers and van) are undermined by the scene around them.

# `showcase-deep-recovery`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Deep Recovery: Visual Audit (Production Capture)

## 1) Per-image description

**desktop-1920x1080__02-opening.jpg**
The 3D world is a near-black navy void containing translucent teal primitives: stacked semi-transparent discs and slabs, upright cylinders with blown-out cyan emissive caps, and a few small boxy wreck/cargo props with orange torus markers. Dozens of cyan "comet" streaks, which read as additive stretched billboards, fall diagonally across the frame. A large kitbashed box cluster in the bottom-right foreground, probably the player sub or a wreck, is cropped and wrapped in glowing ring VFX, including what looks like a smeared text or label sprite. An orange tether line runs to a centre reticle. There are no visible shadows, reflections, seabed, or water volume. The HUD has five panels and a centre prompt, and covers roughly 20–25% of the screen. The remaining 3D area is about 60% black.

**desktop-1920x1080__03-mid.jpg**
The framing is almost identical, with the camera pitched steeply down into the same translucent structure. The Sonar Contacts panel is now populated. The centre-left shows a bright C-shaped ring on a box, which is presumably a pickup or sonar return. A huge overexposed bloom blob dominates the bottom-left, and the foreground sub cluster is mostly offscreen bottom-right. The scene reads as glowing cyan sticks floating in black, with no ground plane or horizon.

**desktop-1920x1080__04-action.jpg**
This is the same composition again, with a large pillar on the right whose cap clips to pure white, and a wreck tile with an orange ring at the left. Despite being labelled "action", nothing on screen communicates action. There are no hits, no thrust wake, no sonar pulse wave, and no visible player motion. Depth reads 4.8 m in "Shallow Reef", yet the frame looks abyssal.

**mobile-390x844__03-mid.jpg**
In portrait, two stacked HUD panels take the top ~20% and a 3-row control pad takes the bottom ~22%. The Sonar Contacts panel sits over the middle-left and overlaps the reticle, so usable 3D view is about 45% of the screen and partly obstructed. The visible world is a cropped slice of the same translucent slabs and cylinders, plus a dithered/scanline-textured cyan ring. A bright ring VFX bleeds behind the "Sonar Ping" button. The player vessel is not identifiable.

## 2) Category scores

| Category | Score | Justification |
|---|---|---|
| environment_world | 2.5 | No seabed, reef, terrain, or water volume; just floating translucent discs and cylinders in a black void. |
| modeling_assets | 2.5 | Cylinders, boxes, tori, and kitbashed cube clusters; no authored silhouettes. |
| texture_quality | 1 | Effectively untextured; flat tint plus one dithered ring texture. |
| material_quality | 2 | Everything is either flat translucent teal or additive emissive; no material differentiation. |
| pbr_credibility | 1.5 | No roughness or metal response anywhere; nothing reads as steel, rock, or coral. |
| lighting | 2.5 | Emissives are the only light read; no key light direction, no headlight, no falloff on surfaces. |
| shadows | 1 | None visible, so nothing grounds the objects. |
| ambient_lighting | 2.5 | Uniform flat teal ambient with no occlusion or depth gradient. |
| ibl_reflections | 1 | No environment reflections or specular at all. |
| tone_mapping | 3 | Emissive caps clip to pure white and the rest crushes to black; no highlight rolloff. |
| color_management | 4 | Palette is coherent (cyan/teal plus orange accent) but monochrome and blacks are crushed. |
| anti_aliasing | 5 | Edges look acceptable at desktop res; translucent overlaps hide the worst of it (partly inferred). |
| postprocessing | 3 | Bloom only, overdriven into haze blobs; no fog, DOF, grading, or underwater distortion. |
| vfx | 3.5 | Ring and streak effects exist but are generic, overbright, and semantically unclear. |
| particles | 3 | Comet streaks are large, uniform, and read as projectiles rather than marine snow or bubbles. |
| animation_quality | 2 (inferred) | No pose or motion cues; static props, no thrust wake or prop wash. |
| character_presentation | 1.5 | The player sub is either cropped offscreen or indistinguishable from wreck clutter. |
| camera | 2.5 | Steep top-down, the hero is not framed, and the near-plane foreground clutter is cropped. |
| composition | 2 | No focal point; the centre is empty and bright blobs sit at the frame edges. |
| scale_depth_perception | 2 | No ground, fog falloff, or known-size references, so distance is unreadable. |
| atmospheric_effects | 1.5 | No underwater fog colour, god rays, caustics, or suspended particulate; the void is black. |
| gameplay_readability | 3 | The HUD carries the game; in-world you can't tell sub vs wreck vs pickup vs hazard. |
| ui_hud | 6 | Clean, consistent sci-fi panels with good hierarchy, but too many panels and keyboard legends left on screen. |
| typography | 6 | Legible mono/sans pairing with sensible color coding; small sizes on desktop. |
| polish_juice | 3 | No feedback moments visible; the bloom does all the work. |
| mobile_presentation | 3 | UI eats over half the screen, a panel overlaps the reticle, and the world is a cropped sliver. |
| overall_visual_quality | 2.5–3 | Programmer-art prototype with a decent HUD skin. |

## 3) What looks poor and why

- **Primitive geometry everywhere.** Cylinders, slabs, discs, and cube kitbashes stand in for reef, wreck, and sub. None have damage, rust, barnacles, or recognisable form.
- **Translucency as the art style.** Stacked alpha surfaces flatten everything into one teal wash, kill depth cues, and risk sort errors.
- **Emissive and bloom overdriven.** Cylinder caps and rings clip to white and bloom into large blobs, especially bottom-left in the mid shot. This is the brightest content on screen and it is meaningless.
- **No underwater atmosphere.** The single biggest miss. "Shallow Reef at 5 m" should be bright turquoise with caustics, god rays, and a fog gradient, not a black void. The tonal result contradicts the fiction.
- **No lighting model on surfaces.** No shadows, specular, IBL, or occlusion, so objects float with no contact.
- **Unclear particles.** The diagonal cyan streaks read as incoming projectiles. If they are sonar returns or marine snow, they need distinct shape, size, and motion language.
- **Camera framing.** Steep downward pitch, no visible hero, and huge near-camera geometry cropped at the bottom-right. Nothing anchors the player's position.
- **Possible label artifact.** The smeared text-like sprite in the opening shot's ring VFX looks like a debug or label sprite being stretched.
- **Mobile layout.** Panels stack instead of consolidating, Sonar Contacts sits over the playfield, and 3D VFX bleeds behind buttons.
- **Debug-feel UI.** Full keyboard legend plus duplicate on-screen buttons on desktop reads as a dev build.

## 4) Dominant causes

| Cause | Share | Notes |
|---|---|---|
| Game scene authoring | ~40% | No fog, no lighting rig, translucency-everywhere choice, emissive values, particle design. |
| Weak assets | ~25% | Primitives and kitbash with no textures. |
| Camera/composition | ~15% | Steep pitch, no hero framing, cropped foreground. |
| Engine defaults | ~15% | Bloom threshold/intensity, tone mapping without rolloff, no default fog or IBL, alpha sorting. |
| Engine rendering limits | ~5% | Nothing visible here is beyond what three.js-class renderers do routinely. |

## 5) Top 6 highest-leverage changes

1. **Build a real underwater atmosphere.** Add exponential height/distance fog toward a turquoise-to-deep-blue gradient keyed to depth. Add surface god rays, projected caustics on geometry, and fine slow-drifting marine snow. This alone could add 2+ points.
2. **Replace primitives with authored assets.** Add a seabed terrain with rock and coral clusters, a hero wreck with recognisable hull and spars, and a distinct player sub silhouette. Use opaque PBR materials with albedo, normal, and roughness maps, and reserve translucency for genuine glass or holograms.
3. **Fix exposure and bloom.** Use ACES or AgX tone mapping with proper exposure, cut emissive intensity 3–5x, raise the bloom threshold, and lift the blacks so the void isn't crushed.
4. **Add a proper lighting rig.** Use a soft sun or sky light from the surface with shadows, a sub headlight spotlight with volumetric cone and shadow, a dim underwater IBL for specular, and SSAO for contact.
5. **Rework the camera.** Use a third-person chase cam behind and slightly above the sub at about 15–25° pitch, with the sub in the lower third and its headlight leading the eye toward objectives. Add near-plane fade for occluders.
6. **Give gameplay elements a distinct visual language, and fix mobile.** Pickups, wrecks, sonar returns, and hazards each need their own shape and color. Make the sonar ping a visible expanding shell that tags contacts. On mobile, merge the top HUD into one compact strip, move Sonar Contacts to a collapsible chip, and shrink the control pad. On desktop, hide the key legend after onboarding.

## 6) Verdict

**Substantial rebuild.** The HUD/UI system and the game loop scaffolding are salvageable. The world, assets, lighting, atmosphere, and camera need to be redone, not tuned. Polish passes on the current scene can't fix primitive assets in an unlit black void.

## 7) Competitive with a well-built modern three.js browser game?

**No.** Competent three.js work at this level ships with textured PBR assets, fog and atmosphere, tone-mapped lighting with shadows, and a framed hero. This build has none of those. The only element at a professional level is the HUD, and the 3D scene reads as an early prototype greybox with bloom applied. On the stated scale it sits around 2.5–3, closer to an early-2000s tech demo than to dated-but-competent indie work.

# `showcase-gallery-shift`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Aura3D Showcase Audit: `showcase-gallery-shift`

## 1) Per-image description

### desktop-1920x1080__02-opening.jpg
- **Scene:** A fixed high-angle 3/4 camera looks down on a roofless gallery floor built like a box diorama. It has three wings with emissive neon signage: "ARCHIVE", "ROTUNDA" and a clipped "TREASUR'". A stray floating "T" glyph sits beside ROTUNDA.
- **Characters:** The player is a blocky, Minecraft-style voxel figure standing on a gold-and-white emissive ring in the central rotunda. There are two guards. Left is a white/black mech-like figure at a noticeably higher detail level and in a different style. Right is a squat gold barrel robot.
- **Lighting:** Almost all light comes from cyan and white emissive strips, pink laser lines in the left wing, and a red carpet zone on the right. There are no meaningful cast shadows, no reflections on what is supposed to be a marble floor, and a pure black void around the model.
- **Framing and UI:** Roughly 55–60% of the frame is useful 3D. The lower ~25% is a dark empty plinth with a white strip. The right ~12% is an HTML sidebar showing stats, a patrol list, control buttons and debug text ("Backend rapier / LOS rays 75 / Occluded 75 / Steps 10"). The top HUD says "AVOID THE CONES", but no vision cones are visible.

### desktop-1920x1080__03-mid.jpg
- **Changes from the opening:** The player has moved to the back of the rotunda (gait SPRINT). The gold ring now shows only a small grey placeholder cube in the centre. The left guard has rotated and the right guard has drifted down.
- **New artifact:** A light-blue untextured trapezoid now sits at the bottom-right, *outside and below* the building, overlapping the black void. It looks like a mis-transformed vision cone or a light volume rendered as an opaque flat quad.
- **Unchanged:** Lighting, framing and UI are identical to the opening, with no VFX, motion cues or detection feedback. The detection bar is empty.

### desktop-1920x1080__04-action.jpg
- **Barely differs from "mid":** Gait is now SNEAK and Steps is 20. The right guard is slightly closer to the camera and the blue trapezoid artifact is still present.
- **Missing "action" content:** There is no detection event, no alarm state, no particles, no pickup and no cone visualization. The camera is static.
- **Overall:** The screenshot is visually indistinguishable from mid-game idling.

### mobile-390x844__03-mid.jpg
- **Layout:** The 3D canvas fills only the top ~40% as a cropped, distant view of the same diorama. The empty plinth still eats a third of that canvas.
- **HUD collisions:** The "DETECTION" panel overlaps and obscures "LIFT 1 OF 3 – AVOID THE CONES". The objective tag sits over the scene, and the "TREASUR'" sign is cut off.
- **Bottom panel:** The lower half is the desktop sidebar reflowed: title, a 3×2 stat grid, and eight text buttons (Up/Down/Left/Right/Sneak/Hold to lift/Restart/Pause) used as a D-pad. The "PATROLS" header is clipped behind the buttons, and the bottom ~15% is empty black.
- **Result:** Characters are a few pixels tall on mobile and unreadable.

## 2) Category scores

| Category | Score | Justification |
|---|---|---|
| environment_world | 4 | Coherent floor plan with clear zones, but it is a dollhouse of extruded boxes floating in a black void. Nothing beyond the walls. |
| modeling_assets | 3 | Walls, plinths and display cases are raw boxes. The player is voxel placeholder and the two guards come from incompatible style sources. |
| texture_quality | 2 | Effectively untextured: flat albedo, no marble, no wood grain, no trim sheets, no decals. |
| material_quality | 3 | Emissive vs. matte is the only material distinction. Gold reads as yellow plastic. |
| pbr_credibility | 2 | No visible roughness/metal variation and no specular response on a "marble hall" floor. |
| lighting | 4 | The neon emissive palette gives a decent night-heist mood, but it is unlit-looking, with no light falloff or pools on the floor. |
| shadows | 2 | Characters and props show no readable cast shadows. Only faint darkening at wall bases. |
| ambient_lighting | 3 | Flat uniform ambient with no AO in corners. Everything has the same mid-dark value. |
| ibl_reflections | 1 | No environment reflections anywhere. The gallery floor and glass cases reflect nothing. |
| tone_mapping | 4 | Not blown out, but emissives clip to flat white (signage, ring) with no roll-off. Mids are murky. |
| color_management | 5 | The cyan/pink/gold/red palette is intentional and consistent, with no obvious sRGB errors. |
| anti_aliasing | 5 | Edges are acceptable at 1080p. Thin neon lines shimmer-prone (inferred). |
| postprocessing | 4 | Mild bloom on signage and strips only. No SSAO, DOF, vignette or grading. |
| vfx | 2 | Laser lines are the only effect. Vision cones are absent or broken (the stray blue quad). |
| particles | 1 (inferred) | None visible in any frame. |
| animation_quality | 3 (inferred) | Rigid poses across frames. The voxel player shows no gait difference between SPRINT and SNEAK. |
| character_presentation | 2 | Tiny on screen, mismatched styles, and the player is a placeholder block figure. |
| camera | 4 | A fixed overview works for stealth readability but is static, too far out, and wastes the bottom third. |
| composition | 3 | Empty plinth and black void dominate. The subject sits high and the frame is never re-centred. |
| scale_depth_perception | 4 | The isometric read is clear. Lack of shadows, AO and atmosphere flattens depth. |
| atmospheric_effects | 1 | No fog, dust motes, light shafts or haze, despite neon lighting being ideal for them. |
| gameplay_readability | 4 | Zones are legible, but the core threat (vision cones) is invisible and the guards' facing is unclear. |
| ui_hud | 4 | Clean dark panels, but there is debug telemetry in production, redundant on-screen text buttons on desktop, and a truncated "SCORE" label. |
| typography | 5 | A sensible sans pairing with tidy hierarchy. In-world signage is clipped ("TREASUR'") with a stray glyph. |
| polish_juice | 2 | No feedback states across three frames, plus the stray geometry artifact. |
| mobile_presentation | 2 | Canvas covers about 40% of the screen with overlapping HUD, unreadable subjects, a text-button D-pad and dead space. |
| **overall_visual_quality** | **3** | Reads as an engine-integration prototype with neon trim, not a shipped showcase. |

## 3) What looks poor and why

- **Primitive geometry everywhere.** Every architectural element is an axis-aligned box with no bevels, mouldings, frames, artwork or furniture variation. A "private gallery" needs paintings, sculptures and plinths with silhouettes.
- **No texturing.** Flat albedo means the "Marble Hall" is a dark grey slab. There is no surface information to catch light.
- **No reflections or specular.** Night gallery floors are the textbook case for glossy reflections of neon. Their absence is the single biggest "dated" tell.
- **No shadows.** Characters float, and stealth games specifically benefit from light and shadow language.
- **Broken or missing core VFX.** The HUD says "AVOID THE CONES", yet there are no cones. The blue trapezoid outside the building in frames 3–4 is almost certainly a cone or spotlight mesh with a wrong transform or parent, rendered opaque and unlit.
- **Asset style clash.** A voxel player, a semi-detailed white mech guard and a toy-like gold barrel guard look like three different games.
- **Text and signage bugs.** The "TREASUR'" clipping and the floating "T" suggest text geometry overflowing its bounds or a mis-sized SDF texture.
- **Wasted frame.** About 25% of the 3D viewport is an empty base slab plus black void. The playfield is small and characters occupy under 1% of the screen.
- **Debug UI shipped.** The Rapier/LOS/steps readout and on-screen Up/Down/Left/Right buttons on desktop read as a dev harness.
- **Mobile layout.** It is a desktop sidebar stacked under a shrunken canvas rather than a mobile-first layout. The HUD pills collide.
- **Flat emissive clipping.** Signage and the ring are pure white blobs with bloom, with no colour retained in the highlight.

## 4) Dominant causes

| Cause | % | Notes |
|---|---|---|
| Game scene authoring | 35% | No set dressing or lighting design. Cones are missing or broken, and debug UI and text bugs shipped. |
| Weak assets | 25% | Box architecture, placeholder voxel hero, mismatched guards, zero textures. |
| Camera/composition | 20% | Overly distant static camera, empty plinth, black void, poor mobile framing. |
| Engine defaults | 15% | No env map, shadows off or weak, no SSAO, basic bloom, default tone mapping. |
| Engine rendering limits | 5% | Nothing on screen suggests the renderer can't do better. Everything missing is standard three.js-tier. |

## 5) Top 6 highest-leverage changes

1. **Fix and visualize the vision cones.** Render them as additive, depth-tested, soft-edged translucent cones or floor decals parented correctly to the guards, and remove the stray blue quad. Tint the cones by detection state. This fixes the core-loop readability and the visible bug in one pass.
2. **Glossy floor plus environment lighting.**
   - Give the marble floor a low-roughness PBR material with a texture.
   - Add an env map (PMREM from a dark interior HDRI or a baked neon cubemap).
   - Add SSR or planar reflection for the floor.
   - Neon reflecting on the floor will roughly double perceived quality.
3. **Real lights and shadows.** Add a few shadow-casting spot or area lights: gallery ceiling spots on exhibits and guard flashlights. Use soft shadows plus SSAO or GTAO so characters and plinths sit on the floor.
4. **Re-frame the camera.**
   - Crop out the plinth and void with a tighter FOV and a gentle follow or pan on the player.
   - Add a subtle vignette and fog falloff into darkness instead of a hard black box edge.
   - On mobile, make the canvas full-screen.
5. **Unified asset and set-dressing pass.**
   - Pick one style (stylized low-poly or toon) and rebuild player and guards to match.
   - Bevel the walls and add picture frames with artwork, display-case glass, velvet rope stanchions, benches and ceiling trims.
   - Fix the sign text bounds.
6. **HUD and mobile rework.**
   - Strip debug telemetry and desktop on-screen buttons.
   - On mobile, use a virtual joystick and contextual action buttons overlaid on a full-screen canvas, and fix the pill overlaps.
   - Add juice: detection pulse, alarm red wash, pickup sparkle, footstep or noise rings for sprint.

## 6) Verdict

**Substantial rebuild.** The layout, palette direction and gameplay scaffolding are salvageable. The assets, materials, lighting setup, VFX and mobile UI all need to be redone rather than tweaked.

## 7) Competitive with a well-built modern three.js browser game?

**No.** Modern three.js showcases routinely ship PBR materials with IBL, reflections, soft shadows, AO, atmospheric effects and cohesive authored assets. This build has none of them: untextured boxes, a placeholder hero, invisible core mechanics (cones), a shipped geometry artifact, debug UI in production, and a mobile layout where the game is a small, unreadable strip. Its neon palette gives it a recognizable mood, but it reads as a physics and LOS integration test, not a showcase.

# `showcase-gravity-post`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Gravity Post: Visual Audit (production capture)

## 1. Per-image description

**desktop 02-opening**
An oblique top-down orrery floats on a flat, uniform teal-navy backdrop inside a rounded-rect canvas, with no starfield depth, nebula or skybox. A flat 2D-looking sun (yellow core, orange and pink concentric discs) sits at the center. Around it are stacked, overlapping translucent cyan annuli for orbits and influence zones. The planets don't match each other: a photo-textured Earth (Verdance), a pale-blue sphere (Aquaria), a grey moon (Cinder), and two pure-black unlit spheres (Rust, Gale). Stations are pale, sparkly, semi-transparent voxel spires that read like noisy point clouds.

The player courier is a voxel truck in black, red and cyan, wildly oversized next to planets. A photo-textured cardboard box rides on it and occludes the Rust/Gale cluster. Scattered white dot sprites stand in for stars and also sit on the orbital plane. There are no shadows, no bloom on the sun, and no reflections. The HUD is a right-hand card stack covering about 15% of the width, so roughly 85% of the screen is 3D, but most of that is empty flat teal.

**desktop 03-mid**
Same framing. The ship has moved to the Aquaria ring and the cardboard box now floats detached above it, which reads as a bug or desync. A yellow dotted trajectory arcs from Sol Relay; it is the only dynamic VFX on screen, and it is a string of unlit dots. An extra "Flyby Beat" HUD card appears. The labels around Aquaria and Rust stack and overlap, which makes them illegible. Lighting is unchanged.

**desktop 04-action**
The ship is parked at Aquaria, front-on, with the box back on top. Its symmetric voxel silhouette now overlaps the Aquaria planet and station, burying the delivery target. A "Delivery Scored" card is added. Nothing in the 3D scene signals the delivery: no burst, glow or camera beat. It looks identical to the idle state.

**mobile 03-mid**
The canvas fills the top ~50% and is cropped, so the ship is cut off on the left edge and the Gale planet on the right. Labels scale up relative to the scene and collide (Aquaria / Aquaria Post, Rust / Rust Exchange, Verdance Hub / Verdance), covering much of the 3D. The bottom ~50% is a stacked desktop HUD with dense buttons, including keyboard hints ("W", "S", "N") that mean nothing on touch. The 3D area is mostly labels.

## 2. Scores

| Category | Score | Justification |
|---|---|---|
| environment_world | 2.5 | Flat solid-color void plus translucent rings; no skybox, nebula or star depth. |
| modeling_assets | 3 | Voxel truck, primitive spheres, noisy spire stations; the three asset languages clash. |
| texture_quality | 2.5 | A photo cardboard box and a photo Earth sit beside flat-shaded voxels; mixed sources and fidelity. |
| material_quality | 2 | Everything is unlit, flat or translucent; black spheres have no response at all. |
| pbr_credibility | 1.5 | No visible roughness/metal variation, specular or Fresnel anywhere. |
| lighting | 2 | The sun emits no light onto planets; there is no terminator or day/night side. |
| shadows | 0.5 | None visible. Even planet self-shadowing from the central star is absent. |
| ambient_lighting | 2 | Uniform flat fill; the black planets prove there is no ambient or hemisphere term on them. |
| ibl_reflections | 1 | No environment reflections on the ship or planets. |
| tone_mapping | 3 | No blown highlights, but also no HDR; the sun is a flat LDR disc. |
| color_management | 4 | Coherent teal/cyan palette, but low contrast and the backdrop and rings blend into mud-teal. |
| anti_aliasing | 4 (inferred) | Edges look acceptable at JPEG quality; the sparkly stations suggest shimmer in motion. |
| postprocessing | 1 | No bloom, vignette, grading or DOF. |
| vfx | 2 | A dotted trajectory and an orange thrust line; nothing for the sun, warp or delivery. |
| particles | 2 | Static white dots; no engine trail or ambient dust. |
| animation_quality | 2 (inferred) | A rigid voxel prop sliding; the detached box suggests broken parenting. |
| character_presentation | 2.5 | The hero ship is the largest object but reads as a toy truck, out of scale, and it occludes the gameplay. |
| camera | 4 | A fixed oblique overview is functional but has no framing beats, follow or zoom on delivery. |
| composition | 4 | The system is centered, but the rings overlap into visual soup and the right cluster is crowded. |
| scale_depth_perception | 2 | The ship is bigger than planets, there are no depth cues, and the stars are in the same plane as the orbits. |
| atmospheric_effects | 1 | No corona, planet atmospheres or haze. |
| gameplay_readability | 5 | The trajectory and targets are mostly legible, but labels overlap and the ship blocks targets. |
| ui_hud | 6 | Clean dark cards and clear stats; the most polished element. |
| typography | 6 | A sensible sans with good hierarchy; the in-world labels are too small and grey on desktop. |
| polish_juice | 2.5 | Delivery produces zero in-world feedback; the box detaches. |
| mobile_presentation | 2.5 | Cropped canvas, label collisions, half-screen desktop HUD, keyboard hints on touch. |
| **overall_visual_quality** | **3** | Reads as an early prototype or debug view, not a shipped showcase. |

## 3. What looks poor and why

- **No lighting model is visible.** A game about a star has a sun that lights nothing. Planets have no terminator, and Rust and Gale render pure black, which points to a missing light or ambient term on those materials.
- **Flat sprite sun.** Concentric 2D discs with no emissive bloom, corona or HDR. It looks like a UI icon.
- **Ring soup.** Several translucent cyan annuli at similar alpha overlap and flatten into a teal mass. The SOI zones, orbit paths and station rings don't read as distinct.
- **Asset style clash.** Photoreal cardboard, photoreal Earth, a voxel truck and particle-noise stations sit on flat spheres, so there is no unified art direction.
- **Scale break.** The ship-plus-box is about 3× planet diameter. It occludes the stations it is supposed to deliver to, especially in image 3, and destroys any sense of a solar system.
- **Empty void background.** A uniform teal backdrop with no skybox, starfield parallax or nebula. The canvas reads as a flat board, not space.
- **Zero post-processing or VFX.** No bloom, trails, warp effect or delivery celebration.
- **Label clutter.** Duplicate label pairs (planet plus station) stack, and the desktop greys are low-contrast.
- **Bugs.** The box detaches from the ship in image 2. On mobile, the camera framing crops the subject.
- **Mobile.** The desktop layout is simply stacked. The 3D is reduced to a cramped, label-dominated strip.

## 4. Dominant causes

| Cause | % |
|---|---|
| Game scene authoring (no sun light, ring alpha stacking, flat backdrop, no VFX or post, label strategy) | 40% |
| Weak / mismatched assets | 30% |
| Engine defaults (unlit/basic materials, no tone mapping or bloom pipeline enabled, no env map) | 15% |
| Camera / composition (scale, occlusion, mobile framing) | 12% |
| Engine rendering limits | 3% |

Nothing here is beyond what the engine should do. This is an authoring and asset problem.

## 5. Top 6 highest-leverage changes

1. **Make the sun a real light.** Add a point light at Sol with a physically lit standard material on the planets so each gets a terminator. Add an HDR emissive core, bloom and a soft corona sprite. This fixes the black planets and gives the frame a focal light source. Biggest single win.
2. **Replace the backdrop.** Use a deep-space skybox or procedural nebula with a 2–3 layer parallax starfield, and pull the scattered dots off the orbital plane. Contrast against the dark background will make the orbits pop.
3. **Re-author the orbit graphics.** Draw thin, crisp additive line orbits, and show SOI zones only as faint gradient falloff or on hover. Use distinct hues for prediction, route and SOI.
4. **Unify the art direction and rescale.** Pick one language, either stylized low-poly or clean voxel, and rebuild the planets, stations and box in it. Drop the photo cardboard. Shrink the ship to well below planet size and add an engine glow and trail. Fix the box parenting bug.
5. **Add juice.** Thruster particles and trail, a warp streak or time-dilation effect, a capture ring pulse, and a delivery burst with a camera push-in. Light ACES grading and a vignette.
6. **Labels and mobile.** De-duplicate labels (one per body, station as a subtitle) and fade unfocused ones. On mobile, make the canvas full-bleed with a collapsible bottom sheet, use touch-native controls without keyboard hints, and auto-fit the camera to the system bounds.

## 6. Verdict

**Substantial rebuild** of the visual layer. The HUD, game loop and overall layout concept can be kept. The scene lighting, materials, assets, background and VFX all need to be redone rather than tuned.

## 7. Competitive with a well-built modern three.js browser game?

**No.** Well-built three.js work at minimum ships lit PBR materials, an environment map, tone mapping, bloom, and a coherent asset style. This has none of them. The sun doesn't light the scene, two planets render black, the hero object is a mis-scaled toy with a photo box stuck on it, and the space is a flat teal board. The UI panel is the only element at professional indie level, and it can't carry a 3D showcase.

# `showcase-mech-hangar`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Aura3D Audit: `showcase-mech-hangar`

## 1) Per-image description

**desktop-1920x1080__02-opening (Hangar / build screen)**
A single mech stands on a dark circular pedestal with a cyan emissive ring. The scene sits in a near-black void made of one flat floor plane, a few thin vertical cyan emissive strips, a horizontal strip on the left, and a floating "BAY 07" text sign. The mech is a reasonably detailed grey/white robot mesh with yellow accents. It is surrounded and intersected by clusters of dark untextured cubes (the "modular parts"), plus floating cyan diamonds, rings, and slabs. One broad spotlight washes the right half of the floor into a flat grey gradient. There are no visible cast shadows beyond the dark pedestal disc, and no reflections. A right-side UI panel takes about 17% of the width and is filled with developer-facing "asset passport" text (asset IDs, "CC0-1.0", "no skeletal retargeting" disclaimers). Roughly 60% of the screen is empty dark space.

**desktop-1920x1080__03-mid (Arena)**
Two mechs face off in idle stances, each with a large dark box-cluster "backpack" that reads as primitive geometry. The floor is dark tiles with cyan emissive lines, orange dash markers, two very bright cyan side strips, and large concentric glowing rings at center. A hot white specular spot sits on the floor between the fighters. The background is a flat mid-blue wall with black rectangular slabs hanging from the ceiling, plus one soft blue glow blob at upper left. Bloom is visible on the emissives. Fighters only get a dark blob disc under them for shadowing, and the floor has no reflections. A full-width top HUD bar (about 16% of height) shows HP, Guard, and Power bars and a "REMATCH 1 – RIVAL Marksman" banner.

**desktop-1920x1080__04-action**
This frame is nearly identical to 03-mid: the same camera, the same poses with minor differences, and slightly changed power bars. There are no projectiles, muzzle flashes, impacts, sparks, trails, or camera shake. The "action" capture contains no visible action at all.

**mobile-390x844__03-mid**
The same arena is cropped into portrait. Both mechs are cut in half at the screen edges, and the center of frame is empty floor and glowing rings. The HUD panel covers about 28% of the top, and it includes keyboard hints ("A/D move – SPACE jump-thrust…") that are irrelevant on touch. The bottom touch-button row is clipped: the rightmost button runs off-screen. The floor reads washed-out grey here. Under 50% of the screen shows meaningful 3D content.

## 2) Category scores

| Category | Score | Justification |
|---|---|---|
| environment_world | 2.5 | Flat planes and black void in the hangar, a box-slab ceiling over a flat blue wall in the arena. No architecture, props, or set dressing. |
| modeling_assets | 3.5 | The base mech mesh is decent (~6), but it is buried in untextured cube clusters (~1.5) that read as placeholder. |
| texture_quality | 2.5 | Floor, walls, and boxes are flat colors with no albedo variation, wear, decals, or normal detail. Only the mech carries texture detail. |
| material_quality | 3.5 | Mech metal has some spec response. Everything else is uniform dielectric with a single roughness value. |
| pbr_credibility | 3.5 | Metals have nothing meaningful to reflect, and the floor highlight reads as a generic Blinn hotspot rather than grounded PBR. |
| lighting | 3.5 | One big spot wash plus emissives. Fighters get no key/rim separation, and lighting is flat with no motivation. |
| shadows | 2 | Blob discs only. No visible mech cast shadows or contact shadows, so the fighters float. |
| ambient_lighting | 3 | Uniform blue ambient with no AO. Box clusters and creases have no occlusion. |
| ibl_reflections | 2.5 | No visible env-map reflections on mech metal and no floor reflections, despite a glossy-floor arena aesthetic that needs them. |
| tone_mapping | 5 | Emissives roll off acceptably (ACES/AgX-like). The hangar floor gradient and mobile floor look washed. |
| color_management | 5 | sRGB output looks correct. The palette is coherent but monotone cyan-on-navy. |
| anti_aliasing | 5 | Edges look acceptably smooth at capture. Thin emissive lines show some shimmer risk (inferred). |
| postprocessing | 4 | Bloom only. No SSAO, SSR, DOF, vignette, grading, or chromatic/film treatment. |
| vfx | 1.5 | Glowing rings and floating diamonds only. The action shot has zero combat VFX. |
| particles | 1 | None visible: no sparks, dust, embers, or thruster exhaust. |
| animation_quality | 3 (inferred) | Stiff identical idle poses with negligible pose delta between "mid" and "action". |
| character_presentation | 3.5 | The mech is small in frame, cluttered by boxes, and has no rim light. The hangar showcase undersells the hero asset. |
| camera | 3.5 | Static, high, distant, symmetric. No fighting-game dynamism (low angle, push-in, shake). |
| composition | 3.5 | Hangar is about 60% dead space. Arena centers on empty floor rings instead of the fighters. |
| scale_depth_perception | 3 | No reference props, haze, or falloff, so mechs could be 2 m or 20 m. The background wall is flat. |
| atmospheric_effects | 1.5 | No fog, volumetrics, dust motes, or light shafts. |
| gameplay_readability | 5 | Blue vs. pink team rings and clear bars help. Mechs blend into the dark backdrop. |
| ui_hud | 4.5 | Clean bars, but the hangar panel is a debug/provenance dump, and the HUD has no hierarchy or game feel. |
| typography | 4.5 | Monospace dev type throughout, small and low-contrast in the hangar. Functional, not designed. |
| polish_juice | 2 | No hit feedback, transitions, or motion cues. The action frame equals the idle frame. |
| mobile_presentation | 1.5 | Both fighters cropped off-screen, HUD eats 28%, keyboard hints on touch, clipped buttons. |
| overall_visual_quality | 3.5 | One decent mech mesh dropped into a primitive scene with placeholder parts and no combat feedback. |

## 3) What looks poor and why

- **Primitive box clusters on the mechs.** The "modular" chassis and arm parts are untextured cubes intersecting a good mech model. This is the single most damaging element: it reads as placeholder and actively makes the good asset look worse.
- **Debug UI in production.** "Asset passport" text with asset keys, license strings, and "no skeletal retargeting or reusable combat-kit claim" is internal provenance metadata, not player UI.
- **Empty, unauthored environments.** The hangar is a floor plane in a void. The arena is a flat blue wall with black slabs. There are no gantries, cranes, cables, crates, signage, or decals.
- **No grounding.** There are no cast or contact shadows and no AO, so mechs float on blob discs.
- **No reflections.** Metal mechs and a sci-fi glossy floor with nothing to reflect look like plastic.
- **No action.** The action capture has no projectiles, hits, sparks, or shake. Either combat VFX don't exist or they are so faint they never register.
- **Weak exposure and lighting.** The spot wash flattens the hangar floor to grey, the emissive strips are blown to near-white and dominate the frame, and the fighters themselves are underlit with no rim separation from the dark backdrop.
- **Camera and framing.** The high, distant, static camera centers on floor rings while the fighters sit at frame thirds at about 35% height.
- **Broken mobile.** The fixed horizontal FOV crops the fighters, and the layout was clearly never designed for portrait.

## 4) Dominant causes

| Cause | % | Notes |
|---|---|---|
| Game scene authoring | 35% | Empty sets, no dressing, no lighting design, debug UI shipped |
| Weak assets | 30% | Primitive part clusters, untextured floor and walls, no VFX assets |
| Camera/composition (incl. mobile) | 15% | Static distant camera, dead space, portrait cropping |
| Engine defaults | 15% | No shadows, AO, env map, or SSR enabled; bloom-only post |
| Engine rendering limits | 5% | Nothing here looks beyond three.js-class capability. Bloom and tone mapping work. |

## 5) Top 6 highest-leverage changes

1. **Replace the cube-cluster parts with authored meshes** that socket onto the base mech, or hide them and use material and part swaps on the existing model. This alone moves character presentation from about 3.5 to 6.
2. **Turn on grounding and reflections.** Add shadow-mapped key light with PCF/VSM soft shadows, contact shadows under feet, SSAO/GTAO, and an HDRI or PMREM env map so metal reads as metal. Add SSR or a reflector plane on the arena floor.
3. **Author the sets.** For the hangar: gantries, lift arms, cables, tool carts, hazard decals, and a back wall with depth. For the arena: tiered structure, crowd or monitor screens, and parallax background layers. Use PBR floor textures (normal, roughness, grime) instead of flat navy, and add light volumetric haze for depth.
4. **Build combat VFX and juice.** Add muzzle flashes, tracers or beams, impact sparks and decals, hit-flash on the mech material, thruster exhaust particles, hit-stop, camera shake, and damage numbers. The action screenshot must look different from idle.
5. **Redesign the camera.** Use a lower, tighter fighting-game camera that dynamically frames both fighters (distance-based zoom, slight dolly). For the hangar, use a 3/4 hero shot with turntable and rim light, with the mech filling about 60% of frame height.
6. **Overhaul the UI and mobile layout.** Delete the asset passport. Restyle the HUD with a display typeface, hierarchy, and angled panels. On mobile, adapt FOV to aspect so both fighters stay in frame (or force landscape), collapse the HUD to a slim top strip, remove keyboard hints, and fit the touch controls within the safe area.

## 6) Verdict

**Substantial rebuild.** The renderer basics are fine (tone mapping, bloom, color pipeline), and the base mech mesh is salvageable. The environments, modular part assets, VFX, camera, UI, and mobile layout all need to be rebuilt, not polished. Tuning parameters will not fix primitive cubes, empty sets, and missing combat feedback.

## 7) Competitive with a well-built modern three.js browser game?

**No.** Good modern three.js work (shipped WebGL/WebGPU showcases and polished browser games) delivers grounded shadows, IBL reflections, authored environments, readable combat VFX, and responsive layouts. This build shows one decent asset surrounded by placeholder primitives in a void, with shipped debug UI, no visible combat effects, and a broken portrait presentation. It reads as an internal tech prototype at roughly 3.5/10, well short of the ~7 needed to sit with solid indie browser work.

# `showcase-neon-swarm`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Aura3D Showcase Audit: `showcase-neon-swarm`

## 1. Per-image description

### desktop-1920x1080__02-opening
- A steep top-down camera looks at a dark, untextured arena made of large flat planes in near-black, maroon, and desaturated teal. There is no sky; the frame is entirely floor geometry.
- The player is centered: a dark-blue humanoid silhouette in a static arms-out pose, with small emissive cubes on its head and a pink arrow at its feet. It stands on a strongly bloomed white emissive ring.
- Scattered around are flat black ellipses with no shading. They read as voids, failed materials, or blob shadows, and it isn't clear which. A single photoscanned orange/white construction barricade sits top-center, the only textured object, and it clashes completely with the "neon" theme.
- A few cyan emissive bars sit at the frame edges. The HUD consists of a top-left stat panel, a top-right "RUN STATUS" pill, a bottom control-hint strip, and a bottom-right BURST button. The scene is about 92% 3D, but roughly 50% of the screen is near-black with no information.

### desktop-1920x1080__03-mid
- The same camera framing and the identical player pose appear again. A large teal/purple ring-and-spoke floor decal sits top-left.
- The floor shows a hard elevation step: a dark upper plane against a flat teal lower plane, with no AO, bevel, or edge light at the seam.
- Three to four small pale-green low-poly hexagons float around. They are presumably drones or pickups, but they are indistinguishable from each other.
- Three barricades appear (two top-right, one tipped bottom-left), along with five or more black ellipses. The barricades cast no visible contact shadows. Faint magenta and blue radial light pools are on the floor, and there are no particles or atmosphere. The HUD is unchanged and reads "Drones out 36", yet nothing on screen clearly reads as 36 enemies.

### desktop-1920x1080__04-action
- Score is 30 and Burst is 7%, but there is no visible combat VFX: no projectiles, hit flashes, trails, or debris.
- More green hexagons appear, along with cyan neon bars at the top and middle, the ring decal at left, a barricade pair at right, and one at the bottom-left cropped by the frame edge.
- The player pose is pixel-identical to the previous two frames, which strongly suggests a bind/static pose. The black ellipses continue to dominate the lower right.
- Lighting is uniformly dim with no key light direction. Bloom is limited to the ring and bars.

### mobile-390x844__03-mid
- The portrait crop puts the HUD panel over the top ~25% and twin virtual joysticks (translucent teal bases with magenta thumbs) over the bottom ~20%. The BURST button sits mid-right.
- About 55% of the screen is usable 3D view, containing the player, half a cropped barricade, one big black ellipse, and a green shard.
- The 3D world is even emptier and darker at this scale, and the player silhouette reads poorly against the dark floor.
- The HUD scales legibly, but the panel is oversized for the information it carries.

## 2. Category scores

| Category | Score | Justification |
|---|---|---|
| environment_world | 2 | Flat untextured planes, one decal, no set dressing, sky, walls, or architecture. Reads as a greybox. |
| modeling_assets | 3 | Barricade is a decent stock scan. Everything else is quads, hexagons, and ellipses. |
| texture_quality | 3 | Only the barricade has textures (good, but off-theme). The floor and all other surfaces have none. |
| material_quality | 3 | Floor is matte flat color, enemies are flat-shaded, and black blobs look like missing materials. |
| pbr_credibility | 3 | Barricade responds plausibly. Nothing else shows roughness or metal variation, and there is no specular on the floor. |
| lighting | 3 | Dim ambient plus a couple of colored point pools. No key/rim and no light shaping the player. |
| shadows | 2 | No visible cast/contact shadows on barricades or player. Black ellipses may be blob shadows, but they are opaque and unreadable. |
| ambient_lighting | 2 | No AO at plane seams or under props. Objects float. |
| ibl_reflections | 1 | No reflections on what should be a glossy neon floor, and no visible environment map contribution. |
| tone_mapping | 4 | No clipping except bloom cores, but blacks are crushed and the midrange is murky. |
| color_management | 4 | Palette intent (cyan/magenta) is there. Teal planes look washed and the barricade orange fights the palette. |
| anti_aliasing | 5 | Edges acceptably clean at 1080p. Thin barricade legs show mild stepping (inferred, JPEG). |
| postprocessing | 4 | Bloom on emissives is tasteful but the only effect visible. No vignette, grading, chromatic aberration, or scanline treatment for a neon theme. |
| vfx | 2 | Ring glow and arrow only. No combat VFX despite score changes. |
| particles | 1 | None visible in any frame (inferred absent). |
| animation_quality | 2 | Identical static T-ish pose across three gameplay captures (inferred no locomotion/idle). |
| character_presentation | 3 | Silhouette shape is OK, but it is dark-on-dark, unlit, and has no rim, trail, or personality. |
| camera | 4 | Readable top-down angle for a twin-stick game, but too close/tight, and props get cropped awkwardly at frame edges. |
| composition | 3 | Large dead black regions, random prop placement, no framing of the play space or arena boundaries. |
| scale_depth_perception | 2 | Only the barricade conveys scale. Floor height steps are ambiguous and there are no depth cues. |
| atmospheric_effects | 2 | Faint colored floor pools. No fog, haze, volumetrics, or dust. |
| gameplay_readability | 2 | Enemies, hazards, and pickups are not distinguishable. "36 drones" with nothing clearly hostile on screen. |
| ui_hud | 5 | Clean, consistent glass panels and legible, but generic dev-dashboard styling and text-heavy. |
| typography | 5 | Neat system sans with a good hierarchy. No display face or theme identity. |
| polish_juice | 2 | No hit feedback, trails, screen shake cues, or reactive lighting visible. |
| mobile_presentation | 3 | Functional joysticks, but the HUD eats the top quarter and the 3D view is cramped and dark. |
| overall_visual_quality | 2.5 | Reads as an early prototype/greybox with one marketplace prop dropped in. |

## 3. What looks poor and why

- **Black ellipses dominate every frame.** They are pure black with no shading and no alpha falloff. They are either blob shadows authored at 100% opacity, drones with broken or unlit materials, or pits with no edge treatment. In all three cases they read as rendering errors.
- **The enemy/pickup identity is unreadable.** Pale green hexagons are tiny, flat-shaded, and non-emissive in a neon game, so the swarm doesn't read as a swarm.
- **Asset style clash.** A gritty photoscanned road barricade is the hero prop in a "neon containment grid." It breaks the art direction harder than anything else on screen.
- **The floor is a void.** There is no grid, no emissive trim lines, no gloss/reflection, and no texture. A neon arena lives or dies on a reflective floor with emissive line work, and this one has neither.
- **The player is dark-on-dark.** A dark navy body on a near-black floor, with no rim light or fresnel emissive, is only legible because of the ring under it.
- **The pose is static.** It is identical across opening, mid, and action frames, so the character looks like a placed mannequin.
- **Exposure is murky.** Crushed blacks occupy about half the frame and the teal planes are flat and washed. There is no deliberate value structure.
- **Geometry seams are hard.** The elevated-plane edges have no bevel, AO, or edge light, so depth reads as overlapping colored paper.
- **Action has no VFX.** Score rises with nothing visible happening.
- **Composition is empty.** The arena has no bounds, landmarks, or focal structure, and props are cropped at the frame edges.
- **Mobile layout.** The HUD panel is oversized for the information it carries, and the joysticks plus HUD leave a small, dark gameplay window.

## 4. Dominant causes

| Cause | Share | Notes |
|---|---|---|
| Game scene authoring | 35% | Dead floor, random props, black blobs, no lighting design, no VFX hookup. |
| Weak / mismatched assets | 30% | Placeholder enemies, off-theme barricades, unanimated character. |
| Camera / composition | 15% | Tight framing, dead space, edge cropping, mobile layout. |
| Engine defaults | 12% | No AO/shadows/reflections enabled by default, plain bloom only, and a default-feeling tone curve. |
| Engine rendering limits | 8% | Nothing here suggests a hard ceiling. The barricade and bloom show the renderer can do better. |

## 5. Top 6 highest-leverage changes

1. **Build a proper neon floor.** Use a glossy dark floor (roughness 0.15–0.3) with screen-space or planar reflections, plus an emissive grid or trim lines and arena boundary walls with light strips. This alone fixes the void, depth, and theme.
2. **Replace enemies and remove the black blobs.** Give drones emissive cores and a distinct hostile color (hot magenta/red against the cyan player), with a hover bob and soft alpha contact shadows. Make pickups a separate shape and color.
3. **Replace the barricades.** Swap them for on-theme sci-fi barriers or emitter pylons with emissive edges, or retexture the barricades as neon holo-barriers.
4. **Light and animate the player.** Add a fresnel/rim emissive and a cyan point light that travels with the player. Add idle, run, and aim animations, plus a dash trail.
5. **Add combat juice.** Use GPU particles for shots, hits, and deaths, plus burst shockwave rings, a short hit-stop and screen shake, and emissive flash on damage.
6. **Grade and re-frame.** Lift the shadows slightly and apply an ACES/AgX curve with a cool-shadow/magenta-highlight grade and a mild vignette. Add light ground fog or haze for depth. Pull the camera back about 20%. On mobile, collapse the HUD to a compact strip and make the joysticks smaller and lower-opacity.

## 6. Verdict

**Substantial-rebuild.** The engine and bloom pipeline are usable and the HUD skeleton can stay. The arena, enemy and prop assets, lighting rig, VFX, and character animation need to be redone, which is more than polish.

## 7. Competitive with a well-built modern three.js browser game?

**No.** Current three.js neon arena shooters routinely ship reflective emissive floors, readable glowing enemies, particle-heavy combat, and animated characters. This build shows none of those. Its strongest visual element is a stock construction barricade that contradicts the theme, and the screen is dominated by black shapes that read as bugs. As a showcase it undersells the engine rather than demonstrating it.

# `showcase-orbital-defense`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Visual Audit: showcase-orbital-defense (production capture)

## 1) Per-image description

**desktop-1920x1080__02-opening**
A mint-teal sphere sits dead center on a flat, near-black background with no stars, nebula, or gradient. A flat lavender ring disk with an inner cyan band cuts through it, and the sphere carries a soft white highlight blob near the top. A grey box hovers above the planet and a dark green box sits at the ring's right tip. Three salmon-pink flattened ellipsoids (drones) and a tiny cyan dot (projectile) float in the void. One drone shows faintly through the top-left HUD card, and a projectile is clipped by the bottom status bar. There are no shadows, reflections, glow, or particles. 3D content fills roughly 15% of the frame. The rest is black void plus three UI panels: score/wave/integrity/heat, a "SYSTEMS" dev feature list, and a status bar with a checksum.

**desktop-1920x1080__03-mid**
This frame is pixel-identical to the opening apart from drone positions and HUD numbers (score 589, wave 2, heat 98%). The camera, planet, ring, and both boxes have not changed at all. Drones overlap the top-left HUD card and the top screen edge. Nothing signals that a wave escalated or that the heat is nearly at max.

**desktop-1920x1080__04-action**
Labelled "action", but visually it is the same as the other two: three pink blobs, no projectiles visible, no impacts, explosions, or trails. The interceptor count reads 0. A drone is clipped behind the top-left HUD panel. The screen is mostly empty black.

**mobile-390x844__03-mid**
Three stacked translucent HUD cards cover the top ~65% of the screen. The planet and ring render *behind* them, so the planet is half-occluded and smeared through panel backgrounds, and the grey box shows through the Integrity card. The ring runs off both screen edges. The bottom ~35% is empty black with a single pink drone. No touch controls are visible, and the only instructions are the keyboard ones ("A/D or arrows").

## 2) Category scores

| Category | Score | Justification |
|---|---|---|
| environment_world | 1 | Solid near-black clear color. No starfield, skybox, nebula, or distant bodies. |
| modeling_assets | 1 | Low-segment UV sphere with a visibly faceted silhouette, a flat disk ring, two untextured boxes, and squashed spheres for enemies. |
| texture_quality | 0.5 | No textures anywhere. Every surface is a single flat color. |
| material_quality | 1.5 | Uniform matte/unlit-looking materials. The only variation is one blurry specular blob on the planet. |
| pbr_credibility | 1 | Nothing reads as metal, rock, gas, or ice. There's no roughness variation and no Fresnel. |
| lighting | 1.5 | No visible terminator or day/night side. The planet is almost uniformly lit, so the sun direction is unreadable. |
| shadows | 0 | None: no planet shadow on the ring, no ring shadow on the planet, no self-shadowing. |
| ambient_lighting | 1.5 | Flat high ambient washes the planet to a pastel. No occlusion or hemisphere tint. |
| ibl_reflections | 0 | No environment map and no reflections. |
| tone_mapping | 2.5 | Pastels sit in a narrow mid range. No HDR highlights, and the planet looks washed rather than exposed. |
| color_management | 3.5 | The mint/lavender/salmon palette is coherent but low-contrast and toy-like. It doesn't read as space. |
| anti_aliasing | 4 | Edges are acceptable at 1080p, but the sphere faceting and thin ring edges show stair-stepping. |
| postprocessing | 0.5 | No bloom, vignette, grading, or chromatic/film treatment. |
| vfx | 0.5 | No muzzle flash, hit, explosion, shield, or trail is visible in any frame, including "action". |
| particles | 0 | None. |
| animation_quality | 1 (inferred) | Static camera and static planet/ring across frames. Only drone positions change. No rotation, bob, or banking cues. |
| character_presentation | 1 | The player defense is a grey or green box. The player can't easily tell which object they control. |
| camera | 2 | Locked, flat, straight-on orthographic-feeling view with a lot of dead space. No motion, shake, or framing response. |
| composition | 2 | A small centered subject in a black void, HUD hugging the corners, and action clipping under panels. |
| scale_depth_perception | 1 | No parallax, fog, size cues, or lighting falloff. It reads as a 2D diagram. |
| atmospheric_effects | 0 | No planetary atmosphere rim, glow, haze, or space dust. |
| gameplay_readability | 4 | Pink-on-black enemies are easy to spot, but the player turret, firing arc, threat direction, and shield state are not communicated. Entities hide under the HUD. |
| ui_hud | 4 | Clean card layout and a decent heat gradient bar. However, the "SYSTEMS" panel and checksum are developer/marketing text, and panels occlude the playfield. |
| typography | 5 | Competent sans-serif with a clear hierarchy. Generic, with no game identity. |
| polish_juice | 0.5 | No feedback for score, damage, or 98% heat. Frames are interchangeable. |
| mobile_presentation | 1 | HUD covers two-thirds of the screen, the planet renders behind panels, there are no touch controls, and the layout is effectively unplayable. |
| **overall_visual_quality** | **1.5** | Placeholder primitives on a clear color with debug UI. Below early-2000s tech-demo level. |

## 3) What looks poor and why

- **Primitives as final art.** Sphere, disk, boxes, and ellipsoids with zero detail. The planet silhouette is visibly polygonal at 1080p because the segment count is too low.
- **Flat colors, no textures.** No albedo, normal, cloud, or ring-band maps. The pastel fills make it look like a UI mockup rather than a space scene.
- **No lighting story.** No sun direction, terminator, rim light, or shadow interplay between planet and ring. That interplay is the single most iconic ringed-planet visual, and it's missing.
- **Void background.** A pure clear color gives no depth, scale, or mood. Space scenes rely almost entirely on the backdrop for atmosphere.
- **No VFX at all.** A shooter where firing, hits, destruction, and shields leave no visual trace. Even the "action" capture shows nothing happening.
- **Tiny subject, empty frame.** The playfield occupies the middle ~35% of width. Roughly 80% of pixels are black or UI.
- **Debug and marketing UI shipped.** "one mounted Aura app", "runtime player/enemy/projectile nodes", and "Checksum: 3486416317" are engine-feature bullet points, not player-facing HUD.
- **HUD/world collision.** Drones and projectiles render under panels. On mobile the whole planet sits behind translucent cards.
- **Static presentation.** Identical camera and object state across frames. No rotation, parallax, or camera response.

## 4) Dominant causes

| Cause | % | Notes |
|---|---|---|
| Weak assets | 35% | Everything is a placeholder primitive with a flat color. |
| Game scene authoring | 25% | No lights, environment, VFX, or post. No HUD/world layering discipline. Debug UI left in. |
| Engine defaults | 20% | Looks like default material, clear color, no tone mapping or IBL, low sphere tessellation. |
| Camera/composition | 15% | Locked flat camera, tiny subject, broken mobile layout. |
| Engine rendering limits | 5% | Nothing on screen tests the renderer. I can't tell from stills whether Aura3D supports shadows, IBL, or bloom. If it doesn't, this share rises sharply. |

## 5) Top 6 highest-leverage changes

1. **Space backdrop and IBL.** Add an HDR starfield/nebula skybox (cubemap or procedural) and reuse it as the environment map. That gives the scene depth and color, and gives every material something to reflect.
2. **Hero planet rebuild.** Use a high-tessellation sphere (or normal-mapped sphere) with albedo, normal, and cloud layers. Add a Fresnel atmosphere rim shader and a strong directional sun with a visible terminator. Rebuild the ring as an alpha-textured band disk with planet-to-ring shadowing. That alone moves the scene from 1.5 to around 4.
3. **Real player and enemy assets.** Use a modeled orbital turret that clearly reads as "you", with an aim indicator and arc. Make drones metallic/emissive models with engine glow and distinct silhouettes per type.
4. **VFX and post.** Add HDR emissives with bloom, projectile trails, impact sparks, explosion particles, a shield bubble shader, heat-driven turret glow and overheat steam, ACES tone mapping, and MSAA or FXAA.
5. **Camera and composition.** Frame the orbit to fill around 70% of screen height, tilt about 15–25° to show the ring in perspective, add slow planet rotation and starfield parallax, and add shake and impulse on hits.
6. **HUD rework.** Delete the SYSTEMS panel and checksum from production. Collapse stats into a slim top bar. Never render panels over the playfield. On mobile, use a compact overlay plus on-screen rotate, fire, and shield buttons, and make the canvas own the full viewport.

## 6) Verdict

**Full-rebuild of the visual layer.** No asset, material, lighting setup, or layout is worth keeping as-is. Gameplay logic (deterministic waves, heat/shield economy, input/replay) is likely salvageable and should be preserved.

## 7) Competitive with a well-built modern three.js browser game?

**No.** A competent three.js space shooter ships with a skybox, PBR textured planet with atmosphere, bloom, particles, and a game-styled HUD as baseline. This build shows none of those. It reads as an engine integration test with a dev panel, and as an Aura3D showcase it currently argues *against* the engine's capabilities.

# `showcase-patrol-wing`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Aura3D Showcase Audit: `showcase-patrol-wing`

Headline: one good hero asset (the orange prop plane) sits inside an almost empty world. Two of the three desktop frames and the mobile frame are a plane floating in a flat navy void with no ground, horizon, sky gradient, or reference geometry. The only frame with a world shows untextured faceted terrain, a floating slab runway, and no shadows. The plane and HUD are professional. The world, sky, lighting, and camera are not. Overall: 3/10.

---

## 1. Per-image description

**desktop-1920x1080__02-opening.jpg**
- An orange and yellow low-wing single-prop plane sits on a dark, untextured asphalt slab runway, framed from a low chase camera behind it.
- The runway is an extruded box. Its dark side face and a hard black wedge below it show it floating above the terrain. The terrain is flat-shaded green with large visible facets, a few cone trees, and three orange low-poly rocks. A dark navy bar juts out of the hillside at right for no visible reason.
- Two cyan emissive strips flank the runway, green-capped bollards line the foreground, and white dash "wind streaks" float over the grass like debris. A huge yellow glowing ring with a blown-out white square inside dominates the top right and is clipped by the HUD panel.
- The sky is a single flat navy color. There is no visible sun shadow from the plane and no reflections. The HUD panel takes about 16% of screen width, and the 3D view about 80%.

**desktop-1920x1080__03-mid.jpg**
- A close camera shows the plane in a steep bank. The livery stripes, cockpit glazing, and propeller blades read well, with mild specular on the fuselage.
- There is no terrain, horizon, or sky gradient, just a flat navy fill across the whole 3D area. White and tan line segments (speed or wind streaks) and four floating glowing sprites (orange, white-cyan, pink diamond, cyan capsule) are the only other content. Their purpose is not readable.
- There are no shadows or environment reflections. Throttle reads 7%. The HUD is unchanged.

**desktop-1920x1080__04-action.jpg**
- The plane is alone, mid-screen and small, banked against flat navy. Nothing else is in the 3D view: no streaks, rings, drones, or ground.
- Throttle reads 0%, Drones 0, Accuracy 0%. The "action" frame contains zero action.
- About 95% of the 3D viewport is a single uniform color.

**mobile-390x844__03-mid.jpg**
- Portrait layout. The 3D viewport takes the top ~77% and a rounded-corner button grid takes the bottom ~23%.
- The plane is nose-up and vertical with speed streaks and three glow sprites, against the same flat navy void.
- There are 11 text buttons (Fire, Throttle, Camera, Reset, Pause, Pitch±, Roll L/R, Yaw L/R) and no joystick or analog control. The stats, throttle, and hull HUD from desktop is absent entirely. Only the "FLY RING 1 OF 6" pill remains.

---

## 2. Scores (0–10)

| Category | Score | Justification |
|---|---|---|
| environment_world | 2 | Faceted flat-green hill, floating slab runway, 3 rocks, a few cone trees. Two of three frames have no world at all. |
| modeling_assets | 4 | The plane is a credible, detailed GLB (~7). Everything else is primitive boxes, cones, and capsules (~2). |
| texture_quality | 3 | The plane livery is fine. Terrain, runway, and rocks are untextured flat albedo. |
| material_quality | 4 | Plane paint has plausible gloss and a separate canopy material. The world is single-color lambert-looking surfaces. |
| pbr_credibility | 3 | Nothing in the world reads as a real material. With no environment, even the plane's metal and glass have nothing to reflect. |
| lighting | 3 | A single key light and a generic ambient. No "evening" mood despite the brief. No rim or sun direction readable in the void shots. |
| shadows | 2 | No visible plane shadow on the runway. The only dark shape is the runway slab's underside. No terrain self-shadowing. |
| ambient_lighting | 3 | Flat uniform fill. No AO or sky/ground hemisphere tint visible. |
| ibl_reflections | 1 | Canopy and fuselage show no environment reflection. Glass reads as flat dark teal. |
| tone_mapping | 4 | No crushing, but highlights clip hard (white square in the ring) and the overall image is low-contrast and flat. |
| color_management | 5 | Colors are coherent (orange hero on blue is good complementary contrast) and sRGB looks correct. The palette is just thin. |
| anti_aliasing | 5 | Edges are mostly clean at 1080p. Thin streak lines and bollards shimmer-prone (inferred). |
| postprocessing | 3 | Emissive bloom on strips and sprites only. No grading, vignette, DOF, or motion blur. Bloom on the ring blows out. |
| vfx | 2 | Line-segment speed streaks and glow dots. No muzzle, contrail, wingtip vortex, or prop disc. |
| particles | 2 | Static-looking discrete dashes and sprites. No visible particle systems. |
| animation_quality | 4 (inferred) | Bank poses look physically plausible. The prop is rendered as crisp blades with no motion blur or disc, so it reads as frozen. |
| character_presentation | 6 | The plane is the clear hero, well lit enough, and attractive. It is the best thing on screen. |
| camera | 3 | The chase cam loses the ground and horizon entirely in 2 of 3 frames. Distance changes a lot (very close in mid, far in action). |
| composition | 2 | A subject floating in a void. The opening frame is cluttered with a giant clipped ring top-right and random streaks over grass. |
| scale_depth_perception | 1 | With no horizon, fog, ground, or parallax, altitude, speed, and orientation are unreadable. |
| atmospheric_effects | 1 | No fog, haze, clouds, aerial perspective, or sunset sky. |
| gameplay_readability | 3 | The objective pill is clear, but the ring target is not visible in mid/action and there is no direction indicator. Sprite meaning (drones? sensors?) is unclear. |
| ui_hud | 6 | A clean, consistent dark glass panel with good hierarchy. It reads as a dev control panel, though, and is not diegetic or flight-like. |
| typography | 6 | Legible sans with tidy micro-labels. Generic web-app styling, and debug lines ("Backend rapier", "Flight mode authored") are shipped. |
| polish_juice | 3 | No feedback effects. Debug metadata is visible, and the "action" frame shows no engagement. |
| mobile_presentation | 3 | Readable layout, but 11 discrete text buttons for a flight game, no HUD stats, and the same empty void. |
| overall_visual_quality | 3 | A good plane in an empty, unlit, unatmospheric scene. Reads as an early prototype. |

---

## 3. What looks poor and why

- **Empty void sky.** A flat single-color clear color with no sky dome, gradient, sun disc, clouds, or HDRI. This is the dominant failure: it erases horizon, scale, speed, and mood. The brief says "evening patrol" and nothing on screen says evening.
- **No world beyond the takeoff area.** Once airborne the camera sees nothing. The island is either tiny, too low, or culled, and there is no ocean plane to fill the lower hemisphere.
- **Primitive, faceted terrain.** Visible large triangles, flat green, no texture splat, no normal detail, no grass or color variation. Rocks and trees are placeholder primitives.
- **Floating runway slab.** A box sitting on a slope with exposed side faces and a black underside wedge. It is not embedded or graded into the terrain.
- **No shadows.** The plane casts nothing on the runway, which kills grounding in the only frame where it would matter.
- **No IBL.** The canopy glass and painted metal have nothing to reflect, so a good PBR asset looks semi-matte and CG.
- **Blown-out, clipped ring/sun element.** The hottest pixel in the opening frame is a white square inside a yellow ring, half hidden behind the HUD panel. It reads as an artifact, not a gate.
- **Ambiguous floating sprites.** Glowing dots and capsules with no silhouette, trail, or label. They could be drones, waypoints, or debug gizmos.
- **Speed streaks as debris.** White dashes lying over the grass in the opening frame look like misplaced geometry rather than air motion.
- **Camera.** Framing drifts so the subject floats with no reference, and the zoom inconsistency shrinks the hero in the "action" frame.
- **Debug UI shipped.** "Backend rapier / Flight mode authored / Sensors 1 · Ghost recorded" and the 11-button control grid read as a test harness.
- **Capture shows no gameplay.** Throttle decays from 100% to 0% with zero drones or rings, so the showcase capture never reaches the game's actual content. This is a capture/autopilot authoring problem as much as an art one.

---

## 4. Dominant causes

| Cause | % | Notes |
|---|---|---|
| Game scene authoring | 45% | No sky, no ocean or horizon, tiny island, untextured terrain, floating runway, unreadable gameplay objects, debug text shipped. |
| Camera / composition (incl. capture choreography) | 25% | Camera loses all reference, inconsistent distance, no gameplay in frame, clipped ring. |
| Engine defaults | 15% | Shadows apparently off or not reaching, no default environment map/IBL, flat ambient, no fog default, bloom threshold blowing out. |
| Weak assets | 12% | World props and terrain are primitives. The hero asset is fine. |
| Engine rendering limits | 3% | Nothing here suggests a hard limit. The PBR plane renders correctly. |

---

## 5. Top 6 highest-leverage changes

1. **Sky plus IBL in one move.** Add an evening/sunset HDRI or a procedural sky (warm horizon to deep blue zenith, visible low sun), and use it as the scene environment map. This fixes the void, gives the plane real reflections on canopy and paint, and delivers the "evening" brief. It is the largest single gain.
2. **World to the horizon.** Add an ocean plane with a water shader (Fresnel, sky reflection, normal-mapped waves) extending to the horizon, exponential height fog, and distant islands or cloud banks. Speed and altitude become readable instantly.
3. **Re-author the island.** Use a heightmap terrain with smooth normals and a texture splat (grass, rock, sand), an embedded runway with markings texture and a grass verge, real rock and tree assets, and scattered instanced grass or shrubs near the strip.
4. **Directional sun shadows plus grounding.** Enable cascaded or fitted shadow maps on the plane and terrain, add a contact/blob shadow under the aircraft, and add SSAO or baked AO on terrain.
5. **Camera and gameplay framing.** Use a chase cam with a fixed offset, horizon-preserving roll damping, and look-ahead toward the active ring. Add an off-screen arrow or marker for the next ring and give drones real silhouettes. Fix the capture script so frames show rings being threaded and drones engaged, with throttle held.
6. **Juice pass plus HUD cleanup.**
   - Prop disc/motion-blur shader, wingtip contrails, and engine exhaust particles.
   - Properly authored ring gates (torus with emissive edge, not a blown sprite) with a controlled bloom threshold.
   - Remove debug lines and collapse the right panel to a compact flight HUD.
   - On mobile, replace the 6 pitch/roll/yaw buttons with a virtual stick or tilt, and restore throttle and hull gauges.

---

## 6. Verdict

**Substantial rebuild** of the environment, lighting, and camera layer. Keep the plane asset, HUD framework, and gameplay code. This is not save-through-polish: there is effectively no world or sky to polish, and most of the screen in 3 of 4 frames is a single color. It is not a full rebuild either, because the rendering path handles PBR correctly and the hero asset is good.

---

## 7. Competitive with a well-built modern three.js browser game?

**No.** Comparable shipped three.js flight and arcade titles have a sky and ocean to the horizon, IBL-lit aircraft, shadows, fog, and particle feedback as baseline. Here the hero plane is the only element at a modern standard. It sits in a flat navy void with primitive terrain, no shadows or reflections, and no visible gameplay in the captures. A player would read it as a prototype or tech test, not a showcase.

# `showcase-pulse-tunnel`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Aura3D Showcase Audit: `showcase-pulse-tunnel`

## 1. Per-image description

**desktop-1920x1080__02-opening.jpg**
This is a neon synthwave corridor built from flat unlit boxes. Cyan, magenta, yellow and purple rectangular arches recede toward a vanishing point over a black floor, flanked by a translucent blue left wall and a translucent magenta right wall, with thin vertical cyan "pillar" lines and a few floating colored squares (pickups). The player vehicle is a near-black glossy drone/hovercraft seen from directly behind. It has two white "minus-sign" discs and a white half-disc underbelly, and it fills about 45% of the frame width, hiding the entire lane ahead.
- There is no sky (flat dark purple void), no shadows, no visible bloom on any neon, and no fog.
- A semi-transparent blue vertical column plus two cyan lines run the full screen height through the center, crossing the HUD region. This looks like a lane/track plane or debug guide that is not depth-clipped.
- The HUD is a top glass bar (life orbs, score 18, style meter x1.0, section "intro", distance 178 m, Restart) with arrow buttons top-left and Jump/Slide top-right. The 3D view uses about 90% of the screen.

**desktop-1920x1080__03-mid.jpg**
The scene and framing are identical to the opening, but the vehicle is mid-jump and pinned to the top-center, clipping into the HUD zone. With the vehicle out of the way, the track ahead finally shows: a staircase of neon bars, a dark floating slab platform, and a handful of tiny particle dots. Lives are down to 1, score is 142, and distance is 1421 m, yet the section still reads "intro" and the environment is unchanged from 178 m. Lighting, shadows and atmosphere are the same: none beyond emissive-colored geometry.

**desktop-1920x1080__04-action.jpg**
This frame is effectively a duplicate of the opening shot at 1488 m. The only difference is a pink/red obstacle barely peeking out from behind the vehicle's body, which is the sole hint of an "action" moment. The camera, vehicle pose, corridor and pickups are pixel-for-pixel near identical. That tells the player nothing about speed or progression. The same full-height center column artifact is present.

**mobile-390x844__03-mid.jpg**
The layout is broken. The 3D canvas renders in only the top ~25% of the viewport, and the HUD panel plus a row of four large buttons (◀ ▶ Jump Slide) overlay nearly all of that canvas. The bottom ~75% of the screen is empty dark navy. The vehicle is reduced to a faint ghosted silhouette behind the HUD glass, and only a sliver of track is visible. Effectively 5–10% of the screen shows readable 3D.

## 2. Category scores

| Category | Score | Justification |
|---|---|---|
| environment_world | 3 | A single repeating corridor of flat boxes and planes in a void; no landmarks, no variation over 1.4 km. |
| modeling_assets | 3 | Track is pure primitives. The vehicle is a kitbash of spheres and boxes with an odd "minus-sign" disc face that reads as a toy or robot face, not a craft. |
| texture_quality | 1 | No textures visible anywhere; every surface is a flat color or a gradient. |
| material_quality | 3 | The vehicle has a glossy dark clearcoat with some specular highlights. Everything else is unlit emissive or basic transparent material. |
| pbr_credibility | 3 | Only the vehicle shows PBR response. The floor and walls show no roughness or metal variation, and the neon has no physically plausible energy. |
| lighting | 3 | No light from the neon falls on the floor, walls or vehicle. The vehicle is lit by a generic key and reads as a black hole. |
| shadows | 1 | No vehicle contact shadow and no obstacle shadows, so the vehicle floats with no ground anchoring. |
| ambient_lighting | 2 | Ambient is near zero; the vehicle's back faces crush to pure black. |
| ibl_reflections | 3 | The vehicle shows faint env reflections. The floor has a slight sheen near the walls but no real reflection of the neon, a huge miss for this genre. |
| tone_mapping | 4 | Not blown out, but the neon is clamped flat with no HDR rolloff. Whites on the vehicle discs clip hard. |
| color_management | 5 | The palette is coherent (cyan/magenta/yellow/purple) and sRGB output looks correct. Saturated but controlled. |
| anti_aliasing | 5 | Edges on the arches and floor lines look acceptable at 1080p. Thin vertical lines likely shimmer in motion (inferred). |
| postprocessing | 2 | No bloom on a neon game, no vignette, no chromatic or speed effects. It looks like a raw forward pass. |
| vfx | 1 | No thruster flames, trails, speed lines, impact or pickup effects visible in any frame. |
| particles | 2 | A few static dots in frame 2 only. |
| animation_quality | 2 (inferred) | The vehicle pose is identical across frames except for a vertical translation for the jump. No bank, tilt or squash is visible. |
| character_presentation | 2 | The hero craft is oversized, nearly black against a dark scene, and its design has no clear read (face? wheels? engines?). |
| camera | 2 | The chase cam sits too low and too close, so the vehicle occludes the play lane. Static FOV, no speed response. |
| composition | 2 | Dead-center symmetric framing with the hero blocking the focal point; the vanishing point is hidden behind the vehicle. |
| scale_depth_perception | 4 | Strong linear perspective from the arches and floor lines helps. No fog or atmospheric falloff, so depth reads as a flat diorama. |
| atmospheric_effects | 1 | No fog, haze, sky, stars, grid horizon or volumetrics. A flat void. |
| gameplay_readability | 2 | Obstacles ahead are hidden behind the vehicle (frame 4's obstacle is nearly invisible), and pickups are small and low-contrast at the sides. |
| ui_hud | 5 | The desktop glass bar is clean and legible but generic web-dashboard styling. The Restart button in gameplay HUD and on-screen buttons on desktop feel like a debug layout. |
| typography | 5 | A clean sans with good hierarchy (small caps labels, bold values), but generic and with no genre personality. |
| polish_juice | 2 | No feedback is visible: static style meter, "intro" section at 1.5 km, identical frames 1000 m apart. |
| mobile_presentation | 1 | The canvas is collapsed to a quarter of the screen, the HUD covers it, and 75% of the screen is blank. Not shippable. |
| overall_visual_quality | 3 | Reads as an early prototype or programmer-art runner with a broken mobile layout. |

## 3. What looks poor and why

- **The hero blocks the game.** The vehicle is about 45% of screen width at lane center, and the camera is low and close. The player cannot see incoming obstacles, which is a readability failure, not just an aesthetic one.
- **The hero reads as a black blob.** The near-black albedo with glossy coat sits on a black and dark-purple scene with no rim light and no ambient fill. The white "minus" discs are the only readable shapes, and they look like a cartoon face or prohibition signs.
- **The neon has no glow.** Every neon element is a flat emissive box with no bloom and no light spill onto the floor or walls. Synthwave lives or dies on bloom and reflections; without them it looks like colored rectangles.
- **There is no floor reflection.** A black glossy floor with neon is the obvious hero shot of this genre, and it isn't there.
- **The background is a void.** There is no sky, horizon, sun, grid, stars or fog, and the arches simply end.
- **There is a vertical center column artifact.** The blue translucent band and two cyan lines run the full screen height, through the sky and HUD area. Either a lane plane is mis-oriented or depth-unbounded, or it is a debug guide left on. It reads as a bug.
- **Nothing changes over distance.** Frames at 178 m and 1488 m are near identical, and the section stays "intro". There is no sense of progression, speed or escalation.
- **Effects are absent.** There are no thruster effects, trails, speed lines, camera shake or FOV kick, so the stills read as stationary.
- **Mobile is broken.** The canvas does not fill the viewport (likely a fixed height or aspect bug), and the HUD and buttons are stacked over the canvas instead of being anchored to screen edges.
- **The desktop HUD is cluttered.** On-screen ◀ ▶ Jump Slide and Restart buttons show on desktop, which looks like a dev harness.

## 4. Dominant causes

| Cause | % | Notes |
|---|---|---|
| Camera/composition | 25% | Chase cam placement and hero scale ruin both readability and the image. |
| Game scene authoring | 30% | Void background, no fog or sky, static repeating corridor, the center-column artifact, and no VFX authored. |
| Engine defaults | 20% | No bloom or post by default, no tone-mapped emissive, no ambient or env fill, no default contact shadows. |
| Weak assets | 20% | Primitive track pieces and an unconvincing hero craft design and material. |
| Engine rendering limits | 5% | Nothing here exceeds what basic three.js does. Floor SSR or planar reflections may not be available in-engine (inferred). |

The mobile layout failure is a game/shell CSS or canvas-sizing bug. I'd count it under authoring, but it is the single most severe defect.

## 5. Top 6 highest-leverage changes

1. **Fix the mobile canvas and HUD layout.** Make the canvas fill 100% of the viewport (100dvh), move the HUD to a thin top strip, and anchor touch controls to the bottom corners or use swipe input. This takes mobile from 1 to about 5 on its own.
2. **Reframe the camera.** Raise and pull back the chase cam, and shrink the hero to roughly 15–20% of screen width, sitting in the lower third. Add a speed-reactive FOV, a slight bank on lane change, and a little shake on landing. This fixes readability and composition together.
3. **Use HDR emissive and bloom.** Push neon emissive above 1.0 with ACES or AgX tone mapping and selective bloom (UnrealBloom or a mip-chain bloom). This is the single biggest aesthetic gain for the genre.
4. **Add a reflective floor and light spill.** Use a planar-reflection or SSR floor with roughness breakup (a subtle grid or noise texture). Add a few moving point or rect lights tied to the arches so neon actually lights the walls and the vehicle.
5. **Build a sky and atmosphere.** Add a synthwave horizon (gradient sky, sun disc, scrolling grid or mountains, stars) and exponential fog tinted magenta so geometry fades into the distance. Remove the full-height center column artifact.
6. **Redesign the hero and add VFX.** Give the hero a lighter or two-tone body with emissive accent strips, a rim or fresnel light, and a contact shadow or glow decal under it. Add thruster flames, ribbon trails, pickup bursts, speed lines, and per-section palette and geometry changes so 1.5 km doesn't look like 0 m.

## 6. Verdict

**Substantial-rebuild of the presentation layer.** Gameplay code and the corridor-generation logic can stay. The camera, hero asset, lighting and post stack, environment backdrop, and the entire mobile layout need to be redone, not tweaked. The neon-tunnel concept is cheap to make look good, so the rebuild is tractable, but current content is too thin for polish alone to get there.

## 7. Competitive with a well-built modern three.js browser game?

**No.** Comparable shipped three.js neon runners all have bloom, reflective floors, fog-to-horizon depth, trails and speed effects, and a readable hero placed out of the play line. This build has none of these. Its hero occludes gameplay, it shows a visible rendering artifact, and its mobile viewport is broken. Today it reads as a prototype around 3/10, roughly early-WebGL-demo quality. Items 1–5 above could plausibly bring it to about 6/10 without new engine features.

# `showcase-rooftop-buckets`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Aura3D Visual Audit: `showcase-rooftop-buckets`

## 1. Per-image description

**desktop-1920x1080__02-opening.jpg**
A third-person camera sits behind and to the left of a rigged humanoid shooter. The player wears a white jersey, white shorts, and a red knee sleeve, holds a raised-arms shooting pose, and stands on a glowing cyan disc. A thick emissive orange trajectory arc runs from the player to a backboard that renders as a clipped, pure-white emissive slab. The orange ball sits near the left end of the arc, with yellow dash "spark" sprites around the player. Behind the court are flat purple box-step bleachers holding a "crowd" of orange and cyan cube torsos with brown, low-poly faceted spheres for heads. Small brown lumps of unclear purpose sit on every bleacher tread. Four blank cyan emissive rectangles act as screens, and a "COURT 07DUSK" sign has "07" and "DUSK" colliding. There is no sky or rooftop skyline, even though the setting is "Rooftop Court at Dusk"; the scene is an enclosed dark-navy box with neon strips. The floor is dark blue with emissive white lines, an orange key, and extra cyan spot discs. No visible character or contact shadows exist beyond the glowing disc. UI covers roughly 15% of the frame: a top bar, a bottom-left control strip with the shot clock, and a center charge meter whose label wraps badly ("Left Mid (2–" / "pt)").

**desktop-1920x1080__03-mid.jpg**
This frame is nearly pixel-identical to the opening. Only three things change: the shot clock reads 7.5, the heat time reads 41s, and the ball has moved slightly along the arc. The player pose is unchanged, the crowd is static, and lighting and VFX are the same. Visually it gives no sense of time passing.

**desktop-1920x1080__04-action.jpg**
Same camera and set. The ball now sits low in front of the bleachers, well off the drawn arc, while the full arc trail is still rendered. A yellow flare burst appears at the rim. The player renders ghosted and washed out, semi-transparent or heavily motion-blurred, with the arc drawn over the body. The shot clock still reads 7.5 while heat time dropped to 40s, which may mean the clock froze or the HUD is not updating. There is no camera reaction, no crowd reaction, and no impact readability.

**mobile-390x844__03-mid.jpg**
The portrait camera is much tighter and centered on the blown-out white backboard. A dotted cyan trajectory-preview arc is at upper left, and the "COURT" sign is cropped off the right edge. The player is not on screen at all. The lower-right third is smeared by large orange and white bloom streaks, and the bottom of the 3D view dissolves into white haze. UI takes about 40% of the screen: a top score card, the charge meter, and a 7-button grid. The bleacher crowd primitives are much more legible at this distance, which makes them look worse.

## 2. Category scores

| Category | Score | Justification |
|---|---|---|
| environment_world | 3 | Enclosed box room of flat slabs; no rooftop, skyline, or dusk sky, so it contradicts its own premise. |
| modeling_assets | 3 | The player is passable. Everything else is cubes, slabs, and faceted spheres; the crowd is placeholder-grade. |
| texture_quality | 2 | Effectively untextured: flat albedo everywhere, no court wood, concrete, fabric, or decals beyond lines. |
| material_quality | 3 | Matte flat plastic or pure emissive; no material differentiation between court, metal, glass, and cloth. |
| pbr_credibility | 3 | No roughness variation, metal response, or Fresnel; the backboard is emissive instead of glass. |
| lighting | 5 | The neon emissive palette gives real mood. It is the strongest element, but it is all emissive with little key or rim modeling of forms. |
| shadows | 2 | No visible player shadow, crowd shadows, or bleacher occlusion; objects float. |
| ambient_lighting | 4 | Even, flat fill; no AO grounding in corners or under seats. |
| ibl_reflections | 2 | No floor reflections of the neon, which is the single most obvious missing effect for a neon court. |
| tone_mapping | 4 | Backboard and arc clip to white; highlights don't roll off. Mobile is washed out at the bottom. |
| color_management | 5 | Coherent purple, cyan, and orange palette; saturation is a bit candy-flat but intentional. |
| anti_aliasing | 5 | Edges are acceptable at 1080p; thin rails shimmer-prone (inferred); some stair-stepping on bleacher lines. |
| postprocessing | 4 | Bloom only, and over-tuned: streaky smears on mobile, haze over the arc. No AO, no DOF, no color grade. |
| vfx | 4 | Emissive arc and rim flare read, but the arc is a thick unlit tube. Spark dashes look like UI ticks, not energy. |
| particles | 3 | A few yellow dash sprites and one flare; no trail particles, net reaction, or ambient motes. |
| animation_quality | 3 (inferred) | Identical pose across all three desktop frames; ghosted body on release; static crowd. |
| character_presentation | 5 | A real rigged humanoid with decent proportions, but seen from behind at a low angle, ungrounded, and ghosted in the action frame. |
| camera | 4 | Low-angle, off-axis framing hides the player's face and the hoop relationship. Mobile drops the player entirely. |
| composition | 4 | The hoop is small and centered against a busy bleacher wall; strong elements (sign, screens) compete with the subject. |
| scale_depth_perception | 4 | No fog, DOF, or reflections, and the uniform crowd makes distance hard to read; the hoop feels close and small. |
| atmospheric_effects | 2 | No haze volume, dusk sky gradient, or light shafts. Bloom is standing in for atmosphere. |
| gameplay_readability | 6 | Trajectory, spot markers, and meter are clear. The ball off the arc in the action frame and the frozen shot clock hurt. |
| ui_hud | 6 | Clean glass panels and consistent styling, but the meter label wraps and mobile buttons dominate. |
| typography | 5 | Tidy sans and mono pairing; broken wrap ("(2–/pt)") and the "07DUSK" collision are amateur tells. |
| polish_juice | 3 | No screen shake, crowd reaction, net physics read, or hit-stop visible; frames are interchangeable. |
| mobile_presentation | 3 | No player on screen, bloom smear, cropped sign, and about 40% UI. It reads as a debug view. |
| overall_visual_quality | 4 | Neon mood lifts it above programmer art, but the assets and world are placeholder-tier. |

## 3. What looks poor and why

- **Placeholder crowd.** Cube torsos topped with brown faceted icospheres read as rocks or basketballs, not people. It is the largest single quality killer because it fills about 35% of the frame.
- **Unexplained brown lumps** on every bleacher tread look like debris or failed decals.
- **No rooftop and no dusk.** The setting promised in the title is absent. An enclosed black box with neon strips and blank cyan rectangles gives the scene no sense of place.
- **Blown-out backboard.** It is modeled as a full-white emissive quad, so the hoop, the subject of the game, is a clipped white blob. The rim and net are tiny and low-contrast.
- **No floor reflections.** A glossy court under neon is the textbook showcase shot, and the floor here is flat matte.
- **No shadows or AO.** The player, crowd, and bleachers are all ungrounded, and the scene looks composited.
- **Untextured surfaces.** Everything is flat albedo, with no wood grain, concrete, scuffs, or decals.
- **Over-tuned bloom.** It produces haze around the arc and streaky smears on mobile, and the threshold is too low.
- **Arc VFX is a solid glowing tube.** It is drawn over the player and persists after the ball deviates, which hurts both readability and credibility.
- **Ghosted player in the action frame.** This is likely a transparency, sorting, or motion-blur artifact.
- **Static frames.** Three desktop captures are near-identical, so pose and crowd show no life.
- **Mobile camera.** The player is off-screen, the sign is cropped, and the button grid dominates.
- **Text bugs.** The meter label wraps badly, "07DUSK" kerning collides, and the shot clock stalls at 7.5.

## 4. Dominant causes

| Cause | % | Notes |
|---|---|---|
| Game scene authoring | 40% | Missing sky and rooftop, emissive backboard, no reflective floor, lumps, sign layout, bloom tuning. |
| Weak assets | 30% | Primitive crowd, slab architecture, no textures. |
| Engine defaults | 15% | Bloom threshold, no AO, shadows off or weak, tone-mapping clipping, no SSR or reflection default. |
| Camera/composition | 12% | Behind-and-low framing, small hoop, mobile framing omits the player. |
| Engine rendering limits | 3% | Nothing seen here suggests the renderer can't do better; the character and emissives render fine. |

## 5. Top 6 highest-leverage changes

1. **Replace the crowd and build an actual rooftop.** Use low-poly but stylized silhouette people (or instanced cutout cards with animated sway), remove the lumps, and open the far wall to a dusk sky gradient plus a city skyline with lit windows. This fixes premise, depth, and the worst asset at once.
2. **Make the court a reflective hero surface.** Use planar or SSR reflections at moderate roughness so the neon, arc, and spot discs reflect, and add a court texture (polished concrete or sealed asphalt with painted lines and scuffs).
3. **Rebuild the hoop as the focal point.** Use a glass backboard with an emissive border instead of a white quad, a thicker orange rim, and a simulated or animated net. Add a subtle spotlight cone on the hoop and lower its exposure so it is the brightest non-clipping element.
4. **Ground the scene with shadows, AO, and fill.** Add a directional key with soft shadows on the player and ball, contact shadows, and SSAO or baked AO on the bleachers. Add a rim light on the player to separate them from the background.
5. **Fix tone mapping and bloom.** Use ACES or AgX with highlight rolloff, raise the bloom threshold, and cut the intensity by about half. Thin the arc into a tapered ribbon with additive particles, fade it after release, and stop drawing it over the player. Fix the ghosted-player sorting or blur.
6. **Recompose the camera.** Use a higher, more over-the-shoulder angle with the hoop at the upper third and larger, and add a post-release camera follow plus a make or miss reaction (hit-stop, crowd pop, net swish particles). On mobile, frame both the player and the hoop, and collapse the controls into a compact tap/hold zone so the UI drops to about 20%. Fix the text wrap, the sign kerning, and the shot clock update.

## 6. Verdict

Substantial rebuild of the art layer. The HUD framework, the neon palette direction, the character rig, and the gameplay readability are salvageable. The crowd, environment, hoop, materials, and lighting setup need to be rebuilt, not polished.

## 7. Competitive with a well-built modern three.js browser game?

No. Polished three.js basketball and arcade titles ship reflective floors, real environment context, grounded shadows, controlled bloom, and animated crowds or set dressing. Here the primitive crowd, untextured slab world, clipped emissive backboard, and absent sky read as a mid-2010s prototype with a nice neon color grade. Mood is the only area where it competes; asset quality, materials, shadows, and reflections are well below the bar, and the mobile view is not shippable as a showcase.

# `showcase-siege-golf`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Aura3D Showcase Audit: `showcase-siege-golf`

The capture set has a defect: images 2 (`03-mid`) and 3 (`04-action`) are pixel-identical. The "action" beat shows a static post-hole screen, so no in-motion frame was captured. Fix the capture script before trusting any future audit.

---

## 1) Per-image description

**desktop-1920x1080__02-opening**
- **View:** A low chase camera sits behind a white golf ball on a straight teal fairway strip with yellow rails.
- **Obstacles:** Two upright salmon-orange planks flank the lane, and an orange crate hangs mid-tumble in front of a raised beige tee. At the far end are a crenellated "castle" wall built from untextured beige boxes, two stacks of dark arrow-decal crates, barrels, a blue flag, and a coral target ring with an emissive vertical beam.
- **Surroundings:** Beige slab ledges, rail fences with blank orange sign-boards and chunky beveled box "trees" line both sides. Behind them are a giant blue-grey ellipsoid blob, green ellipsoid hills and a flat cyan sky with no clouds visible.
- **Lighting and HUD:** Lighting is a single soft directional light with weak contact shadows. A top pill reads "Open Fairway · Par 2 · Stroke 2". A large right-side panel holds dev-style controls: sliders reading "Aim offset 0.000" and "Set power 1.900", a "Strike set shot (J)" button, and a "Ball in motion / hold Space" bar. UI covers roughly 15–18% of the screen.

**desktop-1920x1080__03-mid**
- **View:** A higher, wider camera shows the whole hole. Scattered orange planks and crates lie near the target, which now glows yellow with a bloom halo.
- **Environment:** Box-stack low-poly clouds float in a flat sky. Large dark-green ellipsoid trees sit on a vast empty green ground plane. The right foreground carries visible long shadows from the fence and trees, with some soft banding.
- **Scale problem:** The blue-grey ellipsoid behind the castle reads as an inexplicable giant blob. About 40% of the frame is empty grass or sky.
- **HUD:** A "Hole complete · 1 stroke · par 2 (-1) · ★★★ · Next hole" card sits bottom-left. UI covers about 8%.

**desktop-1920x1080__04-action**
- Identical to 03-mid. No action, VFX or motion state was captured.

**mobile-390x844__03-mid**
- **Layout:** Portrait framing down the fairway, with a dotted aim/trajectory line and the castle and crates compressed in the upper-middle.
- **UI coverage:** The top quarter is covered by the pill plus a large "Hole complete" modal over a translucent backdrop. The bottom ~18% holds a "Target sunk 77%" bar, arrow buttons and a "Hold to charge" button. That leaves roughly 55% for 3D.
- **Image quality:** The whole 3D view is noticeably washed out and low-contrast compared with desktop. Clouds and background are smeared, so a backdrop blur or veil appears to be bleeding over the scene.
- **UI state:** "Hole complete" and "Hold to charge / 77%" are displayed simultaneously, which is a contradictory state.

---

## 2) Scores

| Category | Score | Justification |
|---|---|---|
| environment_world | 3.5 | Single straight lane on an infinite flat green plane, with ellipsoid blobs as hills and trees; no world identity beyond a box "castle". |
| modeling_assets | 3 | Almost everything is primitives (boxes, bevel boxes, ellipsoids, cylinders); crates and barrels are the only authored-looking props. |
| texture_quality | 2.5 | Flat vertex colors everywhere; only the crates and barrels carry textures, and they clash stylistically. |
| material_quality | 3 | Uniform matte plastic; grass, wood, stone and ball are indistinguishable in response. |
| pbr_credibility | 2.5 | No roughness or metal variation and no specular cues; the ball has no highlight worth mentioning. |
| lighting | 4.5 | Clean single sun with decent key/fill balance, but no time-of-day mood, no rim light and no light accents at the goal. |
| shadows | 4.5 | Soft shadows present and stable; contact shadows under props are weak, and fence shadows band and stretch in the wide shot. |
| ambient_lighting | 4 | Flat hemispheric fill with no visible AO, so objects float and box seams don't darken. |
| ibl_reflections | 1.5 | No visible environment reflections on the ball, crates or anything else. |
| tone_mapping | 5 | No clipping and a pleasant pastel range on desktop; slightly flat. Mobile is visibly washed. |
| color_management | 5 | Coherent palette, but salmon-orange obstacles and signs compete with the goal and the teal/green clash is muddy. |
| anti_aliasing | 6 | Edges are clean at desktop resolution, with mild shimmer likely on thin fence rails (inferred). |
| postprocessing | 4 | Bloom on the target ring is the only visible pass; no AO, color grade or vignette, and the mobile softness looks unintended. |
| vfx | 3 | Emissive ring and beam plus a ring decal at the ball; no impact, sink or celebration effects visible. |
| particles | 1.5 | A few dots on the fairway (possibly aim dots); no dust, sparkle, debris or confetti on a 3-star finish. |
| animation_quality | 3 (inferred) | Crate tumble implies rigid-body physics; nothing else animates (flags, trees, ball spin cues). |
| character_presentation | 1 | No character, avatar or golfer; the ball is the protagonist and has no personality. |
| camera | 4.5 | Opening chase cam is serviceable; the wide cam is generic, and neither frames the "siege" fantasy. |
| composition | 3.5 | Symmetrical corridor with a dead center line; wide shot is ~40% empty plane and the giant blob crowds the goal. |
| scale_depth_perception | 3 | Ellipsoid "trees" are ambiguous in size; no atmospheric perspective, no detail falloff and a flat horizon. |
| atmospheric_effects | 2 | No fog, haze gradient, god rays or sky detail beyond cube clouds. |
| gameplay_readability | 6 | Lane, ball, target and obstacles read clearly; obstacle color is too close to the goal ring's coral. |
| ui_hud | 4 | Desktop right panel is a debug/dev tool (raw float sliders, "(J)" hotkey label) shipped as HUD; mobile UI is cleaner but buries the view and shows conflicting states. |
| typography | 6 | Clean system sans with legible hierarchy; generic, with no game-brand voice. |
| polish_juice | 3 | 3-star completion with no celebration, no screen effects, nothing shown landing or popping. |
| mobile_presentation | 3.5 | Modal plus control bar eat ~45% of the screen; the scene is washed and blurred, with contradictory UI text. |
| overall_visual_quality | 3.5 | Reads as a competent engine test scene with primitive art, below "dated programmer-art" in authored intent. |

---

## 3) What looks poor and why

- **Primitive-built world.** The castle is a row of identical cubes on a slab. Trees are beveled boxes or ellipsoids, and hills are squashed spheres. Nothing has silhouette variation, wear or detail, so it reads as a greybox with color applied.
- **Flat colors with zero material differentiation.** Grass, sand-colored stone, wood planks and the ball all share the same matte response. With no normal maps, roughness variation, AO or specular, the image has no tactile quality.
- **No reflections or IBL.** A golf ball and crates on a sunny day should pick up sky tint and highlights. The absence makes everything look like clay.
- **Asset style clash.** The textured, realistic arrow crates and barrels sit next to untextured flat-color geometry. This mixes two art directions.
- **Empty composition.** The infinite green plane dominates the wide shot with no scenery, height variation or skyline. The giant blue ellipsoid behind the goal is an unexplained mass.
- **Color hierarchy failure.** Obstacles, sign-boards and the target ring all use coral/orange, so the player's goal doesn't pop. The sign-boards are blank and meaningless.
- **Debug UI in production.** The desktop panel shows raw slider values (0.000, 1.900), a "Strike set shot (J)" dev command and redundant buttons. This is tooling, not a HUD.
- **Mobile veil.** The 3D view is low-contrast and blurred, most likely from a modal backdrop-filter or a DPR/resolution issue. The modal plus control bar leave the scene small, and the overlapping "Hole complete" and "Hold to charge" states read as broken.
- **No juice.** A 3-star hole-in-one produces a small card and a glowing ring. There is no confetti, camera move, flag animation, sound-implying VFX or particles.
- **"Siege" fantasy absent.** Nothing reads as a siege: no catapult, walls being breached, banners, destruction debris or medieval dressing beyond cube crenellations.
- **Capture pipeline.** The action shot duplicates the mid shot, so motion, VFX and destruction are unauditable.

---

## 4) Dominant causes

| Cause | % | Notes |
|---|---|---|
| Weak assets | 35% | Primitives, flat colors and mismatched crate textures are the single biggest drag. |
| Game scene authoring | 25% | Empty ground plane, no set dressing, no theme, no juice, debug HUD shipped. |
| Engine defaults | 20% | No IBL/env map, no AO, no color grade and flat hemispheric ambient left at defaults. |
| Camera/composition | 15% | Symmetric corridor, empty wide shot, mobile UI occlusion. |
| Engine rendering limits | 5% | Shadows, bloom and AA work; nothing here is blocked by the renderer. |

---

## 5) Top 6 highest-leverage changes

1. **Replace primitives with a cohesive stylized asset kit.** A consistent low-poly/stylized kit (KayKit- or Kenney-tier, or custom) should cover the castle walls with towers, gates and banners, plus trees with real canopies, rocks, fences and a catapult. Use a single shared gradient/trim texture atlas so the arrow crates aren't the only textured objects. This alone moves the overall score about 2 points.
2. **Turn on the engine's lighting stack.** Add an HDRI/IBL environment (soft sky), SSAO/GTAO, a warmer sun with cooler sky fill, and a subtle roughness or clearcoat on the ball so it reflects the sky. Add tighter contact shadows under props.
3. **Kill the empty plane and author a backdrop.** Add a terrain heightfield, a distant castle or keep skyline, layered tree lines, height fog or atmospheric perspective, and a real skybox with painted clouds. Push the giant blob back or remove it.
4. **Fix the color hierarchy.** The goal should own one saturated hue (gold) that nothing else uses. Obstacles get a second hue and scenery should be desaturated. Put heraldry on the sign-boards or remove them.
5. **Ship a real HUD and fix mobile.** Remove the debug slider panel and replace it with an in-world aim arrow and power meter. On mobile, make the completion card compact and bottom-sheet, remove the backdrop blur over 3D, hide charge controls when the hole is complete, and verify DPR and contrast.
6. **Add juice and VFX.** Add a ball trail, impact dust and splinters on crate hits, debris persistence, a flag wave, sink burst, confetti and a short camera push-in on hole complete. Also fix the capture script so the action frame shows these.

---

## 6) Verdict

**Substantial rebuild (art and scene), but save the engine and game loop.** The renderer, physics, shadows and basic UI framework are fine. The art layer (assets, materials, environment, HUD, VFX) needs to be redone rather than polished, because polishing primitives won't escape the greybox read.

---

## 7) Competitive with a well-built modern three.js browser game?

**No.** Polished three.js and WebGPU titles in 2024–25 ship cohesive stylized asset kits, IBL-lit materials, AO, authored skyboxes and atmosphere, and generous juice. This build reads as a physics prototype: primitive geometry, flat matte colors, no reflections, an empty world, a debug-panel HUD and a washed-out mobile view. Its readability is acceptable, but it is visually closer to a 2010-era Unity webplayer greybox than a current showcase. As a showcase of the Aura3D engine, it undersells the engine's capabilities.

# `showcase-skyline-runner`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Skyline Runner – Visual Audit (Production Capture)

The shipped frame is held up by one painted 2D backdrop. The real-time 3D layer on top of it (platforms, coins, the tree slab, the ground, the pickups) ranges from mid-tier to placeholder. The gap between the painted backdrop and the 3D layer is the biggest problem in the game. It reads as a polished concept-art wallpaper with a prototype running in front of it.

---

## 1) Per-image description

**desktop 02-opening**
- The backdrop is a winter mountain valley: layered blue peaks, snowy pines, cliffside cabins with warm lanterns at left and right edges, and a few glowing orbs in the sky. It is clearly a pre-rendered or painted plate, with no parallax cues between its layers.
- In the 3D layer, a chibi hooded girl with a cyan scarf mid-dash sits beside a white-hot vertical light slash. Behind her, a large flat slate-blue slab with untextured cone pines floats at an angle that doesn't match the backdrop perspective.
- A row of six snow-capped floating ice platforms with cyan rim glow and orange cracks runs right. Each has a dark grey rectangular bar under it that reads as a collider or debug mesh. A glowing white diamond pickup and dark olive ellipse "coins" sit nearby.
- The bottom ~15% is a flat, blown-out white snow plane with no detail. The HUD covers about 12% of the frame: a title card top-left, a stat strip top-right, and an on-screen control pad bottom-left with a tiny, illegible keybind legend.

**desktop 03-mid**
- The scene and camera are nearly identical to frame 02. The character is in the same pose, slightly higher, which suggests a static or near-static sprite or pose.
- A large pink-white glowing octahedron (relay or checkpoint) with a cyan ground ring sits in front of and on top of the character's legs, occluding the player. Its core clips to pure white.
- A thin dark ring floats mid-air. Coins are still dark, unlit-looking ellipses.
- The HUD shows Score 100, Coins 1, Lives 0 in red, yet play continues. That is either a state bug or confusing feedback.

**desktop 04-action**
- This is visually almost indistinguishable from 03. The camera has shifted slightly, and the character, octahedron, and platforms are unchanged.
- The "action" frame has no visible action: no motion trails, impact VFX, particles, speed lines, or camera response.
- The tree slab's hard straight edges and flat shading are very prominent against the painterly backdrop. The ground plane is still a white void.

**mobile 03-mid**
- The portrait crop puts the backdrop's mountain peaks in the upper ~45%, and the HUD stack (title, stats, relays, objective, ghost toggle) covers much of it.
- The gameplay band is a thin horizontal strip at about 50–62% height. The character is tiny and mostly hidden behind the glowing octahedron and bloom.
- The bottom ~30% is a large control pad. The District value is truncated to "Ste...", and Lives is missing entirely.
- The whole frame is soft or blurry, which suggests a low DPR or render scale plus bloom haze. Roughly 15–20% of the screen is actual readable gameplay.

---

## 2) Category scores

The backdrop is scored separately where it matters. When a category is about the real-time renderer, the score reflects the 3D layer.

| Category | Score | Justification |
|---|---|---|
| environment_world | 5 | The backdrop is gorgeous (8+ in isolation), but it's a static plate. The authored 3D world is six platforms, one flat slab, and a white plane. |
| modeling_assets | 4 | Ice platforms are decent stylized low-poly. The tree slab is primitive cones on a box, the coins are bare ellipsoids, the grey bars look like debug geometry, and the octahedron is a stock primitive. |
| texture_quality | 4 | Platforms have some painted color variation. The slab, coins, bars, and ground are flat colors with no texture. |
| material_quality | 4 | Emissive rim on platforms works. Everything else reads as unlit flat or basic Lambert with no roughness or spec variation. |
| pbr_credibility | 3 | No visible specular response, fresnel, or roughness differentiation anywhere in the 3D layer. Ice and snow should sell this and don't. |
| lighting | 4 | Lighting is baked into the backdrop. The 3D layer gets flat ambient-plus-emissive with no key-light direction matching the painting's moonlight or lantern warmth. |
| shadows | 2 | No visible cast shadows from the character, platforms, or slab, and no contact shadows. Objects float with no grounding. |
| ambient_lighting | 4 | The blue ambient matches the palette, but it's uniform with no AO or occlusion in crevices or under platforms. |
| ibl_reflections | 1 | No visible reflections or environment response on ice, snow, or crystal. |
| tone_mapping | 4 | The octahedron and dash slash clip to pure white. The ground is blown out. Midtones are fine because the backdrop is pre-graded. |
| color_management | 5 | The palette is cohesive (blue plus warm accents). The pink octahedron and olive coins clash, and the 3D layer is slightly desaturated against the plate. |
| anti_aliasing | 5 | Desktop edges are acceptable. Mobile is visibly soft or blurry, consistent with a low render scale. |
| postprocessing | 4 | Bloom is the only visible pass, and it's overdriven: haze around pickups and on mobile. No DOF, color grade, or vignette tied to gameplay. |
| vfx | 4 | The dash slash and relay ring exist but are a single flat card and a ring. No trails, sparks, snow kick-up, or layered effects. |
| particles | 1 | No falling snow, breath, sparkle on pickups, or dash particles. In a snow level that is a glaring omission. |
| animation_quality | 3 (inferred) | Identical pose across three frames suggests a sprite or single pose. No squash, lean, or secondary motion on the scarf is visible. |
| character_presentation | 5 | The design is appealing and on-style. It's small, has no rim light against the busy backdrop, and gets occluded by the pickup. |
| camera | 4 | Static side-on framing with almost no movement between frames. The 3D projection doesn't match the backdrop's implied perspective (the slab is viewed from above). |
| composition | 4 | The play path sits in a narrow mid band. The top-center is dominated by an ugly slab, and the bottom 15% is empty white. |
| scale_depth_perception | 3 | 3D and 2D layers don't share a horizon or scale. Platforms float with no depth cues, shadows, or parallax. |
| atmospheric_effects | 3 | All atmosphere is painted. No real-time fog, snowfall, or light shafts bridge the 3D and 2D layers. |
| gameplay_readability | 4 | The platform path is readable. Coins are near-invisible dark blobs, the grey bars are ambiguous, the pickup hides the player, and Lives 0 during play is confusing. |
| ui_hud | 6 | The HUD is clean, consistent, and glassy. The keybind legend is microscopic, and the HUD is generic web-dashboard rather than game-styled. |
| typography | 6 | The type is legible, the hierarchy is OK, and it's on-palette. The legend text is unreadable and there is truncation on mobile. |
| polish_juice | 2 | No feedback is visible: no hit-stop, screen shake, particles, coin pop, or trail. Frames 03 and 04 are nearly identical. |
| mobile_presentation | 2 | The play band is tiny, about 50% of the screen is HUD and controls, the image is blurry, the character is lost, and data is truncated or missing. |
| **overall_visual_quality** | **4** | One excellent painted plate masks a prototype-grade 3D layer. Strip the backdrop and this is a 2–3. |

---

## 3) What looks poor and why

1. **2D/3D fidelity mismatch.** The backdrop is illustration-grade, while the 3D layer is flat-shaded primitives. The eye reads the 3D elements as unfinished stickers.
2. **The floating tree slab.** It is a large untextured slate box with cone trees, drawn in a perspective that contradicts the painting. It sits top-center, the most prominent position in the frame, and it's the worst asset on screen.
3. **Grey bars under each platform.** They look like collision volumes left visible. If they are intentional, they're unreadable. If not, they're debug geometry shipped to production.
4. **Coins.** Dark olive ellipses on a dark blue background have almost zero value contrast, no emissive, and no spin highlight. The primary collectible is close to invisible.
5. **Blown-out pickups.** The octahedron and dash slash clip to white, bloom spreads into haze, the pickup overlaps the player, and there is no z-order or size discipline.
6. **No shadows or contact grounding.** The character and platforms hover with nothing anchoring them to each other.
7. **The white ground void.** The bottom 15% is flat, overexposed snow with no texture, sparkle, or footprints, which is wasted screen space.
8. **No particles in a snow level.** No snowfall, dust, or sparkle. The scene is static and lifeless between frames.
9. **No motion or juice.** Mid and action frames are near-identical, with no visible animation or camera response.
10. **Mobile.** Low render scale or blur, a tiny subject, about 50% UI coverage, truncated District, missing Lives, and bloom haze that worsens at small size.
11. **State and HUD bug.** Lives reads 0 in red while play continues.

---

## 4) Dominant causes

| Cause | % | Notes |
|---|---|---|
| Game scene authoring | 35% | Slab placement, debug-looking bars, coin color, pickup overlapping the player, empty ground, no particles. |
| Weak assets | 25% | Primitive slab and trees, ellipsoid coins, stock octahedron, character likely a sprite or rigid pose. |
| Camera/composition | 20% | Static framing, perspective mismatch with the plate, narrow play band, the mobile crop. |
| Engine defaults | 15% | Bloom threshold and intensity too high, no tone-map highlight rolloff, no default shadows or contact AO, low mobile DPR. |
| Engine rendering limits | 5% | Nothing on screen demands more than standard three.js-level features. The engine isn't the bottleneck. |

---

## 5) Top 6 highest-leverage changes

1. **Delete or replace the floating tree slab, and hide the grey bars.** This is the single biggest quick win. Replace the slab with painted-plate-matched mid-ground cards or properly textured stylized islands. Remove the bars, or turn them into authored ice undersides.
2. **Unify the 2D and 3D layers.**
   - Add 3–4 parallax depth layers cut from the backdrop.
   - Add a real-time height and distance fog matched to the plate's blue.
   - Add a moonlight key light plus a warm lantern fill so the 3D assets share the painting's lighting.
   - Add rim light on the character.
3. **Fix exposure and bloom.**
   - Switch to ACES or AgX with highlight rolloff.
   - Raise the bloom threshold and cut its intensity about 50%.
   - Cap emissive so the pickup cores keep color instead of clipping to white.
   - Texture and darken the ground plane, adding sparkle or normal detail.
4. **Add grounding and particles.**
   - Blob or contact shadows under the character and platforms.
   - Screen-space or GPU snowfall in 2–3 depth layers.
   - Dash trail, landing puffs, and coin pickup bursts.
5. **Redesign collectibles for readability.** Make coins bright warm emissive with spin and outline. Keep the relay smaller or offset from the player path, render the player above it, and give a distinct silhouette per pickup type.
6. **Rebuild the mobile layout.**
   - Use a landscape-first layout, or a portrait camera that zooms on the player band.
   - Collapse the HUD into one compact row and shrink the control pad to semi-transparent thumb zones.
   - Raise DPR or render scale to at least 2, and fix the truncation and missing Lives.
   - Also fix the Lives 0 display bug.

Animation (a run/jump/dash cycle with scarf secondary motion) and camera juice (look-ahead, dash punch, landing shake) are next after these six.

---

## 6) Verdict

**Substantial rebuild** of the 3D layer, with save-through-polish for the art direction, backdrop, and HUD. The style target and palette are strong and worth keeping. The real-time content (mid-ground set dressing, collectibles, VFX, particles, character animation, mobile camera) needs to be re-authored, not tweaked.

---

## 7) Competitive with a well-built modern three.js browser game?

**No.** A thumbnail sells well because of the painted backdrop. In motion and at full size, the 3D layer shows primitive geometry, no shadows, no particles, no reflections, clipped bloom, unreadable coins, apparent debug geometry, and a near-static character. Mobile is clearly below bar. Competitive three.js platformers integrate their 3D assets with the world lighting and have far denser feedback and VFX. This one currently relies on a single illustration.

# `showcase-turbo-drift-circuit`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Aura3D Visual Audit: showcase-turbo-drift-circuit

## 1) Per-image description

**desktop-1920x1080__02-opening.jpg**
A low-poly red open-wheel racer is seen from a high chase cam, centered and small (about 5% of the frame). A blue rival sits mid-distance. An untextured mid-grey asphalt plane fills roughly 60% of the screen, with lighter grey slab patches and a raised grey platform floating on it. The background has two low-poly grandstands with flat-colored seat blocks, an orange box gantry with a blown-out glow, sphere-on-stick trees (one inexplicably red-topped), thin red/white kerb strips, and a flat salmon-to-peach sky with no clouds or skybox detail. The car has only a faint soft contact shadow, and there are no visible reflections on the ground. The HUD takes about 15% of the screen across three panels: a title card at top left, a dense stats cluster at top right, and control buttons at bottom left. A dark vignette is visible on all edges.

**desktop-1920x1080__03-mid.jpg**
The camera is much closer and the car fills the center. Its faceted nose (visible flat-shaded polygons) and a rear wing with a clipped, pure-white specular highlight are both prominent. Bright yellow emissive lane strips bloom heavily. The background is a dark green grass slab with a tan run-off band and a grey overpass beam and pillar crossing the top of frame. A translucent tan ellipse surrounds the car like a debug gizmo or drift ring, and a grey-white glow puff sits behind the left rear wheel. Overall the image is murky grey with milky haze over the asphalt and no texture anywhere on the ground.

**desktop-1920x1080__04-action.jpg**
The car is off track. The track is built from overlapping flat dark polygons with hard faceted edges on tan sand and green slabs, which reads as stacked 2D shapes rather than a road. A row of grey disc decals in front of the car appears to be skid marks rendered as circles. The blue rival runs on a red kerb at right, and the orange gantry glows on the horizon. Sphere trees are sparse and tiny. The sky is the same flat peach gradient. The HUD is unchanged, and about 85% of the frame is 3D, mostly empty plane.

**mobile-390x844__03-mid.jpg**
In portrait, the car occupies about 40% of the frame and is cropped at the left edge. The camera is so close that very little road ahead is visible. The translucent tan ellipse and a brown rectangular skid strip under one wheel are prominent and look like placeholder geometry. Yellow lane strips bloom at the top left. The HUD takes about 25% of the screen: a title card, a 2-row stats grid, and a bottom control bar. The low-poly nose faceting is very obvious at this scale.

## 2) Category scores

| Category | Score | Justification |
|---|---|---|
| environment_world | 2.5 | Flat-shaded plane world, sparse primitive trees, two stands, empty sky. |
| modeling_assets | 3.5 | The car silhouette is decent but faceted. Environment pieces are boxes, slabs and spheres. |
| texture_quality | 1.5 | Effectively no textures: asphalt, grass, sand and seats are all flat color. |
| material_quality | 3 | Car has some gloss. Everything else is matte flat albedo with no roughness variation. |
| pbr_credibility | 3 | Car spec is plausible but clips. Asphalt has no micro-roughness or wetness, so nothing reads as a real material. |
| lighting | 3.5 | Single soft key with no strong directional sun read and no light shaping. Scenes look flatly lit. |
| shadows | 2.5 | Faint car contact shadow. Stands, trees and gantry cast nothing visible onto the ground. |
| ambient_lighting | 3.5 | Ambient is uniform grey with no AO grounding in crevices, wheels or stand bases. |
| ibl_reflections | 2.5 | Car shows weak env response. No sky reflection on car paint, no ground reflections. |
| tone_mapping | 4 | Filmic-ish rolloff in the sky, but highlights clip (wing, gantry) and midtones are grey-washed. |
| color_management | 4.5 | Coherent pastel sunset palette but desaturated, with grey haze crushing contrast. |
| anti_aliasing | 5 | Edges are mostly clean at 1080p. Some stair-stepping on thin kerbs and distant poles. |
| postprocessing | 3.5 | Bloom on lane strips and vignette only. The bloom is smeary and the haze lowers contrast. |
| vfx | 2 | One glow puff and placeholder drift ring. No smoke, sparks or speed effects. |
| particles | 1.5 | Effectively no particle tire smoke. Skid marks are disc or rectangle decals. |
| animation_quality | 3 (inferred) | No visible wheel steer angle, body roll or suspension cues in stills. |
| character_presentation | 4 | The car is the most authored asset and reads as an F1-ish racer, but it is low-poly and lacks livery detail. |
| camera | 3.5 | Desktop chase height is OK in the opening, but mid and action shots are too close and too tilted. Mobile is far too close. |
| composition | 2.5 | Lower half of the frame is empty grey asphalt, and the horizon is cluttered with tiny props. |
| scale_depth_perception | 2.5 | Untextured ground gives no speed or scale cues. 177 km/h reads as stationary. |
| atmospheric_effects | 3 | Distance haze exists but behaves like a grey wash, not aerial perspective. No sky detail. |
| gameplay_readability | 5 | Track edges are readable via kerbs and lines, but overlapping slabs confuse the racing line. |
| ui_hud | 6.5 | Clean glassy panels with good hierarchy. The stats cluster is dense, and "GGhost OFF" is a label bug. |
| typography | 7 | Crisp sans-serif with good weight contrast. Micro-labels are too small on desktop. |
| polish_juice | 2.5 | No screen shake, FOV kick, motion blur, smoke or speed lines. Feels static. |
| mobile_presentation | 3 | Car is cropped, the forward view is minimal, HUD and controls eat about 25%, and debug-looking ellipse dominates. |
| **overall_visual_quality** | **3** | Reads as a programmer-art prototype with a nice HUD on top. |

## 3) What looks poor and why

- **Untextured ground plane.** The single biggest problem is 50–65% of every frame being flat grey with no asphalt grain, normal map, rubber line or roughness variation. It kills scale, speed and material credibility at once.
- **Track built from flat stacked polygons.** Hard-edged slabs (grey on dark, tan, green) overlap like paper cutouts. There is no spline-extruded road, no camber, no shoulders and no edge blending. The floating grey platform in the opening shot looks like a bug.
- **Primitive set dressing.** Sphere-on-stick trees, box gantry and box seat blocks. There are no barriers, catch fences, tire walls, signage or marshal posts, so the world has no density.
- **Placeholder VFX.** The translucent tan drift ellipse reads as a debug gizmo. Skid marks are rendered as grey discs or brown rectangles instead of ribbon trails. There is no tire smoke.
- **Exposure and haze.** A grey milky veil over the mid-ground, plus vignette, makes the scene murky. Highlights clip to pure white (rear wing, gantry light) while midtones stay low-contrast.
- **Smeary bloom.** Lane strips glow far too wide, which reads as cheap neon rather than painted lines.
- **Weak lighting and shadows.** There is no strong sun direction, no cast shadows from stands or trees, and no AO. Objects float.
- **Empty sky.** A flat two-tone gradient with no clouds, sun disc or HDRI, so the car paint has nothing interesting to reflect.
- **Faceted car.** Flat-shaded nose polygons and missing smoothing groups. It lacks a clearcoat layer, decals and visible detail like suspension arms or a halo.
- **Camera.** Mid and action shots are too close and pitched down, so you see the car's back and empty asphalt instead of the road ahead. Mobile portrait is worse: the car is cropped and the forward view is under 30% of the screen.
- **HUD bugs and density.** "GGhost OFF" is a text bug, and there are three stacked stat panels on desktop. On mobile, the HUD plus controls cover about 25% of the screen.

## 4) Dominant causes

| Cause | % | Notes |
|---|---|---|
| Weak assets | 30% | No textures, primitive props, faceted car. |
| Game scene authoring | 30% | Slab track construction, sparse dressing, placeholder drift and skid visuals, empty sky. |
| Camera/composition | 15% | Too-close chase cam, empty lower frame, bad mobile framing. |
| Engine defaults | 15% | Grey haze/fog, wide bloom, weak default IBL, soft or absent shadows, highlight clipping. |
| Engine rendering limits | 10% | Nothing here suggests the engine can't do better. Shadow coverage and AO may be missing features. |

## 5) Top 6 highest-leverage changes

1. **Real track surface.** Replace the slab polygons with a spline-extruded road mesh that has shoulders and camber. Apply tiling PBR asphalt (albedo, normal, roughness) with a darker rubbered racing line and painted, non-glowing lines. This fixes about half the frame alone.
2. **Lighting stack.** Use a strong low-angle sunset directional light with cascaded shadows covering stands, trees and props. Add an HDRI sky for both background and IBL, plus SSAO or baked AO. Remove the grey haze and fix exposure so highlights stop clipping.
3. **Car asset pass.** Add smooth normals, a clearcoat car-paint material that reflects the HDRI, livery decals, visible suspension and halo, and proper rubber tires with sidewall detail. Add visible steer angle and body roll.
4. **Driving VFX.** Use ribbon skid marks instead of discs. Add GPU particle tire smoke on drift, sparks on kerbs, and speed lines plus subtle motion blur and FOV kick at speed. Delete or redesign the tan drift ellipse.
5. **Trackside density.** Add instanced barriers, catch fencing, tire walls, sponsor boards, marshal posts and proper tree meshes or impostors. Give the stands seat texture and crowd cards. These props provide parallax and convey speed.
6. **Camera and mobile layout.**
   - Use a lower, further chase cam with a slight look-ahead and dynamic FOV.
   - On mobile portrait, pull the camera back, place the car in the lower third, and show at least 60% road ahead.
   - Collapse the HUD to speed, lap and position.
   - Shrink the control bar or use transparent thumb zones.
   - Fix the "GGhost" label.

## 6) Verdict

**Substantial rebuild.** The HUD, UI framework and probably the gameplay code can be kept. The art content (track geometry, materials, props, sky, VFX) needs rebuilding, not tuning. Post-processing and camera tweaks alone won't lift this above about 4.

## 7) Competitive with a well-built modern three.js browser game?

**No.** Polished three.js racers (e.g. Bruno Simon–tier work, or commercial web racers) ship textured PBR surfaces, HDRI lighting with real shadows, smoke and skid VFX, and strong speed feel. This build shows untextured flat-shaded planes, primitive props, placeholder decals and murky exposure. Only the HUD is at a professional level, and it sits on top of what reads as an early prototype scene.

# `showcase-vault-breakers`

Images: desktop-1920x1080__02-opening.jpg, desktop-1920x1080__03-mid.jpg, desktop-1920x1080__04-action.jpg, mobile-390x844__03-mid.jpg — model claude-opus-5.5

# Vault Breakers: Visual Audit (Production Capture)

## 1. Per-Image Description

**desktop-1920x1080__02-opening.jpg**
A single pinball table is seen from a fixed, high three-quarter camera. The playfield is a flat slate-grey plane with:
- cyan flippers at rest
- three brown/teal cylinder pop bumpers
- two orange triangular-prism slingshots
- a tan box "target bar"
- tan capsule posts
- three cyan quads as lane markers

The backbox is a dark rectangle holding five tan cubes (the "vault" targets), a magenta bar and a small dial, trimmed with unlit cyan strips. The background is a flat blue-grey wall flanked by magenta-gradient walls with diagonal pink/cyan line decals. There are no visible shadows, reflections, glass or bloom, and no ball is discernible. The 3D viewport takes about 82% of the width; a dark HUD side panel takes the rest, plus a top objective pill.

**desktop-1920x1080__03-mid.jpg**
The frame is pixel-identical to the opening apart from both flippers being raised and the score reading 1300. There is still no visible ball, no hit flash, no lit insert and no camera change. Nothing in the 3D scene communicates that 1300 points were just scored. Lighting is uniform and directionless, and the playfield reads as matte plastic.

**desktop-1920x1080__04-action.jpg**
The score is 1450, the left flipper is down and the right is up. A thin gold outline ring appears beside the right slingshot. This is either the ball rendered as a near-invisible hollow ring or a hit VFX, and it is ambiguous either way. That ring is the only "action" cue in the entire capture set. The scene is otherwise unchanged: flat lighting, no shadows, no particles.

**mobile-390x844__03-mid.jpg**
The table fills roughly the top 55% of the screen, cropped tighter, with the same flat primitives and blue-grey/magenta backdrop. The top banner reads "BALL 2 - HOLD SPACE, RELEASE TO SERVE", which is keyboard instructions on a touch device. Below the table:
- a stat card grid (Balls Live 0)
- a plunger bar
- an objective line that is clipped and overlapped by a fixed bottom button bar (Left flipper / Right flipper / Plunge / Reset / Pause)

There is no ball on the table. About 45% of the screen is UI.

## 2. Category Scores

| Category | Score | Justification |
|---|---|---|
| environment_world | 2 | Flat-colored box room with line decals; no arcade, no props, no depth. |
| modeling_assets | 2 | Every element is a raw primitive (box, cylinder, prism, capsule); no bevels, caps, skirts, rubbers or wireforms. |
| texture_quality | 1 | No textures at all; the playfield has no art, which is the single most important surface in pinball. |
| material_quality | 2 | Everything is matte single-color plastic; no metal, rubber, glass or lacquer differentiation. |
| pbr_credibility | 1 | No roughness/metalness variation is readable; flippers and rails show no specular response. |
| lighting | 2 | One soft key plus ambient; no GI lights, lamp inserts or neon emission, despite the "neon pinball" pitch. |
| shadows | 1 | No cast shadows from posts, bumpers or flippers; objects float. |
| ambient_lighting | 2 | Uniform ambient fill with no AO in corners, under bumpers or at rail bases. |
| ibl_reflections | 0 | No environment reflections; a pinball table without a glossy playfield or chrome ball is missing its signature look. |
| tone_mapping | 4 | No clipping or crush, but low-contrast and flat, with no HDR highlights to map. |
| color_management | 4 | The palette is coherent (slate/cyan/magenta/tan) but desaturated and muddy; the tan/brown elements fight the neon theme. |
| anti_aliasing | 5 | Edges are reasonably clean at 1080p; the thin rails and line decals show mild stair-stepping. |
| postprocessing | 1 | No bloom, AO, vignette or color grade is evident; the magenta wall gradient is geometry or texture, not post. |
| vfx | 1 | The only candidate is a single thin gold ring in one frame. |
| particles | 0 | None visible. |
| animation_quality | 3 (inferred) | Flipper pose changes are visible; there are no secondary motion cues (bumper pulses, target drops, lamp chases). |
| character_presentation | 1 | The ball is the "hero" and is effectively invisible in every frame. |
| camera | 4 | Shows the whole table legibly but is fully static, too high and too far; the top third is wasted on backdrop. |
| composition | 4 | Symmetric and readable, but the subject is small, the empty grey side decks eat space and the backbox is a dead zone. |
| scale_depth_perception | 3 | No shadows, AO or reflections, so object heights and contacts are hard to read; the table feels like a diorama. |
| atmospheric_effects | 1 | No haze, glow, light shafts or dust; the room has no air. |
| gameplay_readability | 3 | Layout is readable, but you can't find the ball, and score changes have no in-world feedback. |
| ui_hud | 5 | Clean, consistent dark-card panel; the "0 DOWN 5 TO GO" copy is awkward and the panel is generic web-app UI. |
| typography | 5 | Tidy sans with a warm title accent; generic and with no pinball/DMD flavor. |
| polish_juice | 1 | Three desktop frames are nearly identical despite score changes; zero feedback. |
| mobile_presentation | 3 | Table is cropped and small, keyboard prompts appear on touch, the button bar overlaps content, and nearly half the screen is stats. |
| overall_visual_quality | 2.5 | Reads as a programmer-art physics prototype, below the "dated but competent" bar. |

## 3. What Looks Poor and Why

- **Invisible ball.** The most important object in pinball is never clearly on screen. It needs to be a large, bright chrome sphere with a reflection, a contact shadow and ideally a motion trail. As shipped, the game is unreadable as a still.
- **All primitives.** Bumpers are bare cylinders, slingshots are orange wedges, targets are tan cubes and the vault is a dark rectangle. No silhouette has any detail, so nothing reads as a pinball part.
- **"Neon" with no neon.** Cyan and magenta are flat albedo colors. With no emissive-plus-bloom, no light spill and no glow halos, the stated theme doesn't exist visually.
- **Dead playfield.** Real tables are dense printed art under glossy clearcoat with lamp inserts. Here there is one untextured grey plane with no reflections. Grey dominates about 60% of the 3D frame.
- **No grounding.** Zero shadows and zero AO make every object look pasted on, which flattens depth.
- **Static, feedback-free frames.** Scores of 1300 and 1450 change nothing in-world: no lit inserts, flashes, score popups, camera shake or particles.
- **Cheap backdrop.** A blue-grey wall plus gradient walls with diagonal decal lines reads like a placeholder skybox and adds no place or mood.
- **Wasted framing.** The large grey side decks, backdrop above the backbox and right-side panel shrink the actual play area to under half the screen.
- **Mobile layout bugs.** It shows "HOLD SPACE" prompts on a touch device, the fixed button bar clips the objective text, there is no table-side touch zone and the stats grid pushes the table into a small window.
- **Off-theme palette.** The tan/brown bumpers and posts read as wood and cardboard against the neon brief.

## 4. Dominant Causes

| Cause | Share | Notes |
|---|---|---|
| Game scene authoring | 40% | No ball treatment, no lights or inserts, no feedback, no emissives, placeholder room. |
| Weak assets | 30% | Pure primitives, no textures, no playfield art. |
| Engine defaults | 15% | Shadows, environment map, bloom, AO and tone/grade all appear off or at default. |
| Camera/composition | 10% | Static, high, distant; empty margins. |
| Engine rendering limits | 5% | Nothing here approaches a renderer ceiling. |

## 5. Top 6 Highest-Leverage Changes

1. **Make the ball the hero.** Use a chrome sphere (metalness 1, roughness about 0.05) with an HDRI or room environment map, scale it up, and add a blob or contact shadow plus a short emissive trail. This fixes readability on its own.
2. **Real neon via emissive plus bloom.** Make the cyan/magenta trims, flipper edges, bumper rings and lane markers emissive, add selective bloom (UnrealBloom or mipmap bloom) and ACES/AgX tone mapping. Add lamp inserts that light up on banks and targets.
3. **Playfield surface.** Add an authored playfield texture (vault/heist art, insert arrows, lane labels) under a clearcoat material with an environment map, plus a glass layer or a reflection probe. This removes the grey void.
4. **Grounding.** Use one tight-frustum directional shadow map plus SSAO/GTAO or baked AO on static geometry. Cheap, and it immediately fixes depth and contact.
5. **Asset pass on the kit.** Replace each primitive with a modeled part:
   - bumpers with caps, skirts and lit rings
   - slingshots with rubber bands and plastics
   - metal wire rails and ramps
   - a proper drop-target bank
   - an animated vault door in the backbox, with DMD-style score display art
6. **Juice, camera and mobile.**
   - **Juice:** hit flashes, bumper scale-pulse, spark particles, floating score pops, subtle camera shake on nudge and tilt.
   - **Camera:** lower and closer, with a slight ball-follow tilt; crop the empty side decks and replace the room with a dark arcade with depth.
   - **Mobile:** go full-screen portrait table with left/right half-screen touch zones and a swipe plunger, collapse stats into a compact overlay, and swap keyboard copy for touch copy.

## 6. Verdict

**Substantial rebuild.** Gameplay, layout logic and the HUD framework can be kept. Every visual layer needs to be built essentially from scratch: assets, materials, lighting, post, VFX, camera, environment and mobile layout. Polish alone won't get there, because there is almost nothing visual to polish.

## 7. Competitive With a Well-Built Modern three.js Browser Game?

**No.** Competent three.js pinball and arcade work routinely ships chrome balls with environment reflections, bloom-driven neon, textured glossy playfields, shadows and dense hit feedback. All of these are standard, cheap features that this build lacks. Here the ball can't be found, the "neon" doesn't glow, the playfield is a blank grey plane and scoring produces no visible reaction. It reads as an internal physics prototype, not a showcase.
