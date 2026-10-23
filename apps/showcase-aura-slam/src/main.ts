/** Aura Slam 3D, native build. Mounts examples/aura-slam/ without duplicating its code. */
import * as port from "../../../examples/aura-slam/main";

// The root package.json `sideEffects` allowlist marks the example side-effect-free, so a bare `import` is tree-shaken
// away and the built page ships an empty entry. Using the module namespace keeps it.
(globalThis as { __AURA_PORT_MODULES__?: unknown[] }).__AURA_PORT_MODULES__ = [port];
