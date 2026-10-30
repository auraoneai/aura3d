# Verification

Version: 4.6.2

What to run before calling work done, in order of cost. Claim labels and what each claim needs are in [claims-and-boundaries.md](claims-and-boundaries.md) and [rendering-proof-required.md](rendering-proof-required.md). If a gate cannot run, label the work `blocked` or `prototype` and name the gate; never substitute a weaker check.

## 1. Finite gates (cheap, run locally)

In a generated project (every template ships these scripts):

```bash
npm run build
npx @aura3d/cli@latest assets validate
npx @aura3d/cli@latest check-deploy --dist dist
```

`check-deploy` verifies the asset side only: every hashed asset exists in `dist` or its public path, no unreferenced files sit under the asset base path (schema 1.1), derived files (mobile, collision) are present, and the asset validation passes (`--release` adds the provenance and license gates). It does not prove a frame draws. Add `--browser` to also load each route in headless Chromium (needs `playwright` in the project) and fail on HTTP errors, failed requests, uncaught errors and console errors; it still checks that the page loads clean, not what the canvas shows, so keep the screenshot gate.

In the Aura3D repository, the supporting checks are:

```bash
pnpm run check:agent-docs
pnpm run check:skills
pnpm run check:templates
pnpm run check:examples
pnpm run check:assets-cli
pnpm run check:agent-api
pnpm run check:devtools
pnpm run check:deployment
pnpm run check:docs-site
pnpm run check:docs-codeblocks
pnpm run check:bundle-size
pnpm run check:marketing-truth
```

## 2. Browser gate (remote runner only)

`npm run test` in a template runs a Playwright suite (route health, playable, screenshot). Do not run it, or any Playwright, in the agent process or on the local machine:

- **Aura3D repository and AuraOne machines:** run specs through the serverless remote runner, never local Docker, local Playwright or GitHub Actions:

  ```bash
  RUN_ID=verify-1 SPECS="tests/browser/<your-route>.spec.ts" tools/remote-acr/run.sh
  ```

  Logs and artifacts land in `tests/reports/remote-acr/<RUN_ID>/` (`summary.json`, `acr-run.log`, `artifacts/`). Read `tools/remote-acr/README.md` first.
- **Elsewhere:** any remote or CI runner you control. Do not keep a dev server attached to the agent.
- **Benchmark mode** (a prompt that only asks for install and build): run `npm install && npm run build`, then report the runner-owned capture command and stop.

Test the **production build**, not the dev server: assert a non-blank canvas, `drawCalls > 0`, zero console errors, and 200 for every asset URL. A simulation state that advances is not proof the scene draws.

## 3. Deterministic replay and QA hooks

Drive games and simulations through `installQaHooks` (`window.__AURA_<NAME>__`: `ready`, `state`, `stepFrames`, `reset`, `replay`, `frame`, `pixels`, `diagnostics`). `state()` is plain data. Use `createFixedStepLoop` with `manual: true` for captures and replays, and `createCountedRng` so a replay can assert the exact draw count (`docs/api/qa-kit.md`).

Record a scripted input run from the reference build in at least two independent sessions, derive the tolerance from their spread, and replay it as a unit test. Pure ports compare bit for bit or within 1e-6; say which.

## 4. Visual review

- Keep the source prompt, selected recipe, typed asset refs, screenshot path, route-health report, review label, next action and repair hints together.
- Open the screenshots yourself and grade each pre-registered check `pass`, `warn` or `fail`, citing a file for every verdict. The look-dev loop is in [art-direction.md](art-direction.md).
- Keep a result at `partial` if the scene reads as one imported asset plus symbolic effects.
- An in-repo scorer is not release proof; use a neutral human or an opposite-vendor model. Treat a report with missing evidence inputs as non-passing even when the generator exits 0.

## 5. Real hardware

Software GL (SwiftShader) proves correctness and draw-call counts, not real-GPU behavior or frame rate. Install the safety net (`docs/api/safety-net.md`) and ask for a real-device `?diag=1` screenshot before claiming a page works on GPUs. Label software-only runs "software GL".

## 6. Parity against an original game

Report histogram and edge metrics (luma and RGB JSD, edge-density ratio, mean luma delta) and a blind A/B judge as identification accuracy against 50% chance, with trial count and seed. A model judge is a model's opinion, not a human's, and "same game design" is a weaker claim than "indistinguishable". Command: `aura3d evidence judge` (`docs/api/cli-asset-tools.md`).
