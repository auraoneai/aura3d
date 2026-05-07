import { Geometry, PBRMaterial, Renderer, UnlitMaterial, type RenderItem } from "@galileo3d/rendering";

const variants = [
  { name: "Graphite", color: [0.12, 0.16, 0.2, 1] as const, metallic: 0.62, roughness: 0.3 },
  { name: "Copper", color: [0.9, 0.46, 0.22, 1] as const, metallic: 0.75, roughness: 0.24 },
  { name: "Ceramic", color: [0.82, 0.88, 0.92, 1] as const, metallic: 0.06, roughness: 0.18 },
];

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing app root.");

root.innerHTML = `
  <main class="shell">
    <canvas width="960" height="540"></canvas>
    <aside>
      <h1>Product Configurator</h1>
      <div class="swatches">
        ${variants.map((variant, index) => `<button type="button" data-variant="${index}" aria-pressed="${index === 0}">${variant.name}</button>`).join("")}
      </div>
      <pre data-status>booting</pre>
    </aside>
  </main>
`;

installStyles();

const canvas = root.querySelector<HTMLCanvasElement>("canvas");
const status = root.querySelector<HTMLElement>("[data-status]");
const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-variant]"));
if (!canvas || !status) throw new Error("Template shell failed to initialize.");

let activeVariant = 0;
let interactions = 0;
let renderer: Renderer;

function setVariant(index: number): void {
  activeVariant = index;
  interactions += 1;
  for (const [buttonIndex, button] of buttons.entries()) {
    button.setAttribute("aria-pressed", String(buttonIndex === activeVariant));
  }
  render();
}

function render(): void {
  const variant = variants[activeVariant];
  const diagnostics = renderer.render(createRenderItems(variant));
  status.textContent = JSON.stringify(
    {
      template: "product-configurator",
      activeVariant: variant.name,
      interactions,
      drawCalls: diagnostics.drawCalls,
      publicRuntime: "@galileo3d/rendering",
    },
    null,
    2,
  );
}

for (const [index, button] of buttons.entries()) {
  button.addEventListener("click", () => setVariant(index));
}

void boot();
window.addEventListener("beforeunload", () => renderer?.dispose());

async function boot(): Promise<void> {
  renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.018, 0.022, 0.03, 1],
    preserveDrawingBuffer: true,
  });
  render();
}

function createRenderItems(variant: (typeof variants)[number]): RenderItem[] {
  return [
    {
      geometry: Geometry.uvSphere(0.64, 32, 16),
      material: new PBRMaterial({
        name: `body-${variant.name.toLowerCase()}`,
        baseColor: variant.color,
        metallic: variant.metallic,
        roughness: variant.roughness,
        emissiveColor: [variant.color[0] * 0.12, variant.color[1] * 0.12, variant.color[2] * 0.12],
        emissiveStrength: 0.7,
        renderState: { cullMode: "none" },
      }),
      label: "product-body",
    },
    {
      geometry: Geometry.litCube(0.86),
      material: new PBRMaterial({
        name: "trim",
        baseColor: [0.92, 0.88, 0.74, 1],
        metallic: 0.82,
        roughness: 0.22,
        renderState: { cullMode: "none" },
      }),
      label: "product-trim",
    },
    {
      geometry: Geometry.lineSegments([
        [-0.85, -0.76, 0],
        [0.85, -0.76, 0],
      ]),
      material: new UnlitMaterial({ name: "baseline", color: [0.55, 0.68, 0.76, 1] }),
      label: "baseline",
    },
  ];
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #11171d; color: #edf3f8; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .shell { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 22rem; }
    canvas { width: 100%; height: 100vh; display: block; background: #0f141a; }
    aside { border-left: 1px solid #28323b; background: #161d24; padding: 1.25rem; display: grid; align-content: start; gap: 1rem; }
    h1 { margin: 0; font-size: 1.3rem; }
    .swatches { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; }
    button { border: 1px solid #3c4a54; background: #202b33; color: #eef4f9; padding: 0.55rem; cursor: pointer; }
    button[aria-pressed="true"] { border-color: #74d2ff; box-shadow: inset 0 -3px 0 #74d2ff; }
    pre { margin: 0; white-space: pre-wrap; color: #b8e4b3; font-size: 0.78rem; line-height: 1.4; }
    @media (max-width: 780px) { .shell { grid-template-columns: 1fr; } canvas { height: 64vh; } aside { border-left: 0; border-top: 1px solid #28323b; } }
  `;
  document.head.append(style);
}
