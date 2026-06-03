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

These checks prove package health. They are not the release proof that Aura3D beats manual renderer code. Benchmark-superiority release proof is the neutral benchmark defined in `docs/project/frozen-benchmark-release-gates.md` and `benchmark/protocol.md`. Scoped SDK/product-context release evidence is tracked in `docs/project/release-tracks.md`.

Template-local gate:

```bash
npm run build
npm run test
npx @aura3d/cli@latest assets validate
npx @aura3d/cli@latest check-deploy
```

Minimal benchmark recipe gate:

```bash
npm install
npm run build
```

For benchmark agents, stop after finite install/build output and report the
runner-owned command that should launch/capture the app. Do not keep a dev
server attached, run Playwright, capture browser screenshots, or perform manual
visual verification inside the agent process.

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
