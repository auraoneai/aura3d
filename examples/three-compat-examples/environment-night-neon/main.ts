import "@aura3d/materials";

const canvas = document.querySelector<HTMLCanvasElement>("#app");
const ctx = canvas?.getContext("2d");
if (canvas && ctx) {
  ctx.fillStyle = "#08111d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#78c8ff";
  for (let i = 0; i < 48; i++) ctx.fillRect(40 + (i % 12) * 72, 90 + Math.floor(i / 12) * 72, 42, 42);
  ctx.fillStyle = "#f1f7ff";
  ctx.font = "24px system-ui";
  ctx.fillText("Environment Night Neon", 40, 48);
}
(document.body as HTMLBodyElement).dataset.a3dExample = "environment-night-neon";
