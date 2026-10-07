// Fixture for PRD-15 T5.6/T8.1: the deprecated @aura3d/engine subpaths that
// still have consumers in other lanes' files must keep resolving (re-export
// stub -> old source, console.warn once) until their owner migrates. The 22
// consumer-free entries were removed in 4.0.0. Namespaced imports keep this
// honest under tsc --noEmit.

import * as s00 from "@aura3d/engine/advanced-runtime";
import * as s01 from "@aura3d/engine/apps";
import * as s02 from "@aura3d/engine/assets/browser";
import * as s03 from "@aura3d/engine/contracts";
import * as s04 from "@aura3d/engine/media-node";
import * as s05 from "@aura3d/engine/production-runtime";
import * as s06 from "@aura3d/engine/rendering";
import * as s07 from "@aura3d/engine/rendering/production-runtime";
import * as s08 from "@aura3d/engine/rendering/webgpu";
import * as s09 from "@aura3d/engine/workflows/production";

const mods = [s00, s01, s02, s03, s04, s05, s06, s07, s08, s09];
console.log(mods.map((m) => Object.keys(m).length).reduce((a, b) => a + b, 0));
