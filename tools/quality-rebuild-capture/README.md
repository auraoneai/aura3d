# quality-rebuild-capture

Remote visual-capture harness for the 18 Aura3D showcase games. It plays each game with real
keyboard and pointer input and saves labelled screenshots plus runtime metrics, so the games can
be judged as shipped. Debug hooks and `?capture=` review lenses are never used.

It runs in GitHub Actions on `macos-14` (Apple GPU through ANGLE Metal) via
`.github/workflows/quality-rebuild-capture.yml`. Do not run captures on a developer Mac. That
breaks the remote-execution policy, and local GPU numbers aren't comparable anyway.

## Sources

- 17 games load from production, `https://aura3d.auraone.ai/apps/<appDir>/`. Aura Clash also
  captures `/showcase/aura-clash/playable/` as an `alt1-*` run.
- Orbital Defense (`deployed: false`, production 404) is built from source and served from a
  local static server.
- `--local-build` builds and serves every selected game from source instead. The workflow input
  `local_build_all` does the same and also checks out LFS assets.

Local builds use a generated wrapper config, `.build/configs/<id>.vite.config.mjs`. It imports
the app's own `vite.config.ts` (or the root config when the app has none) and pins:

- `root`: the app directory
- `base`: `/apps/<appDir>/`
- `outDir`: `.build/site/apps/<appDir>`
- `publicDir`: `false`

Turning off `publicDir` stops Vite from copying the multi-GB shared `public/` tree into every
build. The static server serves `public/`, `apps/aura-clash-showcase/public/` and
`marketing/public/` as fallbacks instead, with and without the `/apps/<appDir>` prefix.

## Usage

```sh
node tools/quality-rebuild-capture/capture-games.mjs --validate        # schema check, no browser
node tools/quality-rebuild-capture/capture-games.mjs --build-only      # build local-source games
node tools/quality-rebuild-capture/capture-games.mjs --skip-build      # capture (reuse .build/)
node tools/quality-rebuild-capture/capture-games.mjs --games showcase-bank-shot,aura-clash-showcase
node tools/quality-rebuild-capture/capture-games.mjs --local-build     # everything from source
```

Each flag has an environment variable form for CI:

