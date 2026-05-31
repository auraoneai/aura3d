# Raw Three.js Context Bundle

This is the only Three.js-specific context bundle agents may read during the
raw Three.js runs.

## Package Target

- Package: `three`
- Version: `0.165.0`
- Source: local npm package snapshot from `node_modules/three`
- License: MIT, copied in `files/LICENSE`

The bundle includes the package README, package metadata, the ES module build,
and the official helper modules needed for this benchmark class of scenes:
orbit controls, GLTF loading, Draco loader, RGBE loader, CSS2D labels,
postprocessing, bloom, room environment, and reflector. It also includes a
benchmark-specific `llms.txt` process guardrail file; agents must read that
file before any Three.js source or prompt work.

## Files

The bundle files live under `files/`. The SHA-256 list in `manifest.sha256`
is authoritative, and `files/llms.txt` is mandatory agent-first context.
Before a round starts, run:

```sh
node benchmark/runner/verify-context-manifests.mjs
```

The verifier checks this bundle against
`benchmark/context/threejs/manifest.sha256` and fails if `files/llms.txt` is
missing.

## Agent Restrictions

The agent may use only these files, the selected prompt file, the artifact
contract, and the provided `benchmark/assets/sneaker.glb` for prompt 10.
It may not read Aura3D docs, Aura3D source, Aura3D examples, prior benchmark
outputs, or unofficial Three.js tutorials.

No online browsing is allowed during Round 1 unless the user signs a
`PRD-AMENDMENT:` commit that changes the context rule and restarts the round.
