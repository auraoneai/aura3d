# 12 — Agent-authoring path autopsy

Branch: `aura3d-quality-rebuild/audit`. Scope: `llms.txt`, `docs/agents/*`, `docs/guides/*`,
the 13 shipped skills (`packages/create-aura3d/skills/*` — byte-identical to the canonical
`packages/aura3d-cli/skills/*` except `AUTHORING.md`), `packages/create-aura3d/templates/*`
(19 templates), `packages/engine/src/agent-api` (prompt plans, scene kits, `lights.*`,
`environments.*`, visualQA), `packages/lean`, `Aura3D-Skills-PRD.md`, and the showcase
review docs. Method: read source, count usages with `rg`, tiny node scripts over JSON/markdown.
No browsers, builds, or test suites were run. Pixel outcomes below are inferred from code,
not observed.

## 0. Verdict in one paragraph

The agent-authoring path is a compliance system, not an art system. Every layer an agent
touches tells it to avoid forbidden patterns, produce evidence, and pick a claim label. None of
them tells it what a good-looking frame is or how to make one. Measured by line classification,
skill text spends about 6x more lines on evidence and claims than on visual craft. The
browser-game skill has 28 evidence lines and 0 visual-craft lines. The code an agent copies
teaches a 2012-era three.js recipe: solid near-black `.background("#06090d")`, `lights.ambient`
plus one `lights.directional`, primitive boxes for the world, no environment, no fog, no
explicit shadow, no colour grade. In this engine that recipe is worse than it looks, because
**any `lights.ambient` node switches off the implicit IBL environment map**
(`packages/engine/src/agent-api/index.ts:12686-12700`). It runs at the default `safe-basic`
profile (pixelRatio 1 on retina, `index.ts:4249-4262`, `4311-4312`), with default shadow strength
0.24–0.38 (`index.ts:12966-12968`).
The flagship platformer template (`mini-game`) is worse still. It runs on `@aura3d/lean/game`,
where `lights.*` and `environments.*` are no-op intents (`packages/lean/src/base.ts:252-259`),
models cannot rotate or animate (`base.ts:521-523`), and the camera never moves. Its
camera-rig, game-feel, and perf-governor objects feed only the evidence JSON. The template
screenshot gates pass any frame with more than 900 sampled pixels of luminance above 30 and a
few cyan, warm, and red pixels.
The prompt-plan compiler ignores the `camera`, `lighting`, `effects`, `style`, and
`environment` fields an agent writes, then echoes them back as "visualSystems". The
`material.visualQA` gate passes on node *names* such as "glow halo" or "topcoat highlight".
Taken together, the recommended path naturally produces the Atari or early-Nintendo look the
owner describes. That look is not an accident of individual games. It is what the
instructions, templates, and defaults converge on.

Bucket split for this file: mostly **E (agent authoring)** and **B (defaults)**, with an
F-architecture finding (lean runtime as a starter) and a G-process finding (gates measure
compliance, not beauty).

---

## 1. What an agent actually reads and copies

### 1.1 Entry chain

| Step | Artifact | What it contributes to the first frame |
| --- | --- | --- |
| 1 | `AGENTS.md`/`.claude/CLAUDE.md` written by `aura3d init` (`packages/aura3d-cli/src/index.ts:3642-3668`) | "Read ./llms.txt first… Run npm run build and the template route-health/screenshot tests before claiming the scene is done." Nothing visual. |
| 2 | `llms.txt` (303 lines) | Hello world = `scene().add(model(assets.robot)).add(lights.studio())` (`llms.txt:62-67`). Game pattern identical (`llms.txt:79-86`). three.js mapping row: "Directional/Ambient/Point → `lights.*`" (`llms.txt:21`). No mention of environment, tone, exposure, shadows-on, fog, AO, colour grade, pixel ratio, quality profile. |
| 3 | `aura3d-core` skill | Same hello world (`SKILL.md:44-51`), routing table, "pick a claim label" (`:57-58`). |
| 4 | Domain skill (`aura3d-browser-game` for games) | Genre gates are mechanical (`SKILL.md:69-75`). Its code sample adds `lights.studio()` and nothing else visual (`:35-41`). Steps 7–10 are all validation and evidence. |
| 5 | Template `src/main.ts` | The real thing copied. See §3. |
| 6 | `aura3d-evidence-review` | Rubric, 3-round cap, "cheapest targeted fix" (`SKILL.md:53-56`), label. |

`create-aura3d` writes agent files by default (`Aura3D-Skills-PRD.md:328`). The manifest gives
every game template only `aura3d-browser-game` and `aura3d-game-art`
(`packages/aura3d-cli/skills/manifest.json`, `templates.mini-game` etc.). The one skill with
look-related content, `aura3d-materials-environments`, is **not installed for any game
template**. `aura3d-core` routes to it only on "Materials, textures, HDRI, skies, water,
weather" signals (`aura3d-core/SKILL.md:71`). A prompt like "make a platformer" never trips
those signals.

### 1.2 Line classification of the authoring text (node script, regex classifier)

Evidence regex: evidence/claim/label/prototype/proof/validate/verify/screenshot/route-health/gate/blocked/license/provenance/benchmark/report/check-deploy/release/forbidden/stop/roadmap/honest/rubric/readiness/diagnostic/hash/certif/placeholder.
Visual regex: lighting/shadow/exposure/tone-mapping/grade/palette/composition/framing/fog/bloom/atmosphere/contrast/silhouette/mood/beauty/art-direction/postprocess/IBL/HDRI/reflection/rim/colour/look/aesthetic/attractive/polish/cinematic/vfx/particles/sky/weather/AO/vignette/LUT/time-of-day/readable/style.
The visual regex is generous: it counts "look", "color", and "style".

