---
name: aura3d-evidence-review
description: Reviews Aura3D work before it is called done, public, or shippable by collecting route-health, screenshots, visual QA, asset release checks, and `check-deploy` output, then choosing a claim label through a capped critique loop. Use when finishing a route or template, writing README or showcase claims, comparing catalog versus Meshy candidates, capturing thumbnails or posters with `assets thumbnail`, or running `assets validate --release` and `check-deploy`.
---

# Aura3D evidence review

A compiling route is not proof. This skill turns a finished change into an
evidence bundle and one claim label. Label meanings and the benchmark
exception are in [boundaries](../aura3d-core/references/boundaries.md).

## Establish the contract

1. Run `npx @aura3d/cli@latest --help` and confirm `assets validate`,
   `assets thumbnail`, and `check-deploy` are listed.
2. Read `package.json` scripts. Templates gate on `npm run build` and
   `npm run test` (route-health and screenshot specs under `tests/`).
3. Read `aura.assets.json` and `src/aura-assets.ts` so you know which typed
   assets the route claims.
4. Decide the mode. Benchmark mode: run `npm install && npm run build`, report
   the output and the runner-owned capture command, then stop. Skip every
   step below.

## Procedure

1. Pre-register the rubric before looking at output. Write 3 to 6 checks
   taken from the prompt and the claim you intend to make, for example
   "product centered and seated", "studio lighting visible", "metal and rubber
   read differently". Add the role evidence from `aura3d-assets`.
2. Run the local finite gates.

   ```bash
   npm run build
   npx @aura3d/cli@latest assets validate --source --no-placeholders --require-license
   npx @aura3d/cli@latest assets validate --release
   npx @aura3d/cli@latest check-deploy --dist dist --release
   ```

   Read `failures` in the JSON, not only the exit code. Keep the reports.
3. Run the browser gate (`npm run test`) in CI or a remote runner, not in the
   local agent process. It writes route-health output and
   `tests/reports/screenshot.png` plus pixel metrics. Capture desktop and
   mobile viewports and retain the PNGs with hashes.
4. For kit-based or prompt-plan scenes, collect structured evidence:
   `collectAuraSceneEvidence(scene)` for bodies, cameras, clips, and asset
   provenance; the matching helper such as `product.visualQA(nodes)`,
   `character.visualQA(nodes)`, `charts.visualQA(nodes)`, `city.visualQA(nodes)`,
   `solar.visualQA(nodes)`, or `material.visualQA(nodes)`; and
   `compilePromptPlan(plan).report.repairHints`.
5. Open the screenshots yourself and grade each rubric item `pass`, `warn`,
   or `fail` in one batch. Every verdict cites a file: a PNG, a report field,
   or a validation failure line.
6. Critique loop, at most 3 rounds. For each `fail`, apply the cheapest
   targeted fix (a repair hint, the matching scene kit, a better typed asset),
   rerun only the affected gates, and regrade. Do not change labels, rubric
   items, or thresholds to make a round pass.
7. Grade cinematic scenes on the ladder: L0 text only, L1 primitive sketch,
   L2 asset-backed draft, L3 realtime cinematic scene, L4 production handoff.
   Only L3 or better is public product proof.
8. Bake-offs: when comparing a catalog candidate against a Meshy candidate,
   use one brief, one rubric, one camera and lighting setup, and the same
   gates for both. Report both verdict sets and pick on evidence, not source.
9. Thumbnails and posters: run `npx @aura3d/cli@latest assets thumbnail` for
   manifest thumbnails, and use the screenshot spec output as the poster.
   Marketing previews use a static approved poster unless the live embed
   passes the same gates as the route.
10. Choose the label and write the claim at exactly that strength. Record
    the prompt, typed asset keys, screenshot paths, route-health report,
    verdicts, label, and next action.

## What does not count

- blank, cropped, tiny, or unreadable screenshots, or PNG size alone;
- renderer-internal imports offered as root API proof;
- CSS, DOM, or canvas stand-ins for particles, bloom, lighting, or labels;
- stale route-health that names assets the source no longer uses;
- an in-repo scorer as release proof (use a neutral human or opposite-vendor
  model reviewer);
- a report generated with missing evidence inputs, even when it exits 0.

## Stop and report

- A gate command is missing from the installed CLI or scripts: label the
  work `blocked`, name the missing gate, and do not substitute a weaker check.
- `assets validate --release` lists provenance failures: label `prototype`
  until durable evidence exists.
- After 3 critique rounds any rubric item still fails: stop, report the
  failing items with their evidence, and label `prototype`.
- Browser evidence could not be captured (no remote runner available): label
  the claim `prototype`, list the exact commands a runner must execute, and
  do not describe visual results you did not see.
- The claim needs WebGPU, PBR, postprocess, skinned animation, morph, or game
  runtime proof and the pixels do not show it: remove the claim.

## References

- [Boundaries](../aura3d-core/references/boundaries.md)
- [Verification](https://github.com/auraoneai/aura3d/blob/main/docs/agents/verification.md)
- [Rendering proof required](https://github.com/auraoneai/aura3d/blob/main/docs/agents/rendering-proof-required.md)
- [Cinematic scene quality](https://github.com/auraoneai/aura3d/blob/main/docs/agents/cinematic-scene-quality.md)
- [Deployment](https://aura3d.auraone.ai/docs/deployment.html)
