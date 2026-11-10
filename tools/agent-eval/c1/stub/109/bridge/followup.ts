// Stub-model follow-up (C1 dry run only): paint buttons swap the bridged "paint" material slot natively.
import { createAuraApp, environments, scene } from "@aura3d/engine";
import { productBackground, productCamera, productLights, productModel, productOutput } from "./three-bridge/product.bridge";

const COLORS = { red: "#b0121b", blue: "#123c9c", black: "#0b0b0d" } as const;
type Paint = keyof typeof COLORS;
const build = (paint: Paint) =>
  scene({ background: productBackground ?? "#0c0d11" })
    .add(environments.neutral({ intensity: 0.6, background: false }))
    .add(productModel({ materialOverrides: [{ target: "paint", color: COLORS[paint], colorMode: "replace" }] }).runtime({ id: "product", mutable: true }))
    .addMany(productLights())
    .camera(productCamera);

const app = createAuraApp("#app", { scene: build("red"), output: productOutput });
let paintColor: Paint = "red";
const bar = document.createElement("div");
for (const key of Object.keys(COLORS) as Paint[]) {
  const b = document.createElement("button");
  b.textContent = key[0]!.toUpperCase() + key.slice(1);
  b.onclick = () => {
    paintColor = key;
    app.setScene(build(key));
  };
  bar.append(b);
}
document.body.append(bar);

const w = window as unknown as { __TASK_STATE__?: unknown; __EVAL_READY__?: boolean };
let angle = 0;
app.onFrame((f) => {
  angle += 20 * f.dt;
  app.nodes.get("product")?.setRotation(0, (angle * Math.PI) / 180, 0);
  w.__TASK_STATE__ = { turntableAngleDeg: angle, paintFinish: "clearcoat", paintColor };
});
void app.ready().then(() => {
  w.__EVAL_READY__ = true;
});
