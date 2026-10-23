/** Splat Rush — Aura3D port of the mechanics. Mounts examples/splat-rush-port/ without duplicating its code. */
import * as port from "../../../examples/splat-rush-port/main";

// The root package.json `sideEffects` allowlist marks these modules side-effect-free, so a bare `import "..."` is
// tree-shaken away and the built page ships an empty entry (no game script). Using each module namespace keeps them.
(globalThis as { __AURA_PORT_MODULES__?: unknown[] }).__AURA_PORT_MODULES__ = [port];