| File | non-blank lines | evidence-only | visual-only | both |
| --- | ---: | ---: | ---: | ---: |
| aura3d-browser-game | 103 | 28 | **0** | 1 |
| aura3d-core | 81 | 19 | 2 | 0 |
| aura3d-scene-authoring | 95 | 25 | 8 | 3 |
| aura3d-evidence-review | 87 | 54 | 4 | 4 |
| aura3d-materials-environments | 101 | 24 | 20 | 5 |
| aura3d-assets | 98 | 23 | 0 | 1 |
| aura3d-character-animation | 99 | 21 | 1 | 0 |
| aura3d-performance | 76 | 21 | 1 | 1 |
| aura3d-retexture | 92 | 30 | 4 | 0 |
| aura3d-game-art | 88 | 13 | 7 | 1 |
| aura3d-threejs-migration | 99 | 20 | 4 | 0 |
| aura3d-animation-studio | 125 | 25 | 1 | 1 |
| meshy-cli | 103 | 19 | 5 | 0 |
| core/references/boundaries.md | 71 | 32 | 1 | 1 |
| **Skills total** | **1318** | **354 (27%)** | **58 (4.4%)** | 18 |
| `llms.txt` | 246 | 70 (28%) | 12 (4.9%) | 8 |
| `docs/agents/*` + `docs/guides/*` | 2159 | 541 (25%) | 148 (6.9%) | 46 |
| `docs/guides/build-a-browser-game.md` | 251 | 37 | **1** | 2 |
| `docs/agents/game-example-standards.md` | 74 | 19 | 3 | 0 |
| `docs/agents/cinematic-scene-quality.md` (only craft doc) | 79 | 4 | 26 | 3 |

Raw term frequencies over skills + `llms.txt` + `docs/agents` + `docs/guides`:
`evidence` 283, `claim` 237, `screenshot` 163, `prototype` 50, `blocked` 22,
`Stop and report` 17. Against those: `lighting` 49, `bloom` 37, `shadow` 40, `fog` 15,
`composition` 6, `atmosphere` 5, `palette` 2, `silhouette` 2, `tone mapping` 2, `exposure` 1,
`color grade` 1, `polish` 1, `art direction` 1, `beautiful` 0, `attractive` 0.
About a quarter of the `shadow`, `bloom`, and `lighting` lines are negative or claim-context
lines: 11/32, 7/36, and 10/48 contain claim/unsupported/partial/proof/do-not/without. Many
"shadow" hits are the phrase "contact shadow" in the kit tables.

**Ratio: about 6:1 evidence to craft in skills, about 4:1 in docs. In the game path specifically
(browser-game skill + game guide + game standards) it is 84:4.**

### 1.3 Engine APIs that exist but the authoring text never mentions

| API (exists in `effects`/renderer options, `index.ts:3441+`) | Showcase apps using it | Templates using it | Mentions in skills/llms/docs-agents/guides |
| --- | ---: | ---: | ---: |
| `effects.colorGrade` | 16 | 0 | 0 |
| `effects.antiAlias` | 16 | 0 | 0 |
| `effects.ambientOcclusion` | 8 | 0 | 0 |
| `effects.contactOcclusion` | 7 | 0 | 0 |
| `effects.volumetricFog` | 1 | 0 | 0 |
| `effects.screenSpaceReflections` | 0 | 0 | 0 |
| `effects.depthOfField` | 0 | 0 | 0 |
| `shadow: true` on lights | 6 | 0 | 0 |
| `renderer.qualityProfile` | 8 | 0 | 0 |
| `pixelRatio` | 11 | 0 | 0 |
| `environments.hdri` | **0** | **0** | 6 (all in materials skill) |
| `sky.dayNight` | **0** | **0** | 3 |

The showcase authors (agents in earlier waves) learned about colour grade, AO, and similar
features from somewhere other than the agent docs, probably source or PRDs. Whatever they
learned, it never flowed back into the templates or skills that a new agent copies.
`environments.hdri`, the one path to real image-based lighting, is used by zero games and zero
templates.

---

## 2. Defaults the authoring path walks into (B, but they are why the copied recipe looks flat)

### 2.1 `lights.ambient` silently disables environment IBL

`createProductionRuntimeEnvironment` (`index.ts:12628-12722`):

```ts
const ambientLights = nodes.filter(... node.light === "ambient" && node.intensity > 0);
if (ambientLights.length > 0) {
  ...
  return {
    preset: "authored-ambient",
    evidence: `... authored ambient light ... without an implicit environment map`,
    lighting: { color, intensity, environmentMapIntensity: 0, environmentMapSpecularIntensity: 0 }
  };
}
// only reached with no environment node and no ambient light:
const preset = category === "game" ? "gameplay" : ... "studio";
```

The only ways to get the generated HDR environment are to author an `environments.*` node or to
add no ambient light at all. An ambient light forces `environmentMapSpecularIntensity: 0`, so
metals turn black, there are no specular reflections, and PBR shading collapses to
Lambert-plus-one-highlight. That is the canonical "old 3D" look.

How many authored scenes hit this trap:

| Population | Uses `lights.ambient` | Adds `environments.*` (which overrides) | Net: no IBL |
| --- | ---: | ---: | ---: |
| 26 `apps/showcase-*` with src | 25 | 4 (cinematic-architecture, product-configurator, siege-golf, turbo-drift) | **~21** |
| 19 templates | racing-starter, falling-blocks-starter, character-controller, three-compat-architecture-interior, three-compat-postprocess-scene, three-compat-custom-threejs-migration, three-compat-large-scene, three-compat-material-authoring… | 0 non-lean | most |
| `promptRecipes` (all four) | 4/4 (`index.ts:10150, 10185, 10223, 10234`) | 0 | **4/4** |

No skill, doc, or `llms.txt` line warns about this. `llms.txt:21` invites agents to map
`AmbientLight` straight to `lights.*`. three.js r185 has no such coupling: `scene.environment`
and `AmbientLight` are independent and additive.

### 2.2 Default renderer quality profile is `safe-basic` at pixelRatio 1

