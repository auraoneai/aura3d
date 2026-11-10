// Stub-model solution (C1 dry run only): the bridged car-paint product, turntable behaviour in native Aura3D.
import { createAuraApp, environments, scene } from "@aura3d/engine";
import { productBackground, productCamera, productLights, productModel, productOutput } from "./three-bridge/product.bridge";

const app = createAuraApp("#app", {
  scene: scene({ background: productBackground ?? "#0c0d11" })
    .add(environments.neutral({ intensity: 0.6, background: false }))
    .add(productModel().runtime({ id: "product", mutable: true }))
    .addMany(productLights())
    .camera(productCamera),
  output: productOutput
});

const w = window as unknown as { __TASK_STATE__?: unknown; __EVAL_READY__?: boolean };
let angle = 0;
app.onFrame((f) => {
  angle += 20 * f.dt;
  app.nodes.get("product")?.setRotation(0, (angle * Math.PI) / 180, 0);
  w.__TASK_STATE__ = { turntableAngleDeg: angle, paintFinish: "clearcoat" };
});
void app.ready().then(() => {
  w.__EVAL_READY__ = true;
});
