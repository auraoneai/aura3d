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

These checks keep the package, docs, examples, templates, and deployment path launch-ready for AI-assisted browser 3D development.

Template-local gate:

```bash
npm run build
npm run test
npx @aura3d/cli@latest assets validate
npx @aura3d/cli@latest check-deploy
```

Visual review:

- Save the source prompt, selected recipe, typed asset refs, screenshot path,
  route-health report, review label, roadmap item, next action, and repair hints.
- For prompt-plan apps, inspect `compilePromptPlan(plan).report.repairHints`
  before changing any screenshot from `partial` or `technical-render-pass` to
  `product-quality-pass`.
- Keep a screenshot at `partial` if the scene still reads as one imported asset
  plus symbolic effects.
