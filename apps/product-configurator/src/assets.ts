import type { V6AppAsset } from "./types";

export const assets: readonly V6AppAsset[] = [
  { id: "chronograph-watch", label: "Chronograph Watch", file: "chronograph-watch.glb", url: "/fixtures/threejs-parity/assets/vehicles/chronograph-watch.glb", role: "primary" },
  { id: "car-concept", label: "Car Concept", file: "car-concept.glb", url: "/fixtures/threejs-parity/assets/vehicles/car-concept.glb", role: "secondary" },
  { id: "toy-car", label: "Toy Car", file: "toy-car.glb", url: "/fixtures/threejs-parity/assets/vehicles/toy-car.glb", role: "secondary" },
  { id: "materials-variants-shoe", label: "Materials Variants Shoe", file: "materials-variants-shoe.glb", url: "/fixtures/threejs-parity/assets/vehicles/materials-variants-shoe.glb", role: "secondary" },
  { id: "damaged-helmet", label: "Damaged Helmet", file: "damaged-helmet.glb", role: "secondary" },
  { id: "boom-box", label: "Boom Box", file: "boom-box.glb", role: "secondary" },
  { id: "antique-camera", label: "Antique Camera", file: "antique-camera.glb", role: "secondary" }
];