| Flag | Environment variable | Default |
|---|---|---|
| `--games` | `QRC_GAMES` | all 18 |
| `--viewports` | `QRC_VIEWPORTS` | `1920x1080,1280x720` |
| `--local-build` | `QRC_LOCAL_BUILD` | off |
| `--base-url` | `QRC_BASE_URL` | production origin |
| `--gpu-args` | `QRC_GPU_ARGS` | `--use-angle=metal --enable-gpu --ignore-gpu-blocklist` |
| `--channel` | `QRC_CHANNEL` | `chromium` (Playwright's full Chromium in new headless mode) |
| `--executable` | `QRC_EXECUTABLE` | unset |
| `--out` | `QRC_OUT` | `tools/quality-rebuild-capture/out` |

Other flags: `--no-mobile`, `--no-alt-routes`, `--strict` (non-zero exit when shots are
missing) and `--headed`.

## Runs per game

Every run uses a fresh browser context and a fresh page load.

| Run | Viewport | DPR | Timeline |
|---|---|---|---|
| `desktop-1920x1080` | 1920x1080 | 1 | full |
| `desktop-1280x720` | 1280x720 | 1 | full |
| `mobile-390x844` | 390x844, `isMobile`, `hasTouch` | 3 | stops after `03-mid` |
| `alt1-1920x1080` | 1920x1080 | 1 | full, production `altRoutes` only |

### When a page counts as ready

The harness first waits for a `<canvas>`. It then waits for one of these draw signals:

- the first WebGL draw call (an init script patches `drawArrays`/`drawElements` once and then
  restores them)
- the first WebGPU `queue.submit`
- `__AURA3D_LIVE_APPS__` `diagnostics().drawCalls > 0`

If the game sets a `readyExpr`, that expression must also be true. When a route exposes no
signal at all, the harness falls back to a fixed 6 s after the canvas appears. It then waits
`titleSettleMs` and takes the `01-title` shot.

### Shots

| Shot | Moment |
|---|---|
| `01-title` | First loaded frame |
| `02-opening` | Gameplay about 2 s after input starts |
| `03-mid` | Mid-gameplay at about 8–12 s, with inputs still held |
| `04-action` | Usually taken when an evidence counter changes (hit, kill, score, pot); otherwise a timed VFX moment |
| `05-*` | Optional extras |

## Output

- `out/<game>/<run>__<shot>.png`
- `out/<game>/contact-sheet.png` and `out/<game>/contact-sheet.html`: one row per run, with fps,
  first draw, GL renderer and error counts
- `out/index.html`
- `out/report.json`. Per run it records:
  - HTTP status
  - timing: navigation, canvas, first WebGL context, first draw call (ms from navigation start)
  - WebGL vendor and renderer, both masked and unmasked, for the app's context and a probe context
  - canvas backing and CSS size, and the DPR
  - a 5 s rAF FPS sample (fps, p50/p95/p99/max frame ms, frames over 33 ms and 50 ms), started
    with the timeline's first step
  - engine diagnostics (backend, drawCalls, asset states, warnings, errors)
  - a flat summary of any `window.__*EVIDENCE*__`, `__*PROOF*__` or `__*SHOWCASE*__` global
  - per-shot PNG stats (mean luma, standard deviation, dark fraction, distinct colours,
    `likelyBlank`)
  - console errors and warnings, page errors, failed requests (network failures and HTTP ≥ 400)
  - whether each `until` condition was hit
- A Markdown table in `$GITHUB_STEP_SUMMARY` when running in Actions.

## games.json timeline steps

Times are wall-clock. Key names are `KeyboardEvent.code` values.

| Step | Effect |
|---|---|
| `{"wait": ms}` | sleep |
| `{"press": "KeyJ"}` | keydown and keyup (30 ms) |
| `{"down": code}` / `{"up": code}` | hold or release; held keys are released at the end of the timeline |
| `{"hold": code \| [codes], "ms": n}` | hold for `n` ms |
| `{"shot": "name"}` | screenshot plus state snapshot |
| `{"fps": ms}` | start the rAF sampler without blocking |
| `{"repeat": n, "steps": [...]}` | loop (shots aren't allowed inside) |
| `{"until": expr, "capture": expr, "capture2": expr, "timeout": ms, "loop": [...]}` | evaluate `capture` once as `s` (and `capture2` as `t`), then run `loop` until `expr` (which may reference `s` and `t`) is true or the timeout passes |
| `{"drag": {"selector", "from": [fx, fy], "by": [dx, dy], "ms", "steps", "shotBeforeRelease"}}` | real mouse drag starting at a fraction of the element's box |
| `{"mouse": {...}}`, `{"click": sel}`, `{"focus": sel}`, `{"tap": sel}`, `{"releaseAll": true}` | other pointer and focus helpers |

Game-level fields: `focus: {selector, method: focus|click}` is applied after readiness.
`readyExpr`, `evidenceGlobal` and `altRoutes` are optional.

Expressions run through CDP `Runtime.evaluate` as strings, so a route's CSP can't block them.

## Benchmark job contract

The `threejs-benchmark` job installs dependencies and Playwright Chromium. If
`benchmarks/quality-rebuild/ci.sh` exists, the job runs `bash benchmarks/quality-rebuild/ci.sh`
with these environment variables:

- `QR_BENCH_OUT=benchmarks/quality-rebuild/out`
- `QR_BENCH_CHROME_ARGS="--use-angle=metal --enable-gpu --ignore-gpu-blocklist"`

It uploads `benchmarks/quality-rebuild/out/` as the `threejs-benchmark` artifact. Without the
script it writes `SKIPPED.txt` instead.
