# Frozen Context Bundles

Round 1 agents must receive only the context bundle for the library being
tested.

## Bundles

- `aura3d/` is the frozen Aura3D context bundle.

Each bundle has:

- `files/` with the files the agent may read.
- `files/llms.txt`, which the agent must read before any other context file.
- `manifest.sha256` with SHA-256 hashes for every file in `files/`.
- `README.md` with allowed package versions and restrictions.

## Rules

- Do not add, remove, or edit context bundle files during a round.
- Do not let agents browse repo source outside the selected bundle.
- Do not start agent generation unless the selected bundle has `files/llms.txt`
  and its manifest verifies.
- Do not give Aura3D files to the low-level renderer code run.
- Do not give low-level renderer code examples to the Aura3D run unless the Aura3D bundle
  already contains them.
- If a context file must change, create a `PRD-AMENDMENT:` commit and restart
  the benchmark from Phase A.

The runner may install package artifacts from the benchmarked commit, but those
package sources are not agent context.
