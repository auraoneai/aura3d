# CI routing for the Aura3D Quality Rebuild (GitHub + GitLab)

Status: authoritative for where every remote run goes. Written 2026-10-05. Owner: lane 12 (benchmark/regression), with lane 15 as custodian for `.github/` and `.gitlab-ci.yml`.

## Why there are two CI systems

| | GitHub Actions (`auraoneai/aura3d`, public) | GitLab CI (`chahal-foundation-group/github-auraoneai/aura3d`, private mirror) |
|---|---|---|
| Minutes | Free and unmetered for a public repo | 50,000 compute minutes/month (group quota, Ultimate) |
| Concurrency | Org plan **Free**: 20 jobs at once, **5 macOS jobs at once** across the whole org | Hosted runners; observed at least 2 parallel macOS M1 jobs |
| macOS | `macos-14` (Apple M1 VM, ANGLE Metal "Apple Paravirtual device") | `saas-macos-medium-m1`, cost factor **6**; same ANGLE Metal paravirtual GPU |
| Linux | `ubuntu-latest`, free | `saas-linux-small/medium-amd64`, cost factor 1 / 2 |
| PR checks | Native required checks | Visible on GitHub only through the bridge workflow |
| Source of truth | **Yes** | No. One-way mirror; never push or open MRs there |

With 15 lanes running at once, GitHub's org-wide cap of 5 macOS jobs is the bottleneck, not minutes. GitLab adds macOS capacity, but its minutes are scarce once the ×6 macOS factor applies: 50,000 compute minutes ≈ **8,300 wall-clock macOS minutes per month**.

## How a run gets to GitLab

1. **Sync.** Every push to `qr/**` or `aura3d-quality-rebuild/**` runs `.github/workflows/qr-gitlab-ci.yml`. It pushes that branch, with its LFS objects, to the GitLab mirror. This spends no GitLab minutes. The daily org mirror job (`mirror-to-gitlab.yml`) reconciles every ref.
2. **Run.** `.gitlab-ci.yml` defines pipelines that start **only** when requested: by trigger, API or web. Mirror pushes never start one. There are three ways to request a run, and each reports back to GitHub:
   - **Commit tag**. Put the tag in the head commit message of a push. The result appears as a check on that commit and its PR.
     ```
     [qr-gitlab:games games=showcase-bank-shot,showcase-turbo-drift-circuit flags=all]
     [qr-gitlab:benchmark]
     [qr-gitlab:all flags=none]
     ```
   - **Dispatch**:
     ```bash
     gh workflow run qr-gitlab-ci.yml --ref <branch> -f suite=games \
       -f games=showcase-bank-shot -f qr_flags=all -f requester=prd02
     ```
   - **Direct**, for agents on the operator Mac only, using its Keychain `glab` auth. This runs on GitLab and does **not** report a GitHub check:
     ```bash
     glab ci run -R chahal-foundation-group/github-auraoneai/aura3d -b <branch> \
       --variables "QR_SUITE:games" --variables "QRC_GAMES:showcase-bank-shot,showcase-turbo-drift-circuit" \
       --variables "QR_FLAGS:all" --variables "QR_REQUESTER:prd02"
     ```
3. **Results.** The bridge job waits for GitLab, takes GitLab's pass/fail as its own, and re-uploads every GitLab job artifact as the GitHub artifact `gitlab-<suite>-<pipelineId>`. Download it with `gh run download <run-id>`. Then **look at the PNGs** before claiming anything visual.

Suites: `games` (tools/quality-rebuild-capture), `benchmark` (benchmarks/quality-rebuild, 18 scenes, Aura vs three r185), `all` (both), `unit` (typecheck + lint + unit on Linux), `probe` (GPU launch probe).

## Routing rules

| Work | Where | Why |
|---|---|---|
| PR gates: `qr-contracts.yml` (typecheck, lint, unit, conformance, ownership), `ci.yml`, `test.yml` | **GitHub Actions, ubuntu** | Free, high concurrency, native required checks |
| PR flag-off **sentinel identity check** (6 scenes, `benchmarks/quality-rebuild/sentinels.json`) | **GitHub Actions, macos-14** | Short job; compares against the last *GitHub* main capture |
| Lane visual evidence: lane scenes, before/after captures, targeted game captures, perf/tier measurements | **GitLab macOS via the bridge** (default) | Keeps GitHub's 5 macOS slots free for PR sentinels |
| Weekly integration checkpoints IC-1.. and G-PANEL capture sets | **GitLab macOS** (canonical judged-frame provider from IC-0 on) | One provider for every judged image, so frames are comparable |
| Heavy Linux suites beyond PR gates | GitHub ubuntu first; GitLab `unit` suite if GitHub queues | Both cheap |
| Fallback when GitLab is down or its budget is under 15% | GitHub `quality-rebuild-capture.yml` (macos-14) | The report records `ciProvider: "github"` |

