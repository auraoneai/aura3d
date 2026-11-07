# Lane 514: physics out of the box

- `bundle-sizes.json`: what installing `@dimforge/rapier3d-compat` costs a no-physics app (chunk lists, gzip sizes, scripts fetched at
  startup), published 5.0.2 vs this branch, Rapier present and absent, plus the `aura3d-no-tla` build. Summary in
  `docs/concepts/physics.md` ("What installing Rapier costs").
- `clean-consumer-absent-report.json`, `clean-consumer-backend-missing.png`: recipe 16 in a clean consumer without Rapier, branch
  engine tarball. The message is the one pinned verbatim by `tests/unit/physics/backend-missing.test.ts`.
  `clean-consumer-backend-missing-5.0.2.png` is the same app on the published 5.0.2 engine (blank page, untyped error).
- `clean-consumer-present-report.json`, `clean-consumer-present-steps140.png`: the same app with Rapier installed, frozen at 140 steps.
- `neutrality/`: base vs branch frames of six live games with same-build noise runs (see its README).
- `dts-vs-5.0.2-*.txt`: emitted declarations vs the published 5.0.2 tarballs (engine, physics-rapier, cli). Only additions; the
  standalone-tarball diff also lists import-specifier normalisation (`@aura3d/*` vs relative paths), which is not an API change.
- `early.png`, `late.png`, `steps140.png`, `monorepo-recipe-report.json`: recipe 16 frames from the original lane commit.
- `tools/`: every script used to produce the above.
