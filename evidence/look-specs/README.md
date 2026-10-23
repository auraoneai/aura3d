# Look specs, asset inventories and feature maps

Measured data for the eleven Crayon games, so ports are matched to the originals from numbers instead of eyeballing.
Everything here is names, counts, numbers, hashes and `file:line:col` locations. No third-party source text, shader
source, textures or audio are stored.

| File | Produced by | Contents |
|---|---|---|
| `<game>.json` (`a3d-look-spec/1`) | `tools/crayon-capture/look-dump.ts` | Per phase (title, early +2 s, mid +12 s, effect-heavy moment): renderer (tone mapping, exposure, colour space, shadows, pixel ratio), main camera (fov, near/far, pose), lights (type, colour, intensity, position, shadow setup), fog, background, environment, sky candidates, points / sprites / instancing summaries, canvas-texture 4x4 colour grids, composer passes and node-pipeline walk. Plus a de-duplicated **material table** (full parameter set, texture slots, users), the **camera path** over the run, the **effect sweep** and the **network asset inventory** (URL without query values, kind, bytes, sha256). |
| `<game>.features.json` (`a3d-look-features/1`) | `tools/crayon-capture/look-dump-features.ts` | Static AST map of the captured bundle: screens / states, key bindings and listeners, audio API use and oscillator types, storage and network calls, three.js classes constructed, shader uniforms and varyings, post-fx and particle vocabulary, data tables (numeric arrays, object arrays, config objects with values), asset paths, and the largest functions, each with `file:line:col`. `unported` compares it with the port's own source and its `PORTING-NOTES.md` "Not ported" bullets. |
| `SUMMARY.md` | `tools/crayon-capture/look-dump-summary.ts` | One row per game: canvas, tone mapping, shadows, camera, lights, fog, background, post chain, material count, inventory. |

Reference frames (1280x720 JPEG q92 of the originals) are written by `look-dump.ts --shots-only` to
`evidence/look-reference-frames/<game>/ref-<n>.jpg` with an `index.json` (virtual time and scene state per frame). That
folder is third-party imagery for local look reference: it is in `.gitignore` and must not be staged.

## How the dump stays comparable

- Pre-boot hooks (`tools/crayon-probe/inpage.ts` `HOOK_SOURCE` + `LOOK_HOOK_SOURCE`) are installed before any game
  script, which reaches the sandboxed `about:srcdoc` iframe. They capture the live Scene, renderers and every render call.
- After the start flow (title click, follow-up menus found by label, by text or by an `ENTER` hint) the page switches to a
  **manual virtual clock** (50 ms steps) with a **seeded `Math.random`** (seed 20261023). Phases are therefore taken at
  the same virtual time on every run. Run keys `KeyW`/`ArrowUp` are held.
- Rendering is skipped between dumps (`skipRender`) so heavy worlds stay tractable on software GL.
- `splat-rush` uses 1 s / 5 s / 4 s timing because the run ends without steering input.

## Running (remote only)

```bash
# look spec(s): <batch-name> <id[,id...]>; prints the ACR run id
tools/crayon-capture/look-dump-remote.sh b1 strange-orbit,saiyan-snake-way --wait-ms 150000
# reference frames (1280x720)
tools/crayon-capture/look-dump-remote.sh u1 strange-orbit --shots-only --wait-ms 180000
az-auraone-gurbaksh acr task logs --registry crmmeprodacr --run-id <id> > /tmp/look-run/<batch>/run.log
pnpm exec tsx tools/crayon-capture/look-dump-split.ts --log /tmp/look-run/<batch>/run.log   # [--skip-shots id,id]
pnpm exec tsx tools/crayon-capture/look-dump-features.ts      # local, static
pnpm exec tsx tools/crayon-capture/look-dump-summary.ts
```

Logs print each spec between `@@A3D_LOOK_BEGIN:<id>` / `@@A3D_LOOK_END:<id>` and frames between `@@A3D_SHOTS_BEGIN` /
`@@A3D_SHOTS_END`; the splitter validates specs and keeps the better file. `LOOK_DEBUG_START=1` adds start-flow
diagnostics to the log.

## Known limits

- Heavy worlds (`drift-and-deliver`, `roadster-hours`, `silt-and-signal`, `ninja-runner`) are dumped at 800x450 and the
  first dump of a run can time out on SwiftShader; that phase is then recorded as an error and `mid` / `effect` carry the data.
  Those specs are marked PARTIAL in the report.
- Renderer size in the spec is the size of the game frame inside the Crayon page (often 960x346), not 1280x720; the
  reference frames force the game iframe to fill the viewport.
- `heatsink` and `where-the-wind-wanders` bundles include a full three.js build, so constructed-class counts in their
  feature maps include library internals.
- Feature maps are static: dynamic strings and obfuscated names are only partly resolved. REA's
  `analyze_javascript_application` returned only a thin Electron-oriented graph on these single-bundle browser games
  (no module graph), so the TypeScript-parser scan is the source of record; use REA `inspect_web_page` /
  `analyze_web_bundle` on HTTP(S) pages and raw CDP for the `about:srcdoc` frames, as in
  `docs/workflows/crayon-game-reverse-engineering.md`.
- Raw captured bundles for five games are kept outside the repo (`/tmp/crayon-raw-bundles/`); feature maps for those
  were produced from them and cannot be regenerated from the repository alone.
