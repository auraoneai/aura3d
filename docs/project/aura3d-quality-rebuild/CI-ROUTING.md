# CI routing for the Aura3D Quality Rebuild (GitHub + GitLab)

Status: authoritative for where every remote run goes. Written 2026-10-05.

Ownership (CONTRACTS.md §4):
- Lane 12 owns `.gitlab-ci.yml`, `.github/workflows/qr-gitlab-ci.yml`, `.github/workflows/quality-rebuild-capture.yml` and this file.
- Lane 15 owns `.github/QR_OWNERSHIP.json` and `.github/workflows/{qr-contracts,ci,test}.yml`.

## Why there are two CI systems

| | GitHub Actions (`auraoneai/aura3d`, public) | GitLab CI (`chahal-foundation-group/github-auraoneai/aura3d`, private mirror) |
|---|---|---|
| Minutes | Free, not metered for a public repo | 50,000 compute minutes/month (group quota, Ultimate) |
| Concurrency | Org plan **Free**: 20 jobs at once, **5 macOS jobs at once** across the whole org | Hosted runners; at least 2 parallel macOS M1 jobs observed |
| macOS | `macos-14` (Apple M1 VM, ANGLE Metal "Apple Paravirtual device") | `saas-macos-medium-m1`, cost factor **6**, same ANGLE Metal paravirtual GPU |
| Linux | `ubuntu-latest`, free | `saas-linux-small/medium-amd64`, cost factor 1 / 2 |
| PR checks | Native required checks | Visible on GitHub only through the bridge workflow |
| Source of truth | **Yes** | No: one-way mirror. Never push or open MRs there |

With 15 lanes running at once, the bottleneck is GitHub's org-wide cap of 5 macOS jobs, not minutes. GitLab adds macOS capacity. Its minutes are scarce once the ×6 macOS factor applies: 50,000 compute minutes ≈ **8,300 wall-clock macOS minutes per month**.

## How a run gets to GitLab

### 1. Sync

Every push to `qr/**` or `aura3d-quality-rebuild/**` runs `.github/workflows/qr-gitlab-ci.yml`. It pushes the current GitHub head of that branch to the GitLab mirror, along with any LFS objects GitLab does not have yet. A sync never moves the GitLab branch backwards, and it costs no GitLab minutes.

The org mirror job (`mirror-to-gitlab.yml`, which runs on push to main, on tags, and daily at 05:23 UTC) mirrors **main and tags only**. Its `--prune` deletes every other branch on GitLab, including lane branches. That is harmless, because every requested run syncs its branch first.

### 2. Run

Pipelines in `.gitlab-ci.yml` start **only** when requested. Their parameters are typed, regex-checked **pipeline inputs**. Pipeline variable overrides are disabled on the project, so a trigger cannot change runner flags, binaries, URLs or images.

**Commit tag (recommended).** The result shows as a check on that commit and on its PR. Put the tag in the **head** commit message of the push:

```
[qr-gitlab:games games=showcase-bank-shot,showcase-turbo-drift-circuit viewports=1920x1080 mobile=false]
[qr-gitlab:benchmark]
[qr-gitlab:all]
```

Tag rules:
- Keys are `games=`, `viewports=`, `local=true|false`, `mobile=true|false` and `flags=`. An unknown key fails the run, so a typo can't silently trigger a full 18-game capture.
- On `qr/**` branches, `local` defaults to **true**. The games are built from your commit. With `local=false`, 17 of the 18 games are captured from the production site, and those frames are **not evidence for your branch**.
- Only the head commit of a push is scanned, and a merge commit hides tags in the commits it merged. To re-run without a code change:
  ```
  git commit --allow-empty -m '[qr-gitlab:games games=...]' && git push
  ```
- If you push again before the sync finishes, the older sync is cancelled and its tag is dropped. Only the newest head is tested.

**Dispatch.** The run appears in Actions but does not attach to the PR:

```bash
gh workflow run qr-gitlab-ci.yml --ref <qr/... branch> -f suite=games \
  -f games=showcase-bank-shot -f local_build=auto -f mobile=false -f requester=prd02
```

**Direct.** Only on the operator Mac (Keychain `glab` auth); it does not report to GitHub. Push the branch through the bridge first, because GitLab prunes lane branches daily:

```bash
glab ci run -R chahal-foundation-group/github-auraoneai/aura3d -b <branch> \
  --input suite:games --input 'games:showcase-bank-shot' --input local_build:true --input requester:prd02
```

