# 23 — Vision judgment of Aura3D vs three.js r185 same-scene benchmark

Images: `evidence/benchmark/<scene>-side-by-side.jpg`; metrics in `evidence/benchmark/report.json`.

# 01-simple-geometry

# Benchmark audit: 01-simple-geometry

## 1) Image descriptions

### Image 1: Aura3D 3.0.1
- **Subject:** A red cube, green sphere and blue cylinder on a large gray ground plane. Framing and camera match image 2.
- **Materials:** Matte or dielectric. The sphere has a small, tight white specular highlight. The cube and cylinder show only faint specular response.
- **Lighting:** One key directional light from the upper right, plus ambient or IBL fill. The fill is noticeably strong. The cube's left face is mid-dark red (~#600000), not near-black, and the cylinder's shadow side is a saturated mid-blue.
- **Shadows:** Very weak, low-contrast and heavily blurred.
  - The cube shadow is a faint gray smudge.
  - The sphere shadow is a soft, faint ellipse.
  - The cylinder shadow is almost absent: only a thin, faint sliver extends left from its base.
- **Cylinder cap:** The top cap is not visibly rendered. The top edge reads as a flat or slightly concave line in body color, with no lit ellipse.
- **Reflections:** No visible environment reflections on the floor or objects.
- **Background:** Flat dark navy (~#1e212b). The HDRI is not drawn as a backdrop.
- **AA:** Clean edges, no visible stair-stepping. Comparable to MSAA 4x.
- **Tone:** Slightly brighter and more neutral floor gray. Overall lower contrast, which reads as washed out.

### Image 2: three.js r185
- **Subject, camera, background:** Identical to image 1.
- **Materials:** Same look, with a similar sphere highlight. Slightly deeper saturation in the shadowed regions.
- **Lighting:** Same key light direction with less fill. The cube's left face is near-black red and the cylinder's shadow side is deep navy, giving stronger form shading.
- **Shadows:** Dark, well-defined, moderately soft-edged (PCF-soft style).
  - The cube casts a clear dark wedge.
  - The sphere casts a dark ellipse.
  - The cylinder casts a long, dark capsule-shaped shadow to the left.
- **Shadow artifacts:** A small light gap is visible under the sphere and at the cylinder's base, a mild peter-panning or bias artifact.
- **Cylinder cap:** Clearly rendered as a lighter blue elliptical top.
- **Reflections:** None visible, same as image 1.
- **AA:** Clean, equivalent to image 1.
- **Tone:** Floor slightly warmer and darker gray. Higher contrast overall, ACES look more evident.

## 2) Differences

| # | Difference | Classification | Likely cause |
|---|---|---|---|
| 1 | Cylinder top cap missing or not visible in Aura3D | implementation-bug | Cap triangles culled due to wrong winding, flipped cap normals, or a cap primitive/submesh not drawn. three.js renders the cap from the same GLB, so the asset is fine. |
| 2 | Shadow darkness far weaker in Aura3D | major-aura3d-deficiency | Ambient/IBL diffuse added without occlusion and overpowering the shadowed direct term, a shadow intensity/strength scalar below 1, or light intensity unit mismatch (direct too weak relative to IBL). |
| 3 | Shadows over-blurred in Aura3D | major-aura3d-deficiency | PCF/PCSS kernel radius too large for the shadow map texel size, or a too-low-resolution shadow map being upsampled. |
| 4 | Cylinder shadow nearly absent in Aura3D | major-aura3d-deficiency (possible bug) | Excessive normal/depth bias eroding the shadow, shadow camera frustum clipping the cylinder, or the cylinder not flagged as a caster. Verify against the spec. |
| 5 | Lower form contrast in Aura3D: brighter shadow-side faces on the cube and cylinder | minor-aura3d-deficiency | Stronger diffuse IBL/ambient term or different IBL intensity scaling. Possibly irradiance not prefiltered or normalized the same way as PMREM. |
| 6 | Floor tint: Aura3D neutral and lighter, three.js warmer and darker | minor-aura3d-deficiency | Environment irradiance color or intensity handling differs, e.g. an LDR or clamped HDRI losing warm tint. Exposure or tone-mapping input may also differ slightly. |
| 7 | Sphere specular highlight | equivalent | Same size and position. Direct specular BRDF matches. |
| 8 | Light gap under the sphere and cylinder in three.js | aura3d-better (marginal) | three.js shadow bias causes slight peter-panning. Aura3D's blur hides this, but only as a side effect of a worse shadow. |
| 9 | Background color | equivalent | Both use a flat clear color. No HDRI backdrop in either, consistent with the spec. |
| 10 | Antialiasing | equivalent | Both clean, no visible shimmer or jaggies at this resolution. |
| 11 | Geometry, camera, framing | equivalent | Pixel-aligned silhouettes, apart from the missing cap. |

## 3) Scores

| Renderer | Score | Rationale |
|---|---|---|
| Aura3D 3.0.1 | **3.5 / 10** | The content is primitive programmer-art. On top of that, objects look like they float because the shadows are washed out, form shading is flat, and there is a visible geometry bug on the cylinder. It reads as an early tech demo. |
| three.js r185 | **4.5 / 10** | Competent but plainly dated programmer-art. Shadows ground the objects and contrast is correct, but the content ceiling is low and there is mild peter-panning. |

The scene's content caps both scores. The one-point gap reflects real renderer differences: grounding, contrast and geometry correctness.

## 4) Overall classification

**implementation-bug**, with a concurrent major shadow deficiency.

Verdict: On the simplest possible scene, Aura3D fails to draw a cylinder cap that three.js renders from the same GLB, and its shadows are so faint and over-filtered that the objects lose contact with the ground. This baseline should not regress.

## 5) Harness fairness

No sign of a broken harness:
- No black frames, no missing objects, no camera or framing mismatch.
- Identical background and resolution.
- Silhouettes line up pixel-for-pixel.

Before attributing everything to Aura3D, check these:
- **Shadow parameter mapping.** Confirm both renderers get equivalent shadow map size, bias, normal bias, filter radius and shadow camera bounds. Shadow config is the most common source of unequal benchmark setups.
- **Light intensity units.** Confirm the directional light and environment intensity use the same units and conversion in both, such as glTF `KHR_lights_punctual` lux and three.js physically-correct intensity. A mismatch would explain differences 2, 5 and 6 together.
- **Cylinder cap.** Inspect the GLB for a separate cap primitive and for double-sided flags or winding. three.js renders the cap, so the asset itself is valid. Aura3D is likely dropping a primitive or culling incorrectly, but confirm it isn't a harness load-path difference.

# 02-pbr-product

# Benchmark 02-pbr-product: Aura3D 3.0.1 vs three.js r185

## 1) Image descriptions

### Image 1: Aura3D 3.0.1
- Subject: A vintage folding bellows camera on a wooden tripod with a metal pan head, standing on a round pedestal. A flat grey ground plane sits in front of a dark slate backdrop.
- Materials:
  - Leather camera body and black bellows read correctly.
  - Chrome lens and front standard are hot and flat, close to clipped white with little gradient.
  - Tripod wood grain is visible, but the legs show bright, noisy specular streaks, especially on the left leg.
- Pedestal: This is the problem area. It renders as a pale, semi-translucent, frosted-glass-like disc with no clean top/side separation. The left and right silhouette edges are ragged and streaky, with smeared horizontal artifacts around (405–470, 610–650) and (800–870, 600–650). The top ellipse sits lower and reads flatter than in image 2.
- Lighting: The key light is present. Overall tone is slightly brighter and lower-contrast on the props.
- Shadows: Effectively absent. There is no leg shadow on the pedestal and only a faint grey smudge on the ground near (540, 555).
- Reflections: IBL specular appears present on the metals but over-bright. There is no meaningful environment reflection on the pedestal.
- Background: Flat dark backdrop and flat grey floor, identical to image 2.
- AA: Geometric edges on the camera and tripod are acceptable. Pedestal edges are aliased and artifacted.
- Tone: ACES-ish, but highlights on the chrome clip more harshly.

### Image 2: three.js r185
- Subject: Same composition, same camera framing, pixel-aligned.
- Materials:
  - Chrome shows proper roughness gradients and darker reflected regions.
  - Leather texture is crisper.
  - Wood is darker and more natural, with restrained specular.
- Pedestal: An opaque, matte off-white cylinder with a clean top ellipse, a distinct shaded side, and a clean silhouette.
- Shadows:
  - A directional shadow from the tripod legs falls across the pedestal top as a diagonal streak.
  - A cast shadow from the pedestal and tripod lands on the ground at about (490–560, 535–555).
  - The shadow edges show slight stair-stepping on the ground, suggesting low-resolution or PCF-lite filtering.
- Background: Same flat backdrop and floor.
- AA: Clean throughout.
- Tone: Correct ACES rolloff, with better highlight compression on the metals.

## 2) Differences

| # | Difference | Classification | Most likely cause |
|---|---|---|---|
| 1 | Pedestal renders translucent/frosted with ragged, smeared silhouette instead of an opaque solid cylinder | implementation-bug | Material misinterpretation: likely wrong alphaMode/blend, or a transmission/volume path engaged incorrectly. Possibly depth-write disabled on a blended pass or broken transmission sampling at the edges. |
| 2 | Pedestal top surface placement and shape differ (lower, flatter top ellipse) | implementation-bug | Probably a consequence of #1, with the top face blended and the back faces showing through. Could also be culling/winding issues. |
| 3 | No tripod shadow on the pedestal top | major-aura3d-deficiency | Shadow map not applied to this material/pass (e.g., transparent pass doesn't receive shadows), or shadows not enabled/working. |
| 4 | Ground cast shadow nearly absent (faint smudge only) | major-aura3d-deficiency | Shadow casting/receiving broken or extremely weak, possibly bias/normal-offset far too large, or shadow intensity/filtering wrong. |
| 5 | Chrome/metal highlights clipped and flat | minor-aura3d-deficiency | Prefiltered IBL specular mip selection off (roughness→LOD mapping), missing split-sum DFG term, or tonemap applied before/without proper exposure. |
| 6 | Noisy, bright specular streaks on wood legs | minor-aura3d-deficiency | Specular aliasing (no roughness/normal-map filtering), or the roughness texture channel misread (glTF uses the G channel of metallicRoughness). |
| 7 | Leather and wood slightly washed out, lower local contrast | minor-aura3d-deficiency | Missing specular occlusion/AO application, or an sRGB/linear handling slip on the base color or occlusion texture. |
| 8 | Pedestal edge aliasing/streaks | implementation-bug | Same root cause as #1. Blended or refracted pass not antialiased, or MSAA not resolving that pass. |
| 9 | Background, floor, camera framing, overall exposure level | equivalent | — |
| 10 | Mesh geometry, texture presence, and UV mapping on camera and tripod | equivalent | — |

Nothing in image 1 is better than image 2.

## 3) Scores

| Renderer | Score | Rationale |
|---|---|---|
| Aura3D 3.0.1 | 3.5 / 10 | Assets load and PBR basics work, but the hero pedestal is visibly broken and shadows are essentially missing, which kills grounding. Specular is poorly controlled. It reads as a broken tech demo, not a product render. |
| three.js r185 | 6 / 10 | Correct and clean, but the scene is bland: flat backdrop, a single hard shadow with visible stair-stepping, no contact shadows/AO, and no floor reflection. It is competent reference output, not best-in-class product visualization. |

## 4) Overall classification

implementation-bug, with an accompanying major-aura3d-deficiency in shadows.

Verdict: Aura3D misrenders the pedestal material as a translucent, artifacted shape and drops nearly all shadowing, so the product shot looks ungrounded and broken next to a plain but correct three.js reference.

## 5) Harness fairness

- No harness problems are evident. The camera, framing, resolution, backdrop, floor, and exposure match closely, and all objects are present in both frames.
- One thing to verify: check the pedestal's material in the GLB (alphaMode, KHR_materials_transmission/volume, doubleSided).
  - If it declares transmission, three.js may be the one under-rendering it, and the comparison would need re-reading.
  - Even then, Aura3D's ragged silhouette is a bug regardless of intent.
- Also confirm that shadows are enabled identically in both harness configs (castShadow/receiveShadow per mesh and shadow map size), since the ground shadow gap is large enough to be a config mismatch rather than an engine failure.

# 03-damaged-helmet

# 03-damaged-helmet: Aura3D 3.0.1 vs three.js r185

## 1) Image descriptions

Image 1 (Aura3D)
- Subject: Khronos DamagedHelmet, three-quarter view from upper left, centered, same framing as image 2.
- Materials: Worn brushed-metal shell with good albedo and roughness variation. Brass/gold nozzle and bolt caps. Dark glossy visor. Emissive HUD elements (cyan ring, green hex panel, orange triangle) and green eye-lenses.
- Lighting: IBL-dominated with soft fill. The metal reads fairly bright and slightly flat, and the gold nozzle reads bright.
- Shadows: No ground plane and no cast shadow. Self-occlusion comes from the AO map only.
- Reflections: The visor shows a broad, soft, feathered white environment highlight, plus an extra streak near the orange triangle.
- Background: Flat dark blue-gray (~#1b1e23). The HDRI is not drawn.
- AA: Clean edges, no visible aliasing on the silhouette or pipes.
- Tone: ACES look, slightly lifted midtones on the metal, neutral color.

Image 2 (three.js r185)
- Subject, framing, and background match image 1.
- Materials: Same textures. Metal shows slightly more contrast, with darker crevices and crisper scratches. Gold is slightly darker and richer.
- Reflections: The visor highlight is a tighter, sharper-edged vertical shape with a defined left boundary. It reads as a glossy coat reflecting a distinct bright light source.
- Shadows, AA, and tone: Same as image 1. No ground shadow, clean AA, ACES.

## 2) Differences

| # | Difference | Class | Most likely cause |
|---|---|---|---|
| 1 | Visor specular highlight is broader, softer, and more feathered in Aura3D. three.js is sharper and more defined. | minor-aura3d-deficiency | Prefiltered-env roughness→mip LOD mapping differs from PMREM (Aura3D over-blurs low-roughness lobes), or a small env-map rotation/orientation mismatch |
| 2 | Extra white streak on the visor near the orange triangle in Aura3D | minor-aura3d-deficiency | Same as #1 (different region of the HDRI sampled or a wider lobe), possibly env rotation |
| 3 | Metal shell slightly brighter and lower-contrast in Aura3D | minor-aura3d-deficiency | Specular IBL energy/multiscatter compensation or DFG LUT differences, or a small exposure/tonemap offset |
| 4 | Gold nozzle brighter, less saturated in Aura3D | minor-aura3d-deficiency | Same as #3 (F0/IBL specular energy) |
| 5 | Emissive HUD and eye lenses | equivalent | n/a |
| 6 | Albedo, normal, and AO texture detail | equivalent | n/a |
| 7 | Background color, no HDRI backdrop | equivalent | Both follow the same spec, presumably a solid clear color |
| 8 | Edge AA quality | equivalent | n/a |
| 9 | No ground shadow in either | equivalent | No receiver in scene |

No aura3d-better items are visible.

## 3) Scores

| Renderer | Score | Rationale |
|---|---|---|
| Aura3D | 6.5 | Correct, competent PBR of a standard asset. The visor reads a bit mushy and the metal slightly flat. Bare presentation: no backdrop, no grounding shadow, no post (bloom on emissives would be expected in polished work). |
| three.js | 7.0 | Same bare presentation, but a crisper glossy visor and better metal contrast. It is a textbook DamagedHelmet render, not best-in-class staging. |

These are visual judgments from the two frames. I did not measure pixel-diff or luminance values.

## 4) Overall classification

minor-aura3d-deficiency. Aura3D is near-parity on this scene, but its specular IBL is visibly blurrier and slightly over-bright at low roughness, so the visor and metal lose the crispness three.js gets from PMREM.

## 5) Harness fairness

Nothing indicates a broken harness. The frames are non-black, the object is complete in both, and camera, framing, resolution, and background match.

Two caveats:
- The scene doesn't exercise shadows or a visible environment, so it mainly tests IBL specular and tonemapping and is weak as a broad benchmark.
- If the highlight shape difference is caused by env-map orientation rather than prefiltering, that would be a spec-interpretation mismatch (HDRI rotation/axis convention) rather than a quality gap. It's worth checking with a mirror-sphere test scene.

# 04-clearcoat

# 04-clearcoat: Aura3D 3.0.1 vs three.js r185

The scene is the Khronos `ClearCoatTest` grid: 6 rows × 3 columns of capsules on backing panels, with text labels on a dark grey (#2f3136-ish) flat background.

## 1) Image descriptions

**Image 1 (Aura3D)**

- Layout, camera and labels match the reference exactly.
- Row 1 (red): the base-layer cell is a deep, saturated crimson. The coated cell is noticeably lighter and pinkish, with a milky, desaturated veil over the whole panel and capsule.
- Rows 2–6 (blue): a dark navy, clearly darker than the reference.
- Row 3 (roughness variations): the coated and coating-only cells show a uniformly glossy coat with sharp, unbroken highlights. The roughness-texture stripes are absent.
- Rows 4–6 (normal maps): the ridged normal-map detail renders. In row 6 the coated cell shows a mostly smooth coat with weak ring structure, while the coating-only cell does show the rings.
- Coating-only column: black base with white coat specular. This is mostly correct.
- AA is clean on silhouettes, with mild aliasing on the thin ring highlights, comparable to three.js.
- Shadows: none (none expected).
- Background: a flat clear colour, correct for this test.
- Tone: darker overall, with lower mid-tones.

**Image 2 (three.js)**

- Row 1: the base layer is a lighter red-orange. The coated cell is the same hue with crisp, localized coat highlights and no milky veil.
- Blue rows: a brighter, more saturated mid-blue.
- Row 3: the coated and coating-only cells clearly show vertical streaks on the panel and broken, varied highlights on the capsule, i.e. `clearcoatRoughnessTexture` is applied.
- Row 4 (coated): a smooth coat highlight band sits over the ridged base.
- Row 6 (coated): strong coat-normal rings plus panel striping.
- AA quality is equal to Aura3D. Mid-tones are brighter.

## 2) Differences

| # | Difference | Class | Likely cause |
|---|---|---|---|
| 1 | Base diffuse is darker and more saturated in all rows (red and blue) | minor-aura3d-deficiency | Diffuse IBL irradiance scaled low (SH/irradiance-map intensity), or base colour factor/texture colour-space handling (double sRGB→linear) |
| 2 | Row 1 coated cell has a milky, washed-out veil over the entire panel | implementation-bug | Coat IBL specular added without a proper Fresnel/view-dependent term, or prefiltered env sampled at the wrong mip (too rough), producing uniform grey addition instead of grazing-angle reflection |
| 3 | Row 3 shows no visible coat-roughness variation (no stripes, uniform glossy coat) | implementation-bug | `clearcoatRoughnessTexture` is not bound or not sampled (wrong channel; spec uses G), so the coat falls back to the constant factor |
| 4 | Row 3 coating-only highlights are sharp and unbroken, where the reference shows streaks | implementation-bug | Same root cause as #3 |
| 5 | Row 6 coated cell shows weaker coat-normal rings than the reference (coating-only looks closer) | minor-aura3d-deficiency | Coat contribution is attenuated or veiled in the composite path. Coat normal is used in the coat-only debug path but under-weighted when combined with the base, or base attenuation `(1 - Fc)` is applied incorrectly |
| 6 | Row 4 coated: coat highlight over the ridged base is less distinct | minor-aura3d-deficiency | Coat layering/energy balance; possibly base-normal leakage into the coat lobe |
| 7 | Row 2 partial coating: mask boundary present in both | equivalent | `clearcoatTexture` works |
| 8 | Normal-map detail on base (rows 4–5) | equivalent | — |
| 9 | Silhouette AA and label text rendering | equivalent | — |
| 10 | Background, camera and framing | equivalent | — |

No aura3d-better items are visible.

## 3) Scores

- **Aura3D: 4.5 / 10.** It renders the layout and basic coat lobe, but it gets material behaviour wrong in a test whose sole purpose is material correctness. The dropped roughness texture and milky coat would be visible on any real car-paint or lacquer asset.
- **three.js: 6.5 / 10.** It is a correct reference render of a programmer-art test chart. The content caps the ceiling: there are no shadows or environment visible, and highlights are slightly aliased.

## 4) Overall classification

**implementation-bug.** Aura3D's clearcoat ignores `clearcoatRoughnessTexture` and adds a non-Fresnel milky veil, on top of globally darker base diffuse, so it fails the conformance intent of this scene despite matching geometry and layout.

## 5) Harness fairness

There are no signs of a broken harness. Camera, framing, all 18 cells, labels and background colour are identical, and nothing is black or missing. The only global difference is the darker diffuse. If you want to rule out the harness, check that both renderers use the same HDRI intensity and diffuse-IBL scale. It is more likely an Aura3D colour-space or irradiance issue, because the specular highlights are not similarly dimmed.

# 05-transmission

# 05-transmission audit: Aura3D 3.0.1 vs three.js r185

## 1) Image descriptions

Image 1 (Aura3D 3.0.1)
- Subject: Two spherical bowls with gold rims and an etched/printed "glTF" logo, in front of a flat checkerboard backdrop. Framing is identical to image 2.
- Left bowl: Clear, faintly visible glass. The checkerboard shows through undistorted, and the logo is a soft white overlay. It reads as alpha-blended glass and looks essentially the same as in three.js, with the logo slightly more opaque.
- Right bowl: Renders as an opaque, near-black glossy sphere. The white logo and sharp IBL/punctual specular highlights (top-left glint, rim sheen) are drawn correctly. Nothing behind the bowl is visible through it.
- Gold rims: Metallic gold with environment reflection. They are plausible and match three.js closely.
- Backdrop: Checkerboard with a mid-gray light tile (~#9a9a9a) and a dark-gray tile. It is noticeably darker and lower contrast than in three.js.
- Background: Flat slate blue-gray clear color. The HDRI is not drawn as background, consistent with three.js.
- Shadows: None visible. Same in both.
- AA: Clean edges on the rims and silhouette. Comparable to three.js.
- Tone: ACES-looking, but the overall image is darker.

Image 2 (three.js r185)
- Same subject, camera, and composition.
- Left bowl: Faint alpha-blended glass. Logo is a bit fainter than in Aura3D.
- Right bowl: Proper KHR_materials_transmission. The checkerboard is visible through the bowl with slight refraction/blur, the logo sits on clear glass, and a Fresnel rim plus a specular glint are present.
- Gold rims: Equivalent to Aura3D, with a slightly brighter hotspot on the right rim.
- Backdrop: Brighter, higher-contrast checkerboard (light tile ~#c8c8c8).
- Background, shadows, AA: Same as Aura3D.

## 2) Differences

| # | Difference | Classification | Likely cause |
|---|---|---|---|
| 1 | Right bowl is opaque black instead of transmissive glass | implementation-bug (functionally missing transmission) | The diffuse lobe is scaled by (1 − transmission), but the transmitted term samples an empty or black transmission buffer. Possible reasons: the opaque-pass copy is not captured, it is captured before the backdrop draws, it is bound to the wrong texture, or the mip/LOD lookup returns 0. The specular still works, which is why it looks like black lacquer. |
| 2 | No see-through refraction of the checkerboard in the right bowl | missing-capability (consequence of #1) | No screen-space transmission/refraction pass, or one that is broken. |
| 3 | Backdrop checkerboard darker and lower contrast | minor-aura3d-deficiency (possibly bug) | One of: exposure or light intensity mismatch, sRGB decoding applied twice or not at all on the base color texture, a missing IBL diffuse contribution, or a different punctual light unit conversion. The rims look similar, so a texture color-space or diffuse IBL issue is more likely than a global exposure difference. |
| 4 | Left (alpha-blend) bowl logo slightly more opaque | minor-aura3d-deficiency | Blending difference: premultiplied vs straight alpha, or alpha applied before vs after tonemapping. |
| 5 | Right rim hotspot slightly weaker | equivalent / negligible | Minor specular or IBL prefilter differences. |
| 6 | Specular highlights on the right bowl | equivalent | Both render the punctual glint and Fresnel edge. |
| 7 | Faint vertical streak near the bottom of the left bowl in Aura3D | minor-aura3d-deficiency (unconfirmed at this resolution) | Possible sort, depth, or normal-seam artifact in the blended pass. Inspect at full resolution. |
| 8 | Background, shadows, AA, framing | equivalent | — |

Nothing in Aura3D is better than three.js in this scene.

## 3) Scores

- Aura3D: 3/10. The scene exists to test transmission, and the transmissive object is wrong in an obvious, non-subtle way: black glass. Everything else is competent but plain, and the backdrop is dull.
- three.js: 6/10. Correct, clean transmission on a deliberately simple conformance asset. It is not a showpiece. There is no shadowing or grounding, and the lighting is flat.

## 4) Overall classification

implementation-bug. Aura3D runs the transmission material path, since diffuse is suppressed and specular is kept, but the transmitted radiance comes back black. The headline feature of this scene fails visibly.

## 5) Harness fairness

The harness does not look broken:
- Camera, framing, and object set are identical, and no frame is black.
- Both renderers omit the HDRI background, so this is consistent and apparently intended by the spec.

One thing to rule out is the backdrop brightness gap. Confirm that both harnesses use the same output color space, the same toneMappingExposure, and the same light intensity units (three.js r155+ physically correct lights vs Aura3D's convention). If those match, the gap is Aura3D's problem, not the harness's. The black right bowl is not a harness issue: the object is present and lit, and only its transmission term is wrong.

# 06-metal-roughness-sweep

# 06-metal-roughness-sweep: Aura3D 3.0.1 vs three.js r185

## 1) Image descriptions

**Image 1 (Aura3D 3.0.1)**
- Subject: 2×6 grid of spheres. Top row is metallic chrome/silver and bottom row is red dielectric. Roughness increases left to right, from about 0 to 1.
- Materials:
  - The roughness-0 metal shows a sharp HDRI reflection with an interior, window highlights, and a dark horizon band.
  - From roughness ~0.2 to ~0.8, reflections stay as distinct, blotchy, rectangular patches instead of blurring smoothly.
  - The roughness-1 metal is an almost uniform flat gray disc with no visible gradient.
  - The red spheres are a deep, saturated crimson. Glossy ones show sharp highlights. Rough ones look flat and slightly mottled.
- Lighting: IBL-dominated. There is little directional falloff on the rough spheres, so the top-to-bottom shading is weak.
- Shadows: none. There is no ground plane and no contact or self-shadowing.
- Reflections: correct at roughness 0. Mid-roughness reflections look blocky and under-blurred.
- Rim: a bright, light-gray fresnel rim appears on every sphere, including the fully rough ones.
- Background: flat dark slate (~#24272F). The HDRI is not shown.
- AA: silhouettes look stair-stepped or faceted, which is most visible on the right-hand spheres.
- Tone: neutral ACES-like grays. The reds are darker and more saturated than in the reference.

**Image 2 (three.js r185)**
- Same grid, camera, and background.
- Metal row: reflections blur smoothly and progressively with roughness. The rough spheres show soft, correctly convolved environment gradients, lighter on top and darker below. Roughness 1 still has gentle directional shading.
- Red row: brighter orange-red. Roughness transitions are smooth. Diffuse shading is clear, with a lit top and darker bottom-right. The rim fades as roughness increases.
- No shadows or ground. Same flat background.
- AA: smooth, clean silhouettes.
- Tone: ACES, slightly brighter midtones on the dielectrics.

## 2) Differences

| # | Difference | Class | Likely cause |
|---|---|---|---|
| 1 | Roughness-0 metal reflection | equivalent | Same HDRI and orientation, so the environment is wired up correctly |
| 2 | Mid-roughness metal (0.2–0.8) reflections are blocky and under-blurred, with patches instead of smooth lobes | **major-aura3d-deficiency** | Broken or poor specular prefiltering: mips downsampled instead of GGX-convolved, a roughness→LOD mapping that is too low, or no trilinear/seamless cubemap filtering |
| 3 | Roughness-1 metal is a flat, featureless disc | implementation-bug | Last prefilter mip collapsing to ~1×1 (a constant color), or LOD clamped beyond a valid level |
| 4 | Rough red spheres look flat and mottled, with weak top-down diffuse gradient | minor-aura3d-deficiency | Low-quality or low-order diffuse irradiance, or a weak or missing directional/punctual light contribution |
| 5 | Red is darker and more saturated (crimson vs orange-red) | implementation-bug (probable) | `baseColorFactor` treated as sRGB and linearized twice. Alternatively, lower diffuse energy |
| 6 | Bright fresnel rim persists on fully rough spheres | minor-aura3d-deficiency | IBL Fresnel without a roughness term (no Fdez-Agüera/Karis roughness-aware Schlick), or a wrong split-sum BRDF LUT |
| 7 | Glossy dielectric highlights are slightly harder and more blocky | minor-aura3d-deficiency | Same prefilter issue as #2 |
| 8 | Aliased or faceted silhouettes | minor-aura3d-deficiency | No MSAA/FXAA. If the facets are real geometry, the GLB may be tessellated or loaded differently. Verify against the mesh |
| 9 | Background, camera, framing, exposure of neutrals | equivalent | — |
| 10 | No shadows, no ground | equivalent | Not in the scene spec, presumably |

## 3) Scores

| Renderer | Score | Rationale |
|---|---|---|
| Aura3D 3.0.1 | **4/10** | The scene's sole purpose is a roughness sweep, and that is exactly what is broken: blotchy prefiltered specular, a dead roughness-1 end, wrong albedo, rims that ignore roughness, and aliasing. It reads as a hobby-engine IBL. |
| three.js r185 | **7/10** | Textbook-correct PBR sweep with smooth convolution and good AA. It is plain as an image (no ground, no shadows), but it is a correct, professional material chart. |

## 4) Overall classification

**major-aura3d-deficiency.** Aura3D's specular IBL prefiltering does not produce a correct GGX roughness response, which defeats the point of this benchmark, and probable color-space and Fresnel bugs compound the problem.

## 5) Harness fairness

Nothing suggests a broken harness. There is no black frame, and the camera, object count, layout, background, and HDRI orientation are identical. The roughness-0 match also confirms both renderers received the same environment.

Two things are worth checking:
- **Antialiasing:** confirm both renderers had the same AA settings (e.g., three.js `antialias: true` vs Aura3D default). Otherwise difference #8 may be a config gap rather than a capability gap.
- **Background spec:** confirm the spec intends a solid background rather than a displayed HDRI. Both agree, so it is fair either way.

# 07-sheen-fabric

# 07-sheen-fabric: Aura3D 3.0.1 vs three.js r185

## 1) Image descriptions

**Common to both:** The scene matches the Khronos sheen test-grid layout. It shows a 4×4 grid of blue spheres on a grey/white checkerboard backdrop. Columns vary `sheenColorFactor` (0 → 1) and rows vary `sheenRoughnessFactor` (0 → 1). Billboard text labels sit on a flat dark slate background (~#2B2D31). The camera, framing and label placement are identical. Both have clean silhouette AA with no visible jaggies.

**Image 1 – Aura3D**
- All 16 spheres look nearly identical. They are saturated royal blue with a glossy, almost lacquered look and a small sharp environment highlight blob in the upper-left of each.
- Sheen shows up only as a thin cyan rim on columns 0.66 and 1.0, slightly brighter in the top row. Sheen roughness changes nothing visible.
- Sphere shading is flat, with weak top-to-bottom diffuse gradation. The spheres read as glossy plastic, not cloth.
- The checkerboard is noticeably darker: dark squares ~#8F8F8F and light squares ~#CDCDCD. The scene reads slightly dim and low-contrast overall.
- No contact shadows are visible, and none are expected in this layout.

**Image 2 – three.js**
- Spheres have a rough, matte diffuse base with a soft sky-lit gradient: lighter on top, darker underneath. There are no sharp specular blobs.
- Sheen behaves as the spec intends. Column 0 has no sheen. Sheen grows with `sheenColorFactor`, and as `sheenRoughness` increases it spreads from a grazing rim into a broad, fuzzy, cyan velvet-like veil. Sphere (1.0, 1.0) is almost fully light cyan.
- At sheenRoughness 0, sheen is near-invisible. This is correct Charlie-distribution behaviour.
- Row 0.33, columns 0.66–1.0 show visible streaky banding in the sheen lobe. This looks like a sheen IBL/LUT or low-roughness Charlie sampling artifact.
- The checkerboard is brighter: ~#B5B5B5 and ~#E1E1E1.

## 2) Differences

| # | Difference | Classification | Likely cause |
|---|---|---|---|
| 1 | Sheen almost absent. Only a thin rim on high-color columns, no veil, no buildup toward cyan. | **major-aura3d-deficiency** | Sheen implemented for direct/analytic lights only, or Charlie IBL term (prefiltered sheen env + E-LUT) missing. |
| 2 | `sheenRoughnessFactor` has no visible effect (rows identical). | **implementation-bug** | Sheen roughness not read from the material or texture, or the Charlie lobe width is not parameterized by it. |
| 3 | Spheres look glossy with sharp specular highlights; three.js shows a rough matte base. | **implementation-bug** | Base `roughnessFactor` ignored or defaulted low, or wrong prefiltered-env mip selection (roughness → LOD mapping). |
| 4 | Weak diffuse gradation and flatter sphere shading. | **minor-aura3d-deficiency** | Weak or low-order diffuse IBL (SH/irradiance), or the glossy specular dominating the response. |
| 5 | Checkerboard and labels ~15–25% darker. | **minor-aura3d-deficiency** | Exposure or tonemap mismatch (ACES variant or pre-exposure), lower IBL diffuse intensity, or sRGB handling difference on unlit/backdrop materials. |
| 6 | No energy-compensated albedo scaling from sheen (base not dimmed under sheen). | **missing-capability** | No sheen albedo-scaling term (`1 - max3(sheenColor) * E(VdotN)`). |
| 7 | Sheen banding streaks on three.js row 0.33. | **aura3d-better** (trivially) | three.js sheen IBL/LUT artifact. Aura avoids it only because it barely renders sheen, so this is not a real win. |
| 8 | Background color, camera, layout, label geometry, AA. | **equivalent** | n/a |

## 3) Scores (modern browser 3D scale)

- **Aura3D: 3/10.** The scene's only purpose is sheen, and Aura renders a grid of 16 near-identical glossy plastic balls. A second material bug (roughness) makes it worse.
- **three.js: 6/10.** The behaviour is correct and readable, and the fabric look comes through. However, it is a plain test scene, and the visible banding on the 0.33 row is a real artifact that best-in-class work would not ship.

## 4) Overall classification

**implementation-bug** (with major-deficiency severity)

Verdict: Aura3D effectively fails KHR_materials_sheen. Sheen roughness is ignored, IBL sheen is missing, and base roughness appears mishandled, so the test grid conveys none of the intended material variation.

## 5) Harness fairness

Nothing suggests the harness is broken. The frames are not black, all 16 spheres and labels are present, and the camera and resolution match. Background colour matches exactly, so clear colour and output encoding agree.

Two caveats:
- The backdrop brightness gap suggests a possible exposure or tonemap config mismatch. Verify both runners apply the same exposure value and ACES variant before attributing item 5 to the renderer.
- The glossy-base discrepancy is severe enough to rule out a loader issue first: confirm Aura3D is reading `roughnessFactor` / `metallicRoughnessTexture` from the same GLB. Either way, the result is still an Aura3D defect, not a harness one.

# 08-skinned-character

# 08-skinned-character: Aura3D 3.0.1 vs three.js r185

## 1) Image descriptions

**Image 1 (Aura3D 3.0.1)**
- Subject: A low-poly rigged humanoid in T-pose. It is white with blue and green wavy stripes, and its round "head" shows a landscape/logo decal. It stands on a grey ground plane.
- Materials: Matte, rough dielectric. There is no visible specular highlight. Stripe colours are darker and more saturated (mid-blue, olive green).
- Lighting: A soft key light plus ambient/IBL diffuse. The body shows noticeable grey falloff on the flanks, inner legs and arms.
- Shadows: Effectively missing. There is only a small, faint, detached grey smudge left of the left foot. Nothing corresponds to the body, arms or head silhouette.
- Reflections: None visible, which is expected for a rough material.
- Background: Flat dark slate (#20232b-ish). The ground has a mild gradient.
- AA: Clean silhouette edges. Texture stripe edges are smooth and well filtered.
- Tone: Slightly darker and lower-key overall, with whites pulled toward grey.

**Image 2 (three.js r185)**
- Subject, camera, ground and background: Identical framing and composition.
- Materials: Same matte look. Stripe colours are lighter and less saturated (sky blue, lime green). The whites are brighter.
- Lighting: Flatter, brighter diffuse with less shading gradient on the body.
- Shadows: A full, crisp, correctly placed directional shadow falls back-left. The legs, torso, both arms and head are readable, with mild soft edges. It is grounded at the feet.
- AA: Silhouettes are equivalent. Stripe edges show slight stair-stepping/jaggies, consistent with weaker texture filtering or no mipmaps/anisotropy at grazing angles.
- Tone: Brighter, slightly washed. This is closer to the typical ACES look for this asset.

## 2) Differences

| # | Difference | Classification | Most likely cause |
|---|---|---|---|
| 1 | Character shadow essentially absent. Only a tiny detached fragment near the left foot, versus a full silhouette shadow in three.js. | implementation-bug (major) | The shadow depth pass does not apply skinning. It renders the mesh in bind-pose/untransformed space, which for this asset is likely lying flat, tiny or offset, so only a sliver lands in frame. A secondary possibility is a shadow-camera frustum fit to unskinned bounds. Either way, skinned meshes do not cast correct shadows. |
| 2 | Stripe and decal colours darker and more saturated in Aura3D. | minor-aura3d-deficiency (could be equivalent; needs a reference check) | A colour-space difference on the baseColor texture: a double sRGB decode, or a missing/extra linear conversion, or a different ACES variant (fitted vs Narkowicz/three's). Compare against a glTF Sample Viewer reference to determine which renderer is correct. |
| 3 | Whites greyer, with stronger body shading gradient in Aura3D. | minor-aura3d-deficiency | Lower effective exposure or IBL diffuse intensity, or a different irradiance (SH) scale. Possibly the same tonemapping-variant mismatch as #2. |
| 4 | Stripe edges smoother in Aura3D, slightly aliased in three.js. | aura3d-better | Better mip/anisotropic filtering on the base texture in Aura3D, or three.js loading without generated mipmaps in the harness. |
| 5 | Skinning/pose, geometry, camera, background and ground. | equivalent | Skinned vertex deformation in the main pass is correct in both. |
| 6 | Silhouette AA. | equivalent | Same MSAA/FXAA level. |

## 3) Scores

| Renderer | Score | Rationale |
|---|---|---|
| Aura3D 3.0.1 | 3.5 / 10 | Correct skinning and nice texture filtering. However, the missing character shadow makes the figure float, and with this programmer-art asset the frame reads as an early tech demo. |
| three.js r185 | 5 / 10 | Competent and correctly grounded with a proper shadow, but the scene itself is plainly dated, simple and flat-lit. Mild texture aliasing. |

The asset caps both well below 7. Nothing here exercises advanced shading.

## 4) Overall classification

**implementation-bug.** Aura3D deforms the skinned mesh correctly for the camera but not in the shadow pass, so the character casts almost no shadow, which is the dominant quality gap in an otherwise near-identical frame.

## 5) Harness fairness

The harness itself looks fair. Camera, framing, background, ground, asset and pose match exactly, and there are no black frames or missing objects.

There are two caveats:
- The colour and brightness differences (#2, #3) should be checked against a ground-truth reference, such as the Khronos glTF Sample Viewer. That would confirm both harnesses apply the same texture colour space and ACES variant before blaming either side.
- Confirm that three.js's texture aliasing isn't caused by the harness disabling mipmaps. If it is, that slightly handicaps three.js on filtering.

The shadow failure is not a harness issue. three.js renders the shadow from the same light spec, so the light and shadow configuration is clearly valid.

# 09-outdoor-environment

# Benchmark 09-outdoor-environment: Aura3D 3.0.1 vs three.js r185

## 1) Image descriptions

### Image 1: Aura3D 3.0.1

- **Subject:** A flat grass plane with 6 lollipop trees (sphere canopy on a cylinder trunk), 3 pale-blue cubes with small cube "caps", an orange scanned rock and a dark mossy scanned rock. This matches image 2.
- **Materials:** The canopies are matte with a soft diagonal light-to-dark gradient. There is no specular response and the form reads weakly. Trunks are flat brown. The cubes are washed-out pale blue with little face-to-face contrast. Rock 2 is noticeably darker and more contrasty than in three.js.
- **Lighting:** Ambient-dominated and flat. The sun's contribution is weak, so canopies have no clear terminator or core shadow.
- **Shadows:** Present and positioned correctly, matching three.js placement. They are very low contrast and very soft, almost blob-like. Faint dark streaks run along the ground near the horizon on the right (x≈820–1280, y≈345–380), with no matching caster.
- **Reflections:** None visible. There are no IBL specular cues anywhere.
- **Background:** A uniform pale blue-grey. There is no gradient, no clouds and no horizon brightening, so the HDRI does not read as a sky.
- **Atmosphere:** Strong distance haze. Far trees and the horizon fade toward the sky colour, and the ground runs from foggy grey-green at the horizon to darker olive at the bottom. Faint low-frequency mottling is visible in the near ground.
- **AA:** Acceptable. Silhouette edges are clean, with no obvious stair-stepping.
- **Tone:** Low contrast, desaturated and greyed. It looks like a raised black level or heavy fog, not an ACES look.

### Image 2: three.js r185

- **Subject:** Identical layout, camera and object set.
- **Materials:** Canopies have a strong lit-to-shadow gradient, a bright top-right highlight and a deep green core shadow. Trunks show cylindrical shading. Cube faces are clearly separated. Rock textures are well lit and both rocks read as rough stone.
- **Lighting:** A clear directional sun plus IBL fill, giving a convincing outdoor key-to-fill ratio.
- **Shadows:** Darker and moderately soft, with good contact under the trees, cubes and rocks. No artifacts are visible.
- **Reflections:** Subtle IBL specular sheen on the canopies and cubes.
- **Background:** The HDRI sky is drawn: blue at the zenith fading to near-white at the horizon, with a small visible cloud.
- **Atmosphere:** No fog. Far objects stay saturated.
- **AA:** Clean, comparable to Aura3D.
- **Tone:** ACES look with proper contrast and saturation. Exposure looks plausible.

## 2) Visible differences

| # | Difference | Classification | Most likely cause |
|---|---|---|---|
| 1 | Sky is a flat colour, not the HDRI gradient and cloud | **implementation-bug** (or missing-capability) | Background not drawn from the HDRI. Instead it is a clear colour, a very high blurred mip, or an irradiance/SH environment used as background. |
| 2 | Canopies and trunks lack directional form: no terminator, no core shadow | **major-aura3d-deficiency** | Sun intensity too low relative to IBL diffuse, a light unit mismatch (lux vs. unitless), or IBL diffuse over-weighted. |
| 3 | No specular highlight or sheen on canopies and cubes | **major-aura3d-deficiency** | IBL specular missing or very weak: no prefiltered env map or BRDF LUT, or the specular term is not applied. |
| 4 | Shadows much fainter and lower contrast | **major-aura3d-deficiency** | Fill/ambient too high relative to the sun (shadowed regions are over-lit), possibly compounded by over-wide filtering such as large PCF/PCSS radius or low VSM bleeding control. |
| 5 | Weak contact shadowing under cubes and rocks | **minor-aura3d-deficiency** | A consequence of #4, plus possible shadow bias or peter-panning. |
| 6 | Dark streaks on the ground near the right horizon | **implementation-bug** | Shadow-map artifact at grazing angles: cascade/frustum edge, stretched far-tree shadows from low resolution, or acne/bias issues at distance. |
| 7 | Strong distance haze and fog that three.js lacks | **implementation-bug** or harness issue (see §5) | Aura3D is applying fog or aerial perspective not in the spec, or it is in the spec and three.js is not applying it. |
| 8 | Overall greyed, low-contrast, desaturated tone | **major-aura3d-deficiency** | Fog blending plus over-bright ambient. Possibly also tone mapping applied incorrectly: ACES in the wrong space, a missing exposure term, or an sRGB/linear mismatch on output. |
| 9 | Rock 2 albedo darker and more contrasty | **minor-aura3d-deficiency** | Texture colour space mismatch (sRGB treated as linear or vice versa), or simply less light reaching it. Needs isolation. |
| 10 | Ground mottling and darker bottom gradient | **minor-aura3d-deficiency** | Fog gradient plus IBL diffuse variation, or banding from low-precision intermediate buffers. |
| 11 | Geometry, layout and camera | equivalent | — |
| 12 | Anti-aliasing quality | equivalent | — |
| 13 | Any area where Aura3D is better | none found | — |

## 3) Scores

| Renderer | Score | Rationale |
|---|---|---|
| Aura3D 3.0.1 | **3.5 / 10** | Correct scene content, but a flat sky, washed-out lighting, almost no shadow contrast, no specular and a shadow artifact. It reads like an early fixed-function demo with fog. |
| three.js r185 | **5.5 / 10** | Correctly rendered PBR/IBL with a real sky and decent shadows, but the assets are primitive programmer-art. It is a competent baseline, not polished. |

## 4) Overall classification

**major-aura3d-deficiency.** Aura3D renders the right scene but fails the core of an outdoor-environment test: no HDRI background, an inadequate sun-to-IBL balance, missing specular IBL and weak shadows, all under a greyed-out haze.

## 5) Harness fairness

- **No broken frame:** Both frames are populated, the camera matches pixel-for-pixel, and no object is missing.
- **Fog/haze mismatch:** This is the one possible fairness concern. Check whether the scene spec defines fog. If it does, three.js is not applying it and the comparison is partly unfair to Aura3D. If it does not, Aura3D is injecting fog, which is a bug. Either way, resolve it before trusting the tone and contrast comparison.
- **Exposure and lighting units:** Verify the harness passes sun intensity, environment intensity and exposure to both engines in the same units. A unit-conversion error in the Aura3D adapter would produce exactly this flat, ambient-dominated look. That would be a harness bug, not an engine bug.
- **Background flag:** Confirm the harness enables "environment as background" for Aura3D. A missed flag would explain the flat sky.

None of these would account for the missing specular or the horizon shadow streaks. Those are Aura3D-side issues regardless.

# 10-indoor-environment

# Benchmark 10-indoor-environment: Aura3D 3.0.1 vs three.js r185

## 1) Image descriptions

### Image 1: Aura3D 3.0.1

- **Subject:** An untextured box room viewed head-on. It contains:
  - a blocky red sofa (two boxes) on the left,
  - a blue rectangular panel on the back wall,
  - a dark navy rug,
  - a glossy beige sphere on the rug,
  - a brown wooden table with four black cylinder legs,
  - a white cylinder (cup or vase) on the table.
- **Materials:** Flat-albedo PBR with no textures. The sphere has a small specular highlight and dim reflections. Everything else is rough dielectric. The sofa reads as dark, saturated maroon with a pinkish edge highlight on the seat and back tops.
- **Lighting:**
  - Three ceiling hotspots are visible as soft, warm, fairly dim pools that are not clipped.
  - A spotlight pool on the back wall sits left of center behind the sofa and panel.
  - A second spotlight pool on the floor sits right of center under and in front of the table.
  - A diagonal light streak is visible at the upper-left of the ceiling.
  - Ambient fill is warm and moderate.
- **Shadows:**
  - Under the sphere there is a soft contact shadow.
  - The table casts only a very faint, low-contrast, blurred darkening on the floor and rug.
  - No leg shadows or cup shadow are discernible.
  - The sofa casts no distinguishable shadow.
- **Reflections:** Only the sphere shows any, and they are weak. No floor reflections.
- **Background:** Fully enclosed room, so no HDRI is visible.
- **Anti-aliasing:** Clean edges on the table legs, sofa and panel. No visible stair-stepping.
- **Tone:** ACES-like but overall slightly darker and warmer/browner. Highlights are compressed with no clipping.

### Image 2: three.js r185

- **Subject:** Identical geometry, camera and framing.
- **Materials:** Same. The sofa is a lighter, more natural red. The sphere looks the same, with a slightly darker underside.
- **Lighting:**
  - The ceiling hotspots are brighter, with near-white cores that just reach the shoulder of the ACES curve.
  - The back-wall spot pool is brighter and whiter.
  - Ceiling-wall corners are darker, so the room reads with more contrast.
- **Shadows:**
  - The table spotlight casts a crisp, well-defined shadow on the floor: the tabletop rectangle, with the cup's shadow blob visible on it.
  - A clear, darker table shadow falls across the right part of the rug.
  - The contact shadow under the sphere is stronger.
- **Reflections:** Same as Aura3D, sphere only.
- **Background:** Enclosed room.
- **Anti-aliasing:** Comparable to Aura3D and clean.
- **Tone:** ACES with more contrast and brighter highlights. Slightly cooler and whiter in the lit areas.

## 2) Differences

| # | Difference | Classification | Most likely cause |
|---|---|---|---|
| 1 | The table/cup shadow from the floor spotlight is nearly absent in Aura3D (faint smear) but crisp in three.js (tabletop and cup silhouette on floor and rug) | **major-aura3d-deficiency** | Spot shadow is effectively failing. Candidates: excessive filter radius/PCSS blur, too-large shadow bias or normal offset, low shadow-map resolution for the spot, or shadow strength being washed out by ambient/IBL added after shadowing |
| 2 | The table shadow on the rug is much weaker in Aura3D | major-aura3d-deficiency (same root as #1) | Same as #1 |
| 3 | The contact shadow under the sphere is softer and lighter in Aura3D | minor-aura3d-deficiency | Shadow filtering or bias. Possibly no small-scale occlusion, though neither renderer shows obvious SSAO |
| 4 | Ceiling hotspots are dimmer and smaller in Aura3D, with no near-white cores | minor-aura3d-deficiency | Point/spot intensity units or falloff mismatch (candela vs. watt conversion, or a different `range`/decay model), or an exposure difference |
| 5 | The back-wall spot pool is dimmer and browner in Aura3D | minor-aura3d-deficiency | Same light-intensity/units issue as #4 |
| 6 | The sofa is darker and more saturated maroon in Aura3D, with a darker front face | minor-aura3d-deficiency | Lower effective direct light. Possibly sRGB/linear handling of the base color factor, or weaker diffuse IBL fill |
| 7 | Ceiling-corner darkening is less pronounced in Aura3D, so the image looks flatter overall | minor-aura3d-deficiency | Different light falloff, giving a lower-contrast light distribution |
| 8 | Overall frame is about 10–15% darker and warmer in Aura3D | minor-aura3d-deficiency | Exposure/tone-mapping constant mismatch, or the light-unit issue from #4 |
| 9 | Aura3D avoids near-clipping on the ceiling hotspots | aura3d-better (marginal) | Highlights stay compressed rather than approaching white. This is likely a side effect of #4, not a deliberate quality win |
| 10 | The ceiling streak at upper-left is identical in both | equivalent | Content-side light shape or position |
| 11 | Geometry, camera, AA and sphere specular are the same in both | equivalent | n/a |

## 3) Scores

| Renderer | Score | Rationale |
|---|---|---|
| Aura3D 3.0.1 | **3.5 / 10** | Programmer-art content, and the one strong visual cue in the scene (spotlight shadowing) is largely lost. The furniture floats and the image looks flat and muddy. |
| three.js r185 | **4.5 / 10** | The same programmer-art content, but crisp, correct shadows ground the objects and the contrast is better. It is still clearly dated: no GI or bounce, no AO, no textures, and boxy geometry. |

Both scores are capped heavily by the asset itself. Neither image approaches a 7.

## 4) Overall classification

**major-aura3d-deficiency.** This is borderline: the shadow failure is the driver, and the rest is minor tuning. Aura3D renders the scene recognizably, but its spotlight shadows are nearly missing and its lights are under-powered, so the frame is flatter and less grounded than three.js on identical input.

## 5) Harness fairness

There are no signs that the harness is broken:

- The camera, framing, object set and resolution are identical.
- Neither frame is black or partial.
- No objects are missing.
- The light positions match.

The upper-left ceiling streak appears in both, so it comes from the content, not the harness.

One caveat: the brightness gap could partly come from the harness passing light intensity in different units to each engine. That is worth verifying, for example by checking that the glTF `KHR_lights_punctual` candela values are interpreted the same way. The shadow gap cannot be explained by units and is an Aura3D-side issue.

# 11-multiple-lights

# 11-multiple-lights: Aura3D 3.0.1 vs three.js r185

## 1. Image descriptions

### Image 1: Aura3D 3.0.1
- **Subject:** A dark floor slab in front of a dark blue-grey backdrop. Three primitives sit near the centre: a cube, a sphere and a cylinder. Twelve small emissive marker spheres form a ring, one per point light, in blue, cyan, teal, green, yellow, orange, red, white, pink, magenta and violet.
- **Materials:**
  - The floor is a dark, fairly glossy dielectric.
  - The cube is near-black, probably metallic or very dark albedo. It shows only a faint blue rim on its left edge and a dim teal/brown tint on its faces.
  - The sphere is a light, smooth dielectric showing a smooth blend of cyan, yellow and magenta from the surrounding lights.
  - The cylinder is a light dielectric with an orange-to-cyan gradient. Its top cap is dark grey.
- **Lighting:** Only the 12 coloured point lights contribute visibly. There is very low ambient or environment contribution. Falloff is physically plausible: light pools on the floor fade quickly.
- **Shadows:** None visible, from either the objects or the lights.
- **Reflections:** The floor shows elongated specular lobes stretched toward the camera under each light, which is correct GGX behaviour at grazing angles. There are no mirror reflections of geometry and no screen-space reflections.
- **Background:** A flat, near-uniform dark blue-grey. No HDRI is visible.
- **Anti-aliasing:** Clean edges on the primitives and the floor silhouette, with no obvious jaggies.
- **Tone:** ACES-like. Highlights roll off softly, and saturated hues desaturate toward white in the hot cores.

### Image 2: three.js r185
Same scene, camera, layout, materials and light ring as image 1. The lighting, specular lobes, tone mapping and background are essentially identical. The only difference is that the upward-facing surfaces (sphere pole, cylinder cap) are darker, close to black.

## 2. Differences

| # | Difference | Classification | Likely cause |
|---|---|---|---|
| 1 | The sphere's top pole is slightly lighter and greyer in Aura3D, but nearly black in three.js. | minor-aura3d-deficiency (or a neutral spec ambiguity) | Aura3D likely adds a small ambient or diffuse-IBL term, or uses a different irradiance at low exposure. It could also be a hemisphere/ambient default not in the spec. |
| 2 | The cylinder's top cap is dark grey in Aura3D and near-black in three.js. | minor-aura3d-deficiency | Same as row 1: an extra ambient or environment diffuse floor in Aura3D. |
| 3 | Floor specular lobe shape, size and colour. | equivalent | Both use matching GGX and roughness. |
| 4 | Light falloff and range of the floor light pools. | equivalent | Both use the same inverse-square/decay model. |
| 5 | Tone mapping and highlight rolloff. | equivalent | Both apply ACES at the same exposure. |
| 6 | Cube darkness and blue rim. | equivalent | No environment specular in either for a dark metal. |
| 7 | Shadows absent in both. | equivalent | Neither has point-light shadows enabled. It is a spec choice, not a defect. |
| 8 | Background colour. | equivalent | Same clear or backdrop colour. |
| 9 | Anti-aliasing quality. | equivalent | Both use MSAA or similar. |

Overall the deltas are subtle, a few percent of luminance on up-facing surfaces. I found no bugs or missing capabilities.

## 3. Scores

| Renderer | Score | Rationale |
|---|---|---|
| Aura3D | 5 | Technically correct multi-light PBR with good tone mapping. However, the scene is programmer-art primitives with no shadows, GI, reflections of geometry or environment detail, so it reads as a lighting test, not a modern visual. |
| three.js | 5 | Same reasoning. It is marginally cleaner on the up-facing surfaces, but not enough to change the score. |

The scores are capped by scene content, not by renderer quality.

## 4. Overall classification

**Equivalent.** Aura3D matches three.js on multi-light PBR shading, falloff and ACES tone mapping. The only difference is a faint extra ambient lift on upward surfaces.

## 5. Harness fairness

The harness looks fair and working. Both frames have the same camera and framing, no missing objects, no black frames, and matching light positions and colours. The one thing to check is whether the spec intends an HDRI or ambient contribution. Neither image shows a visible environment, and Aura3D's slightly lifted up-facing surfaces suggest the two renderers may disagree about the ambient default. Confirm that the scene file sets the environment and ambient intensity explicitly rather than relying on engine defaults.

# 12-shadows

# Benchmark audit: `12-shadows` (Aura3D 3.0.1 vs three.js r185)

## 1. Image descriptions

**Image 1: Aura3D 3.0.1**
- **Subject:** A light-gray ground slab with five primitives: a tall blue-gray box, a floating purple slab, an orange cylinder, a white sphere and a green cube. The background is flat dark navy.
- **Materials:** Matte, dielectric-looking diffuse surfaces with mild Lambert/GGX gradients. There are no visible specular highlights.
- **Lighting:** A warm spotlight pool sits on the floor at lower-left center. There is low ambient/fill light, and the faces of each object read clearly.
- **Shadows:** One set only, falling toward the upper-left. The shadows are very soft and very low-contrast, barely darker than the lit floor. There is no contact darkening, and the sphere's ground shadow is faint. No shadow from a second light is visible anywhere.
- **Cylinder top:** The cap renders pale gray/white, matching the floor color rather than orange. This suggests the cap is missing or back-face culled, so the floor shows through.
- **Reflections:** None visible, which is acceptable for these rough materials.
- **AA and tone:** Edges are clean and similar to MSAA. ACES rolloff looks plausible, and the image is slightly flat overall.

**Image 2: three.js r185**
- **Subject, camera, background:** Identical object placement, camera and background.
- **Materials:** Same matte look. The cylinder cap is correctly orange/tan and lit from above. The purple slab shows a darker shaded underside edge on its left corner.
- **Shadows:** Two distinct shadow sets.
  - Strong, dark, warm-tinted, hard-edged shadows toward the upper-left from the box, sphere, cylinder and cube. They have clear contact definition.
  - A second, lighter set of soft-ish shadows toward the right and back from the cylinder, cube, sphere and box/slab. The light-gray rectangle behind the box near the slab is one of these.
- **Shadow artifacts:** There is a thin lit gap at the base of the tall box's right side, which looks like slight peter-panning from normal or bias offset. The box shadow also shows a strong dark gradient at its far corner.
- **AA and tone:** Comparable to Aura3D. Overall contrast is higher because of the shadows.

## 2. Differences

| # | Difference | Classification | Most likely cause |
|---|---|---|---|
| 1 | The second light's shadows (rightward set) are completely absent in Aura3D | **missing-capability** / major | Only one shadow-casting light is supported or enabled. Either the multi-light shadow map is not implemented, or the per-light `castShadow` flag from the spec is ignored. |
| 2 | Primary shadows are extremely washed out in Aura3D (low opacity, no contact darkness) | **major-aura3d-deficiency** | Shadow term applied with a reduced intensity, or applied to only part of the lighting (e.g. after ambient/IBL is added at full strength). Over-wide PCF/PCSS kernel or over-large bias could also erase contact. Possibly a shadow-strength default that differs from the spec. |
| 3 | Cylinder top cap renders floor-colored, not orange | **implementation-bug** | Cap primitive or indices dropped during GLB import, flipped winding or normals with back-face culling, or a multi-primitive mesh where only the first primitive is drawn. |
| 4 | Shadow from the floating purple slab is missing in Aura3D | **missing-capability** (same root as #1/#2) | The second light's shadow is missing, or the slab's caster is excluded. |
| 5 | Purple slab underside edge shading is darker in three.js | minor-aura3d-deficiency | Slight normal or lighting difference on thin geometry. It could also be the missing second light's shading. |
| 6 | Shadow edge quality: Aura3D is soft, three.js is hard with a peter-panning gap at the box base | **aura3d-better** (edge quality only) | three.js uses a bias/normalBias offset with PCF. Aura3D's softer filter avoids the gap, but this is moot given #2. |
| 7 | Spotlight pool shape and falloff | equivalent | — |
| 8 | Background, camera, exposure, ACES tone | equivalent | — |
| 9 | Object diffuse shading and colors (excluding the cylinder cap) | equivalent | — |
| 10 | Anti-aliasing | equivalent | — |

## 3. Scores (modern browser-3D calibration)

| Renderer | Score | Rationale |
|---|---|---|
| Aura3D 3.0.1 | **3.5 / 10** | A primitive scene whose entire purpose is shadows, yet the shadows are nearly invisible and one light's shadows are absent. The geometry bug on the cylinder cap is visible at a glance. It reads like an unfinished early tech demo. |
| three.js r185 | **5.5 / 10** | Correct multi-light shadows with proper contact and occlusion, which is competent. Still programmer-art primitives, with hard shadows and a visible bias gap. No soft contact hardening and no AO. Dated but correct. |

## 4. Overall classification

**major-aura3d-deficiency.** Aura3D fails the scene's core test: it drops one shadow-casting light entirely, renders the remaining shadows at a fraction of the correct strength, and loses the cylinder cap geometry.

## 5. Harness fairness

- **No sign of an unfair or broken harness.** Camera, framing, object set, background color, spotlight pool and exposure all match, and neither frame is black or truncated.
- **Things to verify before treating #1/#2 as purely renderer faults:**
  - Confirm the scene spec's per-light `castShadow` and shadow intensity/bias/radius values are actually passed through Aura3D's loader. A dropped config field would produce exactly this result.
  - Check the cylinder mesh in the GLB for multiple primitives or the cap's winding. If three.js renders it correctly from the same file, the bug is in Aura3D's import or culling, not the asset.
- **Not checked from these images:** whether the soft-edge result is a deliberate Aura3D filtering default (PCSS) or a symptom of an incorrectly scaled shadow map or frustum.

# 13-ibl-only

# Benchmark 13-ibl-only: Aura3D 3.0.1 vs three.js r185

## 1) Image descriptions

**Image 1: Aura3D 3.0.1**
- **Subject:** Three spheres on a large grey ground plane. From left to right they are chrome, gold and white diffuse. The camera framing is identical to three.js.
- **Chrome sphere:** Shows a recognisable HDRI reflection with a sky and cloud band, horizon line and ground. Contrast is slightly lower than three.js, and the silhouette is visibly polygonal and jagged.
- **Gold sphere:** Reads as fairly glossy. Cloud detail is visible in the reflection. A bright, compact specular hotspot sits at upper-left, which looks like a punctual-light highlight rather than an IBL lobe. The silhouette is faceted.
- **White sphere:** Nearly flat, washed-out white with a faint highlight. There is almost no irradiance gradient and no blue sky tint from above. The silhouette is faceted, with flat-ish polygon bands visible.
- **Floor:** Light warm grey with a subtle gradient. It is noticeably brighter and less blue than in three.js.
- **Shadows:**
  - Soft elliptical dark patches sit under and behind each sphere. These look like contact, AO or directional shadows.
  - A long thin dark streak runs from behind the white sphere to about x≈1150.
  - A shorter streak appears behind the gold sphere.
  - These are unexpected in an IBL-only scene.
- **Background:** Flat uniform sky blue. The HDRI is not displayed.
- **AA:** Weak. Stair-stepping is visible on the sphere silhouettes and the floor edge.
- **Tone:** Bright, low contrast and slightly flat, with highlights tending toward clipped on the white sphere.

**Image 2: three.js r185**
- **Subject:** The same three spheres, plane and camera.
- **Chrome sphere:** A crisp, high-contrast HDRI reflection with clouds, horizon and ground. The silhouette is smooth.
- **Gold sphere:** Rougher. The reflection is a blurred broad lobe from the prefiltered environment, with a warm highlight upper-right and darker lower hemisphere. There is no hard hotspot.
- **White sphere:** Proper diffuse irradiance, running from bluish-cool upper-left to bright white right. It reads as a correctly lit Lambertian or rough dielectric.
- **Floor:** Cooler, darker blue-slate grey, lit by sky irradiance. It is uniform with no shadows, which is consistent with no punctual lights and no AO.
- **Background:** The HDRI is drawn, showing a cloudy pale sky with a horizon haze.
- **AA:** Clean, smooth silhouettes.
- **Tone:** Balanced ACES with no clipping and natural contrast.

## 2) Differences

| # | Difference | Class | Likely cause |
|---|---|---|---|
| 1 | Background is a flat blue color instead of the HDRI | **missing-capability** (or harness config) | Environment not rendered as background / skybox pass missing; fallback clear color used |
| 2 | Sphere silhouettes are faceted/polygonal; three.js is smooth with the same GLB | **implementation-bug** | Wrong mesh/LOD/primitive substituted, index/normal import issue, or geometry not loaded from the GLB as specified |
| 3 | Jagged edges on spheres and floor edge | **minor-aura3d-deficiency** | No or weak MSAA/FXAA/TAA |
| 4 | White sphere is flat and washed out, with no sky-tinted irradiance gradient | **major-aura3d-deficiency** | Weak or incorrect diffuse IBL (low-order or averaged SH, missing irradiance convolution), plus excess ambient |
| 5 | Gold is glossier, with a sharp hotspot | **implementation-bug** | Roughness not honored (wrong mip selection in prefiltered env) and/or a default/stray punctual light added to an IBL-only scene |
| 6 | Shadows and contact darkening under spheres | **minor-aura3d-deficiency** relative to spec (would be aura3d-better if it is intentional SSAO) | A shadow-casting light active despite IBL-only spec, or a contact-shadow/AO pass |
| 7 | Long thin dark streak behind the white sphere, smaller one behind gold | **implementation-bug** | Shadow-map artifact at grazing light angle (peter-panning or stretched shadow) or an AO ray artifact |
| 8 | Floor is brighter and warmer grey versus three.js's blue-slate | **minor-aura3d-deficiency** | Diffuse IBL not picking up sky color, extra ambient term, or exposure/tone mapping mismatch |
| 9 | Chrome reflection has lower contrast | **minor-aura3d-deficiency** | LDR or clamped environment, or a different tone-map/exposure path on specular |
| 10 | Chrome reflection content and orientation match | **equivalent** | Environment orientation and specular mip 0 sampling are correct |
| 11 | Camera, framing and object placement match | **equivalent** | n/a |

## 3) Scores

| Renderer | Score | Rationale |
|---|---|---|
| Aura3D 3.0.1 | **3.5 / 10** | Faceted geometry, no HDRI background, flat diffuse IBL, wrong roughness on gold, stray shadow artifacts and weak AA. Chrome is the only element that holds up, and the whole image reads as an older tech demo. |
| three.js r185 | **6 / 10** | Correct, clean PBR IBL with proper diffuse and specular, smooth AA and the HDRI backdrop. The scene is minimal (no AO or contact grounding, so the spheres float), which caps it near competent rather than showcase. |

## 4) Overall classification

**major-aura3d-deficiency.** Aura3D gets the mirror reflection right but fails the core of an IBL-only test: diffuse irradiance, roughness-filtered specular and HDRI background are wrong or absent. It also shows geometry and shadow bugs that three.js does not.

## 5) Harness fairness / sanity

The frames are not black, all objects are present and the camera matches. Several things still suggest the inputs or config may not be identical:
- **Faceted spheres from the "same GLB"** are the biggest flag. Verify Aura3D loaded the GLB mesh and not a procedural or low-poly fallback, and check vertex counts in both runs.
- **Shadows and a hotspot in an "IBL-only" scene** suggest Aura3D injects a default light, or the harness passes lights it shouldn't. Confirm the light list is empty for both renderers.
- **Missing background** may be a harness flag (for example, `scene.background = envMap` set only for three.js) rather than an engine limitation. Check whether Aura3D was asked to draw the environment.
- **Floor color difference** may be a material or exposure mismatch. Confirm that the floor base color, exposure value and ACES variant are equal on both sides.

If items 1, 5 and 6 turn out to be harness configuration issues, the deficiency would narrow to geometry, AA, diffuse IBL and roughness handling. That is still a major deficiency.

# 14-particles

# Benchmark audit: 14-particles (Aura3D 3.0.1 vs three.js r185)

## 1. Image descriptions

**Image 1 (Aura3D 3.0.1)**
- Subject: none visible. The frame shows only a ground plane and the background. There are no particles.
- Materials: the floor is a matte, mid-dark gray with a dielectric look. No specular highlight is visible.
- Lighting: a smooth diffuse gradient on the floor, brightest toward the upper-right/back-center and falling off toward the camera. This reads as a point or spot light, or IBL diffuse.
- Shadows: none. There is nothing to cast them.
- Reflections: none visible.
- Background: flat near-black blue (~#05060A). There is no visible HDRI.
- AA: the floor edges against the background are clean, with no visible stair-stepping.
- Tone: very low key, with neutral and slightly cool grays. There is no banding visible on the floor gradient.

**Image 2 (three.js r185)**
- Subject: a few thousand small amber/gold point sprites forming a roughly cylindrical column or fountain volume. The column is dense at the top (y≈100–300 px) and sparser near the floor (down to y≈600). A few stragglers sit outside the main volume.
- Materials: the particles are unlit, emissive-looking round sprites of about 2–4 px. Overlapping sprites brighten, which suggests additive blending. The floor renders as essentially pure black.
- Lighting: the floor receives no visible light, and the particles do not illuminate anything.
- Shadows: none.
- Reflections: none.
- Background: the same near-black blue as Aura3D. Floor and horizon geometry are identical in position.
- AA: the sprites have soft round edges, and the floor edges are clean.
- Tone: warm particle color against a black scene. There is no bloom or glow halo, and no depth-based size or fade variation is obvious.

## 2. Differences

| # | Difference | Classification | Most likely cause |
|---|---|---|---|
| 1 | The particle system is entirely absent in Aura3D. | **implementation-bug** (or missing-capability if Aura3D has no point/sprite path) | One of these: (a) the particle system was not drawn at all, e.g. unsupported glTF `POINTS` mode, an extension, or a custom emitter in the spec; (b) WebGPU `point-list` topology, which is fixed at 1 px, so points may be sub-visible or culled; (c) the simulation was not stepped before capture (t=0, emitter empty); (d) the blend or depth state rejects the sprites, e.g. alpha=0 or depth-tested behind the floor. |
| 2 | The floor is lit gray in Aura3D and black in three.js. | Ambiguous: **minor deficiency on one side**; the scenes are not lit identically | One renderer applies a light or IBL diffuse to the floor that the other does not. Possible causes: different light intensity units (candela vs watt/legacy `physicallyCorrectLights`), an HDRI used for diffuse in one but not the other, or a floor material mismatch. The Aura3D result is arguably the more "correct" result if the spec includes a light. |
| 3 | No particle glow or bloom in either. | equivalent (n/a in Aura3D) | Neither has a bloom pass. This is not attributable to Aura3D. |
| 4 | Background color and horizon position match. | equivalent | The camera, clear color, and exposure appear consistent. |
| 5 | Edge AA on the floor quad. | equivalent | Both use MSAA or equivalent. |

## 3. Scores

| Renderer | Score | Rationale |
|---|---|---|
| Aura3D 3.0.1 | **1 / 10** | The scene's entire subject is missing. A lit floor plane is placeholder-level output. |
| three.js r185 | **4 / 10** | The particle effect works but is basic. It uses flat, unlit point sprites with no bloom, soft particles, size attenuation variance, lighting interaction, or floor response. That is serviceable but well below modern shipped particle work. |

## 4. Overall classification

**implementation-bug** (major). Aura3D fails to render the particle system that defines this scene, so the comparison has nothing to compare.

## 5. Harness fairness

Yes, there are signals worth checking before treating this as a pure Aura3D defect:

- **Lighting mismatch:** the floor is lit in Aura3D and unlit in three.js. Light or IBL setup is not being applied identically. The cause is either the unit conversion in the harness or a scene-loader difference, so the "same spec" claim is not fully holding.
- **Simulation timing:** if the particles are CPU- or GPU-simulated, check that both renderers advance the same number of steps or the same elapsed time before capture. A t=0 capture with an empty emitter would explain image 1 exactly.
- **Point primitive support:** if the GLB uses `mode: POINTS` and Aura3D runs on WebGPU, points are fixed at 1 px, and the harness may need to require a sprite or instanced-quad path. Check whether Aura3D logs a warning or skips the primitive.
- **Camera:** this is not the problem. The horizon, floor extents, and background are pixel-aligned between the two images.

Recommended next step: dump Aura3D's draw-call list for this frame. If there is no particle draw, the problem is loader or emitter support. If the draw exists, inspect its point size, blend state, and depth state.

# 15-animation-skinning

# 15-animation-skinning: Aura3D 3.0.1 vs three.js r185

## 1) Image descriptions

**Image 1 (Aura3D 3.0.1)**
- Subject: a skinned armored soldier mid-walk on the left and the low-poly Khronos Fox mid-trot on the right. Both are in the same pose and frame as three.js.
- Materials: the soldier has tan armor plates with dark scuffs and red accent stripes over dark undersuit and joint pieces. The armor reads fairly flat and matte, with limited normal-map and specular breakup. The fox is flat-shaded orange, white and dark brown, and looks correct.
- Lighting: soft key light from the upper left plus ambient or IBL fill. Overall exposure is close to three.js.
- Shadows: soft, low-contrast, heavily blurred blobs. The soldier's leg silhouettes are largely lost in the shadow, and contact darkening under the boots and fox paws is weak. The shadows are slightly shorter than in three.js (soldier's shadow ends at about x≈490 vs ≈525, fox's at about ≈1145 vs ≈1170).
- Reflections: none visible on the ground. Specular response on the armor is subdued.
- Background: flat dark navy clear color with no visible HDRI backdrop, and a uniform mid-grey ground plane with a hard horizon edge.
- AA: clean edges with no obvious aliasing or shimmer.
- Tone: neutral ACES-like response, with the armor beige slightly warmer and more saturated.

**Image 2 (three.js r185)**
- Subject: identical, with the same frame, pose and camera.
- Materials: the armor shows more surface detail, including visible scratches, edge wear and tonal variation from normal and roughness maps picking up specular. The fox matches Aura3D.
- Lighting: same setup.
- Shadows: crisp, dark, well-defined PCF-style shadows. Individual legs, the soldier's stride and the fox's legs are clearly readable, and the shadows ground the characters.
- Reflections: none on the ground. Armor specular is modestly stronger.
- Background: same navy clear color and grey plane.
- AA: comparable to Aura3D.
- Tone: neutral ACES, with slightly less saturated armor.

## 2) Differences

| # | Difference | Classification | Likely cause |
|---|---|---|---|
| 1 | Aura3D shadows are much softer and lighter, and limb silhouettes are lost | minor-aura3d-deficiency (borderline major for grounding) | Overly large PCF/PCSS filter radius or blur kernel, a low-res shadow map compensated by blur, or a shadow intensity below 1 |
| 2 | Weak contact shadow under feet and paws in Aura3D | minor-aura3d-deficiency | Same filter blur washing out near-contact occlusion; possibly a shadow bias or normal-offset causing slight peter-panning |
| 3 | Shadow projection length differs (Aura3D shorter) | minor-aura3d-deficiency / possible implementation-bug | Light direction or shadow-camera transform interpreted differently, or a bias offset shifting the shadow. Worth checking the directional light vector |
| 4 | Armor surface detail is flatter in Aura3D | minor-aura3d-deficiency | Weaker IBL specular, normal-map scale or tangent handling, or roughness-map channel usage (glTF G channel) |
| 5 | Armor slightly warmer and more saturated in Aura3D | equivalent / negligible | Minor tone-map or sRGB conversion variance |
| 6 | Fox shading and colors | equivalent | — |
| 7 | Skinning and animation pose | equivalent | Both sampled at the same time; no visible skinning artifacts such as candy-wrapping or detached verts |
| 8 | Background, ground and AA | equivalent | — |

## 3) Scores

- **Aura3D: 4.5 / 10.** Skinning is correct, but the staging is programmer-art: flat clear color, featureless plane, and mushy shadows that undermine grounding.
- **three.js: 5.5 / 10.** It is the same dated staging, but crisp shadows and better material detail make it read as competent.

Neither image approaches 7. The scene has no environment backdrop, no ground material and no AO.

## 4) Overall classification

**minor-aura3d-deficiency.** Aura3D skins and animates both models correctly and in sync, but its over-blurred, lighter, slightly misprojected shadows and flatter armor specular make it visibly weaker than three.js on an otherwise identical frame.

## 5) Harness fairness

The harness looks fair. Both frames show the same animation time, camera, framing, exposure and object set, with no black frame or missing mesh. The one item to check is the shadow-length mismatch (difference 3). If it comes from the harness passing the light direction or shadow-camera parameters differently to each renderer, it is a harness issue. Otherwise it is an Aura3D bug in its shadow or bias handling. Either way, it does not invalidate the comparison.

# 16-instancing

# Benchmark audit: 16-instancing (Aura3D 3.0.1 vs three.js r185)

## 1. Image descriptions

**Image 1: Aura3D 3.0.1**
- **Subject:** A dense field of small box instances in random blue, indigo, violet and teal colours. The field forms a compact square in the centre of the frame, roughly 465 px wide, covering only about a quarter to a third of the ground plane's width. The boxes read as short, stubby cubes, and height variation is only noticeable on the front edge.
- **Materials:** Flat, matte dielectric look. There is no visible specular highlight or environment reflection.
- **Lighting:** Directional light gives a lighter top face and darker side faces. Contrast is low and the field reads as a noisy, almost 2D texture from this distance.
- **Shadows:** None visible, either on the ground plane or between instances.
- **Reflections:** None.
- **Background:** Flat dark blue-grey (about #1b1e25). The large ground plane (about #1f1f1f) has a very faint radial falloff and its far edge sits at y≈160.
- **AA:** Acceptable on the plane edges. The front edge of the instance field shows aliasing and shimmer-prone sub-pixel geometry.
- **Tone:** Dark, slightly crushed, with moderately saturated instance colours.

**Image 2: three.js r185**
- **Subject:** The same box instances, but as tall rectangular pillars with clear height variation. They fill the entire ground plane and run past the left, right and bottom frame edges. Their far boundary aligns with the plane's far edge at y≈160.
- **Materials:** Matte dielectric, the same colour palette, no visible specular or IBL sheen.
- **Lighting:** Directional key light. Tops and lit sides are clearly separated from dark shaded sides, which gives a strong sense of depth.
- **Shadows:** Gaps between pillars are very dark, which could be shadowing or simply unlit sides. No crisp cast shadows are identifiable.
- **Reflections:** None.
- **Background:** The same flat dark blue-grey and the same ground plane, almost entirely covered.
- **AA:** Clean edges, with mild aliasing on distant thin pillar edges.
- **Tone:** Dark ACES look with a similar exposure to Aura3D.

## 2. Differences

| # | Difference | Classification | Most likely cause |
|---|---|---|---|
| 1 | The instance field covers about 1/4–1/3 of the plane's width in Aura3D versus the whole plane in three.js. The camera and plane are identical, so the instance positions are wrong. | **implementation-bug** | The instance translation is being scaled down, most likely in one of these ways: the instance/node scale is applied to translation twice, the parent node transform is applied in the wrong order (scale×translate instead of translate×scale), or EXT_mesh_gpu_instancing TRS is composed incorrectly. |
| 2 | Instance geometry is short, stubby cubes in Aura3D versus tall pillars in three.js. Per-instance height scale appears lost or reduced. | **implementation-bug** | Per-instance non-uniform scale is dropped or mis-composed, consistent with a broken instance-matrix build (for example a row/column-major mix-up or only reading the uniform scale component). |
| 3 | Depth readability: Aura3D looks like a flat noisy carpet, three.js reads as a 3D city of pillars. | Downstream of #1 and #2 (**implementation-bug**) | This follows from the wrong scale and spacing, not from the shading itself. |
| 4 | Top/side face shading contrast is slightly lower in Aura3D. | minor-aura3d-deficiency (low confidence) | Hard to judge at this scale. It could be a weaker key light or ambient/IBL diffuse balance. Re-check once the transforms are fixed. |
| 5 | Inter-instance darkening is clearly present in three.js and not discernible in Aura3D. | minor-aura3d-deficiency (unconfirmed) | It may be shadowing between pillars or just the side-face orientation. This cannot be evaluated because the Aura3D instances are too small. |
| 6 | Instance colour palette and distribution match. | equivalent | Per-instance colour attribute works correctly. |
| 7 | Background colour, ground plane, exposure and ACES tone match. | equivalent | Environment, tonemapping and camera are consistent. |
| 8 | Specular, IBL reflections and visible shadows on the ground are absent in both. | equivalent | Either the scene spec has none, or both renderers suppress them equally. |
| 9 | Aura3D shows more aliasing on the field's front edge. | minor-aura3d-deficiency | The sub-pixel geometry density is caused by the scale bug. MSAA appears comparable otherwise. |

## 3. Scores

| Renderer | Score | Rationale |
|---|---|---|
| Aura3D 3.0.1 | **2.5 / 10** | The core feature under test, instanced transforms, is visibly wrong. The output is a tiny flat colour patch on an empty plane and does not reproduce the intended scene. |
| three.js r185 | **4.5 / 10** | It is correct, but the scene itself is plain programmer art: unlit-looking flat-colour boxes, no visible shadows, no reflections, and an empty dark background. It is competent but dated. |

## 4. Overall classification

**implementation-bug.** Aura3D renders the correct number of instances with correct colours but mis-composes their transforms: positions are shrunk about 3–4× and per-instance height scale is lost. As a result, the instancing scene fails to match the reference.

## 5. Harness fairness

There is no sign that the harness is broken. The ground plane silhouette, far-edge position (y≈160), background colour and exposure are pixel-aligned across both images, so the camera, framing and environment are identical. Neither frame is black and no objects are missing.

The one caveat is spec ambiguity. If the harness feeds instance transforms through a custom path rather than GLB EXT_mesh_gpu_instancing, verify that both adapters receive the same matrix layout (column-major) and units. A harness-side transpose or scale conversion in the Aura3D adapter would produce exactly this symptom.

Recommended check: dump the first few instance matrices as Aura3D's GPU buffer sees them and diff them against three.js `InstancedMesh.instanceMatrix`.

# 17-large-environment

# Benchmark 17-large-environment: Aura3D 3.0.1 vs three.js r185

## 1) Image descriptions

### Image 1: Aura3D 3.0.1
- **Subject:** A procedural city of roughly 400–500 extruded box towers on a square ground plane. The camera looks down at about 35–40° from a corner-ish elevated position. The scene is cropped so the plane edges run off-frame left and right.
- **Materials:** Flat, rough dielectric boxes in four palette tints: off-white, light blue-gray, slate blue, and tan. There is no visible specular highlight, roughness variation, or texture.
- **Lighting:** The sun and sky give low-contrast shading. Lit and unlit faces differ only slightly, which makes towers read as flat cutouts in many places. The overall image looks hazy and washed out, as if ambient/IBL diffuse dominates the directional term.
- **Shadows:** Cast shadows are absent or nearly invisible. The alleys are uniformly dark because the ground albedo itself is dark, not because towers occlude it. No contact or ambient-occlusion darkening is visible at tower bases.
- **Reflections:** None visible, which is expected for rough materials.
- **Background:** A flat pale blue sky (#a6bcd4-ish) that is slightly lighter and more washed than three.js. The ground plane is a darker, bluish slate (#4a5058-ish).
- **AA:** Edges are slightly soft, consistent with MSAA plus a mild post filter. Thin far towers show minor stair-stepping.
- **Tone:** Low contrast, lifted midtones, and slightly desaturated. It does not look like a punchy ACES curve.

### Image 2: three.js r185
- **Subject/camera:** Identical geometry, layout, and framing, with pixel-aligned silhouettes.
- **Materials:** Same palette, but the tints read more saturated and distinct. Slate towers are noticeably bluer and tan is warmer.
- **Lighting:** Clear key-light direction. Sun-facing faces are bright and shadowed faces are clearly darker, so every tower has readable 3D form.
- **Shadows:** Clearly visible cast shadows from towers onto the ground and onto neighbouring towers, for example near (600,320), (430,520), (590,560), and (870,540). The shadows are tinted blue by sky IBL fill, which is physically plausible. They have soft-ish PCF edges with no obvious acne or peter-panning.
- **Reflections:** None visible, as expected.
- **Background:** Same sky, slightly more saturated (#9fb6d0-ish). The ground is a neutral mid-gray (#5a5c60-ish).
- **AA:** MSAA-quality edges. There are minor jaggies on thin distant towers in the top right, comparable to Aura3D.
- **Tone:** Proper ACES look with higher contrast, deeper shadows, and clean highlights.

## 2) Differences

| # | Difference | Classification | Most likely cause |
|---|---|---|---|
| 1 | Cast shadows from towers are absent or nearly invisible in Aura3D, but clearly present in three.js | **major-aura3d-deficiency** (possibly **implementation-bug**) | Shadow map not rendered, or not applied for this scene scale. Likely causes: shadow camera frustum not fit to a large environment, cascades missing, too-low shadow intensity, or shadows disabled for instanced or merged meshes. |
| 2 | Lit vs unlit face contrast is much weaker in Aura3D, so forms read flat | major-aura3d-deficiency | Directional light under-weighted relative to IBL diffuse, or IBL diffuse too strong. Could also be a punctual light intensity unit mismatch (lux vs. arbitrary units). |
| 3 | Overall image is lower contrast and hazier with lifted midtones | minor-aura3d-deficiency | Tone mapping or exposure mismatch: ACES not applied identically, double sRGB encode, or exposure applied pre/post differently. |
| 4 | Ground plane is darker and bluer in Aura3D, neutral gray in three.js | minor-aura3d-deficiency | Ground albedo is being tinted by IBL diffuse differently (SH projection error), or there is a color-space error on the base-color factor. |
| 5 | Building tints are less saturated and less distinct in Aura3D | minor-aura3d-deficiency | Same tone or color-space issue as #3. Base-color factors may be linearized incorrectly. |
| 6 | Sky background is slightly lighter and more washed in Aura3D | minor-aura3d-deficiency | Background not passed through the same exposure/tone curve, or LDR background sampling. |
| 7 | No blue-tinted shadow fill in Aura3D (follows from #1) | major-aura3d-deficiency (same root cause as #1) | Shadows absent, so occluded regions never show the sky-only lighting term. |
| 8 | Edge AA quality | equivalent | Both use MSAA-class AA with similar residual aliasing on distant thin geometry. |
| 9 | Geometry, instance layout, and camera | equivalent | No instancing or transform errors. Silhouettes match. |
| 10 | Specular and reflections | equivalent | Rough dielectrics in both, with no visible specular in either. |

## 3) Scores

| Renderer | Score | Rationale |
|---|---|---|
| Aura3D 3.0.1 | **3.0 / 10** | Flat-shaded boxes with no visible shadows and weak directional lighting. It reads like an early tech demo or a placeholder blockout. |
| three.js r185 | **4.5 / 10** | Correct, clean shadows and good form readability, but the content is still untextured programmer-art boxes with no AO, fog, or atmosphere. The scene content caps the ceiling. |

## 4) Overall classification

**major-aura3d-deficiency**

Verdict: identical geometry and camera, but Aura3D fails to render visible cast shadows and under-weights the sun, producing a flat, washed-out city where three.js delivers readable, properly shadowed forms.

## 5) Harness fairness

- There is no evidence that the harness is broken. Neither frame is black, no objects are missing, and the camera, framing, and instance layout match pixel-for-pixel.
- One item is worth verifying because it could indicate a spec-translation issue rather than a renderer flaw. The ground color and sky brightness differ in a way consistent with different light intensity units or exposure handling. Check that the harness maps the light intensity spec to each engine's units equivalently (three.js physically-correct lights vs. Aura3D's convention).
- Also confirm that shadows are explicitly enabled in the Aura3D scene config (`castShadow`/`receiveShadow` equivalents on the instanced towers and ground). If the harness omits that for Aura3D, #1 is a harness bug. If it's set, #1 is an Aura3D bug, most likely shadow frustum fitting for large scenes.

# 18-game-scene

# 18-game-scene: Aura3D 3.0.1 vs three.js r185

## 1. Image descriptions

### Image 1: Aura3D 3.0.1
- **Subject:** Rear three-quarter view of an armored soldier (cream/tan plating, dark teal undersuit) standing on a flat green ground plane. Around him are three pale-blue box stacks with small cap cubes, two grey cylindrical pillars, two orange rocks (back-left and back-right), a grey/green mossy rock (mid-right), and three cyan emissive orbs floating at mid-height.
- **Materials:** The character reads correctly as PBR with albedo and normal detail, but the plating looks slightly flat and lower-contrast. Boxes are flat matte light-blue. Pillars are matte grey. The back-right orange rock looks smoothed and less detailed than three.js. The mossy rock has visible texture.
- **Lighting:** Directional key light plus ambient/IBL fill, slightly cooler and more desaturated overall. The ground is a darker, muddier olive green.
- **Shadows:** Very soft and low-contrast. The character's shadow is a diffuse smear with no recognisable silhouette, and box and rock contact shadows are faint. A long dark diagonal band runs from the right pillar/box area out to the right edge of the frame near the horizon, with no matching occluder.
- **Reflections:** None visible. Surfaces are mostly rough, so this is expected.
- **Background:** Pale blue-grey sky gradient with heavy distance fog. The ground fades into haze at the horizon.
- **Bloom/emissive:** The orbs have a large, strong cyan halo that bleeds well into the surrounding area.
- **AA:** Clean. No obvious aliasing on box or pillar edges.
- **Tone:** ACES-looking. Slightly hazier and lower-contrast than three.js.

### Image 2: three.js r185
- **Subject/composition:** Identical. Same objects, positions, and camera.
- **Materials:** The character has clearer plating contrast and darker grey undersuit detail. The back-right orange rock shows proper texture and normal detail. The mossy rock is equivalent.
- **Lighting:** Same key direction. The ground is a brighter, warmer olive green.
- **Shadows:** Crisp PCF-soft shadows with defined silhouettes. The character's shadow clearly shows legs and torso. Boxes, pillars, and both orange rocks cast short, readable shadows to the right. There is no long band artifact.
- **Background:** Same sky and fog. A faint large circular arc is visible in the sky, likely a fog/skydome or bloom-mip boundary.
- **Bloom:** Tighter orb halos with a smaller radius.
- **AA:** Clean.
- **Tone:** ACES, a touch more contrast and saturation.

## 2. Differences

| # | Difference | Classification | Likely cause |
|---|---|---|---|
| 1 | Character and object shadows extremely blurred and low-contrast, silhouette lost | **major-aura3d-deficiency** | Over-wide PCF/PCSS kernel or low shadow-map resolution and coarse cascade. Possibly shadow strength/ambient term washing it out. |
| 2 | Long dark diagonal band on ground at right, toward the horizon | **implementation-bug** | Shadow-map projection or cascade-boundary artifact. Could also be a pillar shadow cast with wrong light-space bounds or clamp-to-edge outside the shadow frustum. three.js shows no such band under the same light. |
| 3 | Short contact shadows of pillars and orange rocks missing or very faint | minor-aura3d-deficiency | Same cause as #1. Also possibly insufficient bias tuning (peter-panning). |
| 4 | Orb bloom halo much larger and stronger | minor-aura3d-deficiency | Bloom radius/threshold/strength not matched to spec, or a different mip chain. Arguably stylistic, but it deviates from the shared spec. |
| 5 | Ground darker and muddier green | minor-aura3d-deficiency | Ambient/IBL diffuse intensity lower, or a fog colour/density mismatch darkening the mid-ground. |
| 6 | Back-right orange rock smoother and less detailed | minor-aura3d-deficiency | Normal map not applied, wrong texture LOD/mip bias, or missing tangents on that mesh. |
| 7 | Character plating slightly flatter and lower contrast | minor-aura3d-deficiency | Weaker specular IBL or different roughness/metalness handling. |
| 8 | Horizon haze heavier in Aura3D | equivalent (borderline) | Fog falloff curve differs slightly. Within tolerance. |
| 9 | three.js shows a faint circular arc in the sky; Aura3D is cleaner | aura3d-better (slight) | three.js skydome/fog or bloom artifact. |
| 10 | Geometry, camera, object placement, AA | equivalent | Not applicable. |

## 3. Scores

| Renderer | Score | Rationale |
|---|---|---|
| Aura3D 3.0.1 | **3.5 / 10** | Programmer-art scene to start with, and Aura3D makes it worse. Mushy shadows remove grounding, a visible shadow artifact streaks the ground, bloom is overblown, and the palette is muddy. It reads as an early tech demo. |
| three.js r185 | **5 / 10** | Competent but dated. Primitive boxes and pillars, flat ground, no AO/contact hardening, and simple fog. The grounding shadows are correct and the materials read properly. |

## 4. Overall classification

**major-aura3d-deficiency**, with an embedded implementation-bug (the shadow band).

Verdict: Aura3D renders the same scene with unusable shadow definition, a spurious shadow artifact, and mismatched bloom, which loses the object grounding that is the main visual cue in a game scene.

## 5. Harness fairness

The harness itself looks fair:
- Camera, framing, resolution, and object set are identical in both frames.
- No black frames or missing assets. All 3 orbs, 2 pillars, 3 box stacks, and 3 rocks are present in both.
- Exposure and tone mapping are in the same ballpark.

Two things to verify rather than assume:
- **Bloom parameters:** confirm the spec defines radius, strength, and threshold explicitly and that both adapters consume them. The halo difference may be a harness-adapter mapping gap rather than a renderer limitation.
- **Shadow settings:** confirm map size, camera bounds/cascades, bias, and filter type are passed identically. If the Aura3D adapter uses defaults, items #1–#3 may be partly a configuration issue. The #2 band would still be a bug unless the frustum bounds were misconfigured.
