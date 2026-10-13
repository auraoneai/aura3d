import { defineAuraAssets } from "@aura3d/engine";
import hdriUrl from "../assets/env/data_galaxy_deep_space_1k.hdr?url";

// App-local typed assets for the single-path Gravity Post scene: the courier
// skiff pod, dock gate and beacon station props, the five NASA-sourced planet
// GLBs corresponding to Cinder/Verdance/Aquaria/Rust/Gale in WELL_BODIES, and
// the vendored 1k deep-space HDRI floor.
export const assets = defineAuraAssets({
  gravityPostCourierSkiff: {
    type: "model",
    format: "glb",
    url: "/aura-assets/gravityPostCourierSkiff.de425661.glb",
    bounds: [2.32, 0.978, 2.375],
    hash: "sha256-de425661aec1efca380432c908e44ec01d837e5c1e12cbfb00aca2085e6a6c7e",
    metadata: { materials: [], animations: [], textures: [] }
  },
  gravityPostDockBeacon: {
    type: "model",
    format: "glb",
    url: "/aura-assets/gravityPostDockBeacon.171e21cb.glb",
    bounds: [13.084, 3.664, 8.459],
    hash: "sha256-171e21cba4f1cca3abeaaa58ec54c3e672274d719bd1e5a7318e3ef681c72a14",
    metadata: { materials: [], animations: [], textures: [] }
  },
  gravityPostDockGate: {
    type: "model",
    format: "glb",
    url: "/aura-assets/gravityPostDockGate.7b65d405.glb",
    bounds: [4.072, 9.328, 7.611],
    hash: "sha256-7b65d40553583c2fc3356e722bce837a2257cee0c16557fbb45cc07ce8f5101b",
    metadata: { materials: [], animations: [], textures: [] }
  },
  gravityPlanetMercury: {
    type: "model",
    format: "glb",
    url: "/aura-assets/gravityPlanetMercury.0222fa97.glb",
    bounds: [1000, 1000, 1000],
    hash: "sha256-0222fa976a5bb3ae3222eeddaaa7150656837a97c515f065eb855e0b1dd2ab94",
    metadata: { materials: [], animations: [], textures: [] }
  },
  gravityPlanetEarth: {
    type: "model",
    format: "glb",
    url: "/aura-assets/gravityPlanetEarth.05a5aea9.glb",
    bounds: [1000, 996.647, 1000],
    hash: "sha256-05a5aea99db8ab472487a06debc3b5d0b2cae7636a1a6b9ecfa40b7d1722ba23",
    metadata: { materials: [], animations: [], textures: [] }
  },
  gravityPlanetNeptune: {
    type: "model",
    format: "glb",
    url: "/aura-assets/gravityPlanetNeptune.2fc3af08.glb",
    bounds: [1000, 982.919, 1000],
    hash: "sha256-2fc3af08d56ed429b9cc56b95d151102aa5807ea958e7cb8806a42e12a699ba8",
    metadata: { materials: [], animations: [], textures: [] }
  },
  gravityPlanetMars: {
    type: "model",
    format: "glb",
    url: "/aura-assets/gravityPlanetMars.0d27fc65.glb",
    bounds: [1000, 994.111, 1000],
    hash: "sha256-0d27fc65fe3e6a5847cf0cd3a5c951538afdd49bd0513607d8a70e8ab1d8d7ac",
    metadata: { materials: [], animations: [], textures: [] }
  },
  gravityPlanetJupiter: {
    type: "model",
    format: "glb",
    url: "/aura-assets/gravityPlanetJupiter.8edc4e9b.glb",
    bounds: [1000, 935.126, 1000],
    hash: "sha256-8edc4e9b88b73ca1b125a258f0ecaef7fc6494a7cadda37704af459a119f4870",
    metadata: { materials: [], animations: [], textures: [] }
  },
  deepSpaceDomeHdr: {
    type: "texture",
    format: "hdr",
    url: hdriUrl,
    hash: "sha256-3fc87bc71a2f823fd81bf5fa9f12eb2a343b247b831c8321b82f9d5161f61278",
    metadata: {
      license: "polyhaven cc0",
      sourcePath: "fixtures/environment-corpus/hdri/data_galaxy_deep_space_1k.hdr"
    }
  }
} as const);
