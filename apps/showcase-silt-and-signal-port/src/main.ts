/** Silt & Signal — Aura3D port of the mechanics. Mounts examples/silt-and-signal-port/ without duplicating its code. */
import * as port from "../../../examples/silt-and-signal-port/main";

// The root package.json `sideEffects` allowlist marks these modules side-effect-free, so a bare `import "..."` is
// tree-shaken away and the built page ships an empty entry (no game script). Using each module namespace keeps them.
(globalThis as { __AURA_PORT_MODULES__?: unknown[] }).__AURA_PORT_MODULES__ = [port];
