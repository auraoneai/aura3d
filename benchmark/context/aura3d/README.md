# Aura3D Context Bundle

This is the only Aura3D-specific context bundle agents may read during the
Aura3D runs.

## Package Target

- Library under test: current Aura3D repo commit recorded in the result file.
- Runtime package name: `@aura3d/engine`.
- React adapter package: `@aura3d/react`.
- CLI package: `@aura3d/cli`.
- Scaffolder package: `create-aura3d`.

The runner installs packages from the current committed build or from published
release-candidate tarballs. The agent must not inspect `packages/*/src`.

## Files

The bundle files live under `files/`. The SHA-256 list in `manifest.sha256`
is authoritative, and `files/llms.txt` is mandatory agent-first context.
Before a round starts, run:

```sh
node benchmark/runner/verify-context-manifests.mjs
```

The verifier checks this bundle against
`benchmark/context/aura3d/manifest.sha256` and fails if `files/llms.txt` is
missing.

## Agent Restrictions

The agent may use only these files, the selected prompt file, the artifact
contract, and the provided `benchmark/assets/sneaker.glb` for prompt 10.
It may not search the repo, inspect implementation source, use prior benchmark
outputs, or fetch substitute assets.