`resolveRendererQualityProfile(id ?? "safe-basic")` (`index.ts:4311-4312`). The `safe-basic`
profile sets `pixelRatio: 1` (`index.ts:4256`) and `blockedInRoot: ["production PBR parity",
…, "postprocess pass chain"]` (`:4261`). Canvas setup applies it ahead of devicePixelRatio:
`options.pixelRatio ?? rendererSelection.profile.pixelRatio ?? devicePixelRatioSafe()`
(`index.ts:11133`, `12280`). Every template and every skill sample omits
`renderer.qualityProfile` and `pixelRatio`, so every agent-authored app renders at 1x on a 2x
display, half the linear resolution of a stock three.js example
(`renderer.setPixelRatio(window.devicePixelRatio)`). On retina, aliasing and blur alone read as
a generation old.

### 2.3 Shadows: implicit, single caster, about 30% strength

- `lights.studio()` expands to key, fill, and rim directionals, all with `shadowRequested: false`
  (`index.ts:13299-13360`).
- `resolveProductionShadowCasterIndex` (`index.ts:13172-13197`) still picks a legacy caster by
  priority when nothing is requested, so a shadow exists. Its strength is
  `city-day 0.38 / material|product 0.24 / else 0.32` (`index.ts:12966-12968`), with
  PCF 9 samples at 1024² for scenes of radius 10 or less (`:12960, 12969-12970`).
- three.js r185: `LightShadow.intensity` defaults to 1, so a shadow is a full occlusion of the
  direct term. A 0.32 shadow is a faint grey smudge. It cannot ground objects, so agents add
  blob-shadow spheres (§4.4).
- No skill or doc tells an agent to set `shadow: true`, a shadow strength, or a map size. The
  term `shadow: true` appears 0 times in the authoring text.

### 2.4 Background: always a solid near-black clear colour

Every template and every scene kit sets `.background("#0x0x1x")`: `#071015` (mini-game),
`#060b10` (racing), `#06090d` (falling blocks), `#10071c` (fighting), `#0c0f16` (controller),
`#071018` (product-viewer), `#0a0d13`, `#070a11`, `#10141c` (three-compat). The kits use
`#070b12`, `#020617`, `#08111f`, `#10151f`, `#071017` (`index.ts:9880-9995`). The prompt recipes
use `#070b10`, `#02040a`, `#030711`, `#080a0d` (`index.ts:10147-10237`). No sky, gradient,
environment background, or horizon fog is used anywhere a new agent looks. A flat dark void
behind lit primitives is the signature of 1990s and early-2000s realtime 3D.

---

## 3. Templates: what an agent actually copies when starting a game

Feature tally per template `src/` (rg counts; "lean" = `@aura3d/lean/*` import):

| Template | Runtime | `lights.*` | `environments.*` | explicit shadow | `effects.*` | fog | bg | primitives | models | diagnostics overlay |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |
| mini-game (platformer) | **lean/game** | 0 | 0 | 0 | 0 | 0 | `#071015` | 6 | 1 | – |
| racing-starter | engine | ambient + directional | 0 | 0 | 0 | 0 | `#060b10` | 7 | 2 | **on** |
| falling-blocks-starter | engine | ambient + directional | 0 | 0 | 0 | 0 | `#06090d` | 5 (+ cell grid) | 1 | – |
| fighting-game | engine | studio + directional | 0 | 0 | bloom 0.32 | 0 | `#10071c` | stage preset | 2 | **on** |
| character-controller | engine | ambient + directional | 0 | 0 | 0 | 0 | `#0c0f16` | 1 | 1 | – |
| product-viewer | **lean/product** | 0 | `environments.studio()` (**no-op in lean**) | 0 | 0 | 0 | `#071018` | 2 | 1 | – |
| cinematic-scene | engine via `promptPlanToScene` | (recipe) | 0 | 0 | (recipe) | (recipe) | (recipe) | (recipe: 16 prims) | 1 | – |
| three-compat-* (8) | engine | ambient/directional/studio/rect/point | 0 | 0 | bloom in 2 | 0 | dark solid | 2–11 | 0–1 | – |

Zero templates use an environment that actually renders, an HDRI, `sky.dayNight`, fog (outside
the recipe), AO, colour grade, an explicit shadow request, a quality profile, or a pixel ratio.

### 3.1 `mini-game` — the default platformer starter is a façade renderer

The browser-game skill's first procedure step sends platformer requests here
(`aura3d-browser-game/SKILL.md:26-28`). The guide calls it "the smallest playable
platformer-style starter" (`docs/guides/build-a-browser-game.md`, Scaffold section).

- Imports `@aura3d/lean/game` (`templates/mini-game/src/main.ts:1-11`), not `@aura3d/engine`,
  even though the skill sample and `llms.txt` say `@aura3d/engine`.
- Lean `lights` and `environments` are pure intents with no effect:
  ```ts
  // packages/lean/src/base.ts:252-259
  export const lights = { directional: (_options = {}) => ({ ...intent("light"),
      position: (_x, _y, _z) => intent("light") }) } as const;
  export const environments = { studio: (): AuraLeanIntentSpec => intent("environment") } as const;
  ```
  The lean frame (`base.ts:386-414`) builds `RenderSource = { collectRenderItems, cameraPolicy }`
  with no lights, environment, fog, postprocess, or shadow. The renderer falls back to
  `createDefaultRendererDirectLights()` (key + fill, `castsShadow: false`,
  `packages/rendering/src/Renderer.ts:3079-3110`) and `DEFAULT_RENDERER_ENVIRONMENT_LIGHTING`
  (`Renderer.ts:1799-1803`). The result is no shadows, ever.
- `createAuraLeanModelMatrix(position, scale)` composes with quaternion `[0,0,0,1]`
  (`base.ts:521-523`). Lean nodes cannot rotate, and the runtime node API is only
  `setPosition / setScale / setVisible` (`base.ts:439-459`).
- The hero GLB (`showcaseKenneyOobiPlatformerHero`, 208 KB) ships **25 animation clips**
  (`templates/mini-game/aura.assets.json`). Lean has no animate API, so the character slides in
  its static pose and cannot face its direction of travel.
