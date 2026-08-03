/**
 * Clean-room digital-twin scene.
 *
 * Public surface only. Measures what a developer must author for equipment selection,
 * asset-relative status markers, alarm state and camera focus.
 */
import {
  camera,
  checkSpatialInvariants,
  createAuraApp,
  distributeInRegion,
  focusCameraIntent,
  focusSemanticRegion,
  interactions,
  lights,
  material,
  model,
  placedBoundsFromAsset,
  primitives,
  resolveBoundsAnchor,
  resolveSemanticRegion,
  scene,
  type HelperPlacementClaim,
  type SemanticRegion
} from "@aura3d/engine";
import { assets } from "./assets";

type ZoneId = "assembly" | "packaging" | "energy";

const WORKCELL_POSITION = [0, 0, 0] as const;
const WORKCELL_SIZE = 1.3;

const ZONES: Record<ZoneId, SemanticRegion> = {
  assembly: { id: "assembly", label: "Assembly", u: 0.3, v: 0.2, w: 0.45, extent: [0.26, 0.12, 0.3] },
  packaging: { id: "packaging", label: "Packaging", u: 0.68, v: 0.2, w: 0.7, extent: [0.24, 0.12, 0.26] },
  energy: { id: "energy", label: "Energy", u: 0.14, v: 0.2, w: 0.72, extent: [0.2, 0.12, 0.24] }
};

const state = { zone: "assembly" as ZoneId, alarm: false, focused: false };

const bounds = () => placedBoundsFromAsset(assets.showcaseRoboticWeldingWorkcell, {
  targetMaxDimension: WORKCELL_SIZE,
  position: WORKCELL_POSITION,
  floorY: 0
});

/** Status markers distributed along the workcell's own conveyor region. */
function markers() {
  const cell = bounds();
  const belt = resolveSemanticRegion(cell, { id: "belt", u: 0.45, v: 0.16, w: 0.85, extent: [0.6, 0.05, 0.06] });
  return distributeInRegion(
    { min: [belt.min[0], belt.center[1], belt.center[2]], max: [belt.max[0], belt.center[1], belt.center[2]] },
    { count: 4, seed: 17 }
  ).map((placement, index) => primitives.box({
    name: `status marker ${index + 1}`,
    material: material.emissive({ color: state.alarm ? "#f2715c" : "#7ee8c4", emissive: state.alarm ? "#f2715c" : "#7ee8c4", emissiveIntensity: 0.7 })
  }).position(...placement.position).scale([cell.size[0] * 0.05, cell.size[1] * 0.01, cell.size[2] * 0.03]));
}

function build() {
  const cell = bounds();
  const selection = focusSemanticRegion(cell, ZONES[state.zone], {
    color: state.alarm ? "#f2715c" : "#7ee8c4",
    indicators: ["ring"],
    callout: true,
    cameraFocus: false
  });
  const alarmAnchor = resolveBoundsAnchor(cell, "top-left", { offset: Math.max(...cell.size) * 0.12 });
  const zoneRegion = resolveSemanticRegion(cell, ZONES[state.zone]);
  const framing = state.focused
    ? focusCameraIntent(zoneRegion.center, [
        zoneRegion.size[0] || cell.size[0] * 0.3,
        zoneRegion.size[1] || cell.size[1] * 0.3,
        zoneRegion.size[2] || cell.size[2] * 0.3
      ], { aspect: window.innerWidth / Math.max(1, window.innerHeight) })
    : undefined;
  return scene()
    .background("#051011")
    .add(primitives.plane({ name: "ops floor", material: material.pbr({ color: "#071013", roughness: 0.86 }) })
      .position(cell.center[0], -0.02, cell.center[2]).scale([cell.size[0] * 1.4, 1, cell.size[2] * 1.4]))
    .add(model(assets.showcaseRoboticWeldingWorkcell, {
      name: "workcell", scaleMode: "fit", targetMaxDimension: WORKCELL_SIZE, castShadow: true
    }).position(...WORKCELL_POSITION))
    .addMany(selection.nodes)
    .addMany(markers())
    .add(primitives.sphere({ name: "alarm beacon", material: material.emissive({ color: "#f2715c", emissive: "#f2715c", emissiveIntensity: state.alarm ? 1.4 : 0.1 }) })
      .position(...alarmAnchor.position).scale(Math.max(...cell.size) * 0.04))
    .add(lights.ambient({ intensity: 0.5, color: "#dff6f0" }))
    .add(lights.directional({ position: [2, 3.2, 2.4], intensity: 1.3, color: "#fff4df" }))
    .add(interactions.orbit())
    .camera(framing
      ? camera.perspective({ position: framing.position, target: framing.target, fov: framing.fov })
      : camera.perspective({ position: [1.7, 1.1, 2.6], target: [0, 0.3, 0], fov: 38 }));
}

const app = createAuraApp("#stage", { diagnostics: { overlay: false }, scene: build() });

function apply(): void {
  app.setScene(build());
  const cell = bounds();
  const claims: HelperPlacementClaim[] = [
    ...Object.keys(ZONES).map((zone) => ({
      id: `${zone} zone`,
      position: resolveSemanticRegion(cell, ZONES[zone as ZoneId]).center,
      relation: "inside" as const
    })),
    {
      id: "alarm beacon",
      position: resolveBoundsAnchor(cell, "top-left", { offset: Math.max(...cell.size) * 0.12 }).position,
      relation: "outside" as const,
      maxDistance: Math.max(...cell.size) * 0.6
    }
  ];
  document.querySelectorAll<HTMLButtonElement>("[data-zone]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.zone === state.zone));
  });
  (window as unknown as Record<string, unknown>).__CLEAN_ROOM_DIGITAL_TWIN__ = {
    appId: "clean-room-digital-twin",
    status: "ready",
    zone: state.zone,
    alarm: state.alarm,
    focused: state.focused,
    spatialInvariants: checkSpatialInvariants(cell, claims),
    labels: app.diagnostics().labels ?? []
  };
}

document.querySelectorAll<HTMLButtonElement>("[data-zone]").forEach((button) => {
  button.addEventListener("click", () => {
    state.zone = button.dataset.zone as ZoneId;
    apply();
  });
});
document.querySelector("#alarm")?.addEventListener("click", () => { state.alarm = !state.alarm; apply(); });
document.querySelector("#focus")?.addEventListener("click", () => { state.focused = !state.focused; apply(); });

apply();
