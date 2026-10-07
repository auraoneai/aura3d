// Fixture for PRD-15 T5.6: every deprecated @aura3d/engine subpath must
// still resolve (re-export stub -> old source, console.warn once) until
// removeIn 4.0.0. Namespaced imports keep this honest under tsc --noEmit.

import * as s00 from "@aura3d/engine/advanced-runtime";
import * as s01 from "@aura3d/engine/animation/browser";
import * as s02 from "@aura3d/engine/apps";
import * as s03 from "@aura3d/engine/assets/advanced-gallery";
import * as s04 from "@aura3d/engine/assets/asset-corpus";
import * as s05 from "@aura3d/engine/assets/browser";
import * as s06 from "@aura3d/engine/assets/gltf-runtime";
import * as s07 from "@aura3d/engine/assets/production-runtime";
import * as s08 from "@aura3d/engine/contracts";
import * as s09 from "@aura3d/engine/core";
import * as s10 from "@aura3d/engine/create-aura3d";
import * as s11 from "@aura3d/engine/debug";
import * as s12 from "@aura3d/engine/editor";
import * as s13 from "@aura3d/engine/engine";
import * as s14 from "@aura3d/engine/engine-runtime";
import * as s15 from "@aura3d/engine/environments";
import * as s16 from "@aura3d/engine/lean";
import * as s17 from "@aura3d/engine/lean-game";
import * as s18 from "@aura3d/engine/lean-product";
import * as s19 from "@aura3d/engine/materials";
import * as s20 from "@aura3d/engine/media-node";
import * as s21 from "@aura3d/engine/product-studio";
import * as s22 from "@aura3d/engine/production-runtime";
import * as s23 from "@aura3d/engine/rendering";
import * as s24 from "@aura3d/engine/rendering/advanced-runtime";
import * as s25 from "@aura3d/engine/rendering/production-runtime";
import * as s26 from "@aura3d/engine/rendering/webgpu";
import * as s27 from "@aura3d/engine/scene-kits/humanoid-walk";
import * as s28 from "@aura3d/engine/scene-kits/particle-fountain";
import * as s29 from "@aura3d/engine/scene-kits/product-viewer";
import * as s30 from "@aura3d/engine/workflows/production";
import * as s31 from "@aura3d/engine/workflows/production-runtime";

const mods = [s00, s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, s12, s13, s14, s15, s16, s17, s18, s19, s20, s21, s22, s23, s24, s25, s26, s27, s28, s29, s30, s31];
console.log(mods.map((m) => Object.keys(m).length).reduce((a, b) => a + b, 0));
