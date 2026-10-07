# PRD-09 Phase 0 evidence — route-composition baseline

Generated artifacts (committed under `docs/project/aura3d-quality-rebuild/migration/`):

- `baseline.json` / `baseline.md` — research-16 LOC split (evidence/presentation/gameplay/generated),
  `__X__` global names, capture-branch counts by class, cue provenance counts, `postPass` slot (null until
  the divergence job's first artifact is merged).
- `capture-parity.json` / `.md` — output of `tools/showcase-library/game-capture-parity.mjs --json`.
- `global-consumers.txt` — `rg -l "__[A-Z_]+__" tools tests` (154 files).

Classifier notes:

- `captureBranches` uses the PRD-09 identifier vocabulary
  (`visualReviewCapture|visualCaptureCamera|reviewCapture|captureMode|isCapture|CAPTURE_REVIEW`,
  `?capture=review|overview` reads) — a superset of `game-capture-parity.mjs`'s regex. On current `main`
  it counts 659 branch lines (114 ART / 69 FRAMING / 11 TRANSIENT / 465 UNKNOWN) vs the parity tool's 578
  on the narrower regex; the difference is mostly Turbo Drift's `visualCaptureCamera` (92 lines) which the
  parity regex does not match. The PRD's historical 395 count predates both tools.
- Declaration lines (any line containing `.get("capture")`) and `document.body.dataset` tagging are
  excluded from branch counts; the read values land in `captureFlag` per route.
- `postPass` is `null` in the committed baseline; `qr-prd09-routes.yml#capture_review_divergence` writes a
  merged `baseline.json` + `postpass.json` into its `prd09-capture-divergence` artifact. Those values get
  committed once the job has produced them (PRD checklist item stays unticked until then).

Unit test: `tests/unit/tools/route-composition.test.ts` (4 tests, vitest — passes locally).

NOT RUN:

- `capture_review_divergence` Playwright job — remote-only per the execution rule; first run happens on
  this PR / `workflow_dispatch` after merge. Screenshots and `postpass.json` are its evidence.
- `pnpm typecheck:raw` / full `pnpm lint` — deferred to the PR gates (`qr-contracts.yml`, `ci.yml`,
  `test.yml`) on GitHub; no route source changed in this PR.
