declare global {
  interface Window {
    __A3D_EXTERNAL_PARITY_INTERACTIVE_SHOWCASE__?: unknown;
  }
}

type Variant = "catalog" | "metal" | "emissive";
const claimBoundary = "Milestone 12 interactive showcase proof only; ExternalParity release still requires production 3D interaction parity, packaged API proof, and same-scene Three.js comparison.";

export async function mountExternalInteractiveShowcase(id: string): Promise<void> {
  const root = document.getElementById("app");
  if (!root) throw new Error("Missing #app root.");
  root.innerHTML = `
    <main style="display:grid;grid-template-columns:340px 1fr;height:100vh;background:#101318;color:#f4f0e8;font-family:Inter,system-ui,sans-serif">
      <aside style="border-right:1px solid #303843;padding:22px;background:#0d1116">
        <span style="display:inline-flex;padding:5px 8px;border:1px solid #486581;border-radius:999px;color:#9bc9ee;font-size:11px;font-weight:750;letter-spacing:.06em;text-transform:uppercase">Canvas2D contract harness</span>
        <h1 style="font-size:22px;margin:14px 0 8px">Interaction State Harness</h1>
        <p style="margin:0 0 18px;color:#aeb7c2;line-height:1.45">Verifies control, selection, and variant state transitions. The blocks are abstract hit targets—not 3D products or renderer evidence.</p>
        <label>Camera orbit <input data-testid="hr4-interactive-camera" type="range" min="-60" max="60" value="0" style="width:100%"></label>
        <label style="display:block;margin-top:14px">Variant <select data-testid="hr4-interactive-variant"><option value="catalog">Catalog</option><option value="metal">Metal</option><option value="emissive">Emissive</option></select></label>
        <button data-testid="hr4-interactive-select" style="margin-top:14px;padding:8px 10px;background:#2f6f9f;color:white;border:0">Select center product</button>
        <pre data-testid="hr4-interactive-status" style="white-space:pre-wrap;background:#171d24;padding:14px;margin-top:16px;border:1px solid #303843;border-radius:8px;line-height:1.55;max-height:45vh;overflow:auto">loading</pre>
      </aside>
      <section style="display:grid;grid-template-rows:1fr 56px;min-width:0">
        <canvas data-testid="hr4-interactive-canvas" width="1280" height="820" style="width:100%;height:100%;display:block;background:#151a21"></canvas>
        <div style="border-top:1px solid #303843;padding:12px 16px;color:#b9c5d2">Scope: interaction state only · no WebGL scene · no product-rendering claim</div>
      </section>
    </main>`;
  const canvas = root.querySelector<HTMLCanvasElement>("[data-testid='hr4-interactive-canvas']")!;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Interactive Showcase requires a 2D evidence canvas.");
  const camera = root.querySelector<HTMLInputElement>("[data-testid='hr4-interactive-camera']")!;
  const variant = root.querySelector<HTMLSelectElement>("[data-testid='hr4-interactive-variant']")!;
  const select = root.querySelector<HTMLButtonElement>("[data-testid='hr4-interactive-select']")!;
  const status = root.querySelector<HTMLElement>("[data-testid='hr4-interactive-status']")!;
  let selectedObject = "left-product";
  let interactions = 0;

  function render(): void {
    drawShowcase(context, canvas, Number(camera.value), variant.value as Variant, selectedObject);
    const state = {
      id,
      status: "ready",
      productSurface: "interactive-showcase-pro",
      cameraControls: true,
      selectionInteraction: true,
      variantInteraction: true,
      selectedObject,
      cameraOrbitDegrees: Number(camera.value),
      variant: variant.value,
      interactions,
      objectCount: 5,
      featureChecklist: ["camera-controls", "selection", "material-variants", "diagnostics", "app-ui"],
      claimBoundary
    };
    window.__A3D_EXTERNAL_PARITY_INTERACTIVE_SHOWCASE__ = state;
    status.textContent = [
      `state        ${state.status}`,
      `selected     ${state.selectedObject}`,
      `orbit        ${state.cameraOrbitDegrees} degrees`,
      `variant      ${state.variant}`,
      `interactions ${state.interactions}`,
      "renderer     Canvas2D abstract targets",
      "parity       not claimed",
    ].join("\n");
  }
  camera.addEventListener("input", () => { interactions += 1; render(); });
  variant.addEventListener("change", () => { interactions += 1; render(); });
  select.addEventListener("click", () => { interactions += 1; selectedObject = selectedObject === "center-product" ? "right-product" : "center-product"; render(); });
  render();
}

function drawShowcase(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, camera: number, variant: Variant, selected: string): void {
  context.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#141922");
  gradient.addColorStop(1, variant === "emissive" ? "#24202b" : "#202a32");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const colors = variant === "metal" ? ["#b8c1c7", "#d2b66f", "#7f8f9a"] : variant === "emissive" ? ["#f06b35", "#30c2ff", "#d85cff"] : ["#2d78d4", "#d86a35", "#54a36b"];
  for (let index = 0; index < 3; index += 1) {
    const id = index === 0 ? "left-product" : index === 1 ? "center-product" : "right-product";
    const x = 355 + index * 290 + camera * (index - 1) * 1.6;
    const y = 410 + Math.abs(camera) * 0.35 * (index === 1 ? -1 : 1);
    context.fillStyle = colors[index]!;
    context.beginPath();
    context.roundRect(x - 92, y - 118, 184, 236, 24);
    context.fill();
    if (selected === id) {
      context.strokeStyle = "#ffffff";
      context.lineWidth = 8;
      context.stroke();
    }
  }
  context.fillStyle = "#f4f0e8";
  context.font = "700 16px system-ui";
  context.fillText("ABSTRACT INTERACTION TARGETS — NOT 3D PRODUCTS", 90, 48);
  context.font = "28px system-ui";
  context.fillText(`orbit ${camera} deg | ${variant} | ${selected}`, 90, 90);
}