### 3. Results

The bridge job checks that GitLab started the pipeline on **the same SHA as this run**. If the branch moved, it fails as "superseded". It then waits for GitLab and takes GitLab's pass/fail as its own. Every GitLab job artifact is re-uploaded as the GitHub artifact `gitlab-<suite>-<pipelineId>`; download it with `gh run download <run-id>`. **Look at the PNGs** before claiming anything visual.

Suites:
- `games`: `tools/quality-rebuild-capture`.
- `benchmark`: `benchmarks/quality-rebuild`, 18 scenes, Aura vs three r185.
- `all`: both.
- `unit`: typecheck, lint and unit tests on Linux.
- `probe`: GPU launch probe.

**Feature flags are not wired yet.** `flags` / `qr_flags` must be `none` until C-33 lands in PR 0b-3 and adds `--flags` to the capture tools; any other value is refused, so flag-on and flag-off runs can't be identical without anyone noticing. PR 0b-3 removes this guard in both workflow files.

## Routing rules

| Work | Where | Why |
|---|---|---|
| PR gates: `qr-contracts.yml` (typecheck, lint, unit tests including `tests/unit/contracts`, ownership), `ci.yml`, `test.yml` | **GitHub Actions, ubuntu** | Free, high concurrency, native required checks |
| Browser conformance (`tests/browser/contracts`, WebGL2 chunk compiles) and the flag-off **sentinel identity check** (`benchmarks/quality-rebuild/sentinels.json`) | **GitHub Actions, macos-14**, only on PRs touching `packages/rendering/**` or `packages/engine/**` | Short jobs that need a real GPU; compared within the GitHub provider only |
| Lane visual evidence: lane scenes, before/after captures, targeted game captures, perf and tier measurements | **GitLab macOS via the bridge**, `local=true` | Keeps GitHub's 5 macOS slots free for PR checks |
| Weekly integration checkpoints IC-1.., G-PANEL capture sets, IC-0 | **GitLab macOS**, `local=true`; the canonical provider for judged frames | One provider for every judged image, so frames are comparable |
| Heavy Linux suites beyond PR gates | GitHub ubuntu first; GitLab `unit` if GitHub queues | Both cheap |
| Fallback when GitLab is paused, down or out of budget | GitHub `quality-rebuild-capture.yml` (macos-14), for the **whole** checkpoint or comparison | Reports record `ciProvider: "github"` |

### Never mix providers in one comparison

The two providers run different browser builds:
- **GitHub macOS** runs full Chromium (new headless).
- **GitLab macOS** must run `chromium-headless-shell`. Full Chromium segfaults on the second page there; see probe pipeline 2915365880 and `tools/quality-rebuild-capture/gpu-probe.mjs`.

Both use ANGLE Metal on an Apple paravirtual GPU, but the browser build and runner differ. Every report records `ciProvider`, `browserChannel`, `gitlabPipeline`, `githubTriggerRun` and the GitHub run id. Goldens, noise floors and before/after pairs must come from **one provider and one channel**.

- **IC-0 / GitLab noise floor (CONTRACTS.md §3.9, §7).**
  - Lane 15 creates the GitHub branch `qr/prd15-ic0-base`. It contains the `85aafcd0` engine code plus only the CI and capture-tooling commits; today that is the head of `aura3d-quality-rebuild/audit`, which changes no engine code since `85aafcd0`.
  - Run `[qr-gitlab:all]` on it twice. The two runs give the GitLab noise floor that PR 0's identity run is judged against.
  - The commit `85aafcd0` cannot be run directly: it has no `.gitlab-ci.yml` and no headless-shell support.
- **Sentinel baseline (GitHub).**
  - The baseline is the latest GitHub `macos-14` flag-off capture of the `sentinels.json` scenes on main.
  - PR 0 step 6 captures it first. PR 0 creates the `sentinels.json` stub if lane 12 has not yet.
  - Its tolerance is the GitHub noise floor from two `macos-14` runs of the same main commit, not the GitLab IC-0 floor.
- **GitHub run 37289688772** is historical audit evidence only. It is not a baseline for either provider.

## Budget: 50,000 GitLab compute minutes per month