- `game.cameraRig`, `game.gameFeel`, and `game.performanceGovernor` are constructed
  (`main.ts:76-79`). `gameFeel.addTrauma` is fed on collect, hazard, and land
  (`main.ts:117-122`). But `cameraRig.follow(...)` is called **only inside `publishEvidence`**
  (`main.ts:214`), and the camera is a fixed `camera.perspective` set once in `buildScene`
  (`main.ts:171-175`). Lean has no camera mutation. Trauma, shake, hit-stop, and governor
  settings exist only in `window.__AURA3D_MINI_GAME__`. **The game-feel shown to the evidence
  harness never reaches pixels.**
- The world is six PBR boxes and spheres in flat cyan/green/yellow/red/orange
  (`main.ts:151-167`), on `#071015`, with a DOM `<aside>` HUD (`main.ts:191-201`).
- The screenshot gate (`templates/mini-game/tests/screenshot.spec.ts:24-66`) samples every 4th
  pixel. It passes if `brightPixels > 900` (luminance > 30), `cyanPixels > 20`,
  `warmPixels > 10`, `redPixels > 5`, `uniqueBuckets > 10`, and the PNG exceeds 1000 bytes. The
  thresholds encode the **primitive palette** (cyan platforms, warm coins, red spikes). An agent
  that replaces primitives with textured assets in natural colours risks failing the "readable
  playable scene" test. The test rewards keeping the Atari palette.

Ladder grade for "mini-game as a game starter": exists ✔, technically works ✔, public API ✔,
used by generated apps ✔ (default), good defaults ✘, composes ✘ (lean cannot take engine
lights, effects, or animation), modern visual quality ✘, agents know its limits ✘ (no doc says
lean ignores lights), examples demonstrate it ✘.

### 3.2 `racing-starter`

`templates/racing-starter/src/main.ts`:
- Lighting is `lights.ambient(0.38)` plus `lights.directional(1.1)` (`:215-216`). That kills IBL
  per §2.1, and no shadow is requested.
