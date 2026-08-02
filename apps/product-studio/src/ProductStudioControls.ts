import type {
  ProductAssetId,
  ProductCameraPreset,
  ProductLightingPreset,
  ProductMaterialModeId
} from "@aura3d/product-studio";
import type { ProductStudioAppState } from "./ProductStudioState";

export interface ProductStudioControlHandlers {
  readonly onProduct: (id: ProductAssetId) => void;
  readonly onLighting: (preset: ProductLightingPreset) => void;
  readonly onCamera: (preset: ProductCameraPreset) => void;
  readonly onMaterialMode: (mode: ProductMaterialModeId) => void;
  readonly onFloor: (enabled: boolean) => void;
  readonly onExport: () => void;
}

export function renderProductStudioControls(
  parent: HTMLElement,
  state: ProductStudioAppState,
  handlers: ProductStudioControlHandlers
): void {
  parent.replaceChildren();
  parent.append(
    section("Product", segmented(state.products.map((product) => ({
      id: product.id,
      label: product.label,
      active: product.id === state.selectedProductId,
      onClick: () => handlers.onProduct(product.id)
    })))),
    section("Lighting", segmented([
      tab("catalog-softbox", "Softbox", state.lightingPreset, handlers.onLighting),
      tab("inspection-bay", "Inspect", state.lightingPreset, handlers.onLighting),
      tab("hero-contrast", "Hero", state.lightingPreset, handlers.onLighting)
    ])),
    section("Camera", segmented([
      tab("front-three-quarter", "3/4", state.cameraPreset, handlers.onCamera),
      tab("side-profile", "Side", state.cameraPreset, handlers.onCamera),
      tab("top-detail", "Top", state.cameraPreset, handlers.onCamera),
      tab("macro-detail", "Macro", state.cameraPreset, handlers.onCamera)
    ])),
    section("Material", segmented([
      tab("asset", "Asset", state.materialMode, handlers.onMaterialMode),
      tab("clay", "Clay", state.materialMode, handlers.onMaterialMode),
      tab("matte", "Matte", state.materialMode, handlers.onMaterialMode),
      tab("metal-check", "Metal", state.materialMode, handlers.onMaterialMode),
      tab("contrast", "Color", state.materialMode, handlers.onMaterialMode)
    ])),
    diagnostics(state),
    footerControls(state, handlers)
  );
}

function section(label: string, content: HTMLElement): HTMLElement {
  const element = document.createElement("section");
  element.className = "control-section";
  const title = document.createElement("h2");
  title.textContent = label;
  element.append(title, content);
  return element;
}

function segmented(items: readonly { readonly id: string; readonly label: string; readonly active: boolean; readonly onClick: () => void }[]): HTMLElement {
  const group = document.createElement("div");
  group.className = "segmented";
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = item.active ? "is-active" : "";
    button.textContent = item.label;
    button.dataset.value = item.id;
    button.addEventListener("click", item.onClick);
    group.append(button);
  }
  return group;
}

function tab<T extends string>(id: T, label: string, active: T, handler: (value: T) => void) {
  return {
    id,
    label,
    active: id === active,
    onClick: () => handler(id)
  };
}

function diagnostics(state: ProductStudioAppState): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "diagnostics";
  const title = document.createElement("h2");
  title.textContent = "Scene";
  const list = document.createElement("dl");
  const entries = [
    ["Status", state.status],
    ["Parts", String(state.diagnostics?.partCount ?? "-")],
    ["Materials", String(state.diagnostics?.materialCount ?? "-")],
    ["Textures", String(state.diagnostics?.textureCount ?? "-")],
    ["Meshes", String(state.diagnostics?.meshCount ?? "-")]
  ] as const;
  for (const [key, value] of entries) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = key;
    dd.textContent = value;
    list.append(dt, dd);
  }
  if (state.error) {
    const error = document.createElement("p");
    error.className = "error";
    error.textContent = state.error;
    panel.append(title, list, error);
  } else {
    panel.append(title, list);
  }
  return panel;
}

function footerControls(state: ProductStudioAppState, handlers: ProductStudioControlHandlers): HTMLElement {
  const footer = document.createElement("div");
  footer.className = "control-footer";
  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.floorEnabled;
  checkbox.addEventListener("change", () => handlers.onFloor(checkbox.checked));
  label.append(checkbox, " Floor");
  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.className = "primary";
  exportButton.textContent = "Export PNG";
  exportButton.addEventListener("click", handlers.onExport);
  footer.append(label, exportButton);
  return footer;
}
