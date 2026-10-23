/** Cloud Runner — Aura3D port of the mechanics. Mounts examples/kid-goku-beyond-the-clouds-port/ without duplicating its code. */
import * as labels from "./labels";
import * as port from "../../../examples/kid-goku-beyond-the-clouds-port/main";

// The root package.json `sideEffects` allowlist marks these modules side-effect-free, so a bare `import "..."` is
// tree-shaken away and the built page ships an empty entry (no game script). Using each module namespace keeps them.
(globalThis as { __AURA_PORT_MODULES__?: unknown[] }).__AURA_PORT_MODULES__ = [labels, port];
