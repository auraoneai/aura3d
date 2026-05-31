# Release Checklist

Version: 1.0.0

Use this checklist before publishing package, docs, or demo claims.

## Final Proof Gate

- [ ] A full benchmark round after the latest amendment has passed the
      `FinalizedPromptPlan.md` prompt criteria.
- [ ] `benchmark/results/round-N.md` is committed, dated, and signed by the
      neutral prompt scorers and `gchahal1982`.
- [ ] `benchmark/results/round-N-engine.md` is committed, dated, and records a
      passing engine parity result.
- [ ] `benchmark/results/round-N-decision.md` is committed and says `ship`.
- [ ] Neutral scorer outputs are committed under
      `benchmark/scoring/round-N-scores/`.
- [ ] The release notes cite the passing round result files by path.
- [ ] No failed or partial round is described as shipping evidence.

## Required Checks

- [ ] `pnpm install` has been run for the current lockfile.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test:unit` passes.
- [ ] `pnpm test:integration` passes when integration behavior changed.
- [ ] `pnpm test:browser` passes when browser routes changed.
- [ ] `pnpm build` passes.
- [ ] `pnpm verify:api-docs -- --write` has been run after export changes.
- [ ] `pnpm verify:package-install-smoke:fresh` passes.
- [ ] `pnpm verify:package-provenance` passes.
- [ ] `pnpm verify:release:quick` passes before handoff.
- [ ] `pnpm verify:release` passes before publishing.
- [ ] `pnpm verify:release:repeat` passes before broad public claims.
- [ ] Public claims follow `docs/project/claim-guidelines.md`.

## Docs Checks

- [ ] No docs reference deleted milestone files.
- [ ] Report paths use `tests/reports/threejs-parity/` for current Three.js parity reports.
- [ ] Versioned governance docs reference `Version: 1.0.0`.
- [ ] Links in `docs/project/site-map.md` resolve.

## Go-Live Checks

- [ ] `docs/project/final-proof-release-readiness.md` has been followed.
- [ ] `docs/project/release-artifacts.json` references the final package
      artifact path or URL, SHA-256, and creation time.
- [ ] Hosted demo claims are backed by the deployment checks in
      `docs/project/release-process.md`.
- [ ] Public copy links to the passing benchmark result and does not cite
      internal verification as competitive proof.

## Release Boundary

Do not ship public wording that says Aura3D is proven to beat raw Three.js
unless the committed neutral benchmark round passes `FinalizedPromptPlan.md`.
Internal verification commands, local smoke screenshots, generated reports, and
failed benchmark rounds are not release proof.
