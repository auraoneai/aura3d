# No Hackjob Rules

Use this file before fixing a broken Aura3D example. The correct response to a
bad screenshot is root-cause work, not another route-local illusion.

Read `llms.txt`, `AGENTS.md`, and `docs/agents/claims-and-boundaries.md` first.

## Forbidden Shortcuts

Do not ship or present public examples that rely on:

- `three`, `three/examples/...`, `GLTFLoader`, `OrbitControls`, or hand-wired
  renderer loops;
- `model("asset")`, raw `.glb` or `.gltf` URLs, guessed CDN links, or
  `unsafeModelUrl(...)` in release-facing code;
- CSS, DOM, or canvas stand-ins for particles, bloom, trails, labels, lighting,
  scanlines, 3D effects, or renderer output;
- primitives as the main character, vehicle, product, world, track, weapon, or
  hero object for a named real-world/game prompt;
- autoplay or deterministic proof replay as a substitute for player input;
- route-local scale, camera, or gameplay math that contradicts public API docs;
- stale route-health, README, or launch evidence that names assets or claims no
  longer used by source.

## Required Response To Bad Output

When a screenshot shows a tiny, ugly, cropped, blank, floating, primitive-heavy,
or unplayable route:

1. Classify the symptom:
   - renderer/material gap;
   - asset quality/provenance gap;
   - scale/grounding/camera gap;
   - particle/effects gap;
   - game-runtime gap;
   - docs/claim gap;
   - unknown gap.
2. Map it to exact source files and public API boundaries.
3. Add or update a task in `Fixed-Needed-PRD.md`.
4. Prove the fix in a root-only validation app or test before touching showcase
   presentation code.
5. Update docs and route evidence after the proof passes.

Do not swap GLBs or repaint primitives to make a route look different while the
root cause remains unproven.

## Public API Boundary

Examples must use public `@aura3d/engine` APIs:

```ts
import { createAuraApp, scene, model, camera, lights, material, particles, game } from "@aura3d/engine";
import { assets } from "./aura-assets";
```

If an example needs renderer internals, production runtime internals, custom
loaders, or undocumented options, the output is not public root proof. Label it
`rendering internals`, `production-runtime`, `prototype`, or `roadmap`.

## Evidence Before Claims

No claim is ready until evidence shows:

- the route imports public Aura3D APIs;
- typed assets are used for primary subjects;
- browser pixels prove the visual claim;
- screenshots are manually inspected;
- route-health matches source;
- controls actually change runtime state where interaction is claimed;
- docs, README, launch evidence, and route source agree.

A compile pass, screenshot file size, or route load is not enough.
