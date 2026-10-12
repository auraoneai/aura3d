import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  carModel: {
    type: "model",
    format: "glb",
    url: "/aura-assets/showcaseCleanSportsCar.1c69283f.glb",
    bounds: [3.455, 3.428, 2.206],
    hash: "sha256-1c69283fa2b3fb96b3dc3418f2d0dede842e6984f1776a8ca00b099836fc9c14",
    metadata: {
      materials: ["Material.001", "Material.002", "Material.003", "Material.004"],
      animations: [],
      textures: [],
      license: "CC-BY-4.0",
      author: "JUFF",
      sourcePage: "https://huggingface.co/datasets/allenai/objaverse/blob/main/glbs/000-008/23dfdeb55dc24970b36065afaab7a8a5.glb",
      thumbnailUrl: "/aura-assets/showcaseCleanSportsCar.thumb.svg"
    }
  },
  trackModel: {
    type: "model",
    format: "glb",
    url: "/aura-assets/showcaseReadableKartCircuit.5cbb912e.glb",
    bounds: [24.651, 24.647, 2.073],
    hash: "sha256-5cbb912e511e5e82363c347210096d59dd3007db12c363fd0c9f07919f5ebbd0",
    metadata: {
      materials: ["LINEAS", "gris", "verde", "rojo", "azul", "amarillo"],
      animations: [],
      textures: [],
      license: "CC-BY-4.0",
      author: "Puendiz",
      sourcePage: "https://huggingface.co/datasets/allenai/objaverse/blob/main/glbs/000-034/2fc89fcd8c034bc9ba05eac24c9bf537.glb",
      thumbnailUrl: "/aura-assets/showcaseReadableKartCircuit.thumb.svg"
    }
  }
} as const);,
  "uiClickKenney": {
    "type": "audio",
    "format": "ogg",
    "url": "/aura-assets/uiClickKenney.ccfb7fa0.ogg",
    "hash": "sha256-ccfb7fa0cccdd9faec0eb16033c732b1e308d139d80f799161495d58f7adcdb9",
    "sizeBytes": 4876,
    "metadata": {
      "license": "CC0-1.0",
      "author": "Kenney",
      "sourcePage": "https://kenney.nl/assets/interface-sounds",
      "thumbnailUrl": "/aura-assets/uiClickKenney.thumb.svg"
    }
  },
  "uiConfirmKenney": {
    "type": "audio",
    "format": "ogg",
    "url": "/aura-assets/uiConfirmKenney.06356470.ogg",
    "hash": "sha256-063564703b6094d70718a3e787a55cc9141611e4ecd6b6637f8828f79b4a8c3a",
    "sizeBytes": 8968,
    "metadata": {
      "license": "CC0-1.0",
      "author": "Kenney",
      "sourcePage": "https://kenney.nl/assets/interface-sounds",
      "thumbnailUrl": "/aura-assets/uiConfirmKenney.thumb.svg"
    }
  },
  "uiErrorKenney": {
    "type": "audio",
    "format": "ogg",
    "url": "/aura-assets/uiErrorKenney.46e67425.ogg",
    "hash": "sha256-46e67425d16339772e8d328fb36a49426c9467418686e11beeb71ff84b0f6433",
    "sizeBytes": 7373,
    "metadata": {
      "license": "CC0-1.0",
      "author": "Kenney",
      "sourcePage": "https://kenney.nl/assets/interface-sounds",
      "thumbnailUrl": "/aura-assets/uiErrorKenney.thumb.svg"
    }
  },
  "uiSelectKenney": {
    "type": "audio",
    "format": "ogg",
    "url": "/aura-assets/uiSelectKenney.aec0c31e.ogg",
    "hash": "sha256-aec0c31ea934a35936ae0d2ab8fac8123c93aa5647f935853a58dbaf90278b7a",
    "sizeBytes": 5468,
    "metadata": {
      "license": "CC0-1.0",
      "author": "Kenney",
      "sourcePage": "https://kenney.nl/assets/interface-sounds",
      "thumbnailUrl": "/aura-assets/uiSelectKenney.thumb.svg"
    }
  },
  "uiSwitchKenney": {
    "type": "audio",
    "format": "ogg",
    "url": "/aura-assets/uiSwitchKenney.3b74efad.ogg",
    "hash": "sha256-3b74efad87f1e69dbd1d05c5ad952ab90859b5a3d11da6ec5bd79b4f03b42afa",
    "sizeBytes": 6753,
    "metadata": {
      "license": "CC0-1.0",
      "author": "Kenney",
      "sourcePage": "https://kenney.nl/assets/interface-sounds",
      "thumbnailUrl": "/aura-assets/uiSwitchKenney.thumb.svg"
    }
  },
  "uiToggleKenney": {
    "type": "audio",
    "format": "ogg",
    "url": "/aura-assets/uiToggleKenney.ca1d2dde.ogg",
    "hash": "sha256-ca1d2dde5f0b286abac4f070e23edab8f30927c8a533665cdf2ac6492a415e49",
    "sizeBytes": 7369,
    "metadata": {
      "license": "CC0-1.0",
      "author": "Kenney",
      "sourcePage": "https://kenney.nl/assets/interface-sounds",
      "thumbnailUrl": "/aura-assets/uiToggleKenney.thumb.svg"
    }
  }
