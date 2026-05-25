import { listV5PbrMaterials } from "../../packages/materials/src";
document.body.dataset.g3dExample = `three-compat-product-configurator:${listV5PbrMaterials().length}`;
