# Fresh Codex Agent Context Results

Generated: 2026-05-28T15:02:00Z

## Scope

This was a fresh Codex agent-context evaluation. The agent was instructed to
work only inside `/tmp/aura3d-fresh-codex-eval`, using only:

- context files copied under `/tmp/aura3d-fresh-codex-eval/context`
- local package tarballs under `/tmp/aura3d-fresh-codex-eval/tarballs`
- GLB assets under `/tmp/aura3d-fresh-codex-eval/assets`

The agent was explicitly told not to read the active repo source at
`/Users/gurbakshchahal/aura3d`.

## Prompt

Build a cinematic product viewer for `assets/product.glb`: show the product as
the hero object on a studio plinth with studio lighting, a wet/reflective floor,
rain, a slow camera dolly, diagnostics overlay, and a click handler path that
swaps/uses `assets/hero.glb` as an alternate model. The output should compile,
run, render visually in WebGL2, and include Playwright route-health and
screenshot tests that prove the canvas is nonblank and visually prompt-aligned.

## Output

- App directory: `/tmp/aura3d-fresh-codex-eval/codex-output`
- Result file: `/tmp/aura3d-fresh-codex-eval/codex-output/RESULT.md`
- Screenshot: `/tmp/aura3d-fresh-codex-eval/codex-output/tests/reports/screenshot.png`
- Route report: `/tmp/aura3d-fresh-codex-eval/codex-output/tests/reports/route-health.json`
- Screenshot report: `/tmp/aura3d-fresh-codex-eval/codex-output/tests/reports/screenshot.json`

## Commands Reported By The Agent

- `npm exec --yes --package ./tarballs/create-aura3d-1.0.0.tgz -- create-aura3d codex-output --template cinematic-scene`
- `npm exec --yes --package ../tarballs/aura3d-cli-1.0.0.tgz -- aura3d assets add ./assets/product.glb --name product`
- `npm exec --yes --package ../tarballs/aura3d-cli-1.0.0.tgz -- aura3d assets add ./assets/hero.glb --name hero`
- `npm install`
- `npm run build`
- `npm run assets:validate`
- `npm run check:deploy`
- `npm test`
- final rerun: `npm run build && npm run assets:validate && npm run check:deploy && npm test`

## Results

| Check | Result |
|---|---:|
| TypeScript/Vite build | pass |
| Playwright route health | pass |
| Playwright screenshot profile | pass |
| Asset validation | pass |
| Deploy check | pass |
| API hallucination count | 0 |
| Asset path error count | 0 |
| Initial model | `product` |
| Click-swapped model | `hero` |
| Browser backend | `webgl2` |
| Draw calls | 10 |

## Visual Evidence

The screenshot is not only nonblank. The generated test measured the rendered
canvas for prompt-aligned visual elements:

| Visual Signal | Count |
|---|---:|
| Center model pixels | 10573 |
| Cyan lighting pixels | 32474 |
| Amber practical pixels | 55 |
| Rain pixels | 1541 |
| Reflection pixels | 19217 |
| Plinth pixels | 628 |
| Unique color buckets | 50 |

Manual visual inspection confirmed that the screenshot shows a product GLB on a
plinth with rain, a blue studio wall, cyan strip light/reflection, amber
practical/reflection, diagnostics overlay, and WebGL2 output. This is materially
different from the earlier placeholder/grid screenshots.

## Boundaries

- This proves one fresh Codex context-only run, not Claude Code, Cursor,
  Copilot, or outside-user dogfood.
- This proves local tarball usage and local Playwright rendering, not a real
  Vercel, Cloudflare Pages, or Netlify deployment.
- This proves prompt-aligned composition for the provided GLBs, not broad GLB
  material/texture fidelity across arbitrary third-party assets.
