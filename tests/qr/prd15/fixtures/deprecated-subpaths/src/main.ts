// Fixture for PRD-15 T5.6/T8.1, updated for 5.0.0. The ten legacy @aura3d/engine
// subpaths deprecated in 4.0.0 (advanced-runtime, apps, assets/browser, contracts,
// production-runtime, rendering, rendering/production-runtime, rendering/webgpu,
// workflows/production; media-node stays as the Node-only entry) were removed in
// 5.0.0 (docs/migration/4-to-5.md, B15). The fixture now imports their documented
// replacements so the packed consumer check proves every migration target resolves.
// Namespaced imports keep this honest under tsc --noEmit.

import * as s00 from "@aura3d/engine";
import * as s01 from "@aura3d/engine/renderer";
import * as s02 from "@aura3d/engine/assets";
import * as s03 from "@aura3d/engine/workflows";
import * as s04 from "@aura3d/engine/media-node";
import * as s05 from "@aura3d/engine/devtools";

const mods = [s00, s01, s02, s03, s04, s05];
console.log(mods.map((m) => Object.keys(m).length).reduce((a, b) => a + b, 0));
