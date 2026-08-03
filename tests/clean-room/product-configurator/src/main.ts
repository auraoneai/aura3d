/**
 * Clean-room product configurator.
 *
 * Written against `@aura3d/engine`'s public surface only, with no reference to the
 * showcase route's source. The point is to measure what a new developer must author to
 * get a working interactive configurator: part selection with correct focus feedback,
 * material variants, camera framing and reset.
 *
 * Constraints this project is held to:
 *   - no private monorepo imports
 *   - no custom engine loop
 *   - no manual asset bounds
 *   - no hand-built selection geometry
 *   - no hand-built world-label renderer
 */
import {
  camera,
  clearFocus,
  createAuraApp,
  focusSemanticRegion,
  interactions,
  lights,
  material,
  model,
  placedBoundsFromAsset,
  primitives,
  scene,
  type FocusResult,
  type SemanticRegion
} from "@aura3d/engine";
import { assets } from "./assets";

type PartId = "earcups" | "headband" | "cushions";
type FinishId = "graphite" | "pearl" | "copper";

const PRODUCT_POSITION = [0, 0.4, 0] as const;
const PRODUCT_SIZE = 0.75;

/** Selectable parts as normalized regions of the product's own bounds. */
const PARTS: Record<PartId, SemanticRegion> = {
  earcups: { id: "earcups", label: "Earcups", u: 0.5, v: 0.5, w: 0.5, extent: [0.85, 0.5, 0.7] },
  headband: { id: "headband", label: "Headband", u: 0.5, v: 0.88, w: 0.42, extent: [0.7, 0.2, 0.3] },
  cushions: { id: "cushions", label: "Cushions", u: 0.5, v: 0.32, w: 0.52, extent: [0.7, 0.24, 0.6] }
};

const FINISHES: Record<FinishId, { readonly label: string; readonly color: string; readonly accent: string }> = {
  graphite: { label: "Graphite", color: "#252627", accent: "#cdbd99" },
  pearl: { label: "Pearl", color: "#eee8db", accent: "#2f3334" },
  copper: { label: "Copper", color: "#a85634", accent: "#f2c06d" }
};

const state = { finish: "copper" as FinishId, part: undefined as PartId | undefined };

const bounds = () => placedBoundsFromAsset(assets.showcaseHeadphones, {
  targetMaxDimension: PRODUCT_SIZE,
  position: PRODUCT_POSITION,
  floorY: PRODUCT_POSITION[1]
});

function focus(): FocusResult {
  if (!state.part) return clearFocus();
  return focusSemanticRegion(bounds(), PARTS[state.part], {
    color: FINISHES[state.finish].accent,
    indicators: ["ring", "halo"],
    callout: true,
    leaderLine: true,
    aspect: window.innerWidth / Math.max(1, window.innerHeight),
    compactViewport: window.innerWidth < 560
  });
}

function build() {
  const finish = FINISHES[state.finish];
  const selection = focus();
  return scene()
    .background("#0b0d10")
    .add(primitives.plane({ name: "studio floor", material: material.pbr({ color: "#17191d", roughness: 0.8 }) })
      .position(0, 0, 0).scale([3, 1, 3]))
    .add(model(assets.showcaseHeadphones, {
      name: "configured product",
      material: material.clearcoatPaint({ color: finish.color, roughness: 0.12, metallic: 0.05, clearcoat: 0.9 }),
      scaleMode: "fit",
      targetMaxDimension: PRODUCT_SIZE,
      castShadow: true
    }).position(...PRODUCT_POSITION))
    .addMany(selection.nodes)
    .add(lights.ambient({ intensity: 0.35, color: "#f4efe6" }))
    .add(lights.point({ position: [-1.6, 2, 1.9], intensity: 2.1, color: "#fff8ee" }))
    .add(lights.point({ position: [1.7, 1.3, 0.4], intensity: 0.8, color: "#b9e7ff" }))
    .add(interactions.orbit({ target: "configured product" }))
    .camera(selection.camera
      ? camera.perspective({ position: selection.camera.position, target: selection.camera.target, fov: selection.camera.fov })
      : camera.perspective({ position: [0.9, 1.0, 2.1], target: [0, 0.5, 0], fov: 32 }));
}

const app = createAuraApp("#stage", { diagnostics: { overlay: false }, scene: build() });

function apply(): void {
  app.setScene(build());
  const selection = focus();
  document.querySelectorAll<HTMLButtonElement>("[data-part]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.part === state.part));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-finish]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.finish === state.finish));
  });
  const readout = document.querySelector("#readout");
  if (readout) readout.textContent = selection.accessibilityLabel;
  (window as unknown as Record<string, unknown>).__CLEAN_ROOM_CONFIGURATOR__ = {
    appId: "clean-room-product-configurator",
    status: "ready",
    finish: state.finish,
    part: state.part ?? null,
    focusInvariants: selection.invariants,
    labels: app.diagnostics().labels ?? [],
    accessibilityLabel: selection.accessibilityLabel
  };
}

document.querySelectorAll<HTMLButtonElement>("[data-part]").forEach((button) => {
  button.addEventListener("click", () => {
    const part = button.dataset.part as PartId | undefined;
    state.part = state.part === part ? undefined : part;
    apply();
  });
});
document.querySelectorAll<HTMLButtonElement>("[data-finish]").forEach((button) => {
  button.addEventListener("click", () => {
    state.finish = button.dataset.finish as FinishId;
    apply();
  });
});
document.querySelector("#reset")?.addEventListener("click", () => {
  state.finish = "copper";
  state.part = undefined;
  apply();
});

apply();