| Allocation | Compute min / month | Roughly buys |
|---|---|---|
| Integration checkpoints and G-PANEL | 6,000 | Weekly `all` with flags `all`, `none` and each route's own ≈ 3 × 150–200 ≈ 500 each × 4–5 ≈ 2,200; one G-PANEL leave-one-out set (`all,-<lane>` × 15) ≈ 2,300; reruns ≈ 1,500 |
| 15 lanes × 2,400 | 36,000 | Per lane ≈ 400 macOS wall minutes |
| Reserve (IC-0 noise runs, re-baselines, incidents) | 8,000 | |

Measured on GitLab (2026-10-05). Job durations include about 1–1.5 minutes of install; the whole probe job took about 100 s:

| Run | Wall time | Compute min |
|---|---|---|
| Full 18-game capture from production routes (pipeline 2915390729) | 1,334 s | ≈ 133 |
| 18-scene benchmark (pipeline 2915390729) | 163 s | ≈ 16 |
| GPU probe on 2 macOS images (pipeline 2915365880) | 2 × ≈ 100 s | ≈ 20 |
| 2-game capture with `local=true`, one desktop viewport, `mobile=false` | see the next row | measured below |

Local-build runs also pull LFS (about 1.7 GB) and build the selected games, so they cost more than production-route runs. Record the measured cost of your first one in your lane's evidence.

Spending rules:
- Prefer targeted runs: `games=<only the games you touched>`, one desktop viewport (`viewports=1920x1080`), and `mobile=false` unless you are judging mobile. Or run lane scenes only.
- Run a full 18-game capture only for a checkpoint, a G-PANEL round, or a change that touches every route.
- **Usage and pausing.** Only the operator can see group usage (operator Mac, Keychain `glab`): `glab api namespaces/chahal-foundation-group | jq .ci_minutes_usage`. Remote agents cannot see it. When monthly use passes 85%, the operator sets the repo variable `QR_GITLAB_PAUSED=1` (`gh variable set QR_GITLAB_PAUSED -R auraoneai/aura3d --body 1`). Lane agents check it with `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d` before large runs. While it is `1`, they use the GitHub fallback for whole comparisons and say so in the PR.

## Open risks

- **GitLab plan.** The namespace reports `plan: ultimate` and `trial: false`, but also `trial_ends_on: 2026-10-25`. If Ultimate lapses, the macOS runners (Premium/Ultimate only) and the 50,000-minute quota go away, and every lane falls back to GitHub macos-14 at 5 concurrent jobs. Confirm the plan in GitLab billing before 2026-10-25.
- **PR visibility.** GitLab results attach to a PR only through the commit-tag path. Dispatch runs do not attach.
- **Cancellation.** Cancelling the GitHub bridge job does not cancel the GitLab pipeline, because the read-only token cannot cancel. Only the operator can cancel: `glab ci cancel pipeline <id> -R chahal-foundation-group/github-auraoneai/aura3d`. Remote agents let the pipeline finish or ask the operator.
- **Public artifacts.** Artifacts are re-uploaded to the public GitHub repo, so keep secrets and personal data out of capture output. The bridge strips user objects from the GitLab job list it uploads.

## Credentials and settings (2026-10-05)

- **`GITLAB_QR_TRIGGER_TOKEN`** (GitHub secret). A pipeline trigger on project 87152020, owned by the project-only bot `qr-gitlab-ci-trigger-owner` (Maintainer on this project only). Whoever holds it can start a pipeline on any ref of this project and choose only the typed inputs above.
  - The bot's own `api` token was never stored. It stays unrevoked only because revoking a project access token deletes its bot user, which would break the trigger. Both expire 2027-09-25.
  - The earlier Owner-owned trigger was revoked.
- **`GITLAB_QR_API_TOKEN`** (GitHub secret). The project access token `qr-gitlab-ci-read`: `read_api`, Reporter, expires 2027-09-25. It reads pipeline status and artifacts only.
- **`GITLAB_MIRROR_URL`** (existing). The mirror's project token, `read_repository` + `write_repository`.
- **GitLab project setting.** `ci_pipeline_variables_minimum_override_role` = `no_one_allowed`. It was briefly `maintainer` during setup and was restored after the switch to inputs.
- **Scope.** No GitHub credential exists in GitLab, and these tokens live only in this repo's GitHub secrets. The bridge has no `pull_request` trigger, so fork PRs never receive them. Its actions are pinned to commit SHAs, and checkout does not persist credentials.
- **Rotation.** Revoke on GitLab (Settings → Access tokens / Pipeline trigger tokens), then re-create into `gh secret set`. For the trigger, re-create it through a new bot token.
