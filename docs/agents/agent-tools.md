# Agent tools: info, examples, validate, render

Four `@aura3d/cli` commands an agent runs inside a project so it can author, validate, render, inspect and correct without leaving the CLI. All four work offline: no network, no account, no Playwright. `render` needs a local Chrome (the same driver as `aura3d verify`).

```bash
aura3d info                               # installed versions + engine namespaces and their members
aura3d info --name material.pbr           # one builder: signature and option keys (or close names for a guess)
aura3d examples "gold product on a pedestal"   # closest runnable scene: complete src/main.ts + setup
aura3d examples --id recipe-11- --write src/main.ts
aura3d validate                           # static checks of src/ (or: aura3d validate src/main.ts)
aura3d render                             # build, serve, render; short text summary (framing, exposure, errors, done)
aura3d render --no-build --json           # reuse dist/; the same summary as JSON
aura3d render --screenshot                # also write .aura3d/render.png (only when you must see pixels)
aura3d render --url http://127.0.0.1:5173/ --screenshot --out shot.png   # an already running dev server
aura3d render --full --json               # the full diagnostics report (aura3d.render/1)
aura3d verify --explain VALIDATE_SUBJECT_SMALL                  # cause and fix for any code below
```

The loop: `examples` (start from working code) → edit → `validate` (seconds, no browser) → `render` (read the summary) → fix the first error code → repeat. Done rule: when `validate` passes and one `render` reports `done` (subject framed, exposure ok, no errors), stop; do not keep polishing. `aura3d verify` remains the one-shot full pass (typecheck, assets, lint, build, render, inspect).

## `aura3d info`

Reads the **installed** `@aura3d/engine` declarations through the TypeScript checker, so the answer matches the version the project builds against. Inside the Aura3D monorepo, where `@aura3d/engine` is not in `node_modules`, it reads `packages/engine/src/public/index.ts` and reports `source: workspace`.

- Versions of every `@aura3d/*` package and `create-aura3d` (installed and declared in `package.json`); a declared-but-not-installed package and a CLI/engine minor-version mismatch are warnings.
- Project files present: `aura.assets.json` (asset count), `src/aura-assets.ts`, `llms.txt`, skills folders.
- Engine surface: counts by kind; namespaces (an exported object with at least one callable member: `material`, `lights`, `camera` ...) with member names; functions; classes; exports tagged `@deprecated` listed separately.
- `--name <export>[.<member>]`: signature, doc line, members of a namespace, and for a builder the keys of its options object. An unknown name returns close names (`material.glassy` → `glass`). `--json` for machine output (schema `aura3d.info/1`). Exit 1 when no engine is found.

## `aura3d examples <query>`

BM25 search (camelCase split, light stemming) over two indexes built at run time from files that ship with the CLI and `create-aura3d`, so it cannot go stale against its own docs:

- the recipe book `skills/agent-docs/recipes.md` (a copy of [`recipes.md`](recipes.md); every numbered recipe is a complete `src/main.ts` that compiled against the engine), and
- the `create-aura3d` templates (`templates/<name>/README.md` and `src/main.ts`).

Two nudges on top of BM25. A query that names one of the common scene categories puts that category's runnable starter first: product viewer (recipe 11), character or creature (recipe 8; a skinned GLB character: recipe 3), portal or effect (recipes 14, 15), outdoor (recipes 9, 13, 12), interior (`starter-interior`), small game (recipes 4, 16; a named genre such as racing or fighting keeps its template), materials (recipe 17), presentation (`starter-presentation`). Entries that run as is (only `@aura3d/*` imports, no model assets) rank above ones that need a scaffold unless the query asks for a template, assets or a model.

Text mode prints the top 3. The top hit carries its complete `src/main.ts` (`--no-source` to skip), a `save:` command, `setup:` lines (page mount, HDRIs for looks, model assets, sibling files) and the done rule; the others carry summary and use. `--list` prints every id; `--id <id>` (prefix allowed) prints one; `--id <id> --write src/main.ts` saves its source (refuses to overwrite without `--force`); for a template that imports `./aura-assets` it also copies the template's other `src/` files, `aura.assets.json` and `public/aura-assets/` into the project, never overwriting. `--json` uses schema `aura3d.examples/1` (adds `category`, and `runnable` and `setup` per result). Exit 1 when nothing matches.

