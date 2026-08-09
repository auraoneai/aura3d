# Internal Runtime Systems Fixture Source

## Purpose

This source is retained only to exercise multiple Aura3D runtime systems together in browser tests. It was removed from the public examples, static exports, deployment manifests, product-demo validation, performance baselines, and visual-quality claims because the audited scene did not show a readable player or meet game-quality presentation standards.

It is not a public example, product demo, flagship game, or evidence of visual parity with Three.js.

## Run

```sh
pnpm exec playwright test tests/browser/fighting-game-runtime.spec.ts tests/browser/game-runtime-mutability.spec.ts tests/browser/game-runtime-visual.spec.ts tests/browser/runtime-character-controller.spec.ts tests/browser/runtime-systems.spec.ts tests/game-runtime/keyboard-operation-browser.spec.ts
```

The browser-only entry point is:

```text
/tests/fixtures/runtime-game-slice/index.html
```

There is deliberately no `examples/game-slice/index.html`; that prevents gallery discovery and public static export.

## Systems Used

- WebGL2 rendering runtime
- Physics and character-controller APIs
- Animation runtime
- Particles
- Input and replay systems
- Audio state
- Scripting and AI runtime systems

## Expected Output

The fixture reaches its runtime-ready state and exposes deterministic state used by the browser suites. Its pixels remain diagnostic test output and are not accepted as release-quality game presentation.

## Acceptance Target

- Browser runtime tests reach their expected state without page errors.
- Keyboard, pointer, and touch input change runtime state.
- Physics, combat, scripting, audio, particles, and controller assertions pass.
- No public demo manifest, product-demo suite, visual audit, deployment list, or readiness claim includes this fixture.

## Known Limits

- The player is not visually readable in the current renderer output.
- The environment is synthetic runtime test content, not authored game art.
- Passing behavioral tests does not reinstate this source as a public example.
- A future public game example must be built and visually audited as a new release-quality experience.