### Never mix providers in one comparison

GitHub macOS runs full Chromium (new headless). GitLab macOS **must** run `chromium-headless-shell`, because full Chromium segfaults on the second page there; see the GitLab probe pipeline 2915365880 (`tools/quality-rebuild-capture/gpu-probe.mjs`). Both use ANGLE Metal on an Apple paravirtual GPU, but the browser build and runner differ. Every report records `ciProvider`, `browserChannel` and the run/pipeline id. Goldens, noise floors and before/after pairs must come from the **same provider and channel**.

- **IC-0 identity run** (CONTRACTS.md §3.9, §7). Capture the IC-0 baseline twice on GitLab: two runs of `85aafcd0` give the GitLab noise floor. GitHub run 37289688772 stays as the historical audit evidence and the GitHub-side sentinel baseline.
- **Sentinel goldens** (GitHub) and **checkpoint goldens** (GitLab) are separate sets.

## Budget: 50,000 GitLab compute minutes per month

| Allocation | Compute min / month | Roughly buys |
|---|---|---|
| Integration checkpoints and G-PANEL (weekly `all` with flags `all` and `none`; reruns) | 6,000 | ~4–5 checkpoints, each ≈ 2 × 192 |
| 15 lanes × 2,400 | 36,000 | per lane ≈ 400 macOS wall minutes |
| Reserve (IC-0 noise runs, re-baselines, incidents) | 8,000 | |

Measured cost per run:

| Run | Compute min |
|---|---|
| Install overhead (node, pnpm install, Playwright) | ≈ 3–4 wall min ≈ 20 |
| Full 18-game capture (≈ 25 wall min) | ≈ 150 |
| 18-scene benchmark (≈ 7 wall min) | ≈ 42 |
| 2-game targeted capture, one viewport | ≈ 25–35 |

Rules for spending:
- Prefer targeted runs: `games=<the games you touched>`, one viewport (`viewports=1920x1080`), or lane scenes only.
- Run a full 18-game capture only for a checkpoint, a G-PANEL round, or a change that touches every route.
- Check usage before large runs: `glab api namespaces/chahal-foundation-group | jq .ci_minutes_usage`. If monthly use is above 85%, switch lane runs to the GitHub fallback and say so in the PR.

## Open risks

- **GitLab plan.** The namespace reports `plan: ultimate` and `trial: false`, but also `trial_ends_on: 2026-10-25`. If Ultimate lapses, the macOS runners (Premium/Ultimate only) and the 50,000-minute quota go away, and every lane falls back to GitHub macos-14 at 5 concurrent jobs. Confirm the plan in GitLab billing before 2026-10-25.
- **Required checks.** GitLab pipelines are visible on a PR only when the bridge runs them: a commit tag, or a dispatch on the PR branch. Dispatch runs do not attach to PRs, so use the commit tag for anything a reviewer must see.
- **Cancellation.** Cancelling the GitHub bridge job does not cancel the GitLab pipeline; the read-only token cannot cancel. Cancel on GitLab with `glab ci cancel pipeline <id> -R chahal-foundation-group/github-auraoneai/aura3d`, or let the pipeline finish.

## Credentials and settings (created 2026-10-05)

- `GITLAB_QR_TRIGGER_TOKEN` (GitHub secret): a pipeline trigger token on project 87152020, which can only start pipelines.
- `GITLAB_QR_API_TOKEN` (GitHub secret): the project access token `qr-gitlab-ci-read`. Scope `read_api`, Reporter, expires 2027-09-25. It reads pipeline status and artifacts only.
- GitLab project setting `ci_pipeline_variables_minimum_override_role`: changed from `no_one_allowed` to `maintainer`, so that triggered pipelines can carry `QR_*` variables.
- No GitHub credential exists in GitLab. Both tokens are scoped to this one project and live only in this repo's GitHub secrets. The workflow has no `pull_request` trigger, so fork PRs never receive them. Rotation: revoke on GitLab (Settings → Access tokens / Pipeline trigger tokens), then re-create into `gh secret set`.
