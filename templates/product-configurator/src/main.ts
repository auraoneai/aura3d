import { createAuraApp, looks, type AuraApp } from "@aura3d/engine";
import { LOOK_ID, configuratorScene, type FinishVariant } from "./scene";

const variants: readonly (FinishVariant & { readonly name: string })[] = [
  { name: "Graphite", color: "#1f2933", metalness: 0.62, roughness: 0.3 },
  { name: "Copper", color: "#e67538", metalness: 0.75, roughness: 0.24 },
  { name: "Ceramic", color: "#d1e0eb", metalness: 0.06, roughness: 0.18 },
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
let app: AuraApp | undefined;

// createAuraApp owns the renderer and frame loop. A variant switch disposes
// and remounts once (user gesture, never per frame) with the new finish; the
// product-studio look supplies HDRI IBL, shadowed key, AO, grade and bloom.
function mount(): void {
  app?.dispose();
  app = createAuraApp(canvas, { scene: configuratorScene(variants[activeVariant]), ...looks.appOptions(LOOK_ID) });
  status.textContent = JSON.stringify(
    {
      template: "product-configurator",
      activeVariant: variants[activeVariant].name,
      interactions,
      look: LOOK_ID,
      publicRuntime: ["@aura3d/engine", "createAuraApp", "looks.preset"],
    },
    null,
    2,
  );
}

function setVariant(index: number): void {
  activeVariant = index;
  interactions += 1;
  for (const [buttonIndex, button] of buttons.entries()) {
    button.setAttribute("aria-pressed", String(buttonIndex === activeVariant));
  }
  mount();
}

for (const [index, button] of buttons.entries()) {
  button.addEventListener("click", () => setVariant(index));
}

window.addEventListener("beforeunload", () => app?.dispose());
mount();

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #11171d; color: #edf3f8; font-family: ui-sans-serif, system-ui, sans-serif; }
    .shell { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 22rem; }
    canvas { width: 100%; height: 100vh; display: block; }
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
