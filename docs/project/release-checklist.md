# Release Checklist

Version: 1.0.0

Use this checklist before publishing package, docs, demo, scoped product, or
benchmark-superiority claims. Public claims and release wording must stay bound
to `docs/project/claim-guidelines.md`, `docs/project/release-tracks.md`, and
`docs/project/product-studio-claim-registry.md`.

## Release Track Selection

- [ ] The intended release track is selected in `docs/project/release-tracks.md`.
- [ ] Public copy uses only the selected track's allowed claim language.
- [ ] Scoped SDK/product-context claims cite the scoped Round 50 artifact evidence.
- [ ] Benchmark-superiority claims are absent unless the frozen benchmark gates pass.

## Final Proof Gate For Benchmark-Superiority Claims

- [ ] A full benchmark round after the latest amendment has passed `docs/project/frozen-benchmark-release-gates.md`.
- [ ] `benchmark/results/round-N.md` is committed, dated, and signed by neutral prompt scorers and `gchahal1982`.
- [ ] `benchmark/results/round-N-engine.md` is committed, dated, and records a passing engine parity result.
- [ ] `benchmark/results/round-N-decision.md` is committed and contains `Decision: ship`.
- [ ] Neutral scorer outputs are committed under `benchmark/scoring/round-N-scores/`.
- [ ] The release notes cite the passing round result files by path.
- [ ] No failed, partial, scoped, or owner-bypassed round is described as benchmark-superiority evidence.

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

- [ ] No docs reference deleted milestone or planning files as current standards.
- [ ] Versioned governance docs reference `Version: 1.0.0`.
- [ ] Links in `docs/project/site-map.md` resolve.

## Go-Live Checks

- [ ] `docs/project/final-proof-release-readiness.md` has been followed for the selected track.
- [ ] `docs/project/release-artifacts.json` references the final package artifact path or URL, SHA-256, and creation time when applicable.
- [ ] Hosted demo claims are backed by the deployment checks in `docs/project/release-process.md`.
- [ ] Public copy links to the correct release evidence and does not cite internal verification as competitive proof.

## Release Boundary

Do not ship public wording that says Aura3D is proven to beat manual renderer code
unless the committed neutral benchmark round passes
`docs/project/frozen-benchmark-release-gates.md`. Internal verification
commands, local smoke screenshots, generated reports, scoped Round 50 artifacts,
and failed benchmark rounds are not benchmark-superiority proof.
