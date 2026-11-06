# tools/remote-acr — aura3d Playwright on Azure ACR Tasks

Serverless remote execution for this repo's browser/Playwright workloads, per
the machine policy (`remote-execution.md`: ACR Tasks / Container Apps Jobs
first — **no local Docker, no GitHub Actions, no `--agent-pool`, no standing
runners, no VMs**).

## What it does

`run.sh`:

1. Verifies the `az-auraone-gurbaksh` context (tenant `8aa8a205-…`, sub
   `9b7da706-…`) — never bare `az`, never login/refresh.
2. Stages a ~100 MB build context (the repo is ~8 GB+ with node_modules,
   `tests/` 4.9 G, `public/` 1.4 G — too big to ship).
3. `az acr build` → `picassostagingacr.azurecr.io/aura3d-playwright:run-<id>`
   (existing **Basic** registry `picassostagingacr`, eastus2).
4. Creates/reuses blob container `aura3d-remote-acr` in existing storage
   account `aidprogsnap1009gch` (eastus2) and mints a **6 h `racwdl`
   container SAS** (account-key SAS — the signed-in identity holds no
   data-plane RBAC on that account, so user-delegation SAS is unavailable).
5. `az acr run -f task.playwright.yaml /dev/null` — runs the specs, streams
   logs back, uploads `tests/reports/**` + `test-results/**` to blob.
6. Downloads the artifacts to `tests/reports/remote-acr/<RUN_ID>/artifacts/`
   and writes `summary.json` + `acr-build.log` + `acr-run.log`.

## Files

| file | role |
| --- | --- |
| `run.sh` | local orchestrator (the only command you run) |
| `Dockerfile.playwright` | `mcr.microsoft.com/playwright:v1.59.1-noble` (matches pinned `playwright@1.59.1`) + `pnpm install --frozen-lockfile` |
| `task.playwright.yaml` | single-step ACR task — `img`, `cmd`, env, `--set`/`--set-secret` wiring |
| `task-run.sh` | in-image runner: `pnpm exec playwright test …` then artifact upload; exits with the Playwright code |
| `upload-artifacts.mjs` | zero-dependency Blob PUT over a container SAS (Node `fetch`) |

## 5.0 acceptance (`run-acceptance5.sh`)

The SAS steps above describe the original 4.x flow. `d0447d1cd` removed them because `az acr run --set-secret` cannot
carry a secret. For 5.0 acceptance (the registry has no identity-enabled ACR task), `sas-transport.sh` brings the
SAS path back. It mints one `rcwl` container SAS (≤ 120 min) and passes it through a `--values` file in the run
context. The account key goes to `az storage` only through `AZURE_STORAGE_KEY`. Nothing is created. `run-acceptance5.sh`
checks the code-complete gate before any Azure call. It then builds one image, runs the `acceptance5-inventory.txt`
shards (≤ 2 concurrent, `--timeout 1800`) and the deferred evidence tests (`acceptance5-evidence.sh`), and merges
`tests/reports/native-5/<run>/acceptance-report.json`. The commands are in `docs/prds/aura3d-native-acceptance.md`.

**One image for all batches (`SHARED_IMAGE=1`).** Without it every `BATCH=n` run stages and builds its own image (the
slowest and costliest step). With `SHARED_IMAGE=1` the image tag is `shared-<freeze12>-<hash of the union of every
batch's specs>`, the context is staged for that union (a per-batch scan would omit trees a later batch reads), and a
batch that finds the tag already in the registry skips staging and the build. The image is kept between batches; run the
last batch (or an abandoned run) with `RELEASE_SHARED_IMAGE=1` so the image is deleted (teardown rule). Only the parent
launches these runs.

**Report status.** `acceptance-report.json` is `passed` only when `failed` is 0, nothing is skipped, there are no
problems, and every `no-data` test (for example `WEBGPU_ACCEPTANCE_UNAVAILABLE`) is labeled EXPERIMENTAL or
GPU/device-only in its title, tags, annotations or hardware labels. The allowed and unlabeled lists are recorded under
`noDataPolicy`.

## Install & packaging decisions

- **Hermetic in-image `pnpm install --frozen-lockfile`** (same command as
  `.gitlab-ci.yml`). Local `node_modules` is **not** shipped: it is 570 MB of
  *darwin* binaries (`@esbuild/darwin-*`, sharp, etc.) which would be wrong
  inside the linux image — shipping it would produce silent breakage, not a
  faster run. The context stays small and the install is reproducible from
  `pnpm-lock.yaml`.
- `pnpm-workspace.yaml` ships verbatim → `overrides`, `patchedDependencies`
  (`patches/` is copied), `allowBuilds` (esbuild/sharp/workerd postinstall
  gates), and `minimumReleaseAgeExclude` behave identically to local.
  **Note:** `minimumReleaseAge` itself is *not enabled* anywhere in repo or
  global config as of 2026-10-21 — only the Exclude list exists. It travels
  with the workspace file, so enabling a floor later changes nothing here.
