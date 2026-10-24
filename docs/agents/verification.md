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
pnpm run check:docs-codeblocks
pnpm run verify:claims
```

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
  route-health report, review label, roadmap item, next action, and repair hints.
- For prompt-plan apps, inspect `compilePromptPlan(plan).report.repairHints`
  before changing any screenshot from `partial` or `technical-render-pass` to
  `product-quality-pass`.
- Keep a screenshot at `partial` if the scene still reads as one imported asset
  plus symbolic effects.
- Do not use an in-repo scorer as release proof. Benchmark scoring must be done
  by a neutral human reviewer or opposite-vendor model.
- Treat a report with missing evidence inputs as non-passing even if the report
  generator command exits successfully.

Deterministic replay and QA hooks (4.1):

- Drive games and simulations through `installQaHooks` (`window.__AURA_<NAME>__`:
  `ready`, `state`, `stepFrames`, `reset`, `replay`, `frame`, `pixels`,
  `diagnostics`). `state()` is plain data. Use `createFixedStepLoop` with
  `manual: true` for captures and replays, and `createCountedRng` so a replay can
  assert the exact draw count (`docs/api/qa-kit.md`).
- Record a scripted input run from the reference build in at least two independent
  sessions, derive the tolerance from their spread, and replay it as a unit test.
  Pure ports compare bit for bit or within 1e-6; say which.

Production build and real hardware:

- Test the production build, not the dev server: assert a non-blank canvas,
  `drawCalls > 0`, zero console errors, and 200 for every asset URL. A simulation
  state that advances is not proof the scene draws.
- Software GL (SwiftShader) proves correctness and draw-call counts, not real-GPU
  behaviour or frame rate. Install the safety net (`docs/api/safety-net.md`) and ask
  for a `?diag=1` screenshot from a real device before claiming a page works on GPUs.

Parity against an original game:

- Report histogram and edge metrics (luma and RGB JSD, edge-density ratio, mean luma
  delta) and a blind A/B judge as identification accuracy against 50% chance, with
  trial count and seed. A model judge is a model's opinion, not a human's, and
  "same game design" is a weaker claim than "indistinguishable".
