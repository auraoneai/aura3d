import { defineAuraAssets } from "@aura3d/engine";
import hdriUrl from "../assets/env/autumn_field_puresky_1k.hdr?url";

// App-local typed assets for the single-path Siege Golf scene. The four
// gameplay model keys are the exact union `PropVisual.typedAsset` declares in
// the salvaged structures module (ball / crate / barrel / plank), plus the
// authored course-world lane. URLs, hashes and bounds are the admitted
// catalog values (root aura.assets.json); the hashed GLBs are served from the
// shared repo public tree this app's vite config mounts.
export const assets = defineAuraAssets({
  siegeGolfBall: {
    type: "model",
    format: "glb",
    url: "/aura-assets/siegeGolfBall.a9526ad8.glb",
    bounds: [10.222, 10.242, 10.223],
    hash: "sha256-a9526ad8df797435bb854ee89e9fa1026ffca0cb0b6493124db0a48db5d84b58",
    metadata: { materials: [], animations: [], textures: [] }
  },
  siegeWoodenCrate: {
    type: "model",
    format: "glb",
    url: "/aura-assets/siegeWoodenCrate.005914e1.glb",
    bounds: [2, 2, 2],
    hash: "sha256-005914e1a839d87bd840c1ba2b9ee20c805d460abac0c7096a1d762933cf6ba0",
    metadata: { materials: [], animations: [], textures: [] }
  },
  siegeWoodenBarrel: {
    type: "model",
    format: "glb",
    url: "/aura-assets/siegeWoodenBarrel.a510ed05.glb",
    bounds: [466.396, 557.901, 466.396],
    hash: "sha256-a510ed05dfe71f886e4b113a9146904b910ed412671856b9578f886a334bff8a",
    metadata: { materials: [], animations: [], textures: [] }
  },
  siegePlankSet: {
    type: "model",
    format: "glb",
    url: "/aura-assets/siegePlankSet.a85f1213.glb",
    bounds: [1.786, 1.444, 10.374],
    hash: "sha256-a85f12130a9fa2069b5d423065bc5201d7403442e395e522b9b47b82254764ec",
    metadata: { materials: [], animations: [], textures: [] }
  },
  siegeGolfCourseWorld: {
    type: "model",
    format: "glb",
    url: "/aura-assets/siegeGolfCourseWorld.2951199f.glb",
    bounds: [10.32, 6.941, 18.004],
    hash: "sha256-2951199f39ade846dbb3417e5ae13bb7b790ecdde92d12531ed429e6337430bb",
    metadata: { materials: [], animations: [], textures: [] }
  },
  // Vendored 1k golden-field HDRI: the IBL floor under the 2900 K key.
  goldenValleyHdr: {
    type: "texture",
    format: "hdr",
    url: hdriUrl,
    hash: "sha256-e60470d3a0f219585df1d74c393b472361c5400a7ff8d071ebe6eca29b7fe2b0",
    metadata: {
      license: "polyhaven cc0",
      sourcePath: "fixtures/environment-corpus/hdri/autumn_field_puresky_1k.hdr"
    }
  }
} as const);