## `aura3d validate [file.ts ... | projectDir]`

Static checks in about a second (plus the TypeScript pass). With no argument it checks the project's `src/`; with files it reports only on those files (project root = nearest folder with `package.json` or `tsconfig.json`). Exit 0 when there is no error (`--strict`: no error and no warning), 1 otherwise, 2 on a usage error. `--json` uses schema `aura3d.validate/1`.

| Code | Severity | What it catches |
| --- | --- | --- |
| `VALIDATE_COLOR_INVALID` | error | A colour option (`color`, `background`, `skyColor`, `emissive`, `colors: [...]` ...) holding a string the engine's colour parser rejects: wrong hex length, `hsl()` with two values, `lab()`, `"light blue"`. Template strings are checked for shape (`hsl(${h}, 60%, 40%)` passes). Every value is judged inside an engine builder call (`material.pbr({...})`, `lights.*`, `scene({...})`); elsewhere (DOM styles, palette keys like `color: "skin"`, enums like `background: "sky"`) only a plain colour attempt is: a `#` value, a colour function, a `"0x..."` string, or a spaced name. The engine throws `COLOR_INVALID` for these at mount. |
| `VALIDATE_UNKNOWN_OPTION` | error | TS2353/TS2561 against the installed engine types: an option key the builder does not declare (`lights.directional({ shadowBias })`, `primitives.sphere({ radius })`). |
| `VALIDATE_UNKNOWN_MEMBER` | error | TS2339/TS2551: a member that does not exist (`material.glassy`, a runtime-handle method on a builder). |
| `VALIDATE_UNKNOWN_EXPORT` | error | TS2305/TS2724: an import `@aura3d/engine` does not export. |
| `VALIDATE_TYPES_UNAVAILABLE` | info | Engine types could not be resolved (run `npm install`); the three checks above were skipped. `--no-types` skips them on purpose. |
| `VALIDATE_SUBJECT_SMALL` | warning | From a literal `camera.orbit`/`camera.perspective` distance (or position and target) and fov, and the largest subject's size (`targetHeight`, primitive `size` times scale, ground-like names excluded), the subject fills under 20% of the frame height. Skipped when the project uses `camera.frame`, `camera.autoFrame` or `camera.frameAsset`, a scene kit or game kit, or a `model(...)` whose size the source does not state. |
| `VALIDATE_SUBJECT_CROPPED` | info | Same estimate for a subject with a literal `targetHeight`, taller than 1.4 frame heights. |
| `VALIDATE_NO_LIGHTING` | warning | The project mounts a scene but adds no `lights.*`, `environments.*`, `sky.*` or look preset (scene kits and prompt plans are exempt). |
| `VALIDATE_REFLECTIVE_NO_ENVIRONMENT` | warning | Metal (`metallic >= 0.5`, `material.metal`/`chrome`/`brushedMetal`) or glass (`material.glass`, `transmission > 0.2`) with no environment, sky or look to reflect. |
| `LINT_*`, `ASSET_PATH_INVENTED`, `ASSET_KEY_UNKNOWN` | per rule | The `aura3d verify` lint rules ([`verify-loop.md`](verify-loop.md)): invented model paths, unknown `assets.<key>`, shadow with no receiver, reserved uniforms, ignored options, unawaited or module-level `app.ready()`, extreme scale, camera inside an object. |

Every rule fires only on literal evidence in the source; a value it cannot see (a variable from another module, a computed distance) is not guessed at.

## `aura3d render [projectDir]`

`aura3d verify`'s browser half with colour and framing metrics added. Steps: `build` (`npm run build`; skipped by `--no-build` or `--url`), `serve` (a plain static server over `dist/`; a multi-page `dist/` without a root `index.html` is fine when `--route` names an existing page), `render` (local headless Chrome over CDP, waits for `body[data-aura3d-ready]`, two frames a second apart), `inspect`. Exit 0 when there is no error finding, 1 otherwise, 2 on a usage error.