- **`packages/` ships `src` + `dist`** (minus `*/node_modules`,
  `create-aura3d/{templates,hdri}` ~102 MB of unused payloads).
  `tests/browser/example-dev-server.ts` maps `@aura3d/*` specifiers to
  `src/` entry points, but any *unmapped* subpath falls back to real
  node_modules resolution → `exports` → `dist/` — kept to stay safe.
- `tests/browser/` + `tests/support/` (custom `noSkipInCiReporter`) +
  `examples/` (the `*-lab` harnesses the specs navigate to) +
  `tools/naming-taxonomy/` (imported by the dev server) are included; the
  dev server serves `public/`/`templates/`/`marketing/` fallbacks only on
  miss paths the parity specs never hit — omitted to keep the context lean.

## Usage

```bash
# default: the three GPU/browser parity specs
tools/remote-acr/run.sh

# custom specs / richer reporters
SPECS="tests/browser/parity-animation.spec.ts" tools/remote-acr/run.sh
AURA3D_REPORTER="line,json" tools/remote-acr/run.sh   # also writes tests/reports/remote-acr-report.json in-image

# reuse the image (no rebuild)
BUILD=0 IMAGE_REPO=aura3d-playwright RUN_ID=<newid> tools/remote-acr/run.sh
```

Output: `tests/reports/remote-acr/<RUN_ID>/` (gitignored) —
`acr-build.log`, `acr-run.log` (full ACR step log incl. `--reporter` output),
`summary.json`, `artifacts/<RUN_ID>/tests/reports/…` (spec PNGs etc.).

## Capturing showcase games

- **Shared app folders.** `run.sh` always stages `apps/common` (HUD fonts) and `apps/showcase-port-shared` (quick bar),
  because every showcase app and port imports them. Add the game's own app folder with `EXTRA_DIRS=apps/showcase-<game>`.
- **Model files.** The slim profile leaves `public/aura-assets` out. Name each file the game loads in `PUBLIC_ASSETS`.
  Paths keep their folders (`PUBLIC_ASSETS="Textures/colormap.png"` lands in `public/aura-assets/Textures/`), and a
  directory name copies the whole directory. Route-local files under `apps/<app>/public/aura-assets` come with the app
  folder and are served under `/aura-assets/` by the dev server, as in the deploy.
- **Ports.** A port app mounts its example (`import "../../../examples/<dir>/main"`), and the examples load models with
  `new URL("./assets/...", import.meta.url)`. The dev server resolves `import.meta.url` per module inside the app bundle,
  so `/apps/showcase-<port>/` works; `examples/` is always staged. Capturing `/examples/<dir>/index.html` also works.
- **`SPECS` must be shell-safe.** The ACR step runs `SPECS` through `/bin/sh`, so `|`, `(`, `)`, `;`, `&`, `<`, `>`,
  backquote and `$` would be executed (one run failed in 3 s on a `|`). `run.sh` now refuses them. Select tests with a
  plain tag (`--grep=@g3`).
- **Step limit.** One ACR step stops after 3600 s. On software GL a game presents one frame every several seconds, so
  split long captures into groups selected by tag. One SwiftShader game test (load, ready, two or three steady-state
  shots) takes 15 to 30 minutes, so a shard should hold at most two game tests; the luma harness groups of nine
  (`@g1`..) finish only when the targets are light, and otherwise stop at the limit with the shots taken so far.

## WebGPU on this runner: use `@headed-xvfb`

Headless Chromium on this runner (Playwright's headless shell, and new headless / `chrome-beta`
too) destroys a WebGPU `GPUDevice` at the first frame presented to a canvas
(`lost: destroyed: Device was destroyed.`, reproduced with no Aura3D code; R-22). Headed Chromium
under Xvfb does not. Opt in by adding the sentinel `@headed-xvfb` to `SPECS`:

```bash
SPECS="tests/browser/parity-shader.spec.ts @headed-xvfb" tools/remote-acr/run.sh
```

`task-run.sh` starts `Xvfb :99`, exports `DISPLAY` and `AURA3D_HEADED_XVFB=1`, and
`playwright.config.ts` then launches headed. The sentinel rides in `SPECS_CSV`, so no task-yaml
change is involved; without it nothing changes. Compute (no canvas) works in either mode.
The full 36-cell probe matrix is `tests/browser/webgpu-presentation-probe.spec.ts`.

## Cost/ephemerality

ACR Tasks is serverless — zero standing compute. The only durable resources
are the *pre-existing* Basic registry and the blob container. `KEEP_IMAGE=0`
deletes the pushed tag after the run; `SKIP_UPLOAD=1` disables blob egress.

## Failure semantics

`az acr run` exit = the step's exit = Playwright's exit code (`task-run.sh`
always uploads first, then `exit $PW_EXIT`), so a red test run surfaces as a
failed ACR run while artifacts still land in blob storage.
