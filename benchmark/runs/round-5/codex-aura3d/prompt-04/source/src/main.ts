import { camera, createAuraApp, effects, prefabs, scene, timeline } from "@aura3d/engine";

import "./style.css";

createAuraApp("#app", {
  scene: scene()
    .background("#020617")
    .addMany(prefabs.neonTunnel({ rings: 28 }))
    .add(effects.bloom({ intensity: 0.58 }))
    .add(effects.fog({ density: 0.12 }))
    .camera(
      camera.dolly({
        from: [0.0, 0.36, 3.0],
        to: [0.08, 0.48, -3.2],
        target: [0.0, 0.42, -2.8],
        seconds: 7
      })
    )
    .timeline(timeline.loop({ seconds: 7 }))
});
