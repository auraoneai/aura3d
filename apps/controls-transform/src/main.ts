import { ControlVector3, TransformControls } from "/packages/controls/src/index.ts";
import { composeMat4 } from "/packages/scene/src/index.ts";
import { Geometry, PBRMaterial, ScreenSpaceLineMaterial, createLightingDefault } from "/packages/rendering/src/index.ts";
import { simpleBounds, startSimpleGraphicsShowcase } from "/apps/wow-common/src/simple-showcase.ts";

/**
 * Interactive transform controls.
 *
 * The gizmo's own handle geometry is rendered through the public renderer, and the
 * route cycles translate/rotate/scale so all three handle sets are visible. Handles are
 * drawn with the screen-space line material so the arms keep a readable pixel width at
 * any camera distance, which is what an editor gizmo needs.
 */

const RESOLUTION: readonly [number, number] = [1280, 720];
const MODES = ["translate", "rotate", "scale"] as const;

const target = {
  position: new ControlVector3(0, 0, 0),
  rotation: new ControlVector3(0, 0, 0),
  scale: new ControlVector3(1, 1, 1)
};

// Without environment lighting the PBR target renders almost black, which reads as a
// missing object rather than as the thing the gizmo is manipulating.
const lighting = createLightingDefault("interiorGallery");

const controls = new TransformControls({ mode: "translate", size: 1.1, snap: { enabled: true, position: 0.25 } });
controls.attach(target);
controls.place([0, 0, 0]);

// litCube rather than cube: the PBR material requires normals, which the plain
// position-only cube does not provide.
const body = Geometry.litCube(0.62);
const bodyMaterial = new PBRMaterial({ name: "gizmo-target-body", baseColor: [0.42, 0.47, 0.58, 1], metallic: 0.1, roughness: 0.55 });

// One material per handle colour, reused across frames so the route does not allocate
// a new material every tick.
const handleMaterials = new Map<string, ScreenSpaceLineMaterial>();
function handleMaterial(key: string, color: readonly [number, number, number, number], width: number): ScreenSpaceLineMaterial {
  const existing = handleMaterials.get(key);
  if (existing) return existing;
  const created = new ScreenSpaceLineMaterial({ name: `gizmo-handle-${key}`, color, width, resolution: RESOLUTION });
  handleMaterials.set(key, created);
  return created;
}

void startSimpleGraphicsShowcase({
  appId: "controls-transform",
  title: "A3D Interactive Transform Controls",
  subtitle: "Rendered gizmo handles with ray picking, a pointer drag lifecycle, axis and plane constraints, snapping, and local/world spaces.",
  labels: {
    concept: "interactive transform gizmos",
    primitive: "TransformControls.handles()",
    api: "pointerDown / pointerMove / pointerUp"
  },
  createFrame: (timeSeconds) => {
    // Cycle modes so every handle set appears within a single route session.
    const mode = MODES[Math.floor(timeSeconds / 3) % MODES.length]!;
    if (controls.state().mode !== mode) controls.setMode(mode);

    const renderItems = [{
      label: "gizmo-target",
      geometry: body,
      material: bodyMaterial,
      modelMatrix: composeMat4(
        [target.position.x, target.position.y, target.position.z],
        [0, 0, 0, 1],
        [target.scale.x, target.scale.y, target.scale.z]
      )
    }];

    for (const handle of controls.handles()) {
      const width = handle.kind === "axis-arrow" ? 6 : handle.kind === "rotation-ring" ? 4 : 2;
      renderItems.push({
        label: `gizmo-handle-${handle.handle}`,
        geometry: Geometry.screenSpaceLineSegments(handle.segments.map((segment) => ({ start: segment.start, end: segment.end }))),
        material: handleMaterial(`${handle.handle}-${width}`, handle.color, width),
        modelMatrix: composeMat4([0, 0, 0], [0, 0, 0, 1], [1, 1, 1])
      });
    }

    return {
      renderItems,
      // Bounds are tightened to the gizmo's actual extent (arm length 1.1 plus a small
      // margin). A larger radius pushes the auto-frame camera back and leaves the gizmo
      // as a small object in a mostly empty frame.
      bounds: simpleBounds(1.25),
      cameraFrameOptions: { paddingRatio: 0.12, yawRadians: 0.62, pitchRadians: 0.34 },
      environmentLighting: lighting.environmentLighting,
      postprocess: false
    };
  }
});
