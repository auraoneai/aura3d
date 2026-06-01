import {
  camera,
  createAuraApp,
  interactions,
  lights,
  prefabs,
  scene,
  timeline
} from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene()
    .background("#0b1020")
    .addMany(prefabs.productViewer(assets.sneaker))
    .add(lights.studio({ intensity: 1.35 }))
    .add(interactions.orbit())
    .camera(camera.product())
    .timeline(timeline.loop({ seconds: 8 }))
});
