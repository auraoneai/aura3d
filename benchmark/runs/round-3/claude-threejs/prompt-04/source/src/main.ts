import { startNeonTunnel } from "./scenes/neon-tunnel";

const container = document.getElementById("app");
if (!container) {
  throw new Error("Missing #app mount element");
}

startNeonTunnel(container);
