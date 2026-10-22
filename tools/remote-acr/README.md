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

## Cost/ephemerality

ACR Tasks is serverless — zero standing compute. The only durable resources
are the *pre-existing* Basic registry and the blob container. `KEEP_IMAGE=0`
deletes the pushed tag after the run; `SKIP_UPLOAD=1` disables blob egress.

## Failure semantics

`az acr run` exit = the step's exit = Playwright's exit code (`task-run.sh`
always uploads first, then `exit $PW_EXIT`), so a red test run surfaces as a
failed ACR run while artifacts still land in blob storage.