**Text by default.** It prints a short summary; `--json` prints the same summary as JSON (schema `aura3d.render-summary/1`, about 500 bytes). Keys come in a fixed order, numbers are rounded (fill to 5%, fps to 10) and there are no timestamps, durations or served ports, so an unchanged static scene prints the same bytes on every run:

```json
{"schema":"aura3d.render-summary/1","ok":true,"target":"my-app/","subject":{"framing":"framed","fillPct":60,"inFrame":true,"centred":true,"offset":[0,-0.25],"nodes":2,"source":"engine"},"exposure":"ok","luma":{"mean":218,"p99":251},"shadow":"yes","motion":"moving","fps":60,"backend":"webgl2","drawCalls":3,"errors":[],"warnings":[],"notes":[],"done":true,"next":"Done: no errors, subject framed, exposure ok. If `aura3d validate` passes, stop and finish; do not keep polishing."}
```

- `subject`: framing measured with the engine's own maths, not pixels. Right after the first frame the CLI reads the first live app on `globalThis.__AURA3D_LIVE_APPS__` (presented camera pose, live `node.bounds()` of runtime nodes, the scene snapshot) and, with the project's installed `@aura3d/engine`, computes each node's world box with `camera.worldBounds` and the fill with `measureFrameFill` (the `camera.frame` definition: the larger of projected height and width as a share of the frame). Ground-like nodes (planes; names like ground, floor, terrain, wall) and wide flat slabs (a stage under the subject) are left out. `framing` is `framed`, `small` (fill under 20%), `cropped`, `off-centre`, `out-of-frame`, `scene-wide` (camera inside the box, or many pieces wider than the frame: a flythrough or environment) or `unknown`. `source` says how it was measured: `engine`, `viewProjection`, or `pixels` (a page with no live app falls back to the border-background estimate below).
- `exposure`: `ok`, `too-dark` (black or dim frame) or `too-bright` (washed out); `shadow`: `yes` when the renderer sampled a shadow map or ran the contact-shadow pass, `requested-not-drawn`, `no` or `unknown`; `motion`, `fps`, `backend`, `drawCalls`.
- `errors` and `warnings` (`CODE: message`), `notes` (info codes), `done` (no errors, subject framed or scene-wide, exposure ok) and `next` (the one next step).

`--screenshot` (alias `--image`) also writes the first frame to `--out` (default `.aura3d/render.png`) and adds `screenshot` to the summary. Without it no PNG is written, and a PNG left at that path by an earlier run is removed so a wrapper cannot attach a stale frame. `AURA3D_RENDER_SCREENSHOT=1` restores the old always-write behaviour. `--full` prints the full report instead (schema `aura3d.render/1`, also what `runRender()` returns, now with `framing`, `live` and `summary`):

- `screenshot`, `viewport`, `backend`, `drawCalls`;
- `frame`: mean, spread and p99 luma, distinct colours, textured-block share, and the black / flat / empty / dim verdicts (same thresholds as the release render gate);
- `color`: mean HSV saturation, saturated-pixel share, clipped-highlight share;
- `subject`: share of the frame that differs from the background, its bounding box and height fraction. The background is estimated from the frame border (up to 4 colours, e.g. backdrop and floor); when the border is a gradient or a full-bleed scene, `subject` is `null` with a `subjectNote` instead of a guess;
- `motion`, `codes` (unique finding codes, errors first), `errors` (the error messages: console errors, page exceptions, failed requests, engine diagnostics), `findings` (each with cause and fix), `steps`, `counts`.

Codes are the `aura3d verify` render and inspect codes plus:

| Code | Severity | Fires when |
| --- | --- | --- |
| `RENDER_WASHED_OUT` | warning | Drawn frame with mean saturation < 0.12, mean luma > 140 and luma spread < 40: grey, bright and low contrast. |
| `RENDER_SUBJECT_SMALL` | warning | The measured subject covers under 8% of the frame and under 25% of its height. |

The metrics are measurements of one frame, not a quality score. When `done` is true and `validate` passes, the scene is finished for an agent loop; take a `--screenshot` only to judge looks (art direction, release evidence).

## What this does not do

No batched scene edits and no scripted interaction (clicks, keys) yet; `render` captures the page as it loads. `examples` searches the shipped recipe book and templates only, not the monorepo `examples/` folder (those apps are not runnable outside the repository).