- Four primitive "route ribbon" asphalt boxes are laid **on top of** the typed track GLB
  (`:50-55, 220-225`). The skill forbids exactly this ("do not hide the gap with primitive
  ledges or road strips", `aura3d-browser-game/SKILL.md:103-105`).
- A free-standing "PART C2 game-ready adoption" gantry: a red clear-coat box and a glass slab
  placed to prove that a materials preset is "adopted" (`:227-255`). This is
  checklist-driven content, scenery that exists because a PRD line asked for a preset to be
  used, not because the scene needs it. The `product-viewer` template does the same
  (`templates/product-viewer/src/main.ts:13-17`).
- `diagnostics: { overlay: true, performancePanel: true }` ships enabled (`:109-113`), so the
  starter opens with debug text over the scene.
- The evidence object hard-codes `routeAlignedToVisibleTrack: true` (`:43-48, 321-335`) and
  `status: "contract-ready"`. Meanwhile `assets certify-game-geometry` on this exact track
  returns `ok:false`, `racing-road-mesh-not-found`
  (`docs/agents/skills-examples/aura3d-browser-game.md`, cmd 1). The template's own evidence is
  a constant, and it contradicts the engine's gate.
- The camera sits at `[2.7, 7.8, 8.6]`, fov 43, looking down at a 0.18-scaled car
  (`:217, 196-198`). That is a top-down toy-table framing with a tiny subject.

### 3.3 `fighting-game`, `falling-blocks-starter`, `character-controller`

- fighting: `lights.studio(1.15)` plus a rim directional, `bloom 0.32`, `#10071c`
  (`main.ts:132-144`). Diagnostics overlay is on (`:146-148`). This is the best of the game
  templates, and it still has no environment, shadow request, fog, or grade.
- falling-blocks: ambient plus directional on `#06090d`, and the board is one PBR box per cell
  (`main.ts:230-260`).
- character-controller: a **320 px tall** stage `div` (`main.ts:51-53`), a monospace `<pre>`
  HUD (`:44`), ambient plus directional (`:60-61`), and a floor box. It looks like a debug
  harness by construction.

### 3.4 `product-viewer` (lean) and `three-compat-*`

- product-viewer uses `@aura3d/lean/product`, so its `environments.studio()` is the lean no-op
  (`base.ts:259`). The template's only "environment" does nothing.
- three-compat-premium-product-viewer is a **sphere** as the "hero product"
  (`main.ts:14`) under `lights.studio()` plus a rect plus a point. architecture-interior is
  eleven boxes plus ambient plus directional. postprocess-scene is emissive primitives plus
  bloom. These are the templates an agent porting three.js work copies. They are less capable
  than the three.js examples they stand in for (`webgl_lights_rectarealight`,
  `webgl_postprocessing_unreal_bloom`, `webgl_materials_physical_clearcoat` all use
  PMREM/RoomEnvironment or HDR plus `devicePixelRatio`).

### 3.5 Size claim ("32k lines")

`find packages/create-aura3d/templates -type f | wc -l` gives about 819k lines. Almost all of
it is JSON clip-library data (`animation-studio/public/clip-library/*.json`, 629k) and
lockfiles. Actual game-template source is small: mini-game `main.ts` 220, racing 335, falling
blocks 380, fighting 443 + 361 in `game/`, controller 103, product-viewer 40,
three-compat 16–33 each. `packages/create-aura3d/src` is 8,976 lines, and **8,634 of them are
`showcase-spec-*` evidence/replacement/geometry-proof compilers**. The scaffolder spends 96%
of its own code on proof machinery.

---

## 4. Engine-side authoring helpers (prompt plans, scene kits, visualQA)

### 4.1 `definePromptPlan` / `compilePromptPlan` / `promptPlanToScene` is a façade

`index.ts:10103-10145`:

```ts
export function compilePromptPlan(plan) {
  const subject = requireResolvedPromptSubject(plan);
  const sceneBuilder = promptRecipes[plan.sceneType](subject.asset, plan);
  return { scene: sceneBuilder, report: {
      cameraPreset: plan.camera?.preset ?? defaultCameraPreset(plan.sceneType),
      lightingPreset: plan.lighting?.preset ?? defaultLightingPreset(plan.sceneType),
      effects: plan.effects ?? defaultPromptEffects(plan.sceneType),
      visualSystems: visualSystemsForPromptPlan(plan),
      repairHints: repairHintsForPromptPlan(plan) ...
```

The four `promptRecipes` (`index.ts:10147-10237`) read only `plan.subject.label` and
`plan.interaction`. **`plan.camera`, `plan.lighting`, `plan.effects`, `plan.style`, and
`plan.environment` are never read by any recipe.** A plan with
`sceneType: "product-viewer", effects: ["rain","fog"]` gets the hard-coded product scene with
no rain and no fog. The report still lists `"rain effect"` and `"fog effect"` in
`visualSystems`, because `visualSystemsForPromptPlan` just echoes the input
(`index.ts:10250-10262`). The skill tells agents to trust this: "`visualSystems` names what the
compiler added" (`aura3d-scene-authoring/SKILL.md:78-80`). That is false. The PRD also
recorded "`compilePromptPlan` reports a bloom visual system even when the plan requests no
effects" (`Aura3D-Skills-PRD.md:339`) as a known issue, and shipped anyway.

`repairHintsForPromptPlan` (`index.ts:10277-10315`) returns the same static strings for a given
`sceneType`. It never looks at the scene, the screenshot, or the diagnostics. "Read the
compiled report before editing… `repairHints` lists fixes" (`SKILL.md:78-80`) amounts to
reading a fixed paragraph.

The recipes bake in the primitive aesthetic:
- `cinematic-scene` (`:10155-10187`) fakes "wet reflection" with emissive boxes ("amber wet
  reflection", "cyan wet reflection", "long cyan puddle streak", "warm puddle streak") and
  "rain splash" with flattened emissive spheres. Lighting is ambient (which kills IBL) plus
  four point lights. That is 16 primitives around one model.
- `mini-game` (`:10189-10229`) builds the **HUD out of 3D primitives**: "health pip 1-3"
  emissive spheres, a "timer bar" box, an "objective bar" box. The "cyan motion trail" is an
  emissive box and the "player shield ring" is a squashed sphere. Coins are emissive spheres,
  the goal portal is three boxes, and the light is ambient(0.16) plus two point lights on
  `#030711`. This is literally an Atari 2600/early-NES composition, emitted by the engine's own
  "prompt to scene" API.
- `product-viewer` (`:10147-10154`) uses ambient(0.28) plus studio plus three point lights.
  Ambient kills IBL in the most reflection-dependent scene type.
- `material-studio` (`:10231-10237`) uses ambient plus two point lights, so the "metal swatch"
  has no environment to reflect.

Ladder: exists ✔, works ✔ (it compiles), public API ✔, used by generated apps ✔
(cinematic-scene template), good defaults ✘, composes ✘ (plan fields ignored), modern quality
✘, agents know to use it ✔ (heavily promoted), examples demonstrate ✘. **Fake parity.**

### 4.2 `sceneKits.*`

Scene kits (`index.ts:9841-9995`) return `diagnostics.structuralScore` and `evidence` strings.
The scores are counts from the visualQA helpers (planets, ring cues, bars, buildings). The kits
use dark solid backgrounds. Some include `environments.materialLab` or `productHero`
(`:9953`, `:9995`). Several pair `lights.studio` with HUD labels
(`:9884-9886`, "Physics: contacts, reset, backend" as an in-scene HUD). Kits are benchmark-prompt
recipes (solar system, data viz, neon tunnel). None is a game genre the showcases implement
(racing, platformer, fighting, flight, sports), so they do not help the 18 games.

### 4.3 `visualQA` helpers grade node names, not pixels

`validateMaterialVisualQA` (`index.ts:2959-3010`) decides "chrome reflects environment",
"emissive glows", and "clearcoat layered highlight" by **substring-matching node names**:

```ts
const chromeReflectsEnvironment = Boolean(classSpecs.chrome) && reflectionCards >= 4 &&
  (hasNamed("chrome bright reflection") || hasNamed("environment reflection"));
const emissiveGlows = Boolean(classSpecs.emissive) && (hasNamed("glow halo") || hasNamed("glow spill") || ...bloom);
const clearcoatLayeredHighlight = Boolean(classSpecs.clearcoat) &&
  (hasNamed("outer gloss layer") || hasNamed("topcoat highlight") || hasNamed("base reflection"));
```

`reflectionCards` counts nodes named "reflection card", "reflection strip", "contrast card",
"softbox reflection", or "environment reflection". Skills tell agents to run
`material.visualQA(nodes)` and the sibling helpers before accepting scenes
(`aura3d-evidence-review/SKILL.md:44-49`, `aura3d-materials-environments/SKILL.md:92`,
`llms.txt:290`). The cheapest way to pass is to add emissive or primitive cards with the right
names. That is the opposite of real reflections. 41 such fake-effect names exist inside
`agent-api/index.ts` itself, and showcase apps copy the pattern (§4.4).

### 4.4 Blob shadows and painted reflections in the showcases

With shadows at about 30% and no IBL, agents compensate with 1998-era techniques:
- `showcase-rooftop-buckets/src/main.ts:354, 582-586`: `primitives.sphere({ name: "shooter
  contact shadow", material: pbr({ color:"#120f1f", opacity:0.5 }) })`
- `showcase-skyline-runner/src/main.ts:1917-1918`: "hero contact shadow", opacity 0.5
- `showcase-turbo-drift-circuit/src/main.ts:3252-3284`: "player/opponent car contact shadow"
  primitives, opacity 0.52/0.28
- similar names in product-configurator, smart-city, gallery-shift, gravity-post, and mech-hangar

---

## 5. Instructions that encourage "simplest thing that passes"

Quoted, with location. Each one is defensible in isolation as anti-hallucination hygiene.
Together they cap ambition and remove the agent's ability to iterate on looks.

| # | Instruction | Where | Effect on pixels |
| --- | --- | --- | --- |
| 1 | "copy the smallest matching scene-kit recipe, make only…" | `docs/agents/benchmark-recipes.md:4`; repeated in `README.md:82`, `agent-context.md:23`, `build-playbook.md:24` | Minimal starting point is the norm |
| 2 | "write the smallest complete scene first, run finite commands such as `npm run build`, and exit. Do not run dev servers, Playwright, browser screenshot capture, or manual visual verification from inside the agent process." | `docs/agents/build-playbook.md:148-151`; `llms.txt:161-167`; `boundaries.md` benchmark table; `aura3d-scene-authoring/SKILL.md:22-24` | **The agent is told not to look at its output.** Authoring is blind by policy |
| 3 | "Add only prompt-required customization." | `aura3d-scene-authoring/SKILL.md:81` | No unprompted atmosphere, sky, grade, or polish |
| 4 | "Critique loop, at most 3 rounds. For each `fail`, apply the cheapest targeted fix" | `aura3d-evidence-review/SKILL.md:53-56` | Fixes rubric failures only, cheaply. A rubric of "product centered", "studio lighting visible" is about presence, not beauty |
| 5 | "Do not swap GLBs or repaint primitives to make a route look different while the root cause remains unproven." | `docs/agents/no-hackjob-rules.md:45-46` | Forbids iterative art-direction changes |
| 6 | Bad screenshot → "Classify the symptom… Add or update the applicable current status, architecture, or release checklist entry. Prove the fix in a root-only validation app…" | `no-hackjob-rules.md:27-43` | An ugly frame becomes a paperwork task, not a lighting task |
| 7 | "Browser evidence could not be captured… label the claim `prototype`… do not describe visual results you did not see." | `aura3d-evidence-review/SKILL.md:89-91` | Gives an honourable exit that never requires seeing pixels |
| 8 | "an in-repo scorer as release proof (use a neutral human or opposite-vendor model reviewer)" | `aura3d-evidence-review/SKILL.md:77-78`; visual standard "A named human reviewer remains mandatory for art direction, lighting, coherence, polish" (`docs/project/showcase/visual-quality-standard.md:17-18`) | Beauty is delegated to a human who never arrives (`docs/project/showcase-visual-review.json`: reviewer `pending-user-review`, every route `needs-work`) |
| 9 | "Treat glass, clearcoat, transmission, normal maps, reflections, and contact shadows as partial or unsupported unless retained root pixels prove those exact features." | `llms.txt:211`; also `:201` | Agents avoid features. The engine's own capability catalog marks normal maps "supported" with browser proof (`index.ts:2752`, `normal-map` entry), so the docs actively under-sell |
| 10 | "Do not claim … HDR/IBL, postprocess … unless a browser test …" | `llms.txt:36` | "Don't claim" gets read as "don't use" |
| 11 | "prefer `character.lowPolyHumanoid({ clip: "walk" })` for primitive humanoids" | `docs/agents/build-playbook.md:141-147` | Low-poly primitive humanoid as the recommended path |
| 12 | Genre gates are mechanics only (throttle/brake/steer, checkpoints, lap…) | `aura3d-browser-game/SKILL.md:69-75`, `game-example-standards.md:41-93` | "Done" = mechanics + evidence |
| 13 | Skills PRD success measure: "completes the template's golden path (`build`, `test`, `assets validate`, `check-deploy`) with correct claim labels and no forbidden patterns" | `Aura3D-Skills-PRD.md:315` | The skill system's own definition of success contains no visual criterion |
| 14 | PRD decision framework: build a skill only if "Agents get it wrong without guidance. The evidence is an existing rule doc, gate, or anti-pattern list" | `Aura3D-Skills-PRD.md:120-125` | Systematically excludes an art-direction skill, since no gate exists for beauty |

The only craft-forward document, `docs/agents/cinematic-scene-quality.md`, has the right
content: key/fill/rim, atmosphere, material contrast, shot language (`:9-19, 73-82`). But it is
scoped to cinematic scenes, has no code (no API values, no recommended intensities), sits behind
`aura3d-evidence-review` as a reference link, and is not linked from the game skill or game
guide. The game standards doc has no equivalent.

---

## 6. Are there quality-bar instructions?

| Kind | Exists? | Where | Enforced? |
| --- | --- | --- | --- |
| Correctness bar (typed assets, no three imports, no CSS fakes) | Yes, exhaustive | boundaries.md, llms.txt, no-hackjob, anti-hallucination | `check:skills`, `check:agent-docs`, `verify:claims` |
| Gameplay bar (input, reset, objective, 60 s) | Yes | game-example-standards.md | browser specs |
| Readability bar (subject readable in 3 s, no UI overlap, no debug primitives) | Yes | visual-quality-standard.md:21-29 | partially (pixel heuristics) |
| **Beauty / modern-look bar** (lighting model, IBL, shadows, grading, atmosphere, resolution, reference targets) | **No** | — | — |
| Reference targets ("should look like three.js example X / this screenshot") | **No**. `rg "reference (image|shot)|art bible|mood board|visual target|quality bar|look dev"` over skills, llms, docs/agents, docs/guides, and the PRD returns only the two disclaimers | — | — |
| Default "look recipe" for games (env + sun + shadow + fog + grade + AA + DPR) | **No** | — | — |

`visual-quality-standard.md` is about not being broken (subject readable, no clipped debug
proxies, no JSON walls). It is not linked from any skill or from `llms.txt`; only
`docs/project/documentation-index.md` links it.

The game-upgrade audit (`docs/project/game-upgrade-audit-2026-09.md`, matrix) records each
game's "Visual state notes" as **grep counts**: "shadows(8) postfx(6) particles(7)". These are
counts of file references, not observations. Every row is "NOT PROBED". Both the measurement
culture and the agent instructions treat "visual" as "the keyword is present in source".

---

## 7. three.js r185 comparison: what a stock example does before any art

| Concern | three.js r185 example boilerplate | Aura3D recommended path (llms/skills/templates) |
| --- | --- | --- |
| Pixel ratio | `renderer.setPixelRatio(window.devicePixelRatio)` | `safe-basic` → `pixelRatio: 1` (`index.ts:4256`) |
| Environment light | `scene.environment = pmrem.fromScene(new RoomEnvironment()).texture` or an RGBE HDR | Implicit generated env, **but disabled by any ambient**. Templates use ambient. `environments.hdri` used by 0 templates and 0 games |
| Tone mapping | `ACESFilmicToneMapping` / `AgXToneMapping`, with `toneMappingExposure` tuned | ACES fixed (`AuraRendererDiagnosticReport.toneMapping: "aces-filmic"`, `index.ts:1801`). Exposure is a scene-category preset. Agents are never told it exists (1 mention) |
| Shadows | `renderer.shadowMap.enabled = true`, `light.castShadow = true`, intensity 1, mapSize 2048, PCFSoft/VSM | Implicit single caster at 0.24–0.38 strength. `shadow: true` never taught |
| Ambient fill | `HemisphereLight` (sky/ground colour) + env | `lights.ambient` flat colour (`index.ts:3064-3071`, default 0.28 white) |
| Background | env as background, or a gradient/sky shader | Solid near-black hex |
| Post | EffectComposer: RenderPass → (SSAO/GTAO) → UnrealBloom → OutputPass, SMAA/FXAA | Bloom only in 3/19 templates. AO, grade, and AA exist and are used in showcases but are untaught |
| Model orientation and animation | `AnimationMixer`, `object.rotation` | Lean starter: neither |

This gap exists **before** any asset or game-design work. It is purely the boilerplate an agent
is handed.

---

## 8. Capability ladder: agent-authoring surface

Grades: ✔ yes / ~ partial / ✘ no.

| Capability | exists | works | public API | used by generated apps | good defaults | composes | modern visual quality | agents know to use it | examples demonstrate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `lights.studio()` (taught default) | ✔ | ✔ | ✔ | ✔ | ~ (3 dirs, no shadow request) | ✘ (ambient beside it kills IBL) | ✘ | ✔ | ~ |
| Implicit generated env IBL | ✔ | ✔ | n/a | ~ (only when no ambient) | ✘ (silently off) | ✘ | ~ | ✘ | ✘ |
| `environments.*` presets | ✔ | ✔ (engine) / ✘ (lean) | ✔ | ✘ in game templates | ~ | ~ | ~ | ~ (materials skill only) | ✘ |
| `environments.hdri` | ✔ | ✔ (claimed B3 chain) | ✔ | ✘ (0) | n/a | ? | ? | ~ (6 mentions, one skill) | ✘ |
| Shadows | ✔ | ✔ | `shadow: true` | ✘ (0 templates) | ✘ (≈0.3 strength) | ~ (1 caster) | ✘ | ✘ | ✘ |
| `effects.colorGrade/ambientOcclusion/antiAlias` | ✔ | ? | ✔ | ✘ templates / ✔ 8–16 showcases | n/a | ? | ? | ✘ (0 mentions) | ✘ |
| Quality profile / DPR | ✔ | ✔ | ✔ | ✘ | ✘ (1x) | ✔ | ✘ | ✘ | ✘ |
| Prompt plan compiler | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ (ignores fields) | ✘ | ✔ | ✘ |
| `promptRecipes` | ✔ | ✔ | ✔ | ✔ | ✘ (ambient, primitive HUD) | ✘ | ✘ | ✔ | ✘ |
| `visualQA` helpers | ✔ | ✔ (name heuristics) | ✔ | ✔ | n/a | n/a | ✘ (gameable) | ✔ | ✘ |
| Lean game runtime | ✔ | ✔ | ✔ | ✔ (mini-game, product-viewer) | ✘ | ✘ | ✘ | ✘ (limits undocumented) | ✘ |
| Game-feel (`cameraRig`, `gameFeel`) | ✔ | ✔ (math) | ✔ | ✔ (constructed) | – | ✘ (lean: never applied) | ✘ | ✔ | ✘ |
| Art-direction guidance | ✘ | – | – | – | – | – | – | – | – |

---

## 9. Root-cause chain (why the agent path converges on Atari)

1. **Positioning is honesty-first.** The skills PRD defines the problem as "agents violate
   rules" (`Aura3D-Skills-PRD.md:13-17`) and success as "golden path with correct labels"
   (`:315`). Every skill gets a "Stop and report" section by rule (`:137`). None gets a "Make
   it look good" section.
2. **The copied code is the old recipe.** Hello world plus templates teach `lights.studio()` or
   ambient+directional on a black clear colour with primitives. Nothing in the path introduces
   environment, shadow, fog, grade, or DPR.
3. **Engine defaults punish the old recipe harder than three.js does.** Ambient disables IBL,
   shadows are 30%, and the canvas is 1x. An agent cannot discover any of this, because the
   docs never mention it and the agent is told not to look at the screen in benchmark mode.
4. **The "smart" layer is hollow.** Prompt-plan fields are ignored, repair hints are static, and
   visualQA reads names. An agent following the skill exactly believes it has added
   lighting, bloom, and rain systems and passed QA.
5. **Gates certify presence, not quality.** The screenshot thresholds (900 bright samples,
   >20 cyan) and grep-count visual audits pass Atari frames. Beauty is deferred to a human
   reviewer recorded as `pending-user-review` on every route.
6. **Anti-hackjob rules forbid iteration.** "Do not swap GLBs or repaint primitives to make a
   route look different" plus a 3-round cheapest-fix cap mean an agent cannot art-direct by
   trial.
7. **The flagship starter cannot be made beautiful.** `mini-game` on lean has no lights,
   environment, rotation, animation, or camera motion. Whatever an agent wants to add, the
   runtime discards it silently.

---

## 10. Recommendations

### P0 (change what agents copy; days, not weeks)

1. **Ship a "look baseline" in every template and in the hello world.** One helper, for example
   `looks.outdoorDay()` / `looks.studio()` / `looks.night()`, returning environment (HDRI or
   generated), hemisphere fill instead of ambient, a sun with `shadow: true` (full strength,
   2048, soft), horizon fog, AA, a neutral grade, and an env-matched background. Put it in
   `llms.txt:62-67`, `aura3d-core/SKILL.md:44-51`, `aura3d-browser-game/SKILL.md:35-41`, and all
   game templates.
2. **Fix the ambient→IBL coupling** (`index.ts:12686-12700`). Ambient should add to the
   environment, not replace it. Until that is fixed, add a diagnostics warning ("ambient light
   disabled environment reflections") and a skill line.
3. **Default `qualityProfile` to `production` and DPR to `min(devicePixelRatio, 2)`**
   (`index.ts:4311-4312`, `4256`). Keep `safe-basic` as explicit opt-in or fallback.
4. **Default shadow strength to 1.0**, or at least 0.8 (`index.ts:12966-12968`), and make the
   `lights.studio` key request shadows (`index.ts:13328-13329`).
5. **Move `mini-game` and `product-viewer` off `@aura3d/lean`** or make lean honour lights,
   environment, rotation, animation, and camera. At minimum, make lean `lights.*` and
   `environments.*` throw or warn instead of returning silent intents (`base.ts:252-259`).
6. **Delete or implement prompt-plan fields.** `promptRecipes` must consume `camera`,
   `lighting`, and `effects`, or the type must drop them and `visualSystems` must stop echoing
   input (`index.ts:10147-10262`). Replace the mini-game recipe's primitive HUD with a real
   DOM HUD and a lit environment.
7. **Replace name-based visualQA with pixel metrics** (luminance histogram spread, local
   contrast, specular presence, shadow-contact darkness, subject coverage), or rename it
   `structuralQA` and remove it from "before accepting" instructions
   (`aura3d-evidence-review/SKILL.md:44-49`, `llms.txt:290`).
8. **Remove claims-as-constants from templates** (`racing-starter/src/main.ts:43-48, 321-335`)
   and the PRD-adoption props (`racing-starter/src/main.ts:227-255`,
   `product-viewer/src/main.ts:13-17`).

### P1 (instruction layer)

9. **Add an `aura3d-art-direction` skill**, installed for every game and scene template.
   Contents: target references (named three.js examples and screenshots), the look-baseline
   API, a lighting recipe per genre (racing: low sun + long shadows + haze; platformer: bright
   key + hemisphere + saturated grade; night: HDRI night + emissive + bloom), camera and FOV
   guidance for subject size, a palette rule (no pure primary-colour primitives), and a
   checklist: "IBL on? shadows full strength? DPR ≥ 1.5? background not a solid void? fog for
   depth? grade applied? subject ≥ 15% of frame?".
10. **Let agents see pixels.** Give the agent a remote screenshot loop
    (runner returns PNG) as the default in normal mode and drop "do not perform manual visual
    verification" from non-benchmark guidance. Raise the critique cap above 3 for visual items
    and allow look iteration explicitly (amend `no-hackjob-rules.md:45-46` to target only
    *hiding capability gaps*, not art direction).
11. **Separate "don't claim" from "don't use."** Rewrite `llms.txt:36, 201, 211` so features are
    used freely and claims stay evidence-gated. Reconcile with the engine capability catalog
    (normal maps, metallic-roughness, base-color textures marked supported).
12. **Teach the untaught APIs.** `effects.colorGrade`, `ambientOcclusion`, `antiAlias`,
    `volumetricFog`, `shadow: true`, `renderer.qualityProfile`, `pixelRatio`,
    `environments.hdri`, and `sky.dayNight` should all appear in `llms.txt` and the game skill
    with recommended values.
13. **Rebalance skill text.** Target at least 30% craft lines in the game, scene, and core
    skills. Move evidence procedure into `aura3d-evidence-review` and `boundaries.md` only.
    Today it is restated in every skill despite the PRD's own "do not restate" rule
    (`Aura3D-Skills-PRD.md:133`).

### P2 (gates)

14. **Template screenshot gates should assert look quality, not palette presence.** Examples:
    luminance P5–P95 spread, fraction of near-black void below X%, presence of shadowed ground
    contact, subject bbox coverage, and a reference-image perceptual distance for the starter.
    Remove the cyan/warm/red counts that lock in primitive colours
    (`mini-game/tests/screenshot.spec.ts:61-66`).
15. **Add a "visual" column to audit tooling based on probes, not grep counts**
    (`docs/project/game-upgrade-audit-2026-09.md` matrix).
16. **Add an engine-side "look lint"** in `diagnostics().warnings`: ambient-without-env, no
    shadow caster at full strength, DPR < devicePixelRatio, solid background with no fog,
    primitive count > N with no textures. Surface it in the overlay and in `app.evidence`, so
    the evidence culture starts working for beauty.

---

## 11. What to preserve

- Typed-asset discipline (`model(assets.x)`, CLI admission, provenance). It prevents the worst
  failure, hallucinated URLs, and is orthogonal to looks.
- Catalog-first rule and Meshy paid-generation controls.
- `docs/agents/cinematic-scene-quality.md`. Its content is the right seed for an
  art-direction skill. Generalise it to games and add API values.
- The `check:skills` gate mechanism (commands and exports verified). Extend it to require
  craft sections.
- Genre kits (`game.platformer/racing/fallingBlocks/fighting`) as deterministic rules engines.
  The problem is the presentation layer around them, not the kits.
- `environments.hdri` B3 chain and the `effects.*` surface. The capabilities exist. They are
  just not on the authoring path.
- The claim-label vocabulary, kept for README and marketing text only, not as the main content
  of authoring skills.
