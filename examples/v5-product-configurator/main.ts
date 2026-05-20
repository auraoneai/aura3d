import { listV5PbrMaterials } from "../../packages/materials/src";
document.body.dataset.g3dExample = `v5-product-configurator:${listV5PbrMaterials().length}`;
