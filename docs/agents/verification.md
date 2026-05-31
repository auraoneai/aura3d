# Verification

Supporting health checks:

```bash
pnpm run check:agent-api
pnpm run check:assets-cli
pnpm run check:agent-docs
pnpm run check:templates
pnpm run check:examples
pnpm run check:devtools
pnpm run check:deployment
pnpm run check:docs-site
pnpm run check:bundle-size
pnpm run check:marketing-truth
```

These checks prove package health. They are not the release proof that Aura3D
beats raw Three.js. The release proof is the neutral benchmark defined in
`FinalizedPromptPlan.md` and `benchmark/protocol.md`.

Current release-proof state after Round 9:

- `benchmark/results/round-9.md`, `benchmark/results/round-9-engine.md`, and
  `benchmark/results/round-9-decision.md` record a failed proof round.
- Round 9 may be cited as failed historical evidence only. Do not cite it as
  release evidence or as proof that Aura3D beats raw Three.js.
- Do not rerun the same standard unchanged. The next proof round requires a
  committed `PRD-AMENDMENT:` targeted repair standard, regenerated context
  manifests if context files change, and a new Phase A sign-off before the full
  matrix starts.
- `benchmark/results/amendment-round-10-targeted-repair-standard.md` identifies
  the required Round 10 amendment content; it is not a benchmark pass.

Template-local gate:

```bash
npm run build
npm run test
npx @aura3d/cli@latest assets validate
npx @aura3d/cli@latest check-deploy
```

Visual review:

- Save the source prompt, selected recipe, typed asset refs, screenshot path,
  route-health report, review label, limitation, next action, and repair hints.
- For prompt-plan apps, inspect `compilePromptPlan(plan).report.repairHints`
  before changing any screenshot from `partial` or `technical-render-pass` to
  `product-quality-pass`.
- Keep a screenshot at `partial` if the scene still reads as one imported asset
  plus symbolic effects.
- Do not use an in-repo scorer as release proof. Benchmark scoring must be done
  by a neutral human reviewer or opposite-vendor model.
