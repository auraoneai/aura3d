// Fixture for PRD-15 T1.6: `@aura3d/engine/lanes` resolves inside this repo via
// tsconfig paths, but is NOT a published export — a packed consumer must fail.
import * as lanes from "@aura3d/engine/lanes";
console.log(Object.keys(lanes).length);
