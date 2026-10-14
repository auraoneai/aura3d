import { defineAuraAssets } from "@aura3d/engine";

// Fresh typed asset set for the single-path Rooftop Buckets scene. Every id,
// url, hash and bounds triple is the root aura.assets.json admission for the
// same GLB (the route manifest apps/showcase-rooftop-buckets/aura.assets.json
// mirrors this subset); the shared repo public/ tree serves the hashed URLs.
export const assets = defineAuraAssets({
  rooftopCourt: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rooftopCourt.33262736.glb",
    bounds: [19.26, 8.15, 17.21],
    hash: "sha256-332627363b17a85fdb6f34aa1f397c2451cd3844f14856186873bfeff34b7bf8",
    metadata: {
      materials: [
        "rooftop court edge", "rooftop court sealed concrete", "crowd teal jacket",
        "crowd warm jacket", "bleacher painted steel", "venue rail",
        "bleacher seat violet", "venue amber practical", "venue cyan practical", "crowd skin"
      ],
      animations: [],
      textures: []
    }
  },
  rooftopBackboard: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rooftopBackboard.d2d48af6.glb",
    bounds: [1.8, 1.05, 0.05],
    hash: "sha256-d2d48af6e4ea2e6274c968a19873565f1445bceeadbb35540d29bcd4a17c529e",
    metadata: { materials: ["material-0"], animations: [], textures: [] }
  },
  rooftopRim: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rooftopRim.6ebed2bc.glb",
    bounds: [0.48, 0.029, 0.473],
    hash: "sha256-6ebed2bc98fa62f4750afd35707a7be6fbb1dac770b7c89fa7310d867c774023",
    metadata: { materials: ["material-0"], animations: [], textures: [] }
  },
  // Unit-normalized basketball; the scene scales it to a 0.24 m diameter so
  // the rendered ball matches the solver's BALL_RADIUS (0.12 m).
  rooftopBall: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rooftopBall.0254c7b9.glb",
    bounds: [1, 1, 0.985],
    hash: "sha256-0254c7b974d15d377597c7b59552eeb53bcac228e73ded83bc850a063fb07739",
    metadata: { materials: ["material-0"], animations: [], textures: [] }
  },
  rooftopLayupScorer: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rooftopLayupScorer.03a093f2.glb",
    bounds: [1.808, 1.863, 0.399],
    hash: "sha256-03a093f24ef11e534a39278710db5a56111eaf2bb093264683cd1c44a6d0ed4a",
    metadata: {
      materials: [
        "Std_Tongue", "Std_Skin_Head", "Std_Skin_Body", "Std_Skin_Arm", "Std_Skin_Leg",
        "Std_Nails", "Std_Eyelash", "Std_Eye_R", "Std_Cornea_R", "Std_Eye_L",
        "Std_Cornea_L", "Std_Upper_Teeth", "Std_Lower_Teeth", "Rooftop teal jersey",
        "Rooftop teal shorts", "Rooftop teal court shoes", "embed_hair_male"
      ],
      animations: ["Ready", "Load", "Release", "FollowThrough"]
    }
  },
  rooftopDefender: {
    type: "model",
    format: "glb",
    url: "/aura-assets/rooftopDefender.6c43f9e1.glb",
    bounds: [1.808, 1.863, 0.399],
    hash: "sha256-6c43f9e1c341b0aaa0dee159fa70cac33828aad4c9b57b9c78f9ef84bc5e0e6b",
    metadata: {
      materials: [
        "Std_Tongue", "Std_Skin_Head", "Std_Skin_Body", "Std_Skin_Arm", "Std_Skin_Leg",
        "Std_Nails", "Std_Eyelash", "Std_Eye_R", "Std_Cornea_R", "Std_Eye_L",
        "Std_Cornea_L", "Std_Upper_Teeth", "Std_Lower_Teeth", "Rooftop crimson jersey",
        "Rooftop crimson shorts", "Rooftop crimson court shoes", "embed_hair_male"
      ],
      animations: ["Plant", "Telegraph", "Jump", "Contest"]
    }
  }
} as const);
